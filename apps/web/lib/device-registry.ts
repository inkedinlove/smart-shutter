import "server-only";

import type { Device as PrismaDevice } from "@prisma/client";

import { getDb, isDatabaseConfigured } from "@/lib/db";
import {
  getDefaultDeviceId as getFallbackDefaultDeviceId,
  getStaticDeviceById,
  listStaticRegisteredDevices,
  type RegisteredDevice,
} from "@/lib/devices";

function mapDatabaseDevice(device: PrismaDevice): RegisteredDevice {
  return {
    deviceId: device.deviceId,
    label: device.label,
    status: device.status,
    firmwareVersion: device.firmwareVersion,
    commandTopic: device.mqttCommandTopic,
    statusTopic: device.mqttStatusTopic,
    brokerProfile: device.brokerProfile as RegisteredDevice["brokerProfile"],
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
