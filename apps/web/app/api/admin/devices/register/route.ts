import { requireAdminAccess, AdminAuthorizationError } from "@/lib/admin";
import { apiError, apiOk } from "@/lib/api-response";
import {
  assertRateLimit,
  buildRateLimitKey,
  getRequestIpAddress,
  RateLimitError,
} from "@/lib/rate-limit";
import { registerDeviceIfMissing } from "@/lib/device-registration";

type RegisterDeviceBody = {
  deviceId?: unknown;
  label?: unknown;
  board?: unknown;
};

function isRegisterDeviceBody(value: unknown): value is RegisterDeviceBody {
  return typeof value === "object" && value !== null;
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireAdminAccess(request);

    const body = (await request.json()) as unknown;

    if (!isRegisterDeviceBody(body)) {
      return apiError("Invalid device registration request body.", 400);
    }

    const deviceId = typeof body.deviceId === "string" ? body.deviceId : "";
    const label = typeof body.label === "string" ? body.label : "";
    const board = typeof body.board === "string" ? body.board : "esp32";

    assertRateLimit({
      bucket: "admin-device-register",
      key: buildRateLimitKey(getRequestIpAddress(request), deviceId.trim()),
      limit: 20,
      windowMs: 10 * 60_000,
      message:
        "Too many device registration requests. Wait a moment, then try again.",
    });

    const device = await registerDeviceIfMissing({
      deviceId,
      label,
      board,
    });

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

    if (error instanceof Error) {
      return apiError(error.message, 400);
    }

    console.error("Unable to register device.");
    return apiError("Unable to register the device.", 500);
  }
}
