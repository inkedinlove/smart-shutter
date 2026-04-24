import { NextResponse } from "next/server";

import {
  getDefaultRegisteredDeviceId,
  listAvailableDevices,
} from "@/lib/device-registry";

export const runtime = "nodejs";

export async function GET() {
  const [defaultDeviceId, devices] = await Promise.all([
    getDefaultRegisteredDeviceId(),
    listAvailableDevices(),
  ]);

  return NextResponse.json(
    {
      defaultDeviceId,
      devices,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
