import "server-only";

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const PASSWORD_HASH_PREFIX = "scrypt";
const MIN_PASSWORD_LENGTH = 8;

export class PasswordValidationError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "PasswordValidationError";
    this.statusCode = statusCode;
  }
}

export function validatePassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new PasswordValidationError(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      400,
    );
  }
}

export async function hashPassword(password: string): Promise<string> {
  validatePassword(password);

  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;

  return `${PASSWORD_HASH_PREFIX}$${salt}$${derivedKey.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string | null | undefined,
): Promise<boolean> {
  if (!storedHash) {
    return false;
  }

  const [prefix, salt, expectedHex] = storedHash.split("$");

  if (
    prefix !== PASSWORD_HASH_PREFIX ||
    !salt ||
    !expectedHex ||
    expectedHex.length === 0
  ) {
    return false;
  }

  const expectedBuffer = Buffer.from(expectedHex, "hex");
  const derivedKey = (await scrypt(password, salt, expectedBuffer.length)) as Buffer;

  if (derivedKey.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(derivedKey, expectedBuffer);
}
