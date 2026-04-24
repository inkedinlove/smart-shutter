# Active Browser Flashing

`/flash` now includes an experimental ESP Web Tools proof button.

This is not the final product flow yet, but it confirms that Smart Shutter can
host the real browser install surface instead of only documenting it.

## Browser Support

- Best support is in desktop Chrome and Edge.
- Web Serial requires a secure context, which means `https://` or localhost.
- Unsupported browsers should still fall back to the current manual Arduino path.

## USB Requirement

- Browser flashing is for USB-connected boards.
- It is the right future path for first install and recovery.
- It is not a replacement for OTA on already-online devices.

## What The Current Manifest Still Needs

The public manifest now includes the first local/dev `ESP32` build entry, but it
still depends on a staged merged binary being present in the public release folder.

The manifest expects:

```json
{
  "chipFamily": "ESP32",
  "parts": [
    {
      "path": "/firmware/releases/0.1.0-dev/smart-shutter-0.1.0-dev-merged.bin",
      "offset": 0
    }
  ]
}
```

## How To Add The Compiled Merged Binary Later

1. Compile the firmware and export the normal ESP32 `.bin` artifacts.
2. Create a merged ESP32 binary suitable for ESP Web Tools.
3. Stage it locally with
   `powershell -ExecutionPolicy Bypass -File scripts/stage-firmware-artifact.ps1`
   or host it in an artifact bucket later.
4. Re-test `/flash` in desktop Chrome or Edge over HTTPS or localhost.

## Why This Is Still Experimental

- The local/dev install depends on a manually staged merged binary.
- The firmware still uses the current manual provisioning path.
- WiFi setup and device claim still need a safer post-flash provisioning flow.
- OTA and browser flashing still serve different lifecycle stages.
