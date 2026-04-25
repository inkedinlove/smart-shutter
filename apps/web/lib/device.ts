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

export const DEFAULT_NUDGE_AMOUNT = 2;
export const MAX_NUDGE_AMOUNT = 10;
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
  otaState?: OtaState;
  otaLastError?: string;
  otaTargetVersion?: string;
  calibrationComplete?: boolean;
  safetyMode?: boolean;
  allowedMaxPercentStep?: number;
  lastCalibrationAction?: string;
  movementLockedReason?: string;
};

export type DeviceDiagnostics = {
  deviceId: string;
  claimState: DeviceClaimState;
  online: boolean;
  lastSeenAt: string | null;
  firmwareVersion: string | null;
  setupMode: boolean | null;
  safetyMode: boolean | null;
  calibrationComplete: boolean | null;
  otaState: OtaState | null;
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

export function createDefaultDeviceStatus(
  deviceId: string,
  overrides?: Partial<
    Pick<
      DeviceStatus,
      "resolvedDeviceId" | "claimState" | "setupMode" | "wifiConnected" | "mqttConnected"
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
    otaState: undefined,
    otaLastError: undefined,
    otaTargetVersion: undefined,
    calibrationComplete: undefined,
    safetyMode: undefined,
    allowedMaxPercentStep: undefined,
    lastCalibrationAction: undefined,
    movementLockedReason: undefined,
  };
}

export function createDeviceDiagnostics(
  deviceId: string,
  claimState: DeviceClaimState,
  status: DeviceStatus | null,
): DeviceDiagnostics {
  return {
    deviceId,
    claimState,
    online: status?.online ?? false,
    lastSeenAt: status?.lastSeenAt ?? null,
    firmwareVersion: status?.firmwareVersion ?? null,
    setupMode: status?.setupMode ?? null,
    safetyMode: status?.safetyMode ?? null,
    calibrationComplete: status?.calibrationComplete ?? null,
    otaState:
      status?.otaState ?? (status?.otaEnabled === false ? "DISABLED" : null),
    wifiConnected: status?.wifiConnected ?? null,
    mqttConnected: status?.mqttConnected ?? null,
    rssi: status?.rssi ?? null,
    deviceUptimeMs: status?.deviceUptimeMs ?? null,
  };
}

export function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}
