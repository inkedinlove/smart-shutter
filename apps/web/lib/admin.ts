import "server-only";

import { timingSafeEqual } from "node:crypto";

import { requireAdminSession } from "@/lib/access-control";

export class AdminAuthorizationError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 401) {
    super(message);
    this.name = "AdminAuthorizationError";
    this.statusCode = statusCode;
  }
}

function getConfiguredAdminToken(): string {
  const adminToken = process.env.ADMIN_TOKEN?.trim();

  if (!adminToken) {
    throw new AdminAuthorizationError(
      "Admin publishing is not configured on this deployment.",
      503,
    );
  }

  return adminToken;
}

function isValidAdminToken(providedToken: string, expectedToken: string): boolean {
  const providedBuffer = Buffer.from(providedToken);
  const expectedBuffer = Buffer.from(expectedToken);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export function requireAdminToken(request: Request): void {
  const configuredToken = getConfiguredAdminToken();
  const providedToken = request.headers.get("x-admin-token")?.trim();

  if (!providedToken || !isValidAdminToken(providedToken, configuredToken)) {
    throw new AdminAuthorizationError("Unauthorized.", 401);
  }
}

export async function requireAdminAccess(request: Request): Promise<void> {
  const providedToken = request.headers.get("x-admin-token")?.trim();

  if (providedToken) {
    requireAdminToken(request);
    return;
  }

  try {
    await requireAdminSession();
  } catch (error) {
    if (error instanceof Error && "statusCode" in error) {
      throw new AdminAuthorizationError(
        error.message,
        typeof error.statusCode === "number" ? error.statusCode : 403,
      );
    }

    throw error;
  }
}
