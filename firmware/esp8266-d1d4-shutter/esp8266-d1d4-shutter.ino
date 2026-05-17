#include <AccelStepper.h>
#define ARDUINOJSON_USE_DOUBLE 0
#define ARDUINOJSON_USE_LONG_LONG 0
#include <ArduinoJson.h>
#include <EEPROM.h>
#include <ESP8266HTTPClient.h>
#include <ESP8266WebServer.h>
#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include <Updater.h>
#include <WiFiClientSecureBearSSL.h>
#include <bearssl/bearssl_hash.h>

#if defined(__has_include)
#if __has_include("config.h")
#include "config.h"
#else
#error "Missing config.h. Copy firmware/esp8266-d1d4-shutter/config.example.h to firmware/esp8266-d1d4-shutter/config.h and fill in your WiFi and MQTT settings before compiling."
#endif
#else
#error "Compiler does not support __has_include. Create firmware/esp8266-d1d4-shutter/config.h from config.example.h before compiling."
#endif

#ifndef FIRMWARE_VERSION
#define FIRMWARE_VERSION "0.1.0-dev-esp8266-d1d4"
#endif

// Recommended Arduino IDE board settings for this build:
// - Board: NodeMCU 1.0 (ESP-12E Module)
// - MMU: 16KB cache + 48KB IRAM (IRAM)

#ifndef ENABLE_OTA_UPDATES
#define ENABLE_OTA_UPDATES false
#endif

#ifndef API_BASE_URL
#define API_BASE_URL ""
#endif

#ifndef OTA_MANIFEST_PATH_TEMPLATE
#define OTA_MANIFEST_PATH_TEMPLATE "/api/devices/{deviceId}/firmware/manifest"
#endif

#ifndef OTA_EVENTS_PATH_TEMPLATE
#define OTA_EVENTS_PATH_TEMPLATE "/api/devices/{deviceId}/firmware/events"
#endif

#ifndef OTA_AUTO_CHECK_INITIAL_DELAY_MS
#define OTA_AUTO_CHECK_INITIAL_DELAY_MS 300000UL
#endif

#ifndef OTA_AUTO_CHECK_INTERVAL_MS
#define OTA_AUTO_CHECK_INTERVAL_MS 21600000UL
#endif

#ifndef OTA_AUTO_CHECK_JITTER_MS
#define OTA_AUTO_CHECK_JITTER_MS 900000UL
#endif

#ifndef STATUS_INTERVAL_MS
#define STATUS_INTERVAL_MS 30000UL
#endif

#ifndef SAFE_SETUP_MODE
#define SAFE_SETUP_MODE true
#endif

#ifndef SAFE_ALLOWED_MAX_PERCENT_STEP
#define SAFE_ALLOWED_MAX_PERCENT_STEP 20
#endif

#ifndef SAFE_DEFAULT_NUDGE_PERCENT
#define SAFE_DEFAULT_NUDGE_PERCENT 2
#endif

#ifndef SAFE_MOTOR_MAX_SPEED
#define SAFE_MOTOR_MAX_SPEED 180.0f
#endif

#ifndef SAFE_MOTOR_ACCELERATION
#define SAFE_MOTOR_ACCELERATION 90.0f
#endif

#ifndef ENABLE_FACTORY_SETUP_MODE
#define ENABLE_FACTORY_SETUP_MODE true
#endif

#ifndef SETUP_AP_SSID_PREFIX
#define SETUP_AP_SSID_PREFIX "SmartShutter-"
#endif

#ifndef SETUP_AP_PASSWORD
#define SETUP_AP_PASSWORD ""
#endif

#ifndef MQTT_CLIENT_ID
#define MQTT_CLIENT_ID ""
#endif

enum DeviceMode {
  DEVICE_MODE_BOOTING,
  DEVICE_MODE_WIFI_CONNECTING,
  DEVICE_MODE_MQTT_CONNECTING,
  DEVICE_MODE_READY,
  DEVICE_MODE_MOVING,
  DEVICE_MODE_ERROR,
};

enum OtaState {
  OTA_STATE_IDLE,
  OTA_STATE_DISABLED,
  OTA_STATE_CHECKING_MANIFEST,
  OTA_STATE_UPDATE_AVAILABLE,
  OTA_STATE_DOWNLOADING,
  OTA_STATE_VERIFYING_HASH,
  OTA_STATE_INSTALLING,
  OTA_STATE_REBOOTING,
  OTA_STATE_FAILED,
  OTA_STATE_SUCCESS_PENDING_REBOOT,
};

struct OtaManifest {
  bool updateAvailable = false;
  String currentVersion;
  String latestVersion;
  String board;
  String channel;
  bool autoUpdateEnabled = false;
  String autoUpdateChannel;
  String artifactUrl;
  String sha256;
  long sizeBytes = -1;
};

struct OtaDownloadResult {
  String computedSha256;
  size_t downloadedBytes = 0;
};

struct StoredWiFiCredentials {
  uint32_t magic;
  char ssid[64];
  char password[64];
};

struct StoredDeviceSettings {
  uint32_t magic;
  char ssid[64];
  char password[64];
  int32_t closedPositionSteps;
  int32_t openPositionSteps;
  uint8_t calibrationComplete;
  uint8_t directionInverted;
  uint8_t endpointMask;
  uint8_t reserved;
};

constexpr uint32_t STORED_WIFI_MAGIC = 0x53535431;
constexpr uint32_t STORED_DEVICE_SETTINGS_MAGIC = 0x53535432;
constexpr long MIN_CALIBRATION_SPAN_STEPS = 64L;
constexpr uint8_t CALIBRATION_ENDPOINT_CLOSED = 0x01;
constexpr uint8_t CALIBRATION_ENDPOINT_OPEN = 0x02;

BearSSL::WiFiClientSecure secureClient;
PubSubClient mqttClient(secureClient);
ESP8266WebServer localServer(80);
AccelStepper stepper(AccelStepper::HALF4WIRE, IN1, IN3, IN2, IN4);

DeviceMode deviceMode = DEVICE_MODE_BOOTING;
OtaState otaState = ENABLE_OTA_UPDATES ? OTA_STATE_IDLE : OTA_STATE_DISABLED;

unsigned long bootStartedMs = 0;
unsigned long lastStatusPublishMs = 0;
unsigned long lastStatusLogMs = 0;
unsigned long lastWiFiRetryMs = 0;
unsigned long lastMqttRetryMs = 0;
unsigned long lastAutoUpdateCheckMs = 0;
unsigned long otaAutoCheckJitterMs = 0;
unsigned long wifiAttemptStartedMs = 0;
unsigned long setupPortalStartedMs = 0;

bool wifiConnectInProgress = false;
bool setupPortalActive = false;
bool movementLocked = false;
bool directionInverted = INVERT_DIRECTION;
bool calibrationComplete = !SAFE_SETUP_MODE;
bool lastMovingState = false;
bool lastWiFiConnectedState = false;

int targetPercent = 0;
long calibratedClosedPositionSteps = 0;
long calibratedOpenPositionSteps = TRAVEL_STEPS;
uint8_t calibrationEndpointMask = 0;

String resolvedDeviceId = "";
String resolvedMqttClientId = "";
String resolvedCommandTopic = "";
String resolvedStatusTopic = "";
String runtimeWifiSsid = "";
String runtimeWifiPassword = "";
String setupPortalSsid = "";
String setupPortalMessage = "";
String otaLastError = "";
String otaTargetVersion = "";
String otaAutoUpdateChannel = "stable";
String lastCalibrationAction =
  SAFE_SETUP_MODE ? "SAFE_SETUP_MODE_ENABLED" : "";
String movementLockedReason =
  SAFE_SETUP_MODE ? "Calibration required before larger movement." : "";
bool otaAutoUpdateEnabled = false;

const char* deviceModeToString(DeviceMode mode) {
  switch (mode) {
    case DEVICE_MODE_BOOTING:
      return "BOOTING";
    case DEVICE_MODE_WIFI_CONNECTING:
      return "WIFI_CONNECTING";
    case DEVICE_MODE_MQTT_CONNECTING:
      return "MQTT_CONNECTING";
    case DEVICE_MODE_READY:
      return "READY";
    case DEVICE_MODE_MOVING:
      return "MOVING";
    case DEVICE_MODE_ERROR:
      return "ERROR";
    default:
      return "ERROR";
  }
}

const char* otaStateToString(OtaState state) {
  switch (state) {
    case OTA_STATE_IDLE:
      return "IDLE";
    case OTA_STATE_DISABLED:
      return "DISABLED";
    case OTA_STATE_CHECKING_MANIFEST:
      return "CHECKING_MANIFEST";
    case OTA_STATE_UPDATE_AVAILABLE:
      return "UPDATE_AVAILABLE";
    case OTA_STATE_DOWNLOADING:
      return "DOWNLOADING";
    case OTA_STATE_VERIFYING_HASH:
      return "VERIFYING_HASH";
    case OTA_STATE_INSTALLING:
      return "INSTALLING";
    case OTA_STATE_REBOOTING:
      return "REBOOTING";
    case OTA_STATE_FAILED:
      return "FAILED";
    case OTA_STATE_SUCCESS_PENDING_REBOOT:
      return "SUCCESS_PENDING_REBOOT";
    default:
      return "FAILED";
  }
}

