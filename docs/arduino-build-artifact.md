# Arduino Build Artifact

This guide covers how to turn the ESP32 firmware sketch into a `.bin` file that can be registered as a firmware release artifact.

## Export A Compiled Binary From Arduino IDE

In Arduino IDE 2.x:

1. Open `firmware/esp32-shutter/esp32-shutter.ino`.
2. Select the correct ESP32 board and port.
3. Make sure `config.h` is filled in for the build you want.
4. Use `Sketch -> Export Compiled Binary`.

Arduino IDE will compile the sketch and export one or more `.bin` files.

## Where The `.bin` File Usually Appears

Common locations:

- next to the sketch folder
- inside the sketch build output area used by Arduino IDE

For a standard Arduino sketch export, you will usually see the `.bin` file placed inside or alongside the `firmware/esp32-shutter` folder after export.

## Hash The Binary

From the repo root:

```powershell
node scripts/hash-file.mjs path/to/firmware.bin
```

The script prints:

- `sha256`
- `sizeBytes`

Use those values when registering the release.

## Upload The Binary Manually For Now

Until the app has a built-in upload flow, upload the `.bin` manually to one of:

- GitHub Releases for dev/internal use
- Cloudflare R2
- Amazon S3

After upload, copy the public or intended artifact URL.

## Register The Artifact In The App

1. Open `/firmware/releases`.
2. Paste the admin token.
3. Enter:
   - version
   - channel
   - board
   - artifact URL
   - SHA-256
   - size bytes
   - notes
   - active flag if this should become the current release
4. Save the release.

The release registry then becomes the source of truth for the Firmware Console and the future OTA manifest route.
