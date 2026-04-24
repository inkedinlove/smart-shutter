# Mock Device Simulator

The mock device simulator lets Smart Shutter exercise the web app end to end
without a physical ESP32 connected.

## What It Simulates

The simulator connects to MQTT and behaves like a retained-status device for a
single `deviceId`.

It simulates:

- MQTT connection and subscription
- retained status publishing every 3 seconds
- `SET_PERCENT`
- `STOP`
- `NUDGE_OPEN`
- `NUDGE_CLOSE`
- `SET_CURRENT_AS_CLOSED`
- `SET_CURRENT_AS_OPEN`
- `MARK_CALIBRATION_COMPLETE`
- `LOCK_MOVEMENT`
- `UNLOCK_MOVEMENT`
- `CHECK_UPDATE` with OTA disabled behavior
- firmware version reporting
- uptime and RSSI reporting
- `deviceMode`, `moving`, estimated position, target position, and safe calibration state

## Required Environment Variables

The simulator uses the same broker variables as the web app:

- `MQTT_HOST`
- `MQTT_PORT`
- `MQTT_USERNAME`
- `MQTT_PASSWORD`

It automatically reads `apps/web/.env` and `apps/web/.env.local` if those files
exist, while still allowing real process environment variables to override them.

## Run It

From the repo root:

```powershell
node scripts/mock-device.mjs --deviceId shutter-dev-001 --firmwareVersion 0.1.0-dev
```

Or from `apps/web`:

```powershell
npm run mock-device -- --deviceId shutter-dev-001 --firmwareVersion 0.1.0-dev
```

The simulator derives topics automatically:

- `shutters/{deviceId}/commands`
- `shutters/{deviceId}/status`

## Test The Local App Against It

1. Start the web app.
2. Start the mock device simulator.
3. Open `/connect` or the main dashboard.
4. Select the same `deviceId`.
5. Run the normal test sequence:
   `50%`, `STOP`, `0%`, `100%`, `25%`, `75%`

For attached-shutter flow testing, use `/connect` and go through the safe
calibration step first:

- `Nudge Open`
- `STOP` if direction is wrong
- `Set Current As Closed`
- repeated `Nudge Open`
- `Set Current As Open`
- `Mark Calibration Complete`

You should see:

- live online status
- firmware version
- estimated percent changes
- `MOVING` during movement
- `READY` when movement completes
- `STOP` freezing movement immediately

## Test A Deployed App Against It

You can also point the simulator at the same MQTT broker used by the deployed app.

As long as:

- the deployed app is using the same broker
- the device registry contains the same `deviceId`
- the command and status topics match the standard topic pattern

the deployed `/connect`, dashboard, and `/firmware` pages can all interact with
the simulator like a real device.

## What It Cannot Prove

The simulator is useful for web and MQTT integration, but it does not prove:

- motor wiring
- stepper direction correctness
- physical motion smoothness
- power stability
- USB flashing behavior
- real OTA install safety
- serial logging or board-specific compile behavior
