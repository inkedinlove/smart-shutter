import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const [, , boardArg] = process.argv;

if (!boardArg) {
  console.error("Usage: node scripts/generate-shared-ota-config.mjs <board>");
  process.exit(1);
}

const repoRoot = process.cwd();
const boardMap = {
  esp32: {
    configExamplePath: path.join(
      repoRoot,
      "firmware",
      "esp32-shutter",
      "config.example.h",
    ),
  },
  "esp8266-d1d4": {
    configExamplePath: path.join(
      repoRoot,
      "firmware",
      "esp8266-d1d4-shutter",
      "config.example.h",
    ),
  },
};

const boardConfig = boardMap[boardArg];
if (!boardConfig) {
  console.error(
    `Unsupported board '${boardArg}'. Expected one of: ${Object.keys(boardMap).join(", ")}`,
  );
  process.exit(1);
}

function parseDotEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        const key = line.slice(0, separatorIndex).trim();
        const value = line.slice(separatorIndex + 1).trim();
        return [key, value];
      }),
  );
}

function toCString(rawValue) {
  return `"${String(rawValue).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function normalizePublicAppBaseUrl(rawValue) {
  const normalizedValue = String(rawValue ?? "").trim();
  if (normalizedValue.length === 0) {
    return "";
  }

  const loweredValue = normalizedValue.toLowerCase();
  if (
    loweredValue.includes("localhost") ||
    loweredValue.includes("127.0.0.1") ||
    loweredValue.includes("0.0.0.0") ||
    loweredValue.includes("your-app.example.com")
  ) {
    return "";
  }

  return normalizedValue.replace(/\/+$/, "");
}

function replaceRequiredLine(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    console.error(`Unable to find ${label} in config.example.h.`);
    process.exit(1);
  }

  return source.replace(pattern, replacement);
}

const envCandidates = [
  path.join(repoRoot, "apps", "web", ".env.example"),
  path.join(repoRoot, "apps", "web", ".env"),
  path.join(repoRoot, "apps", "web", ".env.local"),
];

const fileEnv = envCandidates.reduce(
  (accumulator, filePath) => ({ ...accumulator, ...parseDotEnvFile(filePath) }),
  {},
);

const mqttHost = process.env.MQTT_HOST?.trim() || fileEnv.MQTT_HOST?.trim() || "";
const mqttPortValue = process.env.MQTT_PORT?.trim() || fileEnv.MQTT_PORT?.trim() || "8883";
const mqttUsername =
  process.env.MQTT_USERNAME?.trim() || fileEnv.MQTT_USERNAME?.trim() || "";
const mqttPassword =
  process.env.MQTT_PASSWORD?.trim() || fileEnv.MQTT_PASSWORD?.trim() || "";
const publicAppBaseUrl = normalizePublicAppBaseUrl(
  process.env.PUBLIC_APP_BASE_URL?.trim() || fileEnv.PUBLIC_APP_BASE_URL?.trim() || "",
);

const mqttPort = Number.parseInt(mqttPortValue, 10);
if (!mqttHost || !mqttUsername || !mqttPassword || !Number.isFinite(mqttPort) || mqttPort <= 0) {
  console.error(
    "Shared OTA build requires real MQTT_HOST, MQTT_PORT, MQTT_USERNAME, and MQTT_PASSWORD in apps/web/.env or the process environment.",
  );
  process.exit(1);
}

let configSource = fs.readFileSync(boardConfig.configExamplePath, "utf8");

configSource = replaceRequiredLine(
  configSource,
  /^constexpr const char\* WIFI_SSID = .*;$/m,
  'constexpr const char* WIFI_SSID = "";',
  "WIFI_SSID",
);
configSource = replaceRequiredLine(
  configSource,
  /^constexpr const char\* WIFI_PASSWORD = .*;$/m,
  'constexpr const char* WIFI_PASSWORD = "";',
  "WIFI_PASSWORD",
);
configSource = replaceRequiredLine(
  configSource,
  /^constexpr const char\* MQTT_HOST = .*;$/m,
  `constexpr const char* MQTT_HOST = ${toCString(mqttHost)};`,
  "MQTT_HOST",
);
configSource = replaceRequiredLine(
  configSource,
  /^constexpr int MQTT_PORT = .*;$/m,
  `constexpr int MQTT_PORT = ${mqttPort};`,
  "MQTT_PORT",
);
configSource = replaceRequiredLine(
  configSource,
  /^constexpr const char\* MQTT_USERNAME = .*;$/m,
  `constexpr const char* MQTT_USERNAME = ${toCString(mqttUsername)};`,
  "MQTT_USERNAME",
);
configSource = replaceRequiredLine(
  configSource,
  /^constexpr const char\* MQTT_PASSWORD = .*;$/m,
  `constexpr const char* MQTT_PASSWORD = ${toCString(mqttPassword)};`,
  "MQTT_PASSWORD",
);
configSource = replaceRequiredLine(
  configSource,
  /^constexpr const char\* MQTT_CLIENT_ID = .*;$/m,
  'constexpr const char* MQTT_CLIENT_ID = "";',
  "MQTT_CLIENT_ID",
);
configSource = replaceRequiredLine(
  configSource,
  /^constexpr const char\* DEVICE_ID = .*;$/m,
  'constexpr const char* DEVICE_ID = "";',
  "DEVICE_ID",
);
configSource = replaceRequiredLine(
  configSource,
  /^constexpr const char\* COMMAND_TOPIC = .*;$/m,
  'constexpr const char* COMMAND_TOPIC = "shutters/{deviceId}/commands";',
  "COMMAND_TOPIC",
);
configSource = replaceRequiredLine(
  configSource,
  /^constexpr const char\* STATUS_TOPIC = .*;$/m,
  'constexpr const char* STATUS_TOPIC = "shutters/{deviceId}/status";',
  "STATUS_TOPIC",
);
configSource = replaceRequiredLine(
  configSource,
  /^#define API_BASE_URL .*$/m,
  `#define API_BASE_URL ${toCString(publicAppBaseUrl)}`,
  "API_BASE_URL",
);

process.stdout.write(configSource);
