# Support Playbook

Use this guide during the first customer-style setups and support sessions.

## Device Offline

Check:

- power to the ESP32 and motor controller
- whether the device ever completed Wi-Fi setup
- whether `lastSeenAt` is updating in diagnostics

Next action:

- ask the customer to reopen `/setup-device`
- retry Wi-Fi setup if needed
- collect copied diagnostics from `/connect`

## Setup Network Not Visible

Check:

- whether factory firmware is installed
- whether `WIFI_SSID` is blank or no saved Wi-Fi exists
- whether the device was power-cycled

Next action:

- reboot the device
- wait for `SmartShutter-XXXXXX`
- if still missing, use USB recovery/factory flash

## Wi-Fi Saves But Device Does Not Come Online

Check:

- home Wi-Fi name and password
- 2.4 GHz availability if required by the network
- whether the device returns to setup mode

Next action:

- retry Wi-Fi setup carefully
- confirm the home network is reachable from the install location
- collect diagnostics once available

## Wrong Movement Direction

Check:

- whether the first movement was only a small nudge
- whether STOP was pressed immediately

Next action:

- stop the session
- do not continue calibration
- reverse direction in firmware and reflash before trying again

## Buzzing Or Straining

Check:

- whether the shutter is binding
- whether the motor is under too much load
- whether the device is still in safe setup mode

Next action:

- press STOP immediately
- do not continue
- inspect the installation before another test

## Calibration Incomplete

Check:

- whether the customer marked closed
- whether the customer marked open
- whether `calibrationComplete` is still false in diagnostics

Next action:

- reopen `/connect`
- continue the guided calibration flow
- keep movement small until calibration is complete

## Claim Code Invalid

Check:

- whether the code was copied correctly
- whether it has already been redeemed
- whether it has expired

Next action:

- create a new claim from `/admin/claims`
- send the new claim link to the customer

## Diagnostics Fields To Request

When troubleshooting, request:

- `deviceId`
- `claimState`
- `online`
- `lastSeenAt`
- `firmwareVersion`
- `setupMode`
- `safetyMode`
- `calibrationComplete`
- `otaState`
- `wifiConnected`
- `mqttConnected`
- `rssi`
- `deviceUptimeMs`
