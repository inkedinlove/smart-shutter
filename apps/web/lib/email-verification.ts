import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { getDb, isDatabaseConfigured } from "@/lib/db";
import { normalizeEmail } from "@/lib/user-accounts";
import {
  isMailConfigured,
  resolvePublicAppBaseUrl,
  sendTransactionalEmail,
} from "@/lib/mailer";

const EMAIL_VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export class EmailVerificationError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "EmailVerificationError";
    this.statusCode = statusCode;
  }
}

function getEmailVerificationDb() {
  const db = getDb();

  if (!isDatabaseConfigured() || !db) {
    throw new EmailVerificationError(
      "Email verification requires the database-backed platform mode.",
      503,
    );
  }

  return db;
}

function buildEmailVerificationIdentifier(email: string): string {
  return `verify-email:${normalizeEmail(email)}`;
}

function hashEmailVerificationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateEmailVerificationToken(): string {
  return randomBytes(32).toString("base64url");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildVerificationUrl(input: {
  baseUrl: string;
  email: string;
  token: string;
}): string {
  const verificationUrl = new URL("/verify-email", input.baseUrl);
  verificationUrl.searchParams.set("email", input.email);
  verificationUrl.searchParams.set("token", input.token);
  return verificationUrl.toString();
}

function buildVerificationEmail(input: {
  displayName: string;
  email: string;
  verificationUrl: string;
}): {
  subject: string;
  text: string;
  html: string;
} {
  const escapedDisplayName = escapeHtml(input.displayName);
  const escapedVerificationUrl = escapeHtml(input.verificationUrl);

  return {
    subject: "Verify your Smart Shutter email",
    text: [
      `Hi ${input.displayName},`,
      "",
      "Please verify your Smart Shutter email address before signing in.",
      "",
      input.verificationUrl,
      "",
      "If you did not create this account, you can ignore this email.",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#0f172a">
        <p>Hi ${escapedDisplayName},</p>
        <p>Please verify your Smart Shutter email address before signing in.</p>
        <p>
          <a href="${escapedVerificationUrl}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#22d3ee;color:#082f49;text-decoration:none;font-weight:700">
            Verify email
          </a>
        </p>
        <p style="word-break:break-all">${escapedVerificationUrl}</p>
        <p>If you did not create this account, you can ignore this email.</p>
      </div>
    `,
  };
}

export function isEmailVerificationDeliveryReady(request?: Request): boolean {
  return isMailConfigured() && Boolean(resolvePublicAppBaseUrl(request));
}

export async function sendEmailVerification(input: {
  email: string;
  displayName: string;
  request?: Request;
}): Promise<boolean> {
  const db = getEmailVerificationDb();
  const email = normalizeEmail(input.email);
  const baseUrl = resolvePublicAppBaseUrl(input.request);

  if (!email || !baseUrl) {
    throw new EmailVerificationError(
      "Email verification is not fully configured on this deployment.",
      503,
    );
  }

  if (!isMailConfigured()) {
    throw new EmailVerificationError(
      "SMTP email delivery is not configured on this deployment.",
      503,
    );
  }

  const rawToken = generateEmailVerificationToken();
  const hashedToken = hashEmailVerificationToken(rawToken);
  const identifier = buildEmailVerificationIdentifier(email);
  const expires = new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS);

  await db.verificationToken.deleteMany({
    where: {
      identifier,
    },
  });

  await db.verificationToken.create({
    data: {
      identifier,
      token: hashedToken,
      expires,
    },
  });

  const verificationUrl = buildVerificationUrl({
    baseUrl,
    email,
    token: rawToken,
  });
  const message = buildVerificationEmail({
    displayName: input.displayName,
    email,
    verificationUrl,
  });

  await sendTransactionalEmail({
    to: email,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });

  return true;
}

export async function confirmEmailVerification(input: {
  email: string;
  token: string;
}): Promise<{
  email: string;
  displayName: string;
  alreadyVerified: boolean;
}> {
  const db = getEmailVerificationDb();
  const email = normalizeEmail(input.email);
  const rawToken = input.token.trim();

  if (!email || !rawToken) {
    throw new EmailVerificationError("Invalid verification link.", 400);
  }

  const identifier = buildEmailVerificationIdentifier(email);
  const hashedToken = hashEmailVerificationToken(rawToken);

  return db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: {
        email,
      },
      include: {
        profile: true,
      },
    });

    if (!user) {
      throw new EmailVerificationError("We couldn't verify that email address.", 404);
    }

    if (user.emailVerified && !user.emailVerificationRequired) {
      return {
        email,
        displayName:
          user.profile?.displayName ?? user.name ?? email.split("@")[0] ?? email,
        alreadyVerified: true,
      };
    }

    const verificationToken = await tx.verificationToken.findUnique({
      where: {
        token: hashedToken,
      },
    });

    if (
      !verificationToken ||
      verificationToken.identifier !== identifier ||
      verificationToken.expires.getTime() <= Date.now()
    ) {
      if (verificationToken && verificationToken.expires.getTime() <= Date.now()) {
        await tx.verificationToken.deleteMany({
          where: {
            identifier,
          },
        });
      }

      throw new EmailVerificationError(
        "This verification link is invalid or has expired.",
        410,
      );
    }

    const verifiedAt = new Date();

    await tx.user.update({
      where: {
        id: user.id,
      },
      data: {
        emailVerified: verifiedAt,
        emailVerificationRequired: false,
      },
    });

    await tx.verificationToken.deleteMany({
      where: {
        identifier,
      },
    });

    return {
      email,
      displayName:
        user.profile?.displayName ?? user.name ?? email.split("@")[0] ?? email,
      alreadyVerified: false,
    };
  });
}

export async function resendEmailVerification(input: {
  email: string;
  request?: Request;
}): Promise<void> {
  const db = getEmailVerificationDb();
  const email = normalizeEmail(input.email);

  if (!email) {
    throw new EmailVerificationError("Enter a valid email address.", 400);
  }

  const user = await db.user.findUnique({
    where: {
      email,
    },
    include: {
      profile: true,
    },
  });

  if (!user || !user.emailVerificationRequired || user.emailVerified) {
    return;
  }

  await sendEmailVerification({
    email,
    displayName:
      user.profile?.displayName ?? user.name ?? email.split("@")[0] ?? email,
    request: input.request,
  });
}
