ALTER TABLE "Device"
ADD COLUMN "credentialMode" TEXT NOT NULL DEFAULT 'shared',
ADD COLUMN "credentialStatus" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN "credentialIssuedAt" TIMESTAMP(3),
ADD COLUMN "credentialRevokedAt" TIMESTAMP(3),
ADD COLUMN "mqttClientId" TEXT,
ADD COLUMN "mqttUsernameRef" TEXT,
ADD COLUMN "certificateFingerprint" TEXT;
