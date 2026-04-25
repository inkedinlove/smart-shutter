# Customer-Ready V1 Checklist

Use this checklist before the first real customer-style setup session.

## Readiness Checklist

- Firmware compile passed
  Confirm `powershell -ExecutionPolicy Bypass -File scripts/compile-firmware.ps1` completes successfully and produces `.bin` artifacts.

- Setup AP tested
  Confirm the device shows a setup network like `SmartShutter-XXXXXX` when no Wi-Fi credentials are saved.

- Wi-Fi setup tested
  Confirm the local setup page accepts Wi-Fi, saves credentials, and reboots cleanly.

- MQTT online confirmed
  Confirm the device comes online and reports live status after Wi-Fi setup.

- Claim flow confirmed
  Confirm admin registration, claim creation, customer claim redemption, and `/devices` ownership all work.

- Device diagnostics confirmed
  Confirm `/connect` shows `Device Status` and `Copy diagnostics` works for the selected device.

- Safe calibration confirmed
  Confirm the customer can complete the guided calibration flow with `SAFE_SETUP_MODE=true`.

- STOP confirmed
  Confirm STOP interrupts movement immediately during calibration and test movement.

- Firmware update disabled unless intentionally testing
  Confirm OTA remains disabled unless you are explicitly testing on spare hardware.

## Support Info To Collect

If something goes wrong, collect:

- Customer email used to sign in
- Device label and `deviceId`
- Claim code or claim link used
- Whether the setup network appeared
- Whether Wi-Fi save succeeded
- Whether the device ever came online
- Copied diagnostics JSON from `/connect`
- Short description of movement behavior
- Whether STOP worked immediately
- Firmware version shown in diagnostics
