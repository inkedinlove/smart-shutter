import type { MqttClient } from "mqtt";

import { AccessControlError, getAuthorizedDevice } from "@/lib/access-control";
import { apiError, apiOk } from "@/lib/api-response";
import { recordDeviceCommandAudit } from "@/lib/device-command-audit";
import {
  DEFAULT_SAFE_ALLOWED_MAX_PERCENT_STEP,
  MAX_NUDGE_AMOUNT,
  type DeviceCommand,
  type DeviceStatus,
} from "@/lib/device";
import { getDeviceStatusSnapshot } from "@/lib/live-device-status";
import {
  closeMqttClient,
  connectMqttClient,
  createMqttClient,
  publishMqttMessage,
} from "@/lib/mqtt";
import {
  assertRateLimit,
  buildRateLimitKey,
  RateLimitError,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.includes("server configuration")) {
    return error.message;
  }

  return "Unable to publish the device command right now.";
}

function getAllowedMaxPercentStep(status: DeviceStatus | null): number {
  if (
    status &&
    typeof status.allowedMaxPercentStep === "number" &&
    Number.isFinite(status.allowedMaxPercentStep) &&
    status.allowedMaxPercentStep > 0
  ) {
    return Math.max(1, Math.min(100, Math.round(status.allowedMaxPercentStep)));
  }

  return DEFAULT_SAFE_ALLOWED_MAX_PERCENT_STEP;
}

function requiresLiveStatus(commandType: string): boolean {
  return commandType !== "STOP" && commandType !== "CHECK_UPDATE";
}

async function auditCommand(input: {
  deviceId: string;
  actorProfileId?: string | null;
  commandType: string;
  result: string;
  detail?: string | null;
}) {
  try {
    await recordDeviceCommandAudit(input);
  } catch {
    console.error("Unable to record device command audit.");
  }
}

