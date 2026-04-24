import "server-only";

import { PrismaClient } from "@prisma/client";

declare global {
  var __smartShutterPrisma__: PrismaClient | undefined;
}

function hasNonEmptyValue(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isDatabaseConfigured(): boolean {
  return hasNonEmptyValue(process.env.DATABASE_URL);
}

export function getDb(): PrismaClient | null {
  if (!isDatabaseConfigured()) {
    return null;
  }

  if (!global.__smartShutterPrisma__) {
    global.__smartShutterPrisma__ = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
  }

  return global.__smartShutterPrisma__;
}
