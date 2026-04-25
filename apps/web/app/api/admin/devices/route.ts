import { requireAdminAccess, AdminAuthorizationError } from "@/lib/admin";
import { apiError, apiOk } from "@/lib/api-response";
import { listDeviceRegistrationStates } from "@/lib/device-registration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdminAccess(request);
    const devices = await listDeviceRegistrationStates();

    return apiOk(
      {
        devices,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return apiError(error.message, error.statusCode);
    }

    console.error("Unable to load admin device list:", error);
    return apiError("Unable to load registered devices.", 500);
  }
}
