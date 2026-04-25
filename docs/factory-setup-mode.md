# Factory Setup Mode

Factory setup mode prepares Smart Shutter for WiFi-first onboarding after the
device has already been flashed at the factory or on the bench.

## First Boot Behavior

When factory setup mode is enabled, the ESP32 boots like this:

1. If `WIFI_SSID` and `WIFI_PASSWORD` are set in `config.h`, the device uses
   them directly.
2. If those are blank, the device checks saved Wi-Fi credentials in ESP32
   non-volatile storage.
3. If no saved credentials exist, or Wi-Fi connection times out, the device
   starts setup mode.

## Setup AP Naming

The setup access point uses:

- `SETUP_AP_SSID_PREFIX`
- plus the last 6 hex characters of the ESP32 efuse MAC

Example:

- `SmartShutter-A1B2C3`

## WiFi Credential Entry

In setup mode, the device hosts a simple local page at:

- `http://192.168.4.1`

That page shows:

- the resolved device ID
- the setup network name
- Wi-Fi SSID field
- Wi-Fi password field

The customer enters the home Wi-Fi details locally on the device page.

## Device Reboot

After saving Wi-Fi credentials:

1. the credentials are stored in ESP32 `Preferences`
2. the device restarts
3. it attempts to join the saved Wi-Fi network

## Cloud Connection

Once Wi-Fi is connected, the firmware continues the normal cloud path:

- connect to MQTT
- publish retained status
- accept commands
- support OTA checks when enabled

## Device Identity

If `DEVICE_ID` is configured, that value is used.

If `DEVICE_ID` is blank, the firmware derives a fallback ID like:

- `shutter-a1b2c3`

That resolved device ID is published in status payloads and can also be used to
derive MQTT topics when the topic strings contain `{deviceId}` or are left
blank.

## Safety Limitations

- Setup mode only handles Wi-Fi onboarding. It does not bypass safe movement
  rules.
- Factory setup mode does not expose MQTT credentials to customers.
- This is not a full production captive-portal stack yet. It is a conservative
  scaffold for the next firmware phase.
- USB flashing remains the recovery path.

## Recovery Path

If setup mode fails or the device cannot reconnect:

1. re-enter setup mode and try Wi-Fi again
2. if needed, recovery-flash over USB
3. return to `/setup-device` and `/connect` after the device is back online
