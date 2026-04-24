"use client";

import { startTransition, useEffect, useRef, useState } from "react";

import AppShell from "@/app/_components/app-shell";
import { fetchWithShortTimeout } from "@/lib/client-fetch";
import {
  createDefaultDeviceStatus,
  type DeviceCommand,
  type DeviceCommandInput,
  type DeviceMode,
  type DeviceStatus,
} from "@/lib/device";
import { useDeviceRegistry } from "@/lib/use-device-registry";

type DashboardCommandInput =
  | {
      type: "SET_PERCENT";
      value: number;
    }
  | {
      type: "STOP";
    };

type FirstTestStep = {
  label: string;
};

const PRESET_VALUES = [0, 25, 50, 75, 100] as const;
const STATUS_POLL_MS = 3000;
const FIRST_TEST_SEQUENCE: FirstTestStep[] = [
  {
    label: "50%",
  },
  {
    label: "STOP",
  },
  {
    label: "0%",
  },
  {
    label: "100%",
  },
  {
    label: "25%",
  },
  {
    label: "75%",
  },
];
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDeviceStatus(value: unknown): value is DeviceStatus {
  return isRecord(value) && typeof value.deviceId === "string";
}

function formatLastSeen(lastSeenAt: string | null): string {
  if (!lastSeenAt) {
    return "Waiting for status";
  }

  const parsedDate = new Date(lastSeenAt);

  if (Number.isNaN(parsedDate.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsedDate);
}

function formatPercent(value: number | null): string {
  return value === null ? "--" : `${Math.round(value)}%`;
}

function getConnectionLabel(status: DeviceStatus): string {
  if (!status.lastSeenAt) {
    return "Unknown";
  }

  return status.online ? "Online" : "Offline";
}

function formatDeviceMode(mode: DeviceMode): string {
  return mode.replace(/_/g, " ");
}

function getDeviceModeLabel(status: DeviceStatus): string {
  if (!status.lastSeenAt) {
    return "Unknown";
  }

  return formatDeviceMode(status.deviceMode);
}

function getDeviceModeClasses(mode: DeviceMode, hasSeenStatus: boolean): string {
  if (!hasSeenStatus) {
    return "border-slate-500/20 bg-slate-500/10 text-slate-200";
  }

  switch (mode) {
    case "READY":
      return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
    case "MOVING":
      return "border-cyan-400/20 bg-cyan-400/10 text-cyan-200";
    case "BOOTING":
    case "WIFI_CONNECTING":
    case "MQTT_CONNECTING":
      return "border-amber-300/20 bg-amber-300/10 text-amber-100";
    case "ERROR":
      return "border-rose-300/20 bg-rose-300/10 text-rose-100";
    default:
      return "border-slate-500/20 bg-slate-500/10 text-slate-200";
  }
}

export default function Home() {
  const {
    deviceRegistryError,
    devices,
    isLoadingDevices,
    selectedDevice,
    selectedDeviceId,
    setSelectedDeviceId,
  } = useDeviceRegistry();
  const [status, setStatus] = useState<DeviceStatus>(
    createDefaultDeviceStatus(""),
  );
  const [sliderValue, setSliderValue] = useState(50);
  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasSyncedInitialValue = useRef(false);

  useEffect(() => {
    if (!selectedDeviceId) {
      hasSyncedInitialValue.current = false;
      setFeedback(null);
      setStatus(createDefaultDeviceStatus(""));
      return;
    }

    hasSyncedInitialValue.current = false;
    setFeedback(null);

    let isCancelled = false;

    async function loadStatus() {
      try {
        const response = await fetchWithShortTimeout(
          `/api/device/status?deviceId=${encodeURIComponent(selectedDeviceId)}`,
          {
            cache: "no-store",
            timeoutMessage: "Device status timed out.",
          },
        );
        const payload = (await response.json()) as unknown;

        if (!response.ok) {
          throw new Error(
            isRecord(payload) && typeof payload.error === "string"
              ? payload.error
              : "Unable to load device status.",
          );
        }

        if (!isDeviceStatus(payload)) {
          throw new Error("The device status response was invalid.");
        }

        if (isCancelled) {
          return;
        }

        const nextStatus = payload;

        startTransition(() => {
          setStatus(nextStatus);
          setErrorMessage(null);
        });

        if (!hasSyncedInitialValue.current) {
          const initialValue = nextStatus.targetPercent ?? nextStatus.estimatedPercent;

          if (typeof initialValue === "number") {
            setSliderValue(Math.round(initialValue));
          }

          hasSyncedInitialValue.current = true;
        }
      } catch (error) {
        if (isCancelled) {
          return;
        }

        startTransition(() => {
          setStatus(createDefaultDeviceStatus(selectedDeviceId));
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Status polling is unavailable right now.",
          );
        });
      }
    }

    void loadStatus();

    const intervalId = window.setInterval(() => {
      void loadStatus();
    }, STATUS_POLL_MS);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [selectedDeviceId]);

  async function sendCommand(commandInput: DashboardCommandInput) {
    if (!selectedDeviceId) {
      return;
    }

    setIsSending(true);
    setFeedback(null);
    setErrorMessage(null);

    if (commandInput.type === "SET_PERCENT") {
      setSliderValue(commandInput.value);
    }

    const requestBody: DeviceCommandInput =
      commandInput.type === "STOP"
        ? { deviceId: selectedDeviceId, type: "STOP" }
        : {
            deviceId: selectedDeviceId,
            type: "SET_PERCENT",
            value: commandInput.value,
          };

    try {
      const response = await fetchWithShortTimeout("/api/device/command", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        timeoutMessage: "Sending the command timed out.",
      });

      const payload = (await response.json()) as {
        command?: DeviceCommand;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to send the command.");
      }

      if (payload.command?.type === "STOP") {
        setFeedback(`Sent STOP command to ${selectedDeviceId}.`);
      } else if (commandInput.type === "SET_PERCENT") {
        setFeedback(`Sent ${commandInput.value}% command to ${selectedDeviceId}.`);
      } else {
        setFeedback(`Sent command to ${selectedDeviceId}.`);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to send the command.",
      );
    } finally {
      setIsSending(false);
    }
  }

  const progressValue = Math.max(
    0,
    Math.min(100, Math.round(status.estimatedPercent ?? sliderValue)),
  );
  const activeErrorMessage = errorMessage ?? deviceRegistryError;

  return (
    <AppShell
      currentPath="/"
      devices={devices}
      isLoadingDevices={isLoadingDevices}
      selectedDeviceId={selectedDeviceId}
      onSelectDevice={(deviceId) => {
        setSelectedDeviceId(deviceId);
        setFeedback(null);
        setErrorMessage(null);
      }}
    >
      <section className="dashboard-panel rounded-[1.2rem] p-6 sm:p-8 lg:p-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
              Dashboard
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-[2.8rem]">
              Control the shutter.
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Send a movement command and confirm the latest position.
            </p>
          </div>

          <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300">
            {selectedDevice?.label ?? "Loading selected device"}
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Connection
            </div>
            <div className="mt-3 text-xl font-semibold text-white">
              {getConnectionLabel(status)}
            </div>
            <div className="mt-2 text-sm text-slate-400">
              Last seen {formatLastSeen(status.lastSeenAt)}
            </div>
          </div>

          <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Device mode
            </div>
            <div className="mt-3">
              <span
                className={`inline-flex rounded-full border px-4 py-2 text-sm font-semibold uppercase tracking-[0.18em] ${getDeviceModeClasses(status.deviceMode, Boolean(status.lastSeenAt))}`}
              >
                {getDeviceModeLabel(status)}
              </span>
            </div>
            <div className="mt-3 text-sm text-slate-400">Current device state</div>
          </div>

          <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Estimated position
            </div>
            <div className="mt-3 text-xl font-semibold text-white">
              {formatPercent(status.estimatedPercent)}
            </div>
            <div className="mt-2 text-sm text-slate-400">
              Target {formatPercent(status.targetPercent)}
            </div>
          </div>

          <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Motion
            </div>
            <div className="mt-3 text-xl font-semibold text-white">
              {status.moving ? "Moving" : "Idle"}
            </div>
            <div className="mt-2 text-sm text-slate-400">
              Updated from live device status
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-[1rem] border border-white/10 bg-black/20 p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
                Live snapshot
              </div>
              <div className="mt-2 text-5xl font-semibold tracking-tight text-white">
                {progressValue}%
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300">
                {selectedDeviceId || "No device selected"}
              </div>
              <div
                className={`rounded-full border px-4 py-2 text-sm ${getDeviceModeClasses(status.deviceMode, Boolean(status.lastSeenAt))}`}
              >
                {getDeviceModeLabel(status)}
              </div>
            </div>
          </div>

          <div className="mt-6 h-3 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-sky-400 to-cyan-500 transition-[width] duration-500"
              style={{ width: `${progressValue}%` }}
            />
          </div>
        </div>

        <div className="mt-6 rounded-[1rem] border border-amber-300/20 bg-amber-300/10 p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-amber-100/80">
                Before the first move
              </div>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                Start small
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-amber-50/90">
                Keep hands clear of the shutter. Press STOP immediately if the shutter binds,
                buzzes, clicks, or strains.
              </p>
            </div>

            <div className="rounded-full border border-amber-200/20 bg-black/20 px-4 py-2 text-sm text-amber-100">
              Guided sequence
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            {FIRST_TEST_SEQUENCE.map((step, index) => (
              <div
                key={step.label}
                className="rounded-full border border-white/10 bg-black/15 px-4 py-2 text-sm font-medium text-white"
              >
                {index + 1}. {step.label}
              </div>
            ))}
          </div>

          <p className="mt-4 text-sm text-amber-50/80">
            Use the controls below for movement. Use <span className="font-semibold text-white">/connect</span> for the guided setup flow.
          </p>
        </div>

        <div className="mt-6 rounded-[1rem] border border-white/10 bg-white/5 p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                Controls
              </div>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                Move
              </h2>
            </div>
            <div className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-slate-300">
              Selected {sliderValue}%
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {PRESET_VALUES.map((presetValue) => (
              <button
                key={presetValue}
                type="button"
                className="rounded-xl border border-white/10 bg-black/20 px-4 py-4 text-base font-medium text-white transition hover:border-cyan-300/40 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isSending || !selectedDeviceId}
                onClick={() => {
                  void sendCommand({ type: "SET_PERCENT", value: presetValue });
                }}
              >
                {presetValue}%
              </button>
            ))}
          </div>

          <div className="mt-6 rounded-[1rem] border border-white/10 bg-black/20 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-slate-200">Custom target</div>
                <div className="text-sm text-slate-400">
                  Send a movement command for the selected device.
                </div>
              </div>
              <div className="text-3xl font-semibold text-white">{sliderValue}%</div>
            </div>

            <div className="mt-6">
              <input
                aria-label="Shutter target percentage"
                className="range-slider"
                disabled={isSending || !selectedDeviceId}
                max={100}
                min={0}
                step={1}
                type="range"
                value={sliderValue}
                onChange={(event) => {
                  setSliderValue(Number(event.target.value));
                }}
              />
              <div className="mt-3 flex justify-between text-xs uppercase tracking-[0.24em] text-slate-500">
                <span>Closed</span>
                <span>Half</span>
                <span>Open</span>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                className="w-full rounded-xl bg-cyan-400 px-4 py-4 text-base font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-cyan-400/50"
                disabled={isSending || !selectedDeviceId}
                onClick={() => {
                  void sendCommand({ type: "SET_PERCENT", value: sliderValue });
                }}
              >
                {isSending ? "Sending..." : `Send ${sliderValue}%`}
              </button>

              <button
                type="button"
                className="w-full rounded-xl border border-rose-300/35 bg-rose-300/15 px-4 py-4 text-base font-semibold uppercase tracking-[0.18em] text-rose-50 transition hover:bg-rose-300/25 disabled:cursor-not-allowed disabled:opacity-50 sm:max-w-56"
                disabled={isSending || !selectedDeviceId}
                onClick={() => {
                  void sendCommand({ type: "STOP" });
                }}
              >
                STOP
              </button>
            </div>

            <p className="mt-4 text-sm text-slate-400">
              Use STOP immediately if the shutter sounds strained or moves the wrong way.
            </p>

            {feedback ? (
              <p className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
                {feedback}
              </p>
            ) : null}

            {activeErrorMessage ? (
              <p className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
                {activeErrorMessage}
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
