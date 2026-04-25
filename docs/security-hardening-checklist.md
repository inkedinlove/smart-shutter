# Security Hardening Checklist

Use this checklist before treating Smart Shutter as a production customer
platform.

## Required Environment Variables

Set these for customer mode:

- `INTERNAL_TEST_MODE=false`
- `DISABLE_DATABASE=false`
- `DATABASE_URL`
- `AUTH_SECRET`
- `MQTT_HOST`
- `MQTT_PORT`
- `MQTT_USERNAME`
- `MQTT_PASSWORD`
- `ADMIN_TOKEN`
- `PUBLIC_APP_BASE_URL`

Recommended:

- `ADMIN_EMAILS`
- `FIRMWARE_UPDATE_CHANNEL=stable`
- `ALEXA_SKILL_ENABLED=false`

## Secret Rotation

- Rotate `AUTH_SECRET` using the normal Auth.js session rollout plan.
- Rotate `ADMIN_TOKEN` on a regular schedule and after any suspected exposure.
- Rotate shared MQTT credentials after any exposure or operator turnover.
- Replace local `.env` secrets that were ever pasted into tickets, chat, or
  screenshots.

## MQTT Credential Rotation

- Update server env vars first.
- Validate `/api/health`.
- Confirm a real device can reconnect and publish status.
- Confirm command publishing still works.

## Admin Token Rotation

- Update `ADMIN_TOKEN` in the deployment environment.
- Retest:
  - `/admin/devices`
  - `/admin/claims`
  - `POST /api/firmware/releases`
- Expire any copied operator notes that contained the old token.

## Production Auth

- Customer mode requires Auth.js with database-backed sessions.
- No customer route should be relied on in `INTERNAL_TEST_MODE=true`.
- Admin routes must be used only by admin accounts or token-authenticated admin
  requests.

## Claim-Code Expiration

- Keep claim codes time-limited.
- Treat claim links as single-use.
- Reissue a new claim instead of trying to recover a used or expired one.

## OTA Safety

- Keep OTA disabled unless you are intentionally testing it.
- Do not enable OTA for customer devices until:
  - firmware signing exists
  - recovery is verified
  - rollback behavior is proven

## Rate Limiting

- Current limiter mode: in-memory, single instance only.
- Suitable for MVP and single deployment instance.
- Replace with a shared limiter before horizontally scaling the app.

## Future Credential Direction

- Shared HiveMQ credentials are MVP-only.
- Move toward per-device credentials and revocation.
- Long-term production path remains AWS IoT Core with per-device X.509
  certificates.
