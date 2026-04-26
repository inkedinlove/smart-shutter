"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";

import AppShell from "@/app/_components/app-shell";
import {
  fetchWithShortTimeout,
  readApiData,
  redirectToLogin,
  SessionRequiredError,
} from "@/lib/client-fetch";
import type { DeviceStatus, OtaState } from "@/lib/device";
import type {
  FirmwareAutoUpdatePreference,
  FirmwareCheckResponse,
  FirmwareManifestResponse,
} from "@/lib/firmware";
import { useDeviceRegistry } from "@/lib/use-device-registry";

const STATUS_POLL_MS = 3000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFirmwareCheckResponse(value: unknown): value is FirmwareCheckResponse {
  return (
    isRecord(value) &&
    typeof value.deviceId === "string" &&
    typeof value.channel === "string" &&
    typeof value.updateAvailable === "boolean"
  );
}

function isFirmwareManifestResponse(
  value: unknown,
): value is FirmwareManifestResponse {
  return (
    isRecord(value) &&
    typeof value.deviceId === "string" &&
    typeof value.channel === "string" &&
    typeof value.updateAvailable === "boolean"
  );
}

function isFirmwareAutoUpdatePreference(
  value: unknown,
): value is FirmwareAutoUpdatePreference {
  return (
    isRecord(value) &&
    typeof value.deviceId === "string" &&
    typeof value.autoUpdateEnabled === "boolean" &&
    typeof value.autoUpdateChannel === "string"
  );
}

function isDeviceStatus(value: unknown): value is DeviceStatus {
  return isRecord(value) && typeof value.deviceId === "string";
}

function formatVersion(value: string | null | undefined): string {
  return value && value.trim().length > 0 ? value : "Unavailable";
}

function formatReleaseNotes(value: string | null): string {
  return value && value.trim().length > 0
    ? value
    : "No release notes yet.";
}