export async function POST(request: Request) {
  let parsedBody: unknown;

  try {
    parsedBody = await request.json();
  } catch {
    return apiError("Request body must be valid JSON.", 400);
  }

  const rawType = (parsedBody as { type?: unknown })?.type;
  const commandType = typeof rawType === "string" ? rawType : "SET_PERCENT";
  const rawDeviceId = (parsedBody as { deviceId?: unknown })?.deviceId;
  const deviceId = typeof rawDeviceId === "string" ? rawDeviceId.trim() : "";

  if (!deviceId) {
    return apiError("The `deviceId` field is required.", 400);
  }

  let context;
  let device;
  try {
    ({ context, device } = await getAuthorizedDevice(deviceId));
  } catch (error) {
    if (error instanceof AccessControlError) {
      return apiError(error.message, error.statusCode);
    }

    return apiError("Unable to authorize device access.", 500);
  }

  const actorProfileId =
    context.mode === "customer" ? context.profile.profileId : null;

  try {
    assertRateLimit({
      bucket: "device-command-publish",
      key: buildRateLimitKey(actorProfileId ?? context.mode, device.deviceId),
      limit: 12,
      windowMs: 30_000,
      message:
        "Too many commands were sent to this shutter. Wait a moment, then try again.",
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      await auditCommand({
        deviceId: device.deviceId,
        actorProfileId,
        commandType,
        result: "rate_limited",
      });

      return apiError(error.message, error.statusCode, {
        headers: {
          "Retry-After": String(error.retryAfterSeconds),
        },
      });
    }

    return apiError("Unable to validate the command rate limit right now.", 503);
  }

  let liveStatus: DeviceStatus | null = null;

  if (requiresLiveStatus(commandType)) {
    try {
      const latestStatus = await getDeviceStatusSnapshot(device);

      if (!latestStatus.lastSeenAt || !latestStatus.online) {
        await auditCommand({
          deviceId: device.deviceId,
          actorProfileId,
          commandType,
          result: "blocked_offline",
        });

        return apiError(
          "The device is offline. Check power and Wi-Fi, then try again.",
          409,
        );
      }

      liveStatus = latestStatus;
    } catch {
      console.error("Unable to load live status for command safety checks.");

      await auditCommand({
        deviceId: device.deviceId,
        actorProfileId,
        commandType,
        result: "status_unavailable",
      });

      return apiError(
        "Live device status is unavailable right now. Try again after the device reports in.",
        503,
      );
    }
  }

  let command: DeviceCommand;

  if (commandType === "STOP") {
    command = {
      deviceId: device.deviceId,
      commandId: crypto.randomUUID(),
      type: "STOP",
      issuedAt: new Date().toISOString(),
      source: "web",
    };
  } else if (commandType === "CHECK_UPDATE") {
    command = {
      deviceId: device.deviceId,
      commandId: crypto.randomUUID(),
      type: "CHECK_UPDATE",
      issuedAt: new Date().toISOString(),
      source: "web",
    };
  } else if (commandType === "NUDGE_OPEN" || commandType === "NUDGE_CLOSE") {
    const amount = (parsedBody as { amount?: unknown })?.amount;

    if (typeof amount !== "number" || !Number.isFinite(amount)) {
      return apiError("The `amount` field must be a number.", 400);
    }

    const normalizedAmount = Math.round(amount);

    if (normalizedAmount < 1 || normalizedAmount > MAX_NUDGE_AMOUNT) {
      return apiError(
        `The \`amount\` field must be between 1 and ${MAX_NUDGE_AMOUNT}.`,
        400,
      );
    }

    const allowedMaxPercentStep = getAllowedMaxPercentStep(liveStatus);

    if (normalizedAmount > allowedMaxPercentStep) {
      await auditCommand({
        deviceId: device.deviceId,
        actorProfileId,
        commandType,
        result: "blocked_safety",
        detail: `allowedMaxPercentStep=${allowedMaxPercentStep}`,
      });

      return apiError(
        `This device is currently limited to ${allowedMaxPercentStep}% per move while safe setup mode is active.`,
        409,
      );
    }

    command = {
      deviceId: device.deviceId,
      commandId: crypto.randomUUID(),
      type: commandType,
      amount: normalizedAmount,
      issuedAt: new Date().toISOString(),
      source: "web",
    };
  } else if (
    commandType === "SET_CURRENT_AS_CLOSED" ||
    commandType === "SET_CURRENT_AS_OPEN" ||
    commandType === "SET_DIRECTION_NORMAL" ||
    commandType === "SET_DIRECTION_REVERSED" ||
    commandType === "MARK_CALIBRATION_COMPLETE" ||
    commandType === "LOCK_MOVEMENT" ||
    commandType === "UNLOCK_MOVEMENT"
  ) {
    command = {
      deviceId: device.deviceId,
      commandId: crypto.randomUUID(),
      type: commandType,
      issuedAt: new Date().toISOString(),
      source: "web",
    };
  } else if (commandType === "SET_PERCENT") {
    const value = (parsedBody as { value?: unknown })?.value;

    if (typeof value !== "number" || !Number.isFinite(value)) {
      return apiError("The `value` field must be a number.", 400);
    }

    if (value < 0 || value > 100) {
      return apiError("The `value` field must be between 0 and 100.", 400);
    }

    const normalizedValue = Math.round(value);

    if (liveStatus?.safetyMode === true && liveStatus.fullTravelReady !== true) {
      if (normalizedValue === 100) {
        await auditCommand({
          deviceId: device.deviceId,
          actorProfileId,
          commandType,
          result: "blocked_calibration",
          detail: "full_open_blocked",
        });

        return apiError(
          "100% is blocked until closed and open are both saved on the attached shutter.",
          409,
        );
      }

      if (typeof liveStatus.estimatedPercent !== "number") {
        await auditCommand({
          deviceId: device.deviceId,
          actorProfileId,
          commandType,
          result: "blocked_position_unknown",
        });

        return apiError(
          "The device must report its current position before larger moves are allowed.",
          409,
        );
      }

      const allowedMaxPercentStep = getAllowedMaxPercentStep(liveStatus);
      const requestedDelta = Math.abs(normalizedValue - liveStatus.estimatedPercent);

      if (requestedDelta > allowedMaxPercentStep) {
        await auditCommand({
          deviceId: device.deviceId,
          actorProfileId,
          commandType,
          result: "blocked_safety",
          detail: `requestedDelta=${requestedDelta},allowedMaxPercentStep=${allowedMaxPercentStep}`,
        });

        return apiError(
          `Safe setup mode only allows moves up to ${allowedMaxPercentStep}% per command until closed and open are both saved.`,
          409,
        );
      }
    }

    command = {
      deviceId: device.deviceId,
      commandId: crypto.randomUUID(),
      type: "SET_PERCENT",
      value: normalizedValue,
      issuedAt: new Date().toISOString(),
      source: "web",
    };
  } else {
    return apiError(
      "The `type` field must be one of `SET_PERCENT`, `STOP`, `CHECK_UPDATE`, `NUDGE_OPEN`, `NUDGE_CLOSE`, `SET_CURRENT_AS_CLOSED`, `SET_CURRENT_AS_OPEN`, `SET_DIRECTION_NORMAL`, `SET_DIRECTION_REVERSED`, `MARK_CALIBRATION_COMPLETE`, `LOCK_MOVEMENT`, or `UNLOCK_MOVEMENT`.",
      400,
    );
  }

  let client: MqttClient | null = null;

  try {
    client = createMqttClient(device.deviceId);

    await connectMqttClient(client);
    await publishMqttMessage(
      client,
      device.commandTopic,
      JSON.stringify(command),
      { qos: 1 },
    );

    await auditCommand({
      deviceId: device.deviceId,
      actorProfileId,
      commandType: command.type,
      result: "published",
    });

    return apiOk(
      { command },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    await auditCommand({
      deviceId: device.deviceId,
      actorProfileId,
      commandType,
      result: "publish_failed",
    });

    console.error("MQTT command publish failed.");

    return apiError(sanitizeErrorMessage(error), 503);
  } finally {
    if (client) {
      await closeMqttClient(client);
    }
  }
}
