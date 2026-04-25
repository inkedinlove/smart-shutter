import {
  AccessControlError,
  getAuthorizedDevice,
  listAccessibleDevices,
} from "@/lib/access-control";
import { apiError, apiOk } from "@/lib/api-response";
import type { DeviceCommandInput, DeviceStatus } from "@/lib/device";
import { getDeviceStatusSnapshot } from "@/lib/live-device-status";
import {
  buildAlexaErrorResponse,
  buildAlexaStateProperties,
  buildAlexaSuccessResponse,
  isAlexaDirectiveEnvelope,
  mapAlexaDirectiveToDeviceCommand,
  mapDeviceToAlexaEndpoint,
  type AlexaDirective,
} from "@/lib/integrations/alexa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAlexaSkillEnabled(): boolean {
  return process.env.ALEXA_SKILL_ENABLED?.trim().toLowerCase() === "true";
}

function getDirectiveEndpointId(directive: AlexaDirective): string {
  return directive.endpoint?.endpointId?.trim() ?? "";
}

function isDeviceReachable(status: DeviceStatus): boolean {
  return Boolean(status.lastSeenAt && status.online && status.mqttConnected !== false);
}

function buildPlaceholderCommandState(
  status: DeviceStatus,
  command: DeviceCommandInput | null,
): DeviceStatus {
  if (!command || command.type !== "SET_PERCENT") {
    return status;
  }

  return {
    ...status,
    moving: false,
    targetPercent: command.value,
    estimatedPercent: command.value,
  };
}

function buildUnsupportedDirectivePayload(directive: AlexaDirective) {
  return apiOk({
    alexa: buildAlexaErrorResponse("UNSUPPORTED_DIRECTIVE", directive),
    mappedCommand: null,
    placeholder: true,
  });
}

export async function POST(request: Request) {
  if (!isAlexaSkillEnabled()) {
    return apiError("Alexa Smart Home scaffold is disabled.", 503);
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return apiError("Request body must be valid JSON.", 400);
  }

  if (!isAlexaDirectiveEnvelope(payload)) {
    return apiError("Alexa directive payload is invalid.", 400);
  }

  const directive = payload.directive;
  const namespace = directive.header.namespace;
  const name = directive.header.name;

  try {
    if (namespace === "Alexa.Discovery" && name === "Discover") {
      const { devices } = await listAccessibleDevices();
      const endpoints = devices.map(mapDeviceToAlexaEndpoint);

      return apiOk({
        alexa: buildAlexaSuccessResponse({
          directive,
          name: "Discover.Response",
          namespace: "Alexa.Discovery",
          payload: {
            endpoints,
          },
        }),
        endpointsDiscovered: endpoints.length,
        placeholder: true,
      });
    }

    const endpointId = getDirectiveEndpointId(directive);

    if (!endpointId) {
      return buildUnsupportedDirectivePayload(directive);
    }

    let device;

    try {
      ({ device } = await getAuthorizedDevice(endpointId));
    } catch (error) {
      if (error instanceof AccessControlError) {
        return apiOk({
          alexa: buildAlexaErrorResponse("NOT_OWNED", directive),
          mappedCommand: null,
          placeholder: true,
        });
      }

      throw error;
    }

    const status = await getDeviceStatusSnapshot(device);

    if (namespace === "Alexa" && name === "ReportState") {
      return apiOk({
        alexa: buildAlexaSuccessResponse({
          directive,
          endpointId: device.deviceId,
          name: "StateReport",
          properties: buildAlexaStateProperties(status),
        }),
        deviceId: device.deviceId,
        placeholder: true,
      });
    }

    const mappedCommand = mapAlexaDirectiveToDeviceCommand(directive);

    if (!mappedCommand) {
      return buildUnsupportedDirectivePayload(directive);
    }

    if (!isDeviceReachable(status)) {
      return apiOk({
        alexa: buildAlexaErrorResponse("DEVICE_OFFLINE", directive),
        mappedCommand,
        placeholder: true,
      });
    }

    if (status.safetyMode === true && status.calibrationComplete !== true) {
      return apiOk({
        alexa: buildAlexaErrorResponse("CALIBRATION_REQUIRED", directive),
        mappedCommand,
        placeholder: true,
      });
    }

    const nextStatus = buildPlaceholderCommandState(status, mappedCommand);

    return apiOk({
      alexa: buildAlexaSuccessResponse({
        directive,
        endpointId: device.deviceId,
        properties: buildAlexaStateProperties(nextStatus),
      }),
      mappedCommand,
      placeholder: true,
      note: "Alexa Smart Home scaffold returns placeholder responses and does not publish MQTT commands yet.",
    });
  } catch (error) {
    if (error instanceof AccessControlError) {
      return apiError(error.message, error.statusCode);
    }

    console.error("Alexa Smart Home scaffold failed.");
    return apiError("Unable to handle the Alexa Smart Home directive.", 500);
  }
}
