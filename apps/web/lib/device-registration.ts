import "server-only";

import type { Device as PrismaDevice, UserProfile as PrismaUserProfile } from "@prisma/client";

import { getDb, isDatabaseConfigured } from "@/lib/db";
import {
  formatDeviceBoardLabel as formatDeviceBoardLabelText,
  getStaticDeviceById,
  listStaticRegisteredDevices,
  normalizeDeviceBoardValue,
  type DeviceBoard,
  type RegisteredDevice,
} from "@/lib/devices";
import type { DeviceClaimState } from "@/lib/device";
import { isInternalTestMode } from "@/lib/runtime-mode";

type DatabaseDeviceWithOwner = PrismaDevice & {
  credentialMode?: string | null;
  credentialStatus?: string | null;
  credentialIssuedAt?: Date | null;
  credentialRevokedAt?: Date | null;
  mqttClientId?: string | null;
  mqttUsernameRef?: string | null;
  certificateFingerprint?: string | null;
  ownerProfile?: Pick<PrismaUserProfile, "id" | "displayName" | "email"> | null;
};

const DEFAULT_DEVICE_BOARD: DeviceBoard = "esp32";

function normalizeDeviceBoard(value: unknown): DeviceBoard {
  if (typeof value !== "string") {
    return DEFAULT_DEVICE_BOARD;
  }

  return normalizeDeviceBoardValue(value);
}

export class DeviceRegistrationError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "DeviceRegistrationError";
    this.statusCode = statusCode;
  }
}

export type DeviceRegistrationState = {
  deviceId: string;
  label: string | null;
  board: DeviceBoard;
  claimState: DeviceClaimState;
  otaAutoUpdateEnabled: boolean;
  otaAutoUpdateChannel: string;
  credentialMode: string;
  credentialStatus: string;
  credentialIssuedAt: string | null;
  credentialRevokedAt: string | null;
  mqttClientId: string | null;
  mqttUsernameRef: string | null;
  certificateFingerprint: string | null;
  ownerProfileId: string | null;
  ownerProfileDisplayName: string | null;
  ownedByCurrentProfile: boolean;
  commandTopic: string | null;
  statusTopic: string | null;
  exists: boolean;
};

export function buildDeviceMqttClientId(deviceId: string): string {
  return `smart-shutter-${deviceId}`;
}

export function buildDefaultDeviceTopics(deviceId: string): {
  commandTopic: string;
  statusTopic: string;
} {
  return {
    commandTopic: `shutters/${deviceId}/commands`,
    statusTopic: `shutters/${deviceId}/status`,
  };
}

function mapDatabaseRegistrationState(
  device: DatabaseDeviceWithOwner,
  currentProfileId?: string | null,
): DeviceRegistrationState {
  const claimState: DeviceClaimState = device.ownerProfileId ? "claimed" : "unclaimed";

  return {
    deviceId: device.deviceId,
    label: device.label,
    board: normalizeDeviceBoard(device.board),
    claimState,
    otaAutoUpdateEnabled: device.otaAutoUpdateEnabled ?? false,
    otaAutoUpdateChannel: device.otaAutoUpdateChannel ?? "stable",
    credentialMode: device.credentialMode ?? "shared",
    credentialStatus: device.credentialStatus ?? "active",
    credentialIssuedAt: device.credentialIssuedAt?.toISOString() ?? null,
    credentialRevokedAt: device.credentialRevokedAt?.toISOString() ?? null,
    mqttClientId:
      device.mqttClientId ?? buildDeviceMqttClientId(device.deviceId),
    mqttUsernameRef: device.mqttUsernameRef ?? null,
    certificateFingerprint: device.certificateFingerprint ?? null,
    ownerProfileId: device.ownerProfileId,
    ownerProfileDisplayName: device.ownerProfile?.displayName ?? null,
    ownedByCurrentProfile:
      Boolean(currentProfileId) && device.ownerProfileId === currentProfileId,
    commandTopic: device.mqttCommandTopic,
    statusTopic: device.mqttStatusTopic,
    exists: true,
  };
}

function mapStaticRegistrationState(
  device: RegisteredDevice,
  currentProfileId?: string | null,
): DeviceRegistrationState {
  const claimState: DeviceClaimState = device.ownerProfileId ? "claimed" : "unclaimed";

  return {
    deviceId: device.deviceId,
    label: device.label,
    board: normalizeDeviceBoard(device.board),
    claimState,
    otaAutoUpdateEnabled: device.otaAutoUpdateEnabled,
    otaAutoUpdateChannel: device.otaAutoUpdateChannel,
    credentialMode: "shared",
    credentialStatus: "active",
    credentialIssuedAt: null,
    credentialRevokedAt: null,
    mqttClientId: buildDeviceMqttClientId(device.deviceId),
    mqttUsernameRef: null,
    certificateFingerprint: null,
    ownerProfileId: device.ownerProfileId ?? null,
    ownerProfileDisplayName: device.ownerProfile?.displayName ?? null,
    ownedByCurrentProfile:
      Boolean(currentProfileId) && device.ownerProfileId === currentProfileId,
    commandTopic: device.commandTopic,
    statusTopic: device.statusTopic,
    exists: true,
  };
}

function createUnknownDeviceRegistrationState(
  deviceId: string,
): DeviceRegistrationState {
  return {
    deviceId,
    label: null,
    board: DEFAULT_DEVICE_BOARD,
    claimState: "unknown",
    otaAutoUpdateEnabled: false,
    otaAutoUpdateChannel: "stable",
    credentialMode: "shared",
    credentialStatus: "active",
    credentialIssuedAt: null,
    credentialRevokedAt: null,
    mqttClientId: buildDeviceMqttClientId(deviceId),
    mqttUsernameRef: null,
    certificateFingerprint: null,
    ownerProfileId: null,
    ownerProfileDisplayName: null,
    ownedByCurrentProfile: false,
    commandTopic: null,
    statusTopic: null,
    exists: false,
  };
}