function abbreviateSha256(value: string | null): string {
  if (!value) {
    return "Not published yet";
  }

  if (value.length <= 20) {
    return value;
  }

  return `${value.slice(0, 12)}...${value.slice(-8)}`;
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

function formatUptime(value: number | undefined): string {
  if (typeof value !== "number" || value < 0) {
    return "Not reported";
  }

  const totalSeconds = Math.floor(value / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function getResolvedOtaState(status: DeviceStatus | null): OtaState | null {
  if (!status) {
    return null;
  }

  if (status.otaState) {
    return status.otaState;
  }

  if (status.otaEnabled === false) {
    return "DISABLED";
  }

  if (status.otaEnabled === true) {
    return "IDLE";
  }

  return null;
}

function formatOtaState(state: OtaState | null): string {
  if (!state) {
    return "Waiting for status";
  }

  return state.replace(/_/g, " ");
}

function getOtaStateClasses(state: OtaState | null): string {
  if (!state) {
    return "border-slate-500/20 bg-slate-500/10 text-slate-200";
  }

  switch (state) {
    case "IDLE":
      return "border-slate-400/20 bg-slate-400/10 text-slate-100";
    case "DISABLED":
      return "border-slate-500/20 bg-slate-500/10 text-slate-200";
    case "CHECKING_MANIFEST":
    case "UPDATE_AVAILABLE":
    case "DOWNLOADING":
    case "VERIFYING_HASH":
    case "INSTALLING":
      return "border-amber-300/20 bg-amber-300/10 text-amber-100";
    case "REBOOTING":
    case "SUCCESS_PENDING_REBOOT":
      return "border-cyan-400/20 bg-cyan-400/10 text-cyan-100";
    case "FAILED":
      return "border-rose-300/20 bg-rose-300/10 text-rose-100";
    default:
      return "border-slate-500/20 bg-slate-500/10 text-slate-200";
  }
}

async function fetchDeviceStatus(deviceId: string): Promise<DeviceStatus> {
  const response = await fetchWithShortTimeout(
    `/api/device/status?deviceId=${encodeURIComponent(deviceId)}`,
    {
      cache: "no-store",
      timeoutMessage: "Device status timed out.",
    },
  );
  return readApiData(response, isDeviceStatus, "Unable to load device status.");
}

async function recordCheckStartedEvent(
  deviceId: string,
  payload: FirmwareCheckResponse,
  currentVersion: string | null,
) {
  const detail = [
    `current=${currentVersion ?? "unknown"}`,
    `latest=${payload.latestVersion ?? "none"}`,
    `updateAvailable=${payload.updateAvailable ? "true" : "false"}`,
  ].join(", ");

  await fetchWithShortTimeout(`/api/devices/${encodeURIComponent(deviceId)}/firmware/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      status: "check_started",
      firmwareVersionFrom: currentVersion,
      firmwareVersionTo: payload.latestVersion ?? "unknown",
      detail,
    }),
    timeoutMessage: "Recording the firmware event timed out.",
  });
}

async function fetchUpdateManifest(
  deviceId: string,
): Promise<FirmwareManifestResponse> {
  const response = await fetchWithShortTimeout(
    `/api/devices/${encodeURIComponent(deviceId)}/firmware/manifest`,
    {
      cache: "no-store",
      timeoutMessage: "Loading update details timed out.",
    },
  );
  return readApiData(
    response,
    isFirmwareManifestResponse,
    "Unable to load firmware manifest.",
  );
}

export default function FirmwareConsole() {
  const {
    deviceRegistryError,
    devices,
    isLoadingDevices,
    reloadDevices,
    selectedDevice,
    selectedDeviceId,
    setSelectedDeviceId,
  } = useDeviceRegistry();
  const [checkResult, setCheckResult] = useState<FirmwareCheckResponse | null>(null);
  const [manifestResult, setManifestResult] =
    useState<FirmwareManifestResponse | null>(null);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isSendingDeviceCheck, setIsSendingDeviceCheck] = useState(false);
  const [isLoadingManifest, setIsLoadingManifest] = useState(false);
  const [isSavingAutoUpdate, setIsSavingAutoUpdate] = useState(false);
  const [autoUpdateEnabledDraft, setAutoUpdateEnabledDraft] = useState(false);
  const [autoUpdateChannelDraft, setAutoUpdateChannelDraft] = useState("stable");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasLoadedStatus = useRef(false);

  useEffect(() => {
    setAutoUpdateEnabledDraft(selectedDevice?.otaAutoUpdateEnabled ?? false);
    setAutoUpdateChannelDraft(
      selectedDevice?.otaAutoUpdateChannel?.trim() || "stable",
    );
  }, [
    selectedDevice?.deviceId,
    selectedDevice?.otaAutoUpdateEnabled,
    selectedDevice?.otaAutoUpdateChannel,
  ]);

  useEffect(() => {
    if (!selectedDeviceId) {
      hasLoadedStatus.current = false;
      return;
    }

    hasLoadedStatus.current = false;
    let isCancelled = false;

    async function loadStatus(options?: { silent?: boolean }) {
      const shouldShowLoading =
        options?.silent !== true || !hasLoadedStatus.current;

      if (shouldShowLoading) {
        setIsLoadingStatus(true);
      }

      try {
        const status = await fetchDeviceStatus(selectedDeviceId);

        if (isCancelled) {
          return;
        }

        startTransition(() => {
          setDeviceStatus(status);
          setErrorMessage(null);
        });

        hasLoadedStatus.current = true;
      } catch (error) {
        if (isCancelled) {
          return;
        }

        if (error instanceof SessionRequiredError) {
          redirectToLogin(`/firmware?deviceId=${encodeURIComponent(selectedDeviceId)}`);
          return;
        }

        console.error("Unable to load firmware console device status:", error);

        startTransition(() => {
          setDeviceStatus(null);
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load device status.",
          );
        });
      } finally {
        if (!isCancelled && shouldShowLoading) {
          setIsLoadingStatus(false);
        }
      }
    }

    void loadStatus();

    const intervalId = window.setInterval(() => {
      void loadStatus({ silent: true });
    }, STATUS_POLL_MS);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [selectedDeviceId]);

  async function checkForUpdate(deviceId: string) {
    setIsChecking(true);
    setErrorMessage(null);
    setActionMessage(null);

    try {
      const [checkResponse, latestStatus] = await Promise.all([
        fetchWithShortTimeout(`/api/devices/${encodeURIComponent(deviceId)}/firmware/check`, {
          cache: "no-store",
          timeoutMessage: "Checking firmware timed out.",
        }),
        fetchDeviceStatus(deviceId).catch(() => null),
      ]);
      const payload = await readApiData(
        checkResponse,
        isFirmwareCheckResponse,
        "Unable to check for firmware updates.",
      );

      const currentReportedVersion =
        latestStatus?.firmwareVersion ?? payload.currentVersion ?? null;

      void recordCheckStartedEvent(deviceId, payload, currentReportedVersion).catch(
        (error) => {
          console.error("Unable to record firmware check event:", error);
        },
      );

      startTransition(() => {
        setCheckResult(payload);
        if (latestStatus) {
          setDeviceStatus(latestStatus);
        }
      });
    } catch (error) {
      if (error instanceof SessionRequiredError) {
        redirectToLogin(`/firmware?deviceId=${encodeURIComponent(deviceId)}`);
        return;
      }

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to check for firmware updates.",
      );
    } finally {
      setIsChecking(false);
    }
  }

  async function viewManifest(deviceId: string) {
    setIsLoadingManifest(true);
    setErrorMessage(null);
    setActionMessage(null);

    try {
      const manifest = await fetchUpdateManifest(deviceId);

      startTransition(() => {
        setManifestResult(manifest);
      });
    } catch (error) {
      if (error instanceof SessionRequiredError) {
        redirectToLogin(`/firmware?deviceId=${encodeURIComponent(deviceId)}`);
        return;
      }

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load firmware manifest.",
      );
    } finally {
      setIsLoadingManifest(false);
    }
  }

  async function sendDeviceUpdateCommand(deviceId: string) {
    setIsSendingDeviceCheck(true);
    setErrorMessage(null);
    setActionMessage(null);

    try {
      const response = await fetchWithShortTimeout("/api/device/command", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deviceId,
          type: "CHECK_UPDATE",
        }),
        timeoutMessage: "Sending the device update check timed out.",
      });
      await readApiData(
        response,
        (value): value is { command: unknown } =>
          isRecord(value) && "command" in value,
        "Unable to send the device OTA check command.",
      );

      startTransition(() => {
        setActionMessage(
          `Asked ${deviceId} to self-check for an update. If a compatible release is available, the device will download and install it over Wi-Fi when its safety checks allow it.`,
        );
      });
    } catch (error) {
      if (error instanceof SessionRequiredError) {
        redirectToLogin(`/firmware?deviceId=${encodeURIComponent(deviceId)}`);
        return;
      }

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to send the device OTA check command.",
      );
    } finally {
      setIsSendingDeviceCheck(false);
    }
  }

  async function saveAutoUpdatePreference(deviceId: string) {
    setIsSavingAutoUpdate(true);
    setErrorMessage(null);
    setActionMessage(null);

    try {
      const response = await fetchWithShortTimeout(
        `/api/devices/${encodeURIComponent(deviceId)}/firmware/preferences`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            autoUpdateEnabled: autoUpdateEnabledDraft,
            autoUpdateChannel: autoUpdateChannelDraft,
          }),
          timeoutMessage: "Saving auto-update preferences timed out.",
        },
      );
      const payload = await readApiData(
        response,
        isFirmwareAutoUpdatePreference,
        "Unable to save auto-update preferences.",
      );

      await reloadDevices();

      startTransition(() => {
        setAutoUpdateEnabledDraft(payload.autoUpdateEnabled);
        setAutoUpdateChannelDraft(payload.autoUpdateChannel);
        setActionMessage(
          payload.autoUpdateEnabled
            ? `${deviceId} will now self-check for ${payload.autoUpdateChannel} updates over Wi-Fi while it is online and idle.`
            : `Automatic Wi-Fi updates are now off for ${deviceId}. Manual update checks still work.`,
        );
      });
    } catch (error) {
      if (error instanceof SessionRequiredError) {
        redirectToLogin(`/firmware?deviceId=${encodeURIComponent(deviceId)}`);
        return;
      }

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to save auto-update preferences.",
      );
    } finally {
      setIsSavingAutoUpdate(false);
    }
  }

  const selectedDeviceStatus =
    deviceStatus?.deviceId === selectedDeviceId ? deviceStatus : null;
  const resolvedOtaState = getResolvedOtaState(selectedDeviceStatus);
  const currentVersion =
    selectedDeviceStatus?.firmwareVersion ??
    (checkResult?.deviceId === selectedDeviceId
      ? checkResult.currentVersion
      : selectedDevice?.firmwareVersion ?? null);
  const deviceReportsOtaReady =
    selectedDeviceStatus?.otaEnabled === true &&
    selectedDeviceStatus?.moving === false &&
    (resolvedOtaState === "IDLE" ||
      resolvedOtaState === "UPDATE_AVAILABLE" ||
      resolvedOtaState === "FAILED");
  const releaseCheckShowsUpdate =
    checkResult?.deviceId === selectedDeviceId &&
    checkResult?.updateAvailable === true;
  const statusBadge = useMemo(() => {
    if (!checkResult || checkResult.deviceId !== selectedDeviceId) {
      return {
        label: "Ready to check",
        className: "border-slate-500/20 bg-slate-500/10 text-slate-200",
      };
    }

    if (checkResult.updateAvailable) {
      return {
        label: "Update available",
        className: "border-amber-300/20 bg-amber-300/10 text-amber-100",
      };
    }

    return {
      label: "Up to date",
      className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
    };
  }, [checkResult, selectedDeviceId]);

  const deviceSelfCheckLabel = isSendingDeviceCheck
    ? "Checking device..."
    : releaseCheckShowsUpdate && deviceReportsOtaReady
      ? "Install update on device"
      : "Check/install on device";
  const activeErrorMessage = errorMessage ?? deviceRegistryError;
  const activeErrorNextAction = activeErrorMessage
    ? activeErrorMessage.toLowerCase().includes("offline")
      ? "Check power and Wi-Fi, then try again."
      : activeErrorMessage.toLowerCase().includes("status")
        ? "Wait a moment, then check the device again."
        : "Retry the firmware check in a moment."
    : null;
  const deviceOffline =
    Boolean(selectedDeviceId) &&
    !isLoadingStatus &&
    !activeErrorMessage &&
    (!selectedDeviceStatus?.lastSeenAt || !selectedDeviceStatus.online);
  const autoUpdateDraftChanged =
    autoUpdateEnabledDraft !== (selectedDevice?.otaAutoUpdateEnabled ?? false) ||
    autoUpdateChannelDraft !==
      (selectedDevice?.otaAutoUpdateChannel?.trim() || "stable");

  return (
    <AppShell
      currentPath="/firmware"
      devices={devices}
      isLoadingDevices={isLoadingDevices}
      selectedDeviceId={selectedDeviceId}
      onSelectDevice={(deviceId) => {
        setSelectedDeviceId(deviceId);
        setCheckResult(null);
        setManifestResult(null);
        setActionMessage(null);
        setErrorMessage(null);
      }}
    >
      <section className="dashboard-panel rounded-[1.2rem] p-6 sm:p-8 lg:p-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
              Firmware
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-[2.8rem]">
              Check device firmware.
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              See the current version, the latest release, and the update state.
            </p>
          </div>

          <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300">
            {selectedDevice?.label ?? "Loading selected device"}
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Current firmware
            </div>
            <div className="mt-3 text-xl font-semibold text-white">
              {formatVersion(currentVersion)}
            </div>
            <div className="mt-2 text-sm text-slate-400">
              {isLoadingStatus
                ? "Checking live status"
                : selectedDeviceStatus?.firmwareVersion
                  ? "Reported by device"
                  : "Waiting for live status"}
            </div>
          </div>

          <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Latest release
            </div>
            <div className="mt-3 text-xl font-semibold text-white">
              {formatVersion(checkResult?.latestVersion ?? null)}
            </div>
              <div className="mt-2 text-sm text-slate-400">
                {checkResult?.board ?? "esp32"} / {checkResult?.channel ?? "stable"}
              </div>
          </div>

          <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
              <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
                Update status
              </div>
            <div className="mt-3">
              <span
                className={`inline-flex rounded-full border px-4 py-2 text-sm font-semibold uppercase tracking-[0.18em] ${statusBadge.className}`}
              >
                {statusBadge.label}
              </span>
            </div>
            <div className="mt-3 text-sm text-slate-400">
              {checkResult ? (checkResult.updateAvailable ? "A newer release is available." : "This device is current.") : "Run a check to compare versions."}
            </div>
          </div>

          <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
              OTA state
            </div>
            <div className="mt-3">
              <span
                className={`inline-flex rounded-full border px-4 py-2 text-sm font-semibold uppercase tracking-[0.18em] ${getOtaStateClasses(resolvedOtaState)}`}
              >
                {formatOtaState(resolvedOtaState)}
              </span>
            </div>
            <div className="mt-3 text-sm text-slate-400">
              Last seen {formatLastSeen(selectedDeviceStatus?.lastSeenAt)}
            </div>
          </div>
        </div>

        {deviceOffline ? (
          <div className="mt-6 rounded-[1rem] border border-amber-300/20 bg-amber-300/10 p-5 text-amber-50">
            <div className="text-xs uppercase tracking-[0.24em] text-amber-100/80">
              Device is offline
            </div>
            <p className="mt-2 text-sm leading-7">
              Check power and Wi-Fi, then check the device again.
            </p>
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-base font-semibold text-white transition hover:border-cyan-300/40 hover:bg-cyan-400/10 sm:flex-1"
            onClick={() => {
              reloadDevices();
              if (selectedDeviceId) {
                void fetchDeviceStatus(selectedDeviceId)
                  .then((status) => {
                    setDeviceStatus(status);
                    setErrorMessage(null);
                  })
                  .catch((error: unknown) => {
                    if (error instanceof SessionRequiredError) {
                      redirectToLogin(`/firmware?deviceId=${encodeURIComponent(selectedDeviceId)}`);
                      return;
                    }

                    setErrorMessage(
                      error instanceof Error
                        ? error.message
                        : "Unable to load device status.",
                    );
                  });
              }
            }}
          >
            {isLoadingStatus ? "Checking device..." : "Check again"}
          </button>

          <button
            type="button"
            className="w-full rounded-xl bg-cyan-400 px-4 py-4 text-base font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-cyan-400/50 sm:flex-1"
            disabled={isLoadingDevices || isChecking || !selectedDeviceId}
            onClick={() => {
              if (selectedDeviceId) {
                void checkForUpdate(selectedDeviceId);
              }
            }}
          >
            {isChecking ? "Checking..." : "Check for update"}
          </button>

          <button
            type="button"
            className="w-full rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-4 text-base font-semibold text-amber-50 transition hover:bg-amber-300/20 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-1"
            disabled={isLoadingDevices || isSendingDeviceCheck || !selectedDeviceId}
            onClick={() => {
              if (selectedDeviceId) {
                void sendDeviceUpdateCommand(selectedDeviceId);
              }
            }}
          >
            {deviceSelfCheckLabel}
          </button>

          <button
            type="button"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-base font-semibold text-white transition hover:border-cyan-300/40 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-1"
            disabled={isLoadingDevices || isLoadingManifest || !selectedDeviceId}
            onClick={() => {
              if (selectedDeviceId) {
                void viewManifest(selectedDeviceId);
              }
            }}
          >
            {isLoadingManifest ? "Loading details..." : "View manifest"}
          </button>

        </div>

        {selectedDeviceStatus?.safetyMode === true ? (
          <div className="mt-6 rounded-[1rem] border border-amber-300/20 bg-amber-300/10 p-5 text-amber-50">
            <div className="text-xs uppercase tracking-[0.24em] text-amber-100/80">
              Safety mode is on
            </div>
            <p className="mt-3 text-sm leading-7">
              Keep attached-shutter testing in the safe calibration flow until direction and smooth movement are confirmed.
            </p>
          </div>
        ) : null}

        <div className="mt-6 rounded-[1rem] border border-white/10 bg-white/5 p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
                Auto update
              </div>
              <div className="text-xl font-semibold text-white">
                Let this device install future firmware over Wi-Fi.
              </div>
              <p className="max-w-3xl text-sm leading-7 text-slate-400">
                When enabled, the device checks for new releases on its own roughly hourly while it is online and idle. Manual update checks still work either way.
              </p>
            </div>

            <div className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-slate-300">
              Current:{" "}
              {selectedDevice?.otaAutoUpdateEnabled
                ? `Auto (${selectedDevice?.otaAutoUpdateChannel ?? "stable"})`
                : "Manual only"}
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_auto]">
            <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-slate-200">
              <input
                checked={autoUpdateEnabledDraft}
                className="mt-1"
                type="checkbox"
                onChange={(event) => {
                  setAutoUpdateEnabledDraft(event.target.checked);
                }}
              />
              <span>
                <span className="block font-semibold text-white">
                  Install updates automatically
                </span>
                <span className="mt-1 block text-slate-400">
                  Best for shutters that stay powered and connected.
                </span>
              </span>
            </label>

            <label className="block">
              <span className="text-sm text-slate-300">Release channel</span>
              <select
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!autoUpdateEnabledDraft}
                value={autoUpdateChannelDraft}
                onChange={(event) => {
                  setAutoUpdateChannelDraft(event.target.value);
                }}
              >
                <option value="stable">Stable</option>
                <option value="beta">Beta</option>
              </select>
            </label>

            <button
              type="button"
              className="rounded-xl bg-cyan-400 px-4 py-4 text-base font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-cyan-400/50"
              disabled={
                !selectedDeviceId ||
                isSavingAutoUpdate ||
                !autoUpdateDraftChanged
              }
              onClick={() => {
                if (selectedDeviceId) {
                  void saveAutoUpdatePreference(selectedDeviceId);
                }
              }}
            >
              {isSavingAutoUpdate ? "Saving..." : "Save auto-update setting"}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Device status
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-sm text-slate-400">Selected device</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {selectedDevice?.label ?? "No device selected"}
                </div>
                <div className="mt-2 font-mono text-sm text-cyan-100">
                  {selectedDevice?.deviceId ?? "--"}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-sm text-slate-400">Last seen</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {formatLastSeen(selectedDeviceStatus?.lastSeenAt)}
                </div>
                <div className="mt-2 text-sm text-slate-400">
                  Uptime {formatUptime(selectedDeviceStatus?.deviceUptimeMs)}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-sm text-slate-400">Signal</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {typeof selectedDeviceStatus?.rssi === "number"
                    ? `${selectedDeviceStatus.rssi} dBm`
                    : "Not reported"}
                </div>
                <div className="mt-2 text-sm text-slate-400">
                  OTA {selectedDeviceStatus?.otaEnabled === true ? "enabled" : selectedDeviceStatus?.otaEnabled === false ? "disabled" : "unknown"}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-sm text-slate-400">Target version</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {formatVersion(selectedDeviceStatus?.otaTargetVersion)}
                </div>
                <div className="mt-2 text-sm text-slate-400">
                  {selectedDeviceStatus?.otaLastError ?? "No OTA error"}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Release details
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-sm text-slate-400">Version</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {formatVersion(checkResult?.latestVersion ?? null)}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-sm text-slate-400">Board</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {checkResult?.board ?? "Not published yet"}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-sm text-slate-400">Channel</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {checkResult?.channel ?? "stable"}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-sm text-slate-400">Size</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {typeof checkResult?.sizeBytes === "number"
                    ? `${checkResult.sizeBytes.toLocaleString()} bytes`
                    : "Not published yet"}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="text-sm text-slate-400">SHA-256</div>
              <div className="mt-2 font-mono text-sm text-cyan-100">
                {abbreviateSha256(checkResult?.sha256 ?? null)}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="text-sm text-slate-400">Release notes</div>
              <div className="mt-2 text-sm leading-7 text-white">
                {formatReleaseNotes(checkResult?.releaseNotes ?? null)}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-sm text-slate-400">Artifact URL</div>
                <div className="wrap-anywhere mt-2 font-mono text-sm text-white">
                  {checkResult?.artifactUrl ?? "Available after release publish"}
                </div>
              </div>
          </div>
        </div>

        {manifestResult ? (
          <div className="mt-6 rounded-[1rem] border border-white/10 bg-black/25 p-5">
            <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
              Update details
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-sm text-slate-400">Current version</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {formatVersion(manifestResult.currentVersion)}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-sm text-slate-400">Latest version</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {formatVersion(manifestResult.latestVersion)}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-sm text-slate-400">Board / Channel</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {manifestResult.board} / {manifestResult.channel}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-sm text-slate-400">Update available</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {manifestResult.updateAvailable ? "Yes" : "No"}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-sm text-slate-400">Artifact</div>
                <div className="mt-2 wrap-anywhere font-mono text-sm text-cyan-100">
                  {manifestResult.artifactUrl ?? "No artifact published"}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-sm text-slate-400">SHA-256</div>
                <div className="mt-2 wrap-anywhere font-mono text-sm text-cyan-100">
                  {manifestResult.sha256 ?? "No hash published"}
                </div>
                <div className="mt-2 text-sm text-slate-400">
                  {typeof manifestResult.sizeBytes === "number"
                    ? `${manifestResult.sizeBytes.toLocaleString()} bytes`
                    : "Size not published"}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {activeErrorMessage ? (
          <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
            <div className="font-semibold text-amber-50">{activeErrorMessage}</div>
            {activeErrorNextAction ? (
              <div className="mt-1 text-amber-100/90">{activeErrorNextAction}</div>
            ) : null}
          </div>
        ) : null}

        {actionMessage ? (
          <p className="mt-4 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
            {actionMessage}
          </p>
        ) : null}
      </section>
    </AppShell>
  );
}
