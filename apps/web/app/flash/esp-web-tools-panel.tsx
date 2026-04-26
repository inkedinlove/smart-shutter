"use client";

import Script from "next/script";
import { useEffect, useMemo, useState } from "react";

import { fetchWithShortTimeout } from "@/lib/client-fetch";

const ESP_WEB_TOOLS_SCRIPT_URL =
  "https://unpkg.com/esp-web-tools@10/dist/web/install-button.js?module";
const FLASH_MANIFEST_PATH = "/firmware/manifest.json";

type FlashManifest = {
  name: string;
  version: string;
  home_assistant_domain?: string;
  funding_url?: string;
  new_install_prompt_erase?: boolean;
  builds: Array<{
    chipFamily: string;
    parts: Array<{
      path: string;
      offset: number;
    }>;
  }>;
};

type EspWebToolsPanelProps = {
  selectedBoard?: string | null;
  selectedDeviceLabel?: string | null;
};

type SerialApiLike = {
  getPorts?: () => Promise<unknown[]>;
  addEventListener?: (
    type: "connect" | "disconnect",
    listener: EventListener,
  ) => void;
  removeEventListener?: (
    type: "connect" | "disconnect",
    listener: EventListener,
  ) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFlashManifest(value: unknown): value is FlashManifest {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.version === "string" &&
    Array.isArray(value.builds)
  );
}

function getSerialApi(): SerialApiLike | null {
  if (typeof navigator === "undefined") {
    return null;
  }

  const serialNavigator = navigator as Navigator & {
    serial?: SerialApiLike;
  };

  return serialNavigator.serial ?? null;
}

function formatBoardLabel(board: string | null | undefined): string {
  return board?.trim().toLowerCase() === "esp8266" ? "ESP8266" : "ESP32";
}

