"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import CopyButton from "@/app/setup/copy-button";
import {
  fetchWithShortTimeout,
  redirectToLogin,
  SessionRequiredError,
} from "@/lib/client-fetch";
import type { RegisteredDevice } from "@/lib/devices";
import { getApiErrorMessage } from "@/lib/api-response";
import {
  buildProvisioningSummary,
  getProvisioningDownloadInfo,
  type ProvisioningWifiMode,
} from "@/lib/provisioning";

type ProvisioningManagerProps = {
  defaultDeviceId: string;
  devices: RegisteredDevice[];
};

function resolveInitialSelectedDeviceId(
  defaultDeviceId: string,
  devices: RegisteredDevice[],
): string {
  const normalizedDefaultDeviceId = defaultDeviceId.trim();

  if (
    normalizedDefaultDeviceId &&
    devices.some((device) => device.deviceId === normalizedDefaultDeviceId)
  ) {
    return normalizedDefaultDeviceId;
  }

  return devices[0]?.deviceId ?? "";
}

function parseFileNameFromContentDisposition(
  contentDisposition: string | null,
  fallbackFileName: string,
): string {
  if (!contentDisposition) {
    return fallbackFileName;
  }

  const match = contentDisposition.match(/filename="([^"]+)"/i);
  return match?.[1] ?? fallbackFileName;
}

async function downloadBlobResponse(
  response: Response,
  fallbackFileName: string,
): Promise<void> {
  const fileName = parseFileNameFromContentDisposition(
    response.headers.get("Content-Disposition"),
    fallbackFileName,
  );
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");

  downloadLink.href = objectUrl;
  downloadLink.download = fileName;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  URL.revokeObjectURL(objectUrl);
}

