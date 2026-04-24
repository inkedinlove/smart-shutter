# Provisioning Roadmap

Smart Shutter is moving from a manual single-device setup toward a scalable provisioning flow in deliberate stages.

## Stage 1: Manual `config.h`

- Copy `firmware/esp32-shutter/config.example.h` to `config.h`
- Paste WiFi and broker credentials manually
- Paste generated device ID and topic values manually

This is the current firmware path and remains supported.

## Stage 2: Dashboard-Generated Device Config

- Device IDs and topics come from the web app device registry
- Internal routes expose non-secret provisioning data
- The `/setup` page shows a firmware config preview with secrets redacted

This is the current web-side provisioning step.

## Stage 3: Web USB Flashing Page

- The browser generates a device config
- A setup page flashes firmware over Web Serial or WebUSB
- The operator pastes broker secrets once during provisioning

This removes most copy-paste work while keeping the firmware build understandable.

## Stage 4: WiFi Captive Portal Or BLE Provisioning

- Device boots into a guided onboarding mode
- WiFi credentials and device assignment are pushed locally
- The device can validate connectivity before leaving setup mode

This is the main usability upgrade for operator-friendly onboarding.

## Stage 5: AWS IoT Core Per-Device Certificates

- Replace shared HiveMQ username and password with per-device credentials
- Store broker profile and certificate metadata in the registry
- Move provisioning from simple broker settings to per-device trust material

This is the key security and scale upgrade.

## Stage 6: QR-Code Claim Or Pairing Flow

- Device ships with a claim code or QR code
- Operator scans the code from the setup page
- The platform assigns a registry record and provisions credentials automatically

That is the long-term path to a cleaner production pairing experience.
