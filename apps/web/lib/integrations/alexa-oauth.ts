import "server-only";

import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import { getDb, isDatabaseConfigured } from "@/lib/db";

const AUTH_CODE_TTL_SECONDS = 5 * 60;
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 180 * 24 * 60 * 60;

type AlexaPkceMethod = "plain" | "S256";

type AlexaAuthCodePayload = {
  kind: "auth_code";
  profileId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string | null;
  codeChallengeMethod: AlexaPkceMethod | null;
  iat: number;
  exp: number;
  jti: string;
};

type AlexaAccessTokenPayload = {
  kind: "access_token";
  profileId: string;
  clientId: string;
  iat: number;
  exp: number;
  jti: string;
};

type AlexaRefreshTokenPayload = {
  kind: "refresh_token";
  profileId: string;
  clientId: string;
  iat: number;
  exp: number;
  jti: string;
};

type AlexaTokenPayload =
  | AlexaAuthCodePayload
  | AlexaAccessTokenPayload
  | AlexaRefreshTokenPayload;

type AlexaTokenValidationResult<T extends AlexaTokenPayload> =
  | {
      ok: true;
      payload: T;
    }
  | {
      ok: false;
      reason: "invalid" | "expired";
    };

type EncodedProfileRecord = {
  id: string;
};

function getNowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function getSigningSecret(): string {
  const authSecret = process.env.AUTH_SECRET?.trim();

  if (!authSecret) {
    throw new Error("AUTH_SECRET is required for Alexa account linking.");
  }

  return `${authSecret}:alexa-oauth`;
}

function toBase64Url(value: Buffer | string): string {
  const buffer = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = normalized.length % 4;
  const padded =
    remainder === 0 ? normalized : normalized + "=".repeat(4 - remainder);
  return Buffer.from(padded, "base64");
}

function signEncodedPayload(encodedPayload: string): string {
  return toBase64Url(
    createHmac("sha256", getSigningSecret()).update(encodedPayload).digest(),
  );
}

function sealPayload<T extends AlexaTokenPayload>(payload: T): string {
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signEncodedPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function unsealPayload<T extends AlexaTokenPayload>(
  token: string,
): AlexaTokenValidationResult<T> {
  const normalizedToken = token.trim();
  const [encodedPayload, encodedSignature] = normalizedToken.split(".");

  if (!encodedPayload || !encodedSignature) {
    return {
      ok: false,
      reason: "invalid",
    };
  }

  const expectedSignature = signEncodedPayload(encodedPayload);

  const signatureMatches =
    expectedSignature.length === encodedSignature.length &&
    timingSafeEqual(
      Buffer.from(expectedSignature, "utf8"),
      Buffer.from(encodedSignature, "utf8"),
    );

  if (!signatureMatches) {
    return {
      ok: false,
      reason: "invalid",
    };
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload).toString("utf8")) as T;

    if (
      !payload ||
      typeof payload !== "object" ||
      typeof payload.exp !== "number" ||
      typeof payload.kind !== "string" ||
      typeof payload.profileId !== "string" ||
      typeof payload.clientId !== "string"
    ) {
      return {
        ok: false,
        reason: "invalid",
      };
    }

    if (payload.exp <= getNowInSeconds()) {
      return {
        ok: false,
        reason: "expired",
      };
    }

    return {
      ok: true,
      payload,
    };
  } catch {
    return {
      ok: false,
      reason: "invalid",
    };
  }
}

function getConfiguredAlexaClientId(): string {
  return process.env.ALEXA_CLIENT_ID?.trim() ?? "";
}

function getConfiguredAlexaClientSecret(): string {
  return process.env.ALEXA_CLIENT_SECRET?.trim() ?? "";
}

export function isAlexaSkillEnabled(): boolean {
  return process.env.ALEXA_SKILL_ENABLED?.trim().toLowerCase() === "true";
}

export function getAlexaOauthClientConfig(): {
  clientId: string;
  clientSecret: string;
} {
  const clientId = getConfiguredAlexaClientId();
  const clientSecret = getConfiguredAlexaClientSecret();

  if (!clientId || !clientSecret) {
    throw new Error(
      "ALEXA_CLIENT_ID and ALEXA_CLIENT_SECRET are required for Alexa account linking.",
    );
  }

  return {
    clientId,
    clientSecret,
  };
}

