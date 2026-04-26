"use client";

import type { ReactNode } from "react";

import AppNav from "@/app/_components/app-nav";
import type { RegisteredDevice } from "@/lib/devices";

type AppShellProps = {
  children: ReactNode;
  currentPath: string;
  devices: RegisteredDevice[];
  selectedDeviceId: string;
  onSelectDevice: (deviceId: string) => void;
  isLoadingDevices?: boolean;
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
  extraNavLinks = [],
  emptyDeviceLabel = "No device selected",
}: AppShellProps) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[92rem] flex-col gap-5 px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
      <header className="dashboard-panel rounded-[1rem] px-5 py-4 sm:px-6">
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
            <AppNav currentPath={currentPath} extraLinks={extraNavLinks} />

            <label className="dashboard-panel flex min-w-[250px] items-center gap-3 rounded-[0.85rem] border px-4 py-3 text-sm text-white">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.5)]" />
              <span className="sr-only">Selected device</span>
              <select
                className="w-full bg-transparent text-sm font-semibold text-white outline-none"
                disabled={isLoadingDevices || devices.length === 0}
                value={selectedDeviceId}
                onChange={(event) => {
                  onSelectDevice(event.target.value);
                }}
              >
                {devices.length === 0 ? (
                  <option value="">
                    {isLoadingDevices ? "Loading devices..." : emptyDeviceLabel}
                  </option>
                ) : (
                  devices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label}
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>
        </div>
      </header>

      {children}
    </main>
  );
}
