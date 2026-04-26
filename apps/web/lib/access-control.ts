import "server-only";

import type { Session } from "next-auth";

import { getAuthSession } from "@/lib/auth";
import { getRegisteredDeviceById, listAvailableDevices } from "@/lib/device-registry";
import type { RegisteredDevice } from "@/lib/devices";
import {
  getDemoProfile,
  getDemoProfileDefaultDeviceId,
  getDevicesForProfile,
  getProfileDevice,
  type UserProfileRecord,
} from "@/lib/profiles";
import { isInternalTestMode } from "@/lib/runtime-mode";
import { getProductionBlockingReason } from "@/lib/runtime-validation";
import { getUserProfileByUserId } from "@/lib/user-accounts";
import { isDatabaseConfigured } from "@/lib/db";

export class AccessControlError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 403) {
    super(message);
    this.name = "AccessControlError";
    this.statusCode = statusCode;
  }
}

export type AccessContext = {
  mode: "internal" | "customer";
  session: Session | null;
  profile: UserProfileRecord;
};

function getCurrentSessionUserId(session: Session | null): string {
  return typeof session?.user?.id === "string" ? session.user.id.trim() : "";
}

export async function getAccessContext(): Promise<AccessContext> {
  if (isInternalTestMode()) {
    return {
      mode: "internal",
      session: null,
      profile: await getDemoProfile(),
    };
  }

  const productionBlockingReason = getProductionBlockingReason();

  if (productionBlockingReason) {
    throw new AccessControlError(productionBlockingReason, 503);
  }

  if (!isDatabaseConfigured()) {
    throw new AccessControlError(
      "Customer mode requires database-backed authentication.",
      503,
    );
  }

  const session = await getAuthSession();
  const userId = getCurrentSessionUserId(session);

  if (!userId) {
    throw new AccessControlError("Sign in required.", 401);
  }

  const profile = await getUserProfileByUserId(userId);

  if (!profile) {
    throw new AccessControlError("Customer profile not found.", 403);
  }

  return {
    mode: "customer",
    session,
    profile,
  };
}

export async function listAccessibleDevices(): Promise<{
  context: AccessContext;
  devices: RegisteredDevice[];
}> {
  const context = await getAccessContext();
  const devices =
    context.mode === "internal" || isAdminSession(context.session)
      ? await listAvailableDevices()
      : await getDevicesForProfile(context.profile.profileId, {
          allowFallback: false,
        });

  return {
    context,
    devices,
  };
}

export async function getDefaultAccessibleDeviceId(): Promise<string> {
  const context = await getAccessContext();

  if (context.mode === "internal") {
    return getDemoProfileDefaultDeviceId({ allowFallback: true });
  }

  if (isAdminSession(context.session)) {
    const devices = await listAvailableDevices();
    return devices[0]?.deviceId ?? "";
  }

  const devices = await getDevicesForProfile(context.profile.profileId, {
    allowFallback: false,
  });

  return devices[0]?.deviceId ?? "";
}

export async function getAuthorizedDevice(
  deviceId: string,
): Promise<{
  context: AccessContext;
  device: RegisteredDevice;
}> {
  const context = await getAccessContext();
  const normalizedDeviceId = deviceId.trim();

  if (!normalizedDeviceId) {
    throw new AccessControlError("deviceId is required.", 400);
  }

  const device =
    context.mode === "internal"
      ? (await getRegisteredDeviceById(normalizedDeviceId)) ??
        (await getProfileDevice(context.profile.profileId, normalizedDeviceId, {
          allowFallback: true,
        }))
      : isAdminSession(context.session)
        ? await getRegisteredDeviceById(normalizedDeviceId)
      : await getProfileDevice(context.profile.profileId, normalizedDeviceId, {
          allowFallback: false,
        });

  if (!device) {
    throw new AccessControlError("Device not found.", 404);
  }

  return {
    context,
    device,
  };
}

export async function getAuthorizedDeviceFromQuery(
  deviceId: string | null | undefined,
): Promise<{
  context: AccessContext;
  device: RegisteredDevice;
}> {
  const requestedDeviceId = deviceId?.trim() ?? "";

  if (requestedDeviceId) {
    return getAuthorizedDevice(requestedDeviceId);
  }

  const context = await getAccessContext();

  if (context.mode === "internal") {
    const fallbackDeviceId = await getDemoProfileDefaultDeviceId({
      allowFallback: true,
    });

    return getAuthorizedDevice(fallbackDeviceId);
  }

  if (isAdminSession(context.session)) {
    const devices = await listAvailableDevices();
    const firstDevice = devices[0];

    if (!firstDevice) {
      throw new AccessControlError("No registered devices were found yet.", 404);
    }

    return {
      context,
      device: firstDevice,
    };
  }

  const devices = await getDevicesForProfile(context.profile.profileId, {
    allowFallback: false,
  });
  const firstDevice = devices[0];

  if (!firstDevice) {
    throw new AccessControlError("No devices are attached to this account yet.", 404);
  }

  return {
    context,
    device: firstDevice,
  };
}

export function isAdminSession(session: Session | null): boolean {
  return session?.user?.role === "admin";
}

export async function requireAdminSession(): Promise<Session | null> {
  if (isInternalTestMode()) {
    return null;
  }

  const productionBlockingReason = getProductionBlockingReason();

  if (productionBlockingReason) {
    throw new AccessControlError(productionBlockingReason, 503);
  }

  const session = await getAuthSession();

  if (!session?.user?.id) {
    throw new AccessControlError("Sign in required.", 401);
  }

  if (!isAdminSession(session)) {
    throw new AccessControlError("Admin access required.", 403);
  }

  return session;
}
