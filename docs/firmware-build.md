# Firmware Build Guide

This guide is the main ESP32 build path. For the MQTT-compatible ESP8266
variant, use [esp8266-firmware-build.md](esp8266-firmware-build.md).

## Arduino IDE Setup

1. Install the latest Arduino IDE 2.x.
2. Open `File -> Preferences`.
3. In `Additional Boards Manager URLs`, add the ESP32 boards URL if it is not already present:

```text
https://espressif.github.io/arduino-esp32/package_esp32_index.json
```

4. Open `Tools -> Board -> Boards Manager`.
5. Search for `esp32`.
6. Install `esp32 by Espressif Systems`.

## Board Selection Guidance

- Start with `ESP32 Dev Module` for common ESP32 development boards.
- If your board is a vendor-specific ESP32 devkit, choose the closest matching profile from the installed Espressif package.
- If uploads fail, double-check the selected COM port and try pressing the board's `BOOT` button during upload.

## Required Libraries

Install these from `Tools -> Manage Libraries`:

- `AccelStepper`
- `PubSubClient`
- `ArduinoJson`

`WiFi`, `WiFiClientSecure`, and `WebServer` come from the ESP32 board package and do not need separate installs.

## Firmware Config Files

1. Open the firmware folder: `firmware/esp32-shutter`
2. Copy `config.example.h` to `config.h`
3. Edit `config.h`
4. Open `esp32-shutter.ino` in Arduino IDE

PowerShell:

```powershell
cd C:\Users\inked\smart-shutter\firmware\esp32-shutter
Copy-Item config.example.h config.h
```

Required config values in `config.h`:

- `WIFI_SSID`
- `WIFI_PASSWORD`
- `MQTT_HOST`
- `MQTT_PORT`
- `MQTT_USERNAME`
- `MQTT_PASSWORD`
- `DEVICE_ID`
- `FIRMWARE_VERSION`
- `COMMAND_TOPIC`
- `STATUS_TOPIC`

Also review these optional tuning values before flashing:

- `INVERT_DIRECTION`
- `MOTOR_MAX_SPEED`
- `MOTOR_ACCELERATION`
- `ENABLE_LOCAL_FALLBACK_WEB`
- `ENABLE_OTA_UPDATES` -> leave `false` unless you are testing OTA on a spare ESP32
- `API_BASE_URL` -> set this to the deployed app origin used for firmware manifest and event routes
- `OTA_MANIFEST_PATH_TEMPLATE` -> keep the default route template unless the manifest path changes

## Compile and Flash

1. Select the correct board under `Tools -> Board`.
2. Select the correct serial port under `Tools -> Port`.
3. Open `firmware/esp32-shutter/esp32-shutter.ino`.
4. Click `Verify`.
5. Click `Upload`.
6. Open the Serial Monitor at `115200`.

## Expected Boot Logs

You should see a sequence like:

- `Smart Shutter MVP booting...`
- `Device mode -> BOOTING`
- `Device mode -> WIFI_CONNECTING`
- `WiFi connected. IP address: ...`
- `Device mode -> MQTT_CONNECTING`
- `MQTT connected.`
- `Subscribed to command topic: ...`
- `Device mode -> READY`

During movement, you should also see:

- `Command received: type=SET_PERCENT value=...`
- `STOP received from mqtt, distanceToGo=...`
- `Device mode -> MOVING`
- `Status ok mode=...`

During OTA experiments, you should also see:

- `Command received: type=CHECK_UPDATE source=mqtt`
- `OTA step: checkForUpdate()`
- `OTA manifest updateAvailable=...`
- `OTA download finished bytes=...`
- `OTA step: verify sha256 ...`

## Common Failure Fixes

### WiFi Fails

- Recheck `WIFI_SSID` and `WIFI_PASSWORD` in `config.h`.
- Confirm the ESP32 is in range of the WiFi network.
- Confirm the network allows 2.4 GHz clients; many ESP32 boards do not support 5 GHz.
- If the device keeps timing out, power-cycle the board and reflash if needed.

### MQTT `rc` Errors

- Recheck `MQTT_HOST`, `MQTT_PORT`, `MQTT_USERNAME`, and `MQTT_PASSWORD`.
- Confirm the HiveMQ Cloud instance is running and reachable on port `8883`.
- Confirm the command and status topics match the website configuration.
- If you see auth-related failures, regenerate the credentials in HiveMQ and update `config.h`.

### Motor Does Not Move

- Recheck the ULN2003 wiring against [wiring.md](wiring.md).
- Confirm the external 5V motor supply is connected and shares ground with the ESP32.
- Confirm the command is reaching the device by watching the Serial Monitor for `Applying SET_PERCENT`.
- Lower `MOTOR_MAX_SPEED` if the motor is stalling under load.

### Motor Vibrates But Does Not Turn

- Verify the ULN2003 motor connector is fully seated.
- Recheck the pin mapping in `config.h` if you changed it.
- Reduce `MOTOR_MAX_SPEED` and `MOTOR_ACCELERATION`.
- Confirm the 5V supply can provide enough current for the 28BYJ-48 motor.

### Direction Reversed

- Set `INVERT_DIRECTION` to `true` in `config.h`.
- Reflash the firmware.
- Retest `0%`, `50%`, and `100%`.

### Dashboard Does Not Update

- Confirm the device reaches `MQTT connected.` in the Serial Monitor.
- Confirm `STATUS_TOPIC` in `config.h` matches `MQTT_STATUS_TOPIC` in `apps/web/.env.local` or Vercel.
- Confirm the web app can reach HiveMQ Cloud with the same broker settings.
- If the dashboard still shows offline, try a fresh command from the site and watch for retained status logs on the device.
