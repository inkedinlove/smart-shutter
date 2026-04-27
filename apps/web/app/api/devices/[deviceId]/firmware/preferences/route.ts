import { Prisma } from "@prisma/client";

import { AccessControlError, getAuthorizedDevice } from "@/lib/access-control";
import { apiError, apiOk } from "@/lib/api-response";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import type { FirmwareAutoUpdatePreference } from "@/lib/firmware";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

function normalizeAutoUpdateChannel(value: unknown): string {
  if (typeof value !== "string") {
    return "stable";
  }

  const normalizedValue = value.trim().toLowerCase();
  return normalizedValue.length > 0 ? normalizedValue : "stable";
}

function buildPreferencePayload(input: {
  deviceId: string;
  autoUpdateEnabled: boolean;
  autoUpdateChannel: string;
}): FirmwareAutoUpdatePreference {
  return {
    deviceId: input.deviceId,
    autoUpdateEnabled: input.autoUpdateEnabled,
    autoUpdateChannel: normalizeAutoUpdateChannel(input.autoUpdateChannel),
  };
}

export async function GET(_request: Request, context: RouteContext) {
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

  return apiOk(
    buildPreferencePayload({
      deviceId: device.deviceId,
      autoUpdateEnabled: device.otaAutoUpdateEnabled,
      autoUpdateChannel: device.otaAutoUpdateChannel,
    }),
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function PATCH(request: Request, context: RouteContext) {
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

  const db = getDb();

  if (!isDatabaseConfigured() || !db) {
    return apiError(
      "Database-backed device preferences are required for auto-update settings.",
      503,
    );
  }

  let parsedBody: unknown;

  try {
    parsedBody = await request.json();
  } catch {
    return apiError("Request body must be valid JSON.", 400);
  }

  const autoUpdateEnabled = (parsedBody as { autoUpdateEnabled?: unknown })
    ?.autoUpdateEnabled;

  if (typeof autoUpdateEnabled !== "boolean") {
    return apiError("The `autoUpdateEnabled` field must be a boolean.", 400);
  }

  const autoUpdateChannel = normalizeAutoUpdateChannel(
    (parsedBody as { autoUpdateChannel?: unknown })?.autoUpdateChannel,
  );

  try {
    const updatedDevice = await db.device.update({
      where: {
        deviceId: device.deviceId,
      },
      data: {
        otaAutoUpdateEnabled: autoUpdateEnabled,
        otaAutoUpdateChannel: autoUpdateChannel,
      },
      select: {
        deviceId: true,
        otaAutoUpdateEnabled: true,
        otaAutoUpdateChannel: true,
      },
    });

    return apiOk(
      buildPreferencePayload({
        deviceId: updatedDevice.deviceId,
        autoUpdateEnabled: updatedDevice.otaAutoUpdateEnabled,
        autoUpdateChannel: updatedDevice.otaAutoUpdateChannel,
      }),
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("Unable to save device auto-update preferences:", error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2021" || error.code === "P2022")
    ) {
      return apiError(
        "Auto-update preferences need the latest database migration. Run `npm run db:deploy`, redeploy, and try again.",
        503,
      );
    }

    return apiError("Unable to save auto-update preferences right now.", 503);
  }
}
