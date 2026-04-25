# Device Registration Handshake

Smart Shutter now separates a device coming online from a device being ready
for customer control.

## Device identity

Factory firmware resolves a `deviceId` at boot.

- If `DEVICE_ID` is set in `config.h`, that value is used.
- If `DEVICE_ID` is blank, firmware falls back to `shutter-xxxxxx` using the
  last six hex characters of the ESP32 efuse MAC.

The firmware publishes both:

- `deviceId`
- `resolvedDeviceId`

This gives the cloud a stable device identity even before the device is claimed.

## Claim states

The cloud classifies each resolved device ID into one of three states.

- `unknown`: no `Device` row exists for that `deviceId`
- `unclaimed`: a `Device` row exists, but no owner profile is attached
- `claimed`: a `Device` row exists and `ownerProfileId` is set

This classification is determined by the backend helper
`classifyDeviceClaimState(deviceId)`.

## Handshake flow

1. Factory firmware boots and resolves its device ID.
2. Firmware connects to Wi-Fi and MQTT, then publishes status.
3. The cloud sees the resolved device ID and classifies it as `unknown`,
   `unclaimed`, or `claimed`.
4. The app guides the next action:
   - `unknown`: admin must register the device first
   - `unclaimed`: customer can claim the device
   - `claimed`: setup and control continue for the owning customer

## Admin registration

Unknown factory devices are registered through:

- `POST /api/admin/devices/register`
- `/admin/devices`

Registration creates a `Device` row with standard topics:

- `shutters/{deviceId}/commands`
- `shutters/{deviceId}/status`

After registration, the device moves from `unknown` to `unclaimed`.

## Customer claim

Once a device is registered, an admin can create a claim code.

1. Admin creates a claim code for the registered device.
2. Customer signs in.
3. Customer redeems the claim code.
4. The device is attached to the customer profile.
5. The device appears in `/devices` and can be used in `/connect`.

After redemption, the device moves from `unclaimed` to `claimed`.

## Cloud control

Only claimed devices that belong to the current customer profile can use:

- `/connect`
- `/api/device/command`
- `/api/device/status`
- firmware check and manifest routes

Unknown or unclaimed devices are surfaced as setup/claim guidance, not as
controllable customer devices.
