# ESP8266 Firmware Build

This guide is for the MQTT-compatible Smart Shutter ESP8266 target in:

```text
firmware/esp8266-shutter
```

Use this build when the device is a NodeMCU, ESP-12E, D1 mini, or another
ESP8266-family board that cannot use the current browser flashing path.

## What This Firmware Supports

- the same Smart Shutter MQTT command topics as the ESP32 build
- retained status updates for `/connect`, `/devices`, and diagnostics
- setup AP onboarding with `SmartShutter-XXXXXX`
- safe calibration commands:
  - `NUDGE_OPEN`
  - `NUDGE_CLOSE`
  - `SET_CURRENT_AS_CLOSED`
  - `SET_CURRENT_AS_OPEN`
  - `MARK_CALIBRATION_COMPLETE`
  - `STOP`

Current limits:

- browser flashing is still ESP32-focused
- OTA stays disabled in this ESP8266 build

## Arduino IDE Setup

1. Install Arduino IDE 2.x.
2. Open `File -> Preferences`.
3. Add the ESP8266 board manager URL if it is not already present:

```text
http://arduino.esp8266.com/stable/package_esp8266com_index.json
```

4. Open `Tools -> Board -> Boards Manager`.
5. Search for `esp8266`.
6. Install `esp8266 by ESP8266 Community`.

## Recommended Boards

- `NodeMCU 1.0 (ESP-12E Module)` for most NodeMCU v3 boards
- `LOLIN(WEMOS) D1 R2 & mini` for common D1 mini boards
- `Generic ESP8266 Module` when a clone needs a more manual profile

Recommended CLI FQBN for NodeMCU-style boards:

```text
esp8266:esp8266:nodemcuv2
```

Other common ESP8266 CLI FQBNs:

- `esp8266:esp8266:d1_mini` for LOLIN or WEMOS D1 mini boards
- `esp8266:esp8266:generic` for unknown clones that need the generic profile

## Required Libraries

Install these libraries:

- `AccelStepper`
- `PubSubClient`
- `ArduinoJson`

`ESP8266WiFi`, `ESP8266WebServer`, `EEPROM`, and `WiFiClientSecureBearSSL`
come from the ESP8266 board package.

## Config File

1. Open `firmware/esp8266-shutter`
2. Copy `config.example.h` to `config.h`
3. Edit `config.h`
4. Open `esp8266-shutter.ino`

PowerShell:

```powershell
cd C:\Users\inked\smart-shutter\firmware\esp8266-shutter
Copy-Item config.example.h config.h
```

Important config notes:

- leave `WIFI_SSID` blank for factory setup mode
- leave `DEVICE_ID` blank to derive `shutter-xxxxxx` from the ESP8266 chip ID
- leave `MQTT_CLIENT_ID` blank to derive `smart-shutter-{deviceId}`
- keep `ENABLE_OTA_UPDATES false`

## Default Motor Pins

The default ESP8266 sketch uses NodeMCU-friendly GPIOs:

- `IN1 = GPIO5` (`D1`)
- `IN2 = GPIO4` (`D2`)
- `IN3 = GPIO14` (`D5`)
- `IN4 = GPIO12` (`D6`)

Avoid changing to ESP8266 boot-strap pins unless you know the board wiring
requirements.

## Windows COM Port Flow

1. Use a known-good USB data cable.
2. Open Windows Device Manager.
3. Unplug and replug the ESP8266 board.
4. Watch `Ports (COM & LPT)` and note the new port such as `COM7`.
5. If no port appears, try a different cable or install the USB serial driver used by the board, often `CP210x` or `CH340`.
6. Close Serial Monitor or any other app using that COM port before upload.

## Compile With Arduino CLI

Run these commands from the Smart Shutter repo root.

Working repo helper command:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\compile-firmware.ps1 -Fqbn esp8266:esp8266:nodemcuv2 -SketchDir .\firmware\esp8266-shutter -OutputDir .\.arduino-build\firmware\esp8266-shutter
```

Direct compile:

```powershell
arduino-cli compile --fqbn esp8266:esp8266:nodemcuv2 --output-dir .\.arduino-build\firmware\esp8266-shutter .\firmware\esp8266-shutter
```

Optional compile and upload example:

```powershell
arduino-cli compile --upload -p COM7 --fqbn esp8266:esp8266:nodemcuv2 .\firmware\esp8266-shutter
```

## Flash With Arduino IDE

1. Select the ESP8266 board profile that matches the hardware.
2. Select the serial port you found in Device Manager.
3. Open `firmware/esp8266-shutter/esp8266-shutter.ino`.
4. Click `Verify`.
5. Click `Upload`.
6. If upload stalls on a clone board, hold `BOOT` or `FLASH` while upload begins.
7. Open Serial Monitor at `115200`.

## Expected Boot Logs

You should see logs like:

- `Smart Shutter ESP8266 booting...`
- `Resolved deviceId: ...`
- `MQTT topics resolved.`
- `Connecting to WiFi SSID: ...`
- `WiFi connected. IP address: ...`
- `MQTT connected.`
- `Subscribed to command topic: ...`

When no WiFi is configured or the saved network cannot be reached, you should see:

- `Setup AP SSID: SmartShutter-XXXXXX`
- `Local setup server started.`

After saving WiFi:

- `WiFi credentials saved for SSID: ...`
- `WiFi credentials saved.`
- `Rebooting...`

## Setup Mode Validation

1. Leave `WIFI_SSID` blank.
2. Flash the board.
3. Power the device.
4. Confirm `SmartShutter-XXXXXX` appears.
5. Join the AP from a phone or laptop.
6. Open the device setup page.
7. Save WiFi credentials.
8. Wait for reboot.
9. Confirm the device comes online in Smart Shutter.

## Browser Flashing Note

The current `/flash` page still uses the ESP Web Tools path for supported ESP32
builds. ESP8266 boards should use manual USB flashing through Arduino IDE or
Arduino CLI, then return to `/connect` once the device is online.
