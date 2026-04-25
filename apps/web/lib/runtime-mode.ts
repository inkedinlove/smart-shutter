function readBooleanEnv(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

export function isInternalTestMode(): boolean {
  return readBooleanEnv(process.env.INTERNAL_TEST_MODE);
}

export function isCustomerMode(): boolean {
  return !isInternalTestMode();
}
