import "server-only";

import { randomUUID } from "node:crypto";

import type { JWT } from "next-auth/jwt";

import { getDb, isDatabaseConfigured } from "@/lib/db";

export const AUTH_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;
export const AUTH_SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 8;

const SESSION_RECORD_SYNC_INTERVAL_MS = 15 * 60 * 1000;
const MAX_TRACKED_SESSIONS_PER_USER = 12;

function getTrackedSessionToken(token: JWT | null | undefined): string {
  if (typeof token?.trackedSessionId === "string" && token.trackedSessionId.trim()) {
    return token.trackedSessionId.trim();
  }

  return typeof token?.sessionToken === "string" ? token.sessionToken.trim() : "";
}

function getStableJwtSessionSeed(token: JWT): string {
  return typeof token.jti === "string" ? token.jti.trim() : "";
}

function shouldSyncSessionRecord(input: {
  token: JWT;
  trigger?: "signIn" | "signUp" | "update";
}): boolean {
  if (input.trigger === "signIn" || input.trigger === "signUp") {
    return true;
  }

  if (!getTrackedSessionToken(input.token)) {
    return true;
  }

  const lastSyncedAt =
    typeof input.token.sessionRecordSyncedAt === "number"
      ? input.token.sessionRecordSyncedAt
      : 0;

  return Date.now() - lastSyncedAt >= SESSION_RECORD_SYNC_INTERVAL_MS;
}

export async function syncTrackedJwtSessionRecord(input: {
  token: JWT;
  userId: string;
  trigger?: "signIn" | "signUp" | "update";
}): Promise<void> {
  const db = getDb();
  const normalizedUserId = input.userId.trim();

  if (!isDatabaseConfigured() || !db || !normalizedUserId) {
    return;
  }

  if (!shouldSyncSessionRecord(input)) {
    return;
  }

  const sessionToken =
    getTrackedSessionToken(input.token) || getStableJwtSessionSeed(input.token) || randomUUID();
  const expires = new Date(Date.now() + AUTH_SESSION_MAX_AGE_SECONDS * 1000);

  await db.session.upsert({
    where: {
      sessionToken,
    },
    create: {
      sessionToken,
      userId: normalizedUserId,
      expires,
    },
    update: {
      userId: normalizedUserId,
      expires,
    },
  });

  await trimTrackedJwtSessionRecordsForUser({
    currentSessionToken: sessionToken,
    db,
    userId: normalizedUserId,
  });

  input.token.trackedSessionId = sessionToken;
  input.token.sessionToken = sessionToken;
  input.token.sessionRecordSyncedAt = Date.now();
}

async function trimTrackedJwtSessionRecordsForUser(input: {
  currentSessionToken: string;
  db: NonNullable<ReturnType<typeof getDb>>;
  userId: string;
}): Promise<void> {
  const sessions = await input.db.session.findMany({
    where: {
      userId: input.userId,
    },
    orderBy: {
      updatedAt: "desc",
    },
    select: {
      sessionToken: true,
    },
  });

  const tokensToDelete = sessions
    .filter((session) => session.sessionToken !== input.currentSessionToken)
    .slice(Math.max(0, MAX_TRACKED_SESSIONS_PER_USER - 1))
    .map((session) => session.sessionToken);

  if (tokensToDelete.length === 0) {
    return;
  }

  await input.db.session.deleteMany({
    where: {
      sessionToken: {
        in: tokensToDelete,
      },
    },
  });
}

export async function clearTrackedJwtSessionRecord(
  token: JWT | null | undefined,
): Promise<void> {
  const db = getDb();
  const sessionToken = getTrackedSessionToken(token);

  if (!isDatabaseConfigured() || !db || !sessionToken) {
    return;
  }

  await db.session.deleteMany({
    where: {
      sessionToken,
    },
  });
}
