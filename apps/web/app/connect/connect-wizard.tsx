"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { startTransition, useEffect, useMemo, useState } from "react";

import AppShell from "@/app/_components/app-shell";
import {
  fetchWithShortTimeout,
  readApiData,
  redirectToLogin,
  SessionRequiredError,
} from "@/lib/client-fetch";
import {
  DEFAULT_NUDGE_AMOUNT,
  DEFAULT_SAFE_ALLOWED_MAX_PERCENT_STEP,
  createDeviceDiagnostics,
  type DeviceDiagnostics,
  type DeviceClaimState,
  type DeviceCommand,
  type DeviceStatus,
  type OtaState,
} from "@/lib/device";
import type { FirmwareCheckResponse } from "@/lib/firmware";
import { useDeviceRegistry } from "@/lib/use-device-registry";

const STATUS_POLL_MS = 3000;
const METRIC_CARD_CLASS =
  "min-w-0 rounded-[1rem] border border-white/10 bg-white/5 p-5";
const METRIC_LABEL_CLASS =
  "text-[11px] uppercase tracking-[0.22em] text-slate-400";
const METRIC_VALUE_CLASS =
  "mt-3 wrap-anywhere break-words text-base font-semibold leading-snug text-white";
const METRIC_META_CLASS = "mt-2 wrap-anywhere text-sm leading-6 text-slate-400";
const SUMMARY_CARD_CLASS =
  "min-w-0 rounded-[1rem] border border-white/10 bg-white/5 px-4 py-4";
const CALIBRATION_PROGRESS_STEPS = [
  "Move",
  "Direction",
  "Closed",
  "Open",
  "Done",
] as const;

const SETUP_STEPS = [
  {
    shortLabel: "Connect",
    title: "Connect Device",
  },
  {
    shortLabel: "Check",
    title: "Check Firmware",
  },
  {
    shortLabel: "Calibrate",
    title: "Calibrate Safely",
  },
  {
    shortLabel: "Confirm",
    title: "Confirm Setup",
  },
  {
    shortLabel: "Test",
    title: "Test Movement",
  },
] as const;

const MOVEMENT_SEQUENCE = [
  {
    label: "50%",
    command: { type: "SET_PERCENT", value: 50 } as const,
    danger: false,
  },
  {
    label: "STOP",
    command: { type: "STOP" } as const,
    danger: true,
  },
  {
    label: "0%",
    command: { type: "SET_PERCENT", value: 0 } as const,
    danger: false,
  },
  {
    label: "100%",
    command: { type: "SET_PERCENT", value: 100 } as const,
    danger: false,
  },
  {
    label: "25%",
    command: { type: "SET_PERCENT", value: 25 } as const,
    danger: false,
  },
  {
    label: "75%",
    command: { type: "SET_PERCENT", value: 75 } as const,
    danger: false,
  },
] as const;

type ConnectWizardCommandInput =
  | { type: "SET_PERCENT"; value: number }
  | { type: "STOP" }
  | { type: "NUDGE_OPEN" | "NUDGE_CLOSE"; amount: number }
  | {
      type:
        | "SET_CURRENT_AS_CLOSED"
        | "SET_CURRENT_AS_OPEN"
        | "MARK_CALIBRATION_COMPLETE"
        | "LOCK_MOVEMENT"
        | "UNLOCK_MOVEMENT";
    };

type CalibrationGuideStage =
  | "prepare"
  | "direction"
  | "closed"
  | "open"
  | "finish"
  | "done";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDeviceStatus(value: unknown): value is DeviceStatus {
  return isRecord(value) && typeof value.deviceId === "string";
}

