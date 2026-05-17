#include <AccelStepper.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <PubSubClient.h>
#include <Update.h>
#include <WebServer.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <mbedtls/sha256.h>

#if defined(__has_include)
#if __has_include("config.h")
#include "config.h"
#else
#error "Missing config.h. Copy firmware/esp32-shutter/config.example.h to firmware/esp32-shutter/config.h and fill in your WiFi and MQTT settings before compiling."
#endif
#else
#error "Compiler does not support __has_include. Create firmware/esp32-shutter/config.h from config.example.h before compiling."
#endif

// Older local config.h files might not define newer OTA settings yet.
#ifndef FIRMWARE_VERSION
#define FIRMWARE_VERSION "0.1.0-dev"
#endif

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

#ifndef SAFE_SETUP_MODE
#define SAFE_SETUP_MODE true
#endif

#ifndef SAFE_ALLOWED_MAX_PERCENT_STEP
#define SAFE_ALLOWED_MAX_PERCENT_STEP 10
#endif

#ifndef SAFE_DEFAULT_NUDGE_PERCENT
#define SAFE_DEFAULT_NUDGE_PERCENT 2
#endif

#ifndef SAFE_MOTOR_MAX_SPEED
#define SAFE_MOTOR_MAX_SPEED 220.0f
#endif

#ifndef SAFE_MOTOR_ACCELERATION
#define SAFE_MOTOR_ACCELERATION 110.0f
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

#ifndef SETUP_PORTAL_TIMEOUT_MS
#define SETUP_PORTAL_TIMEOUT_MS 300000
#endif

#ifndef MQTT_CLIENT_ID
#define MQTT_CLIENT_ID ""
#endif

#ifndef MOVING_STATUS_INTERVAL_MS
#define MOVING_STATUS_INTERVAL_MS 5000UL
#endif

#ifndef IDLE_STATUS_INTERVAL_MS
#define IDLE_STATUS_INTERVAL_MS 0UL
#endif

#ifndef MQTT_KEEP_ALIVE_SECONDS
#define MQTT_KEEP_ALIVE_SECONDS 60
#endif

#ifndef ENABLE_WIFI_POWER_SAVE
#define ENABLE_WIFI_POWER_SAVE true
#endif

#ifndef KEEP_MOTOR_COILS_ENERGIZED_WHEN_IDLE
#define KEEP_MOTOR_COILS_ENERGIZED_WHEN_IDLE false
#endif

#ifndef ENABLE_SOS_MODE
#define ENABLE_SOS_MODE true
#endif

#ifndef SOS_SHORT_PULSE_PERCENT
#define SOS_SHORT_PULSE_PERCENT 2
#endif

#ifndef SOS_LONG_PULSE_PERCENT
#define SOS_LONG_PULSE_PERCENT 5
#endif

#ifndef SOS_PULSE_GAP_MS
#define SOS_PULSE_GAP_MS 180UL
#endif

#ifndef SOS_LETTER_GAP_MS
#define SOS_LETTER_GAP_MS 420UL
#endif

#ifndef SOS_WORD_GAP_MS
#define SOS_WORD_GAP_MS 900UL
#endif

#ifndef SOS_MOTOR_MAX_SPEED
#define SOS_MOTOR_MAX_SPEED 900.0f
#endif

#ifndef SOS_MOTOR_ACCELERATION
#define SOS_MOTOR_ACCELERATION 500.0f
#endif

// -----------------------------------------------------------------------------
// Device Configuration
// -----------------------------------------------------------------------------

// All editable device settings live in config.h, which is intentionally kept
// out of source control. Start by copying config.example.h to config.h.

// -----------------------------------------------------------------------------
// Runtime State
// -----------------------------------------------------------------------------

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

