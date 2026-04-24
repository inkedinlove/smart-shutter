# Internal Test Setup

1. Install the Arduino IDE.
2. Install ESP32 board support from the Arduino Boards Manager.
3. Install these libraries from the Library Manager: `AccelStepper`, `PubSubClient`, and `ArduinoJson`.
4. Open `firmware/esp32-shutter`.
5. Copy `config.example.h` to `config.h`.
6. Edit `config.h` with the local WiFi credentials and HiveMQ Cloud credentials.
7. Open `firmware/esp32-shutter/esp32-shutter.ino`.
8. Review these firmware flags before flashing:
   `INVERT_DIRECTION` -> set to `true` if open and close are reversed.
   `MOTOR_MAX_SPEED` and `MOTOR_ACCELERATION` -> lower them if movement is too loud, rough, or fast.
   `ENABLE_LOCAL_FALLBACK_WEB` -> leave `false` for the normal remote MVP path unless you specifically want the optional local backup page.
9. Select the correct ESP32 board and serial port.
10. Flash the ESP32.
11. Open the Serial Monitor at `115200`.
12. Confirm the logs show WiFi connected and MQTT connected.
13. Follow [first-hardware-test.md](first-hardware-test.md) for the exact first physical test sequence.
14. If remote cloud control is blocked, reflash with `ENABLE_LOCAL_FALLBACK_WEB true` and use the device's local page or fallback AP for direct testing.
15. Use the internal `/setup` page to confirm the device ID, command topic, status topic, and broker host/port before editing firmware values.
