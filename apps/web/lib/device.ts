import {
  DEVICE_BOARD_VALUES,
  formatDeviceBoardLabel,
  normalizeDeviceBoardValue,
  type DeviceBoard,
} from "@/lib/devices";

export const DEVICE_MODE_VALUES = [
  "BOOTING",
  "WIFI_CONNECTING",
  "MQTT_CONNECTING",
  "READY",
  "MOVING",
  "ERROR",
] as const;

export type DeviceMode = (typeof DEVICE_MODE_VALUES)[number];

export const OTA_STATE_VALUES = [
  "IDLE",
  "DISABLED",
  "CHECKING_MANIFEST",
  "UPDATE_AVAILABLE",
  "DOWNLOADING",
  "VERIFYING_HASH",
  "INSTALLING",
  "REBOOTING",
  "FAILED",
  "SUCCESS_PENDING_REBOOT",
] as const;

export type OtaState = (typeof OTA_STATE_VALUES)[number];

export const DEVICE_CLAIM_STATE_VALUES = [
  "unknown",
  "unclaimed",
  "claimed",
] as const;

export type DeviceClaimState = (typeof DEVICE_CLAIM_STATE_VALUES)[number];
export const DEVICE_ACTUATOR_TYPE_VALUES = ["stepper", "servo"] as const;
export type DeviceActuatorType = (typeof DEVICE_ACTUATOR_TYPE_VALUES)[number];

export const DEFAULT_NUDGE_AMOUNT = 2;
export const MAX_NUDGE_AMOUNT = 100;
export const DEFAULT_SAFE_ALLOWED_MAX_PERCENT_STEP = 10;

export type DeviceCommand =
  | {
      deviceId: string;
      commandId: string;
      type: "SET_PERCENT";
      value: number;
      issuedAt: string;
      source: "web";
    }
  | {
      deviceId: string;
      commandId: string;
      type: "STOP";
      issuedAt: string;
      source: "web";
    }
  | {
      deviceId: string;
      commandId: string;
      type: "CHECK_UPDATE";
      issuedAt: string;
      source: "web";
    }
  | {
      deviceId: string;
      commandId: string;
      type: "NUDGE_OPEN" | "NUDGE_CLOSE";
      amount: number;
      issuedAt: string;
      source: "web";
    }
  | {
      deviceId: string;
      commandId: string;
      type:
        | "SET_CURRENT_AS_CLOSED"
        | "SET_CURRENT_AS_OPEN"
        | "SET_DIRECTION_NORMAL"
        | "SET_DIRECTION_REVERSED"
        | "MARK_CALIBRATION_COMPLETE"
        | "LOCK_MOVEMENT"
        | "UNLOCK_MOVEMENT";
      issuedAt: string;
      source: "web";
    };

export type DeviceCommandInput =
  | {
      deviceId: string;
      type: "SET_PERCENT";
      value: number;
    }
  | {
      deviceId: string;
      type: "STOP";
    }
  | {
      deviceId: string;
      type: "CHECK_UPDATE";
    }
  | {
      deviceId: string;
      type: "NUDGE_OPEN" | "NUDGE_CLOSE";
      amount: number;
    }
  | {
      deviceId: string;
      type:
        | "SET_CURRENT_AS_CLOSED"
        | "SET_CURRENT_AS_OPEN"
        | "SET_DIRECTION_NORMAL"
        | "SET_DIRECTION_REVERSED"
        | "MARK_CALIBRATION_COMPLETE"
        | "LOCK_MOVEMENT"
        | "UNLOCK_MOVEMENT";
    };