bool hasText(const char* value) {
  return value != nullptr && strlen(value) > 0;
}

bool hasText(const String& value) {
  return value.length() > 0;
}

bool deviceIdsMatch(const String& left, const String& right) {
  String normalizedLeft = left;
  String normalizedRight = right;
  normalizedLeft.trim();
  normalizedRight.trim();

  return
    normalizedLeft.length() > 0 &&
    normalizedRight.length() > 0 &&
    normalizedLeft.equalsIgnoreCase(normalizedRight);
}

void setDeviceMode(DeviceMode nextMode) {
  if (deviceMode == nextMode) {
    return;
  }

  deviceMode = nextMode;
  Serial.print("Device mode -> ");
  Serial.println(deviceModeToString(deviceMode));
}

long scaleMagnitudeByPercent(long magnitudeSteps, int percent) {
  const long clampedMagnitude = max(0L, magnitudeSteps);
  const int clampedPercent = constrain(percent, 0, 100);
  return (clampedMagnitude * static_cast<long>(clampedPercent) + 50L) / 100L;
}

long getCalibratedSpanSteps() {
  long span = calibratedOpenPositionSteps - calibratedClosedPositionSteps;

  if (span != 0) {
    return span;
  }

  return INVERT_DIRECTION ? -TRAVEL_STEPS : TRAVEL_STEPS;
}

bool hasMarkedClosedEndpoint() {
  return (calibrationEndpointMask & CALIBRATION_ENDPOINT_CLOSED) != 0;
}

bool hasMarkedOpenEndpoint() {
  return (calibrationEndpointMask & CALIBRATION_ENDPOINT_OPEN) != 0;
}

bool hasFullTravelCalibration() {
  return hasMarkedClosedEndpoint() &&
         hasMarkedOpenEndpoint() &&
         hasMeaningfulCalibrationSpan();
}

long getCalibrationTravelSpanMagnitude() {
  const long spanMagnitude = labs(getCalibratedSpanSteps());
  return spanMagnitude > 0 ? spanMagnitude : TRAVEL_STEPS;
}

long getOpenDirectionStepSign() {
  return getCalibratedSpanSteps() >= 0 ? 1L : -1L;
}

bool hasMeaningfulCalibrationSpan() {
  return labs(calibratedOpenPositionSteps - calibratedClosedPositionSteps) >=
         MIN_CALIBRATION_SPAN_STEPS;
}

int stepsToPercent(long steps) {
  const long closedSteps = calibratedClosedPositionSteps;
  const long spanSteps = getCalibratedSpanSteps();
  const long spanMagnitude = max(1L, labs(spanSteps));
  const long relativeSteps = steps - closedSteps;
  long progressSteps = spanSteps >= 0 ? relativeSteps : -relativeSteps;
  progressSteps = constrain(progressSteps, 0L, spanMagnitude);
  const int effectivePercent = static_cast<int>(
    (progressSteps * 100L + spanMagnitude / 2L) / spanMagnitude
  );
  const int mappedPercent =
    directionInverted ? 100 - effectivePercent : effectivePercent;

  return constrain(mappedPercent, 0, 100);
}

long percentToSteps(int percent) {
  const int clampedPercent = constrain(percent, 0, 100);
  const int effectivePercent =
    directionInverted ? 100 - clampedPercent : clampedPercent;
  const long spanSteps = getCalibratedSpanSteps();
  const long offsetMagnitude =
    scaleMagnitudeByPercent(labs(spanSteps), effectivePercent);
  const long signedOffset = spanSteps >= 0 ? offsetMagnitude : -offsetMagnitude;
  return calibratedClosedPositionSteps + signedOffset;
}

bool isMoving() {
  return stepper.distanceToGo() != 0;
}

DeviceMode getIdleModeFromConnectivity() {
  if (mqttClient.connected()) {
    return DEVICE_MODE_READY;
  }

  if (WiFi.status() == WL_CONNECTED) {
    return DEVICE_MODE_MQTT_CONNECTING;
  }

  return DEVICE_MODE_WIFI_CONNECTING;
}

bool isCalibrationRestricted() {
  return SAFE_SETUP_MODE && !hasFullTravelCalibration();
}

bool isSafetyModeActive() {
  return SAFE_SETUP_MODE;
}

int getAllowedMaxPercentStep() {
  return isCalibrationRestricted() ? SAFE_ALLOWED_MAX_PERCENT_STEP : 100;
}

long getCalibrationJogSteps(int amount) {
  const long baseSpan = getCalibrationTravelSpanMagnitude();
  const long jogSteps =
    scaleMagnitudeByPercent(baseSpan, constrain(amount, 1, 100));

  return max(1L, jogSteps);
}

bool tryReadCommandInt(JsonVariantConst value, int* parsedValue) {
  if (value.is<int>() || value.is<long>()) {
    *parsedValue = value.as<int>();
    return true;
  }

  if (value.is<const char*>()) {
    const char* rawValue = value.as<const char*>();
    if (rawValue == nullptr || rawValue[0] == '\0') {
      return false;
    }

    char* endPtr = nullptr;
    const long parsedLong = strtol(rawValue, &endPtr, 10);
    if (endPtr == rawValue) {
      return false;
    }

    *parsedValue = static_cast<int>(parsedLong);
    return true;
  }

  return false;
}

void rememberCalibrationAction(const char* action) {
  lastCalibrationAction = action;
}

void syncMovementLockedReason() {
  if (movementLocked) {
    movementLockedReason = "Movement locked by operator.";
    return;
  }

  if (isCalibrationRestricted()) {
    movementLockedReason = "Calibration required before larger movement.";
    return;
  }

  movementLockedReason = "";
}

void updateTargetPercentFromStepper() {
  targetPercent = stepsToPercent(stepper.targetPosition());
}

void applyMotionProfile() {
  if (isCalibrationRestricted()) {
    stepper.setMaxSpeed(SAFE_MOTOR_MAX_SPEED);
    stepper.setAcceleration(SAFE_MOTOR_ACCELERATION);
    return;
  }

  stepper.setMaxSpeed(MOTOR_MAX_SPEED);
  stepper.setAcceleration(MOTOR_ACCELERATION);
}

String getChipSuffixUpper() {
  char suffix[7];
  snprintf(suffix, sizeof(suffix), "%06X", ESP.getChipId() & 0xFFFFFFU);
  return String(suffix);
}

String getChipSuffixLower() {
  String suffix = getChipSuffixUpper();
  suffix.toLowerCase();
  return suffix;
}

String resolveDeviceId() {
  if (hasText(DEVICE_ID)) {
    return String(DEVICE_ID);
  }

  return String("shutter-") + getChipSuffixLower();
}

String resolveMqttClientId() {
  if (hasText(MQTT_CLIENT_ID)) {
    return String(MQTT_CLIENT_ID);
  }

  return String("smart-shutter-") + resolvedDeviceId;
}

String resolveTopic(const char* configuredTopic, const char* topicSuffix) {
  String topic = configuredTopic;
  topic.trim();

  if (topic.length() == 0) {
    return String("shutters/") + resolvedDeviceId + "/" + topicSuffix;
  }

  topic.replace("{deviceId}", resolvedDeviceId);
  return topic;
}

void copyStringToBuffer(const String& value, char* buffer, size_t size) {
  if (buffer == nullptr || size == 0) {
    return;
  }

  memset(buffer, 0, size);
  value.substring(0, size - 1).toCharArray(buffer, size);
}

void resetCalibrationRangeToDefaults() {
  calibratedClosedPositionSteps = 0;
  calibratedOpenPositionSteps = directionInverted ? -TRAVEL_STEPS : TRAVEL_STEPS;
  calibrationEndpointMask = 0;
  calibrationComplete = !SAFE_SETUP_MODE;
}

bool savePersistedDeviceSettings(const String& ssid, const String& password) {
  EEPROM.begin(sizeof(StoredDeviceSettings));

  StoredDeviceSettings stored = {};
  stored.magic = STORED_DEVICE_SETTINGS_MAGIC;
  copyStringToBuffer(ssid, stored.ssid, sizeof(stored.ssid));
  copyStringToBuffer(password, stored.password, sizeof(stored.password));
  stored.closedPositionSteps = static_cast<int32_t>(calibratedClosedPositionSteps);
  stored.openPositionSteps = static_cast<int32_t>(calibratedOpenPositionSteps);
  stored.calibrationComplete = calibrationComplete ? 1 : 0;
  stored.directionInverted = directionInverted ? 1 : 0;
  stored.endpointMask = calibrationEndpointMask;

  EEPROM.put(0, stored);
  return EEPROM.commit();
}

