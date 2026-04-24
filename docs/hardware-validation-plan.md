# Hardware Validation Plan

This plan keeps board validation staged so we do not mix compile issues,
flash issues, network issues, and motor issues together.

## Phase A: Compile Only

- Confirm `firmware/esp32-shutter/config.h` exists.
- Run the Arduino CLI compile helper.
- Confirm `.bin` artifacts are produced.
- Do not flash hardware yet.

## Phase B: Flash Spare Board

- Use a spare ESP32 first.
- Keep the motor disconnected from the shutter linkage.
- Flash the compiled firmware and confirm the board boots.

## Phase C: Verify MQTT Connect

- Open Serial Monitor at `115200`.
- Confirm `BOOTING`, `WIFI_CONNECTING`, `MQTT_CONNECTING`, and `READY`.
- Confirm the device subscribes to the command topic.

## Phase D: Verify Dashboard Commands

- Open the dashboard.
- Send `50%`, `STOP`, `0%`, `100%`, `25%`, `75%`.
- Confirm the device receives each command and publishes retained status.

## Phase E: Verify OTA Disabled Behavior

- Keep `ENABLE_OTA_UPDATES false`.
- From the Firmware Console, send `Check Device Update`.
- Confirm the device reports OTA disabled cleanly and does not start a download.

## Phase F: Motor Detached Movement

- Verify the 28BYJ-48 moves smoothly with no linkage attached.
- Confirm direction is correct.
- Confirm `STOP` behavior is safe and predictable.

## Phase G: Shutter Linkage Attached

- Attach the motor to the shutter linkage only after direction and `STOP` are verified.
- Re-test low-risk motion commands first.
- Do not enable OTA on a production or installed shutter device yet.
