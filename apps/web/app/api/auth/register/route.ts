import { apiError, apiOk } from "@/lib/api-response";
import {
  assertRateLimit,
  buildRateLimitKey,
  clearRateLimit,
  getRequestIpAddress,
  RateLimitError,
} from "@/lib/rate-limit";
import { createUserAccount, UserAccountError } from "@/lib/user-accounts";
import { normalizeEmail } from "@/lib/user-accounts";

type RegisterBody = {
  displayName?: unknown;
  email?: unknown;
  password?: unknown;
};

function isRegisterBody(value: unknown): value is RegisterBody {
  return typeof value === "object" && value !== null;
}

export const runtime = "nodejs";

function sanitizeRegistrationError(error: UserAccountError): string {
  if (error.statusCode === 409) {
    return "We couldn't create the account with those details.";
  }

  if (error.statusCode >= 500) {
    return "Unable to create the customer account.";
  }

  return error.message;
}

function buildAuthRegistrationRateLimitKey(
  request: Request,
  email: string,
): string {
  const normalizedEmail = normalizeEmail(email);
  const requestIpAddress = getRequestIpAddress(request);

  if (requestIpAddress && requestIpAddress !== "unknown" && normalizedEmail) {
    return buildRateLimitKey("ip", requestIpAddress, "email", normalizedEmail);
  }

  if (normalizedEmail) {
    return buildRateLimitKey("email", normalizedEmail);
  }

  if (requestIpAddress && requestIpAddress !== "unknown") {
    return buildRateLimitKey("ip", requestIpAddress);
  }

  return buildRateLimitKey("anonymous-register");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;

    if (!isRegisterBody(body)) {
      return apiError("Invalid registration payload.", 400);
    }

    const displayName =
      typeof body.displayName === "string" ? body.displayName : "";
    const email = typeof body.email === "string" ? body.email : "";
    const password = typeof body.password === "string" ? body.password : "";
    const rateLimitKey = buildAuthRegistrationRateLimitKey(request, email);

    assertRateLimit({
      bucket: "auth-register",
      key: rateLimitKey,
      limit: 8,
      windowMs: 10 * 60_000,
      message:
        "Too many account creation attempts. Wait a few minutes, then try again.",
    });

    const account = await createUserAccount({
      displayName,
      email,
      password,
    });

    clearRateLimit({
      bucket: "auth-register",
      key: rateLimitKey,
    });

    return apiOk(
      {
        account: {
          displayName: account.displayName,
          email: account.email,
          role: account.role,
        },
      },
      {
        status: 201,
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

    if (error instanceof UserAccountError) {
      return apiError(sanitizeRegistrationError(error), error.statusCode);
    }

    console.error("Unable to register account.");

    return apiError("Unable to create the customer account.", 500);
  }
}
