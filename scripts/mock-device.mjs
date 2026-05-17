import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const STATUS_INTERVAL_MS = 3000;
const MOTION_INTERVAL_MS = 250;
const PERCENT_PER_TICK = 2;
const TRAVEL_STEPS = 2048;
const SAFE_ALLOWED_MAX_PERCENT_STEP = 10;
const DEFAULT_NUDGE_AMOUNT = 2;

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const webPackageJsonPath = path.join(repoRoot, "apps", "web", "package.json");
const firmwareVersionsPath = path.join(
  repoRoot,
  "apps",
  "web",
  "config",
  "firmware-versions.json",
);
const webRequire = createRequire(webPackageJsonPath);
const mqtt = webRequire("mqtt");
const firmwareVersions = JSON.parse(fs.readFileSync(firmwareVersionsPath, "utf8"));
const defaultMockFirmwareVersion =
  firmwareVersions?.boards?.esp32 ?? "0.1.1-dev-esp32";

loadEnvFiles();

const args = parseArgs(process.argv.slice(2));
const deviceId = args.deviceId ?? "shutter-dev-001";
const firmwareVersion = args.firmwareVersion ?? defaultMockFirmwareVersion;
const commandTopic = `shutters/${deviceId}/commands`;
const statusTopic = `shutters/${deviceId}/status`;

const mqttHost = requireEnv("MQTT_HOST");
const mqttPort = parsePort(process.env.MQTT_PORT);
const mqttUsername = requireEnv("MQTT_USERNAME");
const mqttPassword = requireEnv("MQTT_PASSWORD");

const client = mqtt.connect(`mqtts://${mqttHost}:${mqttPort}`, {
  username: mqttUsername,
  password: mqttPassword,
  clientId: `smart-shutter-mock-${deviceId}-${randomUUID()}`,
  clean: true,
  connectTimeout: 3000,
  reconnectPeriod: 1500,
  keepalive: 15,
});

const state = {
  startTime: Date.now(),
  firmwareVersion,
  deviceId,
  online: true,
  moving: false,
  deviceMode: "BOOTING",
  currentPercent: 0,
  targetPercent: 0,
  currentSteps: 0,
  targetSteps: 0,
  wifiConnected: true,
  localFallbackActive: false,
  otaEnabled: false,
  otaState: "DISABLED",
  otaLastError: undefined,
  otaTargetVersion: undefined,
  calibrationComplete: false,
  safetyMode: true,
  allowedMaxPercentStep: SAFE_ALLOWED_MAX_PERCENT_STEP,
  lastCalibrationAction: "SAFE_SETUP_MODE_ENABLED",
  movementLockedReason: "Calibration required before larger movement.",
  movementLocked: false,
};

let statusTimer = null;
let motionTimer = null;
let isStopping = false;

function loadEnvFiles() {
  const providedKeys = new Set(Object.keys(process.env));
  const envFiles = [
    path.join(repoRoot, "apps", "web", ".env"),
    path.join(repoRoot, "apps", "web", ".env.local"),
  ];

  for (const envFile of envFiles) {
    if (!fs.existsSync(envFile)) {
      continue;
    }

    const contents = fs.readFileSync(envFile, "utf8");
    const lines = contents.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");

      if (separatorIndex <= 0) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (providedKeys.has(key)) {
        continue;
      }

      process.env[key] = value;
    }
  }
}

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--deviceId") {
      parsed.deviceId = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === "--firmwareVersion") {
      parsed.firmwareVersion = argv[index + 1];
      index += 1;
    }
  }

  return parsed;
}

function requireEnv(name) {
  const value = process.env[name];

  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

function parsePort(rawPort) {
  const port = Number(rawPort ?? "8883");

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("Invalid MQTT_PORT value.");
  }

  return port;
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, value));
}

function percentToSteps(percent) {
  return Math.round((clampPercent(percent) / 100) * TRAVEL_STEPS);
}

function stepsToPercent(steps) {
  return clampPercent((steps / TRAVEL_STEPS) * 100);
}

function getRssi() {
  const elapsed = Date.now() - state.startTime;
  return -58 + Math.round(Math.sin(elapsed / 10000) * 4);
}

function updateStepTargets() {
  state.currentSteps = percentToSteps(state.currentPercent);
  state.targetSteps = percentToSteps(state.targetPercent);
}

function getAllowedMaxPercentStep() {
  if (!state.safetyMode || state.calibrationComplete) {
    return 100;
  }

  return state.allowedMaxPercentStep;
}

function getCalibrationLockReason() {
  if (!state.safetyMode || state.calibrationComplete) {
    return undefined;
  }

  return "Calibration required before larger movement.";
}

function syncMovementLockReason() {
  if (state.movementLocked) {
    state.movementLockedReason = "Movement locked by operator.";
    return;
  }

  state.movementLockedReason = getCalibrationLockReason();
}

function updateModeAfterMotion() {
  state.deviceMode = state.moving ? "MOVING" : "READY";
}

