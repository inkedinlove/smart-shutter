import AppNav from "@/app/_components/app-nav";
import ProvisioningManager from "@/app/setup/provisioning-manager";
import CopyButton from "@/app/setup/copy-button";
import {
  createProvisioningData,
} from "@/lib/devices";
import {
  getDefaultRegisteredDeviceId,
  listAvailableDevices,
} from "@/lib/device-registry";
import { getPublicMqttConfig } from "@/lib/mqtt";

export const dynamic = "force-dynamic";

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function SetupPage() {
  const devices = await listAvailableDevices();
  const broker = getPublicMqttConfig();
  const defaultDeviceId = await getDefaultRegisteredDeviceId();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[92rem] flex-col gap-5 px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
      <section className="dashboard-panel rounded-[1.2rem] p-6 sm:p-8 lg:p-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-100">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-200" />
              Internal Setup Console
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-[2.8rem]">
              Device setup in one place.
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Match the device ID, topics, and firmware settings before flashing.
            </p>
          </div>

          <AppNav currentPath="/setup" />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-4">
          <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">
              Step 1
            </div>
            <h2 className="mt-2 text-lg font-semibold text-white">
              Choose device
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-400">
              Pick the device entry that should be used for setup and flashing.
            </p>
          </div>

          <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">
              Step 2
            </div>
            <h2 className="mt-2 text-lg font-semibold text-white">
              Generate ready package
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-400">
              Download one admin-only package with the correct sketch and filled `config.h`.
            </p>
          </div>

          <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">
              Step 3
            </div>
            <h2 className="mt-2 text-lg font-semibold text-white">
              Send the board package
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-400">
              Hand the installer the generated package, then have them open the `.ino` file and click Upload.
            </p>
          </div>

          <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">
              Step 4
            </div>
            <h2 className="mt-2 text-lg font-semibold text-white">
              Return to setup and verify
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-400">
              Return to setup or the dashboard to confirm status and test movement safely.
            </p>
          </div>
        </div>
      </section>

      <ProvisioningManager
        defaultDeviceId={defaultDeviceId}
        devices={devices}
      />

      <section className="dashboard-panel rounded-[1.2rem] border border-amber-300/20 bg-amber-300/8 p-6 sm:p-8">
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-100">
            Internal admin
          </div>
          <p className="mt-3 max-w-4xl text-sm leading-7 text-amber-50/90">
            This page is for internal provisioning and firmware preparation only.
          </p>
          <div className="mt-5 text-xs font-semibold uppercase tracking-[0.3em] text-amber-100">
            Keep secrets local
          </div>
          <p className="mt-3 max-w-4xl text-sm leading-7 text-amber-50/90">
            Ready-to-flash downloads from this page include live MQTT credentials.
            Keep them internal, share them only with the installer, and avoid
            posting the generated package publicly.
          </p>
      </section>

      <section className="grid gap-6">
        {devices.map((device) => {
          const provisioning = createProvisioningData(device, broker);
          const isDefaultDevice = device.deviceId === defaultDeviceId;

          return (
            <article
              key={device.deviceId}
              className="dashboard-panel rounded-[1.2rem] p-6 sm:p-8"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-2xl font-semibold text-white">{device.label}</h2>
                    {isDefaultDevice ? (
                      <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.26em] text-emerald-200">
                        Default
                      </span>
                    ) : null}
                  </div>

                  <div className="font-mono text-sm text-cyan-100">{device.deviceId}</div>
                  <div className="text-sm text-slate-400">
                    Broker profile: {device.brokerProfile}
                  </div>
                  <div className="text-sm text-slate-400">
                    Added {formatTimestamp(device.createdAt)}
                  </div>
                </div>

                <div className="rounded-[1rem] border border-white/10 bg-black/20 px-5 py-4 text-sm text-slate-200">
                  <div className="text-xs uppercase tracking-[0.28em] text-slate-400">
                    MQTT host and port
                  </div>
                  <div className="mt-2 wrap-anywhere font-mono text-sm text-white">
                    {provisioning.mqttHost}:{provisioning.mqttPort}
                  </div>
                  <div className="mt-3 text-xs text-slate-400">
                    Host and port are safe to show. Secrets remain local-only.
                  </div>
                </div>
              </div>

              <div className="mt-8 grid gap-4 md:grid-cols-2">
                <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-xs uppercase tracking-[0.28em] text-slate-400">
                      Command Topic
                    </div>
                    <CopyButton label="Copy Topic" value={device.commandTopic} />
                  </div>
                  <div className="mt-3 wrap-anywhere font-mono text-sm text-white">
                    {device.commandTopic}
                  </div>
                </div>

                <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-xs uppercase tracking-[0.28em] text-slate-400">
                      Status Topic
                    </div>
                    <CopyButton label="Copy Topic" value={device.statusTopic} />
                  </div>
                  <div className="mt-3 wrap-anywhere font-mono text-sm text-white">
                    {device.statusTopic}
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-[1rem] border border-white/10 bg-black/25 p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
                      Advanced firmware configuration preview
                    </div>
                    <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
                      Keep this as the fallback copy-paste path. The provisioning
                      manager above is now the easier way to generate a full
                      ready-to-flash package for the selected board.
                    </p>
                  </div>

                  <CopyButton
                    label="Copy Config Preview"
                    value={provisioning.firmwareDefinesPreview}
                  />
                </div>

                <pre className="mt-4 overflow-x-auto rounded-[1rem] border border-white/10 bg-slate-950/80 p-5 text-sm leading-7 text-cyan-100">
                  <code>{provisioning.firmwareDefinesPreview}</code>
                </pre>

                <div className="mt-4 text-xs leading-6 text-amber-100/90">
                  Final step:
                  use the provisioning manager above when you want the generated
                  package to carry the real MQTT credentials for the installer.
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
