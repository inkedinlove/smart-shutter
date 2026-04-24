import { NextResponse } from "next/server";
import type { MqttClient } from "mqtt";

import { getRegisteredDeviceById } from "@/lib/device-registry";
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

export async function POST(request: Request) {
  let parsedBody: unknown;

  try {
    parsedBody = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const rawType = (parsedBody as { type?: unknown })?.type;
  const commandType = typeof rawType === "string" ? rawType : "SET_PERCENT";
  const rawDeviceId = (parsedBody as { deviceId?: unknown })?.deviceId;
  const deviceId = typeof rawDeviceId === "string" ? rawDeviceId.trim() : "";

  if (!deviceId) {
    return NextResponse.json(
      { ok: false, error: "The `deviceId` field is required." },
      { status: 400 },
    );
  }

  const device = await getRegisteredDeviceById(deviceId);

  if (!device) {
    return NextResponse.json(
      { ok: false, error: `Unknown deviceId: ${deviceId}` },
      { status: 404 },
    );
  }

  let liveStatus: DeviceStatus | null = null;

  if (requiresLiveStatus(commandType)) {
    try {
      const latestStatus = await getDeviceStatusSnapshot(device);

      if (!latestStatus.lastSeenAt || !latestStatus.online) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "The device must be online and reporting status before sending this command.",
          },
          { status: 409 },
        );
      }

      liveStatus = latestStatus;
    } catch (error) {
      console.error("Unable to load live status for command safety checks:", error);

      return NextResponse.json(
        {
          ok: false,
          error:
            "Live device status is unavailable right now. Try again after the device reports in.",
        },
        { status: 503 },
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
      return NextResponse.json(
        { ok: false, error: "The `amount` field must be a number." },
        { status: 400 },
      );
    }

    const normalizedAmount = Math.round(amount);

    if (normalizedAmount < 1 || normalizedAmount > MAX_NUDGE_AMOUNT) {
      return NextResponse.json(
        {
          ok: false,
          error: `The \`amount\` field must be between 1 and ${MAX_NUDGE_AMOUNT}.`,
        },
        { status: 400 },
      );
    }

    const allowedMaxPercentStep = getAllowedMaxPercentStep(liveStatus);

    if (normalizedAmount > allowedMaxPercentStep) {
      return NextResponse.json(
        {
          ok: false,
          error: `This device is currently limited to ${allowedMaxPercentStep}% per move while safe setup mode is active.`,
        },
        { status: 409 },
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
      return NextResponse.json(
        { ok: false, error: "The `value` field must be a number." },
        { status: 400 },
      );
    }

    if (value < 0 || value > 100) {
      return NextResponse.json(
        { ok: false, error: "The `value` field must be between 0 and 100." },
        { status: 400 },
      );
    }

    const normalizedValue = Math.round(value);

    if (liveStatus?.safetyMode === true && liveStatus.calibrationComplete !== true) {
      if (normalizedValue === 100) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "100% is blocked until safe calibration is complete on the attached shutter.",
          },
          { status: 409 },
        );
      }

      if (typeof liveStatus.estimatedPercent !== "number") {
        return NextResponse.json(
          {
            ok: false,
            error:
              "The device must report its current position before larger moves are allowed.",
          },
          { status: 409 },
        );
      }

      const allowedMaxPercentStep = getAllowedMaxPercentStep(liveStatus);
      const requestedDelta = Math.abs(normalizedValue - liveStatus.estimatedPercent);

      if (requestedDelta > allowedMaxPercentStep) {
        return NextResponse.json(
          {
            ok: false,
            error: `Safe setup mode only allows moves up to ${allowedMaxPercentStep}% per command until calibration is complete.`,
          },
          { status: 409 },
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
    return NextResponse.json(
      {
        ok: false,
        error:
          "The `type` field must be one of `SET_PERCENT`, `STOP`, `CHECK_UPDATE`, `NUDGE_OPEN`, `NUDGE_CLOSE`, `SET_CURRENT_AS_CLOSED`, `SET_CURRENT_AS_OPEN`, `MARK_CALIBRATION_COMPLETE`, `LOCK_MOVEMENT`, or `UNLOCK_MOVEMENT`.",
      },
      { status: 400 },
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

    return NextResponse.json(
      { ok: true, command },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("MQTT command publish failed:", error);

    return NextResponse.json(
      { ok: false, error: sanitizeErrorMessage(error) },
      { status: 503 },
    );
  } finally {
    if (client) {
      await closeMqttClient(client);
    }
  }
}
