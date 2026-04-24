"use client";

import { startTransition, useEffect, useMemo, useState } from "react";

import { fetchWithShortTimeout } from "@/lib/client-fetch";
import type { RegisteredDevice } from "@/lib/devices";

const SELECTED_DEVICE_STORAGE_KEY = "smart-shutter:selected-device-id";

type DevicesResponse = {
  defaultDeviceId: string;
  devices: RegisteredDevice[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDevicesResponse(value: unknown): value is DevicesResponse {
  return (
    isRecord(value) &&
    typeof value.defaultDeviceId === "string" &&
    Array.isArray(value.devices)
  );
}

export function useDeviceRegistry() {
  const [devices, setDevices] = useState<RegisteredDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceIdState] = useState("");
  const [isLoadingDevices, setIsLoadingDevices] = useState(true);
  const [deviceRegistryError, setDeviceRegistryError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let isCancelled = false;

    async function loadDevices() {
      setIsLoadingDevices(true);

      try {
        const response = await fetchWithShortTimeout("/api/devices", {
          cache: "no-store",
          timeoutMessage: "Loading devices timed out.",
        });
        const payload = (await response.json()) as unknown;

        if (!response.ok) {
          throw new Error(
            isRecord(payload) && typeof payload.error === "string"
              ? payload.error
              : "Unable to load devices.",
          );
        }

        if (!isDevicesResponse(payload)) {
          throw new Error("The device registry response was invalid.");
        }

        if (isCancelled) {
          return;
        }

        const storedDeviceId =
          typeof window === "undefined"
            ? ""
            : window.localStorage.getItem(SELECTED_DEVICE_STORAGE_KEY) ?? "";

        startTransition(() => {
          setDevices(payload.devices);
          setSelectedDeviceIdState((currentDeviceId) => {
            const preferredDeviceId =
              currentDeviceId || storedDeviceId || payload.defaultDeviceId;
            const hasPreferredDevice = payload.devices.some(
              (device) => device.deviceId === preferredDeviceId,
            );

            return hasPreferredDevice
              ? preferredDeviceId
              : payload.defaultDeviceId || payload.devices[0]?.deviceId || "";
          });
          setDeviceRegistryError(null);
        });
      } catch (error) {
        if (isCancelled) {
          return;
        }

        startTransition(() => {
          setDeviceRegistryError(
            error instanceof Error ? error.message : "Unable to load devices.",
          );
        });
      } finally {
        if (!isCancelled) {
          setIsLoadingDevices(false);
        }
      }
    }

    void loadDevices();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedDeviceId || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      SELECTED_DEVICE_STORAGE_KEY,
      selectedDeviceId,
    );
  }, [selectedDeviceId]);

  const selectedDevice = useMemo(
    () =>
      devices.find((device) => device.deviceId === selectedDeviceId) ?? null,
    [devices, selectedDeviceId],
  );

  return {
    deviceRegistryError,
    devices,
    isLoadingDevices,
    selectedDevice,
    selectedDeviceId,
    setSelectedDeviceId: setSelectedDeviceIdState,
  };
}
