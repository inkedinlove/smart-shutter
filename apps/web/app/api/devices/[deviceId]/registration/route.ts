import { AccessControlError, getAccessContext } from "@/lib/access-control";
import { apiError, apiOk } from "@/lib/api-response";
import { getDeviceRegistrationState } from "@/lib/device-registration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ deviceId: string }> },
) {
  try {
    const accessContext = await getAccessContext();
    const { deviceId } = await context.params;
    const registration = await getDeviceRegistrationState(deviceId, {
      currentProfileId: accessContext.profile.profileId,
    });

    return apiOk(registration, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AccessControlError) {
      return apiError(error.message, error.statusCode);
    }

    console.error("Unable to load device registration state:", error);
    return apiError("Unable to load device registration state.", 500);
  }
}
