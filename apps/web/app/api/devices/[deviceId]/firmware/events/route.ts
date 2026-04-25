import { AccessControlError, getAuthorizedDevice } from "@/lib/access-control";
import { apiError, apiOk } from "@/lib/api-response";
import { recordDeviceUpdateEvent } from "@/lib/firmware-releases";
import { isDeviceUpdateEventStatus } from "@/lib/firmware";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

function sanitizeDetail(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedDetail = value.trim();
  return normalizedDetail.length > 0 ? normalizedDetail : null;
}

export async function POST(request: Request, context: RouteContext) {
  const { deviceId } = await context.params;
  let device;

  try {
    ({ device } = await getAuthorizedDevice(deviceId));
  } catch (error) {
    if (error instanceof AccessControlError) {
      return apiError(error.message, error.statusCode);
    }

    return apiError("Unable to authorize device access.", 500);
  }

  let parsedBody: unknown;

  try {
    parsedBody = await request.json();
  } catch {
    return apiError("Request body must be valid JSON.", 400);
  }

  const status = (parsedBody as { status?: unknown })?.status;

  if (!isDeviceUpdateEventStatus(status)) {
    return apiError(
      "The `status` field must be one of `check_started`, `manifest_requested`, `update_available`, `update_not_available`, `update_blocked_motor_moving`, `update_blocked_ota_disabled`, `update_started`, `update_success`, or `update_failed`.",
      400,
    );
  }

  const firmwareVersionFrom = (parsedBody as { firmwareVersionFrom?: unknown })
    ?.firmwareVersionFrom;
  const firmwareVersionTo = (parsedBody as { firmwareVersionTo?: unknown })
    ?.firmwareVersionTo;

  if (
    typeof firmwareVersionTo !== "string" ||
    firmwareVersionTo.trim().length === 0
  ) {
    return apiError("The `firmwareVersionTo` field is required.", 400);
  }

  const normalizedVersionFrom =
    typeof firmwareVersionFrom === "string" && firmwareVersionFrom.trim().length > 0
      ? firmwareVersionFrom.trim()
      : null;

  try {
    const createdEvent = await recordDeviceUpdateEvent({
      deviceId: device.deviceId,
      firmwareVersionFrom: normalizedVersionFrom,
      firmwareVersionTo: firmwareVersionTo.trim(),
      status,
      detail: sanitizeDetail((parsedBody as { detail?: unknown })?.detail),
    });

    return apiOk(
      {
        stored: createdEvent !== null,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("Unable to record firmware event:", error);

    return apiError("Unable to record the firmware event right now.", 503);
  }
}
