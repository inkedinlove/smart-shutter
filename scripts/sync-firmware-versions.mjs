import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const firmwareVersionsPath = path.join(
  repoRoot,
  "apps",
  "web",
  "config",
  "firmware-versions.json",
);

const firmwareVersions = JSON.parse(
  fs.readFileSync(firmwareVersionsPath, "utf8"),
);

const boardFiles = {
  esp32: [
    path.join(repoRoot, "firmware", "esp32-shutter", "config.example.h"),
    path.join(repoRoot, "firmware", "esp32-shutter", "esp32-shutter.ino"),
  ],
  esp8266: [
    path.join(repoRoot, "firmware", "esp8266-shutter", "config.example.h"),
    path.join(repoRoot, "firmware", "esp8266-shutter", "esp8266-shutter.ino"),
  ],
  "esp8266-d1d4": [
    path.join(repoRoot, "firmware", "esp8266-d1d4-shutter", "config.example.h"),
    path.join(repoRoot, "firmware", "esp8266-d1d4-shutter", "esp8266-d1d4-shutter.ino"),
  ],
  "esp8266-servo": [
    path.join(repoRoot, "firmware", "esp8266-servo-shutter", "config.example.h"),
    path.join(repoRoot, "firmware", "esp8266-servo-shutter", "esp8266-servo-shutter.ino"),
  ],
};

const boardSketchDirs = {
  esp32: "esp32-shutter",
  esp8266: "esp8266-shutter",
  "esp8266-d1d4": "esp8266-d1d4-shutter",
  "esp8266-servo": "esp8266-servo-shutter",
};

for (const [board, files] of Object.entries(boardFiles)) {
  const configPath = path.join(
    repoRoot,
    "firmware",
    boardSketchDirs[board],
    "config.h",
  );

  if (fs.existsSync(configPath)) {
    files.unshift(configPath);
  }
}

function replaceFirmwareVersion(source, version, filePath) {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  let replaced = false;
  const nextSource = source
    .split(/\r?\n/)
    .map((line) => {
      if (!line.includes('#define FIRMWARE_VERSION "')) {
        return line;
      }

      replaced = true;
      return line.replace(
        /#define FIRMWARE_VERSION "[^"\r\n]+"/,
        `#define FIRMWARE_VERSION "${version}"`,
      );
    })
    .join(newline);

  if (!replaced) {
    throw new Error(`Unable to locate FIRMWARE_VERSION define in ${filePath}`);
  }

  return nextSource;
}

const changedFiles = [];

for (const [board, files] of Object.entries(boardFiles)) {
  const version = firmwareVersions?.boards?.[board];

  if (typeof version !== "string" || version.trim().length === 0) {
    throw new Error(`Missing firmware version for board ${board}`);
  }

  for (const filePath of files) {
    const currentSource = fs.readFileSync(filePath, "utf8");
    const nextSource = replaceFirmwareVersion(currentSource, version.trim(), filePath);

    if (nextSource !== currentSource) {
      fs.writeFileSync(filePath, nextSource, "utf8");
      changedFiles.push(path.relative(repoRoot, filePath));
    }
  }
}

if (changedFiles.length === 0) {
  console.log("Firmware versions already match the shared catalog.");
} else {
  console.log("Synchronized firmware versions:");
  for (const relativePath of changedFiles) {
    console.log(` - ${relativePath}`);
  }
}
