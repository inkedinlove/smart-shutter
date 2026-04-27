import "server-only";

import { getDb, isDatabaseConfigured } from "@/lib/db";

export type AuthMethodRecord = {
  provider: string;
  linkedAt: string | null;
  updatedAt: string | null;
};

export type AuthActivitySummary = {
  activeSessionCount: number;
  lastSessionSeenAt: string | null;
  authMethods: AuthMethodRecord[];
};

function emptySummary(): AuthActivitySummary {
  return {
    activeSessionCount: 0,
    lastSessionSeenAt: null,
    authMethods: [],
  };
}

export async function getAuthActivitySummaryForUser(
  userId: string,
): Promise<AuthActivitySummary> {
  const normalizedUserId = userId.trim();
  const db = getDb();

  if (!normalizedUserId || !isDatabaseConfigured() || !db) {
    return emptySummary();
  }

  try {
    const now = new Date();
    const user = await db.user.findUnique({
      where: {
        id: normalizedUserId,
      },
      select: {
        createdAt: true,
        passwordHash: true,
        accounts: {
          select: {
            provider: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        },
        sessions: {
          where: {
            expires: {
              gt: now,
            },
          },
          select: {
            updatedAt: true,
          },
          orderBy: {
            updatedAt: "desc",
          },
        },
      },
    });

    if (!user) {
      return emptySummary();
    }

    const authMethods = new Map<string, AuthMethodRecord>();

    if (user.passwordHash) {
      authMethods.set("credentials", {
        provider: "credentials",
        linkedAt: user.createdAt.toISOString(),
        updatedAt: null,
      });
    }

    for (const account of user.accounts) {
      const existing = authMethods.get(account.provider);

      if (!existing) {
        authMethods.set(account.provider, {
          provider: account.provider,
          linkedAt: account.createdAt.toISOString(),
          updatedAt: account.updatedAt.toISOString(),
        });
        continue;
      }

      if (!existing.linkedAt || existing.linkedAt > account.createdAt.toISOString()) {
        existing.linkedAt = account.createdAt.toISOString();
      }

      if (!existing.updatedAt || existing.updatedAt < account.updatedAt.toISOString()) {
        existing.updatedAt = account.updatedAt.toISOString();
      }
    }

    return {
      activeSessionCount: user.sessions.length,
      lastSessionSeenAt: user.sessions[0]?.updatedAt.toISOString() ?? null,
      authMethods: Array.from(authMethods.values()),
    };
  } catch (error) {
    console.error("Unable to load auth activity summary:", error);
    return emptySummary();
  }
}
