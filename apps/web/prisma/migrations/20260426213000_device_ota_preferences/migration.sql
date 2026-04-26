ALTER TABLE "Device"
ADD COLUMN "otaAutoUpdateEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "otaAutoUpdateChannel" TEXT NOT NULL DEFAULT 'stable';
