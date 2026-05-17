import "server-only";

import { timingSafeEqual } from "node:crypto";

import { AccessControlError, getAuthorizedDevice } from "@/lib/access-control";
import { getRegisteredDeviceById } from "@/lib/device-registry";

const DEVICE_ID_HEADER = "x-smart-shutter-device-id";
const MQTT_USERNAME_HEADER = "x-smart-shutter-mqtt-username";
const MQTT_PASSWORD_HEADER = "x-smart-shutter-mqtt-password";

type AuthorizedFirmwareDeviceResult = Awaited<ReturnType<typeof getAuthorizedDevice>>;

function normalizeHeaderValue(
  headers: Headers,
  headerName: string,
): string {
  return headers.get(headerName)?.trim() ?? "";
}

export function isDeviceFirmwareRequest(headers: Headers): boolean {
  return (
    headers.has(DEVICE_ID_HEADER) ||
    headers.has(MQTT_USERNAME_HEADER) ||
    headers.has(MQTT_PASSWORD_HEADER)
  );
}

function timingSafeEqualText(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

async function getAuthorizedDeviceFromSharedMqttCredentials(
  request: Request,
  deviceId: string,
): Promise<AuthorizedFirmwareDeviceResult> {
  const normalizedDeviceId = deviceId.trim();
  const headerDeviceId = normalizeHeaderValue(request.headers, DEVICE_ID_HEADER);
  const suppliedUsername = normalizeHeaderValue(request.headers, MQTT_USERNAME_HEADER);
  const suppliedPassword = normalizeHeaderValue(request.headers, MQTT_PASSWORD_HEADER);

  if (
    !normalizedDeviceId ||
    !headerDeviceId ||
    !suppliedUsername ||
    !suppliedPassword ||
    headerDeviceId !== normalizedDeviceId
  ) {
    throw new AccessControlError("Invalid device credentials.", 401);
  }

  const configuredUsername = process.env.MQTT_USERNAME?.trim() ?? "";
  const configuredPassword = process.env.MQTT_PASSWORD?.trim() ?? "";

  if (!configuredUsername || !configuredPassword) {
    throw new AccessControlError(
      "Device authentication is unavailable right now.",
      503,
    );
  }

  if (
    !timingSafeEqualText(suppliedUsername, configuredUsername) ||
    !timingSafeEqualText(suppliedPassword, configuredPassword)
  ) {
    throw new AccessControlError("Invalid device credentials.", 401);
  }

  const device = await getRegisteredDeviceById(normalizedDeviceId);

  if (!device) {
    throw new AccessControlError("Device not found.", 404);
  }

  return {
    context: {
      mode: "internal",
      session: null,
      profile: {
        profileId: "device-firmware",
        displayName: "Device Firmware",
        email: null,
        createdAt: "2026-04-26T00:00:00.000Z",
        updatedAt: "2026-04-26T00:00:00.000Z",
      },
    },
    device,
  };
}

export async function getAuthorizedFirmwareRouteDevice(
  request: Request,
  deviceId: string,
): Promise<AuthorizedFirmwareDeviceResult> {
  if (isDeviceFirmwareRequest(request.headers)) {
    return getAuthorizedDeviceFromSharedMqttCredentials(request, deviceId);
  }

  return getAuthorizedDevice(deviceId);
}
