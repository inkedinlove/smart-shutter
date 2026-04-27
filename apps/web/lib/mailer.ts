import "server-only";

import nodemailer from "nodemailer";

type MailConfig = {
  from: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
};

function parseBooleanEnv(value: string | undefined): boolean | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim().toLowerCase();

  if (normalizedValue === "true") {
    return true;
  }

  if (normalizedValue === "false") {
    return false;
  }

  return null;
}

function getMailConfig(): MailConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const portRaw = process.env.SMTP_PORT?.trim();
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD?.trim();
  const from = process.env.EMAIL_FROM?.trim();

  if (!host || !portRaw || !user || !password || !from) {
    return null;
  }

  const port = Number(portRaw);

  if (!Number.isInteger(port) || port <= 0) {
    return null;
  }

  const secureOverride = parseBooleanEnv(process.env.SMTP_SECURE);

  return {
    from,
    host,
    port,
    secure: secureOverride ?? port === 465,
    user,
    password,
  };
}

export function isMailConfigured(): boolean {
  return getMailConfig() !== null;
}

export function getConfiguredMailFromAddress(): string | null {
  return getMailConfig()?.from ?? null;
}

export function resolvePublicAppBaseUrl(request?: Request): string | null {
  const configuredBaseUrl = process.env.PUBLIC_APP_BASE_URL?.trim();

  if (configuredBaseUrl) {
    try {
      return new URL(configuredBaseUrl).toString().replace(/\/$/, "");
    } catch {
      return null;
    }
  }

  if (!request) {
    return null;
  }

  try {
    return new URL(request.url).origin;
  } catch {
    return null;
  }
}

export async function sendTransactionalEmail(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  const mailConfig = getMailConfig();

  if (!mailConfig) {
    throw new Error(
      "SMTP email delivery is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and EMAIL_FROM.",
    );
  }

  const transporter = nodemailer.createTransport({
    host: mailConfig.host,
    port: mailConfig.port,
    secure: mailConfig.secure,
    auth: {
      user: mailConfig.user,
      pass: mailConfig.password,
    },
  });

  await transporter.sendMail({
    from: mailConfig.from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}
