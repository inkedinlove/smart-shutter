import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const [, , deviceIdArg] = process.argv;

if (!deviceIdArg) {
  console.error("Usage: node scripts/print-device-config.mjs <deviceId>");
  process.exit(1);
}

const registryPath = path.join(
  process.cwd(),
  "apps",
  "web",
  "devices",
  "devices.json",
);
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const device = registry.devices.find((entry) => entry.deviceId === deviceIdArg);

if (!device) {
  console.error(`Unknown deviceId: ${deviceIdArg}`);
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

const envCandidates = [
  path.join(process.cwd(), "apps", "web", ".env.local"),
  path.join(process.cwd(), "apps", "web", ".env"),
  path.join(process.cwd(), "apps", "web", ".env.example"),
];

const fileEnv = envCandidates.reduce(
  (accumulator, filePath) => ({ ...accumulator, ...parseDotEnvFile(filePath) }),
  {},
);

const mqttHost =
  process.env.MQTT_HOST || fileEnv.MQTT_HOST || "PASTE_HIVEMQ_HOST";
const mqttPort = Number(process.env.MQTT_PORT || fileEnv.MQTT_PORT || "8883");
const publicAppBaseUrl =
  process.env.PUBLIC_APP_BASE_URL ||
  fileEnv.PUBLIC_APP_BASE_URL ||
  "https://your-app.example.com";

const output = [
  "#pragma once",
  "",
  `constexpr const char* DEVICE_ID = "${device.deviceId}";`,
  '#define FIRMWARE_VERSION "0.1.0-dev"',
  `constexpr const char* MQTT_HOST = "${mqttHost}";`,
  `constexpr int MQTT_PORT = ${mqttPort};`,
  'constexpr const char* MQTT_USERNAME = "PASTE_USERNAME";',
  'constexpr const char* MQTT_PASSWORD = "PASTE_PASSWORD";',
  `constexpr const char* COMMAND_TOPIC = "${device.commandTopic}";`,
  `constexpr const char* STATUS_TOPIC = "${device.statusTopic}";`,
  "#define ENABLE_OTA_UPDATES false",
  `#define API_BASE_URL "${publicAppBaseUrl}"`,
  '#define OTA_MANIFEST_PATH_TEMPLATE "/api/devices/{deviceId}/firmware/manifest"',
];

process.stdout.write(`${output.join("\n")}\n`);
