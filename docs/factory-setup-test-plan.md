# Factory Setup Test Plan

Use this checklist before handing factory setup mode to a customer.

## Firmware preparation

1. Compile the firmware.
2. Flash the ESP32.
3. Leave `WIFI_SSID` blank in `config.h` so factory setup mode can start.

## First-boot setup mode check

1. Power the device.
2. Open Serial Monitor at `115200`.
3. Confirm the logs show:
   - resolved device ID
   - resolved MQTT topics
   - setup AP SSID
   - local setup server started
4. Confirm a Wi-Fi network like `SmartShutter-XXXXXX` appears.

## Local Wi-Fi onboarding check

1. Join the `SmartShutter-XXXXXX` access point from a phone or laptop.
2. Open the local setup page.
3. Enter the home Wi-Fi name and password.
4. Submit the form.
5. Confirm the logs show:
   - Wi-Fi credentials saved
   - rebooting
6. Wait for the device to restart.
7. Confirm the device connects to Wi-Fi and then MQTT/cloud.

## Cloud registration and claim check

1. Copy the resolved device ID from the firmware logs or cloud status.
2. Open `/admin/devices`.
3. Register that device ID.
4. Open `/admin/claims`.
5. Create a claim for the device.
6. Open the claim link as a customer.
7. Claim the device.

## Customer setup flow check

1. Open `/setup-device?deviceId=...`.
2. If the device is already online, continue to `/connect`.
3. If it is offline, use the local setup network again until it reconnects.
4. Open `/connect`.
5. Run the safe calibration flow.
6. Confirm `STOP` stops motion immediately.

## Expected outcome

The full path should work in this order:

1. factory firmware boots
2. setup AP appears
3. Wi-Fi is saved locally
4. device reconnects to cloud
5. admin registers device
6. admin creates claim
7. customer claims device
8. customer opens `/setup-device`
9. customer completes `/connect` safe calibration
