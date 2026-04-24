import "server-only";

import { randomUUID } from "node:crypto";

import mqtt, {
  type IClientPublishOptions,
  type IClientSubscribeOptions,
  type MqttClient,
} from "mqtt";

const DEFAULT_MQTT_PORT = 8883;
const CONNECT_TIMEOUT_MS = 1800;
const DEFAULT_PUBLIC_MQTT_HOST = "PASTE_HIVEMQ_HOST";

export type ServerMqttConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
};

export type PublicMqttConfig = {
  mqttHost: string;
  mqttPort: number;
  publicAppBaseUrl: string;
};

function requireEnv(name: keyof NodeJS.ProcessEnv): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required server configuration: ${name}`);
  }

  return value;
}

function hasNonEmptyValue(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function parseMqttPort(rawPort: string | undefined): number {
  const normalizedPort = rawPort ?? String(DEFAULT_MQTT_PORT);
  const port = Number(normalizedPort);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("Invalid server configuration: MQTT_PORT");
  }

  return port;
}

export function getMqttConfig(): ServerMqttConfig {
  const port = parseMqttPort(process.env.MQTT_PORT);

  return {
    host: requireEnv("MQTT_HOST"),
    port,
    username: requireEnv("MQTT_USERNAME"),
    password: requireEnv("MQTT_PASSWORD"),
  };
}

export function isMqttConfigured(): boolean {
  if (
    !hasNonEmptyValue(process.env.MQTT_HOST) ||
    !hasNonEmptyValue(process.env.MQTT_USERNAME) ||
    !hasNonEmptyValue(process.env.MQTT_PASSWORD)
  ) {
    return false;
  }

  try {
    parseMqttPort(process.env.MQTT_PORT);
    return true;
  } catch {
    return false;
  }
}

export function getPublicMqttConfig(): PublicMqttConfig {
  return {
    mqttHost: process.env.MQTT_HOST?.trim() || DEFAULT_PUBLIC_MQTT_HOST,
    mqttPort: parseMqttPort(process.env.MQTT_PORT),
    publicAppBaseUrl:
      process.env.PUBLIC_APP_BASE_URL?.trim() ||
      "https://your-app.example.com",
  };
}

function toMqttError(error: unknown, fallbackMessage: string): Error {
  if (error instanceof Error && error.message) {
    return error;
  }

  return new Error(fallbackMessage);
}

function createClientId(label: string): string {
  const safeLabel = label
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  return `smart-shutter-web-${safeLabel || "server"}-${randomUUID()}`;
}

export function createMqttClient(clientLabel = "server"): MqttClient {
  const config = getMqttConfig();

  const client = mqtt.connect(`mqtts://${config.host}:${config.port}`, {
    username: config.username,
    password: config.password,
    clientId: createClientId(clientLabel),
    clean: true,
    connectTimeout: CONNECT_TIMEOUT_MS,
    reconnectPeriod: 0,
    resubscribe: false,
    keepalive: 15,
  });

  // Avoid unhandled EventEmitter errors while route handlers also attach
  // request-scoped listeners for connect/publish/subscribe failures.
  client.on("error", () => undefined);

  return client;
}

export function connectMqttClient(client: MqttClient): Promise<void> {
  if (client.connected) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("MQTT connection timed out."));
    }, CONNECT_TIMEOUT_MS + 250);

    const onConnect = () => {
      cleanup();
      resolve();
    };

    const onError = (error: Error) => {
      cleanup();
      reject(toMqttError(error, "MQTT connection failed."));
    };

    const onClose = () => {
      cleanup();
      reject(new Error("MQTT connection closed before it was ready."));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      client.off("connect", onConnect);
      client.off("error", onError);
      client.off("close", onClose);
    };

    client.once("connect", onConnect);
    client.once("error", onError);
    client.once("close", onClose);
  });
}

export function publishMqttMessage(
  client: MqttClient,
  topic: string,
  message: string,
  options: IClientPublishOptions,
): Promise<void> {
  return new Promise((resolve, reject) => {
    client.publish(topic, message, options, (error) => {
      if (error) {
        reject(toMqttError(error, "MQTT publish failed."));
        return;
      }

      resolve();
    });
  });
}

export function subscribeToTopic(
  client: MqttClient,
  topic: string,
  options: IClientSubscribeOptions,
): Promise<void> {
  return new Promise((resolve, reject) => {
    client.subscribe(topic, options, (error) => {
      if (error) {
        reject(toMqttError(error, "MQTT subscribe failed."));
        return;
      }

      resolve();
    });
  });
}

export function closeMqttClient(client: MqttClient): Promise<void> {
  return new Promise((resolve) => {
    client.end(true, () => {
      resolve();
    });
  });
}
