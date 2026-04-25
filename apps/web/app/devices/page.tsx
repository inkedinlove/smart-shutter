"use client";

import Link from "next/link";
import { startTransition, useEffect, useMemo, useState } from "react";

import AppShell from "@/app/_components/app-shell";
import {
  fetchWithShortTimeout,
  readApiData,
  redirectToLogin,
  SessionRequiredError,
} from "@/lib/client-fetch";
import type { DeviceStatus } from "@/lib/device";
import type { RegisteredDevice } from "@/lib/devices";
import { useDeviceRegistry } from "@/lib/use-device-registry";

type ProfileRecord = {
  profileId: string;
  displayName: string;
  email: string | null;
  createdAt: string;
  updatedAt: string;
};

type ProfileResponse = {
  profile: ProfileRecord;
  devices: RegisteredDevice[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDeviceStatus(value: unknown): value is DeviceStatus {
  return isRecord(value) && typeof value.deviceId === "string";
}

function isRegisteredDevice(value: unknown): value is RegisteredDevice {
  return (
    isRecord(value) &&
    typeof value.deviceId === "string" &&
    typeof value.label === "string"
  );
}

function isProfileRecord(value: unknown): value is ProfileRecord {
  return (
    isRecord(value) &&
    typeof value.profileId === "string" &&
    typeof value.displayName === "string"
  );
}

function isProfileResponse(value: unknown): value is ProfileResponse {
  return (
    isRecord(value) &&
    isProfileRecord(value.profile) &&
    Array.isArray(value.devices) &&
    value.devices.every(isRegisteredDevice)
  );
}

function formatLastSeen(value: string | null | undefined): string {
  if (!value) {
    return "Waiting for status";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function getDeviceConnectionLabel(status: DeviceStatus | undefined): string {
  if (!status?.lastSeenAt) {
    return "Unknown";
  }

  return status.online ? "Online" : "Offline";
}

function getConnectionClasses(status: DeviceStatus | undefined): string {
  if (!status?.lastSeenAt) {
    return "border-slate-500/20 bg-slate-500/10 text-slate-200";
  }

  return status.online
    ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
    : "border-amber-300/20 bg-amber-300/10 text-amber-100";
}

function formatVersion(
  liveStatus: DeviceStatus | undefined,
  device: RegisteredDevice,
): string {
  return liveStatus?.firmwareVersion ?? device.firmwareVersion ?? "Unavailable";
}

async function fetchProfileData(): Promise<ProfileResponse> {
  const response = await fetchWithShortTimeout("/api/profile", {
    cache: "no-store",
    timeoutMessage: "Loading your devices timed out.",
  });
  return readApiData(response, isProfileResponse, "Unable to load your devices.");
}

async function fetchOwnedDeviceStatus(
  deviceId: string,
): Promise<DeviceStatus | null> {
  try {
    const response = await fetchWithShortTimeout(
      `/api/device/status?deviceId=${encodeURIComponent(deviceId)}`,
      {
        cache: "no-store",
        timeoutMessage: "Device status timed out.",
      },
    );
    return await readApiData(response, isDeviceStatus, "Unable to load device status.");
  } catch (error) {
    if (error instanceof SessionRequiredError) {
      throw error;
    }

    return null;
  }
}

export const dynamic = "force-dynamic";

export default function DevicesPage() {
  const {
    deviceRegistryError,
    devices,
    isLoadingDevices,
    reloadDevices,
    selectedDeviceId,
    setSelectedDeviceId,
  } = useDeviceRegistry();
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [ownedDevices, setOwnedDevices] = useState<RegisteredDevice[]>([]);
  const [statusesByDeviceId, setStatusesByDeviceId] = useState<
    Record<string, DeviceStatus>
  >({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  useEffect(() => {
    let isCancelled = false;

    async function loadProfile() {
      setIsLoadingProfile(true);

      try {
        const payload = await fetchProfileData();

        if (isCancelled) {
          return;
        }

        startTransition(() => {
          setProfile(payload.profile);
          setOwnedDevices(payload.devices);
          setErrorMessage(null);
        });

        const statusEntries = await Promise.all(
          payload.devices.map(async (device) => [
            device.deviceId,
            await fetchOwnedDeviceStatus(device.deviceId),
          ] as const),
        );

        if (isCancelled) {
          return;
        }

        const nextStatuses = Object.fromEntries(
          statusEntries.filter(
            (entry): entry is [string, DeviceStatus] => entry[1] !== null,
          ),
        );

        startTransition(() => {
          setStatusesByDeviceId(nextStatuses);
        });
      } catch (error) {
        if (isCancelled) {
          return;
        }

        if (error instanceof SessionRequiredError) {
          redirectToLogin("/devices");
          return;
        }

        startTransition(() => {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load your devices.",
          );
        });
      } finally {
        if (!isCancelled) {
          setIsLoadingProfile(false);
        }
      }
    }

    void loadProfile();

    return () => {
      isCancelled = true;
    };
  }, []);

  const activeErrorMessage = errorMessage ?? deviceRegistryError;
  const onlineDeviceCount = useMemo(
    () =>
      ownedDevices.filter(
        (device) => statusesByDeviceId[device.deviceId]?.online === true,
      ).length,
    [ownedDevices, statusesByDeviceId],
  );

  return (
    <AppShell
      currentPath="/devices"
      devices={devices}
      isLoadingDevices={isLoadingDevices}
      selectedDeviceId={selectedDeviceId}
      onSelectDevice={(deviceId) => {
        setSelectedDeviceId(deviceId);
      }}
    >
      <section className="dashboard-panel rounded-[1.2rem] p-6 sm:p-8 lg:p-10">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
            Devices
          </div>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-[2.8rem]">
            Your devices.
          </h1>
          <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
            View the devices attached to your account and open setup for any one
            of them.
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Account
            </div>
            <div className="mt-3 text-xl font-semibold text-white">
              {profile?.displayName ?? "Loading..."}
            </div>
            <div className="mt-2 wrap-anywhere text-sm text-slate-400">
              {profile?.email ?? "No email"}
            </div>
          </div>

          <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Owned devices
            </div>
            <div className="mt-3 text-xl font-semibold text-white">
              {ownedDevices.length}
            </div>
            <div className="mt-2 text-sm text-slate-400">
              Devices linked to this account
            </div>
          </div>

          <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Online now
            </div>
            <div className="mt-3 text-xl font-semibold text-white">
              {onlineDeviceCount}
            </div>
            <div className="mt-2 text-sm text-slate-400">
              Reporting live status over MQTT
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4">
          {isLoadingProfile ? (
            <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5 text-sm text-slate-300">
              Loading your devices...
            </div>
          ) : ownedDevices.length === 0 ? (
            <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5 text-sm text-slate-300">
              <div className="font-semibold text-white">No devices yet.</div>
              <div className="mt-2">
                Claim a device first, then return here to open setup.
              </div>
              <Link
                className="mt-4 inline-flex items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-400/12 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/18"
                href="/claim"
              >
                Claim a device
              </Link>
            </div>
          ) : (
            ownedDevices.map((device) => {
              const liveStatus = statusesByDeviceId[device.deviceId];

              return (
                <article
                  key={device.deviceId}
                  className="rounded-[1rem] border border-white/10 bg-white/5 p-5"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-2xl font-semibold text-white">
                          {device.label}
                        </h2>
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${getConnectionClasses(liveStatus)}`}
                        >
                          {getDeviceConnectionLabel(liveStatus)}
                        </span>
                      </div>

                      <div className="font-mono text-sm text-cyan-100">
                        {device.deviceId}
                      </div>
                    </div>

                    <Link
                      className="inline-flex items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-400/12 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/18"
                      href={`/connect?deviceId=${encodeURIComponent(device.deviceId)}`}
                    >
                      Open setup
                    </Link>
                    {!liveStatus?.online ? (
                      <Link
                        className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold text-white transition hover:border-cyan-300/40 hover:bg-cyan-400/10"
                        href={`/setup-device?deviceId=${encodeURIComponent(device.deviceId)}`}
                      >
                        Wi-Fi setup
                      </Link>
                    ) : null}
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-3">
                    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
                        Last seen
                      </div>
                      <div className="mt-2 text-base font-semibold text-white">
                        {formatLastSeen(liveStatus?.lastSeenAt)}
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
                        Firmware
                      </div>
                      <div className="mt-2 text-base font-semibold text-white">
                        {formatVersion(liveStatus, device)}
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
                        Position
                      </div>
                      <div className="mt-2 text-base font-semibold text-white">
                        {typeof liveStatus?.estimatedPercent === "number"
                          ? `${Math.round(liveStatus.estimatedPercent)}%`
                          : "Waiting for status"}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>

        {activeErrorMessage ? (
          <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
            <div className="font-semibold text-amber-50">{activeErrorMessage}</div>
            <div className="mt-1 text-amber-100/90">
              Check your connection, then try loading your devices again.
            </div>
            <button
              type="button"
              className="mt-3 inline-flex rounded-lg border border-amber-200/20 bg-black/20 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-50 transition hover:bg-black/30"
              onClick={() => {
                void fetchProfileData().then((payload) => {
                  setProfile(payload.profile);
                  setOwnedDevices(payload.devices);
                  setErrorMessage(null);
                }).catch((error: unknown) => {
                  if (error instanceof SessionRequiredError) {
                    redirectToLogin("/devices");
                    return;
                  }

                  setErrorMessage(
                    error instanceof Error
                      ? error.message
                      : "Unable to load your devices.",
                  );
                });
                reloadDevices();
              }}
            >
              Retry connection
            </button>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
