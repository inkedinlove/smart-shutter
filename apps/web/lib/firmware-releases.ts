import "server-only";

import { Prisma } from "@prisma/client";
import type {
  DeviceUpdateEvent,
  FirmwareRelease as PrismaFirmwareRelease,
} from "@prisma/client";

import { getDb, isDatabaseConfigured } from "@/lib/db";
import type { RegisteredDevice } from "@/lib/devices";
import type {
  DeviceUpdateEventStatus,
  FirmwareCheckResponse,
  FirmwareManifestResponse,
  FirmwareReleaseInput,
  FirmwareReleaseRecord,
} from "@/lib/firmware";
import {
  compareFirmwareVersions,
  getDefaultFirmwareChannel,
  getFirmwareVersionCatalog,
  isFirmwareUpdateAvailable,
  isValidFirmwareVersion,
} from "@/lib/firmware-versioning";

const DEFAULT_FIRMWARE_BOARD = "esp32";
const MAX_FIRMWARE_SIZE_BYTES = 16 * 1024 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

const DEFAULT_FIRMWARE_CHANNEL = getDefaultFirmwareChannel();
const FALLBACK_RELEASES: FirmwareReleaseRecord[] = Object.entries(
  getFirmwareVersionCatalog(),
).map(([board, version]) => ({
  version,
  channel: DEFAULT_FIRMWARE_CHANNEL,
  board,
  artifactUrl: `/firmware/releases/${version}/smart-shutter-${version}.bin`,
  sha256:
    "0000000000000000000000000000000000000000000000000000000000000000",
  sizeBytes: null,
  notes: `Placeholder ${board.toUpperCase()} firmware release entry for MVP planning and UI flow.`,
  isActive: true,
  createdAt: "2026-04-23T00:00:00.000Z",
}));

export class FirmwareReleaseError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "FirmwareReleaseError";
    this.statusCode = statusCode;
  }
}

function getFirmwareChannel(): string {
  return process.env.FIRMWARE_UPDATE_CHANNEL?.trim() || DEFAULT_FIRMWARE_CHANNEL;
}

function getResolvedDeviceFirmwareChannel(
  device: Pick<RegisteredDevice, "otaAutoUpdateChannel">,
): string {
  const normalizedChannel = device.otaAutoUpdateChannel?.trim();
  return normalizedChannel || getFirmwareChannel();
}

function mapReleaseRecord(
  release: Pick<
    PrismaFirmwareRelease,
    | "version"
    | "channel"
    | "board"
    | "artifactUrl"
    | "sha256"
    | "sizeBytes"
    | "notes"
    | "isActive"
    | "createdAt"
  >,
): FirmwareReleaseRecord {
  return {
    version: release.version,
    channel: release.channel,
    board: release.board,
    artifactUrl: release.artifactUrl,
    sha256: release.sha256,
    sizeBytes: release.sizeBytes,
    notes: release.notes,
    isActive: release.isActive,
    createdAt: release.createdAt.toISOString(),
  };
}

function isSafeArtifactUrl(rawUrl: string): boolean {
  try {
    const parsedUrl = new URL(rawUrl);

    if (["example.com", "localhost", "127.0.0.1"].includes(parsedUrl.hostname)) {
      return true;
    }

    const baseUrl = process.env.PUBLIC_APP_BASE_URL?.trim();

    if (!baseUrl) {
      return false;
    }

    return parsedUrl.origin === new URL(baseUrl).origin;
  } catch {
    return rawUrl.startsWith("/");
  }
}

export function resolveFirmwareArtifactUrl(
  artifactUrl: string | null,
  baseUrl: string,
): string | null {
  if (!artifactUrl) {
    return null;
  }

  const normalizedArtifactUrl = artifactUrl.trim();

  if (normalizedArtifactUrl.length === 0) {
    return null;
  }

  try {
    return new URL(normalizedArtifactUrl).toString();
  } catch {
    try {
      const rootRelativeArtifactUrl = normalizedArtifactUrl.startsWith("/")
        ? normalizedArtifactUrl
        : `/${normalizedArtifactUrl}`;

      return new URL(rootRelativeArtifactUrl, baseUrl).toString();
    } catch {
      return null;
    }
  }
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

function normalizeRequiredText(
  value: unknown,
  fieldName: string,
  options?: {
    defaultValue?: string;
  },
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    if (options?.defaultValue) {
      return options.defaultValue;
    }

    throw new FirmwareReleaseError(`The \`${fieldName}\` field is required.`);
  }

  return value.trim();
}