function buildStatusPayload() {
  updateStepTargets();

  return {
    deviceId: state.deviceId,
    firmwareVersion: state.firmwareVersion,
    deviceUptimeMs: Date.now() - state.startTime,
    rssi: getRssi(),
    online: state.online,
    moving: state.moving,
    deviceMode: state.deviceMode,
    estimatedPercent: Math.round(state.currentPercent),
    targetPercent: Math.round(state.targetPercent),
    currentSteps: state.currentSteps,
    targetSteps: state.targetSteps,
    wifiConnected: state.wifiConnected,
    localFallbackActive: state.localFallbackActive,
    otaEnabled: state.otaEnabled,
    otaState: state.otaState,
    otaLastError: state.otaLastError,
    otaTargetVersion: state.otaTargetVersion,
    calibrationComplete: state.calibrationComplete,
    safetyMode: state.safetyMode,
    allowedMaxPercentStep: getAllowedMaxPercentStep(),
    lastCalibrationAction: state.lastCalibrationAction,
    movementLockedReason: state.movementLockedReason,
    lastSeenAt: new Date().toISOString(),
  };
}

function publishStatus(reason = "interval") {
  const payload = buildStatusPayload();

  client.publish(statusTopic, JSON.stringify(payload), { qos: 1, retain: true }, (error) => {
    if (error) {
      console.error(`[mock-device] status publish failed (${reason}):`, error.message);
      return;
    }

    console.log(
      `[mock-device] status (${reason}) mode=${payload.deviceMode} moving=${payload.moving} estimated=${payload.estimatedPercent}% target=${payload.targetPercent}% ota=${payload.otaState}`,
    );
  });
}

function startMotionLoop() {
  if (motionTimer) {
    return;
  }

  motionTimer = setInterval(() => {
    const delta = state.targetPercent - state.currentPercent;

    if (Math.abs(delta) <= PERCENT_PER_TICK) {
      state.currentPercent = clampPercent(state.targetPercent);
      state.moving = false;
      updateModeAfterMotion();
      publishStatus("movement-complete");
      stopMotionLoop();
      return;
    }

    state.currentPercent = clampPercent(
      state.currentPercent + Math.sign(delta) * PERCENT_PER_TICK,
    );
    state.moving = true;
    updateModeAfterMotion();
  }, MOTION_INTERVAL_MS);
}

function stopMotionLoop() {
  if (!motionTimer) {
    return;
  }

  clearInterval(motionTimer);
  motionTimer = null;
}

function rejectMovement(reason, statusReason) {
  state.moving = false;
  state.targetPercent = Math.round(state.currentPercent);
  state.otaLastError = undefined;
  state.movementLockedReason = reason;
  updateModeAfterMotion();
  publishStatus(statusReason);
}

function beginMoveToPercent(nextPercent, reason) {
  syncMovementLockReason();
  state.targetPercent = clampPercent(nextPercent);
  state.otaLastError = undefined;

  if (Math.round(state.currentPercent) === Math.round(state.targetPercent)) {
    state.moving = false;
    updateModeAfterMotion();
    stopMotionLoop();
    publishStatus(`${reason}-noop`);
    return;
  }

  state.moving = true;
  updateModeAfterMotion();
  publishStatus(reason);
  startMotionLoop();
}

function handleSetPercent(command) {
  const value = typeof command.value === "number" ? clampPercent(command.value) : null;

  if (value === null) {
    console.warn("[mock-device] ignoring SET_PERCENT without numeric value");
    return;
  }

  if (state.movementLocked) {
    rejectMovement("Movement locked by operator.", "set-percent-locked");
    return;
  }

  if (state.safetyMode && !state.calibrationComplete) {
    if (value === 100) {
      rejectMovement(
        "100% is blocked until calibration is complete.",
        "set-percent-blocked-full-open",
      );
      return;
    }

    const requestedDelta = Math.abs(value - state.currentPercent);
    if (requestedDelta > getAllowedMaxPercentStep()) {
      rejectMovement(
        `Safe setup mode only allows ${getAllowedMaxPercentStep()}% per move.`,
        "set-percent-blocked-step",
      );
      return;
    }
  }

  beginMoveToPercent(value, "set-percent");
}

function handleNudge(direction, command) {
  const rawAmount =
    typeof command.amount === "number" && Number.isFinite(command.amount)
      ? Math.round(command.amount)
      : DEFAULT_NUDGE_AMOUNT;
  const amount = Math.max(1, Math.min(rawAmount, getAllowedMaxPercentStep()));

  if (state.movementLocked) {
    rejectMovement("Movement locked by operator.", `nudge-${direction}-locked`);
    return;
  }

  const nextPercent =
    state.currentPercent + (direction === "open" ? amount : -amount);
  beginMoveToPercent(nextPercent, `nudge-${direction}`);
}

function handleStop() {
  stopMotionLoop();
  state.currentPercent = clampPercent(state.currentPercent);
  state.targetPercent = Math.round(stepsToPercent(percentToSteps(state.currentPercent)));
  state.moving = false;
  syncMovementLockReason();
  updateModeAfterMotion();
  publishStatus("stop");
}

