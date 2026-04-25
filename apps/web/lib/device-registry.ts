import "server-only";

import type { Device as PrismaDevice, UserProfile as PrismaUserProfile } from "@prisma/client";

import { getDb, isDatabaseConfigured } from "@/lib/db";
import {
  getDefaultDeviceId as getFallbackDefaultDeviceId,
  getStaticDeviceById,
  listStaticRegisteredDevices,
  type RegisteredDevice,
} from "@/lib/devices";

type DatabaseDeviceWithOwner = PrismaDevice & {
  ownerProfile?: Pick<PrismaUserProfile, "id" | "displayName" | "email"> | null;
};

function mapDatabaseDevice(device: DatabaseDeviceWithOwner): RegisteredDevice {
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

async function readDatabaseDevices(): Promise<RegisteredDevice[] | null> {
  const db = getDb();

  if (!isDatabaseConfigured() || !db) {
    return null;
  }

  try {
    const devices = await db.device.findMany({
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

    return devices.map(mapDatabaseDevice);
  } catch (error) {
    console.error("Device registry database lookup failed:", error);
    return null;
  }
}

export async function listAvailableDevices(): Promise<RegisteredDevice[]> {
  const databaseDevices = await readDatabaseDevices();

  if (databaseDevices && databaseDevices.length > 0) {
    return databaseDevices;
  }

  return listStaticRegisteredDevices();
}

export async function getRegisteredDeviceById(
  deviceId: string,
): Promise<RegisteredDevice | undefined> {
  const normalizedDeviceId = deviceId.trim();

  if (!normalizedDeviceId) {
    return undefined;
  }

  const db = getDb();

  if (isDatabaseConfigured() && db) {
    try {
      const device = await db.device.findUnique({
        where: {
          deviceId: normalizedDeviceId,
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
        return mapDatabaseDevice(device);
      }
    } catch (error) {
      console.error("Device lookup failed, falling back to static registry:", error);
    }
  }

  return getStaticDeviceById(normalizedDeviceId);
}

export async function getDefaultRegisteredDevice(): Promise<RegisteredDevice> {
  const defaultDeviceId = getFallbackDefaultDeviceId();
  const defaultDevice = await getRegisteredDeviceById(defaultDeviceId);

  if (defaultDevice) {
    return defaultDevice;
  }

  const devices = await listAvailableDevices();
  return devices[0];
}

export async function getDefaultRegisteredDeviceId(): Promise<string> {
  return (await getDefaultRegisteredDevice()).deviceId;
}
