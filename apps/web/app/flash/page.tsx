"use client";

import Link from "next/link";

import AppShell from "@/app/_components/app-shell";
import EspWebToolsPanel from "@/app/flash/esp-web-tools-panel";
import CopyButton from "@/app/setup/copy-button";
import { useDeviceRegistryWithOptions } from "@/lib/use-device-registry";

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

const ESP8266_BOARD_MANAGER_URL =
  "http://arduino.esp8266.com/stable/package_esp8266com_index.json";
const ESP8266_DOWNLOAD_PATH = "/downloads/smart-shutter-esp8266-sketch.zip";
const ESP32_DOWNLOAD_PATH = "/downloads/smart-shutter-esp32-sketch.zip";

const ESP8266_BOARD_PROFILES = [
  {
    label: "NodeMCU / ESP-12E / ESP-12F",
    ideBoard: "NodeMCU 1.0 (ESP-12E Module)",
    fqbn: "esp8266:esp8266:nodemcuv2",
  },
  {
    label: "LOLIN / WEMOS D1 mini",
    ideBoard: "LOLIN(WEMOS) D1 R2 & mini",
    fqbn: "esp8266:esp8266:d1_mini",
  },
  {
    label: "Unknown clone / fallback",
    ideBoard: "Generic ESP8266 Module",
    fqbn: "esp8266:esp8266:generic",
  },
] as const;

const ESP8266_COM_PORT_STEPS = [
  "Use a known-good USB data cable, not a charge-only cable.",
  "Open Windows Device Manager, then unplug and replug the board.",
  "Watch the Ports (COM & LPT) section and note the new COM port that appears.",
  "If no port appears, try a different cable or install the board's USB serial driver such as CP210x or CH340.",
  "Close Serial Monitor or any other app that might already be using the COM port before uploading.",
] as const;

const ESP8266_ARDUINO_IDE_STEPS = [
  "Open Arduino IDE 2.x and install `esp8266 by ESP8266 Community` from Boards Manager.",
  "In `File -> Preferences`, add the ESP8266 board manager URL if it is missing.",
  "Open `firmware/esp8266-shutter/esp8266-shutter.ino` from this repo.",
  "Choose the closest board profile from the list below, then choose the COM port you found in Device Manager.",
  "Click Verify, then Upload. If upload stalls, hold the board's BOOT or FLASH button while upload starts on some clones.",
  "After upload, open Serial Monitor at `115200` and look for `Smart Shutter ESP8266 booting...`.",
] as const;

const ESP8266_UPLOAD_REMINDERS = [
  "Leave `WIFI_SSID` blank for setup-mode recovery installs.",
  "After flashing, return to `/connect` and wait for the setup AP or MQTT status.",
  "If the board reboots but no AP appears, recheck board profile and motor-pin wiring before retrying.",
  "If upload fails repeatedly, unplug and replug the board so the COM port resets.",
] as const;

const ESP8266_COMPILE_COMMAND =
  "powershell -ExecutionPolicy Bypass -File .\\scripts\\compile-firmware.ps1 -Fqbn esp8266:esp8266:nodemcuv2 -SketchDir .\\firmware\\esp8266-shutter -OutputDir .\\.arduino-build\\firmware\\esp8266-shutter";

const ESP8266_COMPILE_AND_UPLOAD_COMMAND =
  "arduino-cli compile --upload -p COM7 --fqbn esp8266:esp8266:nodemcuv2 .\\firmware\\esp8266-shutter";

const MANUAL_DOWNLOADS = [
  {
    board: "esp8266",
    title: "ESP8266 sketch package",
    description:
      "For NodeMCU, D1 mini, and other ESP8266-family boards that need Arduino IDE recovery.",
    downloadPath: ESP8266_DOWNLOAD_PATH,
    downloadLabel: "Download ESP8266 ZIP",
    details: "Open `esp8266-shutter.ino` after unzipping the package.",
  },
  {
    board: "esp32",
    title: "ESP32 sketch package",
    description:
      "Manual Arduino IDE fallback for supported ESP32 boards when browser install is unavailable.",
    downloadPath: ESP32_DOWNLOAD_PATH,
    downloadLabel: "Download ESP32 ZIP",
    details: "Open `esp32-shutter.ino` after unzipping the package.",
  },
] as const;

