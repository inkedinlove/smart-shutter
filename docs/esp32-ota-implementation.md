# ESP32 OTA Implementation

This pass adds a guarded OTA skeleton to the ESP32 firmware so the project can
start testing the update path without replacing the current manual Arduino flow.

## Current Shape

- OTA is behind `ENABLE_OTA_UPDATES` in `firmware/esp32-shutter/config.h`
- OTA does not auto-run in `loop()`
- OTA can be triggered only by the MQTT command:

```json
{ "type": "CHECK_UPDATE" }
```

- The firmware requests the update manifest from
  `API_BASE_URL + OTA_MANIFEST_PATH_TEMPLATE`
- The firmware logs each OTA step over Serial:
  - manifest request
  - download start
  - SHA-256 verification
  - install attempt
  - success or failure

## Safety Guardrails In This Pass

- OTA stays disabled by default in `config.example.h`
- The firmware refuses OTA if WiFi is down
- The firmware refuses OTA if the motor is currently moving
- The firmware verifies the manifest, artifact size, and SHA-256 before
  finalizing the install with the ESP32 `Update` library
- If OTA is disabled and a `CHECK_UPDATE` command arrives, the firmware reports
  `update_failed` with detail `OTA disabled`

## Safety Warnings

- Test with a spare ESP32 first.
- Use stable power for every OTA test.
- A wrong binary, interrupted flash, or corrupted artifact can force a USB
  recovery reflash.
- Keep the USB recovery path available at all times.
- Do not test OTA while the motor is attached to the shutter linkage.
- Do not treat this pass as production OTA yet.

## Recommended Spare-Board Test

1. Keep `ENABLE_OTA_UPDATES false` and confirm the device handles
   `CHECK_UPDATE` safely by reporting `OTA disabled`.
2. Confirm the device still accepts normal `SET_PERCENT` and `STOP` commands.
3. Move to a spare ESP32 only.
4. Set `ENABLE_OTA_UPDATES true`.
5. Set `API_BASE_URL` to the deployed app URL that serves the manifest route.
6. Register a known-good dev firmware release with correct `artifactUrl`,
   `sha256`, and `sizeBytes`.
7. Trigger `CHECK_UPDATE` from the Firmware Console.
8. Watch Serial logs through manifest request, download, verification, and
   install.
9. Confirm the board reboots and publishes retained status with the new
   `firmwareVersion`.

## What Still Needs Work

- Real CA certificate validation instead of insecure HTTPS handling
- Better rollback and boot-success confirmation
- Signed firmware artifacts
- More explicit install progress reporting
- A user-facing one-click OTA or browser flashing experience