void loadStoredWiFiCredentials(String* ssid, String* password) {
  if (ssid == nullptr || password == nullptr) {
    return;
  }

  resetCalibrationRangeToDefaults();
  EEPROM.begin(sizeof(StoredDeviceSettings));

  StoredDeviceSettings storedSettings = {};
  EEPROM.get(0, storedSettings);

  if (storedSettings.magic == STORED_DEVICE_SETTINGS_MAGIC) {
    storedSettings.ssid[sizeof(storedSettings.ssid) - 1] = '\0';
    storedSettings.password[sizeof(storedSettings.password) - 1] = '\0';

    *ssid = String(storedSettings.ssid);
    *password = String(storedSettings.password);
    directionInverted = storedSettings.directionInverted == 1;
    calibratedClosedPositionSteps =
      static_cast<long>(storedSettings.closedPositionSteps);
    calibratedOpenPositionSteps =
      static_cast<long>(storedSettings.openPositionSteps);
    calibrationEndpointMask = storedSettings.endpointMask;
    calibrationComplete =
      SAFE_SETUP_MODE ? storedSettings.calibrationComplete == 1 : true;

    if (calibrationEndpointMask == 0 &&
        calibrationComplete &&
        hasMeaningfulCalibrationSpan()) {
      calibrationEndpointMask =
        CALIBRATION_ENDPOINT_CLOSED | CALIBRATION_ENDPOINT_OPEN;
    }

    if (!hasMeaningfulCalibrationSpan()) {
      resetCalibrationRangeToDefaults();
    }

    return;
  }

  StoredWiFiCredentials legacyStored = {};
  EEPROM.get(0, legacyStored);

  if (legacyStored.magic != STORED_WIFI_MAGIC) {
    *ssid = "";
    *password = "";
    return;
  }

  legacyStored.ssid[sizeof(legacyStored.ssid) - 1] = '\0';
  legacyStored.password[sizeof(legacyStored.password) - 1] = '\0';

  *ssid = String(legacyStored.ssid);
  *password = String(legacyStored.password);
}

bool saveStoredWiFiCredentials(const String& ssid, const String& password) {
  const bool committed = savePersistedDeviceSettings(ssid, password);

  if (committed) {
    Serial.print("WiFi credentials saved for SSID: ");
    Serial.println(ssid);
  } else {
    Serial.println("Failed to save WiFi credentials.");
  }

  return committed;
}

bool saveCalibrationSettings() {
  const bool committed =
    savePersistedDeviceSettings(runtimeWifiSsid, runtimeWifiPassword);

  if (committed) {
    Serial.print("Calibration saved: closed=");
    Serial.print(calibratedClosedPositionSteps);
    Serial.print(" open=");
    Serial.print(calibratedOpenPositionSteps);
    Serial.print(" directionInverted=");
    Serial.print(directionInverted ? "true" : "false");
    Serial.print(" endpoints=");
    Serial.print(static_cast<int>(calibrationEndpointMask));
    Serial.print(" complete=");
    Serial.println(calibrationComplete ? "true" : "false");
  } else {
    Serial.println("Failed to save calibration settings.");
  }

  return committed;
}

void resolveRuntimeWiFiCredentials() {
  if (hasText(WIFI_SSID)) {
    runtimeWifiSsid = WIFI_SSID;
    runtimeWifiPassword = WIFI_PASSWORD;
    return;
  }

  loadStoredWiFiCredentials(&runtimeWifiSsid, &runtimeWifiPassword);
}

bool hasRuntimeWiFiCredentials() {
  return hasText(runtimeWifiSsid);
}

String normalizeSha256(const String& rawValue) {
  String normalized = rawValue;
  normalized.trim();
  normalized.toLowerCase();
  return normalized;
}

String bytesToHexString(const unsigned char* bytes, size_t length) {
  static const char HEX_CHARS[] = "0123456789abcdef";

  String result;
  result.reserve(length * 2);

  for (size_t index = 0; index < length; index++) {
    const unsigned char value = bytes[index];
    result += HEX_CHARS[(value >> 4) & 0x0F];
    result += HEX_CHARS[value & 0x0F];
  }

  return result;
}

void publishStatus(bool forceLog = false);
bool checkForUpdate(bool autoCheck);

void setOtaState(
  OtaState nextState,
  const String& nextTargetVersion,
  const String& nextLastError,
  bool publishNow = true
) {
  const bool changed =
    otaState != nextState ||
    otaTargetVersion != nextTargetVersion ||
    otaLastError != nextLastError;

  otaState = nextState;
  otaTargetVersion = nextTargetVersion;
  otaLastError = nextLastError;

  if (!changed) {
    return;
  }

  Serial.print("OTA state -> ");
  Serial.print(otaStateToString(otaState));
  Serial.print(" target=");
  Serial.print(otaTargetVersion.length() > 0 ? otaTargetVersion : "none");
  Serial.print(" error=");
  Serial.println(otaLastError.length() > 0 ? otaLastError : "none");

  if (publishNow) {
    publishStatus(true);
  }
}

String buildApiUrl(const char* pathTemplate) {
  String baseUrl = API_BASE_URL;
  baseUrl.trim();

  if (baseUrl.length() == 0) {
    return "";
  }

  String path = pathTemplate;
  path.replace("{deviceId}", resolvedDeviceId);

  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  while (baseUrl.endsWith("/")) {
    baseUrl.remove(baseUrl.length() - 1);
  }

  if (!path.startsWith("/")) {
    path = "/" + path;
  }

  return baseUrl + path;
}

bool beginHttpClient(
  HTTPClient& http,
  const String& url,
  BearSSL::WiFiClientSecure& secureHttpClient,
  WiFiClient& plainHttpClient
) {
  http.setTimeout(15000);

  if (url.startsWith("https://")) {
    // MVP only: this skips CA certificate validation. Replace with pinned CA
    // validation before broader deployment.
    secureHttpClient.setInsecure();
    secureHttpClient.setTimeout(15000);
    return http.begin(secureHttpClient, url);
  }

  if (url.startsWith("http://")) {
    plainHttpClient.setTimeout(15000);
    return http.begin(plainHttpClient, url);
  }

  Serial.println("OTA request uses an unsupported URL scheme.");
  return false;
}

void addOtaAuthHeaders(HTTPClient& http) {
  http.addHeader("X-Smart-Shutter-Device-Id", resolvedDeviceId);
  http.addHeader("X-Smart-Shutter-Mqtt-Username", MQTT_USERNAME);
  http.addHeader("X-Smart-Shutter-Mqtt-Password", MQTT_PASSWORD);
}

size_t getAvailableOtaSketchSpace() {
  const size_t freeSketchSpace = ESP.getFreeSketchSpace();
  return freeSketchSpace > 0x1000
    ? ((freeSketchSpace - 0x1000) & 0xFFFFF000)
    : freeSketchSpace;
}

void discardPendingOtaUpdate() {
  Update.setMD5("00000000000000000000000000000000");
  Update.end();
}

size_t buildStatusPayload(
  char* payload,
  size_t payloadSize,
  bool onlineValue,
  DeviceMode modeValue,
  bool movingValue
) {
  StaticJsonDocument<768> statusDoc;
  statusDoc["deviceId"] = resolvedDeviceId;
  statusDoc["resolvedDeviceId"] = resolvedDeviceId;
  statusDoc["setupMode"] = setupPortalActive;
  statusDoc["firmwareVersion"] = FIRMWARE_VERSION;
  statusDoc["deviceUptimeMs"] = millis() - bootStartedMs;
  statusDoc["online"] = onlineValue;
  statusDoc["moving"] = movingValue;
  statusDoc["deviceMode"] = deviceModeToString(modeValue);
  statusDoc["estimatedPercent"] = stepsToPercent(stepper.currentPosition());
  statusDoc["targetPercent"] = targetPercent;
  statusDoc["reportedBoard"] = "esp8266-d1d4";
  statusDoc["actuatorType"] = "stepper";
  JsonArray reportedCapabilities =
    statusDoc.createNestedArray("reportedCapabilities");
  reportedCapabilities.add("set_percent");
  reportedCapabilities.add("stop");
  reportedCapabilities.add("nudge");
  reportedCapabilities.add("calibration");
  reportedCapabilities.add("movement_lock");
  reportedCapabilities.add("factory_setup_ap");
  if (ENABLE_OTA_UPDATES) {
    reportedCapabilities.add("ota");
  }
  statusDoc["wifiConnected"] = WiFi.status() == WL_CONNECTED;
  statusDoc["mqttConnected"] = mqttClient.connected();
  if (WiFi.status() == WL_CONNECTED) {
    statusDoc["rssi"] = WiFi.RSSI();
  } else {
    statusDoc["rssi"] = nullptr;
  }
  statusDoc["otaEnabled"] = ENABLE_OTA_UPDATES;
  statusDoc["otaAutoUpdateEnabled"] = otaAutoUpdateEnabled;
  statusDoc["otaAutoUpdateChannel"] =
    otaAutoUpdateChannel.length() > 0 ? otaAutoUpdateChannel : "stable";
  statusDoc["otaState"] = otaStateToString(otaState);
  if (otaLastError.length() > 0) {
    statusDoc["otaLastError"] = otaLastError;
  } else {
    statusDoc["otaLastError"] = nullptr;
  }
  if (otaTargetVersion.length() > 0) {
    statusDoc["otaTargetVersion"] = otaTargetVersion;
  } else {
    statusDoc["otaTargetVersion"] = nullptr;
  }
  statusDoc["calibrationComplete"] = calibrationComplete;
  statusDoc["fullTravelReady"] = hasFullTravelCalibration();
  statusDoc["directionInverted"] = directionInverted;
  statusDoc["safetyMode"] = isSafetyModeActive();
  statusDoc["allowedMaxPercentStep"] = getAllowedMaxPercentStep();
  if (lastCalibrationAction.length() > 0) {
    statusDoc["lastCalibrationAction"] = lastCalibrationAction;
  } else {
    statusDoc["lastCalibrationAction"] = nullptr;
  }
  if (movementLockedReason.length() > 0) {
    statusDoc["movementLockedReason"] = movementLockedReason;
  } else {
    statusDoc["movementLockedReason"] = nullptr;
  }

  return serializeJson(statusDoc, payload, payloadSize);
}

