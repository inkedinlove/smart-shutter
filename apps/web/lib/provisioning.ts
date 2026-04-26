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
const DEFAULT_ESP8266_D1D4_FIRMWARE_VERSION = "0.1.0-dev-esp8266-d1d4";
const DEFAULT_ESP8266_SERVO_FIRMWARE_VERSION = "0.1.0-dev-esp8266-servo";

function toCString(value: string): string {
  return JSON.stringify(value);
}

function buildMqttClientId(deviceId: string): string {
  return `smart-shutter-${deviceId}`;
}

export function getProvisioningDownloadInfo(
  board: DeviceBoard,
): ProvisioningDownloadInfo {
  if (board === "esp8266-d1d4") {
    return {
      boardLabel: "ESP8266 D1-D4 Stepper",
      downloadPath: "/downloads/smart-shutter-esp8266-d1d4-sketch.zip",
      ideBoard: "NodeMCU 1.0 (ESP-12E Module)",
      mainSketchFile: "esp8266-d1d4-shutter.ino",
      sketchDirName: "esp8266-d1d4-shutter",
    };
  }

  if (board === "esp8266-servo") {
    return {
      boardLabel: "ESP8266 Servo",
      downloadPath: "/downloads/smart-shutter-esp8266-servo-sketch.zip",
      ideBoard: "NodeMCU 1.0 (ESP-12E Module)",
      mainSketchFile: "esp8266-servo-shutter.ino",
      sketchDirName: "esp8266-servo-shutter",
    };
  }

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
  return buildEsp8266StepperConfig(input, {
    firmwareVersion: DEFAULT_ESP8266_FIRMWARE_VERSION,
    pinComment:
      "// Default pin map for NodeMCU-style ESP8266 boards:\n// D1=GPIO5, D2=GPIO4, D5=GPIO14, D6=GPIO12",
    in1: 5,
    in2: 4,
    in3: 14,
    in4: 12,
    motorMaxSpeed: 520.0,
    motorAcceleration: 220.0,
    safeMotorMaxSpeed: 180.0,
    safeMotorAcceleration: 90.0,
    otaEnabled: false,
  });
}

function buildEsp8266D1D4Config(input: ProvisionedConfigInput): string {
  return buildEsp8266StepperConfig(input, {
    firmwareVersion: DEFAULT_ESP8266_D1D4_FIRMWARE_VERSION,
    pinComment:
      "// Known-good D1/D2/D3/D4 stepper wiring from the working board sketch:\n// D1=GPIO5, D2=GPIO4, D3=GPIO0, D4=GPIO2",
    in1: 5,
    in2: 4,
    in3: 0,
    in4: 2,
    motorMaxSpeed: 360.0,
    motorAcceleration: 140.0,
    safeMotorMaxSpeed: 140.0,
    safeMotorAcceleration: 70.0,
    otaEnabled: true,
  });
}

