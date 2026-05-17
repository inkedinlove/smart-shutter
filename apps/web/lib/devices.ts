import devicesRegistry from "@/devices/devices.json";
import { getDefaultFirmwareVersion } from "@/lib/firmware-versioning";

export type BrokerProfile = "hivemq-dev";
export const DEVICE_BOARD_VALUES = [
  "esp32",
  "esp8266",
  "esp8266-d1d4",
  "esp8266-servo",
] as const;
export type DeviceBoard = (typeof DEVICE_BOARD_VALUES)[number];

export type DeviceBoardFamily = "esp32" | "esp8266";

export function normalizeDeviceBoardValue(value: string): DeviceBoard {
  const normalizedValue = value.trim().toLowerCase();

  if (DEVICE_BOARD_VALUES.includes(normalizedValue as DeviceBoard)) {
    return normalizedValue as DeviceBoard;
  }

  return "esp32";
}

export function getDeviceBoardFamily(board: string): DeviceBoardFamily {
  const normalizedBoard = normalizeDeviceBoardValue(board);
  return normalizedBoard.startsWith("esp8266") ? "esp8266" : "esp32";
}

export function isEsp8266Board(board: string | null | undefined): boolean {
  if (!board) {
    return false;
  }

  return getDeviceBoardFamily(board) === "esp8266";
}

export function formatDeviceBoardLabel(
  board: string | null | undefined,
): string {
  if (!board) {
    return "ESP32";
  }

  const normalizedBoard = normalizeDeviceBoardValue(board);

  if (normalizedBoard === "esp8266-d1d4") {
    return "ESP8266 D1-D4 Stepper";
  }

  if (normalizedBoard === "esp8266-servo") {
    return "ESP8266 Servo";
  }

  return normalizedBoard === "esp8266" ? "ESP8266" : "ESP32";
}

export type ProfileSummary = {
  profileId: string;
  displayName: string;
  email: string | null;
};

export type RegisteredDevice = {
  deviceId: string;
  label: string;
  board: DeviceBoard;
  status: string;
  firmwareVersion: string | null;
  commandTopic: string;
  statusTopic: string;
  brokerProfile: BrokerProfile;
  otaAutoUpdateEnabled: boolean;
  otaAutoUpdateChannel: string;
  ownerProfileId?: string | null;
  ownerProfile?: ProfileSummary | null;
  createdAt: string;
};

export type PublicBrokerConnection = {
  mqttHost: string;
  mqttPort: number;
  publicAppBaseUrl: string;
};

export type DeviceProvisioningData = {
  deviceId: string;
  board: DeviceBoard;
  commandTopic: string;
  statusTopic: string;
  mqttHost: string;
  mqttPort: number;
  firmwareDefinesPreview: string;
};

type DeviceRegistry = {
  defaultDeviceId: string;
  devices: RegisteredDevice[];
};

const registry = devicesRegistry as DeviceRegistry;

function normalizeRegisteredDevice(device: RegisteredDevice): RegisteredDevice {
  return {
    ...device,
    otaAutoUpdateEnabled: device.otaAutoUpdateEnabled ?? false,
    otaAutoUpdateChannel:
      typeof device.otaAutoUpdateChannel === "string" &&
      device.otaAutoUpdateChannel.trim().length > 0
        ? device.otaAutoUpdateChannel.trim()
        : "stable",
  };
}

const REGISTERED_DEVICES = registry.devices.map((device) =>
  normalizeRegisteredDevice(device as RegisteredDevice),
);

export function listStaticRegisteredDevices(): RegisteredDevice[] {
  return REGISTERED_DEVICES;
}

export function listRegisteredDevices(): RegisteredDevice[] {
  return listStaticRegisteredDevices();
}

export function getStaticDeviceById(
  deviceId: string,
): RegisteredDevice | undefined {
  return REGISTERED_DEVICES.find((device) => device.deviceId === deviceId);
}

export function getDeviceById(deviceId: string): RegisteredDevice | undefined {
  return getStaticDeviceById(deviceId);
}

export function getStaticDefaultDevice(): RegisteredDevice {
  return getStaticDeviceById(registry.defaultDeviceId) ?? REGISTERED_DEVICES[0];
}

export function getDefaultDevice(): RegisteredDevice {
  return getStaticDefaultDevice();
}

export function getDefaultDeviceId(): string {
  return getStaticDefaultDevice().deviceId;
}

export function createFirmwareDefinesPreview(
  device: RegisteredDevice,
  broker: PublicBrokerConnection,
): string {
  const otaEnabled =
    device.board === "esp32" || device.board === "esp8266-d1d4";
  const sosEnabled = device.board === "esp32";

  return [
    `// Board: ${formatDeviceBoardLabel(device.board)}`,
    `#define DEVICE_ID "${device.deviceId}"`,
    `#define FIRMWARE_VERSION "${getDefaultFirmwareVersion(device.board)}"`,
    `#define MQTT_HOST "${broker.mqttHost}"`,
    `#define MQTT_PORT ${broker.mqttPort}`,
    '#define MQTT_USERNAME "PASTE_USERNAME"',
    '#define MQTT_PASSWORD "PASTE_PASSWORD"',
    `#define MQTT_CLIENT_ID "smart-shutter-${device.deviceId}"`,
    `#define COMMAND_TOPIC "${device.commandTopic}"`,
    `#define STATUS_TOPIC "${device.statusTopic}"`,
    `#define ENABLE_OTA_UPDATES ${otaEnabled ? "true" : "false"}`,
    `#define API_BASE_URL "${broker.publicAppBaseUrl}"`,
    '#define OTA_MANIFEST_PATH_TEMPLATE "/api/devices/{deviceId}/firmware/manifest"',
    '#define OTA_EVENTS_PATH_TEMPLATE "/api/devices/{deviceId}/firmware/events"',
    ...(otaEnabled
      ? [
          "#define OTA_AUTO_CHECK_INITIAL_DELAY_MS 300000UL",
          "#define OTA_AUTO_CHECK_INTERVAL_MS 21600000UL",
          "#define OTA_AUTO_CHECK_JITTER_MS 900000UL",
        ]
      : []),
    ...(sosEnabled
      ? [
          "#define ENABLE_SOS_MODE true",
          "#define SOS_SHORT_PULSE_PERCENT 25",
          "#define SOS_LONG_PULSE_PERCENT 50",
          "#define SOS_PULSE_GAP_MS 180UL",
          "#define SOS_LETTER_GAP_MS 420UL",
          "#define SOS_WORD_GAP_MS 900UL",
          "#define SOS_MOTOR_MAX_SPEED 1400.0f",
          "#define SOS_MOTOR_ACCELERATION 800.0f",
        ]
      : []),
  ].join("\n");
}

export function createProvisioningData(
  device: RegisteredDevice,
  broker: PublicBrokerConnection,
): DeviceProvisioningData {
  return {
    deviceId: device.deviceId,
    board: device.board,
    commandTopic: device.commandTopic,
    statusTopic: device.statusTopic,
    mqttHost: broker.mqttHost,
    mqttPort: broker.mqttPort,
    firmwareDefinesPreview: createFirmwareDefinesPreview(device, broker),
  };
}
