-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unprovisioned',
    "firmwareVersion" TEXT,
    "mqttCommandTopic" TEXT NOT NULL,
    "mqttStatusTopic" TEXT NOT NULL,
    "brokerProfile" TEXT NOT NULL DEFAULT 'hivemq-dev',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FirmwareRelease" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'stable',
    "board" TEXT NOT NULL DEFAULT 'esp32',
    "artifactUrl" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FirmwareRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceUpdateEvent" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "firmwareVersionFrom" TEXT,
    "firmwareVersionTo" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceUpdateEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProvisioningSession" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT,
    "pairingCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ProvisioningSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Device_deviceId_key" ON "Device"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "FirmwareRelease_version_key" ON "FirmwareRelease"("version");

-- CreateIndex
CREATE INDEX "DeviceUpdateEvent_deviceId_createdAt_idx" ON "DeviceUpdateEvent"("deviceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProvisioningSession_pairingCode_key" ON "ProvisioningSession"("pairingCode");

-- CreateIndex
CREATE INDEX "ProvisioningSession_deviceId_idx" ON "ProvisioningSession"("deviceId");

-- CreateIndex
CREATE INDEX "ProvisioningSession_expiresAt_idx" ON "ProvisioningSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "DeviceUpdateEvent" ADD CONSTRAINT "DeviceUpdateEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("deviceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvisioningSession" ADD CONSTRAINT "ProvisioningSession_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("deviceId") ON DELETE SET NULL ON UPDATE CASCADE;
