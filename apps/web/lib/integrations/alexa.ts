import type {
  DeviceCommandInput,
  DeviceStatus,
} from "@/lib/device";
import type { RegisteredDevice } from "@/lib/devices";

export const ALEXA_RANGE_INSTANCE = "Blind.Lift";
const ALEXA_MANUFACTURER_NAME = "Smart Shutter";
const ALEXA_LOCALE = "en-US";
const ALEXA_UNCERTAINTY_MS = 500;

export type AlexaDirectiveHeader = {
  namespace: string;
  name: string;
  payloadVersion?: string;
  messageId?: string;
  correlationToken?: string;
  instance?: string;
};

export type AlexaDirectiveEndpoint = {
  endpointId: string;
};

export type AlexaDirective = {
  header: AlexaDirectiveHeader;
  endpoint?: AlexaDirectiveEndpoint;
  payload?: Record<string, unknown>;
};

export type AlexaDirectiveEnvelope = {
  directive: AlexaDirective;
};

export type AlexaProperty = {
  namespace: string;
  name: string;
  value: unknown;
  timeOfSample: string;
  uncertaintyInMilliseconds: number;
  instance?: string;
};

export type AlexaResponseEnvelope = {
  context?: {
    properties: AlexaProperty[];
  };
  event: {
    header: {
      namespace: string;
      name: string;
      payloadVersion: string;
      messageId: string;
      correlationToken?: string;
    };
    endpoint?: {
      endpointId: string;
    };
    payload: Record<string, unknown>;
  };
};

export type AlexaErrorReason =
  | "DEVICE_OFFLINE"
  | "NOT_OWNED"
  | "CALIBRATION_REQUIRED"
  | "SAFETY_LOCKED"
  | "INVALID_VALUE"
  | "UNSUPPORTED_DIRECTIVE"
  | "SKILL_DISABLED";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isAlexaDirectiveEnvelope(
  value: unknown,
): value is AlexaDirectiveEnvelope {
  if (!isRecord(value) || !isRecord(value.directive)) {
    return false;
  }

  const header = value.directive.header;
  return (
    isRecord(header) &&
    typeof header.namespace === "string" &&
    typeof header.name === "string"
  );
}

function createTextFriendlyName(text: string) {
  return {
    "@type": "text",
    value: {
      text,
      locale: ALEXA_LOCALE,
    },
  };
}

