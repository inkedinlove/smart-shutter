# Profile Device Ownership

Smart Shutter now treats customer ownership as:

- one account
- one profile
- many devices

## Current Model

- A `User` signs in to the app.
- A `UserProfile` is linked to that user.
- A `UserProfile` owns zero or more `Device` records.
- Each device keeps its stable `deviceId` even if its display label changes.
- Ownership is stored on the device with `ownerProfileId`.

## Why This Matters

- The device ID is the durable identity used in MQTT topics and firmware.
- The display label is the friendly name shown in the UI.
- A customer can own many shutters without hardcoding a small fixed device count.
- API authorization can verify ownership before publishing commands or returning status.

## Current Customer Flow

- `/login` lets a customer sign in or create an account.
- `/profile` shows the signed-in account summary.
- `/devices` shows only the devices owned by that account.
- `/connect?deviceId=...` works only for an owned device.

## Internal Test Mode

When `INTERNAL_TEST_MODE=true`, the app can still use the seeded internal demo
profile and static device fallback for simulator and local testing.

When `INTERNAL_TEST_MODE=false`, customer routes no longer fall back to demo or
global device access.

## Claiming Is Separate

Ownership and identity are intentionally separate:

- `deviceId` identifies the physical device
- a customer profile owns the device
- claim codes connect the physical device to the signed-in customer

## Future Auth Options

The current production foundation uses Auth.js credentials-based sign-in. Later
options can still include:

- OAuth providers through Auth.js
- Clerk
- Supabase Auth
- custom enterprise SSO backed by the app database
