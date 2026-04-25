# Per-Device Credentials

Smart Shutter currently uses one shared HiveMQ username and password for all
devices in the MVP. That works for early development, but it is not the long-term
production model.

## Current shared-credential limitation

Today each device uses:

- the same MQTT broker host
- the same MQTT username
- the same MQTT password

Devices are separated mainly by topic names such as:

- `shutters/{deviceId}/commands`
- `shutters/{deviceId}/status`

This is enough for the MVP, but it makes isolation, rotation, and revocation
too coarse for production.

## Why per-device credentials matter

Per-device credentials make it possible to:

- revoke one device without affecting every device
- rotate credentials one device at a time
- scope each device to only its own MQTT topics
- trace cloud activity back to a single physical device
- reduce blast radius if one device is compromised

## Topic scoping per device

Even before full per-device credentials, each device already has a dedicated
topic pair:

- `shutters/{deviceId}/commands`
- `shutters/{deviceId}/status`

The next step is to bind device credentials to those topics so a device can
only publish and subscribe within its own scope.

## Shared mode today

The current production-safe transition path is:

- `credentialMode = shared`
- `credentialStatus = active`
- derived MQTT client ID per device

This keeps the shared HiveMQ credential path working while the platform starts
tracking device credential state in the database.

## AWS IoT Core future

The intended production destination is AWS IoT Core with:

- per-device X.509 certificates
- per-device IoT policies
- certificate activation and revocation
- certificate rotation on lifecycle events

At that point, the database can track references like:

- credential mode
- credential status
- issued time
- revoked time
- certificate fingerprint

without exposing secret material in the browser.

## Rotation and revocation model

Production credential lifecycle should support:

1. issue credentials for a device
2. mark credentials active
3. rotate credentials when needed
4. revoke old credentials
5. deny cloud access for revoked devices

That model must work per device, not per fleet.

## Factory provisioning implications

Factory provisioning eventually needs to assign:

- stable device identity
- per-device cloud identity
- claimability in the customer platform

For now, factory firmware can still ship with shared-mode MQTT settings for the
MVP. Later factory images should move toward per-device identity references and
certificate-based provisioning.
