# Smart Shutter MVP

Smart Shutter is an MVP for remotely positioning a shutter from a deployed website. The current stack uses a Next.js web app to publish MQTT commands to HiveMQ Cloud and an ESP32 firmware sketch to drive a 28BYJ-48 stepper motor through a ULN2003 board.

The recommended user entry point is now `/connect`, which guides a user through
Connect Device -> Check Firmware -> Update Firmware -> Safe Calibration ->
Setup Complete -> Test Motor while still respecting the current manual flashing
reality.

Use `/api/health` as the quick preflight endpoint before the first remote live
test.

`/flash` is now the dedicated first-install and recovery placeholder page for
future browser-based USB flashing.

The immediate validation milestone is a compile-only firmware build artifact,
followed by the first attached-shutter calibration pass with
`SAFE_SETUP_MODE` still enabled.

## Architecture

- `apps/web`: Next.js App Router dashboard, setup console, firmware console, API routes for publishing commands and reading retained device status over MQTT, and a Prisma/Neon-ready database layer with static JSON fallback.
- `firmware/esp32-shutter`: ESP32 Arduino sketch that connects to WiFi, subscribes to command messages, drives the stepper motor, publishes retained status updates, and can optionally expose a local fallback page behind a compile-time flag.
- `docs`: wiring, internal setup notes, MVP testing notes, provisioning notes, firmware update notes, and comparison notes for the older ESP8266 prototype.

Current MQTT flow:

1. The internal device registry reads from Neon/Postgres through Prisma when `DATABASE_URL` is configured, and falls back to `apps/web/devices/devices.json` when it is not.
2. The dashboard selects a device and calls `/api/device/command` with `deviceId` plus either `SET_PERCENT` or `STOP`.
3. The Firmware Console can also send a guarded `CHECK_UPDATE` command over MQTT when you want the ESP32 to attempt an experimental OTA check.
4. The server-only route looks up the device topics from the registry and publishes to HiveMQ Cloud over `mqtts://` on port `8883`.
5. The ESP32 subscribes to the command topic, maps requested percentages to stepper travel steps, and drives the motor.
6. The ESP32 publishes retained status messages including `deviceMode`, estimated percent, movement state, firmware version, uptime, and RSSI.
7. `/api/device/status?deviceId=...` briefly subscribes to the registry-derived status topic, returns the latest snapshot, and records the reported firmware version in the database when available.

The older ESP8266 local-only prototype is documented in [docs/legacy-prototype-comparison.md](docs/legacy-prototype-comparison.md). It remains useful as a reference for future captive onboarding and local fallback workflows, but the main MVP path is still deployed website -> MQTT broker -> ESP32.

## Local Development

From the repo root:

```powershell
cd apps/web
Copy-Item .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000/connect` after filling in the MQTT values in
`apps/web/.env.local`.

Quick health check:

```text
http://localhost:3000/api/health
```

For MQTT-only end-to-end testing without hardware, you can also run the mock
device simulator from the repo root:

```powershell
node scripts/mock-device.mjs --deviceId shutter-dev-001 --firmwareVersion 0.1.0-dev
```

## Required Environment Variables

Set these in `apps/web/.env.local` for local development and in Vercel for deployment:

```dotenv
MQTT_HOST=
MQTT_PORT=8883
MQTT_USERNAME=
MQTT_PASSWORD=
DATABASE_URL=
FIRMWARE_UPDATE_CHANNEL=stable
PUBLIC_APP_BASE_URL=
ADMIN_TOKEN=
ENABLE_EXPERIMENTAL_OTA_UI=false
```

Where these come from:

- `MQTT_HOST`, `MQTT_PORT`, `MQTT_USERNAME`, and `MQTT_PASSWORD` come from the HiveMQ Cloud broker.
- `DATABASE_URL` comes from Neon Postgres when you want the database-backed registry and firmware release flow.
- `FIRMWARE_UPDATE_CHANNEL` selects the channel used by firmware update checks, for example `stable`.
- `PUBLIC_APP_BASE_URL` is the base app URL used when validating whether a firmware artifact URL is safe to expose in browser responses.
- `ADMIN_TOKEN` protects internal firmware release publishing for the MVP.
- `ENABLE_EXPERIMENTAL_OTA_UI` is a dev-only gate that keeps the Firmware Console's `Update Firmware` action disabled unless you explicitly turn it on.
- Device IDs, labels, command topics, and status topics come from our internal registry layer, backed by Prisma when available and by static JSON fallback otherwise.
- The `/setup` page and provisioning routes generate copy-ready non-secret device config from that registry.

This is the current bridge between manual firmware setup and future automated provisioning.

## Neon And Prisma Setup

When you are ready to use Neon/Postgres instead of the static fallback registry:

