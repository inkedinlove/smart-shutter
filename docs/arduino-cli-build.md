# Arduino CLI Build

This guide adds a repeatable CLI path for Phase A firmware validation before
any board is flashed.

## Why Use Arduino CLI

- It gives us a scriptable compile step for CI-like validation.
- It produces `.bin` artifacts without opening Arduino IDE.
- It helps confirm the firmware is build-ready before internal hardware testing.

## Install Arduino CLI

Use the install method you prefer, then confirm:

```powershell
arduino-cli version
```

## Configure The ESP32 Board Index

Initialize Arduino CLI once and add the Espressif board manager URL:

```powershell
arduino-cli config init
arduino-cli config add board_manager.additional_urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
arduino-cli core update-index
```

## Install The ESP32 Core

```powershell
arduino-cli core install esp32:esp32
```

The `ESP32 Dev Module` FQBN used by this repo is:

```text
esp32:esp32:esp32
```

## Install Required Libraries

```powershell
arduino-cli lib install AccelStepper
arduino-cli lib install PubSubClient
arduino-cli lib install ArduinoJson
```

## Prepare The Firmware Config

The compile step still needs `firmware/esp32-shutter/config.h`.

If it does not exist yet:

```powershell
Copy-Item firmware/esp32-shutter/config.example.h firmware/esp32-shutter/config.h
```

For compile-only validation, placeholder values are fine. For real flashing,
edit `config.h` with the real WiFi and HiveMQ settings first.

## Compile The Firmware

Direct Arduino CLI example:

```powershell
arduino-cli compile --fqbn esp32:esp32:esp32 --output-dir .arduino-build/firmware/esp32-shutter firmware/esp32-shutter
```

Repo helper script:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/compile-firmware.ps1
```

## Exported Binary Location

The helper script writes artifacts to:

```text
.arduino-build/firmware/esp32-shutter
```

Expected files usually include:

- `.arduino-build/firmware/esp32-shutter/esp32-shutter.ino.bin`
- `.arduino-build/firmware/esp32-shutter/esp32-shutter.ino.bootloader.bin`
- `.arduino-build/firmware/esp32-shutter/esp32-shutter.ino.partitions.bin`

To list them:

```powershell
Get-ChildItem .arduino-build/firmware/esp32-shutter -Filter *.bin
```

## Export A Binary For Release Registration

Once the compile succeeds, use the main application artifact flow:

1. Hash the `.bin`:
   `node scripts/hash-file.mjs .arduino-build/firmware/esp32-shutter/esp32-shutter.ino.bin`
2. Upload the binary to artifact storage.
3. Register the release in `/firmware/releases`.

## Recommended First Use

1. Complete a compile-only validation first.
2. Confirm the `.bin` exists.
3. Flash a spare board only after the compile path is stable.
