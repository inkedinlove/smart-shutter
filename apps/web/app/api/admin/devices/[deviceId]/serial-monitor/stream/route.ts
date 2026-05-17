import { AccessControlError, getAuthorizedDevice } from "@/lib/access-control";
import { requireAdminAccess, AdminAuthorizationError } from "@/lib/admin";
import {
  buildDeviceRemoteLogTopic,
  parseDeviceRemoteLogMessage,
} from "@/lib/device-logs";
import {
  closeMqttClient,
  connectMqttClient,
  createMqttClient,
  subscribeToTopic,
} from "@/lib/mqtt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

function buildSseChunk(data: unknown, eventName?: string): string {
  const serializedData = JSON.stringify(data);

  if (eventName) {
    return `event: ${eventName}\ndata: ${serializedData}\n\n`;
  }

  return `data: ${serializedData}\n\n`;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    await requireAdminAccess(request);

    const { deviceId } = await context.params;
    const { device } = await getAuthorizedDevice(deviceId);
    const logTopic = buildDeviceRemoteLogTopic(device.statusTopic, device.deviceId);

    const client = createMqttClient(`${device.deviceId}-serial-monitor`);
    await connectMqttClient(client);
    await subscribeToTopic(client, logTopic, { qos: 0 });

    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

        const safeClose = () => {
          if (closed) {
            return;
          }

          closed = true;

          if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
          }

          client.off("message", onMessage);
          client.off("error", onError);
          client.off("close", onClose);
          request.signal.removeEventListener("abort", onAbort);

          void closeMqttClient(client);

          try {
            controller.close();
          } catch {
            // Ignore double-close races from disconnects and browser aborts.
          }
        };

        const enqueue = (data: unknown, eventName?: string) => {
          if (closed) {
            return;
          }

          controller.enqueue(encoder.encode(buildSseChunk(data, eventName)));
        };

        const onMessage = (receivedTopic: string, payload: Buffer) => {
          if (receivedTopic !== logTopic) {
            return;
          }

          const nextEntry = parseDeviceRemoteLogMessage(
            payload.toString("utf8"),
            device.deviceId,
          );

          if (!nextEntry) {
            return;
          }

          enqueue(nextEntry);
        };

        const onError = (error: Error) => {
          enqueue(
            {
              error:
                error.message || "The remote serial stream disconnected unexpectedly.",
            },
            "stream-error",
          );
          safeClose();
        };

        const onClose = () => {
          enqueue(
            {
              error: "The remote serial stream closed.",
            },
            "stream-error",
          );
          safeClose();
        };

        const onAbort = () => {
          safeClose();
        };

        client.on("message", onMessage);
        client.once("error", onError);
        client.once("close", onClose);
        request.signal.addEventListener("abort", onAbort, { once: true });

        heartbeatInterval = setInterval(() => {
          if (closed) {
            return;
          }

          controller.enqueue(encoder.encode(": ping\n\n"));
        }, 15_000);

        enqueue(
          {
            deviceId: device.deviceId,
            logTopic,
            connectedAt: new Date().toISOString(),
          },
          "ready",
        );
      },
      cancel() {
        void closeMqttClient(client);
      },
    });

    return new Response(stream, {
      headers: {
        "Cache-Control": "no-store",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return new Response(error.message, {
        status: error.statusCode,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }

    if (error instanceof AccessControlError) {
      return new Response(error.message, {
        status: error.statusCode,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }

    console.error("Unable to open admin serial monitor stream:", error);
    return new Response("Unable to open the remote serial stream right now.", {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }
}
