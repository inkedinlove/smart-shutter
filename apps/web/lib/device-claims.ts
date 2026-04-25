import "server-only";

import { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";

import { getDb, isDatabaseConfigured } from "@/lib/db";

const CLAIM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CLAIM_CODE_LENGTH = 8;
const MIN_CLAIM_MINUTES = 1;
const MAX_CLAIM_MINUTES = 7 * 24 * 60;
const GENERIC_INVALID_CLAIM_MESSAGE =
  "This claim code is invalid or no longer available.";
const GENERIC_USED_CLAIM_MESSAGE =
  "This claim code is no longer available. Request a new link.";
const EXPIRED_CLAIM_MESSAGE =
  "This claim code has expired. Request a new link.";

export type DeviceClaimSummary = {
  deviceId: string;
  deviceLabel: string;
  claimCode: string;
  shortDisplayCode: string;
  claimUrl: string | null;
  deviceSetupUrl: string | null;
  status: string;
  expiresAt: string;
  claimedAt: string | null;
  createdAt: string;
};

export class DeviceClaimError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "DeviceClaimError";
    this.statusCode = statusCode;
  }
}

function getClaimsDb() {
  const db = getDb();

  if (!isDatabaseConfigured() || !db) {
    throw new DeviceClaimError(
      "Claiming requires the database-backed profile model.",
      503,
    );
  }

  return db;
}

function generateCanonicalClaimCode(): string {
  const bytes = randomBytes(CLAIM_CODE_LENGTH);

  return Array.from(bytes)
    .map((value) => CLAIM_CODE_ALPHABET[value % CLAIM_CODE_ALPHABET.length])
    .join("");
}

export function formatClaimCode(claimCode: string): string {
  return claimCode.match(/.{1,4}/g)?.join("-") ?? claimCode;
}

export function normalizeClaimCode(claimCode: string): string {
  return claimCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizePublicAppBaseUrl(baseUrl: string | null | undefined): string | null {
  if (typeof baseUrl !== "string" || baseUrl.trim().length === 0) {
    return null;
  }

  try {
    const parsedUrl = new URL(baseUrl.trim());

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return null;
    }

    return parsedUrl.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function buildDeviceSetupUrl(
  baseUrl: string | null | undefined,
  claimCode: string,
): string | null {
  const normalizedBaseUrl = normalizePublicAppBaseUrl(baseUrl);

  if (!normalizedBaseUrl) {
    return null;
  }

  const url = new URL(normalizedBaseUrl);
  const basePath = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
  url.pathname = `${basePath}/claim`;
  url.searchParams.set("code", formatClaimCode(claimCode));
  return url.toString();
}

function mapClaimSummary(
  claim: {
    claimCode: string;
    shortDisplayCode: string | null;
    deviceSetupUrl: string | null;
    status: string;
    expiresAt: Date;
    claimedAt: Date | null;
    createdAt: Date;
    deviceId: string;
  },
  deviceLabel: string,
): DeviceClaimSummary {
  const shortDisplayCode = claim.shortDisplayCode ?? formatClaimCode(claim.claimCode);
  const claimUrl = claim.deviceSetupUrl ?? null;

  return {
    deviceId: claim.deviceId,
    deviceLabel,
    claimCode: formatClaimCode(claim.claimCode),
    shortDisplayCode,
    claimUrl,
    deviceSetupUrl: claimUrl,
    status: claim.status,
    expiresAt: claim.expiresAt.toISOString(),
    claimedAt: claim.claimedAt?.toISOString() ?? null,
    createdAt: claim.createdAt.toISOString(),
  };
}

function validateExpiresInMinutes(value: number): number {
  if (!Number.isInteger(value)) {
    throw new DeviceClaimError("expiresInMinutes must be a whole number.", 400);
  }

  if (value < MIN_CLAIM_MINUTES || value > MAX_CLAIM_MINUTES) {
    throw new DeviceClaimError(
      `expiresInMinutes must be between ${MIN_CLAIM_MINUTES} and ${MAX_CLAIM_MINUTES}.`,
      400,
    );
  }

  return value;
}

export async function createDeviceClaim(input: {
  deviceId: string;
  expiresInMinutes: number;
  publicAppBaseUrl?: string | null;
}): Promise<DeviceClaimSummary> {
  const deviceId = input.deviceId.trim();
  const expiresInMinutes = validateExpiresInMinutes(input.expiresInMinutes);

  if (!deviceId) {
    throw new DeviceClaimError("deviceId is required.", 400);
  }

  const db = getClaimsDb();
  const device = await db.device.findUnique({
    where: {
      deviceId,
    },
  });

  if (!device) {
    throw new DeviceClaimError(`Unknown deviceId: ${deviceId}`, 404);
  }

  const expiresAt = new Date(Date.now() + expiresInMinutes * 60_000);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const claimCode = generateCanonicalClaimCode();
    const shortDisplayCode = formatClaimCode(claimCode);
    const deviceSetupUrl = buildDeviceSetupUrl(
      input.publicAppBaseUrl,
      claimCode,
    );

    try {
      const claim = await db.deviceClaim.create({
        data: {
          deviceId: device.deviceId,
          claimCode,
          shortDisplayCode,
          deviceSetupUrl,
          expiresAt,
        },
      });

      return mapClaimSummary(claim, device.label);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }

      throw error;
    }
  }

  throw new DeviceClaimError(
    "Unable to generate a unique claim code. Try again.",
    500,
  );
}

export async function redeemDeviceClaim(input: {
  claimCode: string;
  profileId: string;
}): Promise<DeviceClaimSummary> {
  const claimCode = normalizeClaimCode(input.claimCode);
  const profileId = input.profileId.trim();

  if (claimCode.length !== CLAIM_CODE_LENGTH) {
    throw new DeviceClaimError(GENERIC_INVALID_CLAIM_MESSAGE, 400);
  }

  if (!profileId) {
    throw new DeviceClaimError("Sign in required before claiming a device.", 401);
  }

  const db = getClaimsDb();

  return db.$transaction(async (tx) => {
    const claim = await tx.deviceClaim.findUnique({
      where: {
        claimCode,
      },
      include: {
        device: true,
      },
    });

    if (!claim) {
      throw new DeviceClaimError(GENERIC_INVALID_CLAIM_MESSAGE, 404);
    }

    if (claim.status !== "created") {
      throw new DeviceClaimError(GENERIC_USED_CLAIM_MESSAGE, 409);
    }

    if (claim.expiresAt.getTime() <= Date.now()) {
      throw new DeviceClaimError(EXPIRED_CLAIM_MESSAGE, 410);
    }

    if (!claim.device) {
      throw new DeviceClaimError(GENERIC_INVALID_CLAIM_MESSAGE, 404);
    }

    const profile = await tx.userProfile.findUnique({
      where: {
        id: profileId,
      },
    });

    if (!profile) {
      throw new DeviceClaimError("Customer profile not found.", 404);
    }

    await tx.device.update({
      where: {
        deviceId: claim.device.deviceId,
      },
      data: {
        ownerProfileId: profileId,
      },
    });

    const updatedClaim = await tx.deviceClaim.update({
      where: {
        id: claim.id,
      },
      data: {
        profileId,
        status: "claimed",
        claimedAt: new Date(),
      },
    });

    return mapClaimSummary(updatedClaim, claim.device.label);
  });
}
