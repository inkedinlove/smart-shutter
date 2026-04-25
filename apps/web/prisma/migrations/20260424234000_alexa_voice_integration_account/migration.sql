CREATE TABLE "VoiceIntegrationAccount" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'not_connected',
    "linkedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceIntegrationAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VoiceIntegrationAccount_profileId_provider_key" ON "VoiceIntegrationAccount"("profileId", "provider");
CREATE INDEX "VoiceIntegrationAccount_provider_status_idx" ON "VoiceIntegrationAccount"("provider", "status");

ALTER TABLE "VoiceIntegrationAccount" ADD CONSTRAINT "VoiceIntegrationAccount_profileId_fkey"
FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
