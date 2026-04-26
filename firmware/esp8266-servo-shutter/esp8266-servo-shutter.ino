#include <ArduinoJson.h>
#include <EEPROM.h>
#include <ESP8266WebServer.h>
#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include <Servo.h>
#include <WiFiClientSecureBearSSL.h>

#if defined(__has_include)
#if __has_include("config.h")
#include "config.h"
#else
#error "Missing config.h. Copy firmware/esp8266-servo-shutter/config.example.h to firmware/esp8266-servo-shutter/config.h and fill in your WiFi and MQTT settings before compiling."
#endif
#else
#error "Compiler does not support __has_include. Create firmware/esp8266-servo-shutter/config.h from config.example.h before compiling."
#endif

#ifndef FIRMWARE_VERSION
#define FIRMWARE_VERSION "0.1.0-dev-esp8266-servo"
#endif

#ifndef ENABLE_OTA_UPDATES
#define ENABLE_OTA_UPDATES false
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

#ifndef SAFE_SETUP_MODE
#define SAFE_SETUP_MODE true
#endif

#ifndef SAFE_ALLOWED_MAX_PERCENT_STEP
#define SAFE_ALLOWED_MAX_PERCENT_STEP 10
#endif

#ifndef SAFE_DEFAULT_NUDGE_PERCENT
#define SAFE_DEFAULT_NUDGE_PERCENT 2
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

struct StoredWiFiCredentials {
  uint32_t magic;
  char ssid[64];
  char password[64];
};

constexpr uint32_t STORED_WIFI_MAGIC = 0x53535431;

BearSSL::WiFiClientSecure secureClient;
PubSubClient mqttClient(secureClient);
ESP8266WebServer localServer(80);
Servo shutterServo;

DeviceMode deviceMode = DEVICE_MODE_BOOTING;
OtaState otaState = ENABLE_OTA_UPDATES ? OTA_STATE_IDLE : OTA_STATE_DISABLED;

unsigned long bootStartedMs = 0;
unsigned long lastStatusPublishMs = 0;
unsigned long lastStatusLogMs = 0;
unsigned long lastMqttRetryMs = 0;
unsigned long lastWiFiRetryMs = 0;
unsigned long lastMotionStepMs = 0;
unsigned long wifiAttemptStartedMs = 0;
unsigned long setupPortalStartedMs = 0;

bool setupModeActive = false;
bool wifiConnectInProgress = false;
bool movementLocked = false;
bool calibrationComplete = !SAFE_SETUP_MODE;
bool lastMovingState = false;
bool lastWiFiConnectedState = false;
bool servoAttached = false;

int closedAngle = SERVO_CLOSED_ANGLE;
int openAngle = SERVO_OPEN_ANGLE;
int currentServoAngle = SERVO_STARTUP_ANGLE;
int targetServoAngle = SERVO_STARTUP_ANGLE;
int currentPercent = 0;
int targetPercent = 0;

String resolvedDeviceId = "";
String resolvedMqttClientId = "";
String resolvedCommandTopic = "";
String resolvedStatusTopic = "";
String setupPortalSsid = "";
String runtimeWifiSsid = "";
String runtimeWifiPassword = "";
String otaLastError = "";
String otaTargetVersion = "";
String lastCalibrationAction =
  SAFE_SETUP_MODE ? "SAFE_SETUP_MODE_ENABLED" : "";
String movementLockedReason =
  SAFE_SETUP_MODE ? "Calibration required before larger movement." : "";

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

void setDeviceMode(DeviceMode nextMode) {
  if (deviceMode == nextMode) {
    return;
  }

  deviceMode = nextMode;
  Serial.print("Device mode -> ");
  Serial.println(deviceModeToString(deviceMode));
}

bool isCalibrationRestricted() {
  return SAFE_SETUP_MODE && !calibrationComplete;
}

bool isSafetyModeActive() {
  return SAFE_SETUP_MODE;
}