export default function FlashPage() {
  const {
    devices,
    isLoadingDevices,
    selectedDevice,
    selectedDeviceId,
    setSelectedDeviceId,
  } = useDeviceRegistryWithOptions({
    redirectOnUnauthorized: false,
  });

  return (
    <AppShell
      currentPath="/flash"
      devices={devices}
      isLoadingDevices={isLoadingDevices}
      selectedDeviceId={selectedDeviceId}
      onSelectDevice={setSelectedDeviceId}
      emptyDeviceLabel="Sign in to load your devices"
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
          <>
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

            <div className="mt-6 grid gap-4 xl:grid-cols-3">
              <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
                <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">
                  Recommended board profiles
                </div>
                <div className="mt-4 space-y-4">
                  {ESP8266_BOARD_PROFILES.map((profile) => (
                    <div
                      key={profile.fqbn}
                      className="rounded-[0.9rem] border border-white/10 bg-black/20 p-4"
                    >
                      <div className="text-sm font-semibold text-white">
                        {profile.label}
                      </div>
                      <div className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">
                        Arduino IDE
                      </div>
                      <div className="mt-1 text-sm text-slate-200">
                        {profile.ideBoard}
                      </div>
                      <div className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-400">
                        Arduino CLI FQBN
                      </div>
                      <div className="mt-1 font-mono text-xs text-cyan-100">
                        {profile.fqbn}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
                <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">
                  Windows COM port flow
                </div>
                <div className="mt-4 space-y-3">
                  {ESP8266_COM_PORT_STEPS.map((step, index) => (
                    <div
                      key={step}
                      className="rounded-[0.9rem] border border-white/10 bg-black/20 p-4"
                    >
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                        Step {index + 1}
                      </div>
                      <div className="mt-2 text-sm leading-7 text-slate-200">
                        {step}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
                <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">
                  Upload reminders
                </div>
                <div className="mt-4 space-y-3">
                  {ESP8266_UPLOAD_REMINDERS.map((reminder, index) => (
                    <div
                      key={reminder}
                      className="rounded-[0.9rem] border border-white/10 bg-black/20 p-4"
                    >
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                        Reminder {index + 1}
                      </div>
                      <div className="mt-2 text-sm leading-7 text-slate-200">
                        {reminder}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">
                      Arduino IDE upload
                    </div>
                    <div className="mt-2 text-xl font-semibold text-white">
                      Best path for first recovery
                    </div>
                  </div>
                  <CopyButton
                    label="Copy board URL"
                    value={ESP8266_BOARD_MANAGER_URL}
                  />
                </div>

                <div className="mt-4 rounded-[0.9rem] border border-white/10 bg-black/20 p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    Board manager URL
                  </div>
                  <div className="mt-2 break-all font-mono text-xs text-cyan-100">
                    {ESP8266_BOARD_MANAGER_URL}
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {ESP8266_ARDUINO_IDE_STEPS.map((step, index) => (
                    <div
                      key={step}
                      className="rounded-[0.9rem] border border-white/10 bg-black/20 p-4"
                    >
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                        Step {index + 1}
                      </div>
                      <div className="mt-2 text-sm leading-7 text-slate-200">
                        {step}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">
                      Arduino CLI
                    </div>
                    <div className="mt-2 text-xl font-semibold text-white">
                      Copyable commands from repo root
                    </div>
                  </div>
                  <CopyButton
                    label="Copy compile command"
                    value={ESP8266_COMPILE_COMMAND}
                  />
                </div>

                <div className="mt-4 rounded-[0.9rem] border border-white/10 bg-black/20 p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    Compile from repo root
                  </div>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-6 text-cyan-100">
                    {ESP8266_COMPILE_COMMAND}
                  </pre>
                </div>

                <div className="mt-4 rounded-[0.9rem] border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                      Optional compile and upload
                    </div>
                    <CopyButton
                      label="Copy upload command"
                      value={ESP8266_COMPILE_AND_UPLOAD_COMMAND}
                    />
                  </div>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-6 text-cyan-100">
                    {ESP8266_COMPILE_AND_UPLOAD_COMMAND}
                  </pre>
                  <div className="mt-3 text-sm leading-7 text-slate-300">
                    Replace <span className="font-mono text-white">COM7</span> with the
                    actual port you saw in Device Manager. Run this from the Smart
                    Shutter repo root.
                  </div>
                </div>

                <div className="mt-4 rounded-[0.9rem] border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-7 text-amber-100">
                  If upload works but the device still does not show up, open Serial
                  Monitor at <span className="font-mono text-amber-50">115200</span> and
                  look for Wi-Fi setup logs or MQTT connection logs before returning
                  to <span className="font-mono text-amber-50">/connect</span>.
                </div>
              </div>
            </div>
          </>
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

        <div className="mt-6 rounded-[1rem] border border-white/10 bg-white/5 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">
                Download firmware packages
              </div>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                Site-only recovery download
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
                If someone only has the deployed Smart Shutter site plus Arduino IDE,
                they can download the matching sketch package here, unzip it, and
                open the `.ino` file directly.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {MANUAL_DOWNLOADS.map((download) => {
              const isSelectedBoard =
                selectedDevice?.board?.trim().toLowerCase() === download.board;

              return (
                <div
                  key={download.downloadPath}
                  className={`rounded-[1rem] border p-5 ${
                    isSelectedBoard
                      ? "border-cyan-300/40 bg-cyan-400/10"
                      : "border-white/10 bg-black/20"
                  }`}
                >
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
                    {download.board.toUpperCase()}
                  </div>
                  <div className="mt-2 text-xl font-semibold text-white">
                    {download.title}
                  </div>
                  <p className="mt-3 text-sm leading-7 text-slate-300">
                    {download.description}
                  </p>
                  <div className="mt-3 text-sm text-slate-400">
                    {download.details}
                  </div>
                  {isSelectedBoard ? (
                    <div className="mt-3 text-xs uppercase tracking-[0.18em] text-cyan-100">
                      Recommended for the selected device
                    </div>
                  ) : null}
                  <div className="mt-4">
                    <a
                      className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:border-cyan-300/40 hover:bg-cyan-400/10"
                      download
                      href={download.downloadPath}
                    >
                      {download.downloadLabel}
                    </a>
                  </div>
                </div>
              );
            })}
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
