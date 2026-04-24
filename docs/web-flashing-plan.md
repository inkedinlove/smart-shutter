# Web Flashing Plan

The goal of the next provisioning stage is to let an internal setup page prepare and eventually flash Smart Shutter firmware directly from the browser using Web Serial or WebUSB.

## Goal

- Select or create a device in the registry
- Generate a device-specific firmware config
- Flash the board from the browser
- Guide the operator straight into first-boot validation

This repo does not implement browser flashing yet. The current setup console is a preparation step only.

## Browser Support Expectations

- Web Serial support is strongest in Chromium-based browsers such as Chrome and Edge.
- WebUSB support is also browser-dependent and less universal than standard web features.
- Safari and Firefox support are limited or inconsistent for these hardware APIs.

That means browser flashing should be treated as an internal operator tool first, not a universal customer-facing path.

## Security Concerns

- Direct browser-to-device flashing increases the sensitivity of any config values placed into browser responses.
- Any provisioning page that returns secrets can expose them through browser devtools, copied logs, screenshots, or accidental client-side leaks.
- Shared broker credentials are especially risky if they ever reach the browser.

For that reason, the current setup console only returns non-secret provisioning values and leaves real broker credentials to a local manual paste step.

## Why Secrets Should Not Stay In The Browser Long-Term

Today, the MVP still relies on shared HiveMQ credentials, so exposing them in a browser response would be a poor long-term pattern.

Long-term goals should be:

- Minimize or eliminate secret handling in the browser
- Use short-lived claim or pairing flows instead of static shared credentials
- Move toward per-device identity rather than one shared username/password pair

## Future Paths

### A) Build-Time Generated `config.h`

- The setup console generates a per-device `config.h`
- The operator downloads it or pipes it into a local build tool
- Arduino flashing remains external, but copy-paste is reduced

This is the safest near-term bridge if browser flashing still feels too heavy.

### B) QR Or Pairing Token Provisioning

- The browser claims a device with a one-time token or QR code
- The device pulls just enough configuration to pair itself
- Shared static credentials become less central to onboarding

This is a better operator experience than manual copy-paste.

### C) AWS IoT Core Per-Device Certificates

- Each device receives its own credential set
- The registry tracks device identity and broker profile
- The browser no longer needs visibility into long-lived shared MQTT secrets

This is the right long-term security model for scale.
