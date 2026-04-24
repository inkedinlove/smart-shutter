# Firmware Artifacts

A firmware artifact is the compiled firmware binary plus the metadata needed to identify, verify, and eventually deliver it safely to devices.

## Required Metadata

Each firmware release record should include:

- `version`
- `board`
- `channel`
- `artifactUrl`
- `sha256`
- `sizeBytes`
- `notes`

This metadata lets the platform answer questions like:

- Which release is active for `esp32` on `stable`?
- What binary should the update flow fetch?
- How large is it?
- How can we verify it before install?
- What changed in this build?

## Why `sha256` Matters

The SHA-256 digest lets us verify that the firmware artifact downloaded later is the same artifact that was registered in the release registry.

That matters because:

- corrupted downloads can happen
- artifact URLs can be changed accidentally
- update flows need an integrity check before install

For this stage, SHA-256 gives us a strong integrity field even before signed artifacts exist.

## Why Signed Artifacts Are Still Required Later

SHA-256 alone confirms integrity, but it does not prove who produced the file.

Long term we still need signed artifacts so a device or flashing tool can verify:

- the artifact was produced by our trusted release pipeline
- the artifact was not swapped with a malicious binary
- only approved builds can be installed

Signed firmware is the future production requirement.

## Where Artifacts Can Live

Reasonable hosting options:

- Vercel Blob
- Amazon S3
- Cloudflare R2
- GitHub Releases for dev and early internal testing

For MVP and internal testing, GitHub Releases can be fine. For production delivery, object storage like S3 or R2 is a better long-term fit.
