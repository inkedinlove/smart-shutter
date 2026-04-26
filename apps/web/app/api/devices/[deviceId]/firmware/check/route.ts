import { apiError, apiOk } from "@/lib/api-response";
import { AccessControlError } from "@/lib/access-control";
import { getAuthorizedFirmwareRouteDevice } from "@/lib/device-firmware-auth";
import {
  createFirmwareCheckResponse,
  recordDeviceUpdateEvent,
} from "@/lib/firmware-releases";
import {
  persistReportedFirmwareVersion,
  readLatestDeviceStatus,
} from "@/lib/live-device-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { deviceId } = await context.params;
  let device;

  try {
    ({ device } = await getAuthorizedFirmwareRouteDevice(request, deviceId));
  } catch (error) {
    if (error instanceof AccessControlError) {
      return apiError(error.message, error.statusCode);
    }

    return apiError("Unable to authorize device access.", 500);
  }

  const liveStatus = await readLatestDeviceStatus(device).catch((error) => {
    console.error("Firmware check live status lookup failed:", error);
    return null;
  });

  if (liveStatus?.firmwareVersion) {
    await persistReportedFirmwareVersion(liveStatus);
  }

  const result = await createFirmwareCheckResponse(device, {
    currentVersion: liveStatus?.firmwareVersion ?? device.firmwareVersion ?? null,
  });

  void recordDeviceUpdateEvent({
    deviceId: device.deviceId,
    firmwareVersionFrom: result.currentVersion,
    firmwareVersionTo: result.latestVersion ?? "unknown",
    status: result.updateAvailable ? "update_available" : "update_not_available",
    detail: [
      `current=${result.currentVersion ?? "unknown"}`,
      `latest=${result.latestVersion ?? "none"}`,
      `updateAvailable=${result.updateAvailable ? "true" : "false"}`,
    ].join(", "),
  }).catch((error) => {
    console.error("Unable to record firmware availability event:", error);
  });

  return apiOk(result, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
