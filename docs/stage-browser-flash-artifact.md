# Stage Browser Flash Artifact

This guide turns the compiled merged ESP32 binary into a locally served artifact
that `/flash` can use for experimental ESP Web Tools installs.

## 1. Compile Firmware First

From the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/compile-firmware.ps1
```

The merged firmware binary must exist at:

```text
.arduino-build/firmware/esp32-shutter/esp32-shutter.ino.merged.bin
```

## 2. Stage The Merged Binary For The Web App

From the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/stage-firmware-artifact.ps1
```

That script will:

- create `apps/web/public/firmware/releases/0.1.0-dev/`
- copy the merged binary to
  `apps/web/public/firmware/releases/0.1.0-dev/smart-shutter-0.1.0-dev-merged.bin`
- print `sha256`
- print `sizeBytes`

## 3. Run The Web App Locally

```powershell
cd apps/web
npm run dev
```

## 4. Open `/flash` In Chrome Or Edge

Use:

```text
http://localhost:3000/flash
```

Requirements:

- desktop Chrome or Edge
- ESP32 connected over USB
- a data-capable USB cable

## 5. Install Experimental Firmware

- open `/flash`
- use the experimental ESP Web Tools button
- connect the ESP32 when the browser prompts you
- install the staged local firmware

## Notes

- The staged firmware release folder is intentionally ignored by git.
- This is meant for local or controlled dev testing first.
- If you want the same flow in a deployment, artifact staging must happen before
  deploy or the binary must be hosted somewhere else and referenced in the manifest.
