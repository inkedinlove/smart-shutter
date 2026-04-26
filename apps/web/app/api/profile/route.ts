import { AccessControlError, listAccessibleDevices } from "@/lib/access-control";
import { apiError, apiOk } from "@/lib/api-response";
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

    return apiOk(
      {
        profile: context.profile,
        devices,
        voiceIntegrations,
        alexaSetup: getAlexaPublicSetupConfig(),
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
