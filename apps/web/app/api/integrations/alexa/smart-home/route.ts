import { NextResponse } from "next/server";
import type { MqttClient } from "mqtt";

import { recordDeviceCommandAudit } from "@/lib/device-command-audit";
import {
  DEFAULT_SAFE_ALLOWED_MAX_PERCENT_STEP,
  type DeviceCommand,
  type DeviceCommandInput,
  type DeviceStatus,
} from "@/lib/device";
import { getRegisteredDeviceById, listAvailableDevices } from "@/lib/device-registry";
import type { RegisteredDevice } from "@/lib/devices";
import {
  buildAlexaErrorResponse,
  buildAlexaStateProperties,
  buildAlexaSuccessResponse,
  getAlexaAccessTokenFromDirective,
  isAlexaDirectiveEnvelope,
  mapAlexaDirectiveToDeviceCommand,
  mapDeviceToAlexaEndpoint,
  type AlexaDirective,
  type AlexaDirectiveEnvelope,
  type AlexaErrorReason,
} from "@/lib/integrations/alexa";
import {
  getAlexaAuthorizedProfile,
  isAlexaSkillEnabled,
  validateAlexaAccessToken,
} from "@/lib/integrations/alexa-oauth";
import { getDeviceStatusSnapshot } from "@/lib/live-device-status";
import {
  closeMqttClient,
  connectMqttClient,
  createMqttClient,
  publishMqttMessage,
} from "@/lib/mqtt";
import { getDevicesForProfile, getProfileDevice } from "@/lib/profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function createAlexaJsonResponse(body: object, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
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

function getCurrentPercent(status: DeviceStatus | null): number {
  if (typeof status?.estimatedPercent === "number") {
    return status.estimatedPercent;
  }

  if (typeof status?.targetPercent === "number") {
    return status.targetPercent;
  }

  return 0;
}

function buildOptimisticCommandStatus(
  currentStatus: DeviceStatus,
  command: DeviceCommand,
): DeviceStatus {
  const issuedAt = new Date().toISOString();

  if (command.type === "SET_PERCENT") {
    return {
      ...currentStatus,
      online: true,
      moving: currentStatus.estimatedPercent !== command.value,
      deviceMode:
        currentStatus.estimatedPercent !== command.value ? "MOVING" : "READY",
      estimatedPercent: command.value,
      targetPercent: command.value,
      lastSeenAt: issuedAt,
    };
  }

  if (command.type === "STOP") {
    return {
      ...currentStatus,
      online: true,
      moving: false,
      deviceMode: "READY",
      targetPercent: currentStatus.estimatedPercent ?? currentStatus.targetPercent,
      lastSeenAt: issuedAt,
    };
  }

  return {
    ...currentStatus,
    lastSeenAt: issuedAt,
  };
}

function mapAdjustDirectiveToDeviceCommand(
  directive: AlexaDirective,
  status: DeviceStatus | null,
): DeviceCommandInput | null {
  const endpointId = directive.endpoint?.endpointId?.trim();

  if (!endpointId) {
    return null;
  }

  const payload = directive.payload ?? {};
  const currentPercent = getCurrentPercent(status);

  if (
    directive.header.namespace === "Alexa.PercentageController" &&
    directive.header.name === "AdjustPercentage" &&
    typeof payload.percentageDelta === "number" &&
    Number.isFinite(payload.percentageDelta)
  ) {
    return {
      deviceId: endpointId,
      type: "SET_PERCENT",
      value: Math.max(0, Math.min(100, Math.round(currentPercent + payload.percentageDelta))),
    };
  }

  if (
    directive.header.namespace === "Alexa.RangeController" &&
    directive.header.name === "AdjustRangeValue" &&
    directive.header.instance === "Blind.Lift" &&
    typeof payload.rangeValueDelta === "number" &&
    Number.isFinite(payload.rangeValueDelta)
  ) {
    return {
      deviceId: endpointId,
      type: "SET_PERCENT",
      value: Math.max(0, Math.min(100, Math.round(currentPercent + payload.rangeValueDelta))),
    };
  }

  return null;
}

function mapDirectiveToCommand(
  directive: AlexaDirective,
  status: DeviceStatus | null,
): DeviceCommandInput | null {
  return (
    mapAlexaDirectiveToDeviceCommand(directive) ??
    mapAdjustDirectiveToDeviceCommand(directive, status)
  );
}

function buildSetPercentCommand(input: Extract<DeviceCommandInput, { type: "SET_PERCENT" }>): DeviceCommand {
  return {
    deviceId: input.deviceId,
    commandId: crypto.randomUUID(),
    type: "SET_PERCENT",
    value: input.value,
    issuedAt: new Date().toISOString(),
    source: "web",
  };
}

async function auditAlexaCommand(input: {
  deviceId: string;
  actorProfileId: string;
  commandType: string;
  result: string;
  detail?: string | null;
}) {
  try {
    await recordDeviceCommandAudit(input);
  } catch {
    console.error("Unable to record Alexa device command audit.");
  }
}

