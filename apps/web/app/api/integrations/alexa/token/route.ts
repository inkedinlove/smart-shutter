import { NextResponse } from "next/server";

import {
  createAlexaAccessToken,
  createAlexaRefreshToken,
  getAlexaAuthorizedProfile,
  getAlexaOauthClientConfig,
  isAlexaSkillEnabled,
  markAlexaIntegrationLinked,
  parseAlexaClientCredentials,
  validateAlexaAuthorizationCode,
  validateAlexaRefreshToken,
  validateConfiguredAlexaClient,
  verifyAlexaPkce,
} from "@/lib/integrations/alexa-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function createOauthJsonResponse(
  body: Record<string, unknown>,
  status = 200,
  extraHeaders?: HeadersInit,
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      Pragma: "no-cache",
      ...extraHeaders,
    },
  });
}

function createOauthErrorResponse(
  error: string,
  description: string,
  status = 400,
  extraHeaders?: HeadersInit,
): NextResponse {
  return createOauthJsonResponse(
    {
      error,
      error_description: description,
    },
    status,
    extraHeaders,
  );
}

export async function POST(request: Request) {
  if (!isAlexaSkillEnabled()) {
    return createOauthErrorResponse(
      "temporarily_unavailable",
      "Alexa account linking is disabled for this deployment.",
      503,
    );
  }

  try {
    getAlexaOauthClientConfig();
  } catch (error) {
    return createOauthErrorResponse(
      "server_error",
      error instanceof Error ? error.message : "Alexa OAuth is not configured.",
      503,
    );
  }

  const body = new URLSearchParams(await request.text());
  const basicCredentials = parseAlexaClientCredentials(request);
  const clientId =
    basicCredentials.clientId.trim() || body.get("client_id")?.trim() || "";
  const clientSecret =
    basicCredentials.clientSecret.trim() ||
    body.get("client_secret")?.trim() ||
    "";
  const grantType = body.get("grant_type")?.trim() ?? "";

  if (!validateConfiguredAlexaClient({ clientId, clientSecret })) {
    return createOauthErrorResponse(
      "invalid_client",
      "The Alexa client credentials were invalid.",
      401,
      {
        "WWW-Authenticate": 'Basic realm="Smart Shutter Alexa OAuth"',
      },
    );
  }

  if (grantType === "authorization_code") {
    const code = body.get("code")?.trim() ?? "";
    const redirectUri = body.get("redirect_uri")?.trim() ?? "";
    const codeVerifier = body.get("code_verifier")?.trim() ?? "";

    if (!code || !redirectUri) {
      return createOauthErrorResponse(
        "invalid_request",
        "The code and redirect_uri fields are required.",
      );
    }

    const validation = validateAlexaAuthorizationCode(code);

    if (!validation.ok) {
      return createOauthErrorResponse(
        "invalid_grant",
        validation.reason === "expired"
          ? "The Alexa authorization code expired."
          : "The Alexa authorization code was invalid.",
      );
    }

    if (validation.payload.clientId !== clientId) {
      return createOauthErrorResponse(
        "invalid_grant",
        "The Alexa authorization code was issued for a different client.",
      );
    }

    if (validation.payload.redirectUri !== redirectUri) {
      return createOauthErrorResponse(
        "invalid_grant",
        "The redirect_uri did not match the original Alexa authorization request.",
      );
    }

    if (
      !verifyAlexaPkce({
        codeChallenge: validation.payload.codeChallenge,
        codeChallengeMethod: validation.payload.codeChallengeMethod,
        codeVerifier,
      })
    ) {
      return createOauthErrorResponse(
        "invalid_grant",
        "The Alexa PKCE verifier was invalid.",
      );
    }

    const linkedProfile = await getAlexaAuthorizedProfile(validation.payload.profileId);

    if (!linkedProfile.exists) {
      return createOauthErrorResponse(
        "invalid_grant",
        "The linked Smart Shutter account no longer exists.",
      );
    }

    await markAlexaIntegrationLinked(validation.payload.profileId);

    const { accessToken, expiresIn } = createAlexaAccessToken({
      profileId: validation.payload.profileId,
      clientId,
    });
    const refreshToken = createAlexaRefreshToken({
      profileId: validation.payload.profileId,
      clientId,
    });

    return createOauthJsonResponse({
      access_token: accessToken,
      token_type: "bearer",
      expires_in: expiresIn,
      refresh_token: refreshToken,
    });
  }

  if (grantType === "refresh_token") {
    const refreshToken = body.get("refresh_token")?.trim() ?? "";

    if (!refreshToken) {
      return createOauthErrorResponse(
        "invalid_request",
        "The refresh_token field is required.",
      );
    }

    const validation = validateAlexaRefreshToken(refreshToken);

    if (!validation.ok) {
      return createOauthErrorResponse(
        "invalid_grant",
        validation.reason === "expired"
          ? "The Alexa refresh token expired."
          : "The Alexa refresh token was invalid.",
      );
    }

    if (validation.payload.clientId !== clientId) {
      return createOauthErrorResponse(
        "invalid_grant",
        "The Alexa refresh token was issued for a different client.",
      );
    }

    const linkedProfile = await getAlexaAuthorizedProfile(validation.payload.profileId);

    if (!linkedProfile.exists || !linkedProfile.linked) {
      return createOauthErrorResponse(
        "invalid_grant",
        "The linked Smart Shutter account is no longer available for Alexa access.",
      );
    }

    const { accessToken, expiresIn } = createAlexaAccessToken({
      profileId: validation.payload.profileId,
      clientId,
    });
    const nextRefreshToken = createAlexaRefreshToken({
      profileId: validation.payload.profileId,
      clientId,
    });

    return createOauthJsonResponse({
      access_token: accessToken,
      token_type: "bearer",
      expires_in: expiresIn,
      refresh_token: nextRefreshToken,
    });
  }

  return createOauthErrorResponse(
    "unsupported_grant_type",
    "Smart Shutter Alexa OAuth supports authorization_code and refresh_token grants only.",
  );
}
