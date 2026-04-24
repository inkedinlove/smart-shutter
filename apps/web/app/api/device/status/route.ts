import { NextResponse } from "next/server";

import {
  getDefaultRegisteredDevice,
  getRegisteredDeviceById,
} from "@/lib/device-registry";
import { createDefaultDeviceStatus } from "@/lib/device";
import { getDeviceStatusSnapshot } from "@/lib/live-device-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const defaultDevice = await getDefaultRegisteredDevice();
  const requestedDeviceId =
    url.searchParams.get("deviceId")?.trim() || defaultDevice.deviceId;
  const device = await getRegisteredDeviceById(requestedDeviceId);

  if (!device) {
    return NextResponse.json(
      { ok: false, error: `Unknown deviceId: ${requestedDeviceId}` },
      { status: 404 },
    );
  }

  try {
    const status = await getDeviceStatusSnapshot(device);

    return NextResponse.json(status, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("MQTT status lookup failed:", error);

    return NextResponse.json(createDefaultDeviceStatus(device.deviceId), {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }
}