export default function EspWebToolsPanel({
  selectedBoard = null,
  selectedDeviceLabel = null,
}: EspWebToolsPanelProps) {
  const [manifest, setManifest] = useState<FlashManifest | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [hasSecureContext, setHasSecureContext] = useState(false);
  const [hasSerialApi, setHasSerialApi] = useState(false);
  const [authorizedPortCount, setAuthorizedPortCount] = useState<number | null>(
    null,
  );

  const isEsp8266Selected = selectedBoard?.trim().toLowerCase() === "esp8266";
  const selectedBoardLabel = useMemo(
    () => formatBoardLabel(selectedBoard),
    [selectedBoard],
  );

  useEffect(() => {
    let isCancelled = false;

    async function loadManifest() {
      try {
        const response = await fetchWithShortTimeout(FLASH_MANIFEST_PATH, {
          cache: "no-store",
          timeoutMessage: "Loading the firmware package timed out.",
        });
        const payload = (await response.json()) as unknown;

        if (!response.ok) {
          throw new Error("Unable to load the firmware install manifest.");
        }

        if (!isFlashManifest(payload)) {
          throw new Error("The firmware install manifest is invalid.");
        }

        if (isCancelled) {
          return;
        }

        setManifest(payload);
        setManifestError(null);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setManifestError(
          error instanceof Error
            ? error.message
            : "Unable to load the firmware install manifest.",
        );
      }
    }

    void loadManifest();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;
    const serialApi = getSerialApi();

    async function refreshSerialState() {
      await Promise.resolve();

      const nextHasSecureContext =
        typeof window !== "undefined" && window.isSecureContext;
      const nextHasSerialApi = Boolean(serialApi?.getPorts);
      let nextAuthorizedPortCount: number | null = null;

      if (serialApi?.getPorts) {
        try {
          const ports = await serialApi.getPorts();
          nextAuthorizedPortCount = Array.isArray(ports) ? ports.length : 0;
        } catch {
          nextAuthorizedPortCount = null;
        }
      }

      if (!isCancelled) {
        setHasSecureContext(nextHasSecureContext);
        setHasSerialApi(nextHasSerialApi);
        setAuthorizedPortCount(nextAuthorizedPortCount);
      }
    }

    const handleSerialChange: EventListener = () => {
      void refreshSerialState();
    };

    void refreshSerialState();
    serialApi?.addEventListener?.("connect", handleSerialChange);
    serialApi?.addEventListener?.("disconnect", handleSerialChange);

    return () => {
      isCancelled = true;
      serialApi?.removeEventListener?.("connect", handleSerialChange);
      serialApi?.removeEventListener?.("disconnect", handleSerialChange);
    };
  }, []);

  return (
    <>
      <Script
        src={ESP_WEB_TOOLS_SCRIPT_URL}
        strategy="afterInteractive"
        type="module"
      />

      <div className="mt-8 rounded-[1rem] border border-cyan-400/20 bg-cyan-400/10 p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-cyan-100/80">
              Browser install
            </div>
            <h3 className="mt-2 text-2xl font-semibold text-white">
              Install with USB
            </h3>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-cyan-100/90">
              Use the button below if it appears in your browser. If it does not,
              use the USB flashing guide and come back to setup when the device is
              online again.
            </p>
          </div>

          <div className="rounded-[1rem] border border-white/10 bg-black/20 px-5 py-4 text-sm text-slate-200">
            <div className="text-xs uppercase tracking-[0.28em] text-slate-400">Works best on</div>
            <div className="mt-2 text-sm font-semibold text-white">
              Chrome or Edge on desktop
            </div>
            <div className="mt-3 text-xs text-slate-400">Use HTTPS or localhost.</div>
          </div>
        </div>

        <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-black/25 p-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[1rem] border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                Selected board
              </div>
              <div className="mt-2 text-lg font-semibold text-white">
                {selectedBoardLabel}
              </div>
              <div className="mt-2 text-sm text-slate-400">
                {selectedDeviceLabel
                  ? `${selectedDeviceLabel}`
                  : "Choose a device above to match the flash path."}
              </div>
            </div>

            <div className="rounded-[1rem] border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                Browser serial
              </div>
              <div className="mt-2 text-lg font-semibold text-white">
                {hasSerialApi ? "Available" : "Unavailable"}
              </div>
              <div className="mt-2 text-sm text-slate-400">
                {hasSerialApi
                  ? "Chrome or Edge can open the serial chooser after you click Install Firmware."
                  : "Use Chrome or Edge on desktop for browser USB install."}
              </div>
            </div>

            <div className="rounded-[1rem] border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                Secure context
              </div>
              <div className="mt-2 text-lg font-semibold text-white">
                {hasSecureContext ? "Ready" : "Blocked"}
              </div>
              <div className="mt-2 text-sm text-slate-400">
                {hasSecureContext
                  ? "The page can ask for USB access."
                  : "Open Smart Shutter over HTTPS or localhost first."}
              </div>
            </div>

            <div className="rounded-[1rem] border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                Authorized ports
              </div>
              <div className="mt-2 text-lg font-semibold text-white">
                {authorizedPortCount === null ? "--" : authorizedPortCount}
              </div>
              <div className="mt-2 text-sm text-slate-400">
                {authorizedPortCount && authorizedPortCount > 0
                  ? "A previously approved serial device is available."
                  : "New USB devices will not appear until you approve them from the browser prompt."}
              </div>
            </div>
          </div>

          <div className="text-sm text-slate-300">
            Browser support:
            {" "}
            <span className="font-semibold text-white">
              Desktop Chrome or Edge over HTTPS or localhost.
            </span>
          </div>

          {isEsp8266Selected ? (
            <div className="mt-5 rounded-[1rem] border border-amber-300/20 bg-amber-300/10 px-4 py-4 text-sm leading-7 text-amber-100">
              <div className="font-semibold text-amber-50">
                Browser install is not used for this ESP8266 device.
              </div>
              <div className="mt-2">
                Smart Shutter only publishes ESP32 builds to the browser install
                manifest right now. Use Arduino IDE or Arduino CLI for this
                board, then return to <span className="font-mono">/connect</span>.
              </div>
              <div className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 font-mono text-xs text-cyan-100">
                powershell -ExecutionPolicy Bypass -File scripts/compile-firmware.ps1
                {" "}
                -Fqbn esp8266:esp8266:nodemcuv2
                {" "}
                -SketchDir firmware/esp8266-shutter
                {" "}
                -OutputDir .arduino-build/firmware/esp8266-shutter
              </div>
            </div>
          ) : (
            <div className="mt-5">
              <esp-web-install-button manifest={FLASH_MANIFEST_PATH}>
                <button
                  slot="activate"
                  className="inline-flex items-center justify-center rounded-xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
                  type="button"
                >
                  Install Firmware
                </button>
                <span
                  slot="unsupported"
                  className="inline-flex rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100"
                >
                  Open this page in Chrome or Edge on a desktop computer.
                </span>
                <span
                  slot="not-allowed"
                  className="inline-flex rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100"
                >
                  Open Smart Shutter over HTTPS or localhost before installing.
                </span>
              </esp-web-install-button>
            </div>
          )}

          <p className="mt-4 text-sm leading-7 text-slate-300">
            The browser will not auto-connect to a newly plugged-in serial
            device in the background. Click the install button to open the
            chooser, and if installation is unavailable here, use the USB
            flashing steps in the docs.
          </p>

          <div className="mt-4 rounded-[1rem] border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm leading-7 text-amber-100">
            ESP8266 boards such as NodeMCU and D1 mini should use the manual
            Arduino IDE or Arduino CLI flashing flow for now. This browser
            install path remains focused on supported ESP32 builds.
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-[0.28em] text-slate-400">
              Manifest version
            </div>
            <div className="mt-3 text-xl font-semibold text-white">
              {manifest ? `${manifest.name} ${manifest.version}` : "Loading..."}
            </div>
            <div className="mt-2 text-sm text-slate-400">
              {manifestError ?? "Ready when a firmware package is available."}
            </div>
          </div>

          <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-[0.28em] text-slate-400">
              Registered builds
            </div>
            <div className="mt-3 text-xl font-semibold text-white">
              {manifest ? manifest.builds.length : "--"}
            </div>
            <div className="mt-2 text-sm text-slate-400">
              {manifest && manifest.builds.length > 0
                ? "A firmware package is available for browser install."
                : "Use the USB flashing path if a package is not available here."}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
