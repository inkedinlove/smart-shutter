import { NextResponse } from "next/server";

import { getRegisteredDeviceById } from "@/lib/device-registry";
import {
  createFirmwareCheckResponse,
  recordDeviceUpdateEvent,
} from "@/lib/firmware-releases";
import {
  persistReportedFirmwareVersion,
  readLatestDeviceStatus,
} from "@/lib/live-device-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { deviceId } = await context.params;
  const device = await getRegisteredDeviceById(deviceId);

  if (!device) {
    return NextResponse.json(
      { ok: false, error: `Unknown deviceId: ${deviceId}` },
      { status: 404 },
    );
  }

  const liveStatus = await readLatestDeviceStatus(device).catch((error) => {
    console.error("Firmware check live status lookup failed:", error);
    return null;
  });

  if (liveStatus?.firmwareVersion) {
    await persistReportedFirmwareVersion(liveStatus);
  }

  const result = await createFirmwareCheckResponse(device, {
    currentVersion: liveStatus?.firmwareVersion ?? device.firmwareVersion ?? null,
  });

  void recordDeviceUpdateEvent({
    deviceId: device.deviceId,
    firmwareVersionFrom: result.currentVersion,
    firmwareVersionTo: result.latestVersion ?? "unknown",
    status: result.updateAvailable ? "update_available" : "update_not_available",
    detail: [
      `current=${result.currentVersion ?? "unknown"}`,
      `latest=${result.latestVersion ?? "none"}`,
      `updateAvailable=${result.updateAvailable ? "true" : "false"}`,
    ].join(", "),
  }).catch((error) => {
    console.error("Unable to record firmware availability event:", error);
  });

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
