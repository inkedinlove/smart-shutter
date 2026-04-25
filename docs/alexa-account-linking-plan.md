# Alexa Account Linking Plan

This document describes the path from the current Alexa scaffold to real account-linked Smart Home control.

## OAuth Requirement

Alexa Smart Home skills require account linking so Amazon can associate an Alexa customer with the Smart Shutter customer account.

That means Smart Shutter needs:

- an OAuth 2.0 authorization flow
- token exchange between Alexa and Smart Shutter
- a durable mapping from Alexa-linked customer identity to the Smart Shutter customer profile

## Customer Sign-In

The customer must sign in to Smart Shutter during account linking.

Expected flow:

1. Customer enables the Alexa skill
2. Alexa opens Smart Shutter account-linking UI
3. Customer signs in
4. Smart Shutter authorizes Alexa access for that customer
5. Alexa receives access credentials tied to that customer

## Token Exchange

The production skill will need:

- client ID
- client secret
- authorization endpoint
- token endpoint

Alexa will exchange credentials for an access token that Smart Shutter can map to a customer session or profile.

## Alexa Access Token To Smart Shutter Customer

Once linked, each Alexa request must resolve to one Smart Shutter customer profile.

That profile is the same ownership boundary already used by:

- `/devices`
- `/connect`
- live status
- device commands

Discovery must return only owned devices for that linked customer.

## Endpoint Discovery From Owned Devices

When Alexa requests discovery:

- Smart Shutter verifies the linked customer
- loads only devices owned by that customer
- maps those devices to Alexa endpoints

No global device registry access should be used for customer discovery.

## Revocation And Disconnect

The platform should track link lifecycle so a customer can disconnect Alexa later.

The `VoiceIntegrationAccount` model is the current scaffold for that:

- `provider`
- `status`
- `linkedAt`
- `revokedAt`

This gives the app a place to track:

- not connected
- linked
- revoked

## Certification Considerations

Before a real Alexa launch, Smart Shutter still needs:

- production OAuth account linking
- public Alexa endpoint hosting
- robust state reporting
- endpoint health reporting
- account unlinking handling
- privacy/security review
- certification validation for blinds/shades

## Current Scaffold

This repo now has:

- Alexa Smart Home architecture docs
- directive mapping helper
- placeholder Smart Home API route
- `VoiceIntegrationAccount` persistence model
- `/profile` voice integration status

It does not yet have:

- live OAuth account linking
- public Alexa skill enablement
- real MQTT publish from Alexa
