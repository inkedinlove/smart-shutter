# First Hardware Test

Use this exact first-pass hardware validation sequence.

1. Copy `firmware/esp32-shutter/config.example.h` to `firmware/esp32-shutter/config.h`.
2. Fill in WiFi and HiveMQ Cloud values in `config.h`.
3. Flash `firmware/esp32-shutter/esp32-shutter.ino` to the ESP32.
4. Open Serial Monitor at `115200`.
5. Confirm you see `BOOTING`, `WIFI_CONNECTING`, `MQTT_CONNECTING`, and `READY`.
6. Confirm the logs show `MQTT connected.` and subscription to the command topic.
7. Open the deployed dashboard.
8. Press `50%`.
9. Press `STOP`.
10. Press `0%`.
11. Press `100%`.
12. Record whether direction is correct.
13. Record whether motor movement is smooth.

Notes to capture during this first test:

- Did the ESP32 connect to WiFi on the first boot?
- Did MQTT connect on the first attempt?
- Did the dashboard update after each command?
- Did the motor stall, buzz, or skip?
- Does `INVERT_DIRECTION` need to be flipped?
