import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: string;
      profileId: string | null;
    };
  }

  interface User {
    role?: string;
    profileId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    profileId?: string | null;
    trackedSessionId?: string;
    sessionToken?: string;
    sessionRecordSyncedAt?: number;
  }
}
