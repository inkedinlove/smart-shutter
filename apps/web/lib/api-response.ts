import { NextResponse } from "next/server";

export type ApiSuccess<T> = {
  ok: true;
  data: T;
};

export type ApiFailure = {
  ok: false;
  error: string;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function apiOk<T>(data: T, init?: ResponseInit): NextResponse<ApiSuccess<T>> {
  return NextResponse.json(
    {
      ok: true,
      data,
    },
    init,
  );
}

export function apiError(
  error: string,
  status = 400,
  init?: Omit<ResponseInit, "status">,
): NextResponse<ApiFailure> {
  return NextResponse.json(
    {
      ok: false,
      error,
    },
    {
      ...init,
      status,
    },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isApiSuccess<T>(
  value: unknown,
  isData: (payload: unknown) => payload is T,
): value is ApiSuccess<T> {
  return (
    isRecord(value) &&
    value.ok === true &&
    "data" in value &&
    isData(value.data)
  );
}

export function getApiErrorMessage(
  value: unknown,
  fallback = "Unable to complete this request.",
): string {
  if (
    isRecord(value) &&
    value.ok === false &&
    typeof value.error === "string" &&
    value.error.trim().length > 0
  ) {
    return value.error;
  }

  if (isRecord(value) && typeof value.error === "string" && value.error.trim()) {
    return value.error;
  }

  return fallback;
}
