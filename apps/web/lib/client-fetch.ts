"use client";

export const CLIENT_FETCH_TIMEOUT_MS = 2800;

type ShortFetchOptions = RequestInit & {
  timeoutMs?: number;
  timeoutMessage?: string;
};

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
