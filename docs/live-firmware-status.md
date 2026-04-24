# Live Firmware Status

Smart Shutter now carries the firmware version through the live MQTT status pipeline so the web app can show what the ESP32 is actually running.

## How It Works

1. The ESP32 firmware defines `FIRMWARE_VERSION` in `config.h`.
2. The device includes `firmwareVersion`, `deviceUptimeMs`, and `rssi` in its retained MQTT status payload.
3. The web app reads that retained status through `/api/device/status`.
4. If `DATABASE_URL` is configured and the status payload includes `firmwareVersion`, the web app stores that value on the `Device` record.
5. The Firmware Console uses the live or stored firmware version when checking whether an update is available.

## Why This Helps

- The Firmware Console can show the current reported firmware version instead of only a manual registry value.
- Update checks can compare the latest release against the version the device most recently reported.
- We now have a clean bridge from manual Arduino flashing toward future OTA or browser-based flashing.

## Example Status Fields

The MQTT status payload now includes fields like:

```json
{
  "deviceId": "shutter-dev-001",
  "firmwareVersion": "0.1.0-dev",
  "deviceUptimeMs": 184523,
  "rssi": -61,
  "online": true,
  "moving": false,
  "deviceMode": "READY",
  "estimatedPercent": 50,
  "targetPercent": 50
}
```

## Current Limitations

- The web app only records firmware version after it receives a retained status payload from the broker.
- There is still no true OTA install flow in this pass.
- There is still no browser flashing flow in this pass.
- Static JSON fallback can still run without a database, but then the reported firmware version is not persisted between runs.
