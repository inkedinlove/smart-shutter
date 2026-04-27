# Provisioning Session Tracking

This document explains what Smart Shutter now records during internal device
setup, why it exists, and what we intentionally avoid storing.

## Goals

- Make setup work attributable instead of invisible.
- Give support and operations a recent activity trail for generated firmware
  packages and filled `config.h` downloads.
- Improve security posture without collecting unnecessary customer secrets.

## What Is Stored

Provisioning activity is stored in Prisma `ProvisioningSession` rows.

Each recorded session captures:

- device ID
- device label through the related device record
- artifact type (`package` or `config`)
- board type
- generated file name
- provisioning tracking code
- WiFi mode (`factory` or `preconfigured`)
- masked WiFi SSID hint when WiFi was preloaded
- creation timestamp
- expiration timestamp
- completion timestamp when the device later reaches claim completion
- admin session attribution when the action came from a signed-in admin account

## What Is Not Stored

These values are intentionally not written to the database:

- WiFi passwords
- raw MQTT passwords
- generated ZIP payload contents
- generated `config.h` contents

That keeps provisioning history useful for audit and support without turning the
database into a second secret store.

## Where It Appears

The internal `/setup` page now shows recent provisioning activity with:

- device
- artifact type
- tracking code
- WiFi mode
- actor
- status

This is intended for internal operators only.

## Session Lifecycle

Current provisioning lifecycle:

1. Admin downloads a filled `config.h`
   - status becomes `config_generated`
2. Admin downloads a ready-to-flash package
   - status becomes `package_generated`
3. Customer later redeems the device claim
   - open provisioning sessions for that device become `claimed`

This gives the company a simple “prepared -> claimed” trail without needing a
full manufacturing execution system.

## Auth Tracking Relationship

Smart Shutter uses JWT sessions for compatibility with the Credentials provider,
but it now mirrors active session records into the Prisma `Session` table. That
means we now track:

- linked auth methods in `Account`
- active tracked sessions in `Session`
- provisioning artifact generation in `ProvisioningSession`

Together, that gives us much better operational visibility than auth-only JWTs
with no database activity.

## Recommended Operator Practice

- Prefer `/setup` over ad hoc local edits so provisioning gets recorded.
- Treat tracking codes as internal reference values, not customer-facing claim
  codes.
- Share ready-to-flash packages only with the installer who needs them.
- Avoid copying WiFi passwords into tickets, chat, screenshots, or notes.
