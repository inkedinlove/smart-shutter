import "server-only";

import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import { getServerSession, type NextAuthOptions } from "next-auth";
import AppleProvider from "next-auth/providers/apple";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";

import {
  AUTH_SESSION_MAX_AGE_SECONDS,
  AUTH_SESSION_UPDATE_AGE_SECONDS,
  clearTrackedJwtSessionRecord,
  syncTrackedJwtSessionRecord,
} from "@/lib/auth-session-tracking";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { verifyPassword } from "@/lib/passwords";
import {
  assertRateLimit,
  buildRateLimitKey,
  clearRateLimit,
  getIpAddressFromHeaders,
  RateLimitError,
} from "@/lib/rate-limit";
import { isInternalTestMode } from "@/lib/runtime-mode";
import { normalizeEmail, syncOAuthUserAccount } from "@/lib/user-accounts";

function normalizePublicBaseUrl(value: string | undefined): string {
  const normalized = value?.trim() ?? "";
  return normalized.replace(/\/+$/, "");
}

function ensureNextAuthBaseUrlFromPublicBaseUrl() {
  const normalizedBaseUrl = normalizePublicBaseUrl(
    process.env.PUBLIC_APP_BASE_URL,
  );

  if (!normalizedBaseUrl) {
    return;
  }

  if (!process.env.NEXTAUTH_URL?.trim()) {
    process.env.NEXTAUTH_URL = normalizedBaseUrl;
  }

  if (!process.env.NEXTAUTH_URL_INTERNAL?.trim()) {
    process.env.NEXTAUTH_URL_INTERNAL = normalizedBaseUrl;
  }
}

function isSensitiveAuthLogKey(key: string): boolean {
  return [
    "access_token",
    "refresh_token",
    "id_token",
    "client_secret",
    "clientSecret",
    "authorization",
  ].includes(key);
}

function sanitizeAuthLogMetadata(value: unknown, depth = 0): unknown {
  if (depth > 3) {
    return "[truncated]";
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeAuthLogMetadata(entry, depth + 1));
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [
        key,
        isSensitiveAuthLogKey(key)
          ? "[redacted]"
          : sanitizeAuthLogMetadata(entryValue, depth + 1),
      ]),
    );
  }

  return value;
}

function createAuthLogger(): NonNullable<NextAuthOptions["logger"]> {
  return {
    error(code, metadata) {
      console.error(`[NextAuth] ${code}`, sanitizeAuthLogMetadata(metadata));
    },
    warn(code) {
      console.warn(`[NextAuth] ${code}`);
    },
    debug(code, metadata) {
      if (
        process.env.NODE_ENV !== "production" ||
        process.env.AUTH_DEBUG?.trim() === "true"
      ) {
        console.debug(`[NextAuth] ${code}`, sanitizeAuthLogMetadata(metadata));
      }
    },
  };
}

ensureNextAuthBaseUrlFromPublicBaseUrl();

function getAdapter(): Adapter | undefined {
  const db = getDb();

  if (!isDatabaseConfigured() || !db) {
    return undefined;
  }

  return PrismaAdapter(db) as Adapter;
}

function getAuthSecret(): string {
  const configuredSecret = process.env.AUTH_SECRET?.trim();

  if (configuredSecret) {
    return configuredSecret;
  }

  if (isInternalTestMode()) {
    return "internal-test-auth-secret";
  }

  throw new Error("AUTH_SECRET is required in customer mode.");
}

const AUTH_SECRET = getAuthSecret();

function getConfiguredGoogleProvider() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return null;
  }

  return GoogleProvider({
    clientId,
    clientSecret,
    allowDangerousEmailAccountLinking: true,
  });
}

function getConfiguredAppleProvider() {
  const clientId = process.env.APPLE_CLIENT_ID?.trim();
  const clientSecret = process.env.APPLE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return null;
  }

  return AppleProvider({
    clientId,
    clientSecret,
    allowDangerousEmailAccountLinking: true,
  });
}

