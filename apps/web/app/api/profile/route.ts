import { AccessControlError, listAccessibleDevices } from "@/lib/access-control";
import { apiError, apiOk } from "@/lib/api-response";
import { getAuthActivitySummaryForUser } from "@/lib/auth-insights";
import { getAlexaPublicSetupConfig } from "@/lib/integrations/alexa-oauth";
import { getVoiceIntegrationsForProfile } from "@/lib/profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { context, devices } = await listAccessibleDevices();
    const voiceIntegrations = await getVoiceIntegrationsForProfile(
      context.profile.profileId,
    );
    const userId =
      typeof context.session?.user?.id === "string" ? context.session.user.id : "";
    const authActivity = await getAuthActivitySummaryForUser(userId);

    return apiOk(
      {
        profile: context.profile,
        devices,
        voiceIntegrations,
        alexaSetup: getAlexaPublicSetupConfig(),
        authActivity,
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

    console.error("Unable to load customer profile:", error);

    return apiError("Unable to load the current profile.", 500);
  }
}
