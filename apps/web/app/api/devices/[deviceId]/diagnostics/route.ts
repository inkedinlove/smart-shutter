import { AccessControlError, getAuthorizedDevice } from "@/lib/access-control";
import { apiError, apiOk } from "@/lib/api-response";
import { createDeviceDiagnostics } from "@/lib/device";
import { classifyDeviceClaimState } from "@/lib/device-registration";
import { getDeviceStatusSnapshot } from "@/lib/live-device-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { device } = await getAuthorizedDevice((await context.params).deviceId);
    const [status, claimState] = await Promise.all([
      getDeviceStatusSnapshot(device),
      classifyDeviceClaimState(device.deviceId),
    ]);

    return apiOk(
      createDeviceDiagnostics(device.board, device.deviceId, claimState, status),
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

    console.error("Unable to load device diagnostics:", error);
    return apiError(
      "Device diagnostics are unavailable right now. Check power, Wi-Fi, and try again.",
      503,
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
