# QR Provisioning Architecture

Smart Shutter's customer-ready setup path should become QR-first, not USB-first.

## Two QR Types

### Claim QR

- Printed on packaging, setup cards, or the device label
- Opens a customer-safe claim link such as `/claim?code=ABCD-EFGH`
- Attaches device ownership to the signed-in customer account
- Must never contain MQTT credentials

### WiFi Provisioning QR

- Optional future helper that points customers toward the local setup flow
- Used only after factory firmware exists on the device
- Can direct the user to setup instructions or the device setup network flow
- Must not contain the customer's Wi-Fi password

## Why WiFi Cannot Work Before Firmware Exists

Wi-Fi-first setup is only possible after a factory firmware image is already on
the ESP32. Until that image exists, the device has no way to:

- boot with a known device identity
- start a setup access point
- serve a captive portal
- store Wi-Fi credentials locally
- connect to cloud services

That means USB flashing remains the factory and recovery path, not the normal
customer setup path.

## Factory Firmware Requirement

The factory firmware should:

- boot with a unique device identity
- know how to enter setup mode
- start a setup AP when no Wi-Fi credentials are stored
- present a captive portal for Wi-Fi onboarding
- connect to the cloud after Wi-Fi is saved
- publish device status once online
- accept OTA update commands after the device is online

## Captive Portal Setup Mode

The main customer app should never collect Wi-Fi credentials for the device.

Instead, the device should expose its own local setup experience:

1. Customer claims the device from the QR link
2. Customer powers the device and enters setup mode
3. Device starts a local setup AP
4. Customer joins that AP
5. Customer enters Wi-Fi credentials in the device's captive portal
6. Device stores Wi-Fi credentials locally and connects to the cloud
7. Customer returns to `/connect`

## Pairing Code And Claim Token

The claim code remains the customer-safe ownership token for now. It can be:

- shown as a short display code
- embedded in a claim URL
- encoded into a QR code

At this stage the claim code itself is enough to support QR claim links, so a
separate QR token is not yet required.

## Customer Account Ownership

The ownership path should stay:

1. Customer signs in
2. Customer opens the claim link
3. Customer redeems the code
4. Device attaches to the customer profile
5. Device appears in `/devices`
6. Customer finishes Wi-Fi setup and then uses `/connect`

## OTA Updates After The Device Is Online

Once the device is online:

- firmware status can be reported over MQTT
- update checks can happen from the platform
- OTA delivery can happen over Wi-Fi

USB should then be reserved for:

- factory install
- recovery
- bench diagnostics

## Recovery Path Via USB `/flash`

`/flash` stays the recovery and factory-install surface. It should not become
the normal customer path once factory firmware exists.

The long-term split is:

- QR claim + captive portal for normal customer onboarding
- OTA over Wi-Fi for updates
- USB flashing only for factory or recovery work

## QR Generation Guidance

The QR should encode only the claim URL, for example:

`https://app.example.com/claim?code=ABCD-EFGH`

It must not encode:

- MQTT usernames
- MQTT passwords
- Wi-Fi credentials
- database IDs or internal secrets
