"use client";

import {
  getProviders,
  signIn,
  type ClientSafeProvider,
} from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useEffect,
  startTransition,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import AppNav from "@/app/_components/app-nav";
import {
  ApiRequestError,
  fetchWithShortTimeout,
  readApiData,
} from "@/lib/client-fetch";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSignInErrorMessage(errorValue: string): string {
  const rawMessage = errorValue.trim();

  if (!rawMessage || rawMessage === "CredentialsSignin") {
    return "We couldn't sign you in with that email and password.";
  }

  try {
    return decodeURIComponent(rawMessage);
  } catch {
    return rawMessage;
  }
}

type OAuthProviderId = "google" | "apple";

const OAUTH_PROVIDER_ORDER: OAuthProviderId[] = ["google", "apple"];

function normalizeAuthProviderErrorMessage(errorValue: string | null): string | null {
  if (!errorValue) {
    return null;
  }

  const rawMessage = errorValue.trim();

  if (!rawMessage) {
    return null;
  }

  switch (rawMessage) {
    case "OAuthAccountNotLinked":
      return "This email is already linked to a different sign-in method. Try the method you used first.";
    case "AccessDenied":
      return "We couldn't complete that provider sign-in request.";
    case "Callback":
    case "OAuthCallback":
      return "The provider sign-in callback did not complete successfully.";
    case "Configuration":
      return "This sign-in provider is not fully configured yet.";
    default:
      return normalizeSignInErrorMessage(rawMessage);
  }
}

function isSupportedOAuthProvider(
  provider: ClientSafeProvider,
): provider is ClientSafeProvider & { id: OAuthProviderId } {
  return (
    provider.type === "oauth" &&
    (provider.id === "google" || provider.id === "apple")
  );
}

function getOAuthProviderButtonLabel(providerId: OAuthProviderId): string {
  switch (providerId) {
    case "google":
      return "Continue with Google";
    case "apple":
      return "Continue with Apple";
    default:
      return "Continue";
  }
}

function isRegistrationConflictError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError && error.status === 409;
}

