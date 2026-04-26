import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const isInternalTestMode =
  process.env.INTERNAL_TEST_MODE?.trim().toLowerCase() === "true";

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
      version: "0.1.0-dev",
    },
    update: {
      channel: "stable",
      board: "esp32",
      artifactUrl: "https://example.com/firmware/smart-shutter-0.1.0-dev.bin",
      sha256:
        "0000000000000000000000000000000000000000000000000000000000000000",
      sizeBytes: null,
      notes: "Placeholder firmware release entry for MVP planning and UI flow.",
      isActive: true,
    },
    create: {
      version: "0.1.0-dev",
      channel: "stable",
      board: "esp32",
      artifactUrl: "https://example.com/firmware/smart-shutter-0.1.0-dev.bin",
      sha256:
        "0000000000000000000000000000000000000000000000000000000000000000",
      sizeBytes: null,
      notes: "Placeholder firmware release entry for MVP planning and UI flow.",
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
