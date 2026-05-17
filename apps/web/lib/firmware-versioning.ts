import firmwareVersions from "@/config/firmware-versions.json";

const catalog = firmwareVersions as {
  defaultChannel?: string;
  boards?: Record<string, string>;
};

const DEFAULT_FIRMWARE_CHANNEL = catalog.defaultChannel?.trim() || "stable";
const DEFAULT_FIRMWARE_VERSION = "0.1.1-dev-esp32";
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

type ParsedFirmwareVersion = {
  major: number;
  minor: number;
  patch: number;
  prerelease: Array<number | string>;
};

function parsePrereleaseIdentifier(value: string): number | string {
  if (/^(0|[1-9]\d*)$/.test(value)) {
    return Number(value);
  }

  return value;
}

function parseFirmwareVersion(
  value: string | null | undefined,
): ParsedFirmwareVersion | null {
  const normalizedValue = value?.trim() ?? "";

  if (!normalizedValue) {
    return null;
  }

  const match = SEMVER_PATTERN.exec(normalizedValue);
  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]
      ? match[4].split(".").map(parsePrereleaseIdentifier)
      : [],
  };
}

function comparePrereleaseIdentifiers(
  left: number | string,
  right: number | string,
): number {
  if (left === right) {
    return 0;
  }

  const leftIsNumber = typeof left === "number";
  const rightIsNumber = typeof right === "number";

  if (leftIsNumber && rightIsNumber) {
    return left < right ? -1 : 1;
  }

  if (leftIsNumber) {
    return -1;
  }

  if (rightIsNumber) {
    return 1;
  }

  return left < right ? -1 : 1;
}

function comparePrerelease(
  left: Array<number | string>,
  right: Array<number | string>,
): number {
  if (left.length === 0 && right.length === 0) {
    return 0;
  }

  if (left.length === 0) {
    return 1;
  }

  if (right.length === 0) {
    return -1;
  }

  const maxLength = Math.max(left.length, right.length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftIdentifier = left[index];
    const rightIdentifier = right[index];

    if (typeof leftIdentifier === "undefined") {
      return -1;
    }

    if (typeof rightIdentifier === "undefined") {
      return 1;
    }

    const result = comparePrereleaseIdentifiers(
      leftIdentifier,
      rightIdentifier,
    );

    if (result !== 0) {
      return result;
    }
  }

  return 0;
}

export function isValidFirmwareVersion(value: string | null | undefined): boolean {
  return parseFirmwareVersion(value) !== null;
}

export function compareFirmwareVersions(
  left: string | null | undefined,
  right: string | null | undefined,
): number | null {
  const parsedLeft = parseFirmwareVersion(left);
  const parsedRight = parseFirmwareVersion(right);

  if (!parsedLeft || !parsedRight) {
    return null;
  }

  if (parsedLeft.major !== parsedRight.major) {
    return parsedLeft.major < parsedRight.major ? -1 : 1;
  }

  if (parsedLeft.minor !== parsedRight.minor) {
    return parsedLeft.minor < parsedRight.minor ? -1 : 1;
  }

  if (parsedLeft.patch !== parsedRight.patch) {
    return parsedLeft.patch < parsedRight.patch ? -1 : 1;
  }

  return comparePrerelease(parsedLeft.prerelease, parsedRight.prerelease);
}

export function isFirmwareUpdateAvailable(
  currentVersion: string | null | undefined,
  latestVersion: string | null | undefined,
): boolean {
  const normalizedLatestVersion = latestVersion?.trim() ?? "";
  if (!normalizedLatestVersion) {
    return false;
  }

  const normalizedCurrentVersion = currentVersion?.trim() ?? "";
  if (!normalizedCurrentVersion) {
    return true;
  }

  const comparison = compareFirmwareVersions(
    normalizedCurrentVersion,
    normalizedLatestVersion,
  );

  if (comparison !== null) {
    return comparison < 0;
  }

  return normalizedCurrentVersion !== normalizedLatestVersion;
}

export function getDefaultFirmwareChannel(): string {
  return DEFAULT_FIRMWARE_CHANNEL;
}

export function getDefaultFirmwareVersion(
  board: string | null | undefined,
): string {
  const normalizedBoard = board?.trim().toLowerCase() ?? "";

  return (
    catalog.boards?.[normalizedBoard] ??
    catalog.boards?.esp32 ??
    DEFAULT_FIRMWARE_VERSION
  );
}

export function getFirmwareVersionCatalog(): Record<string, string> {
  return {
    ...(catalog.boards ?? {}),
  };
}