enum PositionEstimateState {
  POSITION_ESTIMATE_TRACKED,
  POSITION_ESTIMATE_RESTORED,
  POSITION_ESTIMATE_NEEDS_VERIFICATION,
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

enum SosPhase {
  SOS_PHASE_IDLE,
  SOS_PHASE_PULSE_OUT,
  SOS_PHASE_PULSE_BACK,
  SOS_PHASE_PAUSE,
};

constexpr long MIN_CALIBRATION_SPAN_STEPS = 64L;
constexpr uint8_t CALIBRATION_ENDPOINT_CLOSED = 0x01;
constexpr uint8_t CALIBRATION_ENDPOINT_OPEN = 0x02;
constexpr uint8_t PERSISTED_SETTINGS_VERSION = 1;
constexpr bool SOS_SEQUENCE_PATTERN[] = {
  false,
  false,
  false,
  true,
  true,
  true,
  false,
  false,
  false,
};
constexpr size_t SOS_SEQUENCE_PATTERN_LENGTH =
  sizeof(SOS_SEQUENCE_PATTERN) / sizeof(SOS_SEQUENCE_PATTERN[0]);

WiFiClientSecure secureClient;
PubSubClient mqttClient(secureClient);
WebServer localServer(80);
Preferences preferences;

// Common 28BYJ-48 + ULN2003 half-step order for AccelStepper HALF4WIRE.
AccelStepper stepper(AccelStepper::HALF4WIRE, IN1, IN3, IN2, IN4);

DeviceMode deviceMode = DEVICE_MODE_BOOTING;
unsigned long bootStartedMs = 0;
unsigned long lastCloudHealthyMs = 0;
unsigned long lastStatusPublishMs = 0;
unsigned long lastStatusLogMs = 0;
unsigned long lastWiFiRetryMs = 0;
unsigned long lastMqttRetryMs = 0;
unsigned long lastAutoUpdateCheckMs = 0;
unsigned long otaAutoCheckJitterMs = 0;
unsigned long wifiAttemptStartedMs = 0;

bool wifiConnectInProgress = false;
bool lastMovingState = false;
bool localFallbackRoutesRegistered = false;
bool localFallbackServerStarted = false;
bool localFallbackApStarted = false;
bool setupPortalActive = false;
bool setupPortalApStarted = false;
bool directionInverted = INVERT_DIRECTION;
bool positionVerified = false;
bool positionRecoveredFromInterruptedMotion = false;
bool calibrationComplete = !SAFE_SETUP_MODE;
bool movementLocked = false;
bool stepperOutputsEnabled = true;
bool wifiPowerSaveEnabled = false;
bool sosActive = false;

int targetPercent = 0;
long calibratedClosedPositionSteps = 0;
long calibratedOpenPositionSteps = TRAVEL_STEPS;
long lastPersistedPositionSteps = 0;
long lastPersistedTargetSteps = 0;
long sosAnchorPositionSteps = 0;
long sosShortPulseSteps = 0;
long sosLongPulseSteps = 0;
long sosPulseDirectionSign = 1L;
uint8_t calibrationEndpointMask = 0;
OtaState otaState = ENABLE_OTA_UPDATES ? OTA_STATE_IDLE : OTA_STATE_DISABLED;
PositionEstimateState positionEstimateState =
  POSITION_ESTIMATE_NEEDS_VERIFICATION;
SosPhase sosPhase = SOS_PHASE_IDLE;
String otaLastError = "";
String otaTargetVersion = "";
bool otaAutoUpdateEnabled = false;
String otaAutoUpdateChannel = "stable";
String resolvedDeviceId = "";
String resolvedMqttClientId = "";
String resolvedCommandTopic = "";
String resolvedStatusTopic = "";
String storedDeviceId = "";
String storedMqttClientId = "";
String storedCommandTopic = "";
String storedStatusTopic = "";
String runtimeWifiSsid = "";
String runtimeWifiPassword = "";
String setupPortalSsid = "";
String setupPortalMessage = "";
String lastCalibrationAction =
  SAFE_SETUP_MODE ? "SAFE_SETUP_MODE_ENABLED" : "";
String movementLockedReason =
  SAFE_SETUP_MODE ? "Calibration required before larger movement." : "";
unsigned long setupPortalStartedMs = 0;
unsigned long sosPauseUntilMs = 0;
size_t sosSequenceIndex = 0;

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

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

const char* positionEstimateStateToString(PositionEstimateState state) {
  switch (state) {
    case POSITION_ESTIMATE_TRACKED:
      return "tracked";
    case POSITION_ESTIMATE_RESTORED:
      return "restored";
    case POSITION_ESTIMATE_NEEDS_VERIFICATION:
      return "needs_verification";
    default:
      return "needs_verification";
  }
}

bool isPositionEstimateUncertain() {
  return positionEstimateState == POSITION_ESTIMATE_NEEDS_VERIFICATION;
}

void setPositionEstimateState(PositionEstimateState nextState) {
  positionEstimateState = nextState;

  if (nextState != POSITION_ESTIMATE_NEEDS_VERIFICATION) {
    positionRecoveredFromInterruptedMotion = false;
  }
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

  return directionInverted ? -TRAVEL_STEPS : TRAVEL_STEPS;
}

bool hasMarkedClosedEndpoint() {
  return (calibrationEndpointMask & CALIBRATION_ENDPOINT_CLOSED) != 0;
}

bool hasMarkedOpenEndpoint() {
  return (calibrationEndpointMask & CALIBRATION_ENDPOINT_OPEN) != 0;
}

bool hasMeaningfulCalibrationSpan() {
  return labs(calibratedOpenPositionSteps - calibratedClosedPositionSteps) >=
         MIN_CALIBRATION_SPAN_STEPS;
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

int stepsToPercent(long steps) {
  // Absolute position is still estimated in software only, but calibration
  // saves the closed/open range so the device keeps its setup after reboot.
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

void applyMotionProfile();
bool savePersistedDeviceSettings(const String& ssid, const String& password);

unsigned long getStatusPublishIntervalMs(bool movingNow) {
  return movingNow ? MOVING_STATUS_INTERVAL_MS : IDLE_STATUS_INTERVAL_MS;
}

unsigned long getStatusLogIntervalMs(bool movingNow) {
  const unsigned long intervalMs = getStatusPublishIntervalMs(movingNow);
  return intervalMs > 0 ? intervalMs : 30000UL;
}

void setStepperOutputsEnabled(bool enabled) {
  if (stepperOutputsEnabled == enabled) {
    return;
  }

  stepperOutputsEnabled = enabled;

  if (enabled) {
    stepper.enableOutputs();
  } else {
    stepper.disableOutputs();
  }
}

void syncStepperPowerState() {
  setStepperOutputsEnabled(
    KEEP_MOTOR_COILS_ENERGIZED_WHEN_IDLE || isMoving()
  );
}

bool isSosModeActive() {
  return ENABLE_SOS_MODE && sosActive;
}

long getSosPulseStepsForPercent(int percent) {
  return max(1L, scaleMagnitudeByPercent(getCalibrationTravelSpanMagnitude(), percent));
}

long getSosDirectionSign(long anchorPositionSteps) {
  const long openDirectionSign = getOpenDirectionStepSign();

  if (!hasFullTravelCalibration()) {
    return openDirectionSign;
  }

  const long roomToOpen = labs(calibratedOpenPositionSteps - anchorPositionSteps);
  const long roomToClosed = labs(anchorPositionSteps - calibratedClosedPositionSteps);

  return roomToOpen >= roomToClosed ? openDirectionSign : -openDirectionSign;
}

long getSosAvailableRoomSteps(long anchorPositionSteps, long directionSign) {
  if (!hasFullTravelCalibration()) {
    return getCalibrationTravelSpanMagnitude();
  }

  return directionSign == getOpenDirectionStepSign()
    ? labs(calibratedOpenPositionSteps - anchorPositionSteps)
    : labs(anchorPositionSteps - calibratedClosedPositionSteps);
}

unsigned long getSosPauseDurationMs(size_t completedSequenceIndex) {
  if (completedSequenceIndex + 1 >= SOS_SEQUENCE_PATTERN_LENGTH) {
    return SOS_WORD_GAP_MS;
  }

  if (completedSequenceIndex == 2 || completedSequenceIndex == 5) {
    return SOS_LETTER_GAP_MS;
  }

  return SOS_PULSE_GAP_MS;
}

void clearSosModeState(bool restoreMotionProfile = true) {
  sosActive = false;
  sosPhase = SOS_PHASE_IDLE;
  sosPauseUntilMs = 0;
  sosSequenceIndex = 0;

  if (restoreMotionProfile) {
    applyMotionProfile();
  }
}

void cancelSosModeForCommand(const char* commandType) {
  if (!isSosModeActive()) {
    return;
  }

  Serial.print("Cancelling SOS mode for ");
  Serial.println(commandType);
  clearSosModeState();
}

void beginSosPulseOut() {
  if (!isSosModeActive()) {
    return;
  }

  const bool pulseIsLong = SOS_SEQUENCE_PATTERN[sosSequenceIndex];
  const long pulseSteps = pulseIsLong ? sosLongPulseSteps : sosShortPulseSteps;

  setStepperOutputsEnabled(true);
  stepper.setMaxSpeed(SOS_MOTOR_MAX_SPEED);
  stepper.setAcceleration(SOS_MOTOR_ACCELERATION);
  stepper.moveTo(sosAnchorPositionSteps + (sosPulseDirectionSign * pulseSteps));
  sosPhase = SOS_PHASE_PULSE_OUT;
  sosPauseUntilMs = 0;
  capturePositionSnapshot(true);
  savePersistedDeviceSettings(runtimeWifiSsid, runtimeWifiPassword);
}

void beginSosReturnToAnchor() {
  if (!isSosModeActive()) {
    return;
  }

  setStepperOutputsEnabled(true);
  stepper.setMaxSpeed(SOS_MOTOR_MAX_SPEED);
  stepper.setAcceleration(SOS_MOTOR_ACCELERATION);
  stepper.moveTo(sosAnchorPositionSteps);
  sosPhase = SOS_PHASE_PULSE_BACK;
  capturePositionSnapshot(true);
  savePersistedDeviceSettings(runtimeWifiSsid, runtimeWifiPassword);
}

void maintainSosMode() {
  if (!isSosModeActive() || isMoving()) {
    return;
  }

  const unsigned long now = millis();

  if (sosPhase == SOS_PHASE_PULSE_OUT) {
    beginSosReturnToAnchor();
    return;
  }

  if (sosPhase == SOS_PHASE_PULSE_BACK) {
    sosPhase = SOS_PHASE_PAUSE;
    sosPauseUntilMs = now + getSosPauseDurationMs(sosSequenceIndex);
    sosSequenceIndex = (sosSequenceIndex + 1) % SOS_SEQUENCE_PATTERN_LENGTH;
    syncStepperPowerState();
    return;
  }

  if (sosPhase == SOS_PHASE_PAUSE && now >= sosPauseUntilMs) {
    beginSosPulseOut();
  }
}

void setWiFiPowerSaveEnabled(bool enabled) {
  const bool nextEnabled = ENABLE_WIFI_POWER_SAVE && enabled;
  if (wifiPowerSaveEnabled == nextEnabled) {
    return;
  }

  WiFi.setSleep(nextEnabled);
  wifiPowerSaveEnabled = nextEnabled;
}

void applyWiFiConnectionProfile(bool accessPointRequired) {
  WiFi.mode(accessPointRequired ? WIFI_AP_STA : WIFI_STA);
  setWiFiPowerSaveEnabled(!accessPointRequired);
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

void updateTargetPercentFromStepper() {
  targetPercent = stepsToPercent(stepper.targetPosition());
}

bool isSafetyModeActive() {
  return SAFE_SETUP_MODE;
}

bool isCalibrationRestricted() {
  return SAFE_SETUP_MODE && !hasFullTravelCalibration();
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

void applyMotionProfile() {
  if (isCalibrationRestricted()) {
    stepper.setMaxSpeed(SAFE_MOTOR_MAX_SPEED);
    stepper.setAcceleration(SAFE_MOTOR_ACCELERATION);
    return;
  }

  stepper.setMaxSpeed(MOTOR_MAX_SPEED);
  stepper.setAcceleration(MOTOR_ACCELERATION);
}

void rememberCalibrationAction(const char* action) {
  lastCalibrationAction = action;
}

bool hasText(const char* value) {
  return value != nullptr && strlen(value) > 0;
}

bool hasText(const String& value) {
  return value.length() > 0;
}

String getMacSuffixUpper() {
  const uint64_t chipMac = ESP.getEfuseMac();
  char suffix[7];
  snprintf(
    suffix,
    sizeof(suffix),
    "%06llX",
    static_cast<unsigned long long>(chipMac & 0xFFFFFFULL)
  );
  return String(suffix);
}

String getMacSuffixLower() {
  String suffix = getMacSuffixUpper();
  suffix.toLowerCase();
  return suffix;
}

String resolveDeviceId() {
  if (hasText(DEVICE_ID)) {
    return String(DEVICE_ID);
  }

  if (hasText(storedDeviceId)) {
    return storedDeviceId;
  }

  return String("shutter-") + getMacSuffixLower();
}

String resolveMqttClientId() {
  if (hasText(MQTT_CLIENT_ID)) {
    return String(MQTT_CLIENT_ID);
  }

  if (hasText(storedMqttClientId)) {
    return storedMqttClientId;
  }

  return String("smart-shutter-") + resolvedDeviceId;
}

String resolveTopic(
  const char* configuredTopic,
  const String& storedTopic,
  const char* topicSuffix
) {
  String topic = configuredTopic;
  topic.trim();

  if (topic.length() == 0 && hasText(storedTopic)) {
    topic = storedTopic;
  }

  if (topic.length() == 0) {
    return String("shutters/") + resolvedDeviceId + "/" + topicSuffix;
  }

  topic.replace("{deviceId}", resolvedDeviceId);
  return topic;
}

void capturePositionSnapshot(bool movementInProgress) {
  lastPersistedPositionSteps = stepper.currentPosition();
  lastPersistedTargetSteps =
    movementInProgress ? stepper.targetPosition() : stepper.currentPosition();
}

String buildPositionEstimateReason() {
  if (positionEstimateState == POSITION_ESTIMATE_TRACKED) {
    return "";
  }

  if (positionEstimateState == POSITION_ESTIMATE_RESTORED) {
    return "Restored from the last saved stable position after reboot.";
  }

  String reason =
    "Use small moves to reach a known endpoint, then save closed or open again.";

  if (positionRecoveredFromInterruptedMotion) {
    reason =
      "Reboot interrupted movement. Last saved stable position was ";
    reason += stepsToPercent(lastPersistedPositionSteps);
    reason += "% and the interrupted target was ";
    reason += stepsToPercent(lastPersistedTargetSteps);
    reason += "%. Use small moves to reach a known endpoint, then save closed or open again.";
    return reason;
  }

  if (!positionVerified) {
    return "No verified saved position is available yet. Use small moves to reach a known endpoint, then save closed or open.";
  }

  return reason;
}

void resetCalibrationRangeToDefaults() {
  calibratedClosedPositionSteps = 0;
  calibratedOpenPositionSteps = directionInverted ? -TRAVEL_STEPS : TRAVEL_STEPS;
  calibrationEndpointMask = 0;
  calibrationComplete = !SAFE_SETUP_MODE;
}

bool savePersistedDeviceSettings(const String& ssid, const String& password) {
  preferences.begin("smart-shutter", false);
  const size_t storedSsidLength = preferences.putString("wifi_ssid", ssid);
  const size_t storedPasswordLength =
    preferences.putString("wifi_password", password);
  const String deviceIdToStore =
    hasText(resolvedDeviceId) ? resolvedDeviceId : resolveDeviceId();
  const String mqttClientIdToStore =
    hasText(resolvedMqttClientId) ? resolvedMqttClientId : resolveMqttClientId();
  const String commandTopicToStore =
    hasText(resolvedCommandTopic)
      ? resolvedCommandTopic
      : resolveTopic(COMMAND_TOPIC, storedCommandTopic, "commands");
  const String statusTopicToStore =
    hasText(resolvedStatusTopic)
      ? resolvedStatusTopic
      : resolveTopic(STATUS_TOPIC, storedStatusTopic, "status");
  const size_t storedDeviceIdLength =
    preferences.putString("device_id", deviceIdToStore);
  const size_t storedMqttClientIdLength =
    preferences.putString("mqtt_client_id", mqttClientIdToStore);
  const size_t storedCommandTopicLength =
    preferences.putString("cmd_topic", commandTopicToStore);
  const size_t storedStatusTopicLength =
    preferences.putString("status_topic", statusTopicToStore);
  const bool storedClosedPosition =
    preferences.putLong("closed_steps", calibratedClosedPositionSteps) > 0;
  const bool storedOpenPosition =
    preferences.putLong("open_steps", calibratedOpenPositionSteps) > 0;
  const bool storedCalibrationComplete =
    preferences.putBool("cal_complete", calibrationComplete) > 0;
  const bool storedDirection =
    preferences.putBool("dir_inverted", directionInverted) > 0;
  const bool storedEndpointMask =
    preferences.putUChar("endpoints", calibrationEndpointMask) > 0;
  const bool storedPositionSteps =
    preferences.putLong("pos_steps", lastPersistedPositionSteps) > 0;
  const bool storedTargetSteps =
    preferences.putLong("pos_target", lastPersistedTargetSteps) > 0;
  const bool storedPositionVerified =
    preferences.putBool("pos_verified", positionVerified) > 0;
  const bool storedMotionState =
    preferences.putBool("pos_moving", isMoving()) > 0;
  const bool storedVersion =
    preferences.putUChar("settings_v", PERSISTED_SETTINGS_VERSION) > 0;
  preferences.end();

  const bool storedSsid = ssid.length() == 0 || storedSsidLength > 0;
  const bool storedPassword = password.length() == 0 || storedPasswordLength > 0;
  const bool savedDeviceId =
    deviceIdToStore.length() == 0 || storedDeviceIdLength > 0;
  const bool savedMqttClientId =
    mqttClientIdToStore.length() == 0 || storedMqttClientIdLength > 0;
  const bool savedCommandTopic =
    commandTopicToStore.length() == 0 || storedCommandTopicLength > 0;
  const bool savedStatusTopic =
    statusTopicToStore.length() == 0 || storedStatusTopicLength > 0;

  storedDeviceId = deviceIdToStore;
  storedMqttClientId = mqttClientIdToStore;
  storedCommandTopic = commandTopicToStore;
  storedStatusTopic = statusTopicToStore;

  return storedSsid &&
         storedPassword &&
         savedDeviceId &&
         savedMqttClientId &&
         savedCommandTopic &&
         savedStatusTopic &&
         storedClosedPosition &&
         storedOpenPosition &&
         storedCalibrationComplete &&
         storedDirection &&
         storedEndpointMask &&
         storedPositionSteps &&
         storedTargetSteps &&
         storedPositionVerified &&
         storedMotionState &&
         storedVersion;
}

void loadStoredDeviceSettings(String* ssid, String* password) {
  if (ssid == nullptr || password == nullptr) {
    return;
  }

  directionInverted = INVERT_DIRECTION;
  resetCalibrationRangeToDefaults();
  positionVerified = false;
  positionRecoveredFromInterruptedMotion = false;
  lastPersistedPositionSteps = 0;
  lastPersistedTargetSteps = 0;
  storedDeviceId = "";
  storedMqttClientId = "";
  storedCommandTopic = "";
  storedStatusTopic = "";
  preferences.begin("smart-shutter", true);
  *ssid = preferences.getString("wifi_ssid", "");
  *password = preferences.getString("wifi_password", "");
  storedDeviceId = preferences.getString("device_id", "");
  storedMqttClientId = preferences.getString("mqtt_client_id", "");
  storedCommandTopic = preferences.getString("cmd_topic", "");
  storedStatusTopic = preferences.getString("status_topic", "");
  const uint8_t storedVersion = preferences.getUChar("settings_v", 0);
  const bool hasStoredPosition = preferences.isKey("pos_steps");
  const bool storedMotionInProgress = preferences.getBool("pos_moving", false);

  if (storedVersion >= 1) {
    directionInverted = preferences.getBool("dir_inverted", INVERT_DIRECTION);
    calibratedClosedPositionSteps = preferences.getLong("closed_steps", 0L);
    calibratedOpenPositionSteps = preferences.getLong(
      "open_steps",
      directionInverted ? -TRAVEL_STEPS : TRAVEL_STEPS
    );
    calibrationEndpointMask = preferences.getUChar("endpoints", 0U);
    calibrationComplete =
      SAFE_SETUP_MODE ? preferences.getBool("cal_complete", false) : true;
    positionVerified = preferences.getBool("pos_verified", false);
    lastPersistedPositionSteps = preferences.getLong("pos_steps", 0L);
    lastPersistedTargetSteps = preferences.getLong(
      "pos_target",
      lastPersistedPositionSteps
    );

    if (storedMotionInProgress) {
      setPositionEstimateState(POSITION_ESTIMATE_NEEDS_VERIFICATION);
      positionRecoveredFromInterruptedMotion = true;
    } else if (hasStoredPosition && positionVerified) {
      setPositionEstimateState(POSITION_ESTIMATE_RESTORED);
    } else {
      setPositionEstimateState(POSITION_ESTIMATE_NEEDS_VERIFICATION);
    }
  }
  preferences.end();

  if (calibrationEndpointMask == 0 &&
      calibrationComplete &&
      hasMeaningfulCalibrationSpan()) {
    calibrationEndpointMask =
      CALIBRATION_ENDPOINT_CLOSED | CALIBRATION_ENDPOINT_OPEN;
  }

  if (!hasMeaningfulCalibrationSpan()) {
    resetCalibrationRangeToDefaults();
  }

  if (!hasStoredPosition) {
    lastPersistedPositionSteps = calibratedClosedPositionSteps;
    lastPersistedTargetSteps = calibratedClosedPositionSteps;
    setPositionEstimateState(POSITION_ESTIMATE_NEEDS_VERIFICATION);
  }
}

bool saveStoredWiFiCredentials(const String& ssid, const String& password) {
  capturePositionSnapshot(isMoving());
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
  capturePositionSnapshot(false);
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
  String storedSsid = "";
  String storedPassword = "";
  loadStoredDeviceSettings(&storedSsid, &storedPassword);

  if (hasText(WIFI_SSID)) {
    runtimeWifiSsid = WIFI_SSID;
    runtimeWifiPassword = WIFI_PASSWORD;
    return;
  }

  runtimeWifiSsid = storedSsid;
  runtimeWifiPassword = storedPassword;
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
void startLocalFallbackServerIfNeeded();
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
  WiFiClientSecure& secureHttpClient,
  WiFiClient& plainHttpClient
) {
  http.setTimeout(15000);

  if (url.startsWith("https://")) {
    // MVP only: this skips CA certificate validation. Replace with pinned CA
    // validation before production or any broad deployment.
    secureHttpClient.setInsecure();
    return http.begin(secureHttpClient, url);
  }

  if (url.startsWith("http://")) {
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

size_t buildStatusPayload(
  char* payload,
  size_t payloadSize,
  bool onlineValue,
  DeviceMode modeValue,
  bool movingValue
) {
  StaticJsonDocument<1792> statusDoc;
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
  statusDoc["currentSteps"] = stepper.currentPosition();
  statusDoc["targetSteps"] = stepper.targetPosition();
  statusDoc["reportedBoard"] = "esp32";
  statusDoc["actuatorType"] = "stepper";
  JsonArray reportedCapabilities =
    statusDoc.createNestedArray("reportedCapabilities");
  reportedCapabilities.add("set_percent");
  reportedCapabilities.add("stop");
  reportedCapabilities.add("nudge");
  reportedCapabilities.add("calibration");
  reportedCapabilities.add("movement_lock");
  reportedCapabilities.add("factory_setup_ap");
  if (ENABLE_SOS_MODE) {
    reportedCapabilities.add("sos_mode");
  }
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
  statusDoc["localFallbackActive"] =
    localFallbackServerStarted || localFallbackApStarted || setupPortalApStarted;
  statusDoc["otaEnabled"] = ENABLE_OTA_UPDATES;
  statusDoc["otaAutoUpdateEnabled"] = otaAutoUpdateEnabled;
  statusDoc["otaAutoUpdateChannel"] = otaAutoUpdateChannel;
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
  statusDoc["sosActive"] = isSosModeActive();
  statusDoc["calibrationComplete"] = calibrationComplete;
  statusDoc["fullTravelReady"] = hasFullTravelCalibration();
  statusDoc["directionInverted"] = directionInverted;
  statusDoc["positionEstimateState"] =
    positionEstimateStateToString(positionEstimateState);
  if (positionEstimateState != POSITION_ESTIMATE_TRACKED) {
    statusDoc["positionEstimateReason"] = buildPositionEstimateReason();
  } else {
    statusDoc["positionEstimateReason"] = nullptr;
  }
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
  const unsigned long logIntervalMs = getStatusLogIntervalMs(movingValue);
  if (lastStatusLogMs != 0 && now - lastStatusLogMs < logIntervalMs) {
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
  Serial.print(" positionState=");
  Serial.print(positionEstimateStateToString(positionEstimateState));
  Serial.print(" sos=");
  Serial.print(isSosModeActive() ? "true" : "false");
  Serial.print(" ota=");
  Serial.println(otaStateToString(otaState));
}

void publishStatus(bool forceLog) {
  if (!mqttClient.connected()) {
    return;
  }

  char payload[1792];
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
    if (strcmp(commandType, "SET_PERCENT") == 0 && isPositionEstimateUncertain()) {
      rejectMovementCommand(
        commandType,
        buildPositionEstimateReason()
      );
      return false;
    }

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
  cancelSosModeForCommand("SET_PERCENT");
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

  setStepperOutputsEnabled(true);
  stepper.moveTo(targetSteps);
  syncStepperPowerState();
  capturePositionSnapshot(true);
  savePersistedDeviceSettings(runtimeWifiSsid, runtimeWifiPassword);
  setDeviceMode(
    targetSteps == stepper.currentPosition()
      ? getIdleModeFromConnectivity()
      : DEVICE_MODE_MOVING
  );
  publishStatus(true);
}

void handleNudgeCommand(bool opening, int requestedAmount, const char* source) {
  cancelSosModeForCommand(opening ? "NUDGE_OPEN" : "NUDGE_CLOSE");
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

  setStepperOutputsEnabled(true);
  stepper.moveTo(targetSteps);
  syncStepperPowerState();
  capturePositionSnapshot(true);
  savePersistedDeviceSettings(runtimeWifiSsid, runtimeWifiPassword);
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

  cancelSosModeForCommand("SET_CURRENT_AS_CLOSED");

  const long directionSign = getOpenDirectionStepSign();
  calibratedClosedPositionSteps = stepper.currentPosition();
  calibratedOpenPositionSteps =
    calibratedClosedPositionSteps +
    (directionSign * getCalibrationTravelSpanMagnitude());
  calibrationEndpointMask = CALIBRATION_ENDPOINT_CLOSED;
  calibrationComplete = false;
  positionVerified = true;
  setPositionEstimateState(POSITION_ESTIMATE_TRACKED);
  setStepperOutputsEnabled(true);
  stepper.moveTo(calibratedClosedPositionSteps);
  syncStepperPowerState();
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

  cancelSosModeForCommand("SET_CURRENT_AS_OPEN");

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
  positionVerified = true;
  setPositionEstimateState(POSITION_ESTIMATE_TRACKED);
  setStepperOutputsEnabled(true);
  stepper.moveTo(calibratedOpenPositionSteps);
  syncStepperPowerState();
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

  cancelSosModeForCommand("MARK_CALIBRATION_COMPLETE");

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
  positionVerified = true;
  setPositionEstimateState(POSITION_ESTIMATE_TRACKED);
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

  cancelSosModeForCommand(
    nextDirectionInverted ? "SET_DIRECTION_REVERSED" : "SET_DIRECTION_NORMAL"
  );

  directionInverted = nextDirectionInverted;
  resetCalibrationRangeToDefaults();
  positionVerified = false;
  setPositionEstimateState(POSITION_ESTIMATE_NEEDS_VERIFICATION);
  calibrationComplete = false;
  stepper.setCurrentPosition(0);
  setStepperOutputsEnabled(true);
  stepper.moveTo(0);
  syncStepperPowerState();
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

  cancelSosModeForCommand("LOCK_MOVEMENT");
  movementLocked = true;
  rememberCalibrationAction("LOCK_MOVEMENT");
  stepper.stop();
  syncStepperPowerState();
  updateTargetPercentFromStepper();
  syncMovementLockedReason();
  setDeviceMode(isMoving() ? DEVICE_MODE_MOVING : getIdleModeFromConnectivity());
  publishStatus(true);
}

void handleUnlockMovementCommand(const char* source) {
  Serial.print("Command received: type=UNLOCK_MOVEMENT source=");
  Serial.println(source);

  cancelSosModeForCommand("UNLOCK_MOVEMENT");
  movementLocked = false;
  rememberCalibrationAction("UNLOCK_MOVEMENT");
  syncMovementLockedReason();
  setDeviceMode(isMoving() ? DEVICE_MODE_MOVING : getIdleModeFromConnectivity());
  publishStatus(true);
}

void handleStartSosCommand(const char* source) {
  Serial.print("Command received: type=START_SOS source=");
  Serial.println(source);

  if (!ENABLE_SOS_MODE) {
    rejectMovementCommand("START_SOS", "SOS mode is disabled in this firmware.");
    return;
  }

  if (movementLocked) {
    rejectMovementCommand("START_SOS", "Movement locked by operator.");
    return;
  }

  if (isPositionEstimateUncertain()) {
    rejectMovementCommand("START_SOS", buildPositionEstimateReason());
    return;
  }

  if (!hasFullTravelCalibration()) {
    rejectMovementCommand(
      "START_SOS",
      "SOS mode needs the true closed and open positions saved first."
    );
    return;
  }

  sosAnchorPositionSteps = stepper.currentPosition();
  sosPulseDirectionSign = getSosDirectionSign(sosAnchorPositionSteps);

  const long availableRoomSteps =
    getSosAvailableRoomSteps(sosAnchorPositionSteps, sosPulseDirectionSign);
  if (availableRoomSteps <= 0) {
    rejectMovementCommand(
      "START_SOS",
      "Move the shutter away from its endpoint before starting SOS mode."
    );
    return;
  }

  const long preferredShortPulseSteps =
    getSosPulseStepsForPercent(SOS_SHORT_PULSE_PERCENT);
  const long preferredLongPulseSteps =
    getSosPulseStepsForPercent(SOS_LONG_PULSE_PERCENT);

  sosLongPulseSteps = min(preferredLongPulseSteps, availableRoomSteps);
  sosShortPulseSteps = min(
    preferredShortPulseSteps,
    max(1L, sosLongPulseSteps / 2L)
  );

  if (sosLongPulseSteps <= 0 || sosShortPulseSteps <= 0) {
    rejectMovementCommand(
      "START_SOS",
      "Not enough safe travel room is available for SOS mode."
    );
    return;
  }

  sosActive = true;
  sosPhase = SOS_PHASE_IDLE;
  sosPauseUntilMs = 0;
  sosSequenceIndex = 0;
  beginSosPulseOut();
  syncMovementLockedReason();
  setDeviceMode(isMoving() ? DEVICE_MODE_MOVING : getIdleModeFromConnectivity());
  publishStatus(true);
}

void handleEndSosCommand(const char* source) {
  Serial.print("Command received: type=END_SOS source=");
  Serial.println(source);

  if (!isSosModeActive()) {
    setDeviceMode(isMoving() ? DEVICE_MODE_MOVING : getIdleModeFromConnectivity());
    publishStatus(true);
    return;
  }

  clearSosModeState();
  stepper.stop();
  syncStepperPowerState();
  updateTargetPercentFromStepper();
  syncMovementLockedReason();
  setDeviceMode(isMoving() ? DEVICE_MODE_MOVING : getIdleModeFromConnectivity());
  publishStatus(true);
}

void handleStopCommand(const char* source) {
  Serial.print("STOP received from ");
  Serial.print(source);
  Serial.print(", distanceToGo=");
  Serial.println(stepper.distanceToGo());

  clearSosModeState();
  stepper.stop();
  syncStepperPowerState();
  updateTargetPercentFromStepper();
  syncMovementLockedReason();
  setDeviceMode(isMoving() ? DEVICE_MODE_MOVING : getIdleModeFromConnectivity());
  publishStatus(true);
}

bool tryParseInteger(const String& rawValue, int* parsedValue) {
  if (rawValue.length() == 0) {
    return false;
  }

  char* endPointer = nullptr;
  const long candidate = strtol(rawValue.c_str(), &endPointer, 10);

  if (endPointer == rawValue.c_str() || *endPointer != '\0') {
    return false;
  }

  *parsedValue = static_cast<int>(candidate);
  return true;
}

// -----------------------------------------------------------------------------
// OTA Update Flow
// -----------------------------------------------------------------------------

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

  WiFiClientSecure secureHttpClient;
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

  WiFiClientSecure secureHttpClient;
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
  const DeserializationError error =
    deserializeJson(manifestDoc, responseBody);

  if (error) {
    Serial.print("OTA manifest parse failed: ");
    Serial.println(error.c_str());
    return false;
  }

  const char* manifestDeviceId = manifestDoc["deviceId"] | "";
  if (
    strlen(manifestDeviceId) == 0 ||
    strcmp(manifestDeviceId, resolvedDeviceId.c_str()) != 0
  ) {
    Serial.println("OTA manifest rejected: deviceId mismatch.");
    return false;
  }

  manifest->updateAvailable = manifestDoc["updateAvailable"] | false;
  manifest->currentVersion = String(manifestDoc["currentVersion"] | "");
  manifest->latestVersion = String(manifestDoc["latestVersion"] | "");
  manifest->board = String(manifestDoc["board"] | "");
  manifest->channel = String(manifestDoc["channel"] | "");
  manifest->autoUpdateEnabled = manifestDoc["autoUpdateEnabled"] | false;
  manifest->autoUpdateChannel =
    String(manifestDoc["autoUpdateChannel"] | "stable");
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

  WiFiClientSecure secureHttpClient;
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
  if (manifest.sizeBytes > 0 && contentLength > 0 && manifest.sizeBytes != contentLength) {
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
      : (contentLength > 0 ? static_cast<size_t>(contentLength) : UPDATE_SIZE_UNKNOWN);

  if (!Update.begin(updateSize)) {
    Serial.print("OTA update begin failed, error=");
    Serial.println(Update.getError());
    http.end();
    return false;
  }

  WiFiClient* stream = http.getStreamPtr();
  unsigned char buffer[1024];
  unsigned char digest[32];
  mbedtls_sha256_context shaContext;
  mbedtls_sha256_init(&shaContext);
  mbedtls_sha256_starts(&shaContext, 0);

  size_t totalWritten = 0;
  bool success = true;

  while (http.connected() && (contentLength < 0 || totalWritten < static_cast<size_t>(contentLength))) {
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

    mbedtls_sha256_update(&shaContext, buffer, bytesRead);

    const size_t writtenBytes = Update.write(buffer, bytesRead);
    if (writtenBytes != bytesRead) {
      Serial.print("OTA write failed after bytes=");
      Serial.println(totalWritten);
      success = false;
      break;
    }

    totalWritten += writtenBytes;
  }

  mbedtls_sha256_finish(&shaContext, digest);
  mbedtls_sha256_free(&shaContext);
  http.end();

  if (!success) {
    Update.abort();
    return false;
  }

  if (manifest.sizeBytes > 0 && totalWritten != static_cast<size_t>(manifest.sizeBytes)) {
    Serial.print("OTA download size mismatch. Expected ");
    Serial.print(manifest.sizeBytes);
    Serial.print(" bytes, received ");
    Serial.println(totalWritten);
    Update.abort();
    return false;
  }

  if (contentLength > 0 && totalWritten != static_cast<size_t>(contentLength)) {
    Serial.print("OTA HTTP stream ended early at bytes=");
    Serial.println(totalWritten);
    Update.abort();
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

  if (!Update.end(true)) {
    Serial.print("OTA install failed, error=");
    Serial.println(Update.getError());
    Update.abort();
    return false;
  }

  if (!Update.isFinished()) {
    Serial.println("OTA install failed: update did not finish cleanly.");
    Update.abort();
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
      manifest.latestVersion.length() > 0 ? manifest.latestVersion : FIRMWARE_VERSION,
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

  if (manifest.board.length() > 0 && manifest.board != "esp32") {
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
    setOtaState(OTA_STATE_FAILED, manifest.latestVersion, "Firmware download failed");
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
    Update.abort();
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

  if (
    lastAutoUpdateCheckMs != 0 &&
    now - lastAutoUpdateCheckMs < autoCheckIntervalMs
  ) {
    return;
  }

  lastAutoUpdateCheckMs = now;
  if (!checkForUpdate(true)) {
    publishStatus(true);
  }
}

// -----------------------------------------------------------------------------
// Factory Setup Mode
// -----------------------------------------------------------------------------

String buildSetupPortalPage() {
  String page;
  page.reserve(2600);

  page += F(
    "<!doctype html><html><head><meta charset='utf-8'>"
    "<meta name='viewport' content='width=device-width,initial-scale=1'>"
    "<title>Smart Shutter Setup</title>"
    "<style>"
    "body{font-family:Arial,sans-serif;background:#07111f;color:#f8fafc;"
    "margin:0;padding:24px;line-height:1.5}"
    ".card{max-width:760px;margin:0 auto;background:#0f172a;border:1px solid "
    "rgba(148,163,184,.16);border-radius:24px;padding:24px;box-shadow:0 20px "
    "40px rgba(2,6,23,.45)}"
    ".pill{display:inline-block;padding:8px 14px;border-radius:999px;"
    "background:#083344;color:#a5f3fc;font-size:12px;font-weight:700;"
    "letter-spacing:.12em;text-transform:uppercase}"
    ".muted{color:#94a3b8;font-size:14px}"
    ".status{margin:18px 0;padding:14px;border-radius:18px;background:#111c31;"
    "border:1px solid rgba(148,163,184,.14)}"
    "label{display:block;margin-top:16px;font-size:14px;color:#cbd5e1}"
    "input{width:100%;margin-top:8px;padding:14px 16px;border-radius:18px;"
    "border:1px solid rgba(148,163,184,.18);background:#08111f;color:#f8fafc;"
    "box-sizing:border-box}"
    "button{margin-top:18px;display:inline-flex;align-items:center;justify-content:center;"
    "padding:14px 16px;border-radius:18px;border:0;background:#22d3ee;color:#082f49;"
    "font-weight:700;cursor:pointer}"
    "code{background:#08111f;padding:2px 6px;border-radius:8px}"
    "</style></head><body><div class='card'>");

  page += F("<div class='pill'>Setup Mode</div>");
  page += F("<h1>Connect Smart Shutter to Wi-Fi</h1>");
  page += F("<p class='muted'>Enter the home Wi-Fi network for this device. "
            "Credentials are stored locally on the device and are not sent "
            "through the main web app.</p>");

  page += F("<div class='status'><div class='muted'>Device</div><strong>");
  page += resolvedDeviceId;
  page += F("</strong><div class='muted' style='margin-top:10px'>Setup network: <code>");
  page += setupPortalSsid;
  page += F("</code></div></div>");

  if (setupPortalMessage.length() > 0) {
    page += F("<div class='status'><div class='muted'>Status</div><strong>");
    page += setupPortalMessage;
    page += F("</strong></div>");
  }

  page += F("<form action='/setup/save' method='post'>");
  page += F("<label>Wi-Fi SSID<input name='ssid' maxlength='64' "
            "placeholder='Home Wi-Fi'></label>");
  page += F("<label>Wi-Fi password<input name='password' maxlength='64' "
            "placeholder='Password' type='password'></label>");
  page += F("<button type='submit'>Save and Restart</button>");
  page += F("</form>");

  page += F("<p class='muted' style='margin-top:18px'>After saving, the device "
            "will restart and try to connect to your Wi-Fi. Return to the app "
            "once the device comes online.</p>");
  page += F("</div></body></html>");
  return page;
}

void startFactorySetupPortal(const String& reason) {
  if (!ENABLE_FACTORY_SETUP_MODE) {
    return;
  }

  setupPortalActive = true;
  setupPortalStartedMs = millis();
  setupPortalMessage = reason;

  WiFi.disconnect();
  applyWiFiConnectionProfile(true);

  if (!setupPortalApStarted) {
    if (strlen(SETUP_AP_PASSWORD) == 0) {
      setupPortalApStarted = WiFi.softAP(setupPortalSsid.c_str());
    } else {
      setupPortalApStarted =
        WiFi.softAP(setupPortalSsid.c_str(), SETUP_AP_PASSWORD);
    }
  }

  if (!setupPortalApStarted) {
    Serial.println("Failed to start factory setup access point.");
    setDeviceMode(DEVICE_MODE_ERROR);
    return;
  }

  Serial.println("Factory setup mode active.");
  Serial.print("Resolved deviceId: ");
  Serial.println(resolvedDeviceId);
  Serial.print("Setup AP SSID: ");
  Serial.println(setupPortalSsid);
  Serial.print("Setup AP IP: ");
  Serial.println(WiFi.softAPIP());
  if (reason.length() > 0) {
    Serial.print("Setup reason: ");
    Serial.println(reason);
  }

  startLocalFallbackServerIfNeeded();
  setDeviceMode(DEVICE_MODE_WIFI_CONNECTING);
}

void stopFactorySetupPortalIfNeeded() {
  if (!setupPortalActive) {
    return;
  }

  setupPortalActive = false;
  setupPortalMessage = "";
  setupPortalStartedMs = 0;

  if (setupPortalApStarted) {
    WiFi.softAPdisconnect(true);
    setupPortalApStarted = false;
  }

  applyWiFiConnectionProfile(localFallbackApStarted);
}

void handleSetupPortalSave() {
  if (!setupPortalActive) {
    localServer.send(409, "text/plain", "Setup mode is not active.");
    return;
  }

  String ssid = localServer.arg("ssid");
  String password = localServer.arg("password");
  ssid.trim();

  if (ssid.length() == 0) {
    setupPortalMessage = "Enter a Wi-Fi network name before saving.";
    localServer.send(400, "text/html", buildSetupPortalPage());
    return;
  }

  if (!saveStoredWiFiCredentials(ssid, password)) {
    setupPortalMessage = "Unable to save Wi-Fi credentials. Try again.";
    localServer.send(500, "text/html", buildSetupPortalPage());
    return;
  }

  setupPortalMessage = "Wi-Fi saved. Restarting...";
  localServer.send(200, "text/html", buildSetupPortalPage());
  Serial.println("Rebooting after WiFi setup save...");
  delay(800);
  ESP.restart();
}

// -----------------------------------------------------------------------------
// Local Fallback HTTP Server
// -----------------------------------------------------------------------------

String buildLocalFallbackPage() {
  String page;
  page.reserve(2200);

  page += F(
    "<!doctype html><html><head><meta charset='utf-8'>"
    "<meta name='viewport' content='width=device-width,initial-scale=1'>"
    "<title>Smart Shutter Local Fallback</title>"
    "<style>"
    "body{font-family:Arial,sans-serif;background:#07111f;color:#f8fafc;"
    "margin:0;padding:24px;line-height:1.5}"
    ".card{max-width:760px;margin:0 auto;background:#0f172a;border:1px solid "
    "rgba(148,163,184,.16);border-radius:24px;padding:24px;box-shadow:0 20px "
    "40px rgba(2,6,23,.45)}"
    ".pill{display:inline-block;padding:8px 14px;border-radius:999px;"
    "background:#083344;color:#a5f3fc;font-size:12px;font-weight:700;"
    "letter-spacing:.12em;text-transform:uppercase}"
    ".status-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));"
    "gap:12px;margin:20px 0}"
    ".status{padding:14px;border-radius:18px;background:#111c31;"
    "border:1px solid rgba(148,163,184,.14)}"
    ".muted{color:#94a3b8;font-size:14px}"
    ".controls{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));"
    "gap:12px;margin-top:18px}"
    "a.button,button{display:inline-flex;align-items:center;justify-content:center;"
    "padding:14px 16px;border-radius:18px;border:0;text-decoration:none;"
    "font-weight:700;cursor:pointer}"
    "a.button{background:#22d3ee;color:#082f49}"
    ".danger{background:#7f1d1d;color:#fee2e2}"
    "form{margin-top:18px;display:flex;gap:12px;flex-wrap:wrap}"
    "input{flex:1 1 160px;padding:14px 16px;border-radius:18px;border:1px solid "
    "rgba(148,163,184,.18);background:#08111f;color:#f8fafc}"
    "</style></head><body><div class='card'>");

  page += F("<div class='pill'>Local Fallback</div>");
  page += F("<h1>Smart Shutter Direct Control</h1>");
  page += F(
    "<p class='muted'>This page is an optional backup path for local testing. "
    "The main MVP control path is still the deployed website plus MQTT.</p>");

  page += F("<div class='status-grid'>");
  page += F("<div class='status'><div class='muted'>Device</div><strong>");
  page += resolvedDeviceId;
  page += F("</strong></div>");
  page += F("<div class='status'><div class='muted'>Mode</div><strong>");
  page += deviceModeToString(deviceMode);
  page += F("</strong></div>");
  page += F("<div class='status'><div class='muted'>Estimated</div><strong>");
  page += String(stepsToPercent(stepper.currentPosition()));
  page += F("%</strong></div>");
  page += F("<div class='status'><div class='muted'>Target</div><strong>");
  page += String(targetPercent);
  page += F("%</strong></div>");
  page += F("<div class='status'><div class='muted'>WiFi</div><strong>");
  page += WiFi.status() == WL_CONNECTED ? "Connected" : "Disconnected";
  page += F("</strong></div>");
  page += F("<div class='status'><div class='muted'>MQTT</div><strong>");
  page += mqttClient.connected() ? "Connected" : "Disconnected";
  page += F("</strong></div></div>");

  page += F("<div class='controls'>");
  page += F("<a class='button' href='/set?value=0'>0%</a>");
  page += F("<a class='button' href='/set?value=25'>25%</a>");
  page += F("<a class='button' href='/set?value=50'>50%</a>");
  page += F("<a class='button' href='/set?value=75'>75%</a>");
  page += F("<a class='button' href='/set?value=100'>100%</a>");
  page += F("<a class='button danger' href='/stop'>STOP</a>");
  page += F("</div>");

  page += F(
    "<form action='/set' method='get'><input type='number' min='0' max='100' "
    "name='value' placeholder='Custom percent 0-100'>"
    "<button type='submit'>Send Percent</button></form>");

  page += F(
    "<p class='muted'>JSON status is available at <code>/status</code>. "
    "If the shutter direction is reversed, set <code>INVERT_DIRECTION</code> "
    "to true in the firmware and reflash.</p>");

  page += F("</div></body></html>");
  return page;
}

void redirectLocalHome() {
  localServer.sendHeader("Location", "/", true);
  localServer.send(303, "text/plain", "");
}

void handleLocalRoot() {
  if (setupPortalActive) {
    localServer.send(200, "text/html", buildSetupPortalPage());
    return;
  }

  localServer.send(200, "text/html", buildLocalFallbackPage());
}

void handleLocalStatus() {
  char payload[1792];
  const size_t payloadLength = buildStatusPayload(
    payload,
    sizeof(payload),
    mqttClient.connected(),
    deviceMode,
    isMoving()
  );
  payload[min(payloadLength, sizeof(payload) - 1)] = '\0';
  localServer.send(200, "application/json", payload);
}

void handleLocalSetPercent() {
  if (setupPortalActive) {
    localServer.send(
      409,
      "text/plain",
      "Movement commands are unavailable while setup mode is active."
    );
    return;
  }

  int nextPercent = 0;
  if (!tryParseInteger(localServer.arg("value"), &nextPercent)) {
    localServer.send(400, "text/plain", "Missing or invalid `value`.");
    return;
  }

  if (nextPercent < 0 || nextPercent > 100) {
    localServer.send(400, "text/plain", "`value` must be between 0 and 100.");
    return;
  }

  handleSetPercentCommand(nextPercent, "local-fallback");
  redirectLocalHome();
}

void handleLocalStop() {
  handleStopCommand("local-fallback");
  redirectLocalHome();
}

void registerLocalFallbackRoutes() {
  if (
    localFallbackRoutesRegistered ||
    (!ENABLE_LOCAL_FALLBACK_WEB && !ENABLE_FACTORY_SETUP_MODE)
  ) {
    return;
  }

  localServer.on("/", HTTP_GET, handleLocalRoot);
  localServer.on("/status", HTTP_GET, handleLocalStatus);
  localServer.on("/set", HTTP_GET, handleLocalSetPercent);
  localServer.on("/stop", HTTP_GET, handleLocalStop);
  localServer.on("/setup/save", HTTP_POST, handleSetupPortalSave);
  localFallbackRoutesRegistered = true;
}

void startLocalFallbackServerIfNeeded() {
  if (
    localFallbackServerStarted ||
    (!ENABLE_LOCAL_FALLBACK_WEB && !ENABLE_FACTORY_SETUP_MODE)
  ) {
    return;
  }

  registerLocalFallbackRoutes();
  localServer.begin();
  localFallbackServerStarted = true;

  if (setupPortalActive) {
    Serial.println("Local setup server started.");
  } else {
    Serial.println("Local fallback web server started.");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("Local station URL: http://");
    Serial.println(WiFi.localIP());
  }
  if (localFallbackApStarted || setupPortalApStarted) {
    Serial.print("Local AP URL: http://");
    Serial.println(WiFi.softAPIP());
  }
}

void startLocalFallbackAccessPointIfNeeded() {
  if (
    !ENABLE_LOCAL_FALLBACK_WEB ||
    localFallbackApStarted ||
    setupPortalActive ||
    setupPortalApStarted
  ) {
    return;
  }

  Serial.println("Starting local fallback access point...");
  applyWiFiConnectionProfile(true);

  if (!WiFi.softAP(LOCAL_FALLBACK_AP_SSID, LOCAL_FALLBACK_AP_PASSWORD)) {
    Serial.println("Failed to start local fallback access point.");
    setDeviceMode(DEVICE_MODE_ERROR);
    return;
  }

  localFallbackApStarted = true;
  Serial.print("Fallback AP SSID: ");
  Serial.println(LOCAL_FALLBACK_AP_SSID);
  Serial.print("Fallback AP IP: ");
  Serial.println(WiFi.softAPIP());
}

void maintainLocalFallback() {
  if (setupPortalActive) {
    if (
      SETUP_PORTAL_TIMEOUT_MS > 0 &&
      setupPortalStartedMs != 0 &&
      millis() - setupPortalStartedMs >= SETUP_PORTAL_TIMEOUT_MS
    ) {
      Serial.println("Setup portal timed out. Restarting device.");
      delay(500);
      ESP.restart();
    }

    startLocalFallbackServerIfNeeded();
    if (localFallbackServerStarted) {
      localServer.handleClient();
    }
    return;
  }

  if (!ENABLE_LOCAL_FALLBACK_WEB) {
    return;
  }

  if (WiFi.status() == WL_CONNECTED) {
    startLocalFallbackServerIfNeeded();
  } else if (millis() - lastCloudHealthyMs >= LOCAL_FALLBACK_AP_DELAY_MS) {
    startLocalFallbackAccessPointIfNeeded();
    startLocalFallbackServerIfNeeded();
  }

  if (localFallbackServerStarted) {
    localServer.handleClient();
  }
}

// -----------------------------------------------------------------------------
// WiFi and MQTT
// -----------------------------------------------------------------------------

void beginWiFiConnection() {
  if (wifiConnectInProgress || setupPortalActive || !hasRuntimeWiFiCredentials()) {
    return;
  }

  setDeviceMode(DEVICE_MODE_WIFI_CONNECTING);

  applyWiFiConnectionProfile(localFallbackApStarted || setupPortalApStarted);
  WiFi.begin(runtimeWifiSsid.c_str(), runtimeWifiPassword.c_str());

  wifiConnectInProgress = true;
  wifiAttemptStartedMs = millis();
  lastWiFiRetryMs = wifiAttemptStartedMs;

  Serial.print("Connecting to WiFi SSID: ");
  Serial.println(runtimeWifiSsid);
}

bool maintainWiFiConnection() {
  if (WiFi.status() == WL_CONNECTED) {
    if (wifiConnectInProgress) {
      wifiConnectInProgress = false;
      Serial.print("WiFi connected. IP address: ");
      Serial.println(WiFi.localIP());
      stopFactorySetupPortalIfNeeded();
      setDeviceMode(DEVICE_MODE_MQTT_CONNECTING);
    }

    return true;
  }

  if (!hasRuntimeWiFiCredentials()) {
    if (ENABLE_FACTORY_SETUP_MODE && !setupPortalActive) {
      startFactorySetupPortal("No Wi-Fi credentials saved yet.");
    }
    return false;
  }

  if (setupPortalActive) {
    return false;
  }

  const unsigned long now = millis();

  if (!wifiConnectInProgress) {
    if (lastWiFiRetryMs == 0 || now - lastWiFiRetryMs >= WIFI_RETRY_MS) {
      beginWiFiConnection();
    }

    return false;
  }

  if (now - wifiAttemptStartedMs >= WIFI_CONNECT_TIMEOUT_MS) {
    Serial.println("WiFi connection timed out. Will retry.");
    WiFi.disconnect();
    wifiConnectInProgress = false;
    lastWiFiRetryMs = now;
    if (ENABLE_FACTORY_SETUP_MODE) {
      startFactorySetupPortal("Unable to join Wi-Fi. Update the network and try again.");
    } else {
      setDeviceMode(DEVICE_MODE_ERROR);
    }
  }

  return false;
}

bool connectMqtt() {
  if (mqttClient.connected()) {
    return true;
  }

  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }

  const unsigned long now = millis();
  if (now - lastMqttRetryMs < MQTT_RETRY_MS) {
    return false;
  }

  lastMqttRetryMs = now;
  setDeviceMode(DEVICE_MODE_MQTT_CONNECTING);

  char offlinePayload[1792];
  const size_t offlinePayloadLength = buildStatusPayload(
    offlinePayload,
    sizeof(offlinePayload),
    false,
    DEVICE_MODE_ERROR,
    false
  );
  offlinePayload[min(offlinePayloadLength, sizeof(offlinePayload) - 1)] = '\0';

  Serial.print("Connecting to MQTT broker ");
  Serial.print(MQTT_HOST);
  Serial.print(":");
  Serial.println(MQTT_PORT);

  if (!mqttClient.connect(
        resolvedMqttClientId.c_str(),
        MQTT_USERNAME,
        MQTT_PASSWORD,
        resolvedStatusTopic.c_str(),
        1,
        true,
        offlinePayload)) {
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

  lastCloudHealthyMs = millis();
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
    Serial.println("Command received: type=STOP");
    handleStopCommand("mqtt");
    return;
  }

  if (strcmp(type, "CHECK_UPDATE") == 0) {
    handleCheckUpdateCommand("mqtt");
    return;
  }

  if (strcmp(type, "START_SOS") == 0) {
    handleStartSosCommand("mqtt");
    return;
  }

  if (strcmp(type, "END_SOS") == 0) {
    handleEndSosCommand("mqtt");
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

  if (!commandDoc["value"].is<int>() && !commandDoc["value"].is<float>()) {
    Serial.println("Ignoring SET_PERCENT command without numeric `value`.");
    setDeviceMode(DEVICE_MODE_ERROR);
    publishStatus(true);
    return;
  }

  const int nextPercent =
    constrain(static_cast<int>(round(commandDoc["value"].as<float>())), 0, 100);
  handleSetPercentCommand(nextPercent, "mqtt");
}

// -----------------------------------------------------------------------------
// Setup and Main Loop
// -----------------------------------------------------------------------------

void setup() {
  Serial.begin(115200);
  delay(1000);

  bootStartedMs = millis();
  lastCloudHealthyMs = bootStartedMs;
  otaAutoCheckJitterMs =
    OTA_AUTO_CHECK_JITTER_MS > 0
      ? static_cast<unsigned long>(ESP.getEfuseMac() % (OTA_AUTO_CHECK_JITTER_MS + 1UL))
      : 0;

  Serial.println("Smart Shutter MVP booting...");
  setDeviceMode(DEVICE_MODE_BOOTING);

  // Absolute position is still estimated in software only. Calibration keeps
  // the saved travel range, but manual movement can still desync live percent.
  resolveRuntimeWiFiCredentials();
  resolvedDeviceId = resolveDeviceId();
  resolvedMqttClientId = resolveMqttClientId();
  resolvedCommandTopic =
    resolveTopic(COMMAND_TOPIC, storedCommandTopic, "commands");
  resolvedStatusTopic =
    resolveTopic(STATUS_TOPIC, storedStatusTopic, "status");
  setupPortalSsid = String(SETUP_AP_SSID_PREFIX) + getMacSuffixUpper();

  Serial.print("Resolved deviceId: ");
  Serial.println(resolvedDeviceId);
  Serial.print("Resolved MQTT client ID: ");
  Serial.println(resolvedMqttClientId);
  Serial.print("Resolved command topic: ");
  Serial.println(resolvedCommandTopic);
  Serial.print("Resolved status topic: ");
  Serial.println(resolvedStatusTopic);
  Serial.println("MQTT topics resolved.");

  applyMotionProfile();
  stepper.setCurrentPosition(lastPersistedPositionSteps);
  stepper.moveTo(lastPersistedPositionSteps);
  updateTargetPercentFromStepper();
  syncMovementLockedReason();
  syncStepperPowerState();

  if (
    storedDeviceId != resolvedDeviceId ||
    storedMqttClientId != resolvedMqttClientId ||
    storedCommandTopic != resolvedCommandTopic ||
    storedStatusTopic != resolvedStatusTopic
  ) {
    capturePositionSnapshot(false);
    savePersistedDeviceSettings(runtimeWifiSsid, runtimeWifiPassword);
  }

  // MVP only: this skips CA certificate validation so HiveMQ Cloud can be
  // reached quickly during prototyping. Replace with CA validation for any
  // production or installed-device deployment.
  secureClient.setInsecure();

  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(onMqttMessage);
  mqttClient.setBufferSize(2048);
  mqttClient.setKeepAlive(MQTT_KEEP_ALIVE_SECONDS);

  setOtaState(
    ENABLE_OTA_UPDATES ? OTA_STATE_IDLE : OTA_STATE_DISABLED,
    "",
    "",
    false
  );

  if (hasRuntimeWiFiCredentials()) {
    beginWiFiConnection();
  } else if (ENABLE_FACTORY_SETUP_MODE) {
    startFactorySetupPortal("No Wi-Fi credentials saved yet.");
  } else {
    Serial.println("WiFi credentials are missing and factory setup mode is disabled.");
    setDeviceMode(DEVICE_MODE_ERROR);
  }
  maintainLocalFallback();
}

void loop() {
  const bool wifiReady = maintainWiFiConnection();

  if (wifiReady) {
    connectMqtt();
  }

  if (mqttClient.connected()) {
    mqttClient.loop();
    lastCloudHealthyMs = millis();
  }

  maintainLocalFallback();
  stepper.run();

  const bool movingNow = isMoving();
  if (movingNow != lastMovingState) {
    Serial.print("Movement state changed: ");
    Serial.println(movingNow ? "moving" : "idle");

    lastMovingState = movingNow;
    if (!movingNow && !(isSosModeActive() && sosPhase == SOS_PHASE_PULSE_OUT)) {
      setPositionEstimateState(
        positionVerified
          ? POSITION_ESTIMATE_TRACKED
          : POSITION_ESTIMATE_NEEDS_VERIFICATION
      );
      capturePositionSnapshot(false);
      savePersistedDeviceSettings(runtimeWifiSsid, runtimeWifiPassword);
    }
    syncStepperPowerState();
    setDeviceMode(movingNow ? DEVICE_MODE_MOVING : getIdleModeFromConnectivity());
    updateTargetPercentFromStepper();
    publishStatus(true);
  }

  const unsigned long now = millis();
  const unsigned long statusIntervalMs = getStatusPublishIntervalMs(movingNow);
  if (
    mqttClient.connected() &&
    statusIntervalMs > 0 &&
    now - lastStatusPublishMs >= statusIntervalMs
  ) {
    publishStatus();
  }

  maintainSosMode();
  maybeRunAutoUpdateCheck();
}
