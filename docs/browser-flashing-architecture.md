# Browser Flashing Architecture

The target Smart Shutter onboarding model is:

1. User opens `/connect`
2. User plugs ESP32 into USB
3. Browser detects the board through a Web Serial or WebUSB-compatible flow
4. Site offers firmware install or update
5. Device boots into setup or provisioning mode
6. User completes WiFi and device claim
7. Device connects to MQTT and the cloud path
8. `/connect` verifies firmware version and live status

## Why This Model Fits

- It keeps the user inside the deployed product instead of sending them to Arduino tools.
- It gives first install, recovery, and verification one coherent flow.
- It separates the physical USB install step from the later OTA update path.

## Intended Responsibilities

`/connect`

- User-facing orchestration
- Device selection
- Firmware status check
- Post-install verification
- Safe motor test handoff

`/flash`

- USB install and recovery entry point
- Browser capability checks
- Future ESP Web Tools or Web Serial launcher
- Clear fallback to manual Arduino flashing until active browser flashing ships

Device firmware

- Boots safely after first flash
- Exposes setup or provisioning mode later
- Connects to WiFi and MQTT only after local claim or setup is complete

## Security Direction

- MQTT secrets should not be injected from the browser into firmware binaries.
- Browser flashing should install a generic or claimable image, not one packed with
  long-lived shared credentials.
- WiFi setup, device claim, and broker identity should move to a post-flash
  provisioning step instead of living forever as firmware constants.

## Current State

- `/connect` is live today.
- `/flash` is now the placeholder destination for first install or recovery.
- Manual Arduino flashing remains the supported path.
- Active browser flashing is not enabled yet.
