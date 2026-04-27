import "server-only";

import { randomUUID } from "node:crypto";

import type { JWT } from "next-auth/jwt";

import { getDb, isDatabaseConfigured } from "@/lib/db";

export const AUTH_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;
export const AUTH_SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 8;

const SESSION_RECORD_SYNC_INTERVAL_MS = 15 * 60 * 1000;

function getTrackedSessionToken(token: JWT | null | undefined): string {
  return typeof token?.sessionToken === "string" ? token.sessionToken.trim() : "";
}

function shouldSyncSessionRecord(input: {
  token: JWT;
  trigger?: "signIn" | "signUp" | "update";
}): boolean {
  if (input.trigger === "signIn" || input.trigger === "signUp") {
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

  const sessionToken = getTrackedSessionToken(input.token) || randomUUID();
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

  input.token.sessionToken = sessionToken;
  input.token.sessionRecordSyncedAt = Date.now();
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
