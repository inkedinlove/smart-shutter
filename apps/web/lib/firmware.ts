export const DEVICE_UPDATE_EVENT_STATUS_VALUES = [
  "check_started",
  "manifest_requested",
  "update_available",
  "update_not_available",
  "update_blocked_motor_moving",
  "update_blocked_ota_disabled",
  "update_started",
  "update_success",
  "update_failed",
] as const;

export type DeviceUpdateEventStatus =
  (typeof DEVICE_UPDATE_EVENT_STATUS_VALUES)[number];

export type FirmwareReleaseRecord = {
  version: string;
  channel: string;
  board: string;
  artifactUrl: string;
  sha256: string;
  sizeBytes: number | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
};

export type FirmwareReleaseInput = {
  version: string;
  channel?: string;
  board?: string;
  artifactUrl: string;
  sha256: string;
  sizeBytes?: number | null;
  notes?: string | null;
  isActive?: boolean;
};

export type FirmwareCheckResponse = {
  deviceId: string;
  currentVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
  board: string | null;
  channel: string;
  autoUpdateEnabled: boolean;
  autoUpdateChannel: string;
  releaseNotes: string | null;
  artifactUrl: string | null;
  sha256: string | null;
  sizeBytes: number | null;
};

export type FirmwareManifestResponse = {
  deviceId: string;
  updateAvailable: boolean;
  currentVersion: string | null;
  latestVersion: string | null;
  board: string | null;
  channel: string;
  autoUpdateEnabled: boolean;
  autoUpdateChannel: string;
  artifactUrl: string | null;
  sha256: string | null;
  sizeBytes: number | null;
};

export type FirmwareAutoUpdatePreference = {
  deviceId: string;
  autoUpdateEnabled: boolean;
  autoUpdateChannel: string;
};

export function isDeviceUpdateEventStatus(
  value: unknown,
): value is DeviceUpdateEventStatus {
  return (
    typeof value === "string" &&
    DEVICE_UPDATE_EVENT_STATUS_VALUES.includes(
      value as DeviceUpdateEventStatus,
    )
  );
}