int getAllowedMaxPercentStep() {
  return isCalibrationRestricted() ? SAFE_ALLOWED_MAX_PERCENT_STEP : 100;
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

void loadStoredWiFiCredentials(String* ssid, String* password) {
  if (ssid == nullptr || password == nullptr) {
    return;
  }

  EEPROM.begin(sizeof(StoredWiFiCredentials));

  StoredWiFiCredentials stored = {};
  EEPROM.get(0, stored);

  if (stored.magic != STORED_WIFI_MAGIC) {
    *ssid = "";
    *password = "";
    return;
  }

  stored.ssid[sizeof(stored.ssid) - 1] = '\0';
  stored.password[sizeof(stored.password) - 1] = '\0';

  *ssid = String(stored.ssid);
  *password = String(stored.password);
}

bool saveStoredWiFiCredentials(const String& ssid, const String& password) {
  EEPROM.begin(sizeof(StoredWiFiCredentials));

  StoredWiFiCredentials stored = {};
  stored.magic = STORED_WIFI_MAGIC;
  copyStringToBuffer(ssid, stored.ssid, sizeof(stored.ssid));
  copyStringToBuffer(password, stored.password, sizeof(stored.password));

  EEPROM.put(0, stored);
  const bool committed = EEPROM.commit();

  if (committed) {
    Serial.print("WiFi credentials saved for SSID: ");
    Serial.println(ssid);
  } else {
    Serial.println("Failed to save WiFi credentials.");
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

int clampPercent(int percent) {
  return constrain(percent, 0, 100);
}

int clampServoAngle(int angle) {
  return constrain(angle, 0, 180);
}

int percentToAngle(int percent) {
  const int clampedPercent = clampPercent(percent);
  const float ratio = static_cast<float>(clampedPercent) / 100.0f;
  const float nextAngle = static_cast<float>(closedAngle) +
    (static_cast<float>(openAngle - closedAngle) * ratio);
  return clampServoAngle(static_cast<int>(round(nextAngle)));
}

int angleToPercent(int angle) {
  if (openAngle == closedAngle) {
    return 0;
  }

  const float ratio =
    static_cast<float>(angle - closedAngle) /
    static_cast<float>(openAngle - closedAngle);
  return clampPercent(static_cast<int>(round(ratio * 100.0f)));
}

bool isMoving() {
  return currentServoAngle != targetServoAngle;
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

void attachServoIfNeeded() {
  if (servoAttached) {
    return;
  }

  shutterServo.attach(SERVO_SIGNAL_PIN);
  servoAttached = true;
}

void writeServoAngle(int angle) {
  attachServoIfNeeded();
  shutterServo.write(clampServoAngle(angle));
}

void setStatusLedRaw(bool active) {
  if (STATUS_LED_PIN < 0) {
    return;
  }

  const int activeLevel = STATUS_LED_ACTIVE_LOW ? LOW : HIGH;
  const int inactiveLevel = STATUS_LED_ACTIVE_LOW ? HIGH : LOW;
  digitalWrite(STATUS_LED_PIN, active ? activeLevel : inactiveLevel);
}

void updateStatusLed() {
  if (STATUS_LED_PIN < 0) {
    return;
  }

  if (setupModeActive) {
    const bool blinkOn = ((millis() / 250UL) % 2UL) == 0UL;
    setStatusLedRaw(blinkOn);
    return;
  }

  if (mqttClient.connected()) {
    setStatusLedRaw(true);
    return;
  }

  if (WiFi.status() == WL_CONNECTED) {
    const bool blinkOn = ((millis() / 500UL) % 2UL) == 0UL;
    setStatusLedRaw(blinkOn);
    return;
  }

  setStatusLedRaw(false);
}

void setOtaState(
  OtaState nextState,
  const String& nextTargetVersion,
  const String& nextLastError
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
  statusDoc["setupMode"] = setupModeActive;
  statusDoc["firmwareVersion"] = FIRMWARE_VERSION;
  statusDoc["deviceUptimeMs"] = millis() - bootStartedMs;
  statusDoc["online"] = onlineValue;
  statusDoc["moving"] = movingValue;
  statusDoc["deviceMode"] = deviceModeToString(modeValue);
  statusDoc["estimatedPercent"] = currentPercent;
  statusDoc["targetPercent"] = targetPercent;
  statusDoc["currentServoAngle"] = currentServoAngle;
  statusDoc["targetServoAngle"] = targetServoAngle;
  statusDoc["wifiConnected"] = WiFi.status() == WL_CONNECTED;
  statusDoc["mqttConnected"] = mqttClient.connected();
  if (WiFi.status() == WL_CONNECTED) {
    statusDoc["rssi"] = WiFi.RSSI();
  } else {
    statusDoc["rssi"] = nullptr;
  }
  statusDoc["otaEnabled"] = ENABLE_OTA_UPDATES;
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
  Serial.print(currentPercent);
  Serial.print("% target=");
  Serial.print(targetPercent);
  Serial.print("% angle=");
  Serial.print(currentServoAngle);
  Serial.print(" moving=");
  Serial.print(movingValue ? "true" : "false");
  Serial.print(" safe=");
  Serial.print(isSafetyModeActive() ? "true" : "false");
  Serial.print(" calibrated=");
  Serial.print(calibrationComplete ? "true" : "false");
  Serial.print(" ota=");
  Serial.println(otaStateToString(otaState));
}

void publishStatus(bool forceLog = false) {
  if (!mqttClient.connected()) {
    return;
  }

  char payload[1024];
  const bool movingNow = isMoving();
  const DeviceMode reportedMode =
    movingNow ? DEVICE_MODE_MOVING : deviceMode;
  buildStatusPayload(payload, sizeof(payload), true, reportedMode, movingNow);
  const bool published =
    mqttClient.publish(resolvedStatusTopic.c_str(), payload, true);

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
    "<title>Smart Shutter Servo Setup</title>"
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
    "<h1>Connect Smart Shutter Servo to WiFi</h1>";

  page += "<p>Device ID: <strong>";
  page += resolvedDeviceId;
  page += "</strong></p>";
  page +=
    "<p>Enter your 2.4 GHz WiFi network, save it, and wait for the device to reboot.</p>";

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
    localServer.send(400, "text/plain", "WiFi name is required.");
    return;
  }

  if (!saveStoredWiFiCredentials(ssid, password)) {
    localServer.send(500, "text/plain", "Unable to save WiFi credentials.");
    return;
  }

  runtimeWifiSsid = ssid;
  runtimeWifiPassword = password;

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
  if (setupModeActive) {
    return;
  }

  setupModeActive = true;
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
    setupModeActive = false;
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
      setupModeActive = false;
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

  if (setupModeActive) {
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

void updateMotionTargetsFromCurrentAngle() {
  currentPercent = angleToPercent(currentServoAngle);
  targetServoAngle = currentServoAngle;
  targetPercent = currentPercent;
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
      "100% is blocked until calibration is complete.");
    return false;
  }

  if (requestedDelta > getAllowedMaxPercentStep()) {
    String reason = "Safe setup mode only allows ";
    reason += getAllowedMaxPercentStep();
    reason += "% per command until calibration is complete.";
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
  reason += " requires movement to stop first.";
  rejectMovementCommand(actionName, reason);
  return false;
}

void beginMoveToPercent(int nextPercent, const char* actionName, const char* source) {
  targetPercent = clampPercent(nextPercent);
  targetServoAngle = percentToAngle(targetPercent);
  syncMovementLockedReason();

  Serial.print("Command received: type=");
  Serial.print(actionName);
  Serial.print(" source=");
  Serial.print(source);
  Serial.print(" targetPercent=");
  Serial.print(targetPercent);
  Serial.print(" targetServoAngle=");
  Serial.println(targetServoAngle);

  setDeviceMode(
    targetServoAngle == currentServoAngle
      ? getIdleModeFromConnectivity()
      : DEVICE_MODE_MOVING
  );
  publishStatus(true);
}

void handleSetPercentCommand(int nextPercent, const char* source) {
  const int requestedPercent = clampPercent(nextPercent);
  const int requestedDelta = abs(requestedPercent - currentPercent);

  if (!ensureSafeMovementAllowed(
        "SET_PERCENT",
        requestedPercent,
        requestedDelta)) {
    return;
  }

  beginMoveToPercent(requestedPercent, "SET_PERCENT", source);
}

void handleNudgeCommand(bool opening, int requestedAmount, const char* source) {
  const int amount =
    constrain(requestedAmount, 1, getAllowedMaxPercentStep());
  const int nextPercent = constrain(
    currentPercent + (opening ? amount : -amount),
    0,
    100
  );
  const int requestedDelta = abs(nextPercent - currentPercent);

  if (!ensureSafeMovementAllowed(
        opening ? "NUDGE_OPEN" : "NUDGE_CLOSE",
        nextPercent,
        requestedDelta)) {
    return;
  }

  rememberCalibrationAction(opening ? "NUDGE_OPEN" : "NUDGE_CLOSE");
  beginMoveToPercent(
    nextPercent,
    opening ? "NUDGE_OPEN" : "NUDGE_CLOSE",
    source
  );
}

void handleSetCurrentAsClosedCommand(const char* source) {
  if (!ensureCalibrationCommandCanRun("SET_CURRENT_AS_CLOSED")) {
    return;
  }

  closedAngle = currentServoAngle;
  updateMotionTargetsFromCurrentAngle();
  currentPercent = 0;
  targetPercent = 0;
  rememberCalibrationAction("SET_CURRENT_AS_CLOSED");
  syncMovementLockedReason();

  Serial.print("Command received: type=SET_CURRENT_AS_CLOSED source=");
  Serial.println(source);

  setDeviceMode(getIdleModeFromConnectivity());
  publishStatus(true);
}

void handleSetCurrentAsOpenCommand(const char* source) {
  if (!ensureCalibrationCommandCanRun("SET_CURRENT_AS_OPEN")) {
    return;
  }

  openAngle = currentServoAngle;
  updateMotionTargetsFromCurrentAngle();
  currentPercent = 100;
  targetPercent = 100;
  rememberCalibrationAction("SET_CURRENT_AS_OPEN");
  syncMovementLockedReason();

  Serial.print("Command received: type=SET_CURRENT_AS_OPEN source=");
  Serial.println(source);

  setDeviceMode(getIdleModeFromConnectivity());
  publishStatus(true);
}

void handleMarkCalibrationCompleteCommand(const char* source) {
  if (!ensureCalibrationCommandCanRun("MARK_CALIBRATION_COMPLETE")) {
    return;
  }

  calibrationComplete = true;
  rememberCalibrationAction("MARK_CALIBRATION_COMPLETE");
  syncMovementLockedReason();

  Serial.print("Command received: type=MARK_CALIBRATION_COMPLETE source=");
  Serial.println(source);

  setDeviceMode(getIdleModeFromConnectivity());
  publishStatus(true);
}

void handleLockMovementCommand(const char* source) {
  Serial.print("Command received: type=LOCK_MOVEMENT source=");
  Serial.println(source);

  movementLocked = true;
  rememberCalibrationAction("LOCK_MOVEMENT");
  updateMotionTargetsFromCurrentAngle();
  syncMovementLockedReason();
  setDeviceMode(getIdleModeFromConnectivity());
  publishStatus(true);
}

void handleUnlockMovementCommand(const char* source) {
  Serial.print("Command received: type=UNLOCK_MOVEMENT source=");
  Serial.println(source);

  movementLocked = false;
  rememberCalibrationAction("UNLOCK_MOVEMENT");
  syncMovementLockedReason();
  setDeviceMode(getIdleModeFromConnectivity());
  publishStatus(true);
}

void handleStopCommand(const char* source) {
  Serial.print("STOP received from ");
  Serial.println(source);

  updateMotionTargetsFromCurrentAngle();
  syncMovementLockedReason();
  setDeviceMode(getIdleModeFromConnectivity());
  publishStatus(true);
}

void handleCheckUpdateCommand(const char* source) {
  Serial.print("Command received: type=CHECK_UPDATE source=");
  Serial.println(source);

  setOtaState(
    OTA_STATE_DISABLED,
    "",
    "OTA disabled in ESP8266 servo firmware."
  );
  publishStatus(true);
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
    const float requestedAmount =
      commandDoc["amount"].is<int>() || commandDoc["amount"].is<float>()
        ? commandDoc["amount"].as<float>()
        : SAFE_DEFAULT_NUDGE_PERCENT;
    const int amount =
      constrain(static_cast<int>(round(requestedAmount)), 1, SAFE_ALLOWED_MAX_PERCENT_STEP);
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

  if (strcmp(type, "LOCK_MOVEMENT") == 0) {
    handleLockMovementCommand("mqtt");
    return;
  }

  if (strcmp(type, "UNLOCK_MOVEMENT") == 0) {
    handleUnlockMovementCommand("mqtt");
    return;
  }

  if (strcmp(type, "SET_PERCENT") != 0) {
    Serial.print("Unsupported command type: ");
    Serial.println(type);
    publishStatus(true);
    return;
  }

  const int nextPercent =
    constrain(static_cast<int>(round(commandDoc["value"].as<float>())), 0, 100);
  handleSetPercentCommand(nextPercent, "mqtt");
}

void updateServoMotion() {
  if (!isMoving()) {
    return;
  }

  if (millis() - lastMotionStepMs < SERVO_STEP_INTERVAL_MS) {
    return;
  }

  lastMotionStepMs = millis();

  const int delta = targetServoAngle - currentServoAngle;
  const int direction = delta > 0 ? 1 : -1;
  const int stepAmount = min(abs(delta), SERVO_STEP_DEGREES);
  currentServoAngle = clampServoAngle(currentServoAngle + (direction * stepAmount));
  writeServoAngle(currentServoAngle);
  currentPercent = angleToPercent(currentServoAngle);

  if (!isMoving()) {
    targetServoAngle = currentServoAngle;
    targetPercent = currentPercent;
    setDeviceMode(getIdleModeFromConnectivity());
    publishStatus(true);
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  bootStartedMs = millis();

  Serial.println("Smart Shutter ESP8266 Servo booting...");
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

  if (STATUS_LED_PIN >= 0) {
    pinMode(STATUS_LED_PIN, OUTPUT);
    setStatusLedRaw(false);
  }

  closedAngle = clampServoAngle(SERVO_CLOSED_ANGLE);
  openAngle = clampServoAngle(SERVO_OPEN_ANGLE);
  currentServoAngle = clampServoAngle(SERVO_STARTUP_ANGLE);
  targetServoAngle = currentServoAngle;
  currentPercent = angleToPercent(currentServoAngle);
  targetPercent = currentPercent;

  writeServoAngle(currentServoAngle);
  syncMovementLockedReason();

  WiFi.persistent(false);
  WiFi.setAutoReconnect(true);

  mqttClient.setCallback(onMqttMessage);
  mqttClient.setKeepAlive(30);
  mqttClient.setBufferSize(1024);

  if (hasRuntimeWiFiCredentials()) {
    startWiFiConnection();
  } else if (ENABLE_FACTORY_SETUP_MODE) {
    startSetupPortal();
  } else {
    setDeviceMode(DEVICE_MODE_ERROR);
  }
}

void loop() {
  if (setupModeActive) {
    localServer.handleClient();
  }

  updateStatusLed();
  handleWiFiConnectivity();

  if (WiFi.status() == WL_CONNECTED) {
    if (!mqttClient.connected() && millis() - lastMqttRetryMs >= MQTT_RETRY_MS) {
      lastMqttRetryMs = millis();
      connectMqtt();
    }

    mqttClient.loop();
  }

  updateServoMotion();

  const bool movingNow = isMoving();
  if (movingNow != lastMovingState) {
    lastMovingState = movingNow;

    if (movingNow) {
      setDeviceMode(DEVICE_MODE_MOVING);
    } else {
      setDeviceMode(getIdleModeFromConnectivity());
    }

    publishStatus(true);
  }

  if (mqttClient.connected() && millis() - lastStatusPublishMs >= STATUS_INTERVAL_MS) {
    publishStatus(false);
  }

  if (
    setupModeActive &&
    SETUP_PORTAL_TIMEOUT_MS > 0 &&
    millis() - setupPortalStartedMs >= SETUP_PORTAL_TIMEOUT_MS
  ) {
    setupPortalStartedMs = millis();
    Serial.println("Setup portal timeout reached; keeping AP active for support.");
  }
}
