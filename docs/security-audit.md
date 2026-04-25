# Security Audit

This audit summarizes the current Smart Shutter customer platform posture after
the security hardening pass. It is focused on the customer account, device
ownership, command publishing, claim flow, admin tooling, firmware management,
and setup surfaces.

## Authentication

Current hardening:

- Customer mode requires `AUTH_SECRET`.
- Customer routes require a valid Auth.js session when
  `INTERNAL_TEST_MODE=false`.
- Auth sessions use JWT strategy with secure cookies enabled in production.
- Sign-in failures stay generic in the UI.
- Registration now avoids exposing duplicate-account details verbatim.

Residual gaps:

- No password reset flow yet.
- No email verification yet.
- No MFA yet.

## Authorization

Current hardening:

- Customer APIs centralize access through the shared ownership helpers in
  `apps/web/lib/access-control.ts`.
- Device status, command, firmware check, diagnostics, manifest, and profile
  routes all fail closed when the device is not owned by the current profile.
- Customer mode blocks fallback registry access when
  `INTERNAL_TEST_MODE=false`.

Residual gaps:

- Authorization depends on the server-side ownership model remaining the single
  path for all new device APIs.

## Device Ownership

Current hardening:

- Owned devices are scoped to the signed-in customer profile.
- Unknown or unowned devices are not exposed through customer device routes.
- Internal demo fallback remains separated behind `INTERNAL_TEST_MODE=true`.

Residual gaps:

- Device transfer and account-to-account reassignment flows are not implemented.

## Claim Codes

Current hardening:

- Claim codes are normalized before lookup.
- Claim codes expire.
- Claim codes are one-time use.
- Claim redemption now uses safer error text for invalid, expired, or consumed
  codes.
- Claim redemption is rate-limited with an in-memory limiter.

Residual gaps:

- The current limiter is single-instance only and should be replaced with a
  shared store before multi-instance scale-out.

## Admin Routes

Current hardening:

- Admin actions require admin session role or `x-admin-token`.
- Protected admin/internal surfaces include `/admin/*`, `/setup`, `/flash`,
  `/firmware/releases`, firmware release publishing, claim creation, device
  registration, and provisioning helpers.
- Admin mutation routes are rate-limited.

Residual gaps:

- Client-rendered admin pages still rely on middleware and server API checks
  rather than a second server-component gate.

## MQTT Boundaries

Current hardening:

- MQTT credentials remain server-side only.
- Device command publishing requires ownership before topic lookup and publish.
- Unsafe movement commands are rejected when the server can verify offline,
  safety-mode, or calibration restrictions.
- Command publishing is rate-limited.
- Device command audits now record:
  - `deviceId`
  - `commandType`
  - `actorProfileId`
  - `timestamp`
  - `result`

Residual gaps:

- The broker still uses shared HiveMQ credentials in MVP mode.
- Per-device credentials and revocation are still future work.

## Firmware Update Path

Current hardening:

- Firmware release publishing is admin-protected.
- Artifact URLs must be HTTPS.
- Artifact URLs cannot embed credentials.
- SHA-256 format is validated.
- `sizeBytes` must be a bounded integer.
- OTA remains disabled unless explicitly enabled in firmware.

Residual gaps:

- Firmware artifacts are not signed yet.
- OTA rollback and recovery validation are still future work.

## Browser Flashing And Setup

Current hardening:

- Browser flashing stays on internal/admin surfaces.
- Customer onboarding is directed to QR claim, setup AP, and cloud connection.
- Wi-Fi credentials are entered into the device-local setup page, not the main
  app.

Residual gaps:

- The internal browser flashing path depends on a third-party script loader and
  should receive a stricter review before broader rollout.

## Alexa Integration

Current hardening:

- Alexa scaffold remains disabled by default.
- Discovery maps only owned devices.
- Placeholder directives do not publish live MQTT commands.
- Safety and offline states produce denials instead of unsafe movement.

Residual gaps:

- Real OAuth account linking is not live yet.
- Certification-grade state reporting is still future work.

## Secrets And Environment

Current hardening:

- `/api/health` reports missing production config without exposing secret values.
- Customer mode fails closed if required env vars are missing.
- Customer mode fails closed if `DISABLE_DATABASE=true`.
- Admin token remains server-side and request-scoped.

Residual gaps:

- Secret rotation is still an operational process rather than an in-product
  workflow.

## Logging And Privacy

Current hardening:

- Sensitive mutation routes now avoid logging raw request payloads.
- MQTT credentials are never returned to the browser.
- Security and health surfaces report status, not secret values.

Residual gaps:

- Structured audit export, alerting, and centralized log redaction are still
  future work.
