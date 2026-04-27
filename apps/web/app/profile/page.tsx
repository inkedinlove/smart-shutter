"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";
import { startTransition, useEffect, useState } from "react";

import AppShell from "@/app/_components/app-shell";
import {
  fetchWithShortTimeout,
  readApiData,
  redirectToLogin,
  SessionRequiredError,
} from "@/lib/client-fetch";
import type { RegisteredDevice } from "@/lib/devices";
import { useDeviceRegistry } from "@/lib/use-device-registry";

type ProfileRecord = {
  profileId: string;
  displayName: string;
  email: string | null;
  createdAt: string;
  updatedAt: string;
};

type VoiceIntegrationRecord = {
  provider: string;
  status: string;
  linkedAt: string | null;
  revokedAt: string | null;
};

type AlexaSetupRecord = {
  enabled: boolean;
  baseUrl: string;
  clientId: string;
  authorizationUrl: string;
  tokenUrl: string;
  smartHomeUrl: string;
  usesPkce: boolean;
};

type AuthMethodRecord = {
  provider: string;
  linkedAt: string | null;
  updatedAt: string | null;
};

type AuthActivityRecord = {
  activeSessionCount: number;
  lastSessionSeenAt: string | null;
  authMethods: AuthMethodRecord[];
};

type ProfileResponse = {
  profile: ProfileRecord;
  devices: RegisteredDevice[];
  voiceIntegrations: VoiceIntegrationRecord[];
  alexaSetup: AlexaSetupRecord;
  authActivity: AuthActivityRecord;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProfileRecord(value: unknown): value is ProfileRecord {
  return (
    isRecord(value) &&
    typeof value.profileId === "string" &&
    typeof value.displayName === "string"
  );
}

function isDevicesResponse(value: unknown): value is ProfileResponse {
  return (
    isRecord(value) &&
    isProfileRecord(value.profile) &&
    Array.isArray(value.devices) &&
    Array.isArray(value.voiceIntegrations) &&
    isRecord(value.alexaSetup) &&
    isRecord(value.authActivity) &&
    typeof value.alexaSetup.enabled === "boolean" &&
    typeof value.alexaSetup.baseUrl === "string" &&
    typeof value.alexaSetup.clientId === "string" &&
    typeof value.alexaSetup.authorizationUrl === "string" &&
    typeof value.alexaSetup.tokenUrl === "string" &&
    typeof value.alexaSetup.smartHomeUrl === "string" &&
    typeof value.alexaSetup.usesPkce === "boolean" &&
    typeof value.authActivity.activeSessionCount === "number" &&
    Array.isArray(value.authActivity.authMethods)
  );
}

function formatJoinedDate(value: string): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(parsed);
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "Not yet recorded";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function getAuthMethodLabel(provider: string): string {
  switch (provider) {
    case "credentials":
      return "Email and password";
    case "google":
      return "Google";
    case "apple":
      return "Apple";
    default:
      return provider;
  }
}

export const dynamic = "force-dynamic";

export default function ProfilePage() {
  const {
    deviceRegistryError,
    devices,
    isAdmin,
    isLoadingDevices,
    reloadDevices,
    selectedDeviceId,
    setSelectedDeviceId,
  } = useDeviceRegistry();
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [ownedDeviceCount, setOwnedDeviceCount] = useState(0);
  const [voiceIntegrations, setVoiceIntegrations] = useState<VoiceIntegrationRecord[]>(
    [],
  );
  const [alexaSetup, setAlexaSetup] = useState<AlexaSetupRecord | null>(null);
  const [authActivity, setAuthActivity] = useState<AuthActivityRecord | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    async function loadProfile() {
      setIsLoadingProfile(true);

      try {
        const response = await fetchWithShortTimeout("/api/profile", {
          cache: "no-store",
          timeoutMessage: "Loading your account timed out.",
        });
        const payload = await readApiData(
          response,
          isDevicesResponse,
          "Unable to load your account.",
        );

        if (isCancelled) {
          return;
        }

        startTransition(() => {
          setProfile(payload.profile);
          setOwnedDeviceCount(payload.devices.length);
          setVoiceIntegrations(payload.voiceIntegrations);
          setAlexaSetup(payload.alexaSetup);
          setAuthActivity(payload.authActivity);
          setErrorMessage(null);
        });
      } catch (error) {
        if (isCancelled) {
          return;
        }

        if (error instanceof SessionRequiredError) {
          redirectToLogin("/profile");
          return;
        }

        startTransition(() => {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load your account.",
          );
        });
      } finally {
        if (!isCancelled) {
          setIsLoadingProfile(false);
        }
      }
    }

    void loadProfile();

    return () => {
      isCancelled = true;
    };
  }, []);

  const activeErrorMessage = errorMessage ?? deviceRegistryError;
  const alexaIntegration =
    voiceIntegrations.find((integration) => integration.provider === "alexa") ?? null;
  const alexaStatus =
    alexaIntegration?.status === "linked"
      ? "Connected"
      : alexaIntegration?.status === "revoked"
        ? "Revoked"
        : "Not connected";
  const alexaStatusDetail =
    alexaIntegration?.status === "linked"
      ? alexaIntegration.linkedAt
        ? `Linked ${formatJoinedDate(alexaIntegration.linkedAt)}`
        : "Linked to your account"
      : alexaIntegration?.status === "revoked"
        ? alexaIntegration.revokedAt
          ? `Revoked ${formatJoinedDate(alexaIntegration.revokedAt)}`
          : "Previously connected, now revoked"
        : "Voice control will appear here once account linking is available.";
  const alexaSetupReady = Boolean(
    alexaSetup?.enabled &&
      alexaSetup.baseUrl &&
      alexaSetup.clientId &&
      alexaSetup.authorizationUrl &&
      alexaSetup.tokenUrl &&
      alexaSetup.smartHomeUrl,
  );
  const activeSessionCount = authActivity?.activeSessionCount ?? 0;
  const authMethods = authActivity?.authMethods ?? [];
  const lastSessionSeenAt = authActivity?.lastSessionSeenAt ?? null;

  return (
    <AppShell
      currentPath="/profile"
      devices={devices}
      isAdmin={isAdmin}
      isLoadingDevices={isLoadingDevices}
      selectedDeviceId={selectedDeviceId}
      onSelectDevice={(deviceId) => {
        setSelectedDeviceId(deviceId);
      }}
    >
      <section className="dashboard-panel rounded-[1.2rem] p-6 sm:p-8 lg:p-10">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
            Profile
          </div>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-[2.8rem]">
            Your account.
          </h1>
          <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
            Manage your account and see the devices attached to it.
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Name
            </div>
            <div className="mt-3 text-xl font-semibold text-white">
              {profile?.displayName ?? (isLoadingProfile ? "Loading..." : "Unknown")}
            </div>
          </div>

          <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Email
            </div>
            <div className="mt-3 wrap-anywhere text-base font-semibold text-white">
              {profile?.email ?? (isLoadingProfile ? "Loading..." : "No email")}
            </div>
          </div>

          <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Joined
            </div>
            <div className="mt-3 text-xl font-semibold text-white">
              {profile ? formatJoinedDate(profile.createdAt) : isLoadingProfile ? "Loading..." : "Unknown"}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
          <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Devices
            </div>
            <div className="mt-3 text-3xl font-semibold text-white">
              {ownedDeviceCount}
            </div>
            <div className="mt-2 text-sm text-slate-400">
              Attached to your account
            </div>
            <div className="mt-5">
              <Link
                className="inline-flex items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-400/12 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/18"
                href="/devices"
              >
                View devices
              </Link>
            </div>
          </div>

          <div className="rounded-[1rem] border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Session
            </div>
            <div className="mt-3 text-3xl font-semibold text-white">
              {isLoadingProfile ? "..." : activeSessionCount}
            </div>
            <div className="mt-2 text-sm text-slate-400">
              Active tracked sessions
            </div>
            <div className="mt-4 text-sm leading-7 text-slate-300">
              Last session activity: {formatDateTime(lastSessionSeenAt)}
            </div>
            <button
              className="mt-5 inline-flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:border-rose-300/30 hover:bg-rose-300/10 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSigningOut}
              type="button"
              onClick={() => {
                setIsSigningOut(true);
                void signOut({ callbackUrl: "/login" });
              }}
            >
              {isSigningOut ? "Signing out..." : "Sign out"}
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-[1rem] border border-white/10 bg-white/5 p-5">
          <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
            Sign-in methods
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {authMethods.length > 0 ? (
              authMethods.map((method) => (
                <div
                  key={method.provider}
                  className="rounded-lg border border-white/10 bg-slate-950/40 p-4"
                >
                  <div className="text-sm font-semibold text-white">
                    {getAuthMethodLabel(method.provider)}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-400">
                    Linked {formatDateTime(method.linkedAt)}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-white/10 bg-slate-950/20 p-4 text-sm text-slate-400 md:col-span-2">
                No linked sign-in methods have been recorded yet.
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 rounded-[1rem] border border-white/10 bg-white/5 p-5">
          <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
            Voice integrations
          </div>
          <div className="mt-3 space-y-4">
            <div>
              <div className="text-xl font-semibold text-white">Alexa</div>
              <div className="mt-2 text-sm leading-6 text-slate-300">
                Status: {alexaStatus}
              </div>
              <div className="mt-1 text-sm leading-6 text-slate-400">
                {alexaStatusDetail}
              </div>
            </div>

            {alexaSetup?.enabled ? (
              <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/8 p-4">
                <div className="text-sm font-semibold text-cyan-50">
                  Alexa developer console values
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-300">
                  Use these when configuring the Smart Home skill account-linking
                  and endpoint URLs. After the skill is configured, enable it in the
                  Alexa app and link the same Smart Shutter account you use here.
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-lg border border-white/10 bg-slate-950/50 p-3">
                    <div className="text-[0.7rem] uppercase tracking-[0.2em] text-slate-500">
                      Client ID
                    </div>
                    <div className="mt-2 wrap-anywhere text-sm text-white">
                      {alexaSetup.clientId || "Set ALEXA_CLIENT_ID"}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-slate-950/50 p-3">
                    <div className="text-[0.7rem] uppercase tracking-[0.2em] text-slate-500">
                      PKCE
                    </div>
                    <div className="mt-2 text-sm text-white">
                      {alexaSetup.usesPkce ? "Required" : "Not enabled"}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-slate-950/50 p-3">
                    <div className="text-[0.7rem] uppercase tracking-[0.2em] text-slate-500">
                      Authorization URI
                    </div>
                    <div className="mt-2 wrap-anywhere text-sm text-white">
                      {alexaSetup.authorizationUrl || "Set PUBLIC_APP_BASE_URL"}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-slate-950/50 p-3">
                    <div className="text-[0.7rem] uppercase tracking-[0.2em] text-slate-500">
                      Token URI
                    </div>
                    <div className="mt-2 wrap-anywhere text-sm text-white">
                      {alexaSetup.tokenUrl || "Set PUBLIC_APP_BASE_URL"}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-slate-950/50 p-3 lg:col-span-2">
                    <div className="text-[0.7rem] uppercase tracking-[0.2em] text-slate-500">
                      Smart Home Endpoint
                    </div>
                    <div className="mt-2 wrap-anywhere text-sm text-white">
                      {alexaSetup.smartHomeUrl || "Set PUBLIC_APP_BASE_URL"}
                    </div>
                  </div>
                </div>

                {!alexaSetupReady ? (
                  <div className="mt-3 text-sm text-amber-100">
                    Finish the Alexa env setup first. `PUBLIC_APP_BASE_URL`,
                    `ALEXA_CLIENT_ID`, and `ALEXA_CLIENT_SECRET` must all be set on
                    the deployed app.
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4 text-sm leading-6 text-slate-400">
                Alexa support is currently disabled for this deployment. Set
                `ALEXA_SKILL_ENABLED=true` to enable account linking and Smart Home
                control.
              </div>
            )}
          </div>
        </div>

        {activeErrorMessage ? (
          <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
            <div className="font-semibold text-amber-50">{activeErrorMessage}</div>
            <div className="mt-1 text-amber-100/90">
              Refresh your account details and try again.
            </div>
            <button
              type="button"
              className="mt-3 inline-flex rounded-lg border border-amber-200/20 bg-black/20 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-50 transition hover:bg-black/30"
              onClick={() => {
                reloadDevices();
                window.location.reload();
              }}
            >
              Retry connection
            </button>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
