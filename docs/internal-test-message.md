# Internal Test Message

Hi,

We are ready for the first Smart Shutter hardware test. Please keep the motor disconnected from the shutter linkage for this first pass so we can verify direction and STOP behavior safely.

## Hardware To Connect

- ESP32 development board
- ULN2003 driver board
- 28BYJ-48 stepper motor
- Common ground between the ESP32 and the motor driver
- External 5V power for the motor/driver path

Wiring reference:

- ESP32 GPIO 14 -> ULN2003 IN1
- ESP32 GPIO 27 -> ULN2003 IN2
- ESP32 GPIO 26 -> ULN2003 IN3
- ESP32 GPIO 25 -> ULN2003 IN4

## Repo Branch To Pull

```powershell
git checkout master
git pull origin master
```

## Firmware Config Setup

From the repo root:

```powershell
cd firmware\esp32-shutter
Copy-Item config.example.h config.h
```

Then open `config.h` and paste in the values I send you privately.

## Values I Will Provide Privately

- WiFi SSID
- WiFi password
- MQTT host
- MQTT port
- MQTT username
- MQTT password
- Dashboard URL
- Device ID if we are not using the default

## Flashing Steps

1. Open `firmware/esp32-shutter/esp32-shutter.ino` in Arduino IDE.
2. Make sure the ESP32 board package and required libraries are installed.
3. Select the correct ESP32 board and COM port.
4. Verify the sketch.
5. Upload the sketch.
6. Open Serial Monitor at `115200`.

## Serial Logs To Confirm

Please confirm you see these mode transitions:

- `BOOTING`
- `WIFI_CONNECTING`
- `MQTT_CONNECTING`
- `READY`

Please also confirm you see:

- `MQTT connected.`
- `Subscribed to command topic: ...`

## Dashboard URL

Open the dashboard URL I send you privately after the firmware reaches `READY`.

## Exact Test Sequence

1. Press `50%`
2. Press `STOP`
3. Press `0%`
4. Press `100%`
5. Press `25%`
6. Press `75%`

## Feedback To Send Back

Please send back:

- direction correct?
- motion smooth?
- any buzzing?
- any missed movement?
- dashboard status updating?
- anything unexpected in Serial Monitor?

A short phone video of the motor during the test would also help if possible.
