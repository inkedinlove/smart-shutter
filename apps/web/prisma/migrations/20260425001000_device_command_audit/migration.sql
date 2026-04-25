CREATE TABLE "DeviceCommandAudit" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "actorProfileId" TEXT,
    "commandType" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceCommandAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeviceCommandAudit_deviceId_createdAt_idx" ON "DeviceCommandAudit"("deviceId", "createdAt");
CREATE INDEX "DeviceCommandAudit_actorProfileId_createdAt_idx" ON "DeviceCommandAudit"("actorProfileId", "createdAt");
CREATE INDEX "DeviceCommandAudit_result_createdAt_idx" ON "DeviceCommandAudit"("result", "createdAt");

ALTER TABLE "DeviceCommandAudit"
ADD CONSTRAINT "DeviceCommandAudit_deviceId_fkey"
FOREIGN KEY ("deviceId") REFERENCES "Device"("deviceId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeviceCommandAudit"
ADD CONSTRAINT "DeviceCommandAudit_actorProfileId_fkey"
FOREIGN KEY ("actorProfileId") REFERENCES "UserProfile"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
