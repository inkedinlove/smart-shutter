# Production Flow

## Customer Journey

1. Sign in at `/login`.
2. Claim a device at `/claim`.
3. Open owned devices at `/devices`.
4. Launch setup from `/connect?deviceId=...`.
5. Confirm the device is online.
6. Check firmware status.
7. Complete safe calibration.
8. Confirm setup.
9. Run controlled movement tests.

## Failure Modes

### Session expired
- Sign-in is required again before customer routes or APIs continue.
- Customer pages redirect back to `/login`.

### Claim code invalid
- The code was entered incorrectly or does not exist.
- Next action: check the code and try again.

### Claim code expired
- The code is no longer usable.
- Next action: request a new claim code.

### Claim code already used
- The device was already claimed.
- Next action: open the device from the account list or request help.

### Device not owned
- Customer APIs reject access when the device is not attached to the signed-in profile.
- Next action: use an owned device from `/devices` or claim the device first.

### Device offline
- No recent MQTT device status is available.
- Next action: check power and Wi-Fi, then retry the connection.

### Live device status unavailable
- The status service or broker path did not respond in time.
- Next action: wait briefly and check again.

### Calibration incomplete
- Full movement remains blocked until calibration is finished.
- Next action: complete the guided calibration flow.

### Safety mode active
- Safe setup protections are still limiting movement.
- Next action: continue with small movements until setup is complete.

## Recovery Steps

### Login
- Retry sign-in with the correct email and password.
- If the session expired, sign in again and return to the original page.

### Claim
- Re-enter the claim code carefully.
- If the code expired, create a new one from the admin claim page.

### Connect
- Use `Retry connection` when the device is offline or not responding.
- Use `/flash` only for install or recovery.

### Calibrate
- Keep hands clear of the shutter.
- Stop immediately if the shutter binds, buzzes, clicks, or strains.
- Do not continue to full movement until calibration is complete.

### Control
- Use STOP immediately if movement is wrong or strained.
- If the device stops reporting, return to setup and re-check connection.

## Operational Notes

- `/connect` is the main customer entry point after claiming.
- Customer access is scoped to owned devices only.
- Internal fallback and simulator paths remain separate from customer mode.
