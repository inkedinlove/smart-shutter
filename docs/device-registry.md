# Device Registry

## Static Registry Today

Today the device registry is a small shared JSON file:

- `apps/web/devices/devices.json`

The web app uses it to:

- list available devices
- choose a default device
- derive command and status topics
- generate non-secret provisioning previews

The CLI helper script also reads the same file so the browser and terminal stay aligned.

## Database-Backed Registry Later

As more internal test devices are added, the registry should move from a static file to a database-backed model with:

- device lifecycle state
- device ownership or internal assignment
- broker profile references
- provisioning status
- claim or pairing tokens

The current JSON file is intentionally simple so the Stage 3 workflow stays easy to reason about.

## Device ID Naming

Current pattern:

- `shutter-dev-001`

Recommended naming guidance:

- keep IDs lowercase
- use hyphens instead of spaces
- include a stable device class prefix such as `shutter`
- use predictable numeric or short token suffixes

Examples:

- `shutter-dev-001`
- `shutter-int-002`
- `shutter-lab-003`

## Topic Naming

Current pattern:

- command topic: `shutters/{deviceId}/commands`
- status topic: `shutters/{deviceId}/status`

This keeps topic derivation predictable and easy to migrate later.

## Future AWS IoT Core Migration

When the broker moves from HiveMQ to AWS IoT Core, the registry should keep owning:

- `deviceId`
- human label
- logical device state
- provisioning status

The broker-specific layer can then change independently:

- HiveMQ today uses shared broker credentials
- AWS IoT Core later should use per-device certificates and policies

That separation is the main reason the registry now owns topics and device identity instead of relying on manually aligned env vars.