function normalizeFirmwareVersion(value: unknown): string {
  const version = normalizeRequiredText(value, "version");

  if (!isValidFirmwareVersion(version)) {
    throw new FirmwareReleaseError(
      "The `version` field must be a valid semantic firmware version such as `0.1.1-dev-esp32`.",
    );
  }

  return version;
}

function normalizeArtifactUrl(value: unknown): string {
  const artifactUrl = normalizeRequiredText(value, "artifactUrl");

  if (artifactUrl.startsWith("/") && !artifactUrl.startsWith("//")) {
    return artifactUrl;
  }

  try {
    const parsedUrl = new URL(artifactUrl);

    if (parsedUrl.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }

    if (parsedUrl.username || parsedUrl.password) {
      throw new Error("embedded credentials are not allowed");
    }

    return artifactUrl;
  } catch {
    throw new FirmwareReleaseError(
      "The `artifactUrl` field must be a valid HTTPS URL without embedded credentials.",
    );
  }
}

function normalizeSha256(value: unknown): string {
  const sha256 = normalizeRequiredText(value, "sha256").toLowerCase();

  if (!SHA256_PATTERN.test(sha256)) {
    throw new FirmwareReleaseError(
      "The `sha256` field must be a 64-character hexadecimal string.",
    );
  }

  return sha256;
}

function normalizeSizeBytes(value: unknown): number | null {
  if (value === null || typeof value === "undefined" || value === "") {
    return null;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new FirmwareReleaseError(
      "The `sizeBytes` field must be a non-negative integer when provided.",
    );
  }

  if (value > MAX_FIRMWARE_SIZE_BYTES) {
    throw new FirmwareReleaseError(
      `The \`sizeBytes\` field must be ${MAX_FIRMWARE_SIZE_BYTES.toLocaleString()} bytes or smaller.`,
    );
  }

  return value;
}

export function normalizeFirmwareReleaseInput(
  input: FirmwareReleaseInput,
): Required<Omit<FirmwareReleaseInput, "notes" | "sizeBytes">> & {
  notes: string | null;
  sizeBytes: number | null;
} {
  return {
    version: normalizeFirmwareVersion(input.version),
    channel: normalizeRequiredText(input.channel, "channel", {
      defaultValue: DEFAULT_FIRMWARE_CHANNEL,
    }),
    board: normalizeRequiredText(input.board, "board", {
      defaultValue: DEFAULT_FIRMWARE_BOARD,
    }),
    artifactUrl: normalizeArtifactUrl(input.artifactUrl),
    sha256: normalizeSha256(input.sha256),
    sizeBytes: normalizeSizeBytes(input.sizeBytes),
    notes: normalizeOptionalText(input.notes),
    isActive: typeof input.isActive === "boolean" ? input.isActive : false,
  };
}

export async function listFirmwareReleases(options?: {
  includeInactive?: boolean;
}): Promise<FirmwareReleaseRecord[]> {
  const db = getDb();

  if (isDatabaseConfigured() && db) {
    try {
      const releases = await db.firmwareRelease.findMany({
        where: options?.includeInactive ? undefined : { isActive: true },
        orderBy: [
          {
            isActive: "desc",
          },
          {
            createdAt: "desc",
          },
        ],
      });

      if (releases.length > 0) {
        return releases.map(mapReleaseRecord);
      }
    } catch (error) {
      console.error("Firmware release lookup failed, using fallback data:", error);
    }
  }

  return FALLBACK_RELEASES;
}

export async function listActiveFirmwareReleases(): Promise<FirmwareReleaseRecord[]> {
  return listFirmwareReleases();
}

export async function getLatestFirmwareRelease(
  channel = getFirmwareChannel(),
  board = DEFAULT_FIRMWARE_BOARD,
): Promise<FirmwareReleaseRecord | null> {
  const releases = await listActiveFirmwareReleases();
  const matchingReleases = releases.filter(
    (release) => release.channel === channel && release.board === board,
  );

  if (matchingReleases.length === 0) {
    return null;
  }

  return matchingReleases.reduce((bestRelease, candidateRelease) => {
    const comparison = compareFirmwareVersions(
      candidateRelease.version,
      bestRelease.version,
    );

    if (comparison !== null && comparison > 0) {
      return candidateRelease;
    }

    if (comparison === 0 || comparison === null) {
      return Date.parse(candidateRelease.createdAt) >
        Date.parse(bestRelease.createdAt)
        ? candidateRelease
        : bestRelease;
    }

    return bestRelease;
  });
}

