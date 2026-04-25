import { isDatabaseDisabled, isDatabaseConfigured } from "@/lib/db";
import { isInternalTestMode } from "@/lib/runtime-mode";

const REQUIRED_CUSTOMER_ENV_VARS = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "MQTT_HOST",
  "MQTT_PORT",
  "MQTT_USERNAME",
  "MQTT_PASSWORD",
  "ADMIN_TOKEN",
  "PUBLIC_APP_BASE_URL",
] as const;

export type RuntimeValidationResult = {
  internalTestMode: boolean;
  customerMode: boolean;
  databaseDisabledInCustomerMode: boolean;
  missingProductionConfig: string[];
  productionReady: boolean;
  blockingReason: string | null;
};

function hasValue(name: string): boolean {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

export function getRuntimeValidation(): RuntimeValidationResult {
  const internalTestMode = isInternalTestMode();
  const customerMode = !internalTestMode;
  const databaseDisabledInCustomerMode =
    customerMode && isDatabaseDisabled();
  const missingProductionConfig = customerMode
    ? REQUIRED_CUSTOMER_ENV_VARS.filter((name) => !hasValue(name))
    : [];

  let blockingReason: string | null = null;

  if (databaseDisabledInCustomerMode) {
    blockingReason =
      "Customer mode requires database-backed access. Set DISABLE_DATABASE=false before deployment.";
  } else if (!internalTestMode && !isDatabaseConfigured()) {
    blockingReason =
      "Customer mode requires a working DATABASE_URL before deployment.";
  } else if (missingProductionConfig.length > 0) {
    blockingReason = `Customer mode is missing required configuration: ${missingProductionConfig.join(", ")}.`;
  }

  return {
    internalTestMode,
    customerMode,
    databaseDisabledInCustomerMode,
    missingProductionConfig,
    productionReady: blockingReason === null,
    blockingReason,
  };
}

export function getProductionBlockingReason(): string | null {
  return getRuntimeValidation().blockingReason;
}
