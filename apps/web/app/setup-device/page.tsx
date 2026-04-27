"use client";

import Link from "next/link";
import { Suspense, startTransition, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import AppShell from "@/app/_components/app-shell";
import {
  fetchWithShortTimeout,
  readApiData,
  redirectToLogin,
  SessionRequiredError,
} from "@/lib/client-fetch";
import type { DeviceClaimState, DeviceStatus } from "@/lib/device";
import { useDeviceRegistry } from "@/lib/use-device-registry";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDeviceStatus(value: unknown): value is DeviceStatus {
  return isRecord(value) && typeof value.deviceId === "string";
}

type DeviceRegistrationState = {
  deviceId: string;
  label: string | null;
  claimState: DeviceClaimState;
  ownerProfileId: string | null;
  ownerProfileDisplayName: string | null;
  ownedByCurrentProfile: boolean;
  exists: boolean;
};

function isDeviceRegistrationState(value: unknown): value is DeviceRegistrationState {
  return (
    isRecord(value) &&
    typeof value.deviceId === "string" &&
    typeof value.claimState === "string" &&
    typeof value.ownedByCurrentProfile === "boolean"
  );
}

async function fetchDeviceStatus(deviceId: string): Promise<DeviceStatus> {
  const response = await fetchWithShortTimeout(
    `/api/device/status?deviceId=${encodeURIComponent(deviceId)}`,
    {
      cache: "no-store",
      timeoutMessage: "Checking the device timed out.",
    },
  );

  return readApiData(response, isDeviceStatus, "Unable to load device status.");
}

async function fetchDeviceRegistrationState(
  deviceId: string,
): Promise<DeviceRegistrationState> {
  const response = await fetchWithShortTimeout(
    `/api/devices/${encodeURIComponent(deviceId)}/registration`,
    {
      cache: "no-store",
      timeoutMessage: "Checking the device registration timed out.",
    },
  );

  return readApiData(
    response,
    isDeviceRegistrationState,
    "Unable to load device registration.",
  );
}

export const dynamic = "force-dynamic";

function SetupDevicePageContent() {
  const searchParams = useSearchParams();
  const requestedDeviceId = searchParams.get("deviceId")?.trim() ?? "";
  const {
    devices,
    isAdmin,
    isLoadingDevices,
    selectedDevice,
    selectedDeviceId,
    setSelectedDeviceId,
  } = useDeviceRegistry();
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null);
  const [registrationState, setRegistrationState] =
    useState<DeviceRegistrationState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [statusRetryToken, setStatusRetryToken] = useState(0);
  const activeDeviceId = selectedDeviceId || requestedDeviceId;
  const activeDeviceLabel =
    selectedDevice?.label ??
    registrationState?.label ??
    (requestedDeviceId ? "Requested device" : null);

  useEffect(() => {
    if (!requestedDeviceId || devices.length === 0) {
      return;
    }

    if (
      requestedDeviceId !== selectedDeviceId &&
      devices.some((device) => device.deviceId === requestedDeviceId)
    ) {
      setSelectedDeviceId(requestedDeviceId);
    }
  }, [devices, requestedDeviceId, selectedDeviceId, setSelectedDeviceId]);

  useEffect(() => {
    if (!requestedDeviceId) {
      setRegistrationState(null);
      return;
    }

    let isCancelled = false;

    async function loadRegistration() {
      try {
        const nextState = await fetchDeviceRegistrationState(requestedDeviceId);

        if (isCancelled) {
          return;
        }

        startTransition(() => {
          setRegistrationState(nextState);
        });
      } catch (error) {
        if (isCancelled) {
          return;
        }

        if (error instanceof SessionRequiredError) {
          redirectToLogin(
            `/setup-device?deviceId=${encodeURIComponent(requestedDeviceId)}`,
          );
          return;
        }
      }
    }

    void loadRegistration();

    return () => {
      isCancelled = true;
    };
  }, [requestedDeviceId]);

  useEffect(() => {
    if (!selectedDeviceId) {
      setDeviceStatus(null);
      setIsLoadingStatus(false);
      return;
    }

    let isCancelled = false;

    async function loadStatus() {
      setIsLoadingStatus(true);

      try {
        const status = await fetchDeviceStatus(selectedDeviceId);

        if (isCancelled) {
          return;
        }

        startTransition(() => {
          setDeviceStatus(status);
          setErrorMessage(null);
        });
      } catch (error) {
        if (isCancelled) {
          return;
        }

        if (error instanceof SessionRequiredError) {
          redirectToLogin(
            `/setup-device?deviceId=${encodeURIComponent(selectedDeviceId)}`,
          );
          return;
        }

        startTransition(() => {
          setDeviceStatus(null);
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load device status.",
          );
        });
      } finally {
        if (!isCancelled) {
          setIsLoadingStatus(false);
        }
      }
    }

    void loadStatus();

    return () => {
      isCancelled = true;
    };
  }, [selectedDeviceId, statusRetryToken]);

  const canCheckConnection = Boolean(selectedDeviceId);
  const deviceOffline =
    canCheckConnection &&
    (!deviceStatus?.lastSeenAt || deviceStatus.online === false);
  const effectiveRegistrationState =
    registrationState ??
    (activeDeviceId
      ? {
          deviceId: activeDeviceId,
          label: activeDeviceLabel,
          claimState: deviceStatus?.claimState ?? "claimed",
          ownerProfileId: null,
          ownerProfileDisplayName: null,
          ownedByCurrentProfile: Boolean(selectedDeviceId),
          exists: true,
        }
      : null);
  const claimStateLabel =
    effectiveRegistrationState?.claimState === "claimed"
      ? "Claimed"
      : effectiveRegistrationState?.claimState === "unclaimed"
        ? "Unclaimed"
        : "Unknown";

  return (
    <AppShell
      currentPath="/devices"
      devices={devices}
      isAdmin={isAdmin}
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
            Device Setup
          </div>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-[2.8rem]">
            Get your device online.
          </h1>
          <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
            Claim the device first, then connect it to Wi-Fi through the
            device&apos;s own setup network if it is still offline.
          </p>
        </div>

        {!activeDeviceId ? (
          <div className="mt-6 rounded-[1rem] border border-white/10 bg-white/5 p-5 text-sm text-slate-300">
            <div className="font-semibold text-white">No device selected yet.</div>
            <div className="mt-2">
              Claim a device first, then return here to finish setup.
            </div>
            <Link
              className="mt-4 inline-flex items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-400/12 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/18"
              href="/claim"
            >
              Claim a device
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,1fr)]">
              <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                  Device
                </div>
                <div className="mt-3 text-2xl font-semibold text-white">
                  {activeDeviceLabel ?? "Loading device"}
                </div>
                <div className="mt-2 font-mono text-sm text-cyan-100">
                  {activeDeviceId}
                </div>
              </div>

              <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                  Claim
                </div>
                <div className="mt-3 text-2xl font-semibold text-white">
                  {claimStateLabel}
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-400">
                  {effectiveRegistrationState?.claimState === "unknown"
                    ? "This device is not registered in the cloud yet."
                    : effectiveRegistrationState?.claimState === "unclaimed"
                      ? "Claim this device before setup continues."
                      : effectiveRegistrationState?.ownedByCurrentProfile
                        ? "This device is attached to your account."
                        : "This device belongs to another account."}
                </div>
              </div>

              <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                  Connection
                </div>
                <div className="mt-3 text-2xl font-semibold text-white">
                  {isLoadingStatus
                    ? "Checking"
                    : !canCheckConnection
                      ? "Waiting"
                      : deviceOffline
                        ? "Offline"
                        : "Online"}
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-400">
                  {!canCheckConnection
                    ? "Finish registration or claim first."
                    : deviceOffline
                      ? "The device still needs home Wi-Fi."
                      : "The device is online and ready for setup."}
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                  Step 1
                </div>
                <div className="mt-3 text-lg font-semibold text-white">
                  Claim the device
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Claim the device so it is attached to your account.
                </p>
              </div>

              <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                  Step 2
                </div>
                <div className="mt-3 text-lg font-semibold text-white">
                  Join the setup network
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Join a setup network like SmartShutter-XXXXXX when the device
                  is offline.
                </p>
              </div>

              <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                  Step 3
                </div>
                <div className="mt-3 text-lg font-semibold text-white">
                  Finish in setup
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Enter the home Wi-Fi name and password in the device page, then
                  return here after it reconnects.
                </p>
              </div>
            </div>

            {effectiveRegistrationState?.claimState === "unknown" ? (
              <div className="mt-6 rounded-[1rem] border border-amber-300/20 bg-amber-300/10 p-5">
                <div className="text-xs uppercase tracking-[0.24em] text-amber-100/80">
                  Next action
                </div>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  This device must be registered first.
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-amber-50/90">
                  Ask an administrator to register this factory device before it
                  can be claimed and brought online.
                </p>
              </div>
            ) : effectiveRegistrationState?.claimState === "unclaimed" ? (
              <div className="mt-6 rounded-[1rem] border border-cyan-400/20 bg-cyan-400/10 p-5">
                <div className="text-xs uppercase tracking-[0.24em] text-cyan-100/80">
                  Next action
                </div>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  Claim this device before setup.
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-cyan-100/90">
                  Use the claim link or enter the claim code to attach this
                  device to your account.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link
                    className="inline-flex items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-400/12 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/18"
                    href="/claim"
                  >
                    Claim device
                  </Link>
                </div>
              </div>
            ) : effectiveRegistrationState?.ownedByCurrentProfile === false ? (
              <div className="mt-6 rounded-[1rem] border border-amber-300/20 bg-amber-300/10 p-5">
                <div className="text-xs uppercase tracking-[0.24em] text-amber-100/80">
                  Claimed
                </div>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  This device belongs to another account.
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-amber-50/90">
                  Sign in with the account that owns this device or ask support
                  for help.
                </p>
              </div>
            ) : deviceOffline ? (
              <div className="mt-6 rounded-[1rem] border border-amber-300/20 bg-amber-300/10 p-5">
                <div className="text-xs uppercase tracking-[0.24em] text-amber-100/80">
                  Wi-Fi setup
                </div>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  Put device in setup mode and connect it to Wi-Fi.
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-amber-50/90">
                  Use a phone or laptop to join the SmartShutter setup network.
                </p>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-amber-200/15 bg-black/15 px-4 py-3 text-sm text-amber-50">
                    1. Join the setup network
                    <div className="mt-2 text-amber-100/80">
                      Look for SmartShutter-XXXXXX.
                    </div>
                  </div>
                  <div className="rounded-xl border border-amber-200/15 bg-black/15 px-4 py-3 text-sm text-amber-50">
                    2. Enter home Wi-Fi
                    <div className="mt-2 text-amber-100/80">
                      Use the device page to save your home network.
                    </div>
                  </div>
                  <div className="rounded-xl border border-amber-200/15 bg-black/15 px-4 py-3 text-sm text-amber-50">
                    3. Return here
                    <div className="mt-2 text-amber-100/80">
                      After the device reconnects, continue to setup.
                    </div>
                  </div>
                </div>
                <p className="mt-4 max-w-3xl text-sm leading-7 text-amber-50/90">
                  After saving WiFi, return to this page. The main app does not ask
                  for or store your Wi-Fi password.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold text-white transition hover:border-cyan-300/40 hover:bg-cyan-400/10"
                    onClick={() => {
                      setStatusRetryToken((current) => current + 1);
                    }}
                  >
                    Check again
                  </button>
                  <Link
                    className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:border-cyan-300/40 hover:bg-cyan-400/10"
                    href={`/connect?deviceId=${encodeURIComponent(activeDeviceId)}`}
                  >
                    Continue to setup
                  </Link>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-[1rem] border border-emerald-400/20 bg-emerald-400/10 p-5">
                <div className="text-xs uppercase tracking-[0.24em] text-emerald-100/80">
                  Ready
                </div>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  Device is online.
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-emerald-50/90">
                  Continue to setup to calibrate safely and test movement.
                </p>
                <Link
                  className="mt-4 inline-flex items-center justify-center rounded-xl border border-emerald-300/30 bg-emerald-400/12 px-4 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/18"
                  href={`/connect?deviceId=${encodeURIComponent(activeDeviceId)}`}
                >
                  Continue to setup
                </Link>
              </div>
            )}

            {errorMessage ? (
              <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
                <div className="font-semibold text-amber-50">{errorMessage}</div>
                <div className="mt-1 text-amber-100/90">
                  Check the device connection, then try again.
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>
    </AppShell>
  );
}

export default function SetupDevicePage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen w-full max-w-[92rem] flex-col gap-5 px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
          <section className="dashboard-panel rounded-[1.2rem] p-6 sm:p-8 lg:p-10">
            <div className="text-sm text-slate-300">Loading setup...</div>
          </section>
        </main>
      }
    >
      <SetupDevicePageContent />
    </Suspense>
  );
}
