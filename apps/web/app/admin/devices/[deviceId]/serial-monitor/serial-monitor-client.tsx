"use client";

import Link from "next/link";
import {
  startTransition,
  useEffect,
  useRef,
  useState,
} from "react";

import AppNav from "@/app/_components/app-nav";
import {
  fetchWithShortTimeout,
  readApiData,
  redirectToLogin,
  SessionRequiredError,
} from "@/lib/client-fetch";
import type { DeviceDiagnostics } from "@/lib/device";
import type { DeviceRemoteLogEntry } from "@/lib/device-logs";
import { formatDeviceBoardLabel } from "@/lib/devices";

type SerialMonitorClientProps = {
  deviceId: string;
};

type AdminDeviceRecord = {
  deviceId: string;
  label: string | null;
  board: string;
  statusTopic: string | null;
  claimState: string;
};

type StreamState = "connecting" | "live" | "reconnecting" | "error";

type SnapshotResponse = {
  requested: boolean;
};

const MAX_VISIBLE_LOG_LINES = 400;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAdminDeviceRecord(value: unknown): value is AdminDeviceRecord {
  return (
    isRecord(value) &&
    typeof value.deviceId === "string" &&
    typeof value.board === "string" &&
    typeof value.claimState === "string"
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

function isDeviceDiagnostics(value: unknown): value is DeviceDiagnostics {
  return (
    isRecord(value) &&
    typeof value.deviceId === "string" &&
    Array.isArray(value.reportedCapabilities)
  );
}

function isSnapshotResponse(value: unknown): value is SnapshotResponse {
  return isRecord(value) && value.requested === true;
}

function isDeviceRemoteLogEntry(value: unknown): value is DeviceRemoteLogEntry {
  return (
    isRecord(value) &&
    typeof value.deviceId === "string" &&
    typeof value.resolvedDeviceId === "string" &&
    typeof value.line === "string" &&
    typeof value.snapshot === "boolean" &&
    typeof value.receivedAt === "string"
  );
}

function formatUptimeLabel(uptimeMs: number | null): string {
  if (typeof uptimeMs !== "number" || !Number.isFinite(uptimeMs) || uptimeMs < 0) {
    return "t+--";
  }

  const totalSeconds = Math.floor(uptimeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = uptimeMs % 1000;

  return `t+${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(
    milliseconds,
  ).padStart(3, "0")}`;
}

function formatStreamStateLabel(streamState: StreamState): string {
  switch (streamState) {
    case "live":
      return "Live";
    case "reconnecting":
      return "Reconnecting";
    case "error":
      return "Error";
    case "connecting":
    default:
      return "Connecting";
  }
}

function getStreamStateClasses(streamState: StreamState): string {
  switch (streamState) {
    case "live":
      return "border-emerald-400/25 bg-emerald-400/12 text-emerald-100";
    case "reconnecting":
      return "border-amber-300/25 bg-amber-300/12 text-amber-100";
    case "error":
      return "border-rose-400/25 bg-rose-400/12 text-rose-100";
    case "connecting":
    default:
      return "border-cyan-300/25 bg-cyan-400/12 text-cyan-100";
  }
}

async function fetchDeviceRecord(deviceId: string): Promise<AdminDeviceRecord | null> {
  const response = await fetchWithShortTimeout("/api/admin/devices", {
    cache: "no-store",
    timeoutMessage: "Loading admin devices timed out.",
  });
  const payload = await readApiData(
    response,
    isAdminDevicesResponse,
    "Unable to load registered devices.",
  );

  return (
    payload.devices.find(
      (device) => device.deviceId.trim().toLowerCase() === deviceId.trim().toLowerCase(),
    ) ?? null
  );
}

async function fetchDiagnostics(deviceId: string): Promise<DeviceDiagnostics> {
  const response = await fetchWithShortTimeout(
    `/api/devices/${encodeURIComponent(deviceId)}/diagnostics`,
    {
      cache: "no-store",
      timeoutMessage: "Loading device diagnostics timed out.",
    },
  );

  return readApiData(
    response,
    isDeviceDiagnostics,
    "Unable to load device diagnostics.",
  );
}

export default function SerialMonitorClient({
  deviceId,
}: SerialMonitorClientProps) {
  const [deviceRecord, setDeviceRecord] = useState<AdminDeviceRecord | null>(null);
  const [diagnostics, setDiagnostics] = useState<DeviceDiagnostics | null>(null);
  const [logEntries, setLogEntries] = useState<DeviceRemoteLogEntry[]>([]);
  const [streamState, setStreamState] = useState<StreamState>("connecting");
  const [isLoading, setIsLoading] = useState(true);
  const [isRequestingSnapshot, setIsRequestingSnapshot] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [streamGeneration, setStreamGeneration] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const logViewportRef = useRef<HTMLDivElement | null>(null);

  const supportsRemoteLogs =
    diagnostics?.reportedCapabilities?.includes("remote_log_stream") ?? false;
  const online = diagnostics?.online === true;

  const deviceHeading =
    deviceRecord?.label?.trim() || deviceRecord?.deviceId || deviceId;

  useEffect(() => {
    let cancelled = false;

    async function loadPageData() {
      setIsLoading(true);

      try {
        const [nextDeviceRecord, nextDiagnostics] = await Promise.all([
          fetchDeviceRecord(deviceId),
          fetchDiagnostics(deviceId),
        ]);

        if (cancelled) {
          return;
        }

        startTransition(() => {
          setDeviceRecord(nextDeviceRecord);
          setDiagnostics(nextDiagnostics);
          setErrorMessage(null);
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (error instanceof SessionRequiredError) {
          redirectToLogin(`/admin/devices/${encodeURIComponent(deviceId)}/serial-monitor`);
          return;
        }

        startTransition(() => {
          setErrorMessage(
            error instanceof Error ? error.message : "Unable to load the serial monitor.",
          );
        });
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadPageData();

    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  useEffect(() => {
    const streamUrl = `/api/admin/devices/${encodeURIComponent(deviceId)}/serial-monitor/stream`;
    const source = new EventSource(streamUrl);

    setStreamState("connecting");

    source.onopen = () => {
      startTransition(() => {
        setStreamState("live");
        setErrorMessage(null);
      });
    };

    source.onmessage = (event) => {
      let parsed: unknown;

      try {
        parsed = JSON.parse(event.data) as unknown;
      } catch {
        return;
      }

      if (!isDeviceRemoteLogEntry(parsed)) {
        return;
      }

      startTransition(() => {
        setLogEntries((current) => {
          const nextEntries = [...current, parsed];
          return nextEntries.slice(-MAX_VISIBLE_LOG_LINES);
        });
      });
    };

    const handleReady = () => {
      void requestSnapshot(true);
    };

    const handleStreamError = (event: Event) => {
      const messageEvent = event as MessageEvent<string>;

      if (!messageEvent.data) {
        return;
      }

      try {
        const payload = JSON.parse(messageEvent.data) as { error?: unknown };
        if (typeof payload.error === "string" && payload.error.trim()) {
          const nextErrorMessage = payload.error;
          startTransition(() => {
            setErrorMessage(nextErrorMessage);
          });
        }
      } catch {
        // Ignore malformed error payloads from transient disconnects.
      }
    };

    source.addEventListener("ready", handleReady);
    source.addEventListener("stream-error", handleStreamError);

    source.onerror = () => {
      startTransition(() => {
        setStreamState((current) => (current === "live" ? "reconnecting" : "error"));
      });
    };

    return () => {
      source.removeEventListener("ready", handleReady);
      source.removeEventListener("stream-error", handleStreamError);
      source.close();
    };
  }, [deviceId, streamGeneration]);

  useEffect(() => {
    if (!autoScroll || !logViewportRef.current) {
      return;
    }

    logViewportRef.current.scrollTop = logViewportRef.current.scrollHeight;
  }, [autoScroll, logEntries]);

  async function requestSnapshot(silent = false) {
    if (!silent) {
      setActionMessage(null);
      setErrorMessage(null);
    }

    setIsRequestingSnapshot(true);

    try {
      const response = await fetchWithShortTimeout(
        `/api/admin/devices/${encodeURIComponent(deviceId)}/serial-monitor/snapshot`,
        {
          method: "POST",
          timeoutMessage: "Requesting a log snapshot timed out.",
        },
      );

      await readApiData(
        response,
        isSnapshotResponse,
        "Unable to request the remote log snapshot.",
      );

      if (!silent) {
        startTransition(() => {
          setActionMessage("Requested the latest buffered log snapshot from the device.");
        });
      }
    } catch (error) {
      if (error instanceof SessionRequiredError) {
        redirectToLogin(`/admin/devices/${encodeURIComponent(deviceId)}/serial-monitor`);
        return;
      }

      if (!silent) {
        startTransition(() => {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to request the remote log snapshot.",
          );
        });
      }
    } finally {
      setIsRequestingSnapshot(false);
    }
  }

  function handleReconnect() {
    startTransition(() => {
      setStreamGeneration((current) => current + 1);
      setStreamState("connecting");
      setErrorMessage(null);
      setActionMessage("Reconnecting the remote serial stream...");
    });
  }

  const lastLogEntry = logEntries[logEntries.length - 1] ?? null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[96rem] flex-col gap-5 px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
      <header className="dashboard-panel rounded-[1rem] px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-[1.7rem] font-semibold tracking-[0.015em] text-white sm:text-[1.9rem]">
              Smart Shutter
            </div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
              Admin Remote Serial
            </div>
          </div>

          <AppNav
            currentPath="/admin/devices"
            extraLinks={[
              { href: "/admin/devices", label: "Admin Devices" },
              { href: "/admin/claims", label: "Claims" },
            ]}
          />
        </div>
      </header>

      <section className="dashboard-panel rounded-[1.2rem] p-6 sm:p-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
              Wi-Fi serial monitor
            </div>
            <h1 className="text-3xl font-semibold text-white">{deviceHeading}</h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300">
              Watch the device&apos;s live firmware logs without keeping it plugged into
              a computer. The stream is delivered over the device&apos;s MQTT connection,
              and the monitor can request a buffered snapshot whenever you open it.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${getStreamStateClasses(
                streamState,
              )}`}
            >
              Stream {formatStreamStateLabel(streamState)}
            </span>
            <span
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${
                online
                  ? "border-emerald-400/25 bg-emerald-400/12 text-emerald-100"
                  : "border-slate-500/25 bg-slate-500/12 text-slate-200"
              }`}
            >
              {online ? "Device online" : "Device offline"}
            </span>
            <Link
              className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-cyan-300/30 hover:text-white"
              href="/admin/devices"
            >
              Back to devices
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-4">
          <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Device ID
            </div>
            <div className="mt-3 break-all font-mono text-sm text-cyan-100">
              {deviceId}
            </div>
          </div>
          <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Board
            </div>
            <div className="mt-3 text-sm font-semibold text-white">
              {formatDeviceBoardLabel(deviceRecord?.board ?? diagnostics?.registeredBoard)}
            </div>
          </div>
          <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Firmware
            </div>
            <div className="mt-3 break-all text-sm font-semibold text-white">
              {diagnostics?.firmwareVersion ?? "Unknown"}
            </div>
          </div>
          <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Latest line
            </div>
            <div className="mt-3 text-sm text-slate-200">
              {lastLogEntry ? formatUptimeLabel(lastLogEntry.uptimeMs) : "Waiting"}
            </div>
          </div>
        </div>

        {!isLoading && !supportsRemoteLogs ? (
          <div className="mt-6 rounded-[1rem] border border-amber-300/20 bg-amber-300/10 p-5 text-sm leading-7 text-amber-50">
            This device has not reported the <span className="font-mono">remote_log_stream</span>{" "}
            capability yet. Update it to the newest ESP32 firmware before expecting
            live Wi-Fi logs here.
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-cyan-400/50"
            disabled={isRequestingSnapshot}
            onClick={() => {
              void requestSnapshot(false);
            }}
          >
            {isRequestingSnapshot ? "Requesting snapshot..." : "Request snapshot"}
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-cyan-300/30 hover:text-white"
            onClick={handleReconnect}
          >
            Reconnect stream
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-cyan-300/30 hover:text-white"
            onClick={() => {
              startTransition(() => {
                setLogEntries([]);
                setActionMessage("Cleared the visible log window.");
              });
            }}
          >
            Clear window
          </button>
          <button
            type="button"
            className={`inline-flex items-center justify-center rounded-xl border px-4 py-3 text-sm font-semibold transition ${
              autoScroll
                ? "border-cyan-300/30 bg-cyan-400/12 text-cyan-100 hover:bg-cyan-400/18"
                : "border-white/10 bg-black/20 text-slate-200 hover:border-cyan-300/30 hover:text-white"
            }`}
            onClick={() => {
              setAutoScroll((current) => !current);
            }}
          >
            Auto-scroll {autoScroll ? "on" : "off"}
          </button>
        </div>

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

        <section className="mt-6 rounded-[1.2rem] border border-white/10 bg-slate-950/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-slate-500">
                Remote serial feed
              </div>
              <div className="mt-1 text-sm text-slate-300">
                {logEntries.length} visible lines
              </div>
            </div>
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
              Buffered boot logs appear after the device reaches MQTT, or when you request a snapshot.
            </div>
          </div>

          <div
            ref={logViewportRef}
            className="max-h-[68vh] overflow-y-auto px-5 py-4 font-mono text-[0.83rem] leading-6 text-slate-200"
          >
            {logEntries.length === 0 ? (
              <div className="rounded-[1rem] border border-dashed border-white/10 bg-white/[0.03] px-4 py-5 text-sm text-slate-400">
                {isLoading
                  ? "Loading device details..."
                  : "No remote logs have arrived yet. Leave this page open or request a snapshot once the device is online."}
              </div>
            ) : (
              <div className="space-y-1">
                {logEntries.map((entry, index) => (
                  <div
                    key={`${entry.sequence ?? "line"}-${entry.receivedAt}-${index}`}
                    className="grid grid-cols-[auto_auto_1fr] items-start gap-3 rounded-lg px-3 py-1.5 hover:bg-white/[0.03]"
                  >
                    <span
                      className={`text-[0.72rem] uppercase tracking-[0.14em] ${
                        entry.snapshot ? "text-amber-200/80" : "text-cyan-200/80"
                      }`}
                    >
                      {entry.snapshot ? "SNAP" : "LIVE"}
                    </span>
                    <span className="text-[0.72rem] text-slate-500">
                      {formatUptimeLabel(entry.uptimeMs)}
                    </span>
                    <span className="whitespace-pre-wrap break-words text-slate-100">
                      {entry.line}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
