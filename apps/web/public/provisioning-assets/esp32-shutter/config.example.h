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

// Leave this blank to derive a unique fallback device ID from the ESP32 MAC.
constexpr const char* DEVICE_ID = "shutter-dev-001";
#define FIRMWARE_VERSION "0.1.1-dev-esp32"
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

// ESP32 builds support Wi-Fi OTA updates. Saved Wi-Fi, calibration, and
// device identity settings stay in Preferences across OTA firmware swaps.
#define ENABLE_OTA_UPDATES true
#define API_BASE_URL "https://your-app.example.com"
#define OTA_MANIFEST_PATH_TEMPLATE "/api/devices/{deviceId}/firmware/manifest"
#define OTA_EVENTS_PATH_TEMPLATE "/api/devices/{deviceId}/firmware/events"
#define OTA_AUTO_CHECK_INITIAL_DELAY_MS 300000UL
#define OTA_AUTO_CHECK_INTERVAL_MS 21600000UL
#define OTA_AUTO_CHECK_JITTER_MS 900000UL

// ---------------------------------------------------------------------------
// Optional Behavior Flags
// ---------------------------------------------------------------------------

// Set this to true only when you want the device to expose a simple local
// HTTP control page for internal testing or cloud fallback.
#define ENABLE_LOCAL_FALLBACK_WEB false

// Keep this enabled for the first attached-shutter test so the device only
// accepts small reversible moves until calibration is confirmed.
#define SAFE_SETUP_MODE true

// Flip this to true if the motor direction is reversed for your shutter.
#define INVERT_DIRECTION false

// Enable STA-mode Wi-Fi power save for lower idle battery drain.
#define ENABLE_WIFI_POWER_SAVE true

// Keep this false for battery installs so the stepper coils release at idle.
// Set it to true only if your hardware needs holding torque while parked.
#define KEEP_MOTOR_COILS_ENERGIZED_WHEN_IDLE false

// Enable a repeating SOS movement pattern that can be started from the app.
#define ENABLE_SOS_MODE true

// SOS uses large repeated shutter sweeps around the current position.
#define SOS_SHORT_PULSE_PERCENT 25
#define SOS_LONG_PULSE_PERCENT 50
#define SOS_PULSE_GAP_MS 180UL
#define SOS_LETTER_GAP_MS 420UL
#define SOS_WORD_GAP_MS 900UL
#define SOS_MOTOR_MAX_SPEED 1400.0f
#define SOS_MOTOR_ACCELERATION 800.0f

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

// Safe setup tuning for the first attached-shutter test.
#define SAFE_ALLOWED_MAX_PERCENT_STEP 10
#define SAFE_DEFAULT_NUDGE_PERCENT 2
#define SAFE_MOTOR_MAX_SPEED 220.0f
#define SAFE_MOTOR_ACCELERATION 110.0f

// ---------------------------------------------------------------------------
// Retry and Status Timing
// ---------------------------------------------------------------------------

// Status publishes are event-driven. Keep a small movement interval so the UI
// can still watch progress, and use 0 to disable idle heartbeats completely.
#define MOVING_STATUS_INTERVAL_MS 5000UL
#define IDLE_STATUS_INTERVAL_MS 0UL
#define MQTT_KEEP_ALIVE_SECONDS 60
constexpr unsigned long WIFI_CONNECT_TIMEOUT_MS = 15000;
constexpr unsigned long WIFI_RETRY_MS = 5000;
constexpr unsigned long MQTT_RETRY_MS = 5000;
constexpr unsigned long LOCAL_FALLBACK_AP_DELAY_MS = 20000;

// ---------------------------------------------------------------------------
// Local Fallback Access Point
// ---------------------------------------------------------------------------

constexpr const char* LOCAL_FALLBACK_AP_SSID = "SmartShutterSetup";
constexpr const char* LOCAL_FALLBACK_AP_PASSWORD = "change-me";
