import { apiError, apiOk } from "@/lib/api-response";
import {
  EmailVerificationError,
  resendEmailVerification,
} from "@/lib/email-verification";
import {
  assertRateLimit,
  buildRateLimitKey,
  getRequestIpAddress,
  RateLimitError,
} from "@/lib/rate-limit";
import { normalizeEmail } from "@/lib/user-accounts";

type VerificationRequestBody = {
  email?: unknown;
};

function isVerificationRequestBody(
  value: unknown,
): value is VerificationRequestBody {
  return typeof value === "object" && value !== null;
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;

    if (!isVerificationRequestBody(body)) {
      return apiError("Invalid verification request payload.", 400);
    }

    const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";

    assertRateLimit({
      bucket: "auth-verify-email-request",
      key: buildRateLimitKey(getRequestIpAddress(request), email || "anonymous"),
      limit: 6,
      windowMs: 10 * 60_000,
      message:
        "Too many verification email requests. Wait a few minutes, then try again.",
    });

    await resendEmailVerification({
      email,
      request,
    });

    return apiOk(
      {
        email,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    if (error instanceof RateLimitError) {
      return apiError(error.message, error.statusCode, {
        headers: {
          "Retry-After": String(error.retryAfterSeconds),
        },
      });
    }

    if (error instanceof EmailVerificationError) {
      return apiError(error.message, error.statusCode);
    }

    console.error("Unable to resend verification email:", error);
    return apiError("Unable to send verification email.", 500);
  }
}