function handleCheckUpdate() {
  if (!state.otaEnabled) {
    state.otaState = "DISABLED";
    state.otaLastError = "OTA disabled";
    publishStatus("check-update-disabled");
    return;
  }

  publishStatus("check-update");
}

function handleSetCurrentAsClosed() {
  stopMotionLoop();
  state.currentPercent = 0;
  state.targetPercent = 0;
  state.currentSteps = 0;
  state.targetSteps = 0;
  state.lastCalibrationAction = "SET_CURRENT_AS_CLOSED";
  syncMovementLockReason();
  updateModeAfterMotion();
  publishStatus("set-current-as-closed");
}

function handleSetCurrentAsOpen() {
  stopMotionLoop();
  state.currentPercent = 100;
  state.targetPercent = 100;
  state.currentSteps = percentToSteps(100);
  state.targetSteps = percentToSteps(100);
  state.lastCalibrationAction = "SET_CURRENT_AS_OPEN";
  syncMovementLockReason();
  updateModeAfterMotion();
  publishStatus("set-current-as-open");
}

function handleMarkCalibrationComplete() {
  state.calibrationComplete = true;
  state.lastCalibrationAction = "MARK_CALIBRATION_COMPLETE";
  syncMovementLockReason();
  updateModeAfterMotion();
  publishStatus("mark-calibration-complete");
}

function handleLockMovement() {
  stopMotionLoop();
  state.targetPercent = Math.round(state.currentPercent);
  state.moving = false;
  state.movementLocked = true;
  state.lastCalibrationAction = "LOCK_MOVEMENT";
  syncMovementLockReason();
  updateModeAfterMotion();
  publishStatus("lock-movement");
}

function handleUnlockMovement() {
  state.movementLocked = false;
  state.lastCalibrationAction = "UNLOCK_MOVEMENT";
  syncMovementLockReason();
  updateModeAfterMotion();
  publishStatus("unlock-movement");
}

function handleCommand(message) {
  let parsed;

  try {
    parsed = JSON.parse(message);
  } catch (error) {
    console.warn("[mock-device] ignoring invalid JSON command:", error);
    return;
  }

  console.log("[mock-device] command received:", parsed);

  switch (parsed?.type) {
    case "SET_PERCENT":
      handleSetPercent(parsed);
      break;
    case "NUDGE_OPEN":
      handleNudge("open", parsed);
      break;
    case "NUDGE_CLOSE":
      handleNudge("close", parsed);
      break;
    case "STOP":
      handleStop();
      break;
    case "SET_CURRENT_AS_CLOSED":
      handleSetCurrentAsClosed();
      break;
    case "SET_CURRENT_AS_OPEN":
      handleSetCurrentAsOpen();
      break;
    case "MARK_CALIBRATION_COMPLETE":
      handleMarkCalibrationComplete();
      break;
    case "LOCK_MOVEMENT":
      handleLockMovement();
      break;
    case "UNLOCK_MOVEMENT":
      handleUnlockMovement();
      break;
    case "CHECK_UPDATE":
      handleCheckUpdate();
      break;
    default:
      console.warn("[mock-device] ignoring unsupported command type:", parsed?.type);
  }
}

client.on("connect", () => {
  console.log(`[mock-device] connected to mqtts://${mqttHost}:${mqttPort}`);
  console.log(`[mock-device] deviceId=${deviceId}`);
  console.log(`[mock-device] commandTopic=${commandTopic}`);
  console.log(`[mock-device] statusTopic=${statusTopic}`);

  state.deviceMode = "READY";
  state.online = true;
  syncMovementLockReason();

  client.subscribe(commandTopic, { qos: 1 }, (error) => {
    if (error) {
      console.error("[mock-device] subscribe failed:", error.message);
      return;
    }

    console.log("[mock-device] subscribed to command topic");
    publishStatus("connect");
  });

  if (!statusTimer) {
    statusTimer = setInterval(() => {
      publishStatus("interval");
    }, STATUS_INTERVAL_MS);
  }
});

client.on("message", (topic, payload) => {
  if (topic !== commandTopic) {
    return;
  }

  handleCommand(payload.toString("utf8"));
});

client.on("reconnect", () => {
  console.log("[mock-device] reconnecting to MQTT...");
});

client.on("error", (error) => {
  console.error("[mock-device] mqtt error:", error.message);
});

client.on("close", () => {
  console.log("[mock-device] mqtt connection closed");
});

async function shutdown(signal) {
  if (isStopping) {
    return;
  }

  isStopping = true;

  if (statusTimer) {
    clearInterval(statusTimer);
    statusTimer = null;
  }

  stopMotionLoop();
  state.online = false;
  state.moving = false;
  state.deviceMode = "ERROR";

  console.log(`[mock-device] shutting down on ${signal}`);

  client.publish(
    statusTopic,
    JSON.stringify(buildStatusPayload()),
    { qos: 1, retain: true },
    () => {
      client.end(true, () => {
        process.exit(0);
      });
    },
  );
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
