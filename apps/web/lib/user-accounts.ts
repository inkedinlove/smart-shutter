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
  emailVerificationRequired: boolean;
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

function resolveAccountDisplayName(input: {
  displayName?: string | null;
  email?: string | null;
}): string {
  const displayName =
    typeof input.displayName === "string" ? input.displayName.trim() : "";

  if (displayName) {
    return displayName;
  }

  const email =
    typeof input.email === "string" ? normalizeEmail(input.email) : "";

  if (email) {
    return email.split("@")[0] || "Smart Shutter User";
  }

  return "Smart Shutter User";
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
            emailVerificationRequired: true,
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
        emailVerificationRequired: true,
      };
    }

    const user = await db.user.create({
      data: {
        name: displayName,
        email,
        emailVerificationRequired: true,
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
      emailVerificationRequired: true,
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

export async function syncOAuthUserAccount(input: {
  userId: string;
  email?: string | null;
  displayName?: string | null;
}): Promise<RegisteredUserAccount> {
  const db = getAccountsDb();
  const userId = input.userId.trim();

  if (!userId) {
    throw new UserAccountError("User ID is required.", 400);
  }

  const normalizedEmail = input.email ? normalizeEmail(input.email) : "";
  const email = normalizedEmail || null;

  try {
    return await db.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({
        where: {
          id: userId,
        },
        include: {
          profile: true,
        },
      });

      if (!existingUser) {
        throw new UserAccountError("Unable to find the signed-in user.", 404);
      }

      const role = email
        ? resolveRoleForEmail(email)
        : existingUser.role === "admin"
          ? "admin"
          : "customer";
      const displayName = resolveAccountDisplayName({
        displayName: input.displayName ?? existingUser.name,
        email: email ?? existingUser.email,
      });
      const userUpdateData: Prisma.UserUpdateInput = {};

      if ((!existingUser.name || !existingUser.name.trim()) && displayName) {
        userUpdateData.name = displayName;
      }

      if (email && !existingUser.email) {
        userUpdateData.email = email;
      }

      if (!existingUser.emailVerified && email) {
        userUpdateData.emailVerified = new Date();
      }

      if (existingUser.emailVerificationRequired) {
        userUpdateData.emailVerificationRequired = false;
      }

      if (existingUser.role !== role) {
        userUpdateData.role = role;
      }

      const user =
        Object.keys(userUpdateData).length > 0
          ? await tx.user.update({
              where: {
                id: userId,
              },
              data: userUpdateData,
              include: {
                profile: true,
              },
            })
          : existingUser;

      let profile = user.profile;

      if (profile) {
        const profileUpdateData: Prisma.UserProfileUpdateInput = {};

        if ((!profile.displayName || !profile.displayName.trim()) && displayName) {
          profileUpdateData.displayName = displayName;
        }

        if (email && !profile.email) {
          profileUpdateData.email = email;
        }

        if (Object.keys(profileUpdateData).length > 0) {
          profile = await tx.userProfile.update({
            where: {
              id: profile.id,
            },
            data: profileUpdateData,
          });
        }
      } else {
        const existingProfile = email
          ? await tx.userProfile.findUnique({
              where: {
                email,
              },
            })
          : null;

        if (existingProfile?.userId && existingProfile.userId !== user.id) {
          throw new UserAccountError(
            "Another customer profile already uses this email address.",
            409,
          );
        }

        if (existingProfile) {
          const profileUpdateData: Prisma.UserProfileUpdateInput = {
            user: {
              connect: {
                id: user.id,
              },
            },
          };

          if (
            (!existingProfile.displayName ||
              !existingProfile.displayName.trim()) &&
            displayName
          ) {
            profileUpdateData.displayName = displayName;
          }

          if (email && !existingProfile.email) {
            profileUpdateData.email = email;
          }

          profile = await tx.userProfile.update({
            where: {
              id: existingProfile.id,
            },
            data: profileUpdateData,
          });
        } else {
          profile = await tx.userProfile.create({
            data: {
              displayName,
              email,
              user: {
                connect: {
                  id: user.id,
                },
              },
            },
          });
        }
      }

      return {
        userId: user.id,
        profileId: profile.id,
        displayName: profile.displayName,
        email: email ?? user.email ?? profile.email ?? "",
        role,
        emailVerificationRequired: false,
      };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new UserAccountError(
        "We couldn't link that sign-in to a customer profile.",
        409,
      );
    }

    throw error;
  }
}
