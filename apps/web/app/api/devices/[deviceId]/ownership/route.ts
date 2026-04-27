import { AccessControlError, getAuthorizedDevice } from "@/lib/access-control";
import { apiError, apiOk } from "@/lib/api-response";
import {
  removeDeviceOwnership,
  DeviceOwnershipError,
} from "@/lib/device-ownership";

type RouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

export const runtime = "nodejs";

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { deviceId } = await context.params;
    const { device } = await getAuthorizedDevice(deviceId);
    const updatedDevice = await removeDeviceOwnership({
      deviceId: device.deviceId,
    });

    return apiOk(
      {
        deviceId: updatedDevice.deviceId,
        ownerProfileId: updatedDevice.ownerProfileId,
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

    if (error instanceof DeviceOwnershipError) {
      return apiError(error.message, error.statusCode);
    }

    console.error("Unable to remove device ownership:", error);
    return apiError("Unable to remove this device from the account.", 500);
  }
}
