"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, startTransition, useEffect, useMemo, useState } from "react";

import AppNav from "@/app/_components/app-nav";
import {
  fetchWithShortTimeout,
  readApiData,
} from "@/lib/client-fetch";

type VerificationConfirmResponse = {
  email: string;
  displayName: string;
  alreadyVerified: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isVerificationConfirmResponse(
  value: unknown,
): value is VerificationConfirmResponse {
  return (
    isRecord(value) &&
    typeof value.email === "string" &&
    typeof value.displayName === "string" &&
    typeof value.alreadyVerified === "boolean"
  );
}

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"checking" | "success" | "error">("checking");
  const [message, setMessage] = useState("Verifying your email...");
  const [detail, setDetail] = useState<string | null>(null);

  const email = useMemo(() => searchParams.get("email")?.trim() ?? "", [searchParams]);
  const token = useMemo(() => searchParams.get("token")?.trim() ?? "", [searchParams]);

  useEffect(() => {
    let isCancelled = false;

    async function verifyEmail() {
      if (!email || !token) {
        startTransition(() => {
          setStatus("error");
          setMessage("This verification link is incomplete.");
          setDetail("Request a new verification email from the sign-in page.");
        });
        return;
      }

      try {
        const response = await fetchWithShortTimeout(
          "/api/auth/verify-email/confirm",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email,
              token,
            }),
            timeoutMessage: "Email verification timed out. Try again.",
          },
        );
        const payload = await readApiData(
          response,
          isVerificationConfirmResponse,
          "Unable to verify this email address.",
        );

        if (isCancelled) {
          return;
        }

        startTransition(() => {
          setStatus("success");
          setMessage(
            payload.alreadyVerified
              ? "Your email is already verified."
              : "Your email is now verified.",
          );
          setDetail(
            payload.alreadyVerified
              ? "You can go back to sign in whenever you're ready."
              : "You can sign in to Smart Shutter now.",
          );
        });
      } catch (error) {
        if (isCancelled) {
          return;
        }

        startTransition(() => {
          setStatus("error");
          setMessage(
            error instanceof Error
              ? error.message
              : "Unable to verify this email address.",
          );
          setDetail("Request a fresh verification email and try again.");
        });
      }
    }

    void verifyEmail();

    return () => {
      isCancelled = true;
    };
  }, [email, token]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[92rem] flex-col gap-5 px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
      <header className="dashboard-panel rounded-[1rem] px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-[1.7rem] font-semibold tracking-[0.015em] text-white sm:text-[1.9rem]">
              Smart Shutter
            </div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
              Email Verification
            </div>
          </div>

          <AppNav currentPath="/login" />
        </div>
      </header>

      <section className="dashboard-panel rounded-[1.2rem] p-6 sm:p-8 lg:p-10">
        <div className="mx-auto max-w-xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                status === "success"
                  ? "bg-emerald-300"
                  : status === "error"
                    ? "bg-amber-200"
                    : "bg-cyan-300"
              }`}
            />
            Verification
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-[2.8rem]">
            {message}
          </h1>
          {detail ? (
            <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-base">
              {detail}
            </p>
          ) : null}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              className="inline-flex items-center justify-center rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
              href={
                email
                  ? `/login?verified=1&email=${encodeURIComponent(email)}`
                  : "/login?verified=1"
              }
            >
              Go to sign in
            </Link>
            <Link
              className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:border-cyan-300/40 hover:bg-cyan-400/10"
              href="/login"
            >
              Request another email
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen w-full max-w-[92rem] items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
          <section className="dashboard-panel w-full max-w-xl rounded-[1.2rem] p-8 text-center">
            <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
              Loading
            </div>
            <h1 className="mt-3 text-3xl font-semibold text-white">
              Preparing verification.
            </h1>
          </section>
        </main>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
