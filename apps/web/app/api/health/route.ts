import { NextResponse } from "next/server";

import { getDb, isDatabaseConfigured } from "@/lib/db";
import { listAvailableDevices } from "@/lib/device-registry";
import { getLatestFirmwareRelease } from "@/lib/firmware-releases";
import { isMqttConfigured } from "@/lib/mqtt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DatabaseMode = "disabled" | "configured" | "fallback";

async function getDatabaseMode(): Promise<DatabaseMode> {
  if (!isDatabaseConfigured()) {
    return "disabled";
  }

  const db = getDb();

  if (!db) {
    return "fallback";
  }

  try {
    await db.$queryRaw`SELECT 1`;
    return "configured";
  } catch (error) {
    console.error("Health check database probe failed:", error);
    return "fallback";
  }
}

export async function GET() {
  const [databaseMode, devices, latestRelease] = await Promise.all([
    getDatabaseMode(),
    listAvailableDevices().catch((error) => {
      console.error("Health check device registry lookup failed:", error);
      return [];
    }),
    getLatestFirmwareRelease().catch((error) => {
      console.error("Health check firmware release lookup failed:", error);
      return null;
    }),
  ]);

  return NextResponse.json(
    {
      mqttConfigured: isMqttConfigured(),
      databaseMode,
      deviceRegistryAvailable: devices.length > 0,
      firmwareReleaseConfigured: Boolean(latestRelease),
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