export type DeviceStatus = {
  deviceId: string;
  resolvedDeviceId: string;
  claimState: DeviceClaimState;
  online: boolean;
  moving: boolean;
  deviceMode: DeviceMode;
  estimatedPercent: number | null;
  targetPercent: number | null;
  lastSeenAt: string | null;
  firmwareVersion?: string;
  deviceUptimeMs?: number;
  rssi?: number;
  setupMode?: boolean;
  wifiConnected?: boolean;
  mqttConnected?: boolean;
  otaEnabled?: boolean;
  otaAutoUpdateEnabled?: boolean;
  otaAutoUpdateChannel?: string;
  otaState?: OtaState;
  otaLastError?: string;
  otaTargetVersion?: string;
  calibrationComplete?: boolean;
  fullTravelReady?: boolean;
  directionInverted?: boolean;
  safetyMode?: boolean;
  allowedMaxPercentStep?: number;
  lastCalibrationAction?: string;
  movementLockedReason?: string;
  reportedBoard?: DeviceBoard;
  actuatorType?: DeviceActuatorType;
  reportedCapabilities?: string[];
};

export type DeviceDiagnostics = {
  deviceId: string;
  claimState: DeviceClaimState;
  registeredBoard: DeviceBoard | null;
  reportedBoard: DeviceBoard | null;
  actuatorType: DeviceActuatorType | null;
  reportedCapabilities: string[];
  compatibilityWarning: string | null;
  online: boolean;
  lastSeenAt: string | null;
  firmwareVersion: string | null;
  setupMode: boolean | null;
  safetyMode: boolean | null;
  calibrationComplete: boolean | null;
  otaState: OtaState | null;
  otaLastError: string | null;
  wifiConnected: boolean | null;
  mqttConnected: boolean | null;
  rssi: number | null;
  deviceUptimeMs: number | null;
};

export function isDeviceMode(value: unknown): value is DeviceMode {
  return (
    typeof value === "string" &&
    DEVICE_MODE_VALUES.includes(value as DeviceMode)
  );
}

export function isOtaState(value: unknown): value is OtaState {
  return typeof value === "string" && OTA_STATE_VALUES.includes(value as OtaState);
}

export function isDeviceClaimState(value: unknown): value is DeviceClaimState {
  return (
    typeof value === "string" &&
    DEVICE_CLAIM_STATE_VALUES.includes(value as DeviceClaimState)
  );
}

export function isDeviceActuatorType(value: unknown): value is DeviceActuatorType {
  return (
    typeof value === "string" &&
    DEVICE_ACTUATOR_TYPE_VALUES.includes(value as DeviceActuatorType)
  );
}

export function normalizeReportedBoardValue(
  value: unknown,
): DeviceBoard | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim().toLowerCase();

  if (!DEVICE_BOARD_VALUES.includes(normalizedValue as DeviceBoard)) {
    return undefined;
  }

  return normalizedValue as DeviceBoard;
}

export function getExpectedActuatorTypeForBoard(
  board: string | null | undefined,
): DeviceActuatorType | null {
  if (!board || board.trim().length === 0) {
    return null;
  }

  return normalizeDeviceBoardValue(board) === "esp8266-servo"
    ? "servo"
    : "stepper";
}

export function formatDeviceActuatorType(
  value: DeviceActuatorType | null | undefined,
): string {
  if (!value) {
    return "Unknown";
  }

  return value === "servo" ? "Servo" : "Stepper";
}

export function formatReportedCapabilities(
  capabilities: string[] | null | undefined,
): string {
  if (!capabilities || capabilities.length === 0) {
    return "Unknown";
  }

  return capabilities
    .map((capability) =>
      capability
        .trim()
        .toLowerCase()
        .split(/[_-\s]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" "),
    )
    .join(", ");
}