function buildEsp8266StepperConfig(
  input: ProvisionedConfigInput,
  pinout: {
    firmwareVersion: string;
    pinComment: string;
    in1: number;
    in2: number;
    in3: number;
    in4: number;
    motorMaxSpeed: number;
    motorAcceleration: number;
    safeMotorMaxSpeed: number;
    safeMotorAcceleration: number;
    otaEnabled: boolean;
  },
): string {
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
#define FIRMWARE_VERSION "${pinout.firmwareVersion}"
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

#define ENABLE_OTA_UPDATES ${pinout.otaEnabled ? "true" : "false"}
#define API_BASE_URL ${toCString(input.publicAppBaseUrl)}
#define OTA_MANIFEST_PATH_TEMPLATE "/api/devices/{deviceId}/firmware/manifest"
#define OTA_EVENTS_PATH_TEMPLATE "/api/devices/{deviceId}/firmware/events"
#define OTA_AUTO_CHECK_INITIAL_DELAY_MS 300000UL
#define OTA_AUTO_CHECK_INTERVAL_MS 3600000UL

// ---------------------------------------------------------------------------
// Optional Behavior Flags
// ---------------------------------------------------------------------------

#define ENABLE_LOCAL_FALLBACK_WEB false
#define SAFE_SETUP_MODE true
#define INVERT_DIRECTION false

// ---------------------------------------------------------------------------
// Motor Wiring and Motion Tuning
// ---------------------------------------------------------------------------

${pinout.pinComment}
constexpr int IN1 = ${pinout.in1};
constexpr int IN2 = ${pinout.in2};
constexpr int IN3 = ${pinout.in3};
constexpr int IN4 = ${pinout.in4};

constexpr long TRAVEL_STEPS = 2048;
constexpr float MOTOR_MAX_SPEED = ${pinout.motorMaxSpeed.toFixed(1)}f;
constexpr float MOTOR_ACCELERATION = ${pinout.motorAcceleration.toFixed(1)}f;

#define SAFE_ALLOWED_MAX_PERCENT_STEP 10
#define SAFE_DEFAULT_NUDGE_PERCENT 2
#define SAFE_MOTOR_MAX_SPEED ${pinout.safeMotorMaxSpeed.toFixed(1)}f
#define SAFE_MOTOR_ACCELERATION ${pinout.safeMotorAcceleration.toFixed(1)}f

// ---------------------------------------------------------------------------
// Retry and Status Timing
// ---------------------------------------------------------------------------

constexpr unsigned long STATUS_INTERVAL_MS = 3000;
constexpr unsigned long WIFI_CONNECT_TIMEOUT_MS = 15000;
constexpr unsigned long WIFI_RETRY_MS = 5000;
constexpr unsigned long MQTT_RETRY_MS = 5000;
`;
}

function buildEsp8266ServoConfig(input: ProvisionedConfigInput): string {
  const wifiSsid = input.wifiMode === "preconfigured" ? input.wifiSsid : "";
  const wifiPassword =
    input.wifiMode === "preconfigured" ? input.wifiPassword : "";

  return `#pragma once

// ---------------------------------------------------------------------------
// WiFi and MQTT Credentials
// ---------------------------------------------------------------------------

// Leave WiFi blank to let WiFiManager start a SmartShutter setup network.
constexpr const char* WIFI_SSID = ${toCString(wifiSsid)};
constexpr const char* WIFI_PASSWORD = ${toCString(wifiPassword)};

constexpr const char* MQTT_HOST = ${toCString(input.mqttHost)};
constexpr int MQTT_PORT = ${input.mqttPort};
constexpr const char* MQTT_USERNAME = ${toCString(input.mqttUsername)};
constexpr const char* MQTT_PASSWORD = ${toCString(input.mqttPassword)};
constexpr const char* MQTT_CLIENT_ID = ${toCString(buildMqttClientId(input.deviceId))};

// Device identity and topics provisioned from Smart Shutter.
constexpr const char* DEVICE_ID = ${toCString(input.deviceId)};
#define FIRMWARE_VERSION "${DEFAULT_ESP8266_SERVO_FIRMWARE_VERSION}"
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

#define SAFE_SETUP_MODE true
#define SAFE_ALLOWED_MAX_PERCENT_STEP 10
#define SAFE_DEFAULT_NUDGE_PERCENT 2

// ---------------------------------------------------------------------------
// Servo Wiring and Motion Tuning
// ---------------------------------------------------------------------------

// Known-good default wiring for the servo-based ESP8266 board:
// GPIO2 drives the servo signal and GPIO16 toggles the onboard activity LED.
constexpr int SERVO_SIGNAL_PIN = 2;
constexpr int STATUS_LED_PIN = 16;
constexpr bool STATUS_LED_ACTIVE_LOW = true;

constexpr int SERVO_CLOSED_ANGLE = 20;
constexpr int SERVO_OPEN_ANGLE = 160;
constexpr int SERVO_STARTUP_ANGLE = SERVO_CLOSED_ANGLE;
constexpr int SERVO_STEP_DEGREES = 2;
constexpr unsigned long SERVO_STEP_INTERVAL_MS = 25;

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
  if (input.board === "esp8266-servo") {
    return buildEsp8266ServoConfig(input);
  }

  if (input.board === "esp8266-d1d4") {
    return buildEsp8266D1D4Config(input);
  }

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
