-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceClaim" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "claimCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceClaim_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Device" ADD COLUMN "ownerProfileId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_email_key" ON "UserProfile"("email");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceClaim_claimCode_key" ON "DeviceClaim"("claimCode");

-- CreateIndex
CREATE INDEX "DeviceClaim_deviceId_idx" ON "DeviceClaim"("deviceId");

-- CreateIndex
CREATE INDEX "DeviceClaim_profileId_idx" ON "DeviceClaim"("profileId");

-- CreateIndex
CREATE INDEX "DeviceClaim_expiresAt_idx" ON "DeviceClaim"("expiresAt");

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_ownerProfileId_fkey" FOREIGN KEY ("ownerProfileId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceClaim" ADD CONSTRAINT "DeviceClaim_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("deviceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceClaim" ADD CONSTRAINT "DeviceClaim_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