void logStatusSummary(bool published, DeviceMode modeValue, bool movingValue) {
  const unsigned long now = millis();
  if (lastStatusLogMs != 0 && now - lastStatusLogMs < STATUS_INTERVAL_MS) {
    return;
  }

  lastStatusLogMs = now;

  Serial.print("Status ");
  Serial.print(published ? "ok" : "failed");
  Serial.print(" mode=");
  Serial.print(deviceModeToString(modeValue));
  Serial.print(" est=");
  Serial.print(stepsToPercent(stepper.currentPosition()));
  Serial.print("% target=");
  Serial.print(targetPercent);
  Serial.print("% moving=");
  Serial.print(movingValue ? "true" : "false");
  Serial.print(" safe=");
  Serial.print(isSafetyModeActive() ? "true" : "false");
  Serial.print(" calibrated=");
  Serial.print(calibrationComplete ? "true" : "false");
  Serial.print(" fullTravelReady=");
  Serial.print(hasFullTravelCalibration() ? "true" : "false");
  Serial.print(" direction=");
  Serial.print(directionInverted ? "reversed" : "normal");
  Serial.print(" ota=");
  Serial.println(otaStateToString(otaState));
}

void publishStatus(bool forceLog) {
  if (!mqttClient.connected()) {
    return;
  }

  char payload[1024];
  const bool movingNow = isMoving();
  const DeviceMode reportedMode =
    movingNow ? DEVICE_MODE_MOVING : deviceMode;
  buildStatusPayload(payload, sizeof(payload), true, reportedMode, movingNow);
  const bool published = mqttClient.publish(resolvedStatusTopic.c_str(), payload, true);

  if (forceLog) {
    lastStatusLogMs = 0;
  }

  logStatusSummary(published, reportedMode, movingNow);
  lastStatusPublishMs = millis();
}

void sendSetupPage() {
  String page =
    "<!doctype html><html><head><meta charset='utf-8'>"
    "<meta name='viewport' content='width=device-width,initial-scale=1'>"
    "<title>Smart Shutter Setup</title>"
    "<style>"
    "body{font-family:Arial,sans-serif;background:#06111f;color:#f8fafc;margin:0;padding:24px;}"
    ".card{max-width:640px;margin:0 auto;background:#0f172a;border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:24px;}"
    "h1{margin-top:0;font-size:28px;}label{display:block;margin-top:16px;font-weight:600;}"
    "input{width:100%;margin-top:8px;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:#020617;color:#fff;box-sizing:border-box;}"
    "button{margin-top:20px;padding:12px 18px;border:0;border-radius:12px;background:#22d3ee;color:#04111c;font-weight:700;cursor:pointer;}"
    ".meta{font-size:13px;color:#93c5fd;letter-spacing:.14em;text-transform:uppercase;}"
    ".note{margin-top:18px;padding:14px;border-radius:14px;background:rgba(34,211,238,.08);color:#cffafe;line-height:1.6;}"
    ".message{margin-top:18px;padding:14px;border-radius:14px;background:rgba(251,191,36,.12);color:#fde68a;line-height:1.6;}"
    "</style></head><body><div class='card'>"
    "<div class='meta'>Factory setup mode</div>"
    "<h1>Connect Smart Shutter to WiFi</h1>";

  page += "<p>Device ID: <strong>";
  page += resolvedDeviceId;
  page += "</strong></p>";
  page +=
    "<p>Enter your 2.4 GHz WiFi network, save it, and wait for the device to reboot.</p>";

  if (setupPortalMessage.length() > 0) {
    page += "<div class='message'>";
    page += setupPortalMessage;
    page += "</div>";
  }

  page +=
    "<form method='post' action='/save'>"
    "<label for='ssid'>WiFi name</label>"
    "<input id='ssid' name='ssid' maxlength='63' placeholder='Home WiFi' required>"
    "<label for='password'>WiFi password</label>"
    "<input id='password' name='password' type='password' maxlength='63' placeholder='Password'>"
    "<button type='submit'>Save WiFi</button>"
    "</form>"
    "<div class='note'>After saving WiFi, return to Smart Shutter setup in the web app and wait for the device to come online.</div>"
    "</div></body></html>";

  localServer.send(200, "text/html", page);
}

void sendLocalStatus() {
  char payload[1024];
  const bool movingNow = isMoving();
  const bool onlineNow = WiFi.status() == WL_CONNECTED && mqttClient.connected();
  const DeviceMode reportedMode =
    movingNow ? DEVICE_MODE_MOVING : deviceMode;
  buildStatusPayload(payload, sizeof(payload), onlineNow, reportedMode, movingNow);
  localServer.send(200, "application/json", payload);
}

void handleSaveCredentials() {
  const String ssid = localServer.arg("ssid");
  const String password = localServer.arg("password");

  if (!hasText(ssid)) {
    setupPortalMessage = "WiFi name is required.";
    sendSetupPage();
    return;
  }

  if (!saveStoredWiFiCredentials(ssid, password)) {
    setupPortalMessage = "Unable to save WiFi credentials. Try again.";
    sendSetupPage();
    return;
  }

  runtimeWifiSsid = ssid;
  runtimeWifiPassword = password;
  setupPortalMessage = "WiFi saved. Rebooting device now.";

  Serial.println("WiFi credentials saved.");
  Serial.println("Rebooting...");

  localServer.send(
    200,
    "text/html",
    "<!doctype html><html><body style='font-family:Arial,sans-serif;padding:24px;'>"
    "<h1>WiFi saved</h1><p>The device is rebooting now. Return to Smart Shutter setup after it reconnects.</p>"
    "</body></html>");
  delay(1200);
  ESP.restart();
}

void startSetupPortal() {
  if (setupPortalActive) {
    return;
  }

  setupPortalActive = true;
  setupPortalStartedMs = millis();
  setupPortalSsid = String(SETUP_AP_SSID_PREFIX) + getChipSuffixUpper();

  WiFi.disconnect();
  delay(100);
  WiFi.mode(WIFI_AP_STA);

  const bool apStarted =
    hasText(SETUP_AP_PASSWORD)
      ? WiFi.softAP(setupPortalSsid.c_str(), SETUP_AP_PASSWORD)
      : WiFi.softAP(setupPortalSsid.c_str());

  if (!apStarted) {
    setupPortalActive = false;
    Serial.println("Failed to start setup AP.");
    setDeviceMode(DEVICE_MODE_ERROR);
    return;
  }

  localServer.on("/", HTTP_GET, sendSetupPage);
  localServer.on("/status", HTTP_GET, sendLocalStatus);
  localServer.on("/save", HTTP_POST, handleSaveCredentials);
  localServer.begin();

  Serial.print("Setup AP SSID: ");
  Serial.println(setupPortalSsid);
  Serial.print("Setup AP IP: ");
  Serial.println(WiFi.softAPIP());
  Serial.println("Local setup server started.");

  setDeviceMode(DEVICE_MODE_WIFI_CONNECTING);
}

void startWiFiConnection() {
  if (!hasRuntimeWiFiCredentials()) {
    if (ENABLE_FACTORY_SETUP_MODE) {
      startSetupPortal();
    } else {
      setDeviceMode(DEVICE_MODE_ERROR);
    }
    return;
  }

  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  WiFi.mode(WIFI_STA);
  WiFi.begin(runtimeWifiSsid.c_str(), runtimeWifiPassword.c_str());
  wifiAttemptStartedMs = millis();
  wifiConnectInProgress = true;
  lastWiFiRetryMs = wifiAttemptStartedMs;
  setDeviceMode(DEVICE_MODE_WIFI_CONNECTING);

  Serial.print("Connecting to WiFi SSID: ");
  Serial.println(runtimeWifiSsid);
}

