# Firmware Update Roadmap

Smart Shutter is moving toward a production-quality firmware update experience in deliberate stages so we can improve reliability without breaking the current MVP flow.

## Stage 1: Database-Backed Firmware Release Registry

- Store devices, firmware releases, update events, and provisioning sessions in Neon Postgres through Prisma.
- Keep the current manual `config.h` and Arduino IDE workflow working while the release metadata becomes structured.
- Add safe update-check APIs that expose release metadata without exposing MQTT secrets.

This is the stage added in this pass.

## Stage 2: Browser Flashing For First Install And Recovery

- Add a guided browser-based flashing page using Web Serial or WebUSB.
- Keep it focused on first install and recovery before attempting full OTA updates.
- Use generated non-secret config plus a safer provisioning handoff for any sensitive values.

## Stage 3: OTA Update Checks From ESP32

- Let the device report its current firmware version.
- Let the ESP32 check for newer approved releases.
- Keep the website and device checking the same release registry so update decisions stay consistent.

## Stage 4: Signed Firmware Artifacts

- Publish signed firmware binaries.
- Validate artifact integrity before install.
- Move beyond placeholder hashes to an actual trusted artifact pipeline.

## Stage 5: Staged Rollout Channels

- Support channels like `stable`, `beta`, and internal test cohorts.
- Roll out new firmware to a small group first.
- Track update events and failure signals before widening the release.

## Stage 6: AWS IoT Core Device Identity

- Move from shared HiveMQ credentials to stronger per-device identity.
- Align firmware delivery, provisioning, and broker access with AWS IoT Core.
- Use device identity as the foundation for safer OTA and long-term provisioning at scale.
