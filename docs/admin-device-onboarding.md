# Admin Device Onboarding

This is the production onboarding handoff from factory device to customer setup.

## 1. Get the factory device ID

The factory firmware resolves and reports a device ID when it comes online.

- use the configured `DEVICE_ID` when present
- otherwise use the fallback `shutter-xxxxxx` MAC-based ID

## 2. Register the device

Open:

- `/admin/devices`

Register the device with:

- `deviceId`
- a customer-friendly label

After registration, the device moves from `unknown` to `unclaimed`.

## 3. Create a claim

From `/admin/devices`, choose `Create claim` for an unclaimed device.

Or open:

- `/admin/claims?deviceId=...`

Create a claim code and copy the generated claim link.

## 4. Send the claim link

Send the customer:

- the claim link

The customer link should open `/claim?code=...`.

## 5. Customer claims the device

The customer:

1. signs in
2. opens the claim link
3. redeems the claim

After redemption, the device moves from `unclaimed` to `claimed`.

## 6. Customer finishes setup

After claim success, the customer continues to:

- `/setup-device?deviceId=...`

From there:

- if the device is offline, they connect it to home Wi-Fi through the local setup network
- if the device is online, they continue to `/connect`

## Outcome

The full onboarding flow is:

1. factory device reports ID
2. admin registers device
3. admin creates claim
4. admin sends claim link
5. customer claims device
6. customer connects device to Wi-Fi if needed
7. customer completes setup in `/connect`