```powershell
cd apps/web
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
```

Notes:

- `DATABASE_URL` must be set before running the Prisma commands above.
- `db:seed` creates the default `shutter-dev-001` device plus an initial `0.1.0-dev` firmware release entry.
- If `DATABASE_URL` is not set, the app continues using the committed JSON registry so local MQTT development still works.

## Vercel Deployment

1. Create a Vercel project that uses `apps/web` as the root directory.
2. Add the required environment variables in the Vercel dashboard.
3. Deploy the app.
4. After deployment, use the dashboard API routes to publish commands to HiveMQ Cloud.

The MQTT credentials stay server-side because the browser only talks to the Next.js API routes.

## Connect Wizard

The recommended user-facing setup flow is available at `/connect`.

It is the cleanest current handoff for an internal tester or non-technical operator:

1. Connect Device
2. Check Firmware
3. Update Firmware
4. Safe Calibration
5. Setup Complete
6. Test Motor

Current behavior:

- online devices are checked through live retained MQTT status plus the firmware release registry
- offline or unflashed devices are guided toward the manual USB flashing path
- attached-shutter testing now starts with safe calibration, nudge-only movement, and a visible STOP button
- normal motor testing stays locked until calibration is complete
- browser flashing is still not implemented yet

Related reference:

- [docs/connect-wizard.md](docs/connect-wizard.md)
- [docs/live-test-preflight.md](docs/live-test-preflight.md)
- [docs/safe-calibration.md](docs/safe-calibration.md)

## Mock Device Simulator

The mock device simulator is the fastest way to test the web app flow without a
physical ESP32.

Typical local workflow:

1. Start the Next.js app with `cd apps/web` then `npm run dev`
2. Start the simulator from the repo root:
   `node scripts/mock-device.mjs --deviceId shutter-dev-001 --firmwareVersion 0.1.0-dev`
3. Open `/connect`
4. Run the normal test sequence through `/connect`, `/`, or `/firmware`

It simulates:

- retained MQTT status publishing every 3 seconds
- device motion for `SET_PERCENT`
- safe calibration commands such as `NUDGE_OPEN`, `NUDGE_CLOSE`, and `MARK_CALIBRATION_COMPLETE`
- immediate stop behavior for `STOP`
- firmware version, uptime, RSSI, and OTA disabled state

It does not replace real board validation for flashing, wiring, motion quality,
or power behavior.

Related reference:

- [docs/mock-device-simulator.md](docs/mock-device-simulator.md)

## Flash Route

The browser-flashing preparation page is available at `/flash`.

Use it as the product-facing destination for:

- first install
- recovery flashing
- future ESP Web Tools or Web Serial onboarding

Current behavior:

- the page now renders an experimental ESP Web Tools install button
- the button is wired to `/firmware/manifest.json`
- the manifest now points at a local/dev merged firmware artifact path
- you must stage the merged `.bin` locally before `/flash` can install it
- manual Arduino IDE and Arduino CLI flashing remain the supported install path
- `/connect` stays the verification and testing destination after flashing

First install and recovery should use USB flashing. OTA should remain for devices
that are already online and already provisioned.

Do not enable OTA on the main attached-shutter device yet. Keep it disabled
unless you are testing on a spare board with stable power and a recovery USB
path.

Related references:

- [docs/active-browser-flashing.md](docs/active-browser-flashing.md)
- [docs/browser-flashing-architecture.md](docs/browser-flashing-architecture.md)
- [docs/esp-web-tools-plan.md](docs/esp-web-tools-plan.md)
- [docs/stage-browser-flash-artifact.md](docs/stage-browser-flash-artifact.md)

## Provisioning And Setup

The internal setup page is available at `/setup`.

It shows:

- Registered test devices
- Registry-derived command and status topics
- The current broker host and port
- A firmware config preview with MQTT username and password redacted

This is temporary until browser flashing and richer provisioning exist. The current device provisioning roadmap is documented in [docs/provisioning-roadmap.md](docs/provisioning-roadmap.md).

Additional provisioning references:

- [docs/device-registry.md](docs/device-registry.md)
- [docs/browser-flashing-architecture.md](docs/browser-flashing-architecture.md)
- [docs/web-flashing-plan.md](docs/web-flashing-plan.md)

## Firmware Console

The firmware console is available at `/firmware`.

It is the first production-oriented step toward a non-technical update experience:

- Step 1: Connect device
- Step 2: Check for update
- Step 3: Update firmware
- Step 4: Success complete

For this pass, the console safely shows the current reported firmware version, the latest available release, update availability, the last seen device status, and the live OTA state reported by the ESP32.

The console now also includes a guarded `Check Device Update` action that sends
`CHECK_UPDATE` over MQTT. The ESP32 will only attempt OTA if
`ENABLE_OTA_UPDATES` is set to `true` in its local `config.h`.

