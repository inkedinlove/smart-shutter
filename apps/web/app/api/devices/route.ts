import {
  AccessControlError,
  getDefaultAccessibleDeviceId,
  listAccessibleDevices,
} from "@/lib/access-control";
import { apiError, apiOk } from "@/lib/api-response";

export const runtime = "nodejs";

export async function GET() {
  try {
    const [{ context, devices }, defaultDeviceId] = await Promise.all([
      listAccessibleDevices(),
      getDefaultAccessibleDeviceId(),
    ]);

    return apiOk(
      {
        profile: {
          profileId: context.profile.profileId,
          displayName: context.profile.displayName,
          email: context.profile.email,
        },
        defaultDeviceId,
        devices,
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

    console.error("Unable to load accessible devices:", error);

    return apiError("Unable to load devices.", 500);
  }
}