void handleWiFiConnectivity() {
  if (WiFi.status() == WL_CONNECTED) {
    if (!lastWiFiConnectedState) {
      wifiConnectInProgress = false;
      lastWiFiConnectedState = true;
      Serial.print("WiFi connected. IP address: ");
      Serial.println(WiFi.localIP());
      setDeviceMode(DEVICE_MODE_MQTT_CONNECTING);
    }
    return;
  }

  if (lastWiFiConnectedState) {
    lastWiFiConnectedState = false;
    wifiConnectInProgress = false;
    if (mqttClient.connected()) {
      mqttClient.disconnect();
    }
    Serial.println("WiFi disconnected.");
    setDeviceMode(DEVICE_MODE_WIFI_CONNECTING);
  }

  if (setupPortalActive) {
    return;
  }

  if (!hasRuntimeWiFiCredentials()) {
    if (ENABLE_FACTORY_SETUP_MODE) {
      startSetupPortal();
    } else {
      setDeviceMode(DEVICE_MODE_ERROR);
    }
    return;
  }

  if (wifiConnectInProgress) {
    if (millis() - wifiAttemptStartedMs >= WIFI_CONNECT_TIMEOUT_MS) {
      wifiConnectInProgress = false;
      WiFi.disconnect();
      Serial.println("WiFi connect timeout.");

      if (ENABLE_FACTORY_SETUP_MODE) {
        startSetupPortal();
      }
    }
    return;
  }

  if (millis() - lastWiFiRetryMs >= WIFI_RETRY_MS) {
    startWiFiConnection();
  }
}

void rejectMovementCommand(const char* commandType, const String& reason) {
  movementLockedReason = reason;

  Serial.print("Rejecting ");
  Serial.print(commandType);
  Serial.print(": ");
  Serial.println(reason);

  setDeviceMode(isMoving() ? DEVICE_MODE_MOVING : getIdleModeFromConnectivity());
  publishStatus(true);
}

bool ensureSafeMovementAllowed(
  const char* commandType,
  int requestedPercent,
  int requestedDelta
) {
  if (movementLocked) {
    rejectMovementCommand(commandType, "Movement locked by operator.");
    return false;
  }

  if (!isCalibrationRestricted()) {
    return true;
  }

  if (strcmp(commandType, "SET_PERCENT") == 0 && requestedPercent >= 100) {
    rejectMovementCommand(
      commandType,
      "100% is blocked until closed and open are both set."
    );
    return false;
  }

  if (requestedDelta > getAllowedMaxPercentStep()) {
    String reason = "Safe setup mode only allows ";
    reason += getAllowedMaxPercentStep();
    reason += "% per command until closed and open are both set.";
    rejectMovementCommand(commandType, reason);
    return false;
  }

  return true;
}

bool ensureCalibrationCommandCanRun(const char* actionName) {
  if (!isMoving()) {
    return true;
  }

  String reason = actionName;
  reason += " requires the motor to stop first.";
  rejectMovementCommand(actionName, reason);
  return false;
}

void handleSetPercentCommand(int nextPercent, const char* source) {
  const int currentPercent = stepsToPercent(stepper.currentPosition());
  targetPercent = constrain(nextPercent, 0, 100);
  const int requestedDelta = abs(targetPercent - currentPercent);

  if (!ensureSafeMovementAllowed("SET_PERCENT", targetPercent, requestedDelta)) {
    return;
  }

  const long targetSteps = percentToSteps(targetPercent);
  syncMovementLockedReason();

  Serial.print("Command received: type=SET_PERCENT value=");
  Serial.print(targetPercent);
  Serial.print(" source=");
  Serial.print(source);
  Serial.print(" targetSteps=");
  Serial.println(targetSteps);

  stepper.moveTo(targetSteps);
  setDeviceMode(
    targetSteps == stepper.currentPosition()
      ? getIdleModeFromConnectivity()
      : DEVICE_MODE_MOVING
  );
  publishStatus(true);
}

void handleNudgeCommand(bool opening, int requestedAmount, const char* source) {
  const int currentPercent = stepsToPercent(stepper.currentPosition());
  const int amount =
    constrain(requestedAmount, 1, getAllowedMaxPercentStep());
  const int requestedDelta = amount;
  const int nextPercent = constrain(
    currentPercent + (opening ? amount : -amount),
    0,
    100
  );

  if (!ensureSafeMovementAllowed(
        opening ? "NUDGE_OPEN" : "NUDGE_CLOSE",
        nextPercent,
        requestedDelta)) {
    return;
  }

  targetPercent = nextPercent;
  rememberCalibrationAction(opening ? "NUDGE_OPEN" : "NUDGE_CLOSE");
  syncMovementLockedReason();

  long targetSteps = percentToSteps(targetPercent);

  if (isCalibrationRestricted()) {
    const long jogSteps = getCalibrationJogSteps(amount);
    const long directionSign = getOpenDirectionStepSign();
    targetSteps =
      stepper.currentPosition() +
      ((opening ? 1L : -1L) * directionSign * jogSteps);
    targetPercent = stepsToPercent(targetSteps);
  }

  Serial.print("Command received: type=");
  Serial.print(opening ? "NUDGE_OPEN" : "NUDGE_CLOSE");
  Serial.print(" amount=");
  Serial.print(amount);
  Serial.print(" source=");
  Serial.print(source);
  Serial.print(" targetPercent=");
  Serial.print(targetPercent);
  Serial.print(" targetSteps=");
  Serial.println(targetSteps);

  stepper.moveTo(targetSteps);
  setDeviceMode(
    targetSteps == stepper.currentPosition()
      ? getIdleModeFromConnectivity()
      : DEVICE_MODE_MOVING
  );
  publishStatus(true);
}

void handleSetCurrentAsClosedCommand(const char* source) {
  if (!ensureCalibrationCommandCanRun("SET_CURRENT_AS_CLOSED")) {
    return;
  }

  const long directionSign = getOpenDirectionStepSign();
  calibratedClosedPositionSteps = stepper.currentPosition();
  calibratedOpenPositionSteps =
    calibratedClosedPositionSteps +
    (directionSign * getCalibrationTravelSpanMagnitude());
  calibrationEndpointMask = CALIBRATION_ENDPOINT_CLOSED;
  calibrationComplete = false;
  stepper.moveTo(calibratedClosedPositionSteps);
  targetPercent = 0;
  rememberCalibrationAction("SET_CURRENT_AS_CLOSED");
  syncMovementLockedReason();
  saveCalibrationSettings();

  Serial.print("Command received: type=SET_CURRENT_AS_CLOSED source=");
  Serial.println(source);

  setDeviceMode(getIdleModeFromConnectivity());
  publishStatus(true);
}

void handleSetCurrentAsOpenCommand(const char* source) {
  if (!ensureCalibrationCommandCanRun("SET_CURRENT_AS_OPEN")) {
    return;
  }

  calibratedOpenPositionSteps = stepper.currentPosition();

  if (!hasMeaningfulCalibrationSpan()) {
    rejectMovementCommand(
      "SET_CURRENT_AS_OPEN",
      "Open position must be farther away from closed."
    );
    return;
  }

  calibrationEndpointMask =
    CALIBRATION_ENDPOINT_CLOSED | CALIBRATION_ENDPOINT_OPEN;
  stepper.moveTo(calibratedOpenPositionSteps);
  targetPercent = 100;
  rememberCalibrationAction("SET_CURRENT_AS_OPEN");
  applyMotionProfile();
  syncMovementLockedReason();
  saveCalibrationSettings();

  Serial.print("Command received: type=SET_CURRENT_AS_OPEN source=");
  Serial.println(source);

  setDeviceMode(getIdleModeFromConnectivity());
  publishStatus(true);
}

void handleMarkCalibrationCompleteCommand(const char* source) {
  if (!ensureCalibrationCommandCanRun("MARK_CALIBRATION_COMPLETE")) {
    return;
  }

  if (!hasMeaningfulCalibrationSpan()) {
    rejectMovementCommand(
      "MARK_CALIBRATION_COMPLETE",
      "Set wider closed and open positions before finishing calibration."
    );
    return;
  }

  calibrationComplete = true;
  calibrationEndpointMask =
    CALIBRATION_ENDPOINT_CLOSED | CALIBRATION_ENDPOINT_OPEN;
  rememberCalibrationAction("MARK_CALIBRATION_COMPLETE");
  applyMotionProfile();
  syncMovementLockedReason();
  saveCalibrationSettings();

  Serial.print("Command received: type=MARK_CALIBRATION_COMPLETE source=");
  Serial.println(source);

  setDeviceMode(getIdleModeFromConnectivity());
  publishStatus(true);
}

void handleSetDirectionCommand(bool nextDirectionInverted, const char* source) {
  if (!ensureCalibrationCommandCanRun(
        nextDirectionInverted
          ? "SET_DIRECTION_REVERSED"
          : "SET_DIRECTION_NORMAL")) {
    return;
  }

  directionInverted = nextDirectionInverted;
  resetCalibrationRangeToDefaults();
  calibrationComplete = false;
  stepper.setCurrentPosition(0);
  stepper.moveTo(0);
  targetPercent = 0;
  rememberCalibrationAction(
    nextDirectionInverted ? "SET_DIRECTION_REVERSED" : "SET_DIRECTION_NORMAL");
  applyMotionProfile();
  syncMovementLockedReason();
  saveCalibrationSettings();

  Serial.print("Command received: type=");
  Serial.print(
    nextDirectionInverted ? "SET_DIRECTION_REVERSED" : "SET_DIRECTION_NORMAL");
  Serial.print(" source=");
  Serial.println(source);

  setDeviceMode(getIdleModeFromConnectivity());
  publishStatus(true);
}

