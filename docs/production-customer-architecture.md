# Production Customer Architecture

Smart Shutter now separates customer ownership from internal testing.

## Account Model

- A `User` authenticates with Auth.js.
- A `UserProfile` belongs to that user.
- A `UserProfile` owns many `Device` records.
- Devices remain identified by `deviceId`, not by display label.

## Claim Flow

1. An admin creates a claim code for a device.
2. A customer signs in.
3. The customer enters the claim code on `/claim`.
4. The device is attached to that customer profile.
5. The device appears on `/devices`.
6. The customer can open `/connect?deviceId=...` for that device.

## Authorization Rules

- `/api/devices` returns only devices owned by the current customer.
- `/api/profile` returns only the signed-in customer's profile.
- MQTT command publishing checks ownership before publishing.
- Live device status checks verify ownership before returning status.
- Firmware check and manifest routes verify ownership.

## Internal Test Mode Separation

`INTERNAL_TEST_MODE=true` keeps the simulator and local fallback path working.

That mode can still:

- use the static device registry
- use the internal demo profile
- run local simulator flows without customer auth

`INTERNAL_TEST_MODE=false` disables those shortcuts for customer routes.

## Customer Route Protection

Protected customer routes:

- `/`
- `/profile`
- `/devices`
- `/connect`
- `/claim`
- `/firmware`

Protected internal/admin routes:

- `/admin/*`
- `/firmware/releases`
- `/setup`

## Remaining Production Gaps

- no password reset flow yet
- no email verification yet
- no OAuth/social sign-in yet
- admin role bootstrap is still env/manual driven
- per-device MQTT credentials are still future work
