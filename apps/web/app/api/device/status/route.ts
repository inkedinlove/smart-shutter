import {
  AccessControlError,
  getAuthorizedDeviceFromQuery,
} from "@/lib/access-control";
import { apiError, apiOk } from "@/lib/api-response";
import { classifyDeviceClaimState } from "@/lib/device-registration";
import { getDeviceStatusSnapshot } from "@/lib/live-device-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);

  try {
    const { device } = await getAuthorizedDeviceFromQuery(
      url.searchParams.get("deviceId")?.trim() ?? "",
    );

    const [status, claimState] = await Promise.all([
      getDeviceStatusSnapshot(device),
      classifyDeviceClaimState(device.deviceId),
    ]);

    return apiOk(
      {
        ...status,
        claimState,
        resolvedDeviceId: status.resolvedDeviceId || device.deviceId,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    if (error instanceof AccessControlError) {
      return apiError(error.message, error.statusCode);
    }

    console.error("MQTT status lookup failed:", error);

    return apiError(
      "Live device status is unavailable right now. Check power, Wi-Fi, and try again.",
      503,
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