void handleLockMovementCommand(const char* source) {
  Serial.print("Command received: type=LOCK_MOVEMENT source=");
  Serial.println(source);

  movementLocked = true;
  rememberCalibrationAction("LOCK_MOVEMENT");
  stepper.stop();
  updateTargetPercentFromStepper();
  syncMovementLockedReason();
  setDeviceMode(isMoving() ? DEVICE_MODE_MOVING : getIdleModeFromConnectivity());
  publishStatus(true);
}

void handleUnlockMovementCommand(const char* source) {
  Serial.print("Command received: type=UNLOCK_MOVEMENT source=");
  Serial.println(source);

  movementLocked = false;
  rememberCalibrationAction("UNLOCK_MOVEMENT");
  syncMovementLockedReason();
  setDeviceMode(isMoving() ? DEVICE_MODE_MOVING : getIdleModeFromConnectivity());
  publishStatus(true);
}

void handleStopCommand(const char* source) {
  Serial.print("STOP received from ");
  Serial.print(source);
  Serial.print(", distanceToGo=");
  Serial.println(stepper.distanceToGo());

  stepper.stop();
  updateTargetPercentFromStepper();
  syncMovementLockedReason();
  setDeviceMode(isMoving() ? DEVICE_MODE_MOVING : getIdleModeFromConnectivity());
  publishStatus(true);
}

bool reportUpdateEvent(
  const char* status,
  const String& firmwareVersionFrom,
  const String& firmwareVersionTo,
  const String& detail
) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("OTA event skipped: WiFi is not connected.");
    return false;
  }

  const String url = buildApiUrl(OTA_EVENTS_PATH_TEMPLATE);
  if (url.length() == 0) {
    Serial.println("OTA event skipped: API_BASE_URL is not configured.");
    return false;
  }

  BearSSL::WiFiClientSecure secureHttpClient;
  WiFiClient plainHttpClient;
  HTTPClient http;

  Serial.print("OTA event -> ");
  Serial.print(status);
  Serial.print(" url=");
  Serial.println(url);

  if (!beginHttpClient(http, url, secureHttpClient, plainHttpClient)) {
    Serial.println("OTA event failed: unable to start HTTP client.");
    return false;
  }

  addOtaAuthHeaders(http);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<384> eventDoc;
  eventDoc["status"] = status;
  eventDoc["firmwareVersionFrom"] =
    firmwareVersionFrom.length() > 0 ? firmwareVersionFrom : FIRMWARE_VERSION;
  eventDoc["firmwareVersionTo"] =
    firmwareVersionTo.length() > 0 ? firmwareVersionTo : FIRMWARE_VERSION;
  eventDoc["detail"] = detail;

  String requestBody;
  serializeJson(eventDoc, requestBody);

  const int responseCode = http.POST(requestBody);
  http.end();

  if (responseCode < 200 || responseCode >= 300) {
    Serial.print("OTA event failed, response code=");
    Serial.println(responseCode);
    return false;
  }

  Serial.println("OTA event stored successfully.");
  return true;
}

bool fetchOtaManifest(OtaManifest* manifest) {
  if (manifest == nullptr) {
    return false;
  }

  const String url = buildApiUrl(OTA_MANIFEST_PATH_TEMPLATE);
  if (url.length() == 0) {
    Serial.println("OTA manifest request skipped: API_BASE_URL is not configured.");
    return false;
  }

  BearSSL::WiFiClientSecure secureHttpClient;
  WiFiClient plainHttpClient;
  HTTPClient http;

  Serial.print("OTA step: request manifest -> ");
  Serial.println(url);

  if (!beginHttpClient(http, url, secureHttpClient, plainHttpClient)) {
    Serial.println("OTA manifest request failed: unable to start HTTP client.");
    return false;
  }

  addOtaAuthHeaders(http);
  const int responseCode = http.GET();
  if (responseCode != HTTP_CODE_OK) {
    Serial.print("OTA manifest request failed, response code=");
    Serial.println(responseCode);
    http.end();
    return false;
  }

  const String responseBody = http.getString();
  http.end();

  StaticJsonDocument<768> manifestDoc;
  const DeserializationError error = deserializeJson(manifestDoc, responseBody);

  if (error) {
    Serial.print("OTA manifest parse failed: ");
    Serial.println(error.c_str());
    return false;
  }

  const String manifestDeviceId = String(manifestDoc["deviceId"] | "");
  if (!deviceIdsMatch(resolvedDeviceId, manifestDeviceId)) {
    Serial.print("OTA manifest rejected: deviceId mismatch. expected=");
    Serial.print(resolvedDeviceId);
    Serial.print(" received=");
    Serial.println(manifestDeviceId);
    return false;
  }

  manifest->updateAvailable = manifestDoc["updateAvailable"] | false;
  manifest->currentVersion = String(manifestDoc["currentVersion"] | "");
  manifest->latestVersion = String(manifestDoc["latestVersion"] | "");
  manifest->board = String(manifestDoc["board"] | "");
  manifest->channel = String(manifestDoc["channel"] | "");
  manifest->autoUpdateEnabled = manifestDoc["autoUpdateEnabled"] | false;
  manifest->autoUpdateChannel = String(manifestDoc["autoUpdateChannel"] | "stable");
  manifest->artifactUrl = String(manifestDoc["artifactUrl"] | "");
  manifest->sha256 = normalizeSha256(String(manifestDoc["sha256"] | ""));

  otaAutoUpdateEnabled = manifest->autoUpdateEnabled;
  otaAutoUpdateChannel =
    manifest->autoUpdateChannel.length() > 0
      ? manifest->autoUpdateChannel
      : "stable";

  if (manifestDoc["sizeBytes"].is<long>()) {
    manifest->sizeBytes = manifestDoc["sizeBytes"].as<long>();
  } else if (manifestDoc["sizeBytes"].is<int>()) {
    manifest->sizeBytes = manifestDoc["sizeBytes"].as<int>();
  } else {
    manifest->sizeBytes = -1;
  }

  Serial.print("OTA manifest updateAvailable=");
  Serial.print(manifest->updateAvailable ? "true" : "false");
  Serial.print(" latest=");
  Serial.print(
    manifest->latestVersion.length() > 0 ? manifest->latestVersion : "none");
  Serial.print(" auto=");
  Serial.print(manifest->autoUpdateEnabled ? "true" : "false");
  Serial.print(" channel=");
  Serial.print(
    manifest->autoUpdateChannel.length() > 0
      ? manifest->autoUpdateChannel
      : "stable");
  Serial.print(" board=");
  Serial.println(manifest->board.length() > 0 ? manifest->board : "unknown");

  return true;
}

bool verifySha256(const String& expectedSha256, const String& actualSha256) {
  const String normalizedExpected = normalizeSha256(expectedSha256);
  const String normalizedActual = normalizeSha256(actualSha256);

  Serial.print("OTA step: verify sha256 expected=");
  Serial.print(normalizedExpected);
  Serial.print(" actual=");
  Serial.println(normalizedActual);

  return normalizedExpected.length() == 64 &&
         normalizedExpected == normalizedActual;
}

bool downloadFirmware(
  const OtaManifest& manifest,
  OtaDownloadResult* downloadResult
) {
  if (downloadResult == nullptr) {
    return false;
  }

  if (manifest.artifactUrl.length() == 0) {
    Serial.println("OTA download skipped: artifactUrl is missing.");
    return false;
  }

  BearSSL::WiFiClientSecure secureHttpClient;
  WiFiClient plainHttpClient;
  HTTPClient http;

  Serial.print("OTA step: download firmware -> ");
  Serial.println(manifest.artifactUrl);

  if (!beginHttpClient(http, manifest.artifactUrl, secureHttpClient, plainHttpClient)) {
    Serial.println("OTA download failed: unable to start HTTP client.");
    return false;
  }

  const int responseCode = http.GET();
  if (responseCode != HTTP_CODE_OK) {
    Serial.print("OTA download failed, response code=");
    Serial.println(responseCode);
    http.end();
    return false;
  }

  const int contentLength = http.getSize();
  if (
    manifest.sizeBytes > 0 &&
    contentLength > 0 &&
    manifest.sizeBytes != contentLength
  ) {
    Serial.print("OTA download rejected: manifest size ");
    Serial.print(manifest.sizeBytes);
    Serial.print(" does not match HTTP size ");
    Serial.println(contentLength);
    http.end();
    return false;
  }

  const size_t updateSize =
    manifest.sizeBytes > 0
      ? static_cast<size_t>(manifest.sizeBytes)
      : (contentLength > 0
           ? static_cast<size_t>(contentLength)
           : getAvailableOtaSketchSpace());

  if (!Update.begin(updateSize)) {
    Serial.print("OTA update begin failed, error=");
    Serial.println(Update.getError());
    http.end();
    return false;
  }

  WiFiClient* stream = http.getStreamPtr();
  unsigned char buffer[1024];
  unsigned char digest[32];
  br_sha256_context shaContext;
  br_sha256_init(&shaContext);

  size_t totalWritten = 0;
  bool success = true;

  while (http.connected() &&
         (contentLength < 0 ||
          totalWritten < static_cast<size_t>(contentLength))) {
    const int availableBytes = stream->available();

    if (availableBytes <= 0) {
      delay(1);
      continue;
    }

    const size_t bytesToRead =
      availableBytes > static_cast<int>(sizeof(buffer))
        ? sizeof(buffer)
        : static_cast<size_t>(availableBytes);
    const size_t bytesRead =
      stream->readBytes(reinterpret_cast<char*>(buffer), bytesToRead);

    if (bytesRead == 0) {
      delay(1);
      continue;
    }

    br_sha256_update(&shaContext, buffer, bytesRead);

    const size_t writtenBytes = Update.write(buffer, bytesRead);
    if (writtenBytes != bytesRead) {
      Serial.print("OTA write failed after bytes=");
      Serial.println(totalWritten);
      success = false;
      break;
    }

    totalWritten += writtenBytes;
  }

  br_sha256_out(&shaContext, digest);
  http.end();

  if (!success) {
    Update.end(false);
    return false;
  }

  if (
    manifest.sizeBytes > 0 &&
    totalWritten != static_cast<size_t>(manifest.sizeBytes)
  ) {
    Serial.print("OTA download size mismatch. Expected ");
    Serial.print(manifest.sizeBytes);
    Serial.print(" bytes, received ");
    Serial.println(totalWritten);
    Update.end(false);
    return false;
  }

  if (contentLength > 0 && totalWritten != static_cast<size_t>(contentLength)) {
    Serial.print("OTA HTTP stream ended early at bytes=");
    Serial.println(totalWritten);
    Update.end(false);
    return false;
  }

  downloadResult->downloadedBytes = totalWritten;
  downloadResult->computedSha256 = bytesToHexString(digest, sizeof(digest));

  Serial.print("OTA download finished bytes=");
  Serial.print(downloadResult->downloadedBytes);
  Serial.print(" sha256=");
  Serial.println(downloadResult->computedSha256);

  return true;
}

