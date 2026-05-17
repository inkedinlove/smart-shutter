import { randomUUID } from "node:crypto";

import { AccessControlError, getAuthorizedDevice } from "@/lib/access-control";
import { requireAdminAccess, AdminAuthorizationError } from "@/lib/admin";
import { apiError, apiOk } from "@/lib/api-response";
import {
  closeMqttClient,
  connectMqttClient,
  createMqttClient,
  publishMqttMessage,
} from "@/lib/mqtt";
import type { MqttClient } from "mqtt";
import {
  assertRateLimit,
  buildRateLimitKey,
  getRequestIpAddress,
  RateLimitError,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  let mqttClient: MqttClient | null = null;

  try {
    await requireAdminAccess(request);

    const { deviceId } = await context.params;
    const { device } = await getAuthorizedDevice(deviceId);

    assertRateLimit({
      bucket: "admin-serial-monitor-snapshot",
      key: buildRateLimitKey(getRequestIpAddress(request), device.deviceId),
      limit: 12,
      windowMs: 60_000,
      message:
        "Too many serial snapshot requests were sent to this device. Wait a moment, then try again.",
    });

    mqttClient = createMqttClient(`${device.deviceId}-serial-snapshot`);
    await connectMqttClient(mqttClient);

    await publishMqttMessage(
      mqttClient,
      device.commandTopic,
      JSON.stringify({
        deviceId: device.deviceId,
        commandId: randomUUID(),
        type: "PUBLISH_LOG_SNAPSHOT",
        issuedAt: new Date().toISOString(),
        source: "admin-serial-monitor",
      }),
      {
        qos: 1,
      },
    );

    return apiOk(
      {
        requested: true,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return apiError(error.message, error.statusCode);
    }

    if (error instanceof AccessControlError) {
      return apiError(error.message, error.statusCode);
    }

    if (error instanceof RateLimitError) {
      return apiError(error.message, error.statusCode, {
        headers: {
          "Retry-After": String(error.retryAfterSeconds),
        },
      });
    }

    console.error("Unable to request a remote serial snapshot:", error);
    return apiError("Unable to request a remote serial snapshot right now.", 503);
  } finally {
    if (mqttClient) {
      await closeMqttClient(mqttClient);
    }
  }
}
