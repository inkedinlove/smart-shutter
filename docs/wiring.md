# Smart Shutter Wiring

- ESP32 GPIO 14 -> ULN2003 IN1
- ESP32 GPIO 27 -> ULN2003 IN2
- ESP32 GPIO 26 -> ULN2003 IN3
- ESP32 GPIO 25 -> ULN2003 IN4
- Make sure the ESP32 ground and ULN2003 ground are tied together.
- Use an external 5V supply for the 28BYJ-48 motor instead of powering it directly from the ESP32.
- If the shutter direction ends up reversed, fix it with the `INVERT_DIRECTION` firmware flag instead of rewiring first.
