import { NextResponse } from "next/server";

import { getRegisteredDeviceById } from "@/lib/device-registry";
import { createProvisioningData } from "@/lib/devices";
import { getPublicMqttConfig } from "@/lib/mqtt";

export const runtime = "nodejs";

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

  return NextResponse.json(createProvisioningData(device, getPublicMqttConfig()), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
