# OTA Manifest

The firmware manifest route is the future handoff point between the web platform and ESP32 OTA update logic.

## What The Manifest Does

The manifest tells a device:

- whether an update is available
- what version it is currently running
- what version is the latest approved build
- which board and channel the release belongs to
- where the artifact lives
- what hash and size the device should expect

## Why It Matters

This is the minimal metadata an ESP32 OTA client needs before it can safely attempt an install.

The current route is:

- `GET /api/devices/[deviceId]/firmware/manifest`

## Future ESP32 OTA Expectations

Before marking an update successful, the ESP32 should verify:

- the artifact size matches
- the SHA-256 hash matches
- the download completed correctly
- the new firmware boots correctly

Only after those checks should the device report update success.

## Future Security Requirement

Artifact signing is still required later.

SHA-256 helps with integrity, but real OTA delivery should also verify that:

- the artifact came from our trusted release pipeline
- the artifact was approved for install

That is why signed artifacts remain a future requirement even after the manifest route exists.