async function getLinkedAlexaAccess(
  request: Request,
  envelope: AlexaDirectiveEnvelope,
): Promise<
  | {
      ok: true;
      profileId: string;
      isAdmin: boolean;
    }
  | {
      ok: false;
      reason: AlexaErrorReason;
    }
> {
  const fallbackAuthorization = request.headers.get("authorization")?.trim() ?? "";
  const headerToken = fallbackAuthorization.toLowerCase().startsWith("bearer ")
    ? fallbackAuthorization.slice("bearer ".length).trim()
    : "";
  const token = getAlexaAccessTokenFromDirective(envelope.directive) || headerToken;

  if (!token) {
    return {
      ok: false,
      reason: "INVALID_AUTHORIZATION_CREDENTIAL",
    };
  }

  const tokenResult = validateAlexaAccessToken(token);

  if (!tokenResult.ok) {
    return {
      ok: false,
      reason:
        tokenResult.reason === "expired"
          ? "EXPIRED_AUTHORIZATION_CREDENTIAL"
          : "INVALID_AUTHORIZATION_CREDENTIAL",
    };
  }

  const linkedProfile = await getAlexaAuthorizedProfile(tokenResult.payload.profileId);

  if (!linkedProfile.exists || !linkedProfile.linked) {
    return {
      ok: false,
      reason: "INVALID_AUTHORIZATION_CREDENTIAL",
    };
  }

  return {
    ok: true,
    profileId: tokenResult.payload.profileId,
    isAdmin: linkedProfile.isAdmin,
  };
}

async function listAlexaAccessibleDevices(
  profileId: string,
  isAdmin: boolean,
): Promise<RegisteredDevice[]> {
  return isAdmin
    ? listAvailableDevices()
    : getDevicesForProfile(profileId, {
        allowFallback: false,
      });
}

async function getAlexaAccessibleDevice(
  profileId: string,
  isAdmin: boolean,
  deviceId: string,
): Promise<RegisteredDevice | undefined> {
  return isAdmin
    ? getRegisteredDeviceById(deviceId)
    : getProfileDevice(profileId, deviceId, {
        allowFallback: false,
      });
}

function sanitizeMqttErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.includes("server configuration")) {
    return error.message;
  }

  return "Smart Shutter could not reach the device command broker right now.";
}

async function publishAlexaCommand(
  device: RegisteredDevice,
  command: DeviceCommand,
): Promise<void> {
  let client: MqttClient | null = null;

  try {
    client = createMqttClient(`alexa-${device.deviceId}`);
    await connectMqttClient(client);
    await publishMqttMessage(client, device.commandTopic, JSON.stringify(command), {
      qos: 1,
    });
  } finally {
    if (client) {
      await closeMqttClient(client);
    }
  }
}

