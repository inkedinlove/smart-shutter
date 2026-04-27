"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import AppNav from "@/app/_components/app-nav";
import type { RegisteredDevice } from "@/lib/devices";

type AppShellProps = {
  children: ReactNode;
  currentPath: string;
  devices: RegisteredDevice[];
  selectedDeviceId: string;
  onSelectDevice: (deviceId: string) => void;
  isLoadingDevices?: boolean;
  isAdmin?: boolean;
  extraNavLinks?: Array<{
    href: string;
    label: string;
  }>;
  emptyDeviceLabel?: string;
};

export default function AppShell({
  children,
  currentPath,
  devices,
  selectedDeviceId,
  onSelectDevice,
  isLoadingDevices = false,
  isAdmin = false,
  extraNavLinks = [],
  emptyDeviceLabel = "No device selected",
}: AppShellProps) {
  const resolvedExtraNavLinks = isAdmin
    ? [
        { href: "/setup", label: "Provision" },
        { href: "/admin/devices", label: "Admin Devices" },
        { href: "/admin/claims", label: "Claims" },
        ...extraNavLinks,
      ]
    : extraNavLinks;
  const [isDeviceMenuOpen, setIsDeviceMenuOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const selectedDevice = useMemo(
    () => devices.find((device) => device.deviceId === selectedDeviceId) ?? null,
    [devices, selectedDeviceId],
  );
  const selectedDeviceLabel =
    selectedDevice?.label ??
    (isLoadingDevices ? "Loading devices..." : emptyDeviceLabel);
  const isPickerDisabled = isLoadingDevices || devices.length === 0;

  useEffect(() => {
    if (!isDeviceMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setIsDeviceMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsDeviceMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isDeviceMenuOpen]);

  useEffect(() => {
    setIsDeviceMenuOpen(false);
  }, [selectedDeviceId]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[92rem] flex-col gap-5 px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
      <header className="dashboard-panel relative z-40 rounded-[1rem] px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-[0.75rem] border border-cyan-400/20 bg-cyan-400/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="space-y-1">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div
                    key={index}
                    className={`h-1 rounded-full bg-cyan-300/90 ${
                      index === 0 || index === 4 ? "w-7" : "w-8"
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="min-w-0">
              <div className="text-[1.7rem] font-semibold tracking-[0.015em] text-white sm:text-[1.9rem]">
                Smart Shutter
              </div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                Setup &amp; Control
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:gap-8">
            <AppNav currentPath={currentPath} extraLinks={resolvedExtraNavLinks} />

            <div
              ref={pickerRef}
              className="relative z-50 min-w-[250px] xl:min-w-[280px]"
            >
              <div className="md:hidden">
                <label className="dashboard-panel group relative flex items-center gap-3 overflow-hidden rounded-[1rem] border border-slate-700/70 bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(8,17,31,0.9))] px-4 py-3 text-sm text-white transition focus-within:border-cyan-400/45 focus-within:shadow-[0_0_0_1px_rgba(34,211,238,0.18),0_18px_36px_rgba(2,6,23,0.36)]">
                  <span className="pointer-events-none absolute inset-y-0 left-0 w-1 rounded-l-[1rem] bg-gradient-to-b from-cyan-300 via-cyan-400 to-sky-500 opacity-80" />
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.85rem] border border-cyan-400/20 bg-cyan-400/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.5)]" />
                  </span>

                  <span className="min-w-0 flex-1 pr-7">
                    <span className="mb-1 block text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-slate-500 transition group-focus-within:text-cyan-200/75">
                      Active device
                    </span>
                    <span className="sr-only">Selected device</span>
                    <select
                      className="w-full appearance-none bg-transparent text-[0.95rem] font-semibold text-white outline-none disabled:cursor-not-allowed disabled:text-slate-500"
                      disabled={isPickerDisabled}
                      style={{ colorScheme: "dark" }}
                      value={selectedDeviceId}
                      onChange={(event) => {
                        onSelectDevice(event.target.value);
                      }}
                    >
                      {devices.length === 0 ? (
                        <option
                          className="bg-slate-950 text-slate-100"
                          style={{ backgroundColor: "#020617", color: "#f8fafc" }}
                          value=""
                        >
                          {selectedDeviceLabel}
                        </option>
                      ) : (
                        devices.map((device) => (
                          <option
                            key={device.deviceId}
                            className="bg-slate-950 text-slate-100"
                            style={{ backgroundColor: "#020617", color: "#f8fafc" }}
                            value={device.deviceId}
                          >
                            {device.label}
                          </option>
                        ))
                      )}
                    </select>
                  </span>

                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition group-focus-within:text-cyan-300">
                    <svg
                      aria-hidden="true"
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M6 9.5 12 15.5 18 9.5"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.8"
                      />
                    </svg>
                  </span>
                </label>
              </div>

              <div className="hidden md:block">
                <button
                  aria-expanded={isDeviceMenuOpen}
                  aria-haspopup="listbox"
                  className="dashboard-panel group relative flex w-full items-center gap-3 overflow-hidden rounded-[1rem] border border-slate-700/70 bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(8,17,31,0.9))] px-4 py-3 text-left text-sm text-white transition hover:border-cyan-400/30 hover:shadow-[0_18px_36px_rgba(2,6,23,0.3)] focus-visible:border-cyan-400/45 focus-visible:shadow-[0_0_0_1px_rgba(34,211,238,0.18),0_18px_36px_rgba(2,6,23,0.36)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={isPickerDisabled}
                  type="button"
                  onClick={() => {
                    setIsDeviceMenuOpen((current) => !current);
                  }}
                >
                  <span className="pointer-events-none absolute inset-y-0 left-0 w-1 rounded-l-[1rem] bg-gradient-to-b from-cyan-300 via-cyan-400 to-sky-500 opacity-80" />
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.85rem] border border-cyan-400/20 bg-cyan-400/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.5)]" />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="mb-1 block text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-slate-500 transition group-hover:text-cyan-200/75">
                      Active device
                    </span>
                    <span className="block truncate text-[0.95rem] font-semibold text-white">
                      {selectedDeviceLabel}
                    </span>
                    {selectedDevice ? (
                      <span className="mt-1 block truncate text-[0.72rem] uppercase tracking-[0.18em] text-slate-500">
                        {selectedDevice.deviceId}
                      </span>
                    ) : null}
                  </span>

                  <span
                    className={`shrink-0 text-slate-400 transition ${isDeviceMenuOpen ? "rotate-180 text-cyan-300" : "group-hover:text-cyan-200"}`}
                  >
                    <svg
                      aria-hidden="true"
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M6 9.5 12 15.5 18 9.5"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.8"
                      />
                    </svg>
                  </span>
                </button>

                {isDeviceMenuOpen ? (
                  <div className="dashboard-panel absolute right-0 z-[80] mt-3 w-full overflow-hidden rounded-[1.1rem] border border-slate-700/70 bg-[linear-gradient(180deg,rgba(10,18,32,0.97),rgba(4,10,20,0.97))] shadow-[0_24px_60px_rgba(2,6,23,0.48)]">
                    <div className="border-b border-slate-800/80 px-4 py-3">
                      <div className="text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                        Available devices
                      </div>
                    </div>
                    <div
                      aria-label="Available devices"
                      className="max-h-80 overflow-y-auto p-2"
                      role="listbox"
                    >
                      {devices.length === 0 ? (
                        <div className="rounded-[0.9rem] px-3 py-4 text-sm text-slate-400">
                          {selectedDeviceLabel}
                        </div>
                      ) : (
                        devices.map((device) => {
                          const isSelected = device.deviceId === selectedDeviceId;

                          return (
                            <button
                              key={device.deviceId}
                              aria-selected={isSelected}
                              className={`flex w-full items-center gap-3 rounded-[0.95rem] px-3 py-3 text-left transition ${
                                isSelected
                                  ? "bg-cyan-400/12 text-white shadow-[inset_0_0_0_1px_rgba(34,211,238,0.22)]"
                                  : "text-slate-200 hover:bg-slate-900/80 hover:text-white"
                              }`}
                              role="option"
                              type="button"
                              onClick={() => {
                                onSelectDevice(device.deviceId);
                                setIsDeviceMenuOpen(false);
                              }}
                            >
                              <span
                                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                                  isSelected
                                    ? "bg-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.45)]"
                                    : "bg-slate-600"
                                }`}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[0.92rem] font-semibold">
                                  {device.label}
                                </span>
                                <span className="mt-1 block truncate text-[0.68rem] uppercase tracking-[0.18em] text-slate-500">
                                  {device.deviceId}
                                </span>
                              </span>
                              {isSelected ? (
                                <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-cyan-200">
                                  Active
                                </span>
                              ) : null}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </header>

      {children}
    </main>
  );
}
