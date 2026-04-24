# Legacy Prototype Comparison

## What The Old ESP8266 Prototype Proved

The older prototype used:

- `ESP8266WiFi`
- `WiFiManager` with `autoConnect("Trademark Shutters Remote Device")`
- `ESP8266WebServer`
- A servo
- A local endpoint at `/setPOS?servoPOS=ANGLE`
- A device-hosted HTML page from `index.h`

That prototype proved two important ideas early:

- Device-hosted local control is fast to test on-site.
- WiFiManager-style onboarding is much easier for non-developers than reflashing credentials every time.

## What The New ESP32 MVP Proves

The current repo uses:

- Next.js dashboard with App Router and TypeScript
- Server-side MQTT routes so broker credentials stay off the browser
- HiveMQ Cloud as the MVP broker
- ESP32 firmware with `WiFiClientSecure`, `PubSubClient`, `AccelStepper`, and `ArduinoJson`
- ULN2003 + 28BYJ-48 stepper control
- Estimated percentage positioning instead of direct servo angle

This proves remote testing from a deployed website, which is the main requirement for sending commands across the internet instead of only from the same local network.

## Why MQTT Remote Control Is Better For Cross-State Testing

- The operator can use the deployed site from anywhere instead of joining the device's local network.
- Brokered messaging separates the web app from the device, which is a better fit for Vercel and later AWS IoT Core migration.
- Retained MQTT status gives the dashboard a simple way to recover the latest known state.
- Server-side publish routes keep MQTT usernames and passwords out of the browser.

For remote internal testing from another state, that is much more useful than a local-only ESP8266 page.

## What We Intentionally Kept

- A very simple command model: set position directly and stop motion directly.
- A device-friendly fallback mindset: local status, local manual control, and easier onboarding are still worthwhile.
- A lightweight operator experience with clear buttons and immediate feedback.

## What We Intentionally Changed

- Servo angle commands changed to percent-based shutter positioning for the stepper-driven mechanism.
- Local-only HTTP control changed to a deployed dashboard plus MQTT broker model.
- Browser-to-device direct control changed to browser -> Next.js API -> MQTT -> ESP32, so secrets stay server-side.
- Device status is now an explicit JSON snapshot with `deviceMode`, movement, and estimated percent.
- The firmware now publishes retained status and uses a retained offline will message for better remote visibility.

## Local Fallback Design

The current main path remains:

1. Deployed website
2. Next.js server route
3. HiveMQ Cloud
4. ESP32 firmware

For fallback, the firmware now supports an optional compile-time path with:

- `ENABLE_LOCAL_FALLBACK_WEB true`
- A simple local page at `/`
- A local diagnostic endpoint at `/status`
- Direct local commands at `/set?value=0-100` and `/stop`
- A fallback access point if cloud connectivity stays down long enough

This is intentionally a small backup mechanism, not a replacement for the MQTT architecture.

## Why WiFiManager/Captive Setup Is Future Work

WiFiManager-style captive onboarding is still a good future improvement, but it is not required for the first remote MVP because:

- Manual credentials in firmware remove one more moving part while the remote control path is being proven.
- Cloud MQTT connectivity, remote dashboard control, and motor behavior are the higher-priority unknowns for this phase.
- Captive setup adds extra UX and support work that is easier to tackle after the remote path is stable.

The right future direction is to combine both models:

- Remote control stays MQTT-first.
- Device onboarding gets easier with captive setup.
- Local fallback stays available for on-site debugging when the cloud path is unavailable.
