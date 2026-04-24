# Connect Wizard

`/connect` is now the recommended user-facing entry point for Smart Shutter.

It gives the current setup a cleaner production-style flow without pretending that
browser flashing already exists:

1. Connect Device
2. Check Firmware
3. Update Firmware
4. Safe Calibration
5. Setup Complete
6. Test Motor

## Current Flow

- The page starts from the internal device registry and defaults to `shutter-dev-001`.
- It reads live device state from `/api/device/status`.
- It reads firmware release state from `/api/devices/[deviceId]/firmware/check`.
- It shows the current reported firmware version, the latest available release,
  whether an update is available, the live OTA state, and whether the device is
  online or still unknown.
- It now includes a safe calibration step for attached-shutter testing.
- It keeps STOP visible and keeps normal test buttons gated until calibration is complete.

## Online-Device Path

If the ESP32 is already flashed, connected to WiFi, connected to MQTT, and
publishing retained status:

- `/connect` can show live online state.
- The wizard can show the firmware version the device is actually reporting.
- The wizard can compare that version against the active release registry entry.
- The user can move through safe calibration before normal percentage tests.

## Offline Or Unflashed Device Path

If the device is not yet flashed or is not currently online:

- `/connect` still lets the user select the correct device entry.
- The firmware check step can still compare against release metadata.
- The update step clearly says that the USB flashing path is the supported next
  step today.
- The calibration and motor test controls stay disabled until the device is online through the
  normal MQTT path.

## What Is Still Manual

- Copy `config.example.h` to `config.h`
- Paste the real WiFi and MQTT credentials locally
- Flash with Arduino IDE or Arduino CLI
- Use the current manual artifact and release registration flow
- Use operator judgement during attached-shutter calibration

## Next Milestone

The next milestone is real browser-assisted flashing with ESP Web Tools or Web
Serial so `/connect` can move from guided setup to true one-click onboarding.
