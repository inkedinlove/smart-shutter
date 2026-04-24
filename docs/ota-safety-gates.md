# OTA Safety Gates

Smart Shutter now includes a guarded OTA path, but it is not ready for
production rollout yet.

## Current Safety Gates

- Spare-board-first policy: test OTA on a separate ESP32 before touching any
  installed or primary test hardware.
- Stable power requirement: do not run OTA from unstable USB hubs, weak wall
  adapters, or noisy motor power setups.
- Firmware version matching: the device should compare its reported
  `firmwareVersion` against the latest release before attempting install.
- Hash verification: the ESP32 verifies the release SHA-256 before finalizing
  the update.
- UI gate: the Firmware Console keeps `Update Firmware` disabled unless
  `ENABLE_EXPERIMENTAL_OTA_UI=true`.
- Firmware gate: the ESP32 keeps OTA disabled unless `ENABLE_OTA_UPDATES true`
  is set in local `config.h`.

## Why These Gates Matter

- A mismatched or corrupted `.bin` can leave the device in a recovery-only
  state.
- Power loss during install can interrupt the flash and require USB recovery.
- A shared MQTT command path must not accidentally trigger production-like OTA
  behavior on a live shutter install.

## Still Required Before Production OTA

- Rollback and boot-success confirmation
- Production CA certificate validation instead of insecure HTTPS handling
- Signed firmware artifacts
- Clear recovery guidance for field failures
- More explicit staged rollout controls
