# Artifact Upload Plan

Smart Shutter now has a firmware release registry. The next step is a clean artifact upload path that supports real firmware binaries safely.

## Recommended Dev Artifact Storage

Good options for early internal testing:

- GitHub Releases
- Cloudflare R2
- Amazon S3

GitHub Releases is convenient for dev. R2 or S3 is a better fit once artifact management becomes part of the product workflow.

## Recommended Production Artifact Storage

For production, prefer:

- Cloudflare R2
- Amazon S3

The recommended direction is a signed upload flow where the server issues short-lived upload permissions and the artifact lands in controlled object storage.

## Required Artifact Validations

Before a release should be accepted or delivered, validate:

- `.bin` extension
- size limit
- `sha256` match
- board metadata
- channel metadata
- version metadata
- future signature verification

These checks help prevent bad uploads, mismatched binaries, and incorrect release metadata.

## Future Upload Flow

A clean future upload flow looks like:

1. Admin requests an upload slot for a firmware artifact.
2. Server validates intended metadata like version, board, and channel.
3. Server returns a short-lived upload target for R2 or S3.
4. Client uploads the `.bin`.
5. Server verifies size and `sha256`.
6. Server creates or activates the release record.

That keeps artifact storage separate from release metadata while preparing for signed artifacts later.
