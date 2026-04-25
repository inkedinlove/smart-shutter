import { AccessControlError, getAccessContext } from "@/lib/access-control";
import { apiError, apiOk } from "@/lib/api-response";
import {
  DeviceClaimError,
  normalizeClaimCode,
  redeemDeviceClaim,
} from "@/lib/device-claims";
import {
  assertRateLimit,
  buildRateLimitKey,
  getRequestIpAddress,
  RateLimitError,
} from "@/lib/rate-limit";

type RedeemClaimBody = {
  claimCode?: unknown;
};

function isRedeemClaimBody(value: unknown): value is RedeemClaimBody {
  return typeof value === "object" && value !== null;
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const context = await getAccessContext();
    const body = (await request.json()) as unknown;

    if (!isRedeemClaimBody(body)) {
      return apiError("Invalid claim request body.", 400);
    }

    const claimCode = typeof body.claimCode === "string" ? body.claimCode : "";

    assertRateLimit({
      bucket: "claim-redeem",
      key: buildRateLimitKey(
        getRequestIpAddress(request),
        normalizeClaimCode(claimCode),
      ),
      limit: 6,
      windowMs: 10 * 60_000,
      message:
        "Too many claim attempts. Wait a few minutes, then try again.",
    });

    const claim = await redeemDeviceClaim({
      claimCode,
      profileId: context.profile.profileId,
    });

    return apiOk(
      {
        claim,
        device: {
          deviceId: claim.deviceId,
          label: claim.deviceLabel,
        },
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

    console.error("Unable to redeem claim.");

    return apiError("Unable to redeem device claim.", 500);
  }
}