function buildConfiguredProviders(): NextAuthOptions["providers"] {
  const providers: NextAuthOptions["providers"] = [];
  const googleProvider = getConfiguredGoogleProvider();
  const appleProvider = getConfiguredAppleProvider();

  if (googleProvider) {
    providers.push(googleProvider);
  }

  if (appleProvider) {
    providers.push(appleProvider);
  }

  providers.push(
    CredentialsProvider({
      name: "Email and Password",
      credentials: {
        email: {
          label: "Email",
          type: "email",
        },
        password: {
          label: "Password",
          type: "password",
        },
      },
      async authorize(credentials, req) {
        const db = getDb();

        if (!isDatabaseConfigured() || !db) {
          return null;
        }

        const email =
          typeof credentials?.email === "string"
            ? normalizeEmail(credentials.email)
            : "";
        const password =
          typeof credentials?.password === "string" ? credentials.password : "";

        if (!email || !password) {
          return null;
        }

        const rateLimitKey = buildAuthSignInRateLimitKey({
          email,
          headers: req?.headers,
        });

        try {
          assertRateLimit({
            bucket: "auth-sign-in",
            key: rateLimitKey,
            limit: 10,
            windowMs: 5 * 60_000,
            message:
              "Too many sign-in attempts. Wait a few minutes, then try again.",
          });
        } catch (error) {
          if (error instanceof RateLimitError) {
            throw new Error(error.message);
          }

          throw error;
        }

        const user = await db.user.findUnique({
          where: {
            email,
          },
          include: {
            profile: true,
          },
        });

        if (!user || !user.passwordHash) {
          return null;
        }

        const passwordMatches = await verifyPassword(password, user.passwordHash);

        if (!passwordMatches) {
          return null;
        }

        if (user.emailVerificationRequired && !user.emailVerified) {
          throw new Error("Verify your email before signing in.");
        }

        clearRateLimit({
          bucket: "auth-sign-in",
          key: rateLimitKey,
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? user.profile?.displayName ?? email,
          role: user.role,
          profileId: user.profile?.id ?? null,
        };
      },
    }),
  );

  return providers;
}

function getUserIdFromAuthPayload(input: {
  tokenSub?: string | null;
  userId?: string | null;
}): string {
  if (typeof input.userId === "string" && input.userId.trim()) {
    return input.userId.trim();
  }

  if (typeof input.tokenSub === "string" && input.tokenSub.trim()) {
    return input.tokenSub.trim();
  }

  return "";
}

function isOAuthSignIn(provider?: string | null): boolean {
  return Boolean(provider && provider !== "credentials");
}

function buildAuthSignInRateLimitKey(input: {
  email: string;
  headers: Headers | Record<string, string | string[] | undefined> | undefined;
}): string {
  const normalizedEmail = normalizeEmail(input.email);
  const requestIpAddress = getIpAddressFromHeaders(input.headers);

  if (requestIpAddress && requestIpAddress !== "unknown" && normalizedEmail) {
    return buildRateLimitKey("ip", requestIpAddress, "email", normalizedEmail);
  }

  if (normalizedEmail) {
    return buildRateLimitKey("email", normalizedEmail);
  }

  if (requestIpAddress && requestIpAddress !== "unknown") {
    return buildRateLimitKey("ip", requestIpAddress);
  }

  return buildRateLimitKey("anonymous-sign-in");
}

export const authOptions: NextAuthOptions = {
  adapter: getAdapter(),
  debug: process.env.AUTH_DEBUG?.trim() === "true",
  logger: createAuthLogger(),
  session: {
    strategy: "jwt",
    maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
    updateAge: AUTH_SESSION_UPDATE_AGE_SECONDS,
  },
  pages: {
    signIn: "/login",
  },
  secret: AUTH_SECRET,
  useSecureCookies: process.env.NODE_ENV === "production",
  providers: buildConfiguredProviders(),
  callbacks: {
    async jwt({ token, user, account, trigger }) {
      const db = getDb();
      const userId = getUserIdFromAuthPayload({
        userId: typeof user?.id === "string" ? user.id : null,
        tokenSub: typeof token.sub === "string" ? token.sub : null,
      });

      if (userId && typeof token.sub !== "string") {
        token.sub = userId;
      }

      if (
        isDatabaseConfigured() &&
        db &&
        userId &&
        isOAuthSignIn(account?.provider)
      ) {
        await syncOAuthUserAccount({
          userId,
          email:
            typeof user?.email === "string"
              ? user.email
              : typeof token.email === "string"
                ? token.email
                : null,
          displayName:
            typeof user?.name === "string"
              ? user.name
              : typeof token.name === "string"
                ? token.name
                : null,
        });
      }

      if (
        isDatabaseConfigured() &&
        db &&
        userId &&
        (Boolean(user) ||
          typeof token.role !== "string" ||
          typeof token.profileId !== "string")
      ) {
        const dbUser = await db.user.findUnique({
          where: {
            id: userId,
          },
          include: {
            profile: true,
          },
        });

        if (dbUser) {
          token.role = dbUser.role;
          token.profileId = dbUser.profile?.id ?? null;
          token.name =
            token.name ??
            dbUser.name ??
            dbUser.profile?.displayName ??
            null;
          token.email = token.email ?? dbUser.email ?? null;
        }
      }

      if (user) {
        token.role = typeof user.role === "string" ? user.role : "customer";
        token.profileId =
          typeof user.profileId === "string" ? user.profileId : null;
      }

      if (isDatabaseConfigured() && db && userId) {
        await syncTrackedJwtSessionRecord({
          token,
          userId,
          trigger,
        });
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.sub === "string" ? token.sub : "";
        session.user.role =
          typeof token.role === "string" ? token.role : "customer";
        session.user.profileId =
          typeof token.profileId === "string" ? token.profileId : null;
      }

      return session;
    },
  },
  events: {
    async signOut(message) {
      await clearTrackedJwtSessionRecord("token" in message ? message.token : null);
    },
  },
};

export function getAuthSession() {
  return getServerSession(authOptions);
}
