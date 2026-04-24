import { NextResponse } from "next/server";

import { getRegisteredDeviceById } from "@/lib/device-registry";
import {
  createFirmwareManifestResponse,
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
    console.error("Firmware manifest live status lookup failed:", error);
    return null;
  });

  if (liveStatus?.firmwareVersion) {
    await persistReportedFirmwareVersion(liveStatus);
  }

  const manifest = await createFirmwareManifestResponse(device, {
    currentVersion: liveStatus?.firmwareVersion ?? device.firmwareVersion ?? null,
  });

  void recordDeviceUpdateEvent({
    deviceId: device.deviceId,
    firmwareVersionFrom: manifest.currentVersion,
    firmwareVersionTo: manifest.latestVersion ?? "unknown",
    status: "manifest_requested",
    detail: [
      `current=${manifest.currentVersion ?? "unknown"}`,
      `latest=${manifest.latestVersion ?? "none"}`,
      `updateAvailable=${manifest.updateAvailable ? "true" : "false"}`,
    ].join(", "),
  }).catch((error) => {
    console.error("Unable to record firmware manifest event:", error);
  });

  return NextResponse.json(manifest, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
