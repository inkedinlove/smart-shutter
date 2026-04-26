import "server-only";

import { Prisma } from "@prisma/client";

import { getDb, isDatabaseConfigured } from "@/lib/db";
import { hashPassword } from "@/lib/passwords";
import type { UserProfileRecord } from "@/lib/profiles";

export type UserRole = "customer" | "admin";

export class UserAccountError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "UserAccountError";
    this.statusCode = statusCode;
  }
}

type DatabaseUserProfile = {
  id: string;
  displayName: string;
  email: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type RegisteredUserAccount = {
  userId: string;
  profileId: string;
  displayName: string;
  email: string;
  role: UserRole;
};

function getAccountsDb() {
  const db = getDb();

  if (!isDatabaseConfigured() || !db) {
    throw new UserAccountError(
      "Customer accounts require the database-backed platform mode.",
      503,
    );
  }

  return db;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getAdminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((value) => normalizeEmail(value))
      .filter((value) => value.length > 0),
  );
}

export function resolveRoleForEmail(email: string): UserRole {
  return getAdminEmails().has(normalizeEmail(email)) ? "admin" : "customer";
}

function mapProfile(profile: DatabaseUserProfile): UserProfileRecord {
  return {
    profileId: profile.id,
    displayName: profile.displayName,
    email: profile.email,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

export async function getUserProfileByUserId(
  userId: string,
): Promise<UserProfileRecord | null> {
  const normalizedUserId = userId.trim();

  if (!normalizedUserId) {
    return null;
  }

  const db = getAccountsDb();
  const profile = await db.userProfile.findUnique({
    where: {
      userId: normalizedUserId,
    },
  });

  return profile ? mapProfile(profile) : null;
}

export async function createUserAccount(input: {
  displayName: string;
  email: string;
  password: string;
}): Promise<RegisteredUserAccount> {
  const db = getAccountsDb();
  const displayName = input.displayName.trim();
  const email = normalizeEmail(input.email);

  if (!displayName) {
    throw new UserAccountError("Display name is required.", 400);
  }

  if (!email || !email.includes("@")) {
    throw new UserAccountError("Enter a valid email address.", 400);
  }

  const passwordHash = await hashPassword(input.password);
  const role = resolveRoleForEmail(email);
  const conflictMessage =
    "We couldn't create the account. Try signing in if you've used this email before.";

  const existingUser = await db.user.findUnique({
    where: {
      email,
    },
    include: {
      profile: true,
    },
  });

  if (existingUser) {
    throw new UserAccountError(conflictMessage, 409);
  }

  const existingProfile = await db.userProfile.findUnique({
    where: {
      email,
    },
  });

  if (existingProfile?.userId) {
    throw new UserAccountError(conflictMessage, 409);
  }

  try {
    if (existingProfile) {
      const account = await db.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name: displayName,
            email,
            passwordHash,
            role,
          },
        });

        const profile = await tx.userProfile.update({
          where: {
            id: existingProfile.id,
          },
          data: {
            displayName,
            userId: user.id,
          },
        });

        return {
          user,
          profile,
        };
      });

      return {
        userId: account.user.id,
        profileId: account.profile.id,
        displayName: account.profile.displayName,
        email,
        role,
      };
    }

    const user = await db.user.create({
      data: {
        name: displayName,
        email,
        passwordHash,
        role,
        profile: {
          create: {
            displayName,
            email,
          },
        },
      },
      include: {
        profile: true,
      },
    });

    if (!user.profile) {
      throw new UserAccountError("Unable to create a customer profile.", 500);
    }

    return {
      userId: user.id,
      profileId: user.profile.id,
      displayName: user.profile.displayName,
      email,
      role,
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new UserAccountError(conflictMessage, 409);
    }

    throw error;
  }
}