export function getAlexaPublicSetupConfig(): {
  enabled: boolean;
  baseUrl: string;
  clientId: string;
  authorizationUrl: string;
  tokenUrl: string;
  smartHomeUrl: string;
  usesPkce: boolean;
} {
  const baseUrl = process.env.PUBLIC_APP_BASE_URL?.trim() ?? "";
  const clientId = getConfiguredAlexaClientId();

  return {
    enabled: isAlexaSkillEnabled(),
    baseUrl,
    clientId,
    authorizationUrl: baseUrl
      ? `${baseUrl}/api/integrations/alexa/authorize`
      : "",
    tokenUrl: baseUrl ? `${baseUrl}/api/integrations/alexa/token` : "",
    smartHomeUrl: baseUrl
      ? `${baseUrl}/api/integrations/alexa/smart-home`
      : "",
    usesPkce: true,
  };
}

export function isAllowedAlexaRedirectUri(redirectUri: string): boolean {
  try {
    const parsed = new URL(redirectUri);

    if (parsed.protocol !== "https:") {
      return false;
    }

    const configuredHosts = (process.env.ALEXA_ALLOWED_REDIRECT_HOSTS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

    if (configuredHosts.length === 0) {
      return true;
    }

    return configuredHosts.includes(parsed.host.toLowerCase());
  } catch {
    return false;
  }
}

export function createAlexaAuthorizationCode(input: {
  profileId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge?: string | null;
  codeChallengeMethod?: string | null;
}): string {
  const now = getNowInSeconds();
  const codeChallengeMethod =
    input.codeChallengeMethod === "S256" || input.codeChallengeMethod === "plain"
      ? input.codeChallengeMethod
      : null;

  return sealPayload<AlexaAuthCodePayload>({
    kind: "auth_code",
    profileId: input.profileId,
    clientId: input.clientId,
    redirectUri: input.redirectUri,
    codeChallenge:
      typeof input.codeChallenge === "string" && input.codeChallenge.trim().length > 0
        ? input.codeChallenge.trim()
        : null,
    codeChallengeMethod,
    iat: now,
    exp: now + AUTH_CODE_TTL_SECONDS,
    jti: randomUUID(),
  });
}

export function validateAlexaAuthorizationCode(
  token: string,
): AlexaTokenValidationResult<AlexaAuthCodePayload> {
  const result = unsealPayload<AlexaAuthCodePayload>(token);

  if (!result.ok) {
    return result;
  }

  return result.payload.kind === "auth_code"
    ? result
    : {
        ok: false,
        reason: "invalid",
      };
}

export function createAlexaAccessToken(input: {
  profileId: string;
  clientId: string;
}): {
  accessToken: string;
  expiresIn: number;
} {
  const now = getNowInSeconds();
  return {
    accessToken: sealPayload<AlexaAccessTokenPayload>({
      kind: "access_token",
      profileId: input.profileId,
      clientId: input.clientId,
      iat: now,
      exp: now + ACCESS_TOKEN_TTL_SECONDS,
      jti: randomUUID(),
    }),
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
}

export function createAlexaRefreshToken(input: {
  profileId: string;
  clientId: string;
}): string {
  const now = getNowInSeconds();
  return sealPayload<AlexaRefreshTokenPayload>({
    kind: "refresh_token",
    profileId: input.profileId,
    clientId: input.clientId,
    iat: now,
    exp: now + REFRESH_TOKEN_TTL_SECONDS,
    jti: randomUUID(),
  });
}

export function validateAlexaAccessToken(
  token: string,
): AlexaTokenValidationResult<AlexaAccessTokenPayload> {
  const result = unsealPayload<AlexaAccessTokenPayload>(token);

  if (!result.ok) {
    return result;
  }

  return result.payload.kind === "access_token"
    ? result
    : {
        ok: false,
        reason: "invalid",
      };
}

export function validateAlexaRefreshToken(
  token: string,
): AlexaTokenValidationResult<AlexaRefreshTokenPayload> {
  const result = unsealPayload<AlexaRefreshTokenPayload>(token);

  if (!result.ok) {
    return result;
  }

  return result.payload.kind === "refresh_token"
    ? result
    : {
        ok: false,
        reason: "invalid",
      };
}

export function verifyAlexaPkce(input: {
  codeChallenge: string | null;
  codeChallengeMethod: AlexaPkceMethod | null;
  codeVerifier?: string | null;
}): boolean {
  if (!input.codeChallenge) {
    return true;
  }

  const codeVerifier =
    typeof input.codeVerifier === "string" ? input.codeVerifier.trim() : "";

  if (!codeVerifier) {
    return false;
  }

  if (input.codeChallengeMethod === "plain") {
    return codeVerifier === input.codeChallenge;
  }

  const hashedVerifier = createHash("sha256").update(codeVerifier).digest();
  return toBase64Url(hashedVerifier) === input.codeChallenge;
}

export function parseAlexaClientCredentials(request: Request): {
  clientId: string;
  clientSecret: string;
} {
  const authorizationHeader = request.headers.get("authorization")?.trim() ?? "";

  if (authorizationHeader.toLowerCase().startsWith("basic ")) {
    try {
      const rawCredentials = Buffer.from(
        authorizationHeader.slice("basic ".length),
        "base64",
      ).toString("utf8");
      const separatorIndex = rawCredentials.indexOf(":");

      if (separatorIndex >= 0) {
        return {
          clientId: rawCredentials.slice(0, separatorIndex),
          clientSecret: rawCredentials.slice(separatorIndex + 1),
        };
      }
    } catch {
      return {
        clientId: "",
        clientSecret: "",
      };
    }
  }

  return {
    clientId: "",
    clientSecret: "",
  };
}

export function validateConfiguredAlexaClient(input: {
  clientId: string;
  clientSecret: string;
}): boolean {
  const configured = getAlexaOauthClientConfig();
  return (
    input.clientId.trim() === configured.clientId &&
    input.clientSecret.trim() === configured.clientSecret
  );
}

export async function markAlexaIntegrationLinked(profileId: string): Promise<void> {
  const db = getDb();

  if (!isDatabaseConfigured() || !db) {
    return;
  }

  await db.voiceIntegrationAccount.upsert({
    where: {
      profileId_provider: {
        profileId,
        provider: "alexa",
      },
    },
    update: {
      status: "linked",
      linkedAt: new Date(),
      revokedAt: null,
    },
    create: {
      profileId,
      provider: "alexa",
      status: "linked",
      linkedAt: new Date(),
      revokedAt: null,
    },
  });
}

export async function getAlexaLinkedProfile(profileId: string): Promise<{
  exists: boolean;
  linked: boolean;
}> {
  const db = getDb();

  if (!isDatabaseConfigured() || !db) {
    return {
      exists: false,
      linked: false,
    };
  }

  const profile = (await db.userProfile.findUnique({
    where: {
      id: profileId,
    },
    select: {
      id: true,
      voiceIntegrations: {
        where: {
          provider: "alexa",
        },
        select: {
          status: true,
        },
        take: 1,
      },
    },
  })) as (EncodedProfileRecord & { voiceIntegrations: Array<{ status: string }> }) | null;

  return {
    exists: Boolean(profile),
    linked: profile?.voiceIntegrations[0]?.status === "linked",
  };
}

export async function getAlexaAuthorizedProfile(profileId: string): Promise<{
  exists: boolean;
  linked: boolean;
  isAdmin: boolean;
  displayName: string | null;
  email: string | null;
}> {
  const db = getDb();

  if (!isDatabaseConfigured() || !db) {
    return {
      exists: false,
      linked: false,
      isAdmin: false,
      displayName: null,
      email: null,
    };
  }

  const profile = await db.userProfile.findUnique({
    where: {
      id: profileId,
    },
    select: {
      id: true,
      displayName: true,
      email: true,
      user: {
        select: {
          role: true,
        },
      },
      voiceIntegrations: {
        where: {
          provider: "alexa",
        },
        select: {
          status: true,
        },
        take: 1,
      },
    },
  });

  return {
    exists: Boolean(profile),
    linked: profile?.voiceIntegrations[0]?.status === "linked",
    isAdmin: profile?.user?.role === "admin",
    displayName: profile?.displayName ?? null,
    email: profile?.email ?? null,
  };
}