export async function POST(request: Request) {
  if (!isAlexaSkillEnabled()) {
    return createAlexaJsonResponse(buildAlexaErrorResponse("SKILL_DISABLED"));
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return createAlexaJsonResponse(
      {
        error: "Alexa directive requests must be valid JSON.",
      },
      400,
    );
  }

  if (!isAlexaDirectiveEnvelope(payload)) {
    return createAlexaJsonResponse(
      {
        error: "Alexa directive payload was invalid.",
      },
      400,
    );
  }

  const envelope = payload;
  const directive = envelope.directive;
  const auth = await getLinkedAlexaAccess(request, envelope);

  if (!auth.ok) {
    return createAlexaJsonResponse(buildAlexaErrorResponse(auth.reason, directive));
  }

  try {
    if (
      directive.header.namespace === "Alexa.Discovery" &&
      directive.header.name === "Discover"
    ) {
      const devices = await listAlexaAccessibleDevices(auth.profileId, auth.isAdmin);
      return createAlexaJsonResponse(
        buildAlexaSuccessResponse({
          directive,
          name: "Discover.Response",
          namespace: "Alexa.Discovery",
          payload: {
            endpoints: devices.map(mapDeviceToAlexaEndpoint),
          },
        }),
      );
    }

    const endpointId = directive.endpoint?.endpointId?.trim() ?? "";

    if (!endpointId) {
      return createAlexaJsonResponse(
        buildAlexaErrorResponse(
          "UNSUPPORTED_DIRECTIVE",
          directive,
          "Alexa did not include an endpoint ID for this request.",
        ),
      );
    }

    const device = await getAlexaAccessibleDevice(auth.profileId, auth.isAdmin, endpointId);

    if (!device) {
      return createAlexaJsonResponse(buildAlexaErrorResponse("NOT_OWNED", directive));
    }

    if (
      directive.header.namespace === "Alexa" &&
      directive.header.name === "ReportState"
    ) {
      const status = await getDeviceStatusSnapshot(device);
      return createAlexaJsonResponse(
        buildAlexaSuccessResponse({
          directive,
          endpointId: device.deviceId,
          name: "StateReport",
          properties: buildAlexaStateProperties(status),
        }),
      );
    }

    const liveStatus = await getDeviceStatusSnapshot(device);
    const commandInput = mapDirectiveToCommand(directive, liveStatus);

    if (!commandInput) {
      await auditAlexaCommand({
        deviceId: device.deviceId,
        actorProfileId: auth.profileId,
        commandType: `${directive.header.namespace}.${directive.header.name}`,
        result: "unsupported_directive",
      });

      return createAlexaJsonResponse(buildAlexaErrorResponse("UNSUPPORTED_DIRECTIVE", directive));
    }

    if (!liveStatus.lastSeenAt || !liveStatus.online) {
      await auditAlexaCommand({
        deviceId: device.deviceId,
        actorProfileId: auth.profileId,
        commandType: commandInput.type,
        result: "blocked_offline",
      });

      return createAlexaJsonResponse(buildAlexaErrorResponse("DEVICE_OFFLINE", directive));
    }

    if (
      typeof liveStatus.movementLockedReason === "string" &&
      liveStatus.movementLockedReason.trim().length > 0
    ) {
      await auditAlexaCommand({
        deviceId: device.deviceId,
        actorProfileId: auth.profileId,
        commandType: commandInput.type,
        result: "blocked_movement_locked",
        detail: liveStatus.movementLockedReason,
      });

      return createAlexaJsonResponse(buildAlexaErrorResponse("SAFETY_LOCKED", directive));
    }

    if (commandInput.type !== "SET_PERCENT") {
      await auditAlexaCommand({
        deviceId: device.deviceId,
        actorProfileId: auth.profileId,
        commandType: commandInput.type,
        result: "unsupported_command_type",
      });

      return createAlexaJsonResponse(buildAlexaErrorResponse("UNSUPPORTED_DIRECTIVE", directive));
    }

    if (
      liveStatus.safetyMode === true &&
      liveStatus.calibrationComplete !== true
    ) {
      if (commandInput.value === 100) {
        await auditAlexaCommand({
          deviceId: device.deviceId,
          actorProfileId: auth.profileId,
          commandType: commandInput.type,
          result: "blocked_calibration",
          detail: "full_open_blocked",
        });

        return createAlexaJsonResponse(
          buildAlexaErrorResponse("CALIBRATION_REQUIRED", directive),
        );
      }

      if (typeof liveStatus.estimatedPercent !== "number") {
        await auditAlexaCommand({
          deviceId: device.deviceId,
          actorProfileId: auth.profileId,
          commandType: commandInput.type,
          result: "blocked_position_unknown",
        });

        return createAlexaJsonResponse(
          buildAlexaErrorResponse(
            "CALIBRATION_REQUIRED",
            directive,
            "The shutter must report its current position before Alexa can move it further.",
          ),
        );
      }

      const allowedMaxPercentStep = getAllowedMaxPercentStep(liveStatus);
      const requestedDelta = Math.abs(commandInput.value - liveStatus.estimatedPercent);

      if (requestedDelta > allowedMaxPercentStep) {
        await auditAlexaCommand({
          deviceId: device.deviceId,
          actorProfileId: auth.profileId,
          commandType: commandInput.type,
          result: "blocked_safety",
          detail: `requestedDelta=${requestedDelta},allowedMaxPercentStep=${allowedMaxPercentStep}`,
        });

        return createAlexaJsonResponse(
          buildAlexaErrorResponse(
            "CALIBRATION_REQUIRED",
            directive,
            `Safe setup mode only allows moves up to ${allowedMaxPercentStep}% until calibration is complete.`,
          ),
        );
      }
    }

    const command = buildSetPercentCommand(commandInput);

    try {
      await publishAlexaCommand(device, command);
    } catch (error) {
      await auditAlexaCommand({
        deviceId: device.deviceId,
        actorProfileId: auth.profileId,
        commandType: command.type,
        result: "publish_failed",
        detail: sanitizeMqttErrorMessage(error),
      });

      console.error("Alexa MQTT command publish failed:", error);
      return createAlexaJsonResponse(
        buildAlexaErrorResponse("INTERNAL_ERROR", directive, sanitizeMqttErrorMessage(error)),
      );
    }

    await auditAlexaCommand({
      deviceId: device.deviceId,
      actorProfileId: auth.profileId,
      commandType: command.type,
      result: "published",
      detail: "source=alexa",
    });

    return createAlexaJsonResponse(
      buildAlexaSuccessResponse({
        directive,
        endpointId: device.deviceId,
        properties: buildAlexaStateProperties(
          buildOptimisticCommandStatus(liveStatus, command),
        ),
      }),
    );
  } catch (error) {
    console.error("Alexa smart-home route failed:", error);
    return createAlexaJsonResponse(
      buildAlexaErrorResponse("INTERNAL_ERROR", directive),
    );
  }
}
