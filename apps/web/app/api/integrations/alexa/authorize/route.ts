import { NextResponse } from "next/server";

import { getAuthSession } from "@/lib/auth";
import {
  createAlexaAuthorizationCode,
  getAlexaOauthClientConfig,
  isAlexaSkillEnabled,
  isAllowedAlexaRedirectUri,
} from "@/lib/integrations/alexa-oauth";
import { getUserProfileByUserId } from "@/lib/user-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function createTextResponse(message: string, status = 400): NextResponse {
  return new NextResponse(message, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

function redirectWithOauthError(input: {
  redirectUri: string;
  state: string;
  error: string;
  description: string;
}): NextResponse {
  const redirectUrl = new URL(input.redirectUri);
  redirectUrl.searchParams.set("error", input.error);
  redirectUrl.searchParams.set("error_description", input.description);

  if (input.state) {
    redirectUrl.searchParams.set("state", input.state);
  }

  return NextResponse.redirect(redirectUrl, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: Request) {
  if (!isAlexaSkillEnabled()) {
    return createTextResponse("Alexa account linking is disabled.", 503);
  }

  let clientConfig;

  try {
    clientConfig = getAlexaOauthClientConfig();
  } catch (error) {
    return createTextResponse(
      error instanceof Error ? error.message : "Alexa OAuth is not configured.",
      503,
    );
  }

  const url = new URL(request.url);
  const responseType = url.searchParams.get("response_type")?.trim() ?? "";
  const clientId = url.searchParams.get("client_id")?.trim() ?? "";
  const redirectUri = url.searchParams.get("redirect_uri")?.trim() ?? "";
  const state = url.searchParams.get("state")?.trim() ?? "";
  const codeChallenge = url.searchParams.get("code_challenge")?.trim() ?? "";
  const codeChallengeMethod =
    url.searchParams.get("code_challenge_method")?.trim() ?? "";

  if (responseType !== "code") {
    if (redirectUri && isAllowedAlexaRedirectUri(redirectUri)) {
      return redirectWithOauthError({
        redirectUri,
        state,
        error: "unsupported_response_type",
        description: "Only the authorization code grant is supported.",
      });
    }

    return createTextResponse("Alexa requires response_type=code.", 400);
  }

  if (!redirectUri || !isAllowedAlexaRedirectUri(redirectUri)) {
    return createTextResponse("The Alexa redirect_uri is missing or invalid.", 400);
  }

  if (clientId !== clientConfig.clientId) {
    return redirectWithOauthError({
      redirectUri,
      state,
      error: "unauthorized_client",
      description: "The Alexa client_id did not match this Smart Shutter deployment.",
    });
  }

  const session = await getAuthSession();
  const userId = typeof session?.user?.id === "string" ? session.user.id.trim() : "";

  if (!userId) {
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("callbackUrl", url.toString());
    return NextResponse.redirect(loginUrl, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }

  const profile = await getUserProfileByUserId(userId);

  if (!profile) {
    return redirectWithOauthError({
      redirectUri,
      state,
      error: "access_denied",
      description: "A Smart Shutter customer profile is required before linking Alexa.",
    });
  }

  const code = createAlexaAuthorizationCode({
    profileId: profile.profileId,
    clientId,
    redirectUri,
    codeChallenge: codeChallenge || null,
    codeChallengeMethod: codeChallengeMethod || null,
  });

  const redirectUrl = new URL(redirectUri);
  redirectUrl.searchParams.set("code", code);

  if (state) {
    redirectUrl.searchParams.set("state", state);
  }

  return NextResponse.redirect(redirectUrl, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
