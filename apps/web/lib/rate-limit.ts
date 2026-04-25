import "server-only";

export const RATE_LIMITING_MODE = "memory-single-instance";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitBuckets = new Map<string, RateLimitEntry>();

export class RateLimitError extends Error {
  statusCode: number;
  retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = "RateLimitError";
    this.statusCode = 429;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function cleanupExpiredEntries(now: number): void {
  for (const [key, entry] of rateLimitBuckets.entries()) {
    if (entry.resetAt <= now) {
      rateLimitBuckets.delete(key);
    }
  }
}

function normalizeKeyPart(value: string | null | undefined): string {
  const normalizedValue = value?.trim().toLowerCase() ?? "";
  return normalizedValue.length > 0 ? normalizedValue : "unknown";
}

export function buildRateLimitKey(
  ...parts: Array<string | null | undefined>
): string {
  return parts.map(normalizeKeyPart).join(":");
}

export function getRequestIpAddress(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    const firstAddress = forwardedFor.split(",")[0]?.trim();

    if (firstAddress) {
      return firstAddress;
    }
  }

  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    "unknown"
  );
}

type HeadersLike =
  | Headers
  | {
      get(name: string): string | null | undefined;
    }
  | Record<string, string | string[] | undefined>;

export function getIpAddressFromHeaders(headers: HeadersLike | undefined): string {
  if (!headers) {
    return "unknown";
  }

  if ("get" in headers && typeof headers.get === "function") {
    const forwardedFor = headers.get("x-forwarded-for");

    if (forwardedFor) {
      const firstAddress = forwardedFor.split(",")[0]?.trim();

      if (firstAddress) {
        return firstAddress;
      }
    }

    return (
      headers.get("x-real-ip")?.trim() ||
      headers.get("cf-connecting-ip")?.trim() ||
      "unknown"
    );
  }

  const headerRecord = headers as Record<string, string | string[] | undefined>;
  const rawForwardedFor = headerRecord["x-forwarded-for"];
  const forwardedFor = Array.isArray(rawForwardedFor)
    ? rawForwardedFor[0]
    : rawForwardedFor;

  if (forwardedFor) {
    const firstAddress = forwardedFor.split(",")[0]?.trim();

    if (firstAddress) {
      return firstAddress;
    }
  }

  const rawRealIp = headerRecord["x-real-ip"];
  const realIp = Array.isArray(rawRealIp) ? rawRealIp[0] : rawRealIp;

  const rawCfConnectingIp = headerRecord["cf-connecting-ip"];
  const cfConnectingIp = Array.isArray(rawCfConnectingIp)
    ? rawCfConnectingIp[0]
    : rawCfConnectingIp;

  return realIp?.trim() || cfConnectingIp?.trim() || "unknown";
}

export function assertRateLimit(input: {
  bucket: string;
  key: string;
  limit: number;
  windowMs: number;
  message: string;
}): void {
  const now = Date.now();
  cleanupExpiredEntries(now);

  const compositeKey = `${input.bucket}:${input.key}`;
  const existingEntry = rateLimitBuckets.get(compositeKey);

  if (!existingEntry || existingEntry.resetAt <= now) {
    rateLimitBuckets.set(compositeKey, {
      count: 1,
      resetAt: now + input.windowMs,
    });
    return;
  }

  if (existingEntry.count >= input.limit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((existingEntry.resetAt - now) / 1000),
    );
    throw new RateLimitError(input.message, retryAfterSeconds);
  }

  existingEntry.count += 1;
  rateLimitBuckets.set(compositeKey, existingEntry);
}
