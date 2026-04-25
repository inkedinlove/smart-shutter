"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Suspense,
  startTransition,
  useState,
  type FormEvent,
} from "react";

import AppNav from "@/app/_components/app-nav";
import {
  fetchWithShortTimeout,
  readApiData,
  redirectToLogin,
  SessionRequiredError,
} from "@/lib/client-fetch";

type RedeemedDevice = {
  deviceId: string;
  label: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRedeemedDevice(value: unknown): value is RedeemedDevice {
  return (
    isRecord(value) &&
    typeof value.deviceId === "string" &&
    typeof value.label === "string"
  );
}

function isRedeemResponseData(
  value: unknown,
): value is {
  device: RedeemedDevice;
} {
  return isRecord(value) && isRedeemedDevice(value.device);
}

function getClaimNextAction(message: string): string {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("expired")) {
    return "Ask for a new claim code, then try again.";
  }

  if (normalizedMessage.includes("already been used")) {
    return "Use the device from your account list or ask for another code.";
  }

  if (normalizedMessage.includes("not found") || normalizedMessage.includes("valid claim code")) {
    return "Check the code and try again, or ask for a fresh code.";
  }

  return "Try again in a moment. If the code still fails, ask for help.";
}

function ClaimPageContent() {
  const searchParams = useSearchParams();
  const prefilledClaimCode = searchParams.get("code")?.trim().toUpperCase() ?? "";
  const [claimCode, setClaimCode] = useState(prefilledClaimCode);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nextActionMessage, setNextActionMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [redeemedDevice, setRedeemedDevice] = useState<RedeemedDevice | null>(
    null,
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    setNextActionMessage(null);

    try {
      const response = await fetchWithShortTimeout("/api/devices/claims/redeem", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          claimCode,
        }),
        timeoutMessage: "Redeeming the claim code timed out.",
      });
      const payload = await readApiData(
        response,
        isRedeemResponseData,
        "Unable to redeem this claim code.",
      );
      const claimedDevice = payload.device;

      startTransition(() => {
        setRedeemedDevice(claimedDevice);
        setErrorMessage(null);
        setNextActionMessage(null);
      });
    } catch (error) {
      if (error instanceof SessionRequiredError) {
        redirectToLogin();
        return;
      }

      const message =
        error instanceof Error
          ? error.message
          : "Unable to redeem this claim code.";

      startTransition(() => {
        setRedeemedDevice(null);
        setErrorMessage(message);
        setNextActionMessage(getClaimNextAction(message));
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
              Device Claim
            </div>
          </div>

          <AppNav extraLinks={[{ href: "/connect", label: "Setup" }]} />
        </div>
      </header>

      <section className="dashboard-panel rounded-[1.2rem] p-6 sm:p-8 lg:p-10">
        <div className="mx-auto max-w-2xl">
          <div className="space-y-3 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
              Claim Device
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-[2.8rem]">
              Claim your device.
            </h1>
            <p className="text-sm leading-7 text-slate-300 sm:text-base">
              Opened from a claim link? Your code is ready below. Otherwise,
              enter the code that came with your device.
            </p>
          </div>

          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="text-sm text-slate-300">Claim code</span>
              <input
                autoCapitalize="characters"
                autoComplete="off"
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-4 text-center font-mono text-lg uppercase tracking-[0.28em] text-white outline-none transition focus:border-cyan-300/50"
                placeholder="ABCD-EFGH"
                required
                value={claimCode}
                onChange={(event) => {
                  setClaimCode(event.target.value.toUpperCase());
                }}
              />
            </label>

            {prefilledClaimCode ? (
              <div className="rounded-[1rem] border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm text-cyan-100">
                <div className="font-semibold text-cyan-50">Claim code detected</div>
                <div className="mt-1 text-cyan-100/90">
                  This link already included your code. Review it below and continue.
                </div>
              </div>
            ) : null}

            <button
              className="w-full rounded-xl bg-cyan-400 px-4 py-4 text-base font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-cyan-400/50"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Claiming..." : "Claim device"}
            </button>
          </form>

          {redeemedDevice ? (
            <section className="mt-6 rounded-[1rem] border border-emerald-400/20 bg-emerald-400/10 p-5">
              <div className="text-xs uppercase tracking-[0.24em] text-emerald-200">
                Claimed
              </div>
              <h2 className="mt-3 text-2xl font-semibold text-white">
                {redeemedDevice.label}
              </h2>
              <div className="mt-2 font-mono text-sm text-emerald-100">
                {redeemedDevice.deviceId}
              </div>
              <div className="mt-3 text-sm leading-7 text-emerald-50/90">
                Your device is now attached to this account. Continue to setup to
                bring it online.
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  className="inline-flex items-center justify-center rounded-xl border border-emerald-300/30 bg-emerald-400/12 px-4 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/18"
                  href={`/setup-device?deviceId=${encodeURIComponent(redeemedDevice.deviceId)}`}
                >
                  Continue setup
                </Link>
                <Link
                  className="inline-flex items-center justify-center rounded-xl border border-emerald-300/20 bg-black/20 px-4 py-3 text-sm font-semibold text-emerald-50 transition hover:bg-black/30"
                  href="/devices"
                >
                  Go to devices
                </Link>
              </div>
            </section>
          ) : null}

          {errorMessage ? (
            <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
              <div className="font-semibold text-amber-50">{errorMessage}</div>
              {nextActionMessage ? (
                <div className="mt-1 text-amber-100/90">{nextActionMessage}</div>
              ) : null}
              <button
                type="button"
                className="mt-3 inline-flex rounded-lg border border-amber-200/20 bg-black/20 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-50 transition hover:bg-black/30"
                onClick={() => {
                  setErrorMessage(null);
                  setNextActionMessage(null);
                }}
              >
                Try again
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

export default function ClaimPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen w-full max-w-[92rem] flex-col gap-5 px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
          <section className="dashboard-panel rounded-[1.2rem] p-6 sm:p-8 lg:p-10">
            <div className="text-sm text-slate-300">Loading claim screen...</div>
          </section>
        </main>
      }
    >
      <ClaimPageContent />
    </Suspense>
  );
}
