import devicesRegistry from "@/devices/devices.json";

export type BrokerProfile = "hivemq-dev";
export const DEVICE_BOARD_VALUES = ["esp32", "esp8266"] as const;
export type DeviceBoard = (typeof DEVICE_BOARD_VALUES)[number];

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

const DEFAULT_FIRMWARE_VERSION = "0.1.0-dev";

type DeviceRegistry = {
  defaultDeviceId: string;
  devices: RegisteredDevice[];
};

const registry = devicesRegistry as DeviceRegistry;
const REGISTERED_DEVICES = registry.devices;

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
  return [
    `// Board: ${device.board}`,
    `#define DEVICE_ID "${device.deviceId}"`,
    `#define FIRMWARE_VERSION "${DEFAULT_FIRMWARE_VERSION}"`,
    `#define MQTT_HOST "${broker.mqttHost}"`,
    `#define MQTT_PORT ${broker.mqttPort}`,
    '#define MQTT_USERNAME "PASTE_USERNAME"',
    '#define MQTT_PASSWORD "PASTE_PASSWORD"',
    `#define MQTT_CLIENT_ID "smart-shutter-${device.deviceId}"`,
    `#define COMMAND_TOPIC "${device.commandTopic}"`,
    `#define STATUS_TOPIC "${device.statusTopic}"`,
    "#define ENABLE_OTA_UPDATES false",
    `#define API_BASE_URL "${broker.publicAppBaseUrl}"`,
    '#define OTA_MANIFEST_PATH_TEMPLATE "/api/devices/{deviceId}/firmware/manifest"',
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