If the device reports `safetyMode=true`, the console now shows that warning so
the operator knows the attached-shutter flow should still stay in safe
calibration.

Related reference:

- [docs/admin-security.md](docs/admin-security.md)
- [docs/esp32-ota-implementation.md](docs/esp32-ota-implementation.md)
- [docs/firmware-artifacts.md](docs/firmware-artifacts.md)
- [docs/firmware-update-roadmap.md](docs/firmware-update-roadmap.md)
- [docs/live-firmware-status.md](docs/live-firmware-status.md)
- [docs/ota-safety-gates.md](docs/ota-safety-gates.md)

## Firmware Release Admin

The internal/dev firmware release admin page is available at `/firmware/releases`.

It lets you:

- list registered firmware releases
- add a new release record with artifact metadata
- mark one release as active per board and channel

Security note:

- publishing a release now requires `ADMIN_TOKEN`
- the admin page sends it only as `x-admin-token` on release creation
- this is MVP-only protection and should later be replaced with real auth/session/RBAC

Hashing a firmware artifact from the repo root:

```powershell
node scripts/hash-file.mjs path/to/firmware.bin
```

The current artifact flow is:

1. Build or upload a firmware binary to artifact storage.
2. Compute its SHA-256 digest and file size with `node scripts/hash-file.mjs path/to/firmware.bin`.
3. Register the release metadata in `/firmware/releases` or `POST /api/firmware/releases`.
4. The Firmware Console reads the latest active release metadata during update checks.

This prepares release management before actual OTA or browser-based delivery is implemented.

Additional references:

- [docs/arduino-build-artifact.md](docs/arduino-build-artifact.md)
- [docs/admin-security.md](docs/admin-security.md)
- [docs/artifact-upload-plan.md](docs/artifact-upload-plan.md)
- [docs/firmware-artifacts.md](docs/firmware-artifacts.md)
- [docs/ota-manifest.md](docs/ota-manifest.md)

## Firmware Manifest Route

The future OTA manifest is now available at:

- `/api/devices/[deviceId]/firmware/manifest`

This route returns the current device version, latest active release metadata, and
whether an update is available. It is intended to become the handoff payload for
future ESP32 OTA logic.

The current experimental device-side OTA flow uses this manifest route after an
MQTT `CHECK_UPDATE` command is received, but OTA remains compile-time guarded
and disabled by default.

## Firmware Setup

1. Wire the ESP32, ULN2003, and 28BYJ-48 using [docs/wiring.md](docs/wiring.md).
2. Open `firmware/esp32-shutter`.
3. Copy `config.example.h` to `config.h`.
4. Edit `config.h` with your WiFi and HiveMQ settings, and set `FIRMWARE_VERSION` for the build you are flashing.
5. Open `firmware/esp32-shutter/esp32-shutter.ino` in the Arduino IDE.
6. Review the firmware tuning flags:
   `INVERT_DIRECTION` flips open/close direction if the shutter runs backwards.
   `MOTOR_MAX_SPEED` and `MOTOR_ACCELERATION` can be tuned if motion is too slow, loud, or rough.
   `SAFE_SETUP_MODE` should stay `true` for the first attached-shutter session so the device only allows small reversible moves until calibration is complete.
   `ENABLE_LOCAL_FALLBACK_WEB` can be set to `true` when you want the optional local backup page for internal testing.
   `ENABLE_OTA_UPDATES` should stay `false` for the main hardware validation path and only be enabled on a spare ESP32 during OTA experiments.
   `API_BASE_URL` should point at the deployed app origin when you are testing OTA manifest and event reporting.
7. Install the required Arduino libraries: `AccelStepper`, `PubSubClient`, and `ArduinoJson`.
8. Flash the board and watch the Serial Monitor at `115200`.

If the motor is already attached to the shutter linkage, keep `SAFE_SETUP_MODE`
enabled and use `/connect` safe calibration before sending any larger commands.
Do not enable OTA on a production or installed shutter device yet.

PowerShell:

```powershell
cd C:\Users\inked\smart-shutter\firmware\esp32-shutter
Copy-Item config.example.h config.h
```

You can also print a device-specific non-secret config preview from the repo root:

```powershell
node scripts/print-device-config.mjs shutter-dev-001
```

Compile-only validation from the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/compile-firmware.ps1
```

That helper writes firmware artifacts to `.arduino-build/firmware/esp32-shutter`.

To stage the merged firmware binary for local `/flash` testing:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/stage-firmware-artifact.ps1
```

That copies the merged binary into the web app's public firmware release folder
for local/dev serving and prints `sha256` plus `sizeBytes`.