function getAlexaPercent(status: DeviceStatus | null): number {
  const value = status?.estimatedPercent ?? status?.targetPercent ?? 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function buildAlexaProperties(status: DeviceStatus | null): AlexaProperty[] {
  const timeOfSample = status?.lastSeenAt ?? new Date().toISOString();
  const percentage = getAlexaPercent(status);

  return [
    {
      namespace: "Alexa.EndpointHealth",
      name: "connectivity",
      value: {
        value: status?.online ? "OK" : "UNREACHABLE",
      },
      timeOfSample,
      uncertaintyInMilliseconds: ALEXA_UNCERTAINTY_MS,
    },
    {
      namespace: "Alexa.PercentageController",
      name: "percentage",
      value: percentage,
      timeOfSample,
      uncertaintyInMilliseconds: ALEXA_UNCERTAINTY_MS,
    },
    {
      namespace: "Alexa.RangeController",
      instance: ALEXA_RANGE_INSTANCE,
      name: "rangeValue",
      value: percentage,
      timeOfSample,
      uncertaintyInMilliseconds: ALEXA_UNCERTAINTY_MS,
    },
    {
      namespace: "Alexa.PowerController",
      name: "powerState",
      value: percentage > 0 ? "ON" : "OFF",
      timeOfSample,
      uncertaintyInMilliseconds: ALEXA_UNCERTAINTY_MS,
    },
  ];
}

export function mapDeviceToAlexaEndpoint(device: RegisteredDevice) {
  return {
    endpointId: device.deviceId,
    manufacturerName: ALEXA_MANUFACTURER_NAME,
    description: `${device.label} smart shutter`,
    friendlyName: device.label,
    displayCategories: ["INTERIOR_BLIND"],
    additionalAttributes: {
      manufacturer: ALEXA_MANUFACTURER_NAME,
      model: "Smart Shutter v1",
      customIdentifier: device.deviceId,
    },
    cookie: {},
    capabilities: [
      {
        type: "AlexaInterface",
        interface: "Alexa",
        version: "3",
      },
      {
        type: "AlexaInterface",
        interface: "Alexa.EndpointHealth",
        version: "3.1",
        properties: {
          supported: [{ name: "connectivity" }],
          proactivelyReported: false,
          retrievable: true,
        },
      },
      {
        type: "AlexaInterface",
        interface: "Alexa.PercentageController",
        version: "3",
        properties: {
          supported: [{ name: "percentage" }],
          proactivelyReported: false,
          retrievable: true,
        },
      },
      {
        type: "AlexaInterface",
        interface: "Alexa.RangeController",
        instance: ALEXA_RANGE_INSTANCE,
        version: "3",
        capabilityResources: {
          friendlyNames: [createTextFriendlyName("position")],
        },
        configuration: {
          supportedRange: {
            minimumValue: 0,
            maximumValue: 100,
            precision: 1,
          },
          unitOfMeasure: "Alexa.Unit.Percent",
        },
        properties: {
          supported: [{ name: "rangeValue" }],
          proactivelyReported: false,
          retrievable: true,
        },
      },
      {
        type: "AlexaInterface",
        interface: "Alexa.PowerController",
        version: "3",
        properties: {
          supported: [{ name: "powerState" }],
          proactivelyReported: false,
          retrievable: true,
        },
      },
    ],
  };
}

export function mapAlexaDirectiveToDeviceCommand(
  directive: AlexaDirective,
): DeviceCommandInput | null {
  const endpointId = directive.endpoint?.endpointId?.trim();

  if (!endpointId) {
    return null;
  }

  const namespace = directive.header.namespace;
  const name = directive.header.name;
  const payload = directive.payload ?? {};

  if (namespace === "Alexa.PowerController" && name === "TurnOn") {
    return {
      deviceId: endpointId,
      type: "SET_PERCENT",
      value: 100,
    };
  }

  if (namespace === "Alexa.PowerController" && name === "TurnOff") {
    return {
      deviceId: endpointId,
      type: "SET_PERCENT",
      value: 0,
    };
  }

  if (
    namespace === "Alexa.PercentageController" &&
    name === "SetPercentage" &&
    typeof payload.percentage === "number" &&
    Number.isFinite(payload.percentage)
  ) {
    return {
      deviceId: endpointId,
      type: "SET_PERCENT",
      value: Math.max(0, Math.min(100, Math.round(payload.percentage))),
    };
  }

  if (
    namespace === "Alexa.RangeController" &&
    name === "SetRangeValue" &&
    directive.header.instance === ALEXA_RANGE_INSTANCE &&
    typeof payload.rangeValue === "number" &&
    Number.isFinite(payload.rangeValue)
  ) {
    return {
      deviceId: endpointId,
      type: "SET_PERCENT",
      value: Math.max(0, Math.min(100, Math.round(payload.rangeValue))),
    };
  }

  return null;
}

function buildAlexaHeader(
  directive: AlexaDirective | undefined,
  name: string,
  namespace = "Alexa",
): AlexaResponseEnvelope["event"]["header"] {
  return {
    namespace,
    name,
    payloadVersion: "3",
    messageId: crypto.randomUUID(),
    correlationToken: directive?.header.correlationToken,
  };
}

export function buildAlexaErrorResponse(
  reason: AlexaErrorReason,
  directive?: AlexaDirective,
  message?: string,
): AlexaResponseEnvelope {
  const payloadByReason: Record<
    AlexaErrorReason,
    { type: string; message: string }
  > = {
    DEVICE_OFFLINE: {
      type: "ENDPOINT_UNREACHABLE",
      message: "The shutter is offline. Check power and Wi-Fi.",
    },
    NOT_OWNED: {
      type: "NO_SUCH_ENDPOINT",
      message: "This shutter is not available for this customer account.",
    },
    CALIBRATION_REQUIRED: {
      type: "NOT_SUPPORTED_IN_CURRENT_MODE",
      message: "Finish safe calibration before using full movement by voice.",
    },
    SAFETY_LOCKED: {
      type: "NOT_SUPPORTED_IN_CURRENT_MODE",
      message: "Voice control is blocked while safety restrictions are active.",
    },
    INVALID_VALUE: {
      type: "VALUE_OUT_OF_RANGE",
      message: "The requested shutter position is invalid.",
    },
    UNSUPPORTED_DIRECTIVE: {
      type: "INVALID_DIRECTIVE",
      message: "This Alexa directive is not supported yet.",
    },
    SKILL_DISABLED: {
      type: "INTERNAL_ERROR",
      message: "Alexa Smart Home support is disabled.",
    },
  };

  const payload = payloadByReason[reason];

  return {
    event: {
      header: buildAlexaHeader(directive, "ErrorResponse"),
      endpoint: directive?.endpoint?.endpointId
        ? {
            endpointId: directive.endpoint.endpointId,
          }
        : undefined,
      payload: {
        type: payload.type,
        message: message ?? payload.message,
      },
    },
  };
}

export function buildAlexaSuccessResponse(options: {
  directive?: AlexaDirective;
  endpointId?: string;
  properties?: AlexaProperty[];
  payload?: Record<string, unknown>;
  name?: "Response" | "StateReport" | "Discover.Response";
  namespace?: "Alexa" | "Alexa.Discovery";
}): AlexaResponseEnvelope {
  const properties = options.properties ?? [];

  return {
    context:
      properties.length > 0
        ? {
            properties,
          }
        : undefined,
    event: {
      header: buildAlexaHeader(
        options.directive,
        options.name ?? "Response",
        options.namespace ?? "Alexa",
      ),
      endpoint: options.endpointId
        ? {
            endpointId: options.endpointId,
          }
        : undefined,
      payload: options.payload ?? {},
    },
  };
}

export function buildAlexaStateProperties(status: DeviceStatus | null): AlexaProperty[] {
  return buildAlexaProperties(status);
}
