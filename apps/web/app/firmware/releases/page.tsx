"use client";

import {
  startTransition,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import AppNav from "@/app/_components/app-nav";
import { fetchWithShortTimeout } from "@/lib/client-fetch";
import type { FirmwareReleaseInput, FirmwareReleaseRecord } from "@/lib/firmware";

type ReleasesResponse = {
  releases: FirmwareReleaseRecord[];
};

type CreateReleaseResponse = {
  ok?: boolean;
  error?: string;
  release?: FirmwareReleaseRecord;
};

type ReleaseFormState = {
  version: string;
  channel: string;
  board: string;
  artifactUrl: string;
  sha256: string;
  sizeBytes: string;
  notes: string;
  isActive: boolean;
};

const INITIAL_FORM_STATE: ReleaseFormState = {
  version: "",
  channel: "stable",
  board: "esp32",
  artifactUrl: "",
  sha256: "",
  sizeBytes: "",
  notes: "",
  isActive: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFirmwareReleaseRecord(value: unknown): value is FirmwareReleaseRecord {
  return (
    isRecord(value) &&
    typeof value.version === "string" &&
    typeof value.channel === "string" &&
    typeof value.board === "string" &&
    typeof value.artifactUrl === "string" &&
    typeof value.sha256 === "string" &&
    typeof value.isActive === "boolean"
  );
}

function isReleasesResponse(value: unknown): value is ReleasesResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.releases) &&
    value.releases.every(isFirmwareReleaseRecord)
  );
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function formatSize(sizeBytes: number | null): string {
  if (typeof sizeBytes !== "number") {
    return "Not set";
  }

  return `${sizeBytes.toLocaleString()} bytes`;
}

function abbreviateSha256(value: string): string {
  if (value.length <= 16) {
    return value;
  }

  return `${value.slice(0, 12)}...${value.slice(-8)}`;
}