export function getDeviceCompatibilityWarning(
  registeredBoard: string | null | undefined,
  status: Pick<DeviceStatus, "reportedBoard" | "actuatorType"> | null | undefined,
): string | null {
  if (!registeredBoard || registeredBoard.trim().length === 0 || !status) {
    return null;
  }

  const normalizedRegisteredBoard = normalizeDeviceBoardValue(registeredBoard);
  const expectedBoardLabel = formatDeviceBoardLabel(normalizedRegisteredBoard);
  const reportedBoard = status.reportedBoard;

  if (reportedBoard && reportedBoard !== normalizedRegisteredBoard) {
    return `Registered as ${expectedBoardLabel}, but firmware reports ${formatDeviceBoardLabel(
      reportedBoard,
    )}. Flash the matching package before testing movement.`;
  }

  const expectedActuatorType =
    getExpectedActuatorTypeForBoard(normalizedRegisteredBoard);
  const reportedActuatorType = status.actuatorType ?? null;

  if (
    expectedActuatorType &&
    reportedActuatorType &&
    expectedActuatorType !== reportedActuatorType
  ) {
    return `Registered as ${expectedBoardLabel}, but firmware reports a ${formatDeviceActuatorType(
      reportedActuatorType,
    ).toLowerCase()} actuator. Flash the matching package before testing movement.`;
  }

  return null;
}

export function createDefaultDeviceStatus(
  deviceId: string,
  overrides?: Partial<
    Pick<
      DeviceStatus,
      | "resolvedDeviceId"
      | "claimState"
      | "setupMode"
      | "wifiConnected"
      | "mqttConnected"
      | "reportedBoard"
      | "actuatorType"
      | "reportedCapabilities"
    >
  >,
): DeviceStatus {
  return {
    deviceId,
    resolvedDeviceId: overrides?.resolvedDeviceId ?? deviceId,
    claimState: overrides?.claimState ?? "unknown",
    online: false,
    moving: false,
    deviceMode: "ERROR",
    estimatedPercent: null,
    targetPercent: null,
    lastSeenAt: null,
    firmwareVersion: undefined,
    deviceUptimeMs: undefined,
    rssi: undefined,
    setupMode: overrides?.setupMode,
    wifiConnected: overrides?.wifiConnected,
    mqttConnected: overrides?.mqttConnected,
    otaEnabled: undefined,
    otaAutoUpdateEnabled: undefined,
    otaAutoUpdateChannel: undefined,
    otaState: undefined,
    otaLastError: undefined,
    otaTargetVersion: undefined,
    calibrationComplete: undefined,
    fullTravelReady: undefined,
    directionInverted: undefined,
    safetyMode: undefined,
    allowedMaxPercentStep: undefined,
    lastCalibrationAction: undefined,
    movementLockedReason: undefined,
    reportedBoard: overrides?.reportedBoard,
    actuatorType: overrides?.actuatorType,
    reportedCapabilities: overrides?.reportedCapabilities,
  };
}

export function createDeviceDiagnostics(
  registeredBoard: DeviceBoard | null,
  deviceId: string,
  claimState: DeviceClaimState,
  status: DeviceStatus | null,
): DeviceDiagnostics {
  const compatibilityWarning = getDeviceCompatibilityWarning(
    registeredBoard,
    status,
  );

  return {
    deviceId,
    claimState,
    registeredBoard,
    reportedBoard: status?.reportedBoard ?? null,
    actuatorType: status?.actuatorType ?? null,
    reportedCapabilities: status?.reportedCapabilities ?? [],
    compatibilityWarning,
    online: status?.online ?? false,
    lastSeenAt: status?.lastSeenAt ?? null,
    firmwareVersion: status?.firmwareVersion ?? null,
    setupMode: status?.setupMode ?? null,
    safetyMode: status?.safetyMode ?? null,
    calibrationComplete: status?.calibrationComplete ?? null,
    otaState:
      status?.otaState ?? (status?.otaEnabled === false ? "DISABLED" : null),
    otaLastError: status?.otaLastError ?? null,
    wifiConnected: status?.wifiConnected ?? null,
    mqttConnected: status?.mqttConnected ?? null,
    rssi: status?.rssi ?? null,
    deviceUptimeMs: status?.deviceUptimeMs ?? null,
  };
}

export function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}
