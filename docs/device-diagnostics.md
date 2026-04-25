# Device Diagnostics

Use device diagnostics when a customer or operator needs to understand the current device state without physical access.

## Where To Find It

- In the app: `/connect`
- API: `GET /api/devices/[deviceId]/diagnostics`

The `/connect` page includes a compact `Device Status` section and a `Copy diagnostics` button for sharing the current state.

## Diagnostics Fields

- `deviceId`: The cloud device identity used by the app.
- `claimState`: Whether the device is `unknown`, `unclaimed`, or `claimed`.
- `online`: Whether the latest live status shows the device is connected and reporting.
- `lastSeenAt`: When the cloud last received a valid status payload from the device.
- `firmwareVersion`: The firmware version currently reported by the device.
- `setupMode`: Whether the device is still in local Wi-Fi setup mode.
- `safetyMode`: Whether safe setup restrictions are still active.
- `calibrationComplete`: Whether safe calibration has finished.
- `otaState`: The current OTA state, if the device reports one.
- `wifiConnected`: Whether the device is connected to Wi-Fi.
- `mqttConnected`: Whether the device is connected to MQTT.
- `rssi`: The Wi-Fi signal level in dBm.
- `deviceUptimeMs`: Device uptime reported by the firmware.

## Common Failure Patterns

- `wifiConnected=false`
  The device is not on the local network yet. Check power, setup mode, and saved Wi-Fi credentials.

- `mqttConnected=false`
  The device is on Wi-Fi but not connected to cloud messaging. Check broker reachability, topic setup, and cloud credentials.

- `otaState=FAILED`
  The last OTA attempt did not complete. Use the firmware console and serial logs to confirm the failure reason before retrying.

- `online=false` with an old `lastSeenAt`
  The device was seen before, but it is no longer reporting. Check power, Wi-Fi, and whether the device rebooted into setup mode.

- No `lastSeenAt` updates
  The cloud has not received any valid live status yet. Confirm the device has firmware, power, Wi-Fi, and MQTT connectivity.

- `setupMode=true`
  The device is waiting for local Wi-Fi onboarding. Join the SmartShutter setup network, save Wi-Fi, then return to `/setup-device`.

- `calibrationComplete=false`
  The shutter should stay in safe setup flow. Use `/connect` and finish the guided calibration before larger movements.

## Remote Debugging Checklist

1. Open `/connect` for the affected device.
2. Expand `Device Status`.
3. Review `online`, `lastSeenAt`, `wifiConnected`, `mqttConnected`, and `rssi`.
4. Copy diagnostics and share them with the operator if needed.
5. If the device is offline, start with power and Wi-Fi before testing commands.
