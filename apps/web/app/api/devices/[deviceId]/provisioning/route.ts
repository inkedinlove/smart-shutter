import { requireAdminAccess, AdminAuthorizationError } from "@/lib/admin";
import { apiError, apiOk } from "@/lib/api-response";
import { getRegisteredDeviceById } from "@/lib/device-registry";
import { createProvisioningData } from "@/lib/devices";
import { getPublicMqttConfig } from "@/lib/mqtt";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    await requireAdminAccess(request);
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return apiError(error.message, error.statusCode);
    }

    return apiError("Unable to authorize provisioning access.", 500);
  }

  const { deviceId } = await context.params;
  const device = await getRegisteredDeviceById(deviceId);

  if (!device) {
    return apiError(`Unknown deviceId: ${deviceId}`, 404);
  }

  return apiOk(createProvisioningData(device, getPublicMqttConfig()), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
