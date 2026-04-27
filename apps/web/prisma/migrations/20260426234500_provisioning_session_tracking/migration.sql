-- AlterTable
ALTER TABLE "ProvisioningSession"
ADD COLUMN     "artifactType" TEXT NOT NULL DEFAULT 'package',
ADD COLUMN     "board" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN     "createdByProfileId" TEXT,
ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "fileName" TEXT,
ADD COLUMN     "wifiMode" TEXT NOT NULL DEFAULT 'factory',
ADD COLUMN     "wifiSsidHint" TEXT;

-- CreateIndex
CREATE INDEX "ProvisioningSession_createdByUserId_createdAt_idx" ON "ProvisioningSession"("createdByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ProvisioningSession_createdByProfileId_createdAt_idx" ON "ProvisioningSession"("createdByProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "ProvisioningSession_status_createdAt_idx" ON "ProvisioningSession"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "ProvisioningSession" ADD CONSTRAINT "ProvisioningSession_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvisioningSession" ADD CONSTRAINT "ProvisioningSession_createdByProfileId_fkey" FOREIGN KEY ("createdByProfileId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
