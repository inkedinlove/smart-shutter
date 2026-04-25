# Alexa Command Mapping

This document defines the intended Alexa-to-device command behavior for Smart Shutter.

## Primary Mapping

- `Alexa, open the shutter`
  Intended mapping: `SET_PERCENT 100`

- `Alexa, close the shutter`
  Intended mapping: `SET_PERCENT 0`

- `Alexa, set shutter to 50 percent`
  Intended mapping: `SET_PERCENT 50`

- `Alexa, stop shutter`
  Intended mapping: `STOP`

## Safety Rules

Alexa must not bypass the same safety rules enforced by the web app.

- If `safetyMode=true` and `calibrationComplete=false`
  deny movement commands

- If the device is offline
  deny movement commands

- If the device is not owned by the linked customer
  deny discovery and control

- If movement is locked
  deny movement commands

- STOP should remain the safe interruption path whenever a supported Alexa-side control path is added for it

## Current Scaffold Behavior

The scaffold route currently models these directives:

- `Alexa.PowerController.TurnOn`
  Placeholder mapping: `SET_PERCENT 100`

- `Alexa.PowerController.TurnOff`
  Placeholder mapping: `SET_PERCENT 0`

- `Alexa.PercentageController.SetPercentage`
  Placeholder mapping: `SET_PERCENT {percentage}`

- `Alexa.RangeController.SetRangeValue`
  Placeholder mapping: `SET_PERCENT {rangeValue}`

- `Alexa.ReportState`
  Returns a placeholder state report from the live device status

## Deny Conditions

The scaffold should return a structured Alexa error response when:

- the shutter is offline
- calibration is incomplete and safety mode is active
- the device is not owned by the customer
- the directive is unsupported

## Future Angle Mapping

Future slat-angle support can be added separately without breaking lift-position control.

Recommended approach later:

- keep lift position on percent / range
- add a separate angle-focused controller
- do not overload lift position with slat angle
