# Security Boundaries

## Browser And MQTT

- The browser never receives MQTT usernames or passwords.
- The browser talks only to Next.js API routes.
- The server publishes MQTT commands on behalf of the signed-in customer.
- Device credential metadata may be shown to admins, but secret values are not exposed in the browser.

## Ownership Enforcement

- Customer APIs verify account ownership before command publish.
- Customer APIs verify ownership before returning live device status.
- Firmware check and manifest APIs verify ownership before returning release data.

## Admin Actions

- Firmware release publishing is privileged.
- Claim-code creation is privileged.
- Admin APIs accept an admin token or an authenticated admin session.
- Admin pages require admin access outside internal test mode.

## Claim Codes

- Claim codes are time-limited.
- Claim codes can only be redeemed once.
- Claim redemption attaches the device to the signed-in customer profile.

## Internal Test Mode

- `INTERNAL_TEST_MODE=true` allows the simulator and fallback device registry path.
- `INTERNAL_TEST_MODE=false` disables those shortcuts for customer routes.

## Future Hardening

- per-device MQTT credentials
- AWS IoT per-device certificates
- credential rotation and revocation per device
- password reset and email verification
- stronger admin bootstrap and RBAC
