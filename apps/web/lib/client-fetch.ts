"use client";

import { getApiErrorMessage, isApiSuccess, type ApiSuccess } from "@/lib/api-response";

export const CLIENT_FETCH_TIMEOUT_MS = 2800;

type ShortFetchOptions = RequestInit & {
  timeoutMs?: number;
  timeoutMessage?: string;
};

export class ApiRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

export class SessionRequiredError extends Error {
  constructor(message = "Your session has expired. Please sign in again.") {
    super(message);
    this.name = "SessionRequiredError";
  }
}

export async function fetchWithShortTimeout(
  input: RequestInfo | URL,
  options: ShortFetchOptions = {},
): Promise<Response> {
  const {
    timeoutMs = CLIENT_FETCH_TIMEOUT_MS,
    timeoutMessage = "Request timed out. Try again.",
    ...init
  } = options;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(timeoutMessage);
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function readApiData<T>(
  response: Response,
  isData: (value: unknown) => value is T,
  fallbackError: string,
): Promise<T> {
  const payload = (await response.json()) as unknown;

  if (!response.ok) {
    const errorMessage = getApiErrorMessage(payload, fallbackError);

    if (response.status === 401) {
      throw new SessionRequiredError(errorMessage);
    }

    throw new ApiRequestError(errorMessage, response.status);
  }

  if (!isApiSuccess(payload, isData)) {
    throw new Error("The server response was invalid.");
  }

  return payload.data;
}

export function redirectToLogin(
  callbackUrl?: string,
  reason = "session-expired",
): void {
  if (typeof window === "undefined") {
    return;
  }

  const nextUrl =
    callbackUrl ||
    `${window.location.pathname}${window.location.search}${window.location.hash}`;

  const loginUrl = new URL("/login", window.location.origin);
  loginUrl.searchParams.set("callbackUrl", nextUrl);
  loginUrl.searchParams.set("reason", reason);
  window.location.assign(loginUrl.toString());
}

export function isApiSuccessPayload<T>(
  value: unknown,
  isData: (payload: unknown) => payload is T,
): value is ApiSuccess<T> {
  return isApiSuccess(value, isData);
}
