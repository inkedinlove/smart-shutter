#pragma once

// ---------------------------------------------------------------------------
// WiFi and MQTT Credentials
// ---------------------------------------------------------------------------

// Leave WiFi blank to let WiFiManager start a SmartShutter setup network.
constexpr const char* WIFI_SSID = "";
constexpr const char* WIFI_PASSWORD = "";

constexpr const char* MQTT_HOST = "YOUR_HIVEMQ_HOST";
constexpr int MQTT_PORT = 8883;
constexpr const char* MQTT_USERNAME = "YOUR_HIVEMQ_USERNAME";
constexpr const char* MQTT_PASSWORD = "YOUR_HIVEMQ_PASSWORD";
constexpr const char* MQTT_CLIENT_ID = "";

// Leave this blank to derive a unique fallback device ID from the ESP8266 chip ID.
constexpr const char* DEVICE_ID = "";
#define FIRMWARE_VERSION "0.1.0-dev-esp8266-servo"
constexpr const char* COMMAND_TOPIC = "shutters/{deviceId}/commands";
constexpr const char* STATUS_TOPIC = "shutters/{deviceId}/status";

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
#define API_BASE_URL "https://your-app.example.com"
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
