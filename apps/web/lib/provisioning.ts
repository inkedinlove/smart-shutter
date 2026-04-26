import type { DeviceBoard, RegisteredDevice } from "@/lib/devices";

export type ProvisioningWifiMode = "factory" | "preconfigured";

type ProvisionedConfigInput = {
  board: DeviceBoard;
  deviceId: string;
  commandTopic: string;
  statusTopic: string;
  mqttHost: string;
  mqttPort: number;
  mqttUsername: string;
  mqttPassword: string;
  publicAppBaseUrl: string;
  wifiMode: ProvisioningWifiMode;
  wifiSsid: string;
  wifiPassword: string;
};

export type ProvisioningDownloadInfo = {
  boardLabel: string;
  downloadPath: string;
  ideBoard: string;
  mainSketchFile: string;
  sketchDirName: string;
};

const DEFAULT_ESP32_FIRMWARE_VERSION = "0.1.0-dev";
const DEFAULT_ESP8266_FIRMWARE_VERSION = "0.1.0-dev-esp8266";

function toCString(value: string): string {
  return JSON.stringify(value);
}

function buildMqttClientId(deviceId: string): string {
  return `smart-shutter-${deviceId}`;
}

export function getProvisioningDownloadInfo(
  board: DeviceBoard,
): ProvisioningDownloadInfo {
  if (board === "esp8266") {
    return {
      boardLabel: "ESP8266",
      downloadPath: "/downloads/smart-shutter-esp8266-sketch.zip",
      ideBoard: "NodeMCU 1.0 (ESP-12E Module)",
      mainSketchFile: "esp8266-shutter.ino",
      sketchDirName: "esp8266-shutter",
    };
  }

  return {
    boardLabel: "ESP32",
    downloadPath: "/downloads/smart-shutter-esp32-sketch.zip",
    ideBoard: "ESP32 Dev Module",
    mainSketchFile: "esp32-shutter.ino",
    sketchDirName: "esp32-shutter",
  };
}

export function buildProvisioningPackageFileName(
  deviceId: string,
  board: DeviceBoard,
): string {
  const downloadInfo = getProvisioningDownloadInfo(board);
  return `smart-shutter-${deviceId}-${downloadInfo.sketchDirName}.zip`;
}

export function normalizeProvisioningWifiInput(input: {
  wifiMode?: unknown;
  wifiSsid?: unknown;
  wifiPassword?: unknown;
}): {
  wifiMode: ProvisioningWifiMode;
  wifiSsid: string;
  wifiPassword: string;
} {
  const wifiMode =
    input.wifiMode === "preconfigured" ? "preconfigured" : "factory";
  const wifiSsid = typeof input.wifiSsid === "string" ? input.wifiSsid.trim() : "";
  const wifiPassword =
    typeof input.wifiPassword === "string" ? input.wifiPassword : "";

  if (wifiMode === "preconfigured" && !wifiSsid) {
    throw new Error("WiFi SSID is required when preloading WiFi.");
  }

  return {
    wifiMode,
    wifiSsid: wifiMode === "preconfigured" ? wifiSsid : "",
    wifiPassword: wifiMode === "preconfigured" ? wifiPassword : "",
  };
}