bool installFirmware(
  const OtaManifest& manifest,
  const OtaDownloadResult& downloadResult
) {
  Serial.print("OTA step: install firmware version ");
  Serial.print(manifest.latestVersion);
  Serial.print(" bytes=");
  Serial.println(downloadResult.downloadedBytes);

  if (!Update.end()) {
    Serial.print("OTA install failed, error=");
    Serial.println(Update.getError());
    return false;
  }

  if (!Update.isFinished()) {
    Serial.println("OTA install failed: update did not finish cleanly.");
    Update.end(false);
    return false;
  }

  Serial.println("OTA install complete. Device will reboot into the new firmware.");
  return true;
}

bool checkForUpdate(bool autoCheck) {
  Serial.print("OTA step: checkForUpdate(");
  Serial.print(autoCheck ? "auto" : "manual");
  Serial.println(")");

  if (!ENABLE_OTA_UPDATES) {
    Serial.println("OTA is disabled in config.h.");
    setOtaState(OTA_STATE_DISABLED, "", "OTA disabled");
    reportUpdateEvent(
      "update_blocked_ota_disabled",
      FIRMWARE_VERSION,
      FIRMWARE_VERSION,
      "OTA disabled"
    );
    return false;
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("OTA check failed: WiFi is not connected.");
    if (autoCheck) {
      reportUpdateEvent(
        "update_not_available",
        FIRMWARE_VERSION,
        FIRMWARE_VERSION,
        "Auto-check skipped because WiFi is not connected"
      );
      return false;
    }
    setOtaState(OTA_STATE_FAILED, "", "WiFi not connected");
    reportUpdateEvent(
      "update_failed",
      FIRMWARE_VERSION,
      FIRMWARE_VERSION,
      "WiFi not connected"
    );
    return false;
  }

  if (isMoving()) {
    Serial.println("OTA check refused: motor is moving.");
    if (autoCheck) {
      reportUpdateEvent(
        "update_blocked_motor_moving",
        FIRMWARE_VERSION,
        FIRMWARE_VERSION,
        "Auto-check skipped because the motor is moving"
      );
      return false;
    }
    setOtaState(OTA_STATE_FAILED, "", "Motor is moving");
    reportUpdateEvent(
      "update_blocked_motor_moving",
      FIRMWARE_VERSION,
      FIRMWARE_VERSION,
      "Motor is moving"
    );
    return false;
  }

  setOtaState(OTA_STATE_CHECKING_MANIFEST, "", "");

  OtaManifest manifest;
  if (!fetchOtaManifest(&manifest)) {
    setOtaState(OTA_STATE_FAILED, "", "Manifest request failed");
    reportUpdateEvent(
      "update_failed",
      FIRMWARE_VERSION,
      FIRMWARE_VERSION,
      "Manifest request failed"
    );
    return false;
  }

  if (!manifest.updateAvailable) {
    Serial.println("OTA manifest says device is already on the latest version.");
    setOtaState(OTA_STATE_IDLE, "", "");
    reportUpdateEvent(
      "update_not_available",
      FIRMWARE_VERSION,
      manifest.latestVersion.length() > 0
        ? manifest.latestVersion
        : FIRMWARE_VERSION,
      "Manifest reported no update"
    );
    return false;
  }

  if (autoCheck && !manifest.autoUpdateEnabled) {
    Serial.println("OTA auto-check found an update, but auto updates are off.");
    setOtaState(OTA_STATE_IDLE, manifest.latestVersion, "");
    reportUpdateEvent(
      "update_not_available",
      FIRMWARE_VERSION,
      manifest.latestVersion,
      "Auto update is disabled for this device"
    );
    return false;
  }

  setOtaState(OTA_STATE_UPDATE_AVAILABLE, manifest.latestVersion, "");
  reportUpdateEvent(
    "update_available",
    FIRMWARE_VERSION,
    manifest.latestVersion,
    "Manifest reported an update"
  );

  if (
    manifest.board.length() > 0 &&
    manifest.board != "esp8266-d1d4"
  ) {
    Serial.print("OTA manifest rejected: unsupported board ");
    Serial.println(manifest.board);
    setOtaState(
      OTA_STATE_FAILED,
      manifest.latestVersion,
      "Unsupported board in manifest"
    );
    reportUpdateEvent(
      "update_failed",
      FIRMWARE_VERSION,
      manifest.latestVersion,
      "Unsupported board in manifest"
    );
    return false;
  }

  if (manifest.artifactUrl.length() == 0 || manifest.sha256.length() != 64) {
    Serial.println("OTA manifest rejected: artifactUrl or sha256 is missing.");
    setOtaState(
      OTA_STATE_FAILED,
      manifest.latestVersion,
      "Manifest missing artifactUrl or sha256"
    );
    reportUpdateEvent(
      "update_failed",
      FIRMWARE_VERSION,
      manifest.latestVersion,
      "Manifest missing artifactUrl or sha256"
    );
    return false;
  }

  setOtaState(OTA_STATE_DOWNLOADING, manifest.latestVersion, "");
  reportUpdateEvent(
    "update_started",
    FIRMWARE_VERSION,
    manifest.latestVersion,
    "OTA download starting"
  );

  OtaDownloadResult downloadResult;
  if (!downloadFirmware(manifest, &downloadResult)) {
    setOtaState(
      OTA_STATE_FAILED,
      manifest.latestVersion,
      "Firmware download failed"
    );
    reportUpdateEvent(
      "update_failed",
      FIRMWARE_VERSION,
      manifest.latestVersion,
      "Firmware download failed"
    );
    return false;
  }

  setOtaState(OTA_STATE_VERIFYING_HASH, manifest.latestVersion, "");
  if (!verifySha256(manifest.sha256, downloadResult.computedSha256)) {
    Serial.println("OTA sha256 verification failed.");
    discardPendingOtaUpdate();
    setOtaState(OTA_STATE_FAILED, manifest.latestVersion, "sha256 mismatch");
    reportUpdateEvent(
      "update_failed",
      FIRMWARE_VERSION,
      manifest.latestVersion,
      "sha256 mismatch"
    );
    return false;
  }

  setOtaState(OTA_STATE_INSTALLING, manifest.latestVersion, "");
  if (!installFirmware(manifest, downloadResult)) {
    setOtaState(OTA_STATE_FAILED, manifest.latestVersion, "Install failed");
    reportUpdateEvent(
      "update_failed",
      FIRMWARE_VERSION,
      manifest.latestVersion,
      "Install failed"
    );
    return false;
  }

  setOtaState(OTA_STATE_SUCCESS_PENDING_REBOOT, manifest.latestVersion, "");
  reportUpdateEvent(
    "update_success",
    FIRMWARE_VERSION,
    manifest.latestVersion,
    String("Installed bytes=") + downloadResult.downloadedBytes
  );

  setOtaState(OTA_STATE_REBOOTING, manifest.latestVersion, "");
  Serial.println("OTA success. Rebooting in 750ms.");
  delay(750);
  ESP.restart();
  return true;
}

void handleCheckUpdateCommand(const char* source) {
  Serial.print("Command received: type=CHECK_UPDATE source=");
  Serial.println(source);

  if (!checkForUpdate(false)) {
    publishStatus(true);
  }
}