export async function createFirmwareCheckResponse(
  device: RegisteredDevice,
  options?: {
    currentVersion?: string | null;
  },
): Promise<FirmwareCheckResponse> {
  const channel = getResolvedDeviceFirmwareChannel(device);
  const deviceBoard = device.board ?? DEFAULT_FIRMWARE_BOARD;
  const latestRelease = await getLatestFirmwareRelease(channel, deviceBoard);
  const currentVersion = options?.currentVersion ?? device.firmwareVersion ?? null;

  return {
    deviceId: device.deviceId,
    currentVersion,
    latestVersion: latestRelease?.version ?? null,
    updateAvailable: isFirmwareUpdateAvailable(
      currentVersion,
      latestRelease?.version ?? null,
    ),
    board: latestRelease?.board ?? deviceBoard,
    channel,
    autoUpdateEnabled: device.otaAutoUpdateEnabled,
    autoUpdateChannel: channel,
    releaseNotes: latestRelease?.notes ?? null,
    artifactUrl:
      latestRelease && isSafeArtifactUrl(latestRelease.artifactUrl)
        ? latestRelease.artifactUrl
        : null,
    sha256: latestRelease?.sha256 ?? null,
    sizeBytes: latestRelease?.sizeBytes ?? null,
  };
}

export async function createFirmwareManifestResponse(
  device: RegisteredDevice,
  options?: {
    currentVersion?: string | null;
  },
): Promise<FirmwareManifestResponse> {
  const channel = getResolvedDeviceFirmwareChannel(device);
  const deviceBoard = device.board ?? DEFAULT_FIRMWARE_BOARD;
  const latestRelease = await getLatestFirmwareRelease(channel, deviceBoard);
  const currentVersion = options?.currentVersion ?? device.firmwareVersion ?? null;
  const updateAvailable = isFirmwareUpdateAvailable(
    currentVersion,
    latestRelease?.version ?? null,
  );

  return {
    deviceId: device.deviceId,
    updateAvailable,
    currentVersion,
    latestVersion: latestRelease?.version ?? null,
    board: latestRelease?.board ?? deviceBoard,
    channel,
    autoUpdateEnabled: device.otaAutoUpdateEnabled,
    autoUpdateChannel: channel,
    artifactUrl:
      updateAvailable &&
      latestRelease &&
      isSafeArtifactUrl(latestRelease.artifactUrl)
        ? latestRelease.artifactUrl
        : null,
    sha256: updateAvailable ? latestRelease?.sha256 ?? null : null,
    sizeBytes: updateAvailable ? latestRelease?.sizeBytes ?? null : null,
  };
}

export async function createFirmwareRelease(
  input: FirmwareReleaseInput,
): Promise<FirmwareReleaseRecord> {
  const db = getDb();

  if (!isDatabaseConfigured() || !db) {
    throw new FirmwareReleaseError(
      "DATABASE_URL is required to manage firmware releases.",
      503,
    );
  }

  const normalizedInput = normalizeFirmwareReleaseInput(input);

  try {
    const createdRelease = await db.$transaction(async (tx) => {
      if (normalizedInput.isActive) {
        await tx.firmwareRelease.updateMany({
          where: {
            board: normalizedInput.board,
            channel: normalizedInput.channel,
            isActive: true,
          },
          data: {
            isActive: false,
          },
        });
      }

      return tx.firmwareRelease.create({
        data: normalizedInput,
      });
    });

    return mapReleaseRecord(createdRelease);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new FirmwareReleaseError(
        `A firmware release with version \`${normalizedInput.version}\` already exists.`,
        409,
      );
    }

    throw error;
  }
}

export async function recordDeviceUpdateEvent(input: {
  deviceId: string;
  firmwareVersionFrom: string | null;
  firmwareVersionTo: string;
  status: DeviceUpdateEventStatus;
  detail: string | null;
}): Promise<DeviceUpdateEvent | null> {
  const db = getDb();

  if (!isDatabaseConfigured() || !db) {
    return null;
  }

  return db.deviceUpdateEvent.create({
    data: input,
  });
}
