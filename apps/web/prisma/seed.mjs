import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.device.upsert({
    where: {
      deviceId: "shutter-dev-001",
    },
    update: {
      label: "Internal Test Shutter",
      status: "manual_mvp",
      mqttCommandTopic: "shutters/shutter-dev-001/commands",
      mqttStatusTopic: "shutters/shutter-dev-001/status",
      brokerProfile: "hivemq-dev",
    },
    create: {
      deviceId: "shutter-dev-001",
      label: "Internal Test Shutter",
      status: "manual_mvp",
      firmwareVersion: null,
      mqttCommandTopic: "shutters/shutter-dev-001/commands",
      mqttStatusTopic: "shutters/shutter-dev-001/status",
      brokerProfile: "hivemq-dev",
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
