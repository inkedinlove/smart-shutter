"use client";

import { startTransition, useEffect, useState, type FormEvent } from "react";

import AppNav from "@/app/_components/app-nav";
import CopyButton from "@/app/setup/copy-button";
import { fetchWithShortTimeout, readApiData } from "@/lib/client-fetch";

type CreatedClaim = {
  deviceId: string;
  deviceLabel: string;
  claimCode: string;
  shortDisplayCode: string;
  claimUrl: string | null;
  deviceSetupUrl: string | null;
  status: string;
  expiresAt: string;
  claimedAt: string | null;
  createdAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCreatedClaim(value: unknown): value is CreatedClaim {
  return (
    isRecord(value) &&
    typeof value.deviceId === "string" &&
    typeof value.deviceLabel === "string" &&
    typeof value.claimCode === "string" &&
    typeof value.shortDisplayCode === "string" &&
    ("claimUrl" in value ? value.claimUrl === null || typeof value.claimUrl === "string" : true)
  );
}

function isCreateClaimResponseData(
  value: unknown,
): value is {
  claim: CreatedClaim;
} {
  return isRecord(value) && isCreatedClaim(value.claim);
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

export default function AdminClaimsPage() {
  const [adminToken, setAdminToken] = useState("");
  const [deviceId, setDeviceId] = useState("shutter-dev-001");
  const [expiresInMinutes, setExpiresInMinutes] = useState("60");
  const [claim, setClaim] = useState<CreatedClaim | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [prefilledFromDeviceList, setPrefilledFromDeviceList] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedDeviceId = params.get("deviceId")?.trim();

    if (requestedDeviceId) {
      setDeviceId(requestedDeviceId);
      setPrefilledFromDeviceList(true);
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetchWithShortTimeout("/api/devices/claims/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": adminToken.trim(),
        },
        body: JSON.stringify({
          deviceId,
          expiresInMinutes: Number(expiresInMinutes),
        }),
        timeoutMessage: "Creating the claim code timed out.",
      });
      const payload = await readApiData(
        response,
        isCreateClaimResponseData,
        "Unable to create a claim code.",
      );
      const createdClaim = payload.claim;

      startTransition(() => {
        setClaim(createdClaim);
        setErrorMessage(null);
      });
    } catch (error) {
      startTransition(() => {
        setClaim(null);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to create a claim code.",
        );
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[92rem] flex-col gap-5 px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
      <header className="dashboard-panel rounded-[1rem] px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-[1.7rem] font-semibold tracking-[0.015em] text-white sm:text-[1.9rem]">
              Smart Shutter
            </div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
              Internal Claims
            </div>
          </div>

          <AppNav
            extraLinks={[
              { href: "/admin/devices", label: "Devices" },
              { href: "/setup", label: "Setup Console" },
            ]}
          />
        </div>
      </header>

      <section className="dashboard-panel rounded-[1.2rem] border border-amber-300/20 bg-amber-300/8 p-6 sm:p-8">
        <div className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-100">
          Internal Admin
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-amber-50/90">
          Create a time-limited claim code for a device. Customers redeem these
          codes after signing in.
        </p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
        <section className="dashboard-panel rounded-[1.2rem] p-6 sm:p-8">
          <div className="space-y-3">
            <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
              Create Claim
            </div>
            <h1 className="text-3xl font-semibold text-white">
              Generate a claim code.
            </h1>
            <p className="max-w-2xl text-sm leading-7 text-slate-300">
              Create a customer handoff link for a registered device, then send
              that link to the customer.
            </p>
          </div>

          {prefilledFromDeviceList ? (
            <div className="mt-6 rounded-[1rem] border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm text-cyan-100">
              This device was preselected from the device list. Review the expiry
              window, then create the claim link.
            </div>
          ) : null}

          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="text-sm text-slate-300">Admin token</span>
              <input
                autoComplete="off"
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50"
                placeholder="Paste ADMIN_TOKEN"
                required
                type="password"
                value={adminToken}
                onChange={(event) => {
                  setAdminToken(event.target.value);
                }}
              />
              <div className="mt-2 text-xs leading-6 text-slate-400">
                Used only for this request. It is not stored in the browser or database.
              </div>
            </label>

            <label className="block">
              <span className="text-sm text-slate-300">Device ID</span>
              <input
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 font-mono text-sm text-white outline-none transition focus:border-cyan-300/50"
                placeholder="shutter-dev-001"
                required
                value={deviceId}
                onChange={(event) => {
                  setDeviceId(event.target.value);
                }}
              />
            </label>

            <label className="block">
              <span className="text-sm text-slate-300">Expires in minutes</span>
              <input
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50"
                inputMode="numeric"
                min="1"
                required
                value={expiresInMinutes}
                onChange={(event) => {
                  setExpiresInMinutes(event.target.value);
                }}
              />
            </label>

            <button
              className="w-full rounded-xl bg-cyan-400 px-4 py-4 text-base font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-cyan-400/50"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Creating..." : "Create claim code"}
            </button>
          </form>

          {errorMessage ? (
            <p className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
              {errorMessage}
            </p>
          ) : null}
        </section>

        <aside className="dashboard-panel rounded-[1.2rem] p-6 sm:p-8">
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Generated code
          </div>

          {claim ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-[1rem] border border-emerald-400/20 bg-emerald-400/10 p-5">
                <div className="text-xs uppercase tracking-[0.22em] text-emerald-200">
                  Claim code
                </div>
                <div className="mt-3 font-mono text-3xl font-semibold tracking-[0.18em] text-white">
                  {claim.shortDisplayCode}
                </div>
                <div className="mt-4">
                  <CopyButton label="Copy code" value={claim.shortDisplayCode} />
                </div>
              </div>

              <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
                  Device
                </div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {claim.deviceLabel}
                </div>
                <div className="mt-1 font-mono text-sm text-cyan-100">
                  {claim.deviceId}
                </div>
              </div>

              <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
                  Expires
                </div>
                <div className="mt-2 text-base font-semibold text-white">
                  {formatTimestamp(claim.expiresAt)}
                </div>
              </div>

              <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
                  Send this link to customer
                </div>
                <div className="mt-2 text-sm leading-7 text-slate-300">
                  The customer opens the link, signs in, claims the device, and
                  continues directly into setup.
                </div>
              </div>

              <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
                  Claim link
                </div>
                {claim.claimUrl ? (
                  <>
                    <div className="mt-2 wrap-anywhere break-all text-sm leading-6 text-cyan-100">
                      {claim.claimUrl}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <CopyButton label="Copy link" value={claim.claimUrl} />
                    </div>
                  </>
                ) : (
                  <div className="mt-2 text-sm leading-6 text-slate-300">
                    Set <span className="font-mono text-cyan-100">PUBLIC_APP_BASE_URL</span>{" "}
                    to generate a customer claim link.
                  </div>
                )}
              </div>

              <div className="rounded-[1rem] border border-dashed border-white/12 bg-black/18 p-5">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
                  QR-ready handoff
                </div>
                <div className="mt-3 flex items-center gap-4">
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-[0.9rem] border border-white/10 bg-white/5 text-[11px] uppercase tracking-[0.24em] text-slate-400">
                    QR Link
                  </div>
                  <p className="text-sm leading-7 text-slate-300">
                    Encode the claim link above into a QR code for packaging,
                    setup cards, or internal handoff. The QR should only contain
                    the claim link, never MQTT or Wi-Fi secrets.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-[1rem] border border-white/10 bg-white/5 p-5 text-sm text-slate-300">
              Create a claim code to show it here.
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
