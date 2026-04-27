import "server-only";

import { getDb, isDatabaseConfigured } from "@/lib/db";

export class DeviceOwnershipError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "DeviceOwnershipError";
    this.statusCode = statusCode;
  }
}

export async function removeDeviceOwnership(input: {
  deviceId: string;
}): Promise<{
  deviceId: string;
  ownerProfileId: string | null;
}> {
  const db = getDb();

  if (!isDatabaseConfigured() || !db) {
    throw new DeviceOwnershipError(
      "Removing device ownership requires the database-backed registry.",
      503,
    );
  }

  const deviceId = input.deviceId.trim();

  if (!deviceId) {
    throw new DeviceOwnershipError("deviceId is required.", 400);
  }

  const existingDevice = await db.device.findUnique({
    where: {
      deviceId,
    },
    select: {
      deviceId: true,
      ownerProfileId: true,
    },
  });

  if (!existingDevice) {
    throw new DeviceOwnershipError(`Unknown deviceId: ${deviceId}`, 404);
  }

  if (!existingDevice.ownerProfileId) {
    return existingDevice;
  }

  const updatedDevice = await db.device.update({
    where: {
      deviceId,
    },
    data: {
      ownerProfileId: null,
    },
    select: {
      deviceId: true,
      ownerProfileId: true,
    },
  });

  return updatedDevice;
}
