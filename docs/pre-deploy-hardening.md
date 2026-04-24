# Pre-Deploy Hardening

Use this checklist before sending the deployed link to a friend.

## Checklist

- HiveMQ environment variables are set in the target environment.
- The `DISABLE_DATABASE` decision is documented, or the team has explicitly documented that Prisma/Neon is enabled with `DATABASE_URL`.
- Vercel environment variables are set and match the intended environment.
- `/api/health` is returning normally.
- The simulator can complete the `/connect` flow against the same broker.
- Firmware compiles locally with Arduino CLI or Arduino IDE.
- A staged firmware artifact exists if `/flash` will be used for local browser-flash testing.
- OTA remains disabled unless you are testing on a spare board.
- `SAFE_SETUP_MODE` is still `true` for the first attached-shutter test.
- The selected device appears in `/api/devices` and `/connect`.
- The Firmware Console shows a sane live status for the selected device.

## Friend-Ready Deployment Notes

- Treat `/connect` as the primary friend-facing entry point.
- Use safe calibration before any normal percentage controls.
- Keep STOP visible and easy to reach.
- Do not promise browser flashing yet unless `/flash` is being tested locally and intentionally.

## Recommended Go/No-Go

Go only if all of these are true:

- firmware compiles
- device status is visible in the app
- the simulator or real device responds to MQTT commands
- safe calibration copy is present in `/connect`
- SAFE setup is still enabled

No-go if any of these are true:

- the device registry does not match the device being tested
- MQTT status is not updating
- firmware compile is broken
- OTA is enabled on the main attached device without spare-board validation
