# ESP Web Tools Plan

ESP Web Tools and related Web Serial-based flows are attractive for Smart Shutter
because they can turn first install and recovery into a clean browser experience.

## Why It Is Useful

- The user can stay on the deployed product site.
- First install becomes much closer to "plug in device, connect, install".
- Recovery flashing becomes easier than walking a non-technical user through Arduino tools.
- It fits the long-term product goal of a simple update and setup flow.

## Browser Support Limits

- Best support is in desktop Chromium browsers such as Chrome and Edge.
- Safari and many mobile browsers do not support the needed Web Serial features.
- The product must keep a fallback path when browser support is unavailable.

## First Install And Recovery

USB browser flashing is best suited for:

- first install
- factory recovery
- board replacement
- lab or support recovery cases

That is different from OTA.

## OTA Is For Already-Online Devices

OTA should be reserved for devices that:

- are already provisioned
- can already reach the network
- can already identify themselves safely
- can verify artifact integrity before switching firmware

Browser flashing and OTA solve different stages of the lifecycle.

## Provisioning Direction

Secrets should move away from firmware constants over time.

Long term:

- the browser installs a generic image
- the device enters a claim or provisioning flow
- WiFi setup and device identity are established after flashing
- MQTT or cloud credentials come from a safer claim process, not hardcoded browser responses

## Current State

- `/flash` is now the product-facing placeholder for this future capability
- manual Arduino flashing is still the supported path
- the install manifest placeholder is committed for future ESP Web Tools-style metadata