export default function FirmwareReleasesPage() {
  const [releases, setReleases] = useState<FirmwareReleaseRecord[]>([]);
  const [formState, setFormState] = useState<ReleaseFormState>(INITIAL_FORM_STATE);
  const [adminToken, setAdminToken] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function loadReleases() {
    setIsLoading(true);

    try {
      const response = await fetchWithShortTimeout("/api/firmware/releases?scope=all", {
        cache: "no-store",
        timeoutMessage: "Loading firmware releases timed out.",
      });
      const payload = (await response.json()) as unknown;

      if (!response.ok) {
        throw new Error(
          isRecord(payload) && typeof payload.error === "string"
            ? payload.error
            : "Unable to load firmware releases.",
        );
      }

      if (!isReleasesResponse(payload)) {
        throw new Error("The firmware releases response was invalid.");
      }

      startTransition(() => {
        setReleases(payload.releases);
        setErrorMessage(null);
      });
    } catch (error) {
      startTransition(() => {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load firmware releases.",
        );
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadReleases();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const payload: FirmwareReleaseInput = {
      version: formState.version,
      channel: formState.channel || "stable",
      board: formState.board || "esp32",
      artifactUrl: formState.artifactUrl,
      sha256: formState.sha256,
      sizeBytes:
        formState.sizeBytes.trim().length > 0 ? Number(formState.sizeBytes) : null,
      notes: formState.notes,
      isActive: formState.isActive,
    };

    try {
      const response = await fetchWithShortTimeout("/api/firmware/releases", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": adminToken.trim(),
        },
        body: JSON.stringify(payload),
        timeoutMessage: "Saving the firmware release timed out.",
      });
      const result = (await response.json()) as CreateReleaseResponse;

      if (!response.ok) {
        throw new Error(result.error || "Unable to create firmware release.");
      }

      setFormState((current) => ({
        ...INITIAL_FORM_STATE,
        channel: current.channel || "stable",
        board: current.board || "esp32",
      }));
      setSuccessMessage(`Saved firmware release ${result.release?.version ?? ""}.`);
      await loadReleases();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to create firmware release.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const activeReleases = useMemo(
    () => releases.filter((release) => release.isActive),
    [releases],
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[92rem] flex-col gap-5 px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
      <section className="dashboard-panel rounded-[1.2rem] p-6 sm:p-8 lg:p-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-100">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-200" />
              Internal Admin
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-[2.8rem]">
              Firmware release admin.
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Manage firmware packages and release metadata without exposing secrets.
            </p>
          </div>

          <AppNav currentPath="/firmware" extraLinks={[{ href: "/setup", label: "Setup Console" }]} />
        </div>
      </section>

      <section className="dashboard-panel rounded-[1.2rem] border border-amber-300/20 bg-amber-300/8 p-6 sm:p-8">
        <div className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-100">
          Admin note
        </div>
        <p className="mt-3 max-w-4xl text-sm leading-7 text-amber-50/90">
          This route is for internal release management. If `DATABASE_URL` is not configured, new release creation will return an error until the database is enabled.
        </p>
        <p className="mt-3 max-w-4xl text-sm leading-7 text-amber-50/90">
          Publishing a release also requires `ADMIN_TOKEN`. The token stays on this page only and is sent only with the release-creation request.
        </p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)]">
        <div className="dashboard-panel rounded-[1.2rem] p-6 sm:p-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
                Active Releases
              </div>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                Current rollout targets
              </h2>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300">
              {isLoading ? "Loading..." : `${releases.length} releases`}
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            {activeReleases.length > 0 ? (
              activeReleases.map((release) => (
                <article
                  key={`${release.board}-${release.channel}-${release.version}`}
                  className="rounded-[1rem] border border-emerald-400/20 bg-emerald-400/8 p-5"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.26em] text-emerald-200">
                      Active
                    </span>
                    <span className="text-lg font-semibold text-white">
                      {release.version}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                        Board / Channel
                      </div>
                      <div className="mt-2 text-sm text-white">
                        {release.board} / {release.channel}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                        Size / SHA-256
                      </div>
                      <div className="mt-2 text-sm text-white">
                        {formatSize(release.sizeBytes)}
                      </div>
                      <div className="mt-1 wrap-anywhere font-mono text-xs text-cyan-100">
                        {abbreviateSha256(release.sha256)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 text-sm leading-7 text-slate-300">
                    {release.notes || "No notes provided for this release."}
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5 text-sm text-slate-300">
                No active releases are registered yet.
              </div>
            )}
          </div>

          <div className="mt-8">
            <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
              All Releases
            </div>
            <div className="mt-4 overflow-hidden rounded-[1rem] border border-white/10">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-white/10 text-left text-sm">
                  <thead className="bg-black/20 text-slate-400">
                    <tr>
                      <th className="px-4 py-3 font-medium">Version</th>
                      <th className="px-4 py-3 font-medium">Board</th>
                      <th className="px-4 py-3 font-medium">Channel</th>
                      <th className="px-4 py-3 font-medium">Artifact</th>
                      <th className="px-4 py-3 font-medium">SHA-256</th>
                      <th className="px-4 py-3 font-medium">Active</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10 bg-white/5 text-white">
                    {releases.map((release) => (
                      <tr key={`${release.version}-${release.createdAt}`}>
                        <td className="px-4 py-3">
                          <div className="font-semibold">{release.version}</div>
                          <div className="text-xs text-slate-400">
                            {formatTimestamp(release.createdAt)}
                          </div>
                        </td>
                        <td className="px-4 py-3">{release.board}</td>
                        <td className="px-4 py-3">{release.channel}</td>
                        <td className="px-4 py-3">
                          <div className="max-w-xs wrap-anywhere font-mono text-xs text-cyan-100">
                            {release.artifactUrl}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="wrap-anywhere font-mono text-xs text-slate-200">
                            {abbreviateSha256(release.sha256)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {release.isActive ? "Yes" : "No"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <aside className="dashboard-panel rounded-[1.2rem] p-6 sm:p-8">
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Add Release
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            Register firmware artifact metadata
          </h2>
          <p className="mt-3 text-sm leading-7 text-slate-400">
            Before filling out the form, hash your compiled firmware binary from the repo root:
          </p>
          <pre className="mt-4 overflow-x-auto rounded-[1rem] border border-white/10 bg-slate-950/80 p-4 text-sm leading-7 text-cyan-100">
            <code>node scripts/hash-file.mjs path/to/firmware.bin</code>
          </pre>
          <p className="mt-3 text-sm leading-7 text-slate-400">
            Use the script output for `sha256` and `sizeBytes`, then paste your admin token below. The token is not stored in the database.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="text-sm text-slate-300">Admin Token</span>
              <input
                autoComplete="off"
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50"
                placeholder="Paste ADMIN_TOKEN for release publishing"
                required
                type="password"
                value={adminToken}
                onChange={(event) => {
                  setAdminToken(event.target.value);
                }}
              />
            </label>

            <label className="block">
              <span className="text-sm text-slate-300">Version</span>
              <input
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50"
                placeholder="0.1.1-dev"
                required
                value={formState.version}
                onChange={(event) => {
                  setFormState((current) => ({
                    ...current,
                    version: event.target.value,
                  }));
                }}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm text-slate-300">Channel</span>
                <input
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50"
                  value={formState.channel}
                  onChange={(event) => {
                    setFormState((current) => ({
                      ...current,
                      channel: event.target.value,
                    }));
                  }}
                />
              </label>

              <label className="block">
                <span className="text-sm text-slate-300">Board</span>
                <input
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50"
                  value={formState.board}
                  onChange={(event) => {
                    setFormState((current) => ({
                      ...current,
                      board: event.target.value,
                    }));
                  }}
                />
              </label>
            </div>

            <label className="block">
              <span className="text-sm text-slate-300">Artifact URL</span>
              <input
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50"
                placeholder="https://example.com/firmware/smart-shutter-0.1.1-dev.bin"
                required
                value={formState.artifactUrl}
                onChange={(event) => {
                  setFormState((current) => ({
                    ...current,
                    artifactUrl: event.target.value,
                  }));
                }}
              />
            </label>

            <label className="block">
              <span className="text-sm text-slate-300">SHA-256</span>
              <input
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 font-mono text-sm text-white outline-none transition focus:border-cyan-300/50"
                placeholder="64-character hex digest"
                required
                value={formState.sha256}
                onChange={(event) => {
                  setFormState((current) => ({
                    ...current,
                    sha256: event.target.value,
                  }));
                }}
              />
            </label>

            <label className="block">
              <span className="text-sm text-slate-300">Size Bytes</span>
              <input
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50"
                inputMode="numeric"
                placeholder="Optional"
                value={formState.sizeBytes}
                onChange={(event) => {
                  setFormState((current) => ({
                    ...current,
                    sizeBytes: event.target.value,
                  }));
                }}
              />
            </label>

            <label className="block">
              <span className="text-sm text-slate-300">Notes</span>
              <textarea
                className="mt-2 min-h-28 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50"
                placeholder="What changed in this firmware release?"
                value={formState.notes}
                onChange={(event) => {
                  setFormState((current) => ({
                    ...current,
                    notes: event.target.value,
                  }));
                }}
              />
            </label>

            <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
              <input
                checked={formState.isActive}
                type="checkbox"
                onChange={(event) => {
                  setFormState((current) => ({
                    ...current,
                    isActive: event.target.checked,
                  }));
                }}
              />
              Mark this release as active for its board/channel
            </label>

            <button
              className="w-full rounded-xl bg-cyan-400 px-4 py-4 text-base font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-cyan-400/50"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Saving..." : "Save firmware release"}
            </button>
          </form>

          {successMessage ? (
            <p className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
              {successMessage}
            </p>
          ) : null}

          {errorMessage ? (
            <p className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
              {errorMessage}
            </p>
          ) : null}
        </aside>
      </section>
    </main>
  );
}
