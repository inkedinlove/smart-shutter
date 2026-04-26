"use client";

import Link from "next/link";
import { startTransition, useEffect, useState, type FormEvent } from "react";

import AppNav from "@/app/_components/app-nav";
import {
  fetchWithShortTimeout,
  readApiData,
  redirectToLogin,
  SessionRequiredError,
} from "@/lib/client-fetch";
import type { DeviceClaimState } from "@/lib/device";
import { formatDeviceBoardLabel } from "@/lib/devices";

type AdminDeviceRecord = {
  deviceId: string;
  label: string | null;
  board: string;
  claimState: DeviceClaimState;
  credentialMode: string;
  credentialStatus: string;
  credentialIssuedAt: string | null;
  credentialRevokedAt: string | null;
  mqttClientId: string | null;
  mqttUsernameRef: string | null;
  certificateFingerprint: string | null;
  ownerProfileId: string | null;
  ownerProfileDisplayName: string | null;
  ownedByCurrentProfile: boolean;
  commandTopic: string | null;
  statusTopic: string | null;
  exists: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAdminDeviceRecord(value: unknown): value is AdminDeviceRecord {
  return (
    isRecord(value) &&
    typeof value.deviceId === "string" &&
    typeof value.board === "string" &&
    typeof value.claimState === "string" &&
    typeof value.credentialMode === "string" &&
    typeof value.credentialStatus === "string" &&
    typeof value.exists === "boolean"
  );
}

function isAdminDevicesResponse(
  value: unknown,
): value is {
  devices: AdminDeviceRecord[];
} {
  return (
    isRecord(value) &&
    Array.isArray(value.devices) &&
    value.devices.every(isAdminDeviceRecord)
  );
}

function isRegisterResponse(
  value: unknown,
): value is {
  device: AdminDeviceRecord;
} {
  return isRecord(value) && isAdminDeviceRecord(value.device);
}

function getClaimStateClasses(claimState: DeviceClaimState): string {
  switch (claimState) {
    case "claimed":
      return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
    case "unclaimed":
      return "border-cyan-400/20 bg-cyan-400/10 text-cyan-100";
    case "unknown":
    default:
      return "border-amber-300/20 bg-amber-300/10 text-amber-100";
  }
}

function getClaimStateLabel(claimState: DeviceClaimState): string {
  switch (claimState) {
    case "claimed":
      return "Claimed";
    case "unclaimed":
      return "Unclaimed";
    case "unknown":
    default:
      return "Unknown";
  }
}

function formatCredentialLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .split(/[_-\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function fetchAdminDevices(): Promise<AdminDeviceRecord[]> {
  const response = await fetchWithShortTimeout("/api/admin/devices", {
    cache: "no-store",
    timeoutMessage: "Loading devices timed out.",
  });
  const payload = await readApiData(
    response,
    isAdminDevicesResponse,
    "Unable to load registered devices.",
  );
  return payload.devices;
}

export default function AdminDevicesPage() {
  const [devices, setDevices] = useState<AdminDeviceRecord[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [label, setLabel] = useState("");
  const [board, setBoard] = useState("esp32");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const claimedCount = devices.filter(
    (device) => device.claimState === "claimed",
  ).length;
  const unclaimedCount = devices.filter(
    (device) => device.claimState === "unclaimed",
  ).length;

  useEffect(() => {
    let isCancelled = false;

    async function loadDevices() {
      setIsLoading(true);

      try {
        const nextDevices = await fetchAdminDevices();

        if (isCancelled) {
          return;
        }

        startTransition(() => {
          setDevices(nextDevices);
          setErrorMessage(null);
        });
      } catch (error) {
        if (isCancelled) {
          return;
        }

        if (error instanceof SessionRequiredError) {
          redirectToLogin("/admin/devices");
          return;
        }

        startTransition(() => {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load registered devices.",
          );
        });
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadDevices();

    return () => {
      isCancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    setActionMessage(null);

    try {
      const response = await fetchWithShortTimeout("/api/admin/devices/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deviceId,
          label,
          board,
        }),
        timeoutMessage: "Registering the device timed out.",
      });
      const payload = await readApiData(
        response,
        isRegisterResponse,
        "Unable to register the device.",
      );

      startTransition(() => {
        setDevices((current) => {
          const filtered = current.filter(
            (device) => device.deviceId !== payload.device.deviceId,
          );
          return [...filtered, payload.device].sort((left, right) =>
            left.deviceId.localeCompare(right.deviceId),
          );
        });
        setActionMessage(`Registered ${payload.device.deviceId}.`);
        setDeviceId("");
        setLabel("");
        setBoard("esp32");
      });
    } catch (error) {
      if (error instanceof SessionRequiredError) {
        redirectToLogin("/admin/devices");
        return;
      }

      startTransition(() => {
        setErrorMessage(
          error instanceof Error ? error.message : "Unable to register the device.",
        );
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[92rem] flex-col gap-5 px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
      <header className="dashboard-panel rounded-[1rem] px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-[1.7rem] font-semibold tracking-[0.015em] text-white sm:text-[1.9rem]">
              Smart Shutter
            </div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
              Internal Devices
            </div>
          </div>

          <AppNav extraLinks={[{ href: "/admin/claims", label: "Claims" }]} />
        </div>
      </header>

      <section className="dashboard-panel rounded-[1.2rem] border border-amber-300/20 bg-amber-300/8 p-6 sm:p-8">
        <div className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-100">
          Internal Admin
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-amber-50/90">
          Register a factory device in the cloud before it is claimed by a
          customer. Registered devices can then be handed off into the claim flow.
        </p>
      </section>

      <section className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.95fr)]">
        <section className="dashboard-panel rounded-[1.2rem] p-6 sm:p-8">
          <div className="space-y-3">
            <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
              Registered devices
            </div>
            <h1 className="text-3xl font-semibold text-white">
              Factory registration
            </h1>
            <p className="max-w-2xl text-sm leading-7 text-slate-300">
              A device stays unknown until it is registered here. Once registered,
              it can be claimed by a customer account.
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
              <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
                Registered
              </div>
              <div className="mt-3 text-2xl font-semibold text-white">
                {devices.length}
              </div>
            </div>
            <div className="rounded-[1rem] border border-cyan-400/15 bg-cyan-400/8 p-5">
              <div className="text-xs uppercase tracking-[0.22em] text-cyan-100/80">
                Ready to claim
              </div>
              <div className="mt-3 text-2xl font-semibold text-white">
                {unclaimedCount}
              </div>
            </div>
            <div className="rounded-[1rem] border border-emerald-400/15 bg-emerald-400/8 p-5">
              <div className="text-xs uppercase tracking-[0.22em] text-emerald-100/80">
                Claimed
              </div>
              <div className="mt-3 text-2xl font-semibold text-white">
                {claimedCount}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            {isLoading ? (
              <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5 text-sm text-slate-300">
                Loading devices...
              </div>
            ) : devices.length === 0 ? (
              <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5 text-sm text-slate-300">
                No devices have been registered yet.
              </div>
            ) : (
              devices.map((device) => (
                <article
                  key={device.deviceId}
                  className="rounded-[1rem] border border-white/10 bg-white/5 p-5"
                >
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(180px,0.7fr)_minmax(0,1fr)] xl:items-start">
                    <div className="min-w-0 space-y-3">
                      <div className="text-lg font-semibold text-white">
                        {device.label ?? "Unnamed device"}
                      </div>
                      <div className="break-all font-mono text-sm leading-6 text-cyan-100">
                        {device.deviceId}
                      </div>
                      <div className="inline-flex rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
                        {formatDeviceBoardLabel(device.board)}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
                        Claim state
                      </div>
                      <div>
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${getClaimStateClasses(device.claimState)}`}
                        >
                          {getClaimStateLabel(device.claimState)}
                        </span>
                      </div>
                    </div>

                    <div className="min-w-0 space-y-3">
                      <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
                        Owner
                      </div>
                      <div className="text-sm leading-6 text-slate-300">
                        {device.claimState === "claimed"
                          ? device.ownerProfileDisplayName ?? "Assigned"
                          : "No owner yet"}
                      </div>
                      <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
                        Credentials
                      </div>
                      <div className="text-sm leading-6 text-slate-300">
                        {formatCredentialLabel(device.credentialMode)} /{" "}
                        {formatCredentialLabel(device.credentialStatus)}
                      </div>
                      <div className="break-all font-mono text-xs leading-6 text-slate-400">
                        {device.mqttClientId ?? "Client ID will be derived"}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3 xl:col-span-3 xl:border-t xl:border-white/10 xl:pt-5 xl:justify-end">
                      {device.claimState === "unclaimed" ? (
                        <Link
                          className="inline-flex items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-400/12 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/18"
                          href={`/admin/claims?deviceId=${encodeURIComponent(device.deviceId)}`}
                        >
                          Create claim
                        </Link>
                      ) : (
                        <span className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold text-slate-300">
                          {device.claimState === "claimed"
                            ? "Already claimed"
                            : "Pending"}
                        </span>
                      )}
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold text-slate-300 disabled:cursor-not-allowed disabled:opacity-80"
                        disabled
                      >
                        Credential management next
                      </button>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <aside className="dashboard-panel rounded-[1.2rem] p-6 sm:p-8">
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Register device
          </div>
          <h2 className="mt-3 text-2xl font-semibold text-white">
            Add a factory device
          </h2>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            Use the resolved device ID reported by factory firmware, then assign a
            friendly label for the cloud registry.
          </p>

          <div className="mt-4 rounded-[1rem] border border-white/10 bg-white/5 p-4 text-sm leading-7 text-slate-300">
            Re-entering an existing device ID updates its label and board type.
            Use that to switch a device between <span className="font-semibold text-white">ESP8266</span>
            {" "}and <span className="font-semibold text-white">ESP8266 Servo</span>
            {" "}if the first registration used the wrong firmware family.
          </div>

          <div className="mt-5 rounded-[1rem] border border-cyan-400/15 bg-cyan-400/8 p-4 text-sm leading-7 text-cyan-100">
            Factory device IDs usually look like{" "}
            <span className="font-mono text-cyan-50">shutter-xxxxxx</span>.
            Register the exact ID shown by firmware logs, MQTT status, or the
            setup AP label before creating a claim.
          </div>

          <div className="mt-4 rounded-[1rem] border border-white/10 bg-white/5 p-4 text-sm leading-7 text-slate-300">
            ESP32 devices can use the browser install path when supported. ESP8266
            stepper, ESP8266 D1-D4 Stepper, and ESP8266 Servo devices should use the Arduino IDE or
            Arduino CLI manual flashing flow for now.
          </div>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="text-sm text-slate-300">Device ID</span>
              <input
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 font-mono text-sm text-white outline-none transition focus:border-cyan-300/50"
                placeholder="shutter-a1b2c3"
                required
                value={deviceId}
                onChange={(event) => {
                  setDeviceId(event.target.value);
                }}
              />
            </label>

            <label className="block">
              <span className="text-sm text-slate-300">Label</span>
              <input
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50"
                placeholder="Living Room Shutter"
                required
                value={label}
                onChange={(event) => {
                  setLabel(event.target.value);
                }}
              />
            </label>

            <label className="block">
              <span className="text-sm text-slate-300">Board</span>
              <select
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50"
                value={board}
                onChange={(event) => {
                  setBoard(event.target.value);
                }}
              >
                <option value="esp32">ESP32</option>
                <option value="esp8266">ESP8266</option>
                <option value="esp8266-d1d4">ESP8266 D1-D4 Stepper</option>
                <option value="esp8266-servo">ESP8266 Servo</option>
              </select>
            </label>

            <button
              className="w-full rounded-xl bg-cyan-400 px-4 py-4 text-base font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-cyan-400/50"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Registering..." : "Register device"}
            </button>
          </form>

          {actionMessage ? (
            <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
              {actionMessage}
            </div>
          ) : null}

          {errorMessage ? (
            <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
              {errorMessage}
            </div>
          ) : null}
        </aside>
      </section>
    </main>
  );
}
