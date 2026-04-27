import { apiError, apiOk } from "@/lib/api-response";
import {
  confirmEmailVerification,
  EmailVerificationError,
} from "@/lib/email-verification";
import {
  assertRateLimit,
  buildRateLimitKey,
  getRequestIpAddress,
  RateLimitError,
} from "@/lib/rate-limit";
import { normalizeEmail } from "@/lib/user-accounts";

type VerificationConfirmBody = {
  email?: unknown;
  token?: unknown;
};

function isVerificationConfirmBody(
  value: unknown,
): value is VerificationConfirmBody {
  return typeof value === "object" && value !== null;
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;

    if (!isVerificationConfirmBody(body)) {
      return apiError("Invalid verification confirmation payload.", 400);
    }

    const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
    const token = typeof body.token === "string" ? body.token.trim() : "";

    assertRateLimit({
      bucket: "auth-verify-email-confirm",
      key: buildRateLimitKey(
        getRequestIpAddress(request),
        email || "anonymous",
        token || "missing",
      ),
      limit: 12,
      windowMs: 10 * 60_000,
      message:
        "Too many verification attempts. Wait a few minutes, then try again.",
    });

    const result = await confirmEmailVerification({
      email,
      token,
    });

    return apiOk(result, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
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

    console.error("Unable to confirm verification email:", error);
    return apiError("Unable to verify this email address.", 500);
  }
}
