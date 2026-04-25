# Alexa Smart Home Architecture

This document describes the planned Alexa integration shape for Smart Shutter.

## Why Smart Home Skill

Smart Shutter should use an Alexa Smart Home skill, not a custom skill.

Why:

- Alexa Smart Home already provides discovery, state reporting, and device-control directives.
- Customers can use natural smart-home phrases without building a custom voice model.
- The Alexa app can show discovered shutters as customer-owned endpoints.

## Account Linking

A production Alexa Smart Home skill must use account linking so Alexa can map the Amazon customer to the Smart Shutter customer account.

For Smart Shutter, that means:

- the customer links Alexa to their Smart Shutter account
- Alexa receives customer-scoped cloud access
- discovery returns only devices owned by that linked customer

The current scaffold does not implement public Alexa account linking yet. For now, the route is a session-backed internal scaffold that preserves the same ownership rules.

## Discovery From Owned Devices

Discovery must return only shutters owned by the linked customer.

Each discovered endpoint should map from the existing owned device model:

- Customer Account
- Profile
- Devices owned by that profile

Recommended Alexa modeling for shutters:

- display category: `INTERIOR_BLIND`
- base interface: `Alexa`
- health: `Alexa.EndpointHealth`
- position control: `Alexa.PercentageController`
- lift/position scaffold: `Alexa.RangeController`
- open/close scaffold: `Alexa.PowerController`

## Command Mapping To Device Control

Alexa directives should map into the existing cloud device command flow:

- discovery -> owned devices
- report state -> live device status
- set percentage / range -> `SET_PERCENT`
- turn on -> `SET_PERCENT 100`
- turn off -> `SET_PERCENT 0`
- stop -> `STOP` when we expose a supported Alexa-side path for it

The MQTT broker credentials remain server-side. Alexa never receives MQTT credentials.

## Percent Support

Position control should use percent as the shared cloud representation:

- `0` = closed
- `100` = open
- `1-99` = partial position

This keeps the Alexa integration aligned with the existing web app and MQTT command model.

## Safety Restrictions

Alexa must respect the same safety rules as the web app:

- do not allow full movement if safe calibration is incomplete
- do not bypass movement locks
- do not control offline devices
- do not control unowned devices

If the device reports `safetyMode=true` and calibration is incomplete, Alexa should deny larger movement commands instead of trying them anyway.

## Certification Considerations

Before Works with Alexa or production launch, Smart Shutter still needs:

- real account linking
- public Alexa endpoint hosting
- robust state reporting
- endpoint health reporting
- production-ready error handling
- certification review against window-treatment requirements

## Current Scaffold

This repo now includes:

- a placeholder Smart Home API route
- discovery mapping from owned devices
- directive-to-command mapping helpers
- customer-profile placeholder for voice integrations

It does not yet include:

- real Alexa account linking
- public skill registration
- certification-ready control execution
