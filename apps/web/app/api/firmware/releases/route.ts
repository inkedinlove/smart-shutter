import {
  AdminAuthorizationError,
  requireAdminAccess,
} from "@/lib/admin";
import { apiError, apiOk } from "@/lib/api-response";
import {
  createFirmwareRelease,
  FirmwareReleaseError,
  listFirmwareReleases,
} from "@/lib/firmware-releases";
import type { FirmwareReleaseInput } from "@/lib/firmware";
import {
  assertRateLimit,
  buildRateLimitKey,
  getRequestIpAddress,
  RateLimitError,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const includeInactive = url.searchParams.get("scope") === "all";

  if (includeInactive) {
    try {
      await requireAdminAccess(request);
    } catch (error) {
      if (error instanceof AdminAuthorizationError) {
        return apiError(error.message, error.statusCode);
      }

      return apiError("Unable to authorize firmware release access.", 503);
    }
  }

  const releases = await listFirmwareReleases({ includeInactive });

  return apiOk(
    { releases },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function POST(request: Request) {
  try {
    await requireAdminAccess(request);

    assertRateLimit({
      bucket: "admin-firmware-release",
      key: buildRateLimitKey(getRequestIpAddress(request)),
      limit: 10,
      windowMs: 10 * 60_000,
      message:
        "Too many firmware publishing requests. Wait a moment, then try again.",
    });
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

    return apiError("Unable to authorize firmware release publishing.", 503);
  }

  let parsedBody: FirmwareReleaseInput;

  try {
    parsedBody = (await request.json()) as FirmwareReleaseInput;
  } catch {
    return apiError("Request body must be valid JSON.", 400);
  }

  try {
    const release = await createFirmwareRelease(parsedBody);

    return apiOk(
      {
        release,
      },
      {
        status: 201,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    if (error instanceof FirmwareReleaseError) {
      return apiError(error.message, error.statusCode);
    }

    console.error("Unable to create firmware release.");

    return apiError("Unable to create the firmware release right now.", 503);
  }
}
