# Live Test Preflight

Use this checklist before sending the first remote live-test link.

## Environment Checklist

- `MQTT_HOST` is set.
- `MQTT_PORT` is set to `8883`.
- `MQTT_USERNAME` is set.
- `MQTT_PASSWORD` is set.
- `PUBLIC_APP_BASE_URL` is set for the deployed app.
- `DATABASE_URL` is either configured intentionally or left disabled intentionally.
- `ENABLE_EXPERIMENTAL_OTA_UI=false`.
- `ADMIN_TOKEN` is set only if internal firmware release admin is needed.

## Readiness Checks

- `/connect` is the main entry point for the live test.
- `/api/health` returns:
  - `mqttConfigured: true`
  - `deviceRegistryAvailable: true`
  - a sensible `databaseMode`
  - `firmwareReleaseConfigured: true`
- The simulator has already passed the `/connect` flow.
- Firmware compiles successfully.
- A staged firmware artifact exists if `/flash` will be used.
- OTA is disabled for the installed shutter device.
- `SAFE_SETUP_MODE true` is still enabled for the first attached-shutter test.

## Friend Test Sequence

1. Open `/connect`.
2. Confirm the device shows online status.
3. Run safe calibration first.
4. Start with `Nudge Open`.
5. Press `STOP` immediately if direction is wrong or movement sounds strained.
6. Mark closed and open positions carefully.
7. Mark calibration complete.
8. Run the movement test sequence:
   - `50%`
   - `STOP`
   - `0%`
   - `100%`
   - `25%`
   - `75%`

## Required Safety State

- Do not disable `SAFE_SETUP_MODE` for the first attached-shutter session.
- Do not enable OTA on the primary installed device.
- Do not continue if the shutter binds, buzzes, clicks, or strains.
