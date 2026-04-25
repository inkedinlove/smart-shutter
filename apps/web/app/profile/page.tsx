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

type ProfileResponse = {
  profile: ProfileRecord;
  devices: RegisteredDevice[];
  voiceIntegrations: VoiceIntegrationRecord[];
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
    Array.isArray(value.voiceIntegrations)
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

export const dynamic = "force-dynamic";

export default function ProfilePage() {
  const {
    deviceRegistryError,
    devices,
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

  return (
    <AppShell
      currentPath="/profile"
      devices={devices}
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
            <div className="mt-3 text-sm leading-7 text-slate-300">
              Signed in and ready to manage your shutters.
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
            Voice integrations
          </div>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xl font-semibold text-white">Alexa</div>
              <div className="mt-2 text-sm leading-6 text-slate-300">
                Status: {alexaStatus}
              </div>
              <div className="mt-1 text-sm leading-6 text-slate-400">
                {alexaStatusDetail}
              </div>
            </div>
            <button
              type="button"
              disabled
              className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-400 opacity-80"
            >
              Connect Alexa
            </button>
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