function buildEsp8266Config(input: ProvisionedConfigInput): string {
  const wifiSsid = input.wifiMode === "preconfigured" ? input.wifiSsid : "";
  const wifiPassword =
    input.wifiMode === "preconfigured" ? input.wifiPassword : "";

  return `#pragma once

// ---------------------------------------------------------------------------
// WiFi and MQTT Credentials
// ---------------------------------------------------------------------------

// Leave WiFi blank to use factory setup mode with a local setup AP and portal.
constexpr const char* WIFI_SSID = ${toCString(wifiSsid)};
constexpr const char* WIFI_PASSWORD = ${toCString(wifiPassword)};

constexpr const char* MQTT_HOST = ${toCString(input.mqttHost)};
constexpr int MQTT_PORT = ${input.mqttPort};
constexpr const char* MQTT_USERNAME = ${toCString(input.mqttUsername)};
constexpr const char* MQTT_PASSWORD = ${toCString(input.mqttPassword)};
constexpr const char* MQTT_CLIENT_ID = ${toCString(buildMqttClientId(input.deviceId))};

// Device identity and topics provisioned from Smart Shutter.
constexpr const char* DEVICE_ID = ${toCString(input.deviceId)};
#define FIRMWARE_VERSION "${DEFAULT_ESP8266_FIRMWARE_VERSION}"
constexpr const char* COMMAND_TOPIC = ${toCString(input.commandTopic)};
constexpr const char* STATUS_TOPIC = ${toCString(input.statusTopic)};

// ---------------------------------------------------------------------------
// Factory Setup Mode
// ---------------------------------------------------------------------------

#define ENABLE_FACTORY_SETUP_MODE true
#define SETUP_AP_SSID_PREFIX "SmartShutter-"
#define SETUP_AP_PASSWORD ""
#define SETUP_PORTAL_TIMEOUT_MS 300000

// ---------------------------------------------------------------------------
// OTA Update Settings
// ---------------------------------------------------------------------------

#define ENABLE_OTA_UPDATES false
#define API_BASE_URL ${toCString(input.publicAppBaseUrl)}
#define OTA_MANIFEST_PATH_TEMPLATE "/api/devices/{deviceId}/firmware/manifest"

// ---------------------------------------------------------------------------
// Optional Behavior Flags
// ---------------------------------------------------------------------------

#define ENABLE_LOCAL_FALLBACK_WEB false
#define SAFE_SETUP_MODE true
#define INVERT_DIRECTION false

// ---------------------------------------------------------------------------
// Motor Wiring and Motion Tuning
// ---------------------------------------------------------------------------

// Default pin map for NodeMCU-style ESP8266 boards:
// D1=GPIO5, D2=GPIO4, D5=GPIO14, D6=GPIO12
constexpr int IN1 = 5;
constexpr int IN2 = 4;
constexpr int IN3 = 14;
constexpr int IN4 = 12;

constexpr long TRAVEL_STEPS = 2048;
constexpr float MOTOR_MAX_SPEED = 520.0f;
constexpr float MOTOR_ACCELERATION = 220.0f;

#define SAFE_ALLOWED_MAX_PERCENT_STEP 10
#define SAFE_DEFAULT_NUDGE_PERCENT 2
#define SAFE_MOTOR_MAX_SPEED 180.0f
#define SAFE_MOTOR_ACCELERATION 90.0f

// ---------------------------------------------------------------------------
// Retry and Status Timing
// ---------------------------------------------------------------------------

constexpr unsigned long STATUS_INTERVAL_MS = 3000;
constexpr unsigned long WIFI_CONNECT_TIMEOUT_MS = 15000;
constexpr unsigned long WIFI_RETRY_MS = 5000;
constexpr unsigned long MQTT_RETRY_MS = 5000;
`;
}

function buildEsp32Config(input: ProvisionedConfigInput): string {
  const wifiSsid = input.wifiMode === "preconfigured" ? input.wifiSsid : "";
  const wifiPassword =
    input.wifiMode === "preconfigured" ? input.wifiPassword : "";

  return `#pragma once

// ---------------------------------------------------------------------------
// WiFi and MQTT Credentials
// ---------------------------------------------------------------------------

// Leave WiFi blank to use factory setup mode with a local setup AP and portal.
constexpr const char* WIFI_SSID = ${toCString(wifiSsid)};
constexpr const char* WIFI_PASSWORD = ${toCString(wifiPassword)};

constexpr const char* MQTT_HOST = ${toCString(input.mqttHost)};
constexpr int MQTT_PORT = ${input.mqttPort};
constexpr const char* MQTT_USERNAME = ${toCString(input.mqttUsername)};
constexpr const char* MQTT_PASSWORD = ${toCString(input.mqttPassword)};
constexpr const char* MQTT_CLIENT_ID = ${toCString(buildMqttClientId(input.deviceId))};

// Device identity and topics provisioned from Smart Shutter.
constexpr const char* DEVICE_ID = ${toCString(input.deviceId)};
#define FIRMWARE_VERSION "${DEFAULT_ESP32_FIRMWARE_VERSION}"
constexpr const char* COMMAND_TOPIC = ${toCString(input.commandTopic)};
constexpr const char* STATUS_TOPIC = ${toCString(input.statusTopic)};

// ---------------------------------------------------------------------------
// Factory Setup Mode
// ---------------------------------------------------------------------------

#define ENABLE_FACTORY_SETUP_MODE true
#define SETUP_AP_SSID_PREFIX "SmartShutter-"
#define SETUP_AP_PASSWORD ""
#define SETUP_PORTAL_TIMEOUT_MS 300000

// ---------------------------------------------------------------------------
// OTA Update Settings
// ---------------------------------------------------------------------------

#define ENABLE_OTA_UPDATES false
#define API_BASE_URL ${toCString(input.publicAppBaseUrl)}
#define OTA_MANIFEST_PATH_TEMPLATE "/api/devices/{deviceId}/firmware/manifest"

// ---------------------------------------------------------------------------
// Optional Behavior Flags
// ---------------------------------------------------------------------------

#define ENABLE_LOCAL_FALLBACK_WEB false
#define SAFE_SETUP_MODE true
#define INVERT_DIRECTION false

// ---------------------------------------------------------------------------
// Motor Wiring and Motion Tuning
// ---------------------------------------------------------------------------

constexpr int IN1 = 14;
constexpr int IN2 = 27;
constexpr int IN3 = 26;
constexpr int IN4 = 25;

constexpr long TRAVEL_STEPS = 2048;
constexpr float MOTOR_MAX_SPEED = 700.0f;
constexpr float MOTOR_ACCELERATION = 350.0f;

#define SAFE_ALLOWED_MAX_PERCENT_STEP 10
#define SAFE_DEFAULT_NUDGE_PERCENT 2
#define SAFE_MOTOR_MAX_SPEED 220.0f
#define SAFE_MOTOR_ACCELERATION 110.0f

// ---------------------------------------------------------------------------
// Retry and Status Timing
// ---------------------------------------------------------------------------

constexpr unsigned long STATUS_INTERVAL_MS = 3000;
constexpr unsigned long WIFI_CONNECT_TIMEOUT_MS = 15000;
constexpr unsigned long WIFI_RETRY_MS = 5000;
constexpr unsigned long MQTT_RETRY_MS = 5000;
constexpr unsigned long LOCAL_FALLBACK_AP_DELAY_MS = 20000;

// ---------------------------------------------------------------------------
// Local Fallback Access Point
// ---------------------------------------------------------------------------

constexpr const char* LOCAL_FALLBACK_AP_SSID = "SmartShutterSetup";
constexpr const char* LOCAL_FALLBACK_AP_PASSWORD = "change-me";
`;
}