export default function ProvisioningManager({
  defaultDeviceId,
  devices,
}: ProvisioningManagerProps) {
  const [selectedDeviceId, setSelectedDeviceId] = useState(
    resolveInitialSelectedDeviceId(defaultDeviceId, devices),
  );
  const [wifiMode, setWifiMode] = useState<ProvisioningWifiMode>("factory");
  const [wifiSsid, setWifiSsid] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [isDownloadingPackage, setIsDownloadingPackage] = useState(false);
  const [isDownloadingConfig, setIsDownloadingConfig] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const selectedDevice = useMemo(
    () => devices.find((device) => device.deviceId === selectedDeviceId) ?? null,
    [devices, selectedDeviceId],
  );
  const downloadInfo = selectedDevice
    ? getProvisioningDownloadInfo(selectedDevice.board)
    : null;
  const provisioningSummary = selectedDevice
    ? buildProvisioningSummary({
        device: selectedDevice,
        wifiMode,
        wifiSsid,
      })
    : "";

  async function handleDownloadPackage() {
    if (!selectedDevice) {
      return;
    }

    setIsDownloadingPackage(true);
    setErrorMessage(null);
    setActionMessage(null);

    try {
      const response = await fetchWithShortTimeout(
        `/api/devices/${encodeURIComponent(selectedDevice.deviceId)}/provisioning/package`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            wifiMode,
            wifiSsid,
            wifiPassword,
          }),
          timeoutMessage: "Generating the ready-to-flash package timed out.",
        },
      );

      if (!response.ok) {
        const payload = (await response.json()) as unknown;
        const errorText = getApiErrorMessage(
          payload,
          "Unable to generate the ready-to-flash package.",
        );

        if (response.status === 401) {
          throw new SessionRequiredError(errorText);
        }

        throw new Error(errorText);
      }

      await downloadBlobResponse(
        response,
        `${selectedDevice.deviceId}-firmware-package.zip`,
      );
      setActionMessage(
        `Downloaded the ready-to-flash package for ${selectedDevice.deviceId}.`,
      );
    } catch (error) {
      if (error instanceof SessionRequiredError) {
        redirectToLogin("/setup");
        return;
      }

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to generate the ready-to-flash package.",
      );
    } finally {
      setIsDownloadingPackage(false);
    }
  }

  async function handleDownloadConfig() {
    if (!selectedDevice) {
      return;
    }

    setIsDownloadingConfig(true);
    setErrorMessage(null);
    setActionMessage(null);

    try {
      const response = await fetchWithShortTimeout(
        `/api/devices/${encodeURIComponent(selectedDevice.deviceId)}/provisioning/config`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            wifiMode,
            wifiSsid,
            wifiPassword,
          }),
          timeoutMessage: "Generating the device config timed out.",
        },
      );

      if (!response.ok) {
        const payload = (await response.json()) as unknown;
        const errorText = getApiErrorMessage(
          payload,
          "Unable to generate the device config.",
        );

        if (response.status === 401) {
          throw new SessionRequiredError(errorText);
        }

        throw new Error(errorText);
      }

      await downloadBlobResponse(
        response,
        `${selectedDevice.deviceId}-config.h`,
      );
      setActionMessage(`Downloaded ${selectedDevice.deviceId} config.h.`);
    } catch (error) {
      if (error instanceof SessionRequiredError) {
        redirectToLogin("/setup");
        return;
      }

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to generate the device config.",
      );
    } finally {
      setIsDownloadingConfig(false);
    }
  }

  if (devices.length === 0) {
    return (
      <section className="dashboard-panel rounded-[1.2rem] p-6 sm:p-8 lg:p-10">
        <div className="text-xs uppercase tracking-[0.28em] text-amber-100/80">
          Provisioning manager
        </div>
        <h2 className="mt-3 text-3xl font-semibold text-white">
          Register a device first
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
          The access manager needs a registered device so it can fill in the
          exact device ID and MQTT topics automatically.
        </p>
        <div className="mt-5">
          <Link
            className="inline-flex items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-400/12 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/18"
            href="/admin/devices"
          >
            Open Device Registration
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="dashboard-panel rounded-[1.2rem] p-6 sm:p-8 lg:p-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-200" />
            Provisioning manager
          </div>
          <h2 className="mt-3 text-3xl font-semibold text-white">
            Generate the ready-to-flash package
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
            Pick the registered device, decide whether WiFi should be blank or
            preloaded, then download one package with the right sketch and a
            filled <span className="font-mono">config.h</span> already inside it.
          </p>
        </div>

        {selectedDevice ? (
          <CopyButton
            label="Copy Handoff Summary"
            value={provisioningSummary}
          />
        ) : null}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className="space-y-5">
          <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Step 1
            </div>
            <label className="mt-3 block">
              <span className="text-sm text-slate-300">Registered device</span>
              <select
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50"
                value={selectedDeviceId}
                onChange={(event) => {
                  setSelectedDeviceId(event.target.value);
                  setActionMessage(null);
                  setErrorMessage(null);
                }}
              >
                {devices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label} ({device.deviceId})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Step 2
            </div>
            <div className="mt-3 text-sm text-slate-300">WiFi mode</div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <button
                type="button"
                className={`rounded-xl border px-4 py-4 text-left text-sm transition ${
                  wifiMode === "factory"
                    ? "border-cyan-300/40 bg-cyan-400/10 text-cyan-50"
                    : "border-white/10 bg-black/20 text-slate-300 hover:border-cyan-300/30 hover:bg-cyan-400/8"
                }`}
                onClick={() => {
                  setWifiMode("factory");
                  setActionMessage(null);
                  setErrorMessage(null);
                }}
              >
                <div className="font-semibold text-white">Leave WiFi blank</div>
                <div className="mt-2 leading-7">
                  Recommended. The device starts the SmartShutter setup AP and
                  the customer enters home WiFi later.
                </div>
              </button>

              <button
                type="button"
                className={`rounded-xl border px-4 py-4 text-left text-sm transition ${
                  wifiMode === "preconfigured"
                    ? "border-cyan-300/40 bg-cyan-400/10 text-cyan-50"
                    : "border-white/10 bg-black/20 text-slate-300 hover:border-cyan-300/30 hover:bg-cyan-400/8"
                }`}
                onClick={() => {
                  setWifiMode("preconfigured");
                  setActionMessage(null);
                  setErrorMessage(null);
                }}
              >
                <div className="font-semibold text-white">Preload WiFi</div>
                <div className="mt-2 leading-7">
                  Use this only when you already know the target WiFi network and
                  want the device to join it right after flashing.
                </div>
              </button>
            </div>

            {wifiMode === "preconfigured" ? (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-sm text-slate-300">WiFi SSID</span>
                  <input
                    className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50"
                    placeholder="Customer WiFi"
                    value={wifiSsid}
                    onChange={(event) => {
                      setWifiSsid(event.target.value);
                      setActionMessage(null);
                      setErrorMessage(null);
                    }}
                  />
                </label>

                <label className="block">
                  <span className="text-sm text-slate-300">WiFi password</span>
                  <input
                    className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50"
                    placeholder="Password"
                    type="password"
                    value={wifiPassword}
                    onChange={(event) => {
                      setWifiPassword(event.target.value);
                      setActionMessage(null);
                      setErrorMessage(null);
                    }}
                  />
                </label>
              </div>
            ) : null}
          </div>

          <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Step 3
            </div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button
                className="inline-flex items-center justify-center rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-cyan-400/50"
                disabled={isDownloadingPackage || !selectedDevice}
                type="button"
                onClick={() => {
                  void handleDownloadPackage();
                }}
              >
                {isDownloadingPackage
                  ? "Generating package..."
                  : "Download Ready-to-Flash Package"}
              </button>

              {downloadInfo ? (
                <a
                  className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold text-white transition hover:border-cyan-300/40 hover:bg-cyan-400/10"
                  download
                  href={downloadInfo.downloadPath}
                >
                  Download Public Sketch ZIP
                </a>
              ) : null}

              <button
                className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold text-white transition hover:border-cyan-300/40 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-black/10 disabled:text-slate-500"
                disabled={isDownloadingConfig || !selectedDevice}
                type="button"
                onClick={() => {
                  void handleDownloadConfig();
                }}
              >
                {isDownloadingConfig
                  ? "Generating config..."
                  : "Download Filled config.h Only"}
              </button>
            </div>

            <div className="mt-4 rounded-[0.9rem] border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-7 text-amber-100">
              The new easiest handoff is the ready-to-flash package from this
              manager. The public sketch ZIP and standalone{" "}
              <span className="font-mono text-amber-50">config.h</span> are still
              here as fallbacks.
            </div>
          </div>

          {actionMessage ? (
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
              {actionMessage}
            </div>
          ) : null}

          {errorMessage ? (
            <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
              {errorMessage}
            </div>
          ) : null}
        </div>

        <div className="space-y-5">
          <div className="rounded-[1rem] border border-white/10 bg-black/20 p-5">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Selected device
            </div>
            <div className="mt-3 text-2xl font-semibold text-white">
              {selectedDevice?.label ?? "No device selected"}
            </div>
            <div className="mt-2 font-mono text-sm text-cyan-100">
              {selectedDevice?.deviceId ?? "--"}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[0.9rem] border border-white/10 bg-white/5 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                  Board
                </div>
                <div className="mt-2 text-sm font-semibold text-white">
                  {downloadInfo?.boardLabel ?? "--"}
                </div>
              </div>
              <div className="rounded-[0.9rem] border border-white/10 bg-white/5 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                  Arduino IDE board
                </div>
                <div className="mt-2 text-sm font-semibold text-white">
                  {downloadInfo?.ideBoard ?? "--"}
                </div>
              </div>
            </div>
            <div className="mt-4 grid gap-3">
              <div className="rounded-[0.9rem] border border-white/10 bg-white/5 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                  Command topic
                </div>
                <div className="mt-2 wrap-anywhere font-mono text-xs text-cyan-100">
                  {selectedDevice?.commandTopic ?? "--"}
                </div>
              </div>
              <div className="rounded-[0.9rem] border border-white/10 bg-white/5 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                  Status topic
                </div>
                <div className="mt-2 wrap-anywhere font-mono text-xs text-cyan-100">
                  {selectedDevice?.statusTopic ?? "--"}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[1rem] border border-white/10 bg-black/20 p-5">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
              What the installer does
            </div>
            <ol className="mt-4 space-y-3 text-sm leading-7 text-slate-300">
              <li>1. Download the ready-to-flash package.</li>
              <li>2. Unzip it.</li>
              <li>3. Open <span className="font-mono">{downloadInfo?.mainSketchFile ?? "the .ino file"}</span> in Arduino IDE.</li>
              <li>4. Select the recommended board and COM port, then click Upload.</li>
              <li>5. The package already includes the correct <span className="font-mono">config.h</span>.</li>
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