bool connectMqtt() {
  if (WiFi.status() != WL_CONNECTED) {
    setDeviceMode(DEVICE_MODE_WIFI_CONNECTING);
    return false;
  }

  if (mqttClient.connected()) {
    return true;
  }

  secureClient.setInsecure();
  mqttClient.setServer(MQTT_HOST, MQTT_PORT);

  setDeviceMode(DEVICE_MODE_MQTT_CONNECTING);

  char offlinePayload[1024];
  buildStatusPayload(
    offlinePayload,
    sizeof(offlinePayload),
    false,
    DEVICE_MODE_ERROR,
    false
  );

  Serial.print("Connecting to MQTT host: ");
  Serial.println(MQTT_HOST);

  const bool connected = mqttClient.connect(
    resolvedMqttClientId.c_str(),
    MQTT_USERNAME,
    MQTT_PASSWORD,
    resolvedStatusTopic.c_str(),
    0,
    true,
    offlinePayload
  );

  if (!connected) {
    Serial.print("MQTT connect failed, rc=");
    Serial.println(mqttClient.state());
    setDeviceMode(DEVICE_MODE_ERROR);
    return false;
  }

  Serial.println("MQTT connected.");
  if (!mqttClient.subscribe(resolvedCommandTopic.c_str(), 1)) {
    Serial.println("Failed to subscribe to command topic.");
    mqttClient.disconnect();
    setDeviceMode(DEVICE_MODE_ERROR);
    return false;
  }

  Serial.print("Subscribed to command topic: ");
  Serial.println(resolvedCommandTopic);
  setDeviceMode(DEVICE_MODE_READY);
  publishStatus(true);
  return true;
}

bool otaCheckInProgress() {
  return otaState == OTA_STATE_CHECKING_MANIFEST ||
         otaState == OTA_STATE_UPDATE_AVAILABLE ||
         otaState == OTA_STATE_DOWNLOADING ||
         otaState == OTA_STATE_VERIFYING_HASH ||
         otaState == OTA_STATE_INSTALLING ||
         otaState == OTA_STATE_SUCCESS_PENDING_REBOOT ||
         otaState == OTA_STATE_REBOOTING;
}

void maybeRunAutoUpdateCheck() {
  if (!ENABLE_OTA_UPDATES || setupPortalActive || WiFi.status() != WL_CONNECTED) {
    return;
  }

  if (isMoving() || otaCheckInProgress()) {
    return;
  }

  const unsigned long now = millis();
  const unsigned long autoCheckInitialDelayMs =
    OTA_AUTO_CHECK_INITIAL_DELAY_MS + otaAutoCheckJitterMs;
  const unsigned long autoCheckIntervalMs =
    OTA_AUTO_CHECK_INTERVAL_MS + otaAutoCheckJitterMs;

  if (now - bootStartedMs < autoCheckInitialDelayMs) {
    return;
  }

  if (lastAutoUpdateCheckMs != 0 && now - lastAutoUpdateCheckMs < autoCheckIntervalMs) {
    return;
  }

  lastAutoUpdateCheckMs = now;
  if (!checkForUpdate(true)) {
    publishStatus(true);
  }
}

void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  Serial.print("MQTT message received on ");
  Serial.println(topic);

  StaticJsonDocument<256> commandDoc;
  const DeserializationError error = deserializeJson(commandDoc, payload, length);

  if (error) {
    Serial.print("Failed to parse command JSON: ");
    Serial.println(error.c_str());
    setDeviceMode(DEVICE_MODE_ERROR);
    publishStatus(true);
    return;
  }

  const char* type = commandDoc["type"] | "";

  if (strcmp(type, "STOP") == 0) {
    handleStopCommand("mqtt");
    return;
  }

  if (strcmp(type, "CHECK_UPDATE") == 0) {
    handleCheckUpdateCommand("mqtt");
    return;
  }

  if (strcmp(type, "NUDGE_OPEN") == 0 || strcmp(type, "NUDGE_CLOSE") == 0) {
    int amount = SAFE_DEFAULT_NUDGE_PERCENT;
    if (tryReadCommandInt(commandDoc["amount"], &amount)) {
      amount = constrain(amount, 1, SAFE_ALLOWED_MAX_PERCENT_STEP);
    }
    handleNudgeCommand(strcmp(type, "NUDGE_OPEN") == 0, amount, "mqtt");
    return;
  }

  if (strcmp(type, "SET_CURRENT_AS_CLOSED") == 0) {
    handleSetCurrentAsClosedCommand("mqtt");
    return;
  }

  if (strcmp(type, "SET_CURRENT_AS_OPEN") == 0) {
    handleSetCurrentAsOpenCommand("mqtt");
    return;
  }

  if (strcmp(type, "MARK_CALIBRATION_COMPLETE") == 0) {
    handleMarkCalibrationCompleteCommand("mqtt");
    return;
  }

  if (strcmp(type, "SET_DIRECTION_NORMAL") == 0) {
    handleSetDirectionCommand(false, "mqtt");
    return;
  }

  if (strcmp(type, "SET_DIRECTION_REVERSED") == 0) {
    handleSetDirectionCommand(true, "mqtt");
    return;
  }

  if (strcmp(type, "LOCK_MOVEMENT") == 0) {
    handleLockMovementCommand("mqtt");
    return;
  }

  if (strcmp(type, "UNLOCK_MOVEMENT") == 0) {
    handleUnlockMovementCommand("mqtt");
    return;
  }

  if (strcmp(type, "SET_PERCENT") != 0) {
    Serial.println("Ignoring unsupported command type.");
    setDeviceMode(DEVICE_MODE_ERROR);
    publishStatus(true);
    return;
  }

  int nextPercent = 0;
  if (!tryReadCommandInt(commandDoc["value"], &nextPercent)) {
    Serial.println("Ignoring SET_PERCENT command without numeric `value`.");
    setDeviceMode(DEVICE_MODE_ERROR);
    publishStatus(true);
    return;
  }

  nextPercent = constrain(nextPercent, 0, 100);
  handleSetPercentCommand(nextPercent, "mqtt");
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  bootStartedMs = millis();
  otaAutoCheckJitterMs =
    OTA_AUTO_CHECK_JITTER_MS > 0
      ? ESP.getChipId() % (OTA_AUTO_CHECK_JITTER_MS + 1UL)
      : 0;

  Serial.println("Smart Shutter ESP8266 D1-D4 Stepper booting...");
  setDeviceMode(DEVICE_MODE_BOOTING);

  resolvedDeviceId = resolveDeviceId();
  resolvedMqttClientId = resolveMqttClientId();
  resolvedCommandTopic = resolveTopic(COMMAND_TOPIC, "commands");
  resolvedStatusTopic = resolveTopic(STATUS_TOPIC, "status");
  resolveRuntimeWiFiCredentials();
  setupPortalSsid = String(SETUP_AP_SSID_PREFIX) + getChipSuffixUpper();

  Serial.print("Resolved deviceId: ");
  Serial.println(resolvedDeviceId);
  Serial.print("Resolved MQTT client ID: ");
  Serial.println(resolvedMqttClientId);
  Serial.print("Resolved command topic: ");
  Serial.println(resolvedCommandTopic);
  Serial.print("Resolved status topic: ");
  Serial.println(resolvedStatusTopic);
  Serial.println("MQTT topics resolved.");

  WiFi.persistent(false);
  WiFi.setAutoReconnect(true);

  mqttClient.setCallback(onMqttMessage);
  mqttClient.setKeepAlive(30);
  mqttClient.setBufferSize(1024);

  applyMotionProfile();
  syncMovementLockedReason();
  updateTargetPercentFromStepper();

  if (hasRuntimeWiFiCredentials()) {
    startWiFiConnection();
  } else if (ENABLE_FACTORY_SETUP_MODE) {
    startSetupPortal();
  } else {
    setDeviceMode(DEVICE_MODE_ERROR);
  }
}

void loop() {
  if (setupPortalActive) {
    localServer.handleClient();
  }

  handleWiFiConnectivity();

  if (WiFi.status() == WL_CONNECTED) {
    if (!mqttClient.connected() && millis() - lastMqttRetryMs >= MQTT_RETRY_MS) {
      lastMqttRetryMs = millis();
      connectMqtt();
    }

    mqttClient.loop();
  }

  stepper.run();

  const bool movingNow = isMoving();
  if (movingNow != lastMovingState) {
    lastMovingState = movingNow;

    if (movingNow) {
      setDeviceMode(DEVICE_MODE_MOVING);
    } else {
      updateTargetPercentFromStepper();
      setDeviceMode(getIdleModeFromConnectivity());
    }

    publishStatus(true);
  }

  if (
    setupPortalActive &&
    SETUP_PORTAL_TIMEOUT_MS > 0 &&
    millis() - setupPortalStartedMs >= SETUP_PORTAL_TIMEOUT_MS
  ) {
    setupPortalStartedMs = millis();
    Serial.println("Setup portal timeout reached; keeping AP active for support.");
  }

  if (mqttClient.connected() && !movingNow) {
    if (millis() - lastStatusPublishMs >= STATUS_INTERVAL_MS) {
      publishStatus(false);
    }
  }

  maybeRunAutoUpdateCheck();
}
