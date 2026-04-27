import "server-only";

import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";

import { getDb, isDatabaseConfigured } from "@/lib/db";
import type { DeviceBoard } from "@/lib/devices";

export type ProvisioningArtifactType = "config" | "package";
export type ProvisioningWifiMode = "factory" | "preconfigured";

const PROVISIONING_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PROVISIONING_CODE_LENGTH = 10;

export type ProvisioningSessionSummary = {
  sessionId: string;
  deviceId: string | null;
  deviceLabel: string | null;
  pairingCode: string;
  status: string;
  artifactType: ProvisioningArtifactType;
  board: string;
  fileName: string | null;
  wifiMode: string;
  wifiSsidHint: string | null;
  createdAt: string;
  expiresAt: string;
  completedAt: string | null;
  createdBy: {
    authMode: "session" | "token" | "unknown";
    profileId: string | null;
    displayName: string | null;
    email: string | null;
  };
};

function getProvisioningSessionsDb() {
  const db = getDb();

  if (!isDatabaseConfigured() || !db) {
    return null;
  }

  return db;
}

function generateProvisioningCode(): string {
  const bytes = randomBytes(PROVISIONING_CODE_LENGTH);

  return Array.from(bytes)
    .map((value) => PROVISIONING_CODE_ALPHABET[value % PROVISIONING_CODE_ALPHABET.length])
    .join("");
}

function formatProvisioningCode(code: string): string {
  return code.match(/.{1,5}/g)?.join("-") ?? code;
}

function maskWifiSsid(ssid: string): string | null {
  const normalizedSsid = ssid.trim();

  if (!normalizedSsid) {
    return null;
  }

  if (normalizedSsid.length <= 2) {
    return `${normalizedSsid[0] ?? "*"}***`;
  }

  if (normalizedSsid.length <= 4) {
    return `${normalizedSsid.slice(0, 1)}***${normalizedSsid.slice(-1)}`;
  }

  return `${normalizedSsid.slice(0, 2)}***${normalizedSsid.slice(-2)}`;
}

function mapProvisioningSessionRecord(
  session: {
    id: string;
    deviceId: string | null;
    pairingCode: string;
    status: string;
    artifactType: string;
    board: string;
    fileName: string | null;
    wifiMode: string;
    wifiSsidHint: string | null;
    createdAt: Date;
    expiresAt: Date;
    completedAt: Date | null;
    device?: {
      label: string;
    } | null;
    createdByProfile?: {
      id: string;
      displayName: string;
      email: string | null;
    } | null;
    createdByUser?: {
      id: string;
      email: string | null;
    } | null;
  },
): ProvisioningSessionSummary {
  return {
    sessionId: session.id,
    deviceId: session.deviceId,
    deviceLabel: session.device?.label ?? null,
    pairingCode: formatProvisioningCode(session.pairingCode),
    status: session.status,
    artifactType:
      session.artifactType === "config" ? "config" : "package",
    board: session.board,
    fileName: session.fileName,
    wifiMode: session.wifiMode,
    wifiSsidHint: session.wifiSsidHint,
    createdAt: session.createdAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    completedAt: session.completedAt?.toISOString() ?? null,
    createdBy: session.createdByProfile
      ? {
          authMode: "session",
          profileId: session.createdByProfile.id,
          displayName: session.createdByProfile.displayName,
          email: session.createdByProfile.email,
        }
      : session.createdByUser
        ? {
            authMode: "session",
            profileId: null,
            displayName: session.createdByUser.email,
            email: session.createdByUser.email,
          }
        : {
            authMode: "token",
            profileId: null,
            displayName: null,
            email: null,
          },
  };
}

export async function createProvisioningSession(input: {
  deviceId: string;
  artifactType: ProvisioningArtifactType;
  board: DeviceBoard;
  fileName: string;
  wifiMode: ProvisioningWifiMode;
  wifiSsid: string;
  createdByUserId?: string | null;
  createdByProfileId?: string | null;
}): Promise<ProvisioningSessionSummary | null> {
  const db = getProvisioningSessionsDb();
  const normalizedDeviceId = input.deviceId.trim();
  const normalizedFileName = input.fileName.trim();

  if (!db || !normalizedDeviceId || !normalizedFileName) {
    return null;
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const createdByUserId =
    typeof input.createdByUserId === "string" ? input.createdByUserId.trim() : "";
  const createdByProfileId =
    typeof input.createdByProfileId === "string"
      ? input.createdByProfileId.trim()
      : "";

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const pairingCode = generateProvisioningCode();

    try {
      const session = await db.provisioningSession.create({
        data: {
          deviceId: normalizedDeviceId,
          pairingCode,
          status:
            input.artifactType === "config"
              ? "config_generated"
              : "package_generated",
          artifactType: input.artifactType,
          board: input.board,
          fileName: normalizedFileName,
          wifiMode: input.wifiMode,
          wifiSsidHint:
            input.wifiMode === "preconfigured"
              ? maskWifiSsid(input.wifiSsid)
              : null,
          createdByUserId: createdByUserId || null,
          createdByProfileId: createdByProfileId || null,
          expiresAt,
        },
        include: {
          device: {
            select: {
              label: true,
            },
          },
          createdByProfile: {
            select: {
              id: true,
              displayName: true,
              email: true,
            },
          },
          createdByUser: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });

      return mapProvisioningSessionRecord(session);
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

  throw new Error("Unable to generate a unique provisioning tracking code.");
}

export async function listRecentProvisioningSessions(
  limit = 10,
): Promise<ProvisioningSessionSummary[]> {
  const db = getProvisioningSessionsDb();

  if (!db) {
    return [];
  }

  try {
    const sessions = await db.provisioningSession.findMany({
      include: {
        device: {
          select: {
            label: true,
          },
        },
        createdByProfile: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
        createdByUser: {
          select: {
            id: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
    });

    return sessions.map(mapProvisioningSessionRecord);
  } catch (error) {
    console.error("Unable to list provisioning sessions:", error);
    return [];
  }
}

export async function completeProvisioningSessionsForDevice(
  deviceId: string,
): Promise<void> {
  const db = getProvisioningSessionsDb();
  const normalizedDeviceId = deviceId.trim();

  if (!db || !normalizedDeviceId) {
    return;
  }

  try {
    await db.provisioningSession.updateMany({
      where: {
        deviceId: normalizedDeviceId,
        completedAt: null,
        status: {
          in: ["config_generated", "package_generated"],
        },
      },
      data: {
        status: "claimed",
        completedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("Unable to complete provisioning sessions:", error);
  }
}