The firmware currently uses `secureClient.setInsecure()` for MVP speed. Replace that with CA certificate validation before production rollout.

When `ENABLE_LOCAL_FALLBACK_WEB` is enabled, the firmware can expose:

- A simple local web UI on the station IP when WiFi is connected.
- A local fallback access point after cloud connectivity is down long enough.
- Local endpoints for diagnostics and control: `/`, `/status`, `/set?value=0-100`, and `/stop`.

## Internal Test Flow

First validation milestone:

1. Produce a clean firmware compile and `.bin` artifact with Arduino CLI.
2. Flash a spare ESP32 only after the compile step is repeatable.
3. Keep OTA disabled during the first hardware validation passes.

1. Follow [docs/internal-test-setup.md](docs/internal-test-setup.md).
2. Power the device and confirm WiFi and MQTT connectivity in the Serial Monitor.
3. If the shutter is already attached, keep `SAFE_SETUP_MODE true` and start with `/connect`.
4. Open the deployed app and run the safe calibration flow first.
5. Start with `Nudge Open`, confirm direction, and use STOP immediately if anything sounds wrong.
6. Mark closed and open positions deliberately, then mark calibration complete.
7. Only after calibration completes should you run normal percentage tests.
8. Confirm `deviceMode` moves through `WIFI_CONNECTING`, `MQTT_CONNECTING`, `READY`, and `MOVING` as expected.
9. Record observations in [docs/test-observation-sheet.md](docs/test-observation-sheet.md).
10. Only if the cloud path is blocked, enable the local fallback page for direct on-site testing.
11. Use [docs/internal-test-message.md](docs/internal-test-message.md) as the copy-ready handoff note.
12. Work through [docs/test-checklist.md](docs/test-checklist.md) and record any notes.

Additional firmware setup references:

- [docs/arduino-cli-build.md](docs/arduino-cli-build.md)
- [docs/firmware-build.md](docs/firmware-build.md)
- [docs/first-hardware-test.md](docs/first-hardware-test.md)
- [docs/hardware-validation-plan.md](docs/hardware-validation-plan.md)
- [docs/esp32-ota-implementation.md](docs/esp32-ota-implementation.md)
- [docs/provisioning-roadmap.md](docs/provisioning-roadmap.md)
- [docs/pre-deploy-hardening.md](docs/pre-deploy-hardening.md)
- [docs/safe-calibration.md](docs/safe-calibration.md)
- [docs/live-test-preflight.md](docs/live-test-preflight.md)

## HiveMQ Vs Generated Values

HiveMQ currently provides:

- `MQTT_HOST`
- `MQTT_PORT`
- `MQTT_USERNAME`
- `MQTT_PASSWORD`

Our system currently generates or owns:

- `deviceId`
- `label`
- `commandTopic`
- `statusTopic`
- provisioning previews shown in `/setup`
- firmware release metadata shown in `/firmware`

Later, when the broker moves to AWS IoT Core, the registry can keep owning device identity while the broker-specific connection model changes from shared HiveMQ credentials to AWS IoT policies and per-device certificates.

## Current Provisioning Limits

Current limits:

- The database-backed registry is optional and local development can still run entirely on static JSON fallback
- Real MQTT username and password are still pasted locally into firmware
- Arduino IDE flashing is still manual
- The browser setup console does not flash hardware yet
- The `/flash` page embeds the real ESP Web Tools button and can install a locally staged merged binary for dev testing
- Staged browser-flash binaries are ignored by git and must be recreated locally or in deploy automation before serving them
- The firmware console only checks releases and records update events; it does not perform OTA or browser flashing yet
- The firmware contains an experimental OTA path, but it is disabled by default and should be tested only on a spare ESP32 first
- The Firmware Console `Update Firmware` action is intentionally gated behind `ENABLE_EXPERIMENTAL_OTA_UI`
- Live firmware version becomes visible only after the device publishes retained status over MQTT
- Firmware artifacts are placeholder entries today, not signed production binaries
- The release admin flow manages metadata only; it does not upload binaries or deliver them yet

The next provisioning step is active browser-assisted flashing and provisioning using Web Serial or ESP Web Tools, while still keeping secrets out of browser responses as much as possible.

## Production Firmware Update Vision

The long-term user experience should be:

1. Connect device
2. Check for update
3. Update firmware
4. Success complete

This pass adds the database-backed release registry and safe firmware check APIs that prepare for that flow without replacing the current manual Arduino process yet.

`/connect` is now the simplest user-facing version of that flow, while `/firmware`
and `/setup` remain available as more detailed internal consoles.

## Future Roadmap

- Browser flashing and provisioning console
- WiFi captive onboarding
- Local fallback control
- Calibration flow
- Alexa Smart Home Skill
- AWS IoT Core migration
- OTA updates
