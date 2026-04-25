import "server-only";

import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import { getServerSession, type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { getDb, isDatabaseConfigured } from "@/lib/db";
import { verifyPassword } from "@/lib/passwords";
import {
  assertRateLimit,
  buildRateLimitKey,
  getIpAddressFromHeaders,
  RateLimitError,
} from "@/lib/rate-limit";
import { isInternalTestMode } from "@/lib/runtime-mode";
import { normalizeEmail } from "@/lib/user-accounts";

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

export const authOptions: NextAuthOptions = {
  adapter: getAdapter(),
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 14,
    updateAge: 60 * 60 * 8,
  },
  pages: {
    signIn: "/login",
  },
  secret: AUTH_SECRET,
  useSecureCookies: process.env.NODE_ENV === "production",
  providers: [
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

        try {
          assertRateLimit({
            bucket: "auth-sign-in",
            key: buildRateLimitKey(
              getIpAddressFromHeaders(req?.headers),
              email,
            ),
            limit: 6,
            windowMs: 5 * 60_000,
            message:
              "Too many sign-in attempts. Wait a few minutes, then try again.",
          });
        } catch (error) {
          if (error instanceof RateLimitError) {
            return null;
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

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? user.profile?.displayName ?? email,
          role: user.role,
          profileId: user.profile?.id ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = typeof user.role === "string" ? user.role : "customer";
        token.profileId =
          typeof user.profileId === "string" ? user.profileId : null;
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
};

export function getAuthSession() {
  return getServerSession(authOptions);
}
