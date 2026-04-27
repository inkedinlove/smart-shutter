#pragma once

// ---------------------------------------------------------------------------
// WiFi and MQTT Credentials
// ---------------------------------------------------------------------------

// Leave WiFi blank to use factory setup mode with a local setup AP and portal.
constexpr const char* WIFI_SSID = "";
constexpr const char* WIFI_PASSWORD = "";

constexpr const char* MQTT_HOST = "YOUR_HIVEMQ_HOST";
constexpr int MQTT_PORT = 8883;
constexpr const char* MQTT_USERNAME = "YOUR_HIVEMQ_USERNAME";
constexpr const char* MQTT_PASSWORD = "YOUR_HIVEMQ_PASSWORD";
constexpr const char* MQTT_CLIENT_ID = "";

// Leave this blank to derive a unique fallback device ID from the ESP8266 chip ID.
constexpr const char* DEVICE_ID = "";
#define FIRMWARE_VERSION "0.1.0-dev-esp8266-d1d4"
constexpr const char* COMMAND_TOPIC = "shutters/{deviceId}/commands";
constexpr const char* STATUS_TOPIC = "shutters/{deviceId}/status";

// ---------------------------------------------------------------------------
// Factory Setup Mode
// ---------------------------------------------------------------------------

// Keep this enabled for factory-flashed devices so they can start a local
// setup network when WiFi is blank or the saved network cannot be reached.
#define ENABLE_FACTORY_SETUP_MODE true
#define SETUP_AP_SSID_PREFIX "SmartShutter-"
#define SETUP_AP_PASSWORD ""
#define SETUP_PORTAL_TIMEOUT_MS 300000

// ---------------------------------------------------------------------------
// OTA Update Settings
// ---------------------------------------------------------------------------

// The D1-D4 build supports HTTPS OTA update checks and installs.
#define ENABLE_OTA_UPDATES true
#define API_BASE_URL "https://your-app.example.com"
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

// Known-good pin map for the D1/D2/D3/D4 ULN2003 wiring profile:
// D1=GPIO5, D2=GPIO4, D3=GPIO0, D4=GPIO2
constexpr int IN1 = 5;
constexpr int IN2 = 4;
constexpr int IN3 = 0;
constexpr int IN4 = 2;

constexpr long TRAVEL_STEPS = 6180;
constexpr float MOTOR_MAX_SPEED = 300.0f;
constexpr float MOTOR_ACCELERATION = 120.0f;

#define SAFE_ALLOWED_MAX_PERCENT_STEP 20
#define SAFE_DEFAULT_NUDGE_PERCENT 2
#define SAFE_MOTOR_MAX_SPEED 180.0f
#define SAFE_MOTOR_ACCELERATION 70.0f

// ---------------------------------------------------------------------------
// Retry and Status Timing
// ---------------------------------------------------------------------------

constexpr unsigned long STATUS_INTERVAL_MS = 3000;
constexpr unsigned long WIFI_CONNECT_TIMEOUT_MS = 15000;
constexpr unsigned long WIFI_RETRY_MS = 5000;
constexpr unsigned long MQTT_RETRY_MS = 5000;
