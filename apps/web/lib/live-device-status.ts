import "server-only";

import type { RegisteredDevice } from "@/lib/devices";
import {
  closeMqttClient,
  connectMqttClient,
  createMqttClient,
  subscribeToTopic,
} from "@/lib/mqtt";
import {
  clampPercent,
  createDefaultDeviceStatus,
  isDeviceClaimState,
  isDeviceActuatorType,
  isDeviceMode,
  isOtaState,
  normalizeReportedBoardValue,
  type DeviceMode,
  type DeviceStatus,
  type OtaState,
} from "@/lib/device";
import { getDb, isDatabaseConfigured } from "@/lib/db";

const STATUS_TIMEOUT_MS = 1000;
const lastSeenByDeviceId = new Map<string, string>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function parsePercent(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return clampPercent(value);
}

function parseOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function parseOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const nextValues = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return nextValues.length > 0 ? nextValues : undefined;
}

function parseDeviceMode(
  value: unknown,
  online: boolean,
  moving: boolean,
): DeviceMode {
  if (moving) {
    return "MOVING";
  }

  if (isDeviceMode(value)) {
    return value;
  }

  return online ? "READY" : "ERROR";
}

function parseOtaState(
  value: unknown,
  otaEnabled: boolean | undefined,
): OtaState | undefined {
  if (isOtaState(value)) {
    return value;
  }

  if (otaEnabled === false) {
    return "DISABLED";
  }

  if (otaEnabled === true) {
    return "IDLE";
  }

  return undefined;
}

function recordLastSeenAt(deviceId: string, timestamp = new Date().toISOString()): string {
  const normalizedDeviceId = deviceId.trim();

  if (!normalizedDeviceId) {
    return timestamp;
  }

  lastSeenByDeviceId.set(normalizedDeviceId, timestamp);
  return timestamp;
}

function getRecordedLastSeenAt(deviceId: string): string | null {
  const normalizedDeviceId = deviceId.trim();

  if (!normalizedDeviceId) {
    return null;
  }

  return lastSeenByDeviceId.get(normalizedDeviceId) ?? null;
}

function withRecordedLastSeen(status: DeviceStatus): DeviceStatus {
  const receivedAt = new Date().toISOString();
  const nextLastSeenAt = recordLastSeenAt(status.deviceId, receivedAt);

  if (status.resolvedDeviceId && status.resolvedDeviceId !== status.deviceId) {
    recordLastSeenAt(status.resolvedDeviceId, receivedAt);
  }

  return {
    ...status,
    lastSeenAt: nextLastSeenAt,
  };
}

export function parseStatusMessage(
  message: string,
  fallbackDeviceId: string,
): DeviceStatus | null {
  try {
    const parsed = JSON.parse(message) as unknown;

    if (!isRecord(parsed)) {
      return null;
    }

    const online = parseBoolean(parsed.online, false);
    const moving = parseBoolean(parsed.moving, false);
    const otaEnabled = parseOptionalBoolean(parsed.otaEnabled);

    return {
      deviceId:
        typeof parsed.deviceId === "string" && parsed.deviceId.trim()
          ? parsed.deviceId
          : fallbackDeviceId,
      resolvedDeviceId:
        typeof parsed.resolvedDeviceId === "string" && parsed.resolvedDeviceId.trim()
          ? parsed.resolvedDeviceId.trim()
          : fallbackDeviceId,
      claimState: isDeviceClaimState(parsed.claimState)
        ? parsed.claimState
        : "unknown",
      online,
      moving,
      deviceMode: parseDeviceMode(parsed.deviceMode, online, moving),
      estimatedPercent: parsePercent(parsed.estimatedPercent),
      targetPercent: parsePercent(parsed.targetPercent),
      lastSeenAt:
        typeof parsed.lastSeenAt === "string" && parsed.lastSeenAt.trim()
          ? parsed.lastSeenAt
          : new Date().toISOString(),
      firmwareVersion: parseOptionalString(parsed.firmwareVersion),
      deviceUptimeMs: parseOptionalNumber(parsed.deviceUptimeMs),
      rssi: parseOptionalNumber(parsed.rssi),
      setupMode: parseOptionalBoolean(parsed.setupMode),
      wifiConnected: parseOptionalBoolean(parsed.wifiConnected),
      mqttConnected: parseOptionalBoolean(parsed.mqttConnected),
      otaEnabled,
      otaAutoUpdateEnabled: parseOptionalBoolean(parsed.otaAutoUpdateEnabled),
      otaAutoUpdateChannel: parseOptionalString(parsed.otaAutoUpdateChannel),
      otaState: parseOtaState(parsed.otaState, otaEnabled),
      otaLastError: parseOptionalString(parsed.otaLastError),
      otaTargetVersion: parseOptionalString(parsed.otaTargetVersion),
      calibrationComplete: parseOptionalBoolean(parsed.calibrationComplete),
      safetyMode: parseOptionalBoolean(parsed.safetyMode),
      allowedMaxPercentStep: parseOptionalNumber(parsed.allowedMaxPercentStep),
      lastCalibrationAction: parseOptionalString(parsed.lastCalibrationAction),
      movementLockedReason: parseOptionalString(parsed.movementLockedReason),
      reportedBoard: normalizeReportedBoardValue(parsed.reportedBoard),
      actuatorType: isDeviceActuatorType(parsed.actuatorType)
        ? parsed.actuatorType
        : undefined,
      reportedCapabilities: parseOptionalStringArray(parsed.reportedCapabilities),
    };
  } catch {
    return null;
  }
}

export async function readLatestDeviceStatus(
  device: Pick<RegisteredDevice, "deviceId" | "statusTopic">,
): Promise<DeviceStatus | null> {
  const client = createMqttClient(device.deviceId);

  try {
    await connectMqttClient(client);
    await subscribeToTopic(client, device.statusTopic, { qos: 1 });

    return await new Promise<DeviceStatus | null>((resolve) => {
      const timeout = setTimeout(() => {
        cleanup();
        resolve(null);
      }, STATUS_TIMEOUT_MS);

      const onMessage = (receivedTopic: string, payload: Buffer) => {
        if (receivedTopic !== device.statusTopic) {
          return;
        }

        const nextStatus = parseStatusMessage(payload.toString("utf8"), device.deviceId);

        if (!nextStatus) {
          return;
        }

        cleanup();
        resolve(withRecordedLastSeen(nextStatus));
      };

      const cleanup = () => {
        clearTimeout(timeout);
        client.off("message", onMessage);
      };

      client.on("message", onMessage);
    });
  } finally {
    await closeMqttClient(client);
  }
}

export async function persistReportedFirmwareVersion(
  status: Pick<DeviceStatus, "deviceId" | "firmwareVersion">,
): Promise<void> {
  const firmwareVersion = status.firmwareVersion?.trim();
  const db = getDb();

  if (!firmwareVersion || !isDatabaseConfigured() || !db) {
    return;
  }

  try {
    await db.device.updateMany({
      where: {
        deviceId: status.deviceId,
      },
      data: {
        firmwareVersion,
      },
    });
  } catch (error) {
    console.error("Unable to persist reported firmware version:", error);
  }
}

export async function getDeviceStatusSnapshot(
  device: Pick<RegisteredDevice, "deviceId" | "statusTopic">,
): Promise<DeviceStatus> {
  const status = await readLatestDeviceStatus(device);

  if (status) {
    await persistReportedFirmwareVersion(status);
    return status;
  }

  return {
    ...createDefaultDeviceStatus(device.deviceId),
    lastSeenAt: getRecordedLastSeenAt(device.deviceId),
  };
}
