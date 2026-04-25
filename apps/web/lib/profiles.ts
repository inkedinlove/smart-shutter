import "server-only";

import type { Device as PrismaDevice, UserProfile as PrismaUserProfile } from "@prisma/client";

import { getDb, isDatabaseConfigured } from "@/lib/db";
import {
  getStaticDefaultDevice,
  listStaticRegisteredDevices,
  type ProfileSummary,
  type RegisteredDevice,
} from "@/lib/devices";
import { isInternalTestMode } from "@/lib/runtime-mode";

export type UserProfileRecord = {
  profileId: string;
  displayName: string;
  email: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VoiceIntegrationRecord = {
  provider: string;
  status: string;
  linkedAt: string | null;
  revokedAt: string | null;
};

export const DEMO_PROFILE_ID = "demo-profile";
export const DEMO_PROFILE_EMAIL = "demo@smartshutter.local";
export const DEMO_PROFILE_DISPLAY_NAME = "Demo Operator";

function createFallbackProfile(): UserProfileRecord {
  return {
    profileId: DEMO_PROFILE_ID,
    displayName: DEMO_PROFILE_DISPLAY_NAME,
    email: DEMO_PROFILE_EMAIL,
    createdAt: "2026-04-24T00:00:00.000Z",
    updatedAt: "2026-04-24T00:00:00.000Z",
  };
}

function mapProfile(profile: PrismaUserProfile): UserProfileRecord {
  return {
    profileId: profile.id,
    displayName: profile.displayName,
    email: profile.email,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

function toProfileSummary(profile: UserProfileRecord): ProfileSummary {
  return {
    profileId: profile.profileId,
    displayName: profile.displayName,
    email: profile.email,
  };
}

type DatabaseDeviceWithOwner = PrismaDevice & {
  ownerProfile?: Pick<PrismaUserProfile, "id" | "displayName" | "email"> | null;
};

function mapOwnedDevice(device: DatabaseDeviceWithOwner): RegisteredDevice {
  return {
    deviceId: device.deviceId,
    label: device.label,
    board: device.board as RegisteredDevice["board"],
    status: device.status,
    firmwareVersion: device.firmwareVersion,
    commandTopic: device.mqttCommandTopic,
    statusTopic: device.mqttStatusTopic,
    brokerProfile: device.brokerProfile as RegisteredDevice["brokerProfile"],
    ownerProfileId: device.ownerProfileId,
    ownerProfile: device.ownerProfile
      ? {
          profileId: device.ownerProfile.id,
          displayName: device.ownerProfile.displayName,
          email: device.ownerProfile.email,
        }
      : null,
    createdAt: device.createdAt.toISOString(),
  };
}

function attachFallbackOwner(
  device: RegisteredDevice,
  profile: UserProfileRecord,
): RegisteredDevice {
  return {
    ...device,
    ownerProfileId: profile.profileId,
    ownerProfile: toProfileSummary(profile),
  };
}

type ProfileDeviceQueryOptions = {
  allowFallback?: boolean;
};

function shouldAllowFallback(options?: ProfileDeviceQueryOptions): boolean {
  return options?.allowFallback ?? isInternalTestMode();
}

export async function getDemoProfile(): Promise<UserProfileRecord> {
  const db = getDb();

  if (isDatabaseConfigured() && db) {
    try {
      const profile = await db.userProfile.findUnique({
        where: {
          email: DEMO_PROFILE_EMAIL,
        },
      });

      if (profile) {
        return mapProfile(profile);
      }
    } catch (error) {
      console.error("Demo profile lookup failed, using static fallback:", error);
    }
  }

  return createFallbackProfile();
}

export async function getDevicesForProfile(
  profileId: string,
  options?: ProfileDeviceQueryOptions,
): Promise<RegisteredDevice[]> {
  const normalizedProfileId = profileId.trim();
  const db = getDb();

  if (isDatabaseConfigured() && db) {
    try {
      const devices = await db.device.findMany({
        where: {
          ownerProfileId: normalizedProfileId,
        },
        include: {
          ownerProfile: {
            select: {
              id: true,
              displayName: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      });

      if (devices.length > 0) {
        return devices.map(mapOwnedDevice);
      }
    } catch (error) {
      console.error("Profile device lookup failed, using fallback devices:", error);
    }
  }

  if (!shouldAllowFallback(options)) {
    return [];
  }

  const fallbackProfile = createFallbackProfile();

  if (normalizedProfileId !== fallbackProfile.profileId) {
    return [];
  }

  return listStaticRegisteredDevices().map((device) =>
    attachFallbackOwner(device, fallbackProfile),
  );
}

export async function getProfileDevice(
  profileId: string,
  deviceId: string,
  options?: ProfileDeviceQueryOptions,
): Promise<RegisteredDevice | undefined> {
  const normalizedProfileId = profileId.trim();
  const normalizedDeviceId = deviceId.trim();

  if (!normalizedProfileId || !normalizedDeviceId) {
    return undefined;
  }

  const db = getDb();

  if (isDatabaseConfigured() && db) {
    try {
      const device = await db.device.findFirst({
        where: {
          deviceId: normalizedDeviceId,
          ownerProfileId: normalizedProfileId,
        },
        include: {
          ownerProfile: {
            select: {
              id: true,
              displayName: true,
              email: true,
            },
          },
        },
      });

      if (device) {
        return mapOwnedDevice(device);
      }
    } catch (error) {
      console.error("Owned device lookup failed, using static fallback:", error);
    }
  }

  if (!shouldAllowFallback(options)) {
    return undefined;
  }

  const fallbackProfile = createFallbackProfile();

  if (normalizedProfileId !== fallbackProfile.profileId) {
    return undefined;
  }

  const fallbackDevice = listStaticRegisteredDevices().find(
    (device) => device.deviceId === normalizedDeviceId,
  );

  return fallbackDevice
    ? attachFallbackOwner(fallbackDevice, fallbackProfile)
    : undefined;
}

export async function getDemoProfileDefaultDeviceId(
  options?: ProfileDeviceQueryOptions,
): Promise<string> {
  const demoProfile = await getDemoProfile();
  const devices = await getDevicesForProfile(demoProfile.profileId, options);
  return devices[0]?.deviceId ?? getStaticDefaultDevice().deviceId;
}

export function getFallbackDemoProfile(): UserProfileRecord {
  return createFallbackProfile();
}

export async function getVoiceIntegrationsForProfile(
  profileId: string,
): Promise<VoiceIntegrationRecord[]> {
  const normalizedProfileId = profileId.trim();
  const db = getDb();

  if (isDatabaseConfigured() && db) {
    try {
      const integrations = await db.voiceIntegrationAccount.findMany({
        where: {
          profileId: normalizedProfileId,
        },
        orderBy: {
          createdAt: "asc",
        },
      });

      return integrations.map((integration) => ({
        provider: integration.provider,
        status: integration.status,
        linkedAt: integration.linkedAt?.toISOString() ?? null,
        revokedAt: integration.revokedAt?.toISOString() ?? null,
      }));
    } catch (error) {
      console.error("Voice integration lookup failed, using fallback:", error);
    }
  }

  return [];
}