export async function classifyDeviceClaimState(
  deviceId: string,
): Promise<DeviceClaimState> {
  const state = await getDeviceRegistrationState(deviceId);
  return state.claimState;
}

export async function getDeviceRegistrationState(
  deviceId: string,
  options?: {
    currentProfileId?: string | null;
  },
): Promise<DeviceRegistrationState> {
  const normalizedDeviceId = deviceId.trim();

  if (!normalizedDeviceId) {
    return createUnknownDeviceRegistrationState("");
  }

  const db = getDb();

  if (isDatabaseConfigured() && db) {
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

    if (!device) {
      return createUnknownDeviceRegistrationState(normalizedDeviceId);
    }

    return mapDatabaseRegistrationState(
      device,
      options?.currentProfileId ?? null,
    );
  }

  if (isInternalTestMode()) {
    const fallbackDevice = getStaticDeviceById(normalizedDeviceId);

    if (fallbackDevice) {
      return mapStaticRegistrationState(
        fallbackDevice,
        options?.currentProfileId ?? null,
      );
    }
  }

  return createUnknownDeviceRegistrationState(normalizedDeviceId);
}

export async function listDeviceRegistrationStates(options?: {
  currentProfileId?: string | null;
}): Promise<DeviceRegistrationState[]> {
  const db = getDb();

  if (isDatabaseConfigured() && db) {
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

    return devices.map((device) =>
      mapDatabaseRegistrationState(device, options?.currentProfileId ?? null),
    );
  }

  if (isInternalTestMode()) {
    return listStaticRegisteredDevices().map((device) =>
      mapStaticRegistrationState(device, options?.currentProfileId ?? null),
    );
  }

  return [];
}

export async function registerDeviceIfMissing(input: {
  deviceId: string;
  label: string;
  board: string;
}): Promise<DeviceRegistrationState> {
  const db = getDb();

  if (!isDatabaseConfigured() || !db) {
    throw new DeviceRegistrationError(
      "Device registration requires the database-backed registry.",
      503,
    );
  }

  const deviceId = input.deviceId.trim();
  const label = input.label.trim();
  const board = normalizeDeviceBoard(input.board);

  if (!deviceId) {
    throw new DeviceRegistrationError("deviceId is required.", 400);
  }

  if (!label) {
    throw new DeviceRegistrationError("label is required.", 400);
  }

  const existingDevice = await db.device.findUnique({
    where: {
      deviceId,
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

  if (existingDevice) {
    const existingBoard = normalizeDeviceBoard(existingDevice.board);
    const nextTopics = buildDefaultDeviceTopics(deviceId);
    const needsUpdate =
      existingDevice.label !== label ||
      existingBoard !== board ||
      !existingDevice.mqttCommandTopic ||
      !existingDevice.mqttStatusTopic ||
      !existingDevice.mqttClientId;

    if (!needsUpdate) {
      return mapDatabaseRegistrationState(existingDevice);
    }

    const updatedDevice = await db.device.update({
      where: {
        deviceId,
      },
      data: {
        label,
        board,
        mqttCommandTopic: existingDevice.mqttCommandTopic || nextTopics.commandTopic,
        mqttStatusTopic: existingDevice.mqttStatusTopic || nextTopics.statusTopic,
        mqttClientId:
          existingDevice.mqttClientId ?? buildDeviceMqttClientId(deviceId),
      } as never,
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

    return mapDatabaseRegistrationState(updatedDevice);
  }

  const topics = buildDefaultDeviceTopics(deviceId);
  const createData = {
    deviceId,
    label,
    board,
    status: "factory_registered",
    mqttCommandTopic: topics.commandTopic,
    mqttStatusTopic: topics.statusTopic,
    brokerProfile: "hivemq-dev",
    otaAutoUpdateEnabled: false,
    otaAutoUpdateChannel: "stable",
    credentialMode: "shared",
    credentialStatus: "active",
    mqttClientId: buildDeviceMqttClientId(deviceId),
  };
  const device = await db.device.create({
    data: createData as never,
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

  return mapDatabaseRegistrationState(device);
}

export async function deleteRegisteredDevice(
  deviceIdInput: string,
): Promise<DeviceRegistrationState> {
  const db = getDb();

  if (!isDatabaseConfigured() || !db) {
    throw new DeviceRegistrationError(
      "Device deletion requires the database-backed registry.",
      503,
    );
  }

  const deviceId = deviceIdInput.trim();

  if (!deviceId) {
    throw new DeviceRegistrationError("deviceId is required.", 400);
  }

  const existingDevice = await db.device.findUnique({
    where: {
      deviceId,
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

  if (!existingDevice) {
    throw new DeviceRegistrationError(`Unknown deviceId: ${deviceId}`, 404);
  }

  await db.device.delete({
    where: {
      deviceId,
    },
  });

  return mapDatabaseRegistrationState(existingDevice);
}

export function describeClaimState(claimState: DeviceClaimState): string {
  switch (claimState) {
    case "claimed":
      return "Claimed";
    case "unclaimed":
      return "Unclaimed";
    case "unknown":
    default:
      return "Unknown";
  }
}

export function formatDeviceBoardLabel(board: string): string {
  return formatDeviceBoardLabelText(board);
}
