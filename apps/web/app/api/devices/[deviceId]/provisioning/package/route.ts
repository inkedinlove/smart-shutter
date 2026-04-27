import { requireAdminActor, AdminAuthorizationError } from "@/lib/admin";
import { apiError } from "@/lib/api-response";
import { getRegisteredDeviceById } from "@/lib/device-registry";
import { getMqttConfig, getPublicMqttConfig } from "@/lib/mqtt";
import { createProvisioningSession } from "@/lib/provisioning-sessions";
import {
  buildProvisionedConfig,
  buildProvisioningPackageFileName,
  normalizeProvisioningWifiInput,
} from "@/lib/provisioning";
import { buildProvisioningPackage } from "@/lib/provisioning-package";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

type ProvisioningBody = {
  wifiMode?: unknown;
  wifiSsid?: unknown;
  wifiPassword?: unknown;
};

function isProvisioningBody(value: unknown): value is ProvisioningBody {
  return typeof value === "object" && value !== null;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const adminActor = await requireAdminActor(request);

    const { deviceId } = await context.params;
    const device = await getRegisteredDeviceById(deviceId);

    if (!device) {
      return apiError(`Unknown deviceId: ${deviceId}`, 404);
    }

    const body = (await request.json()) as unknown;

    if (!isProvisioningBody(body)) {
      return apiError("Invalid provisioning request body.", 400);
    }

    const wifiInput = normalizeProvisioningWifiInput(body);
    const mqttConfig = getMqttConfig();
    const publicMqttConfig = getPublicMqttConfig();
    const configText = buildProvisionedConfig({
      board: device.board,
      deviceId: device.deviceId,
      commandTopic: device.commandTopic,
      statusTopic: device.statusTopic,
      mqttHost: mqttConfig.host,
      mqttPort: mqttConfig.port,
      mqttUsername: mqttConfig.username,
      mqttPassword: mqttConfig.password,
      publicAppBaseUrl: publicMqttConfig.publicAppBaseUrl,
      wifiMode: wifiInput.wifiMode,
      wifiSsid: wifiInput.wifiSsid,
      wifiPassword: wifiInput.wifiPassword,
    });
    const packageFileName = buildProvisioningPackageFileName(
      device.deviceId,
      device.board,
    );
    const provisioningSession = await createProvisioningSession({
      deviceId: device.deviceId,
      artifactType: "package",
      board: device.board,
      fileName: packageFileName,
      wifiMode: wifiInput.wifiMode,
      wifiSsid: wifiInput.wifiSsid,
      createdByUserId: adminActor.userId,
      createdByProfileId: adminActor.profileId,
    });
    const packageResult = await buildProvisioningPackage({
      configText,
      device,
      provisioningCode: provisioningSession?.pairingCode ?? null,
      wifiMode: wifiInput.wifiMode,
      wifiSsid: wifiInput.wifiSsid,
    });
    const packageBytes = new Uint8Array(packageResult.buffer.byteLength);
    packageBytes.set(packageResult.buffer);
    const packageBlob = new Blob([packageBytes], {
      type: "application/zip",
    });

    return new Response(packageBlob, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${packageResult.fileName}"`,
        "Content-Type": "application/zip",
        ...(provisioningSession
          ? {
              "X-SmartShutter-Provisioning-Code": provisioningSession.pairingCode,
            }
          : {}),
      },
    });
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return apiError(error.message, error.statusCode);
    }

    if (error instanceof Error) {
      return apiError(error.message, 400);
    }

    console.error("Unable to generate provisioning package.");
    return apiError("Unable to generate provisioning package.", 500);
  }
}
