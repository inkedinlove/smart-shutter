import { requireAdminAccess, AdminAuthorizationError } from "@/lib/admin";
import { apiError, apiOk } from "@/lib/api-response";
import {
  deleteRegisteredDevice,
  DeviceRegistrationError,
} from "@/lib/device-registration";
import {
  assertRateLimit,
  buildRateLimitKey,
  getRequestIpAddress,
  RateLimitError,
} from "@/lib/rate-limit";

type RouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

export const runtime = "nodejs";

export async function DELETE(request: Request, context: RouteContext) {
  try {
    await requireAdminAccess(request);

    const { deviceId } = await context.params;

    assertRateLimit({
      bucket: "admin-device-delete",
      key: buildRateLimitKey(getRequestIpAddress(request), deviceId.trim()),
      limit: 20,
      windowMs: 10 * 60_000,
      message: "Too many device delete requests. Wait a moment, then try again.",
    });

    const device = await deleteRegisteredDevice(deviceId);

    return apiOk(
      {
        device,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return apiError(error.message, error.statusCode);
    }

    if (error instanceof RateLimitError) {
      return apiError(error.message, error.statusCode, {
        headers: {
          "Retry-After": String(error.retryAfterSeconds),
        },
      });
    }

    if (error instanceof DeviceRegistrationError) {
      return apiError(error.message, error.statusCode);
    }

    console.error("Unable to delete device:", error);
    return apiError("Unable to delete the device.", 500);
  }
}
