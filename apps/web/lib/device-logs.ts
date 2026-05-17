export type DeviceRemoteLogEntry = {
  deviceId: string;
  resolvedDeviceId: string;
  firmwareVersion: string | null;
  uptimeMs: number | null;
  line: string;
  sequence: number | null;
  snapshot: boolean;
  receivedAt: string;
};

function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function parseOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function buildDeviceRemoteLogTopic(
  statusTopic: string | null | undefined,
  deviceId: string,
): string {
  const normalizedStatusTopic = statusTopic?.trim() ?? "";

  if (!normalizedStatusTopic) {
    return `shutters/${deviceId}/logs`;
  }

  if (normalizedStatusTopic.endsWith("/status")) {
    return `${normalizedStatusTopic.slice(0, -"/status".length)}/logs`;
  }

  return `${normalizedStatusTopic}/logs`;
}

export function parseDeviceRemoteLogMessage(
  message: string,
  fallbackDeviceId: string,
  receivedAt = new Date().toISOString(),
): DeviceRemoteLogEntry | null {
  const trimmedMessage = message.replace(/\r/g, "");

  if (!trimmedMessage.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmedMessage) as unknown;

    if (!isRecord(parsed)) {
      return null;
    }

    const line = parseOptionalString(parsed.line);

    if (!line) {
      return null;
    }

    const deviceId = parseOptionalString(parsed.deviceId) ?? fallbackDeviceId;
    const resolvedDeviceId =
      parseOptionalString(parsed.resolvedDeviceId) ?? deviceId;

    return {
      deviceId,
      resolvedDeviceId,
      firmwareVersion: parseOptionalString(parsed.firmwareVersion),
      uptimeMs: parseOptionalNumber(parsed.uptimeMs),
      line,
      sequence: parseOptionalNumber(parsed.sequence),
      snapshot: parsed.snapshot === true,
      receivedAt,
    };
  } catch {
    if (!hasText(fallbackDeviceId)) {
      return null;
    }

    return {
      deviceId: fallbackDeviceId,
      resolvedDeviceId: fallbackDeviceId,
      firmwareVersion: null,
      uptimeMs: null,
      line: trimmedMessage.trim(),
      sequence: null,
      snapshot: false,
      receivedAt,
    };
  }
}
