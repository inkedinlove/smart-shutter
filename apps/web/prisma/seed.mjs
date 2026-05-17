import fs from "node:fs";
import { createHash } from "node:crypto";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const isInternalTestMode =
  process.env.INTERNAL_TEST_MODE?.trim().toLowerCase() === "true";
const firmwareVersions = JSON.parse(
  fs.readFileSync(
    new URL("../config/firmware-versions.json", import.meta.url),
    "utf8",
  ),
);
const defaultEsp32Version =
  firmwareVersions?.boards?.esp32 ?? "0.1.1-dev-esp32";
const defaultEsp32ArtifactPath =
  `/firmware/releases/${defaultEsp32Version}/smart-shutter-${defaultEsp32Version}.bin`;
const placeholderSha256 =
  "0000000000000000000000000000000000000000000000000000000000000000";

function getDefaultEsp32ReleaseMetadata() {
  const artifactFileUrl = new URL(
    `../public${defaultEsp32ArtifactPath}`,
    import.meta.url,
  );

  if (!fs.existsSync(artifactFileUrl)) {
    return {
      sha256: placeholderSha256,
      sizeBytes: null,
      notes: "Placeholder firmware release entry for MVP planning and UI flow.",
    };
  }

  const artifactContents = fs.readFileSync(artifactFileUrl);

  return {
    sha256: createHash("sha256").update(artifactContents).digest("hex"),
    sizeBytes: fs.statSync(artifactFileUrl).size,
    notes: "Staged firmware release entry synchronized from the local OTA artifact.",
  };
}

const defaultEsp32ReleaseMetadata = getDefaultEsp32ReleaseMetadata();

async function main() {
  const demoProfile = isInternalTestMode
    ? await prisma.userProfile.upsert({
        where: {
          email: "demo@smartshutter.local",
        },
        update: {
          displayName: "Demo Operator",
        },
        create: {
          displayName: "Demo Operator",
          email: "demo@smartshutter.local",
        },
      })
    : null;

  await prisma.device.upsert({
    where: {
      deviceId: "shutter-dev-001",
    },
    update: {
      label: "Internal Test Shutter",
      board: "esp32",
      status: "manual_mvp",
      mqttCommandTopic: "shutters/shutter-dev-001/commands",
      mqttStatusTopic: "shutters/shutter-dev-001/status",
      brokerProfile: "hivemq-dev",
      otaAutoUpdateEnabled: false,
      otaAutoUpdateChannel: "stable",
      ownerProfileId: demoProfile?.id ?? null,
    },
    create: {
      deviceId: "shutter-dev-001",
      label: "Internal Test Shutter",
      board: "esp32",
      status: "manual_mvp",
      firmwareVersion: null,
      mqttCommandTopic: "shutters/shutter-dev-001/commands",
      mqttStatusTopic: "shutters/shutter-dev-001/status",
      brokerProfile: "hivemq-dev",
      otaAutoUpdateEnabled: false,
      otaAutoUpdateChannel: "stable",
      ownerProfileId: demoProfile?.id ?? null,
    },
  });

  await prisma.firmwareRelease.upsert({
    where: {
      version: defaultEsp32Version,
    },
    update: {
      channel: "stable",
      board: "esp32",
      artifactUrl: defaultEsp32ArtifactPath,
      sha256: defaultEsp32ReleaseMetadata.sha256,
      sizeBytes: defaultEsp32ReleaseMetadata.sizeBytes,
      notes: defaultEsp32ReleaseMetadata.notes,
      isActive: true,
    },
    create: {
      version: defaultEsp32Version,
      channel: "stable",
      board: "esp32",
      artifactUrl: defaultEsp32ArtifactPath,
      sha256: defaultEsp32ReleaseMetadata.sha256,
      sizeBytes: defaultEsp32ReleaseMetadata.sizeBytes,
      notes: defaultEsp32ReleaseMetadata.notes,
      isActive: true,
    },
  });
}

main()
  .catch((error) => {
    console.error("Prisma seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
