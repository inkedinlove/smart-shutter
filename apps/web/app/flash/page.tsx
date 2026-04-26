"use client";

import Link from "next/link";

import AppShell from "@/app/_components/app-shell";
import EspWebToolsPanel from "@/app/flash/esp-web-tools-panel";
import { useDeviceRegistry } from "@/lib/use-device-registry";

export const dynamic = "force-dynamic";

const FLASH_STEPS = [
  {
    title: "Plug in the device",
    description:
      "Use a known-good USB data cable and keep the board powered from the computer while you prepare the first install or recovery flow.",
  },
  {
    title: "Open in Chrome or Edge desktop",
    description:
      "Use Chrome or Edge on a desktop computer for the smoothest setup experience.",
  },
  {
    title: "Connect device",
    description:
      "When the browser asks, choose the supported ESP32 device you want to install, or use the manual Arduino path for ESP8266 boards.",
  },
  {
    title: "Install firmware",
    description:
      "Start the install when the button is available, then keep the USB cable connected until it finishes.",
  },
  {
    title: "Return to /connect",
    description:
      "After installation, return to setup to check status, calibrate safely, and test movement.",
  },
] as const;

export default function FlashPage() {
  const {
    devices,
    isLoadingDevices,
    selectedDevice,
    selectedDeviceId,
    setSelectedDeviceId,
  } = useDeviceRegistry();

  return (
    <AppShell
      currentPath="/flash"
      devices={devices}
      isLoadingDevices={isLoadingDevices}
      selectedDeviceId={selectedDeviceId}
      onSelectDevice={setSelectedDeviceId}
    >
      <section className="dashboard-panel rounded-[1.2rem] p-6 sm:p-8 lg:p-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-100">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-200" />
              Internal USB Tool
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-[2.8rem]">
              Install firmware over USB.
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Plug in the device with a USB data cable, use Chrome or Edge on desktop, and return to setup after install.
            </p>
          </div>

          <Link
            className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:border-cyan-300/40 hover:bg-cyan-400/10"
            href="/connect"
          >
            Return to Setup
          </Link>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {FLASH_STEPS.map((step, index) => (
            <div key={step.title} className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
              <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">
                Step {index + 1}
              </div>
              <h2 className="mt-2 text-lg font-semibold text-white">
                {step.title}
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-400">
                {step.description}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-[1rem] border border-amber-300/20 bg-amber-300/10 p-5">
          <div className="text-xs uppercase tracking-[0.24em] text-amber-100/80">
            Internal only
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            Keep the device connected until the install finishes
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-amber-50/90">
            This recovery path is for internal install and recovery work. Customer setup should begin at /connect.
          </p>
        </div>

        {selectedDevice?.board === "esp8266" ? (
          <div className="mt-6 rounded-[1rem] border border-cyan-400/20 bg-cyan-400/10 p-5">
            <div className="text-xs uppercase tracking-[0.24em] text-cyan-100/80">
              Selected device board
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              ESP8266 uses the manual USB path
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-cyan-50/90">
              Browser install on this page is currently for supported ESP32 builds only.
              For this device, flash <span className="font-mono text-cyan-50">firmware/esp8266-shutter</span>
              with Arduino IDE or Arduino CLI, then return to <span className="font-mono text-cyan-50">/connect</span>.
            </p>
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
              <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
                First install or recovery
              </div>
            <div className="mt-3 text-xl font-semibold text-white">
              USB flashing supported
            </div>
              <p className="mt-3 text-sm leading-7 text-slate-400">
              Use browser install when it is available, or use the manual USB guide when needed.
              </p>
            </div>

          <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
              <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
                After install
              </div>
              <div className="mt-3 text-xl font-semibold text-white">
                Return to setup
              </div>
            <p className="mt-3 text-sm leading-7 text-slate-400">
              Go back to Smart Shutter Setup to confirm status and run safe calibration.
            </p>
          </div>

          <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Backup path
            </div>
            <div className="mt-3 text-xl font-semibold text-white">
              Arduino IDE or CLI
            </div>
            <p className="mt-3 text-sm leading-7 text-slate-400">
              Keep the manual flashing flow available for unsupported browsers or recovery.
            </p>
          </div>
        </div>
      </section>

      <EspWebToolsPanel
        selectedBoard={selectedDevice?.board ?? null}
        selectedDeviceLabel={selectedDevice?.label ?? null}
      />
    </AppShell>
  );
}