export function buildProvisionedConfig(
  input: ProvisionedConfigInput,
): string {
  if (input.board === "esp8266") {
    return buildEsp8266Config(input);
  }

  return buildEsp32Config(input);
}

export function buildProvisioningSummary(input: {
  device: RegisteredDevice;
  wifiMode: ProvisioningWifiMode;
  wifiSsid: string;
}): string {
  const downloadInfo = getProvisioningDownloadInfo(input.device.board);
  const wifiSummary =
    input.wifiMode === "preconfigured"
      ? `Preloaded WiFi: ${input.wifiSsid}`
      : "WiFi left blank for SmartShutter setup AP mode";

  return [
    `Device: ${input.device.label}`,
    `Device ID: ${input.device.deviceId}`,
    `Board: ${downloadInfo.boardLabel}`,
    `Sketch ZIP: ${downloadInfo.downloadPath}`,
    `Main sketch file: ${downloadInfo.mainSketchFile}`,
    `Recommended IDE board: ${downloadInfo.ideBoard}`,
    `Command topic: ${input.device.commandTopic}`,
    `Status topic: ${input.device.statusTopic}`,
    wifiSummary,
  ].join("\n");
}

export function buildProvisioningPackageReadme(input: {
  device: RegisteredDevice;
  wifiMode: ProvisioningWifiMode;
  wifiSsid: string;
}): string {
  const downloadInfo = getProvisioningDownloadInfo(input.device.board);
  const wifiInstructions =
    input.wifiMode === "preconfigured"
      ? [
          `WiFi is preloaded for SSID: ${input.wifiSsid}`,
          "After upload, open Serial Monitor at 115200 and wait for MQTT connected.",
        ]
      : [
          "WiFi is intentionally blank.",
          "After upload, the board should start SmartShutter-XXXXXX setup mode so the installer can enter home WiFi later.",
        ];

  return [
    "Smart Shutter Ready-to-Flash Package",
    "",
    `Device: ${input.device.label}`,
    `Device ID: ${input.device.deviceId}`,
    `Board: ${downloadInfo.boardLabel}`,
    `Arduino IDE board: ${downloadInfo.ideBoard}`,
    `Main sketch file: ${downloadInfo.sketchDirName}\\${downloadInfo.mainSketchFile}`,
    "",
    "Package contents:",
    `- ${downloadInfo.sketchDirName}\\${downloadInfo.mainSketchFile}`,
    `- ${downloadInfo.sketchDirName}\\config.example.h`,
    `- ${downloadInfo.sketchDirName}\\config.h`,
    "",
    "Installer steps:",
    "1. Unzip this package.",
    `2. Open ${downloadInfo.mainSketchFile} in Arduino IDE.`,
    `3. Set Tools -> Board to ${downloadInfo.ideBoard}.`,
    "4. Choose the correct COM port.",
    "5. Click Upload.",
    "6. Open Serial Monitor at 115200 after flashing.",
    ...wifiInstructions,
    "7. Return to /connect on Smart Shutter after the board is online.",
    "",
    `Command topic: ${input.device.commandTopic}`,
    `Status topic: ${input.device.statusTopic}`,
  ].join("\n");
}
