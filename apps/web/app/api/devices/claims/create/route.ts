import { requireAdminAccess, AdminAuthorizationError } from "@/lib/admin";
import { apiError, apiOk } from "@/lib/api-response";
import { createDeviceClaim, DeviceClaimError } from "@/lib/device-claims";
import {
  assertRateLimit,
  buildRateLimitKey,
  getRequestIpAddress,
  RateLimitError,
} from "@/lib/rate-limit";

type CreateClaimBody = {
  deviceId?: unknown;
  expiresInMinutes?: unknown;
};

function isCreateClaimBody(value: unknown): value is CreateClaimBody {
  return typeof value === "object" && value !== null;
}

export const runtime = "nodejs";

function resolvePublicAppBaseUrl(request: Request): string | null {
  const configuredBaseUrl = process.env.PUBLIC_APP_BASE_URL?.trim();

  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  try {
    return new URL(request.url).origin;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminAccess(request);

    const body = (await request.json()) as unknown;

    if (!isCreateClaimBody(body)) {
      return apiError("Invalid claim request body.", 400);
    }

    const deviceId = typeof body.deviceId === "string" ? body.deviceId : "";
    const expiresInMinutes =
      typeof body.expiresInMinutes === "number"
        ? body.expiresInMinutes
        : Number.NaN;

    assertRateLimit({
      bucket: "admin-claim-create",
      key: buildRateLimitKey(getRequestIpAddress(request), deviceId.trim()),
      limit: 20,
      windowMs: 10 * 60_000,
      message:
        "Too many claim creation requests. Wait a moment, then try again.",
    });

    const claim = await createDeviceClaim({
      deviceId,
      expiresInMinutes,
      publicAppBaseUrl: resolvePublicAppBaseUrl(request),
    });

    return apiOk(
      {
        claim,
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

    if (error instanceof DeviceClaimError) {
      return apiError(error.message, error.statusCode);
    }

    console.error("Unable to create claim.");

    return apiError("Unable to create device claim.", 500);
  }
}