function isRegisterResponseData(
  value: unknown,
): value is {
  account: {
    displayName: string;
    email: string;
    role: string;
  };
} {
  return (
    isRecord(value) &&
    isRecord(value.account) &&
    typeof value.account.displayName === "string" &&
    typeof value.account.email === "string" &&
    typeof value.account.role === "string"
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingOAuthProviderId, setPendingOAuthProviderId] =
    useState<OAuthProviderId | null>(null);
  const [oauthProviders, setOauthProviders] = useState<
    Array<ClientSafeProvider & { id: OAuthProviderId }>
  >([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nextActionMessage, setNextActionMessage] = useState<string | null>(null);

  const callbackUrl = useMemo(
    () => searchParams.get("callbackUrl") || "/devices",
    [searchParams],
  );
  const expiredReason = searchParams.get("reason") === "session-expired";
  const providerErrorMessage = useMemo(
    () => normalizeAuthProviderErrorMessage(searchParams.get("error")),
    [searchParams],
  );
  const activeErrorMessage = errorMessage ?? providerErrorMessage;
  const activeNextActionMessage =
    errorMessage != null
      ? nextActionMessage
      : providerErrorMessage
        ? "Try again, or use a different sign-in option if you already have one set up."
        : null;
  const isBusy = isSubmitting || pendingOAuthProviderId !== null;

  useEffect(() => {
    let isCancelled = false;

    async function loadProviders() {
      try {
        const providers = await getProviders();

        if (isCancelled || !providers) {
          return;
        }

        const nextProviders = Object.values(providers)
          .filter(isSupportedOAuthProvider)
          .sort(
            (left, right) =>
              OAUTH_PROVIDER_ORDER.indexOf(left.id) -
              OAUTH_PROVIDER_ORDER.indexOf(right.id),
          );

        startTransition(() => {
          setOauthProviders(nextProviders);
        });
      } catch {
        if (isCancelled) {
          return;
        }

        startTransition(() => {
          setOauthProviders([]);
        });
      }
    }

    void loadProviders();

    return () => {
      isCancelled = true;
    };
  }, []);

  async function handleSignIn() {
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl,
    });

    if (!result) {
      throw new Error("Unable to sign you in right now.");
    }

    if (result.error) {
      throw new Error(normalizeSignInErrorMessage(result.error));
    }

    router.push(result.url ?? callbackUrl);
    router.refresh();
  }

  async function handleRegister() {
    const response = await fetchWithShortTimeout("/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        displayName,
        email,
        password,
      }),
      timeoutMessage: "Creating your account timed out.",
    });
    await readApiData(
      response,
      isRegisterResponseData,
      "Unable to create your account.",
    );
    await handleSignIn();
  }

  async function handleOAuthSignIn(providerId: OAuthProviderId) {
    setPendingOAuthProviderId(providerId);
    setErrorMessage(null);
    setNextActionMessage(null);

    try {
      const result = await signIn(providerId, {
        callbackUrl,
      });

      if (result?.error) {
        throw new Error(
          normalizeAuthProviderErrorMessage(result.error) ??
            "Unable to continue with that provider right now.",
        );
      }
    } catch (error) {
      startTransition(() => {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to continue with that provider right now.",
        );
        setNextActionMessage(
          "Try again in a moment, or use another sign-in option while we sort that out.",
        );
      });
      setPendingOAuthProviderId(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    setNextActionMessage(null);

    try {
      if (mode === "register") {
        await handleRegister();
      } else {
        await handleSignIn();
      }
    } catch (error) {
      startTransition(() => {
        const registrationConflict =
          mode === "register" && isRegistrationConflictError(error);

        if (registrationConflict) {
          setMode("signin");
        }

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to continue right now.",
        );
        setNextActionMessage(
          registrationConflict
            ? "This email may already be tied to an account. Try signing in with the password you entered."
            : mode === "register"
              ? "Check your details, then try creating the account again."
              : "Check your email and password, then try again.",
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
              Customer Access
            </div>
          </div>

          <AppNav />
        </div>
      </header>

      <section className="dashboard-panel rounded-[1.2rem] p-6 sm:p-8 lg:p-10">
        <div className="mx-auto max-w-xl">
          <div className="space-y-3 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
              Account
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-[2.8rem]">
              {mode === "register" ? "Create your account." : "Sign in."}
            </h1>
            <p className="text-sm leading-7 text-slate-300 sm:text-base">
              Use your account to view, claim, and control your devices.
            </p>
          </div>

          <div className="mt-8 flex rounded-xl border border-white/10 bg-white/5 p-1">
            <button
              type="button"
              className={`flex-1 rounded-lg px-4 py-3 text-sm font-semibold transition ${
                mode === "signin"
                  ? "bg-cyan-400 text-slate-950"
                  : "text-slate-200 hover:text-white"
              }`}
              onClick={() => {
                setMode("signin");
                setErrorMessage(null);
                setNextActionMessage(null);
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              className={`flex-1 rounded-lg px-4 py-3 text-sm font-semibold transition ${
                mode === "register"
                  ? "bg-cyan-400 text-slate-950"
                  : "text-slate-200 hover:text-white"
              }`}
              onClick={() => {
                setMode("register");
                setErrorMessage(null);
                setNextActionMessage(null);
              }}
            >
              Create account
            </button>
          </div>

          {oauthProviders.length > 0 ? (
            <div className="mt-6 space-y-3">
              {oauthProviders.map((provider) => (
                <button
                  key={provider.id}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-base font-semibold text-white transition hover:border-cyan-300/40 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isBusy}
                  type="button"
                  onClick={() => {
                    void handleOAuthSignIn(provider.id);
                  }}
                >
                  {pendingOAuthProviderId === provider.id
                    ? `Connecting ${provider.name}...`
                    : getOAuthProviderButtonLabel(provider.id)}
                </button>
              ))}

              <div className="relative py-2 text-center">
                <div className="absolute inset-x-0 top-1/2 border-t border-white/10" />
                <span className="relative bg-[var(--dashboard-bg)] px-3 text-xs uppercase tracking-[0.24em] text-slate-500">
                  Or use email
                </span>
              </div>
            </div>
          ) : null}

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            {mode === "register" ? (
              <label className="block">
                <span className="text-sm text-slate-300">Full name</span>
                <input
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50"
                  placeholder="Jane Customer"
                  required
                  value={displayName}
                  onChange={(event) => {
                    setDisplayName(event.target.value);
                  }}
                />
              </label>
            ) : null}

            <label className="block">
              <span className="text-sm text-slate-300">Email</span>
              <input
                autoComplete="email"
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50"
                placeholder="you@example.com"
                required
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
              />
            </label>

            <label className="block">
              <span className="text-sm text-slate-300">Password</span>
              <input
                autoComplete={
                  mode === "register" ? "new-password" : "current-password"
                }
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50"
                placeholder="At least 8 characters"
                required
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                }}
              />
            </label>

            <button
              className="w-full rounded-xl bg-cyan-400 px-4 py-4 text-base font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-cyan-400/50"
              disabled={isBusy}
              type="submit"
            >
              {isSubmitting
                ? mode === "register"
                  ? "Creating account..."
                  : "Signing in..."
                : mode === "register"
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>

          {activeErrorMessage ? (
            <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
              <div className="font-semibold text-amber-50">{activeErrorMessage}</div>
              {activeNextActionMessage ? (
                <div className="mt-1 text-amber-100/90">
                  {activeNextActionMessage}
                </div>
              ) : null}
            </div>
          ) : null}

          {expiredReason && !activeErrorMessage ? (
            <div className="mt-4 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
              <div className="font-semibold text-white">Please sign in again.</div>
              <div className="mt-1">
                Your session ended. Sign in to continue with your devices.
              </div>
            </div>
          ) : null}

          <div className="mt-6 text-center text-sm text-slate-400">
            Already signed in and need to add a device?{" "}
            <Link className="font-semibold text-cyan-100 hover:text-white" href="/claim">
              Enter a claim code
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen w-full max-w-[92rem] items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
          <section className="dashboard-panel w-full max-w-xl rounded-[1.2rem] p-8 text-center">
            <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
              Loading
            </div>
            <h1 className="mt-3 text-3xl font-semibold text-white">
              Preparing sign in.
            </h1>
          </section>
        </main>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
