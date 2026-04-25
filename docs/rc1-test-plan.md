# RC1 Test Plan

## 1. Create Account

1. Open `/login`.
2. Create a new customer account.
3. Confirm sign-in succeeds.
4. Confirm `/devices` loads for the signed-in customer.

Expected:

- Account creation succeeds
- Session is active
- Customer routes load without redirect loops

## 2. Admin Create Claim

1. Sign in as an admin account.
2. Open `/admin/claims`.
3. Create a claim for the target device.
4. Record the generated claim code.

Expected:

- Claim code is created
- Expiry time is shown
- No MQTT secrets are exposed

## 3. Customer Redeem Claim

1. Sign in as the customer account.
2. Open `/claim`.
3. Enter the claim code.
4. Submit the claim.

Expected:

- Claim succeeds
- Claimed device label is shown
- Link to `/connect?deviceId=...` is available

## 4. Device Appears In `/devices`

1. Open `/devices`.
2. Confirm the claimed device is listed.
3. Confirm no unowned devices are visible.

Expected:

- Only owned devices appear
- Device label and device ID display cleanly

## 5. `/connect` Ownership Check

1. Open `/connect?deviceId=<owned-device>`.
2. Confirm setup loads normally.
3. Try a device ID not owned by the customer.

Expected:

- Owned device loads
- Unowned device is rejected with a clear message and next action

## 6. Simulator Online Test

1. Start the app locally or against staging.
2. Run the mock device simulator for the claimed device.
3. Open `/connect`, `/devices`, and `/firmware`.

Expected:

- Device reports online
- Status appears consistently across pages
- Commands and firmware checks work through the normal MQTT path

## 7. Safe Calibration Flow

1. Open `/connect`.
2. Move through the guided calibration steps.
3. Confirm safe mode and calibration messages are visible.

Expected:

- STOP is always visible during calibration
- Large movement remains blocked until calibration is complete
- Guidance stays simple and readable

## 8. STOP Behavior

1. Trigger a small movement.
2. Press STOP immediately.

Expected:

- STOP command is accepted
- Device returns to a non-moving state
- UI confirms the action clearly

## 9. Health Check

1. Open `/api/health`.
2. Confirm the deployment reports production-ready values.

Expected:

- `runtimeMode` matches the environment
- `productionConfigReady` is `true`
- `missingProductionConfig` is empty
- `customerModeBlockedReason` is `null`
- MQTT and database indicators are healthy
