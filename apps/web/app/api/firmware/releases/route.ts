import { NextResponse } from "next/server";

import {
  AdminAuthorizationError,
  requireAdminToken,
} from "@/lib/admin";
import {
  createFirmwareRelease,
  FirmwareReleaseError,
  listFirmwareReleases,
} from "@/lib/firmware-releases";
import type { FirmwareReleaseInput } from "@/lib/firmware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const includeInactive = url.searchParams.get("scope") === "all";
  const releases = await listFirmwareReleases({ includeInactive });

  return NextResponse.json(
    { releases },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function POST(request: Request) {
  try {
    requireAdminToken(request);
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.statusCode },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Unable to authorize firmware release publishing." },
      { status: 503 },
    );
  }

  let parsedBody: FirmwareReleaseInput;

  try {
    parsedBody = (await request.json()) as FirmwareReleaseInput;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  try {
    const release = await createFirmwareRelease(parsedBody);

    return NextResponse.json(
      {
        ok: true,
        release,
      },
      {
        status: 201,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    if (error instanceof FirmwareReleaseError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.statusCode },
      );
    }

    console.error("Unable to create firmware release:", error);

    return NextResponse.json(
      { ok: false, error: "Unable to create the firmware release right now." },
      { status: 503 },
    );
  }
}
