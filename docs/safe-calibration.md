# Safe Calibration

Use this flow for the first attached-shutter test.

The goal is simple:

- prevent aggressive first movement
- confirm direction with a tiny move first
- mark closed and open positions deliberately
- stop immediately if anything sounds or feels wrong

## Attached-Shutter Safety Policy

- Keep `SAFE_SETUP_MODE true` in `config.h` for the first attached-shutter session.
- Stay beside the shutter during the whole test.
- Keep STOP ready at all times.
- Do not send large percentage moves until calibration is complete.
- Do not continue if the shutter binds, clicks, buzzes, strains, or stalls.

## Safe First Flow

1. Confirm the shutter can move freely and nothing is obstructing it.
2. Open `/connect`.
3. Run `Check Firmware` so the device status is visible.
4. Go to `Safe Calibration`.
5. Press `Nudge Open` once.
6. If direction is wrong, press `STOP` and stop the session.
7. Only press `Set Current As Closed` when the shutter is physically closed.
8. Use `Nudge Open` in small increments until the shutter is physically open.
9. Press `Set Current As Open`.
10. Press `Mark Calibration Complete`.
11. Only then move to the normal test buttons.

## STOP Behavior

- STOP should always be available.
- STOP should be used immediately if the shutter moves the wrong direction.
- STOP should be used immediately if motion sounds rough or strained.

## Direction Confirmation

If `Nudge Open` moves the shutter the wrong way:

- press STOP
- do not continue with calibration
- flip `INVERT_DIRECTION` in `firmware/esp32-shutter/config.h`
- reflash the ESP32
- restart the safe calibration flow

## When Not To Continue

Do not continue if any of these happen:

- shutter binds
- shutter chatters or buzzes
- motor strains
- motion is jerky or rough
- STOP does not respond promptly
- the shutter appears to be pushing against a hard stop

## Feedback Your Friend Should Send Back

Ask for these notes after the first session:

- did `Nudge Open` move in the correct direction
- did STOP feel immediate enough
- did the shutter move smoothly
- was there any buzzing or clicking
- did any move fail or stall
- did the status on `/connect` update correctly
- was calibration able to complete