function isFirmwareCheckResponse(value: unknown): value is FirmwareCheckResponse {
  return (
    isRecord(value) &&
    typeof value.deviceId === "string" &&
    typeof value.channel === "string" &&
    typeof value.updateAvailable === "boolean"
  );
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

function formatVersion(value: string | null | undefined): string {
  return value && value.trim().length > 0 ? value : "Unavailable";
}

function formatDeviceLabel(
  value: string | null | undefined,
  fallback = "Waiting for status",
): string {
  if (!value || value.trim().length === 0) {
    return fallback;
  }

  return value
    .trim()
    .toLowerCase()
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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

function formatToggleState(
  value: boolean | null | undefined,
  labels: { on: string; off: string; unknown?: string },
): string {
  if (value === true) {
    return labels.on;
  }

  if (value === false) {
    return labels.off;
  }

  return labels.unknown ?? "Unknown";
}

function formatSignalStrength(value: number | null | undefined): string {
  return typeof value === "number" ? `${value} dBm` : "Unavailable";
}

function formatCalibrationState(status: DeviceStatus | null): string {
  if (status?.calibrationComplete === true) {
    return "Complete";
  }

  if (status?.safetyMode === true) {
    return "Required";
  }

  if (status?.lastSeenAt) {
    return "Waiting";
  }

  return "Unknown";
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

function getConnectivityLabel(status: DeviceStatus | null): string {
  if (!status?.lastSeenAt) {
    return "Unknown";
  }

  return status.online ? "Online" : "Offline";
}

function getConnectivityClasses(status: DeviceStatus | null): string {
  if (!status?.lastSeenAt) {
    return "border-slate-500/20 bg-slate-500/10 text-slate-200";
  }

  return status.online
    ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
    : "border-amber-300/20 bg-amber-300/10 text-amber-100";
}

function getDeviceHealth(status: DeviceStatus | null, otaState: OtaState | null) {
  if (!status?.lastSeenAt) {
    return {
      label: "Unknown",
      tone: "default" as const,
    };
  }

  if (!status.online || status.deviceMode === "ERROR" || otaState === "FAILED") {
    return {
      label: "Needs attention",
      tone: "warning" as const,
    };
  }

  return {
    label: "Good",
    tone: "success" as const,
  };
}

function getClaimStateLabel(claimState: DeviceClaimState | null | undefined): string {
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

function getClaimStateMessage(
  registration: DeviceRegistrationState | null,
): string {
  if (!registration) {
    return "Waiting for device access";
  }

  if (registration.claimState === "unknown") {
    return "Register this device before setup continues.";
  }

  if (registration.claimState === "unclaimed") {
    return "Claim this device to continue.";
  }

  return registration.ownedByCurrentProfile
    ? "This device is attached to your account."
    : "This device belongs to another account.";
}

function SetupStepRail({
  currentStepIndex,
  onSelectStep,
}: {
  currentStepIndex: number;
  onSelectStep: (stepIndex: number) => void;
}) {
  return (
    <section className="rounded-[1rem] border border-white/10 bg-black/18 p-4 sm:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        {SETUP_STEPS.map((step, index) => {
          const isComplete = index < currentStepIndex;
          const isActive = index === currentStepIndex;

          return (
            <div key={step.title} className="flex min-w-0 flex-1 items-center gap-4">
              <button
                type="button"
                className="min-w-0 text-left"
                onClick={() => {
                  onSelectStep(index);
                }}
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition ${
                      isActive
                        ? "border-cyan-300/40 bg-cyan-400/18 text-white"
                        : isComplete
                          ? "border-emerald-400/25 bg-emerald-400/12 text-emerald-200"
                          : "border-white/10 bg-white/5 text-slate-300"
                    }`}
                  >
                    {index + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-white">
                      {step.shortLabel}
                    </div>
                  </div>
                </div>
              </button>

              {index < SETUP_STEPS.length - 1 ? (
                <div className="hidden h-px flex-1 bg-white/10 xl:block" />
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SummaryCard({
  label,
  value,
  meta,
  badge,
}: {
  label: string;
  value: string;
  meta?: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className={SUMMARY_CARD_CLASS}>
      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
          {label}
        </div>
        {badge}
      </div>
      <div className="mt-2 wrap-anywhere break-words text-base font-semibold text-white">
        {value}
      </div>
      {meta ? (
        <div className="mt-2 wrap-anywhere break-words text-sm leading-6 text-slate-400">
          {meta}
        </div>
      ) : null}
    </div>
  );
}

function getCalibrationProgressIndex(stage: CalibrationGuideStage): number {
  switch (stage) {
    case "prepare":
      return 0;
    case "direction":
      return 1;
    case "closed":
      return 2;
    case "open":
      return 3;
    case "finish":
    case "done":
      return 4;
    default:
      return 0;
  }
}

function CalibrationProgress({
  stage,
  completed,
}: {
  stage: CalibrationGuideStage;
  completed: boolean;
}) {
  const activeIndex = getCalibrationProgressIndex(stage);

  return (
    <div className="grid gap-3 sm:grid-cols-5">
      {CALIBRATION_PROGRESS_STEPS.map((label, index) => {
        const isComplete = completed || index < activeIndex;
        const isActive = !completed && index === activeIndex;

        return (
          <div
            key={label}
            className={`rounded-[0.95rem] border px-4 py-3 text-sm transition ${
              isActive
                ? "border-cyan-300/35 bg-cyan-400/12 text-white"
                : isComplete
                  ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
                  : "border-white/10 bg-white/5 text-slate-300"
            }`}
          >
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
              {index + 1}
            </div>
            <div className="mt-2 font-semibold">{label}</div>
          </div>
        );
      })}
    </div>
  );
}

function NoticeCard({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[1rem] border border-white/10 bg-white/5 p-4">
      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
        {title}
      </div>
      <div className="mt-2 wrap-anywhere text-sm leading-6 text-slate-300">
        {body}
      </div>
    </div>
  );
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

async function fetchFirmwareCheck(
  deviceId: string,
): Promise<FirmwareCheckResponse> {
  const response = await fetchWithShortTimeout(
    `/api/devices/${encodeURIComponent(deviceId)}/firmware/check`,
    {
      cache: "no-store",
      timeoutMessage: "Firmware check timed out.",
    },
  );
  return readApiData(
    response,
    isFirmwareCheckResponse,
    "Unable to check firmware status.",
  );
}

async function fetchDeviceRegistrationState(
  deviceId: string,
): Promise<DeviceRegistrationState> {
  const response = await fetchWithShortTimeout(
    `/api/devices/${encodeURIComponent(deviceId)}/registration`,
    {
      cache: "no-store",
      timeoutMessage: "Device registration lookup timed out.",
    },
  );
  return readApiData(
    response,
    isDeviceRegistrationState,
    "Unable to load device registration.",
  );
}

function getCommandSuccessMessage(
  deviceId: string,
  command: DeviceCommand | undefined,
): string {
  if (!command) {
    return `Sent command to ${deviceId}.`;
  }

  switch (command.type) {
    case "STOP":
      return `Sent STOP to ${deviceId}.`;
    case "SET_PERCENT":
      return `Sent ${command.value}% to ${deviceId}.`;
    case "NUDGE_OPEN":
      return `Sent Nudge Open (${command.amount}%) to ${deviceId}.`;
    case "NUDGE_CLOSE":
      return `Sent Nudge Close (${command.amount}%) to ${deviceId}.`;
    case "SET_CURRENT_AS_CLOSED":
      return `Marked the current position as closed for ${deviceId}.`;
    case "SET_CURRENT_AS_OPEN":
      return `Marked the current position as open for ${deviceId}.`;
    case "MARK_CALIBRATION_COMPLETE":
      return `Marked calibration complete for ${deviceId}.`;
    case "LOCK_MOVEMENT":
      return `Locked movement for ${deviceId}.`;
    case "UNLOCK_MOVEMENT":
      return `Unlocked movement for ${deviceId}.`;
    case "CHECK_UPDATE":
      return `Asked ${deviceId} to check for updates.`;
    default:
      return `Sent command to ${deviceId}.`;
  }
}

function getRecoveryMessage(errorMessage: string | null): string | null {
  if (!errorMessage) {
    return null;
  }

  const normalized = errorMessage.toLowerCase();

  if (normalized.includes("offline")) {
    return "Check power and Wi-Fi, then try the connection again.";
  }

  if (
    normalized.includes("not attached to your account") ||
    normalized.includes("device not found")
  ) {
    return "Choose a device from your account or claim the device first.";
  }

  if (
    normalized.includes("status is unavailable") ||
    normalized.includes("timed out") ||
    normalized.includes("publish")
  ) {
    return "Wait a moment, then check the connection again.";
  }

  if (normalized.includes("calibration")) {
    return "Finish calibration before trying a larger movement.";
  }

  if (normalized.includes("safe setup mode")) {
    return "Keep movement small until setup is complete.";
  }

  return "Try again. If the device still does not respond, check the installation.";
}

export default function ConnectWizard() {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [calibrationGuideStage, setCalibrationGuideStage] =
    useState<CalibrationGuideStage>("prepare");
  const [isRecalibrating, setIsRecalibrating] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null);
  const [checkResult, setCheckResult] = useState<FirmwareCheckResponse | null>(null);
  const [isCheckingFirmware, setIsCheckingFirmware] = useState(false);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [registrationState, setRegistrationState] =
    useState<DeviceRegistrationState | null>(null);
  const [isSendingCommand, setIsSendingCommand] = useState(false);
  const [statusRetryToken, setStatusRetryToken] = useState(0);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const {
    deviceRegistryError,
    devices,
    isLoadingDevices,
    reloadDevices,
    selectedDevice,
    selectedDeviceId,
    setSelectedDeviceId,
  } = useDeviceRegistry();
  const requestedDeviceId = searchParams.get("deviceId")?.trim() || "";

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
          redirectToLogin(`/connect?deviceId=${encodeURIComponent(requestedDeviceId)}`);
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
          redirectToLogin(`/connect?deviceId=${encodeURIComponent(selectedDeviceId)}`);
          return;
        }

        console.error("Unable to load connect wizard device status:", error);

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

    const intervalId = window.setInterval(() => {
      void loadStatus();
    }, STATUS_POLL_MS);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [selectedDeviceId, statusRetryToken]);

  async function runFirmwareCheck() {
    if (!selectedDeviceId) {
      return;
    }

    setIsCheckingFirmware(true);
    setActionMessage(null);
    setErrorMessage(null);

    try {
      const [latestStatus, latestCheck] = await Promise.all([
        fetchDeviceStatus(selectedDeviceId),
        fetchFirmwareCheck(selectedDeviceId),
      ]);

      startTransition(() => {
        setDeviceStatus(latestStatus);
        setCheckResult(latestCheck);
        setCurrentStepIndex(2);
        setActionMessage(`Checked setup status for ${selectedDeviceId}.`);
      });
    } catch (error) {
      if (error instanceof SessionRequiredError) {
        redirectToLogin(`/connect?deviceId=${encodeURIComponent(selectedDeviceId)}`);
        return;
      }

      setErrorMessage(
        error instanceof Error ? error.message : "Unable to check firmware.",
      );
    } finally {
      setIsCheckingFirmware(false);
    }
  }

  async function sendCommand(
    commandInput: ConnectWizardCommandInput,
  ): Promise<boolean> {
    if (!selectedDeviceId) {
      return false;
    }

    setIsSendingCommand(true);
    setActionMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetchWithShortTimeout("/api/device/command", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deviceId: selectedDeviceId,
          ...commandInput,
        }),
        timeoutMessage: "Sending the command timed out.",
      });
      const payload = await readApiData(
        response,
        (value): value is { command: DeviceCommand } =>
          isRecord(value) && "command" in value && isRecord(value.command),
        "Unable to send the command.",
      );

      setActionMessage(
        getCommandSuccessMessage(selectedDeviceId, payload.command),
      );
      setStatusRetryToken((current) => current + 1);
      return true;
    } catch (error) {
      if (error instanceof SessionRequiredError) {
        redirectToLogin(`/connect?deviceId=${encodeURIComponent(selectedDeviceId)}`);
        return false;
      }

      setErrorMessage(
        error instanceof Error ? error.message : "Unable to send the command.",
      );
      return false;
    } finally {
      setIsSendingCommand(false);
    }
  }

  const selectedDeviceStatus =
    deviceStatus?.deviceId === selectedDeviceId ? deviceStatus : null;
  const resolvedOtaState = getResolvedOtaState(selectedDeviceStatus);
  const deviceHealth = getDeviceHealth(selectedDeviceStatus, resolvedOtaState);
  const currentReportedFirmware =
    selectedDeviceStatus?.firmwareVersion ??
    (checkResult?.deviceId === selectedDeviceId
      ? checkResult.currentVersion
      : selectedDevice?.firmwareVersion ?? null);
  const latestFirmware =
    checkResult?.deviceId === selectedDeviceId ? checkResult.latestVersion : null;
  const safetyMode = selectedDeviceStatus?.safetyMode === true;
  const calibrationComplete = selectedDeviceStatus?.calibrationComplete === true;
  const allowedMaxPercentStep =
    selectedDeviceStatus?.allowedMaxPercentStep ??
    DEFAULT_SAFE_ALLOWED_MAX_PERCENT_STEP;
  const movementLockedReason =
    selectedDeviceStatus?.movementLockedReason ??
    (safetyMode && !calibrationComplete
      ? "Calibration is still required before larger movement."
      : null);
  const canCalibrate = Boolean(
    selectedDeviceStatus?.lastSeenAt && selectedDeviceStatus.online,
  );
  const canRunMotorTest = Boolean(
    selectedDeviceStatus?.lastSeenAt &&
      selectedDeviceStatus.online &&
      calibrationComplete,
  );
  const showCompletedCalibrationState = calibrationComplete && !isRecalibrating;
  const movementLockedByOperator = (selectedDeviceStatus?.movementLockedReason ?? "")
    .toLowerCase()
    .includes("locked");
  const requestedDeviceMissing =
    Boolean(requestedDeviceId) &&
    !isLoadingDevices &&
    devices.length > 0 &&
    !devices.some((device) => device.deviceId === requestedDeviceId);
  const registrationSummary =
    requestedDeviceMissing && registrationState
      ? registrationState
      : selectedDeviceStatus
        ? {
            deviceId:
              selectedDeviceStatus.resolvedDeviceId || selectedDeviceStatus.deviceId,
            label: selectedDevice?.label ?? null,
            claimState: selectedDeviceStatus.claimState,
            ownerProfileId: null,
            ownerProfileDisplayName: null,
            ownedByCurrentProfile: true,
            exists: true,
          }
        : registrationState;
  const displayedDeviceId =
    requestedDeviceMissing && requestedDeviceId ? requestedDeviceId : selectedDeviceId;
  const displayedDeviceLabel =
    requestedDeviceMissing
      ? registrationSummary?.label ?? "Requested device"
      : selectedDevice?.label ?? "Loading device";
  const claimStateLabel = getClaimStateLabel(registrationSummary?.claimState);
  const activeErrorMessage =
    requestedDeviceMissing && registrationSummary?.claimState === "unknown"
      ? "This device is not registered yet."
      : requestedDeviceMissing && registrationSummary?.claimState === "unclaimed"
        ? "This device has not been claimed yet."
        : requestedDeviceMissing && registrationSummary?.claimState === "claimed"
          ? "This device belongs to another account."
          : requestedDeviceMissing
            ? "This device is not attached to your account."
            : errorMessage ?? deviceRegistryError;
  const activeErrorNextAction =
    requestedDeviceMissing && registrationSummary?.claimState === "unknown"
      ? "Ask an administrator to register the device before setup continues."
      : requestedDeviceMissing && registrationSummary?.claimState === "unclaimed"
        ? "Use the claim link or enter the claim code to attach this device to your account."
        : requestedDeviceMissing && registrationSummary?.claimState === "claimed"
          ? "Sign in with the account that owns this device or ask support for help."
          : requestedDeviceMissing
            ? "Choose one of your devices or claim this device first."
            : getRecoveryMessage(activeErrorMessage);
  const connectionSummaryValue = requestedDeviceMissing
    ? registrationSummary?.claimState === "claimed"
      ? "Unavailable"
      : "Waiting"
    : isLoadingStatus
      ? "Checking"
      : getConnectivityLabel(selectedDeviceStatus);
  const connectionSummaryMeta = requestedDeviceMissing
    ? registrationSummary?.claimState === "unknown"
      ? "Register the device in the cloud first"
      : registrationSummary?.claimState === "unclaimed"
        ? "Claim the device before setup"
        : "This device is owned by another account"
    : `${deviceHealth.label} • ${formatLastSeen(selectedDeviceStatus?.lastSeenAt)}`;
  const deviceOffline =
    Boolean(selectedDeviceId) &&
    !isLoadingStatus &&
    !activeErrorMessage &&
    (!selectedDeviceStatus?.lastSeenAt || !selectedDeviceStatus.online);
  const diagnosticsSnapshot = useMemo<DeviceDiagnostics | null>(() => {
    if (!selectedDeviceId) {
      return null;
    }

    return createDeviceDiagnostics(
      selectedDeviceId,
      registrationSummary?.claimState ?? selectedDeviceStatus?.claimState ?? "unknown",
      selectedDeviceStatus,
    );
  }, [registrationSummary?.claimState, selectedDeviceId, selectedDeviceStatus]);

  const firmwareStatusMessage = useMemo(() => {
    if (!checkResult || checkResult.deviceId !== selectedDeviceId) {
      return {
        title: "Check firmware status",
        body: "Run the check to confirm the current version and the latest release.",
        className: "border-slate-500/20 bg-slate-500/10 text-slate-200",
      };
    }

    if (!selectedDeviceStatus?.lastSeenAt || !selectedDeviceStatus.online) {
      return {
        title: "Device not online yet",
        body: "Install or power the device, then return here once it reports in.",
        className: "border-amber-300/20 bg-amber-300/10 text-amber-100",
      };
    }

    if (!checkResult.updateAvailable) {
      return {
        title: "Firmware is current",
        body: "This device is already on the latest available release.",
        className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
      };
    }

    return {
        title: "A newer firmware version is available",
        body: "Install the newer version before wider use.",
        className: "border-amber-300/20 bg-amber-300/10 text-amber-100",
      };
  }, [checkResult, selectedDeviceId, selectedDeviceStatus]);

  const confirmSetupMessage = useMemo(() => {
    if (!selectedDeviceStatus?.lastSeenAt || !selectedDeviceStatus.online) {
      return {
        title: "Waiting for the device to come online",
        body: "Finish installation and power-up first, then return here.",
      };
    }

    if (!calibrationComplete) {
      return {
        title: "Safe calibration still needed",
        body: "Keep using small movements until direction is confirmed and both ends are marked.",
      };
    }

    return {
        title: "Setup looks good",
        body: "The device is online and calibration is complete.",
      };
  }, [calibrationComplete, selectedDeviceStatus]);

  const calibrationGuideContent = useMemo(() => {
    if (!canCalibrate) {
      return {
        eyebrow: "Waiting for device",
        title: "Bring the device online first",
        body: "Power the device and wait for it to report in before starting calibration.",
        helper: "Once the device is online, this guide will unlock the first step automatically.",
      };
    }

    if (showCompletedCalibrationState || calibrationGuideStage === "done") {
      return {
        eyebrow: "Ready",
        title: "Calibration complete",
        body: "The open and closed positions are saved.",
        helper: "You can continue, or run calibration again if you want to reset the endpoints.",
      };
    }

    switch (calibrationGuideStage) {
      case "prepare":
        return {
          eyebrow: "Step 1",
          title: "Check free movement",
          body: "Make sure nothing is catching, rubbing, or blocking the shutter.",
          helper: "Do not continue if the shutter feels tight or misaligned.",
        };
      case "direction":
        return {
          eyebrow: "Step 2",
          title: "Check direction",
          body: "Press Nudge Open once and watch closely.",
          helper: `Movement is limited to ${allowedMaxPercentStep}% while setup is active.`,
        };
      case "closed":
        return {
          eyebrow: "Step 3",
          title: "Set closed",
          body: "Use small nudges until the shutter is fully closed, then save this position.",
          helper: "Use Nudge Close for the main movement and Open for small corrections.",
        };
      case "open":
        return {
          eyebrow: "Step 4",
          title: "Set open",
          body: "Use small nudges until the shutter is fully open, then save this position.",
          helper: "Stop immediately if the shutter binds, clicks, buzzes, or strains.",
        };
      case "finish":
        return {
          eyebrow: "Step 5",
          title: "Finish",
          body: "Both ends are marked. Save the calibration to unlock normal movement.",
          helper: "After this step, setup is ready to continue.",
        };
      default:
        return {
          eyebrow: "Calibration",
          title: "Continue the safe setup",
          body: "Follow each step in order and keep movement small.",
          helper: "STOP is always available if anything looks wrong.",
      };
    }
  }, [allowedMaxPercentStep, calibrationGuideStage, canCalibrate, showCompletedCalibrationState]);
  const calibrationLastActionLabel = formatDeviceLabel(
    selectedDeviceStatus?.lastCalibrationAction,
    "Waiting for the first setup action",
  );
  const sidebarUpdateStatus = checkResult
    ? checkResult.updateAvailable
      ? "Yes"
      : "No"
    : "Pending";

  async function copyDiagnostics() {
    if (!diagnosticsSnapshot) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        JSON.stringify(diagnosticsSnapshot, null, 2),
      );
      setErrorMessage(null);
      setActionMessage("Copied device diagnostics.");
    } catch {
      setErrorMessage(
        "Unable to copy diagnostics. Select the device again and try once more.",
      );
    }
  }

  return (
    <AppShell
      currentPath="/connect"
      devices={devices}
      isLoadingDevices={isLoadingDevices}
      selectedDeviceId={selectedDeviceId}
      onSelectDevice={(deviceId) => {
        setCurrentStepIndex(0);
        setCalibrationGuideStage("prepare");
        setIsRecalibrating(false);
        setIsDiagnosticsOpen(false);
        setDeviceStatus(null);
        setSelectedDeviceId(deviceId);
        setCheckResult(null);
        setActionMessage(null);
        setErrorMessage(null);
      }}
    >
      <section className="mx-auto w-full max-w-[88rem]">
        <div className="dashboard-panel rounded-[1.2rem] p-6 sm:p-8 lg:p-10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
                Smart Shutter Setup
              </div>
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-[2.8rem]">
                Set up the shutter.
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
                Move step by step.
              </p>
            </div>

          </div>

          <div className="mt-6 rounded-[1rem] border border-rose-400/25 bg-rose-400/8 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-200">
                  Safety first
                </div>
                <p className="max-w-3xl text-sm leading-7 text-slate-100">
                  Keep hands clear of the shutter. Start with small movements. Press
                  STOP immediately if the shutter binds, buzzes, clicks, or strains.
                </p>
              </div>

              <button
                type="button"
                className="inline-flex min-w-[240px] items-center justify-center rounded-xl bg-rose-500 px-5 py-4 text-xl font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isSendingCommand || !selectedDeviceId}
                onClick={() => {
                  void sendCommand({ type: "STOP" });
                }}
              >
                STOP
              </button>
            </div>
          </div>

          <div className="mt-6">
            <SetupStepRail
              currentStepIndex={currentStepIndex}
              onSelectStep={(stepIndex) => {
                setCurrentStepIndex(stepIndex);
              }}
            />
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Device"
              meta={displayedDeviceId || "Waiting for device"}
              value={displayedDeviceLabel}
            />
            <SummaryCard
              label="Claim"
              meta={getClaimStateMessage(registrationSummary)}
              value={claimStateLabel}
            />
            <SummaryCard
              label="Status"
              meta={connectionSummaryMeta}
              value={connectionSummaryValue}
              badge={
                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${
                    requestedDeviceMissing
                      ? "border-amber-300/20 bg-amber-300/10 text-amber-100"
                      : getConnectivityClasses(selectedDeviceStatus)
                  }`}
                >
                  {connectionSummaryValue}
                </span>
              }
            />
            <SummaryCard
              label="Firmware"
              meta={
                latestFirmware
                  ? `Latest ${formatVersion(latestFirmware)} • ${sidebarUpdateStatus}`
                  : "Check the latest version"
              }
              value={formatVersion(currentReportedFirmware)}
            />
          </div>

          {selectedDeviceId ? (
            <div className="mt-6 rounded-[1rem] border border-white/10 bg-white/5 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                    Device Status
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    Check these details before troubleshooting remotely.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:border-cyan-300/40 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!diagnosticsSnapshot}
                    onClick={() => {
                      void copyDiagnostics();
                    }}
                  >
                    Copy diagnostics
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:border-cyan-300/40 hover:bg-cyan-400/10"
                    onClick={() => {
                      setIsDiagnosticsOpen((current) => !current);
                    }}
                  >
                    {isDiagnosticsOpen ? "Hide details" : "Show details"}
                  </button>
                </div>
              </div>

              {isDiagnosticsOpen ? (
                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <SummaryCard
                    label="Connection"
                    meta={
                      diagnosticsSnapshot?.online
                        ? "Device is reporting normally"
                        : "Check power and Wi-Fi"
                    }
                    value={
                      diagnosticsSnapshot?.online
                        ? "Online"
                        : diagnosticsSnapshot?.lastSeenAt
                          ? "Offline"
                          : isLoadingStatus
                            ? "Checking"
                            : "Unknown"
                    }
                  />
                  <SummaryCard
                    label="Last seen"
                    meta={
                      diagnosticsSnapshot?.deviceUptimeMs != null
                        ? `${Math.round(diagnosticsSnapshot.deviceUptimeMs / 1000)}s uptime`
                        : "Waiting for device heartbeat"
                    }
                    value={formatLastSeen(diagnosticsSnapshot?.lastSeenAt)}
                  />
                  <SummaryCard
                    label="Signal strength"
                    meta={
                      diagnosticsSnapshot?.wifiConnected === false
                        ? "Wi-Fi not connected"
                        : "Reported by the device"
                    }
                    value={formatSignalStrength(diagnosticsSnapshot?.rssi)}
                  />
                  <SummaryCard
                    label="Firmware"
                    meta={`OTA ${diagnosticsSnapshot?.otaState ?? "Unknown"}`}
                    value={formatVersion(diagnosticsSnapshot?.firmwareVersion)}
                  />
                  <SummaryCard
                    label="Setup mode"
                    meta="Local Wi-Fi onboarding"
                    value={formatToggleState(diagnosticsSnapshot?.setupMode, {
                      on: "On",
                      off: "Off",
                    })}
                  />
                  <SummaryCard
                    label="Calibration"
                    meta={formatToggleState(diagnosticsSnapshot?.safetyMode, {
                      on: "Safety mode on",
                      off: "Safety mode off",
                    })}
                    value={formatCalibrationState(selectedDeviceStatus)}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {safetyMode ? (
            <div className="mt-6 rounded-[1rem] border border-amber-300/20 bg-amber-300/10 p-5 text-amber-50">
              <div className="text-xs uppercase tracking-[0.24em] text-amber-100/80">
                Safety mode is on
              </div>
              <p className="mt-2 text-sm leading-7">
                Start with small movements and keep hands clear of the shutter.
                Press STOP immediately if anything binds, buzzes, clicks, or strains.
              </p>
            </div>
          ) : null}

          {selectedDeviceStatus?.online && !calibrationComplete && currentStepIndex >= 2 ? (
            <div className="mt-6 rounded-[1rem] border border-cyan-400/20 bg-cyan-400/10 p-5 text-cyan-100">
              <div className="text-xs uppercase tracking-[0.24em] text-cyan-100/80">
                Calibration incomplete
              </div>
              <p className="mt-2 text-sm leading-7">
                Finish safe calibration before running larger movement commands.
              </p>
            </div>
          ) : null}

          <div className="mt-6 rounded-[1.05rem] border border-white/10 bg-black/18 p-6 sm:p-8">
            {currentStepIndex === 0 ? (
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                  Step 1
                </div>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  Connect Device
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
                  Confirm the selected device and wait for it to report in.
                </p>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <div className={METRIC_CARD_CLASS}>
                    <div className={METRIC_LABEL_CLASS}>Selected device</div>
                    <div className={METRIC_VALUE_CLASS}>
                      {displayedDeviceLabel}
                    </div>
                    <div className="wrap-anywhere mt-2 font-mono text-sm text-cyan-100">
                      {displayedDeviceId || "Waiting for device list..."}
                    </div>
                  </div>

                  <div className={METRIC_CARD_CLASS}>
                    <div className={METRIC_LABEL_CLASS}>Claim</div>
                    <div className={METRIC_VALUE_CLASS}>
                      {claimStateLabel}
                    </div>
                    <div className={METRIC_META_CLASS}>
                      {getClaimStateMessage(registrationSummary)}
                    </div>
                  </div>
                </div>

                {requestedDeviceMissing && registrationSummary?.claimState === "unknown" ? (
                  <div className="mt-6 rounded-[1rem] border border-amber-300/20 bg-amber-300/10 p-5">
                    <div className="text-sm font-semibold text-white">
                      This device must be registered first.
                    </div>
                    <p className="mt-2 max-w-3xl text-sm leading-7 text-amber-50/90">
                      Ask an administrator to register this factory device before
                      it can be claimed and brought online.
                    </p>
                  </div>
                ) : null}

                {requestedDeviceMissing && registrationSummary?.claimState === "unclaimed" ? (
                  <div className="mt-6 rounded-[1rem] border border-cyan-400/20 bg-cyan-400/10 p-5">
                    <div className="text-sm font-semibold text-white">
                      Claim this device before setup.
                    </div>
                    <p className="mt-2 max-w-3xl text-sm leading-7 text-cyan-100/90">
                      Use the claim code or claim link to attach this device to
                      your account.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <Link
                        className="inline-flex items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-400/12 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/18"
                        href="/claim"
                      >
                        Open claim
                      </Link>
                    </div>
                  </div>
                ) : null}

                {requestedDeviceMissing && registrationSummary?.claimState === "claimed" ? (
                  <div className="mt-6 rounded-[1rem] border border-amber-300/20 bg-amber-300/10 p-5">
                    <div className="text-sm font-semibold text-white">
                      This device belongs to another account.
                    </div>
                    <p className="mt-2 max-w-3xl text-sm leading-7 text-amber-50/90">
                      Sign in with the account that owns this device or ask
                      support for help.
                    </p>
                  </div>
                ) : null}

                {deviceOffline ? (
                  <div className="mt-6 rounded-[1rem] border border-white/10 bg-white/5 p-5">
                    <div className="text-sm font-semibold text-white">Device is offline.</div>
                    <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-400">
                      Check power and Wi-Fi. If this is the first setup, put the
                      device in setup mode and connect it to Wi-Fi through the
                      device setup network.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold text-white transition hover:border-cyan-300/40 hover:bg-cyan-400/10"
                        onClick={() => {
                          setStatusRetryToken((current) => current + 1);
                          reloadDevices();
                        }}
                      >
                        Retry connection
                      </button>
                      <Link
                        className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold text-white transition hover:border-cyan-300/40 hover:bg-cyan-400/10"
                        href={`/setup-device?deviceId=${encodeURIComponent(selectedDeviceId)}`}
                      >
                        Open Wi-Fi setup
                      </Link>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {currentStepIndex === 1 ? (
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                  Step 2
                </div>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  Check Firmware
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
                  Compare the device with the latest release before moving on.
                </p>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                <div className={METRIC_CARD_CLASS}>
                  <div className={METRIC_LABEL_CLASS}>Current firmware</div>
                  <div className={METRIC_VALUE_CLASS}>
                    {formatVersion(currentReportedFirmware)}
                  </div>
                  <div className={METRIC_META_CLASS}>Reported by device</div>
                </div>

                  <div className={METRIC_CARD_CLASS}>
                    <div className={METRIC_LABEL_CLASS}>Latest firmware</div>
                    <div className={METRIC_VALUE_CLASS}>
                      {formatVersion(latestFirmware)}
                    </div>
                    <div className={METRIC_META_CLASS}>Latest available release</div>
                  </div>

                  <div className={METRIC_CARD_CLASS}>
                  <div className={METRIC_LABEL_CLASS}>Update status</div>
                  <div className={METRIC_VALUE_CLASS}>
                    {checkResult
                      ? checkResult.updateAvailable
                        ? "Available"
                        : "Current"
                      : "Pending"}
                  </div>
                  <div className={METRIC_META_CLASS}>
                    {resolvedOtaState ? resolvedOtaState.replace(/_/g, " ") : "No OTA state"}
                  </div>
                </div>
                </div>

                <div className={`mt-6 rounded-[1rem] border p-5 ${firmwareStatusMessage.className}`}>
                  <div className="text-xs uppercase tracking-[0.24em] opacity-75">
                    Firmware summary
                  </div>
                  <h3 className="mt-2 text-xl font-semibold">
                    {firmwareStatusMessage.title}
                  </h3>
                  <p className="mt-3 max-w-3xl text-sm leading-7 opacity-90">
                    {firmwareStatusMessage.body}
                  </p>
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-slate-400">
                    {getConnectivityLabel(selectedDeviceStatus)} • Last seen{" "}
                    {formatLastSeen(selectedDeviceStatus?.lastSeenAt)}
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-cyan-300/40 hover:bg-cyan-400/10"
                      onClick={() => {
                        setStatusRetryToken((current) => current + 1);
                        reloadDevices();
                      }}
                    >
                      Check again
                    </button>
                    <button
                      type="button"
                      className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-cyan-400/50"
                      disabled={isLoadingDevices || isCheckingFirmware || !selectedDeviceId}
                      onClick={() => {
                        void runFirmwareCheck();
                      }}
                    >
                      {isCheckingFirmware ? "Checking..." : "Check Firmware"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {currentStepIndex === 2 ? (
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                  Step 3
                </div>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  Calibrate Safely
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
                  Start with small movements. Do not run full movement until
                  calibration is complete.
                </p>

                <div className="mt-6">
                  <CalibrationProgress
                    completed={showCompletedCalibrationState || calibrationGuideStage === "done"}
                    stage={calibrationGuideStage}
                  />
                </div>

                <div className="mt-6 rounded-[1rem] border border-white/10 bg-white/5 p-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100">
                      {calibrationGuideContent.eyebrow}
                    </div>
                    <div className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-slate-300">
                      Step limit <span className="font-semibold text-white">{allowedMaxPercentStep}%</span>
                    </div>
                  </div>

                  <h3 className="mt-4 text-2xl font-semibold text-white">
                    {calibrationGuideContent.title}
                  </h3>
                  <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
                    {calibrationGuideContent.body}
                  </p>
                  <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-400">
                    {calibrationGuideContent.helper}
                  </p>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <NoticeCard
                    body="Do not continue if the shutter binds, buzzes, clicks, or strains."
                    title="Safety"
                  />
                  <NoticeCard
                    body={movementLockedReason ?? calibrationLastActionLabel}
                    title={movementLockedReason ? "Current note" : "Last action"}
                  />
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="min-w-[180px] rounded-xl border border-rose-300/35 bg-rose-300/15 px-5 py-4 text-base font-semibold uppercase tracking-[0.18em] text-rose-50 transition hover:bg-rose-300/25 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isSendingCommand || !selectedDeviceId}
                    onClick={() => {
                      void sendCommand({ type: "STOP" });
                    }}
                  >
                    STOP
                  </button>

                  {!canCalibrate ? (
                    <div className="flex min-h-[56px] items-center rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                      Calibration unlocks when the device is online.
                    </div>
                  ) : null}

                  {canCalibrate &&
                  calibrationGuideStage === "prepare" &&
                  !showCompletedCalibrationState ? (
                    <button
                      type="button"
                      className="rounded-xl border border-cyan-300/30 bg-cyan-400/12 px-5 py-4 text-base font-semibold text-cyan-100 transition hover:bg-cyan-400/18 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isSendingCommand}
                      onClick={() => {
                        setCalibrationGuideStage("direction");
                        setActionMessage("Movement check confirmed. Continue with a direction test.");
                        setErrorMessage(null);
                      }}
                    >
                      Looks Good
                    </button>
                  ) : null}

                  {canCalibrate &&
                  calibrationGuideStage === "direction" &&
                  !showCompletedCalibrationState ? (
                    <>
                      <button
                        type="button"
                        className="rounded-xl border border-white/10 bg-white/5 px-5 py-4 text-base font-semibold text-white transition hover:border-cyan-300/40 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isSendingCommand}
                        onClick={() => {
                          void sendCommand({
                            type: "NUDGE_OPEN",
                            amount: DEFAULT_NUDGE_AMOUNT,
                          });
                        }}
                      >
                        Nudge Open
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-5 py-4 text-base font-semibold text-emerald-100 transition hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isSendingCommand}
                        onClick={() => {
                          setCalibrationGuideStage("closed");
                          setActionMessage("Direction looks correct. Set the closed position next.");
                          setErrorMessage(null);
                        }}
                      >
                        Correct
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-5 py-4 text-base font-semibold text-amber-100 transition hover:bg-amber-300/15 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isSendingCommand}
                        onClick={() => {
                          void (async () => {
                            await sendCommand({ type: "STOP" });
                            setActionMessage(null);
                            setErrorMessage(
                              "Direction looks wrong. Stop here and ask the operator to reverse direction before continuing.",
                            );
                          })();
                        }}
                      >
                        Wrong Way
                      </button>
                    </>
                  ) : null}

                  {canCalibrate &&
                  calibrationGuideStage === "closed" &&
                  !showCompletedCalibrationState ? (
                    <>
                      <button
                        type="button"
                        className="rounded-xl border border-white/10 bg-white/5 px-5 py-4 text-base font-semibold text-white transition hover:border-cyan-300/40 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isSendingCommand}
                        onClick={() => {
                          void sendCommand({
                            type: "NUDGE_CLOSE",
                            amount: DEFAULT_NUDGE_AMOUNT,
                          });
                        }}
                      >
                        Nudge Close
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-white/10 bg-white/5 px-5 py-4 text-base font-semibold text-white transition hover:border-cyan-300/40 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isSendingCommand}
                        onClick={() => {
                          void sendCommand({
                            type: "NUDGE_OPEN",
                            amount: DEFAULT_NUDGE_AMOUNT,
                          });
                        }}
                      >
                        Small Open
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-5 py-4 text-base font-semibold text-emerald-100 transition hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isSendingCommand}
                        onClick={() => {
                          void (async () => {
                            const wasSent = await sendCommand({
                              type: "SET_CURRENT_AS_CLOSED",
                            });

                            if (wasSent) {
                              setIsRecalibrating(true);
                              setCalibrationGuideStage("open");
                            }
                          })();
                        }}
                      >
                        Set Closed
                      </button>
                    </>
                  ) : null}

                  {canCalibrate &&
                  calibrationGuideStage === "open" &&
                  !showCompletedCalibrationState ? (
                    <>
                      <button
                        type="button"
                        className="rounded-xl border border-white/10 bg-white/5 px-5 py-4 text-base font-semibold text-white transition hover:border-cyan-300/40 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isSendingCommand}
                        onClick={() => {
                          void sendCommand({
                            type: "NUDGE_OPEN",
                            amount: DEFAULT_NUDGE_AMOUNT,
                          });
                        }}
                      >
                        Nudge Open
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-white/10 bg-white/5 px-5 py-4 text-base font-semibold text-white transition hover:border-cyan-300/40 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isSendingCommand}
                        onClick={() => {
                          void sendCommand({
                            type: "NUDGE_CLOSE",
                            amount: DEFAULT_NUDGE_AMOUNT,
                          });
                        }}
                      >
                        Small Close
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-5 py-4 text-base font-semibold text-emerald-100 transition hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isSendingCommand}
                        onClick={() => {
                          void (async () => {
                            const wasSent = await sendCommand({
                              type: "SET_CURRENT_AS_OPEN",
                            });

                            if (wasSent) {
                              setIsRecalibrating(true);
                              setCalibrationGuideStage("finish");
                            }
                          })();
                        }}
                      >
                        Set Open
                      </button>
                    </>
                  ) : null}

                  {canCalibrate &&
                  calibrationGuideStage === "finish" &&
                  !showCompletedCalibrationState ? (
                    <button
                      type="button"
                      className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-5 py-4 text-base font-semibold text-emerald-100 transition hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isSendingCommand}
                      onClick={() => {
                        void (async () => {
                          const wasSent = await sendCommand({
                            type: "MARK_CALIBRATION_COMPLETE",
                          });

                          if (wasSent) {
                            setIsRecalibrating(false);
                            setCalibrationGuideStage("done");
                            setCurrentStepIndex(3);
                          }
                        })();
                      }}
                    >
                      Done
                    </button>
                  ) : null}

                  {canCalibrate && movementLockedByOperator ? (
                    <button
                      type="button"
                      className="rounded-xl border border-white/10 bg-white/5 px-5 py-4 text-base font-semibold text-white transition hover:border-cyan-300/40 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isSendingCommand}
                      onClick={() => {
                        void sendCommand({ type: "UNLOCK_MOVEMENT" });
                      }}
                    >
                      Unlock
                    </button>
                  ) : null}

                  {canCalibrate &&
                  (showCompletedCalibrationState || calibrationGuideStage === "done") ? (
                    <>
                      <button
                        type="button"
                        className="rounded-xl border border-white/10 bg-white/5 px-5 py-4 text-base font-semibold text-white transition hover:border-cyan-300/40 hover:bg-cyan-400/10"
                        onClick={() => {
                          setIsRecalibrating(true);
                          setCalibrationGuideStage("prepare");
                          setActionMessage(null);
                          setErrorMessage(null);
                        }}
                      >
                        Calibrate Again
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-cyan-300/30 bg-cyan-400/12 px-5 py-4 text-base font-semibold text-cyan-100 transition hover:bg-cyan-400/18"
                        onClick={() => {
                          setCurrentStepIndex(3);
                        }}
                      >
                        Continue
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}

            {currentStepIndex === 3 ? (
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                  Step 4
                </div>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  Confirm Setup
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
                  Confirm the device is online and ready.
                </p>

                <div className="mt-6 rounded-[1rem] border border-cyan-400/20 bg-cyan-400/10 p-5 text-cyan-100">
                  <div className="text-xs uppercase tracking-[0.24em] text-cyan-100/80">
                    Setup status
                  </div>
                  <h3 className="mt-2 text-xl font-semibold">
                    {confirmSetupMessage.title}
                  </h3>
                  <p className="mt-3 max-w-3xl text-sm leading-7 text-cyan-100/90">
                    {confirmSetupMessage.body}
                  </p>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  <div className={METRIC_CARD_CLASS}>
                    <div className={METRIC_LABEL_CLASS}>Device</div>
                    <div className={METRIC_VALUE_CLASS}>
                      {getConnectivityLabel(selectedDeviceStatus)}
                    </div>
                  </div>
                  <div className={METRIC_CARD_CLASS}>
                    <div className={METRIC_LABEL_CLASS}>Firmware</div>
                    <div className={METRIC_VALUE_CLASS}>
                      {checkResult
                        ? checkResult.updateAvailable
                          ? "Update available"
                          : "Current"
                        : "Unchecked"}
                    </div>
                  </div>
                  <div className={METRIC_CARD_CLASS}>
                    <div className={METRIC_LABEL_CLASS}>Movement</div>
                    <div className={METRIC_VALUE_CLASS}>
                      {canRunMotorTest ? "Ready" : "Still locked"}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {currentStepIndex === 4 ? (
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                  Step 5
                </div>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  Test Movement
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
                  Use the same movement order each time.
                </p>

                <div className="mt-6 flex justify-start">
                  <button
                    type="button"
                    className="min-w-[220px] rounded-xl border border-rose-300/35 bg-rose-300/15 px-5 py-4 text-base font-semibold uppercase tracking-[0.18em] text-rose-50 transition hover:bg-rose-300/25 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isSendingCommand || !selectedDeviceId}
                    onClick={() => {
                      void sendCommand({ type: "STOP" });
                    }}
                  >
                    STOP
                  </button>
                </div>

                <div className="mt-6 rounded-[1rem] border border-amber-300/20 bg-amber-300/10 p-5">
                  <div className="text-xs uppercase tracking-[0.24em] text-amber-100/80">
                    Safety
                  </div>
                  <p className="mt-3 rounded-xl border border-amber-200/15 bg-black/15 px-4 py-3 text-sm text-amber-50">
                    Keep hands clear of the shutter. Do not run full movement until
                    calibration is complete.
                  </p>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                    {MOVEMENT_SEQUENCE.map((step, index) => (
                      <div
                        key={step.label}
                        className="rounded-xl border border-white/10 bg-black/15 px-4 py-3 text-sm text-amber-50/90"
                      >
                        <span className="font-semibold text-white">{index + 1}.</span>{" "}
                        {step.label}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                  {MOVEMENT_SEQUENCE.map((step) => {
                    const fullMoveBlocked =
                      step.command.type === "SET_PERCENT" &&
                      step.command.value === 100 &&
                      !calibrationComplete;

                    return (
                      <button
                        key={step.label}
                        type="button"
                        className={`rounded-xl px-4 py-4 text-base font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                          step.danger
                            ? "border border-rose-300/35 bg-rose-300/15 uppercase tracking-[0.18em] text-rose-50 hover:bg-rose-300/25"
                            : "border border-white/10 bg-white/5 text-white hover:border-cyan-300/40 hover:bg-cyan-400/10"
                        }`}
                        disabled={isSendingCommand || !canRunMotorTest || fullMoveBlocked}
                        onClick={() => {
                          void sendCommand(step.command);
                        }}
                      >
                        {step.label}
                      </button>
                    );
                  })}
                </div>

                <p className="mt-4 text-sm leading-7 text-slate-400">
                  {canRunMotorTest
                    ? "Ready to test."
                    : "Movement unlocks after calibration."}
                </p>
              </div>
            ) : null}

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-between">
              <button
                type="button"
                className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-cyan-300/40 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={currentStepIndex === 0}
                onClick={() => {
                  setCurrentStepIndex((current) => Math.max(0, current - 1));
                }}
              >
                Back
              </button>

              <button
                type="button"
                className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-cyan-400/50"
                disabled={currentStepIndex === SETUP_STEPS.length - 1}
                onClick={() => {
                  setCurrentStepIndex((current) =>
                    Math.min(SETUP_STEPS.length - 1, current + 1),
                  );
                }}
              >
                Continue
              </button>
            </div>

            {activeErrorMessage ? (
              <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
                <div className="font-semibold text-amber-50">{activeErrorMessage}</div>
                {activeErrorNextAction ? (
                  <div className="mt-1 text-amber-100/90">{activeErrorNextAction}</div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="inline-flex rounded-lg border border-amber-200/20 bg-black/20 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-50 transition hover:bg-black/30"
                    onClick={() => {
                      setStatusRetryToken((current) => current + 1);
                      reloadDevices();
                    }}
                  >
                    Retry connection
                  </button>
                  {requestedDeviceMissing ? (
                    <Link
                      className="inline-flex rounded-lg border border-amber-200/20 bg-black/20 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-50 transition hover:bg-black/30"
                      href="/devices"
                    >
                      Open devices
                    </Link>
                  ) : null}
                  {requestedDeviceMissing &&
                  registrationSummary?.claimState === "unclaimed" ? (
                    <Link
                      className="inline-flex rounded-lg border border-amber-200/20 bg-black/20 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-50 transition hover:bg-black/30"
                      href="/claim"
                    >
                      Claim device
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}

            {actionMessage ? (
              <p className="mt-4 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
                {actionMessage}
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
