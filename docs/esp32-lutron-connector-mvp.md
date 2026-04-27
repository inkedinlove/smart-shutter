# ESP32 Lutron Connector MVP

This document defines the first realistic Smart Shutter interoperability path
for Lutron systems without requiring an extra Smart Shutter bridge appliance.

The core idea is:

- one installed Smart Shutter `ESP32` device in a home can be designated as the
  `Lutron Connector`
- that device becomes the local integration peer for a Lutron processor
- it translates selected Lutron events into Smart Shutter commands for the rest
  of the Smart Shutter devices in that home

This is an internal planning document, not a product promise.

## Why This Path

This is the first Lutron path that appears both technically plausible and
commercially useful.

What we want:

- no extra Smart Shutter bridge hardware
- a stronger value proposition for existing Lutron customers
- a story that feels credible to Lutron-friendly installers
- local interoperability that does not depend on a cloud round trip for core
  actions

What we do not want:

- spoofing a native Lutron shade in the Caseta app
- adding a Raspberry Pi or custom Smart Shutter gateway as a required box
- putting Lutron integration complexity on every Smart Shutter device in a home

## Current External Assumptions

Based on the Lutron materials reviewed on April 27, 2026:

- LEAP is the modern third-party integration protocol for Lutron systems
- LEAP uses local pairing, certificate-based authentication, and TLS
- RadioRA 3 and HomeWorks integrations are oriented around local network peers
- Lutron documents emphasize local network requirements including mDNS and
  multicast behavior

Relevant references:

- https://support.lutron.com/us/en/product/radiora3/article/networking/Lutron-s-LEAP-API-Integration-Protocol
- https://support.lutron.com/us/en/product/homeworks/article/networking/Lutron-s-LEAP-API-Integration-Protocol
- https://support.lutron.com/us/en/product/radiora3/article/networking/What-are-the-Network-Requirements-for-Caseta-and-RA2-Select

These assumptions need to be validated with a real processor before any
customer-facing commitment.

## Goal

Deliver an internal MVP that proves Smart Shutter can interoperate with a
Lutron system using only:

- an existing Lutron processor or hub
- existing Smart Shutter ESP32 hardware
- the Smart Shutter web app

The MVP should support:

- pairing one Smart Shutter ESP32 device to a Lutron system
- discovering or selecting a subset of useful Lutron events
- mapping those events to Smart Shutter actions
- reliably relaying those actions to other Smart Shutter devices in the same
  home

## Non-Goals

The MVP does not attempt to:

- make Smart Shutter appear in the standard Lutron consumer app
- support Caseta as a guaranteed first target
- support every Smart Shutter device as a Lutron integration peer
- expose a public customer-facing feature immediately
- mirror every possible Lutron state back into Lutron
- solve full installer certification or partnership requirements

## Target Systems

Priority order:

1. `RadioRA 3`
2. `HomeWorks`, if the same connector architecture applies cleanly
3. `Caseta`, only if a viable path is discovered later

Recommendation:

- plan the MVP around `RadioRA 3`
- do not design the first version around Caseta assumptions

## Deployment Model

One Smart Shutter `ESP32` per home is marked as the `Lutron Connector`.

That device:

- stays on the same LAN as the Lutron processor
- performs LEAP pairing and stores connector credentials
- subscribes to selected Lutron events
- publishes Smart Shutter commands to the other Smart Shutter devices

All other Smart Shutter devices:

- remain regular shutter controllers
- do not speak LEAP directly
- continue to use the existing Smart Shutter command/status contract

This gives us:

- one local integration point per home
- no additional required Smart Shutter hardware
- a simpler support and recovery story

## High-Level Architecture

1. Admin or installer selects one ESP32 Smart Shutter device as the connector.
2. The Smart Shutter web app creates a Lutron connector profile for that home.
3. The connector ESP32 enters `Lutron pairing mode`.
4. The installer completes the local pairing sequence with the Lutron
   processor.
5. The connector receives and stores the required local certificates and
   integration metadata.
6. The Smart Shutter app allows the installer to map Lutron events to Smart
   Shutter actions.
7. At runtime:
   - Lutron event arrives locally on the connector
   - connector resolves the matching Smart Shutter mapping
   - connector publishes or relays the corresponding Smart Shutter action
   - target Smart Shutter devices move normally through the existing command
     pipeline

## Runtime Topology

- `Lutron processor <-> designated Smart Shutter ESP32 connector`
- `ESP32 connector <-> Smart Shutter MQTT / local command fabric`
- `Smart Shutter app <-> cloud-side mapping/configuration/monitoring`

Two possible relay paths should be evaluated:

### Option A: Connector publishes over existing MQTT

Pros:

- reuses the existing command format
- minimal downstream device change
- easier to reason about across mixed board types

Cons:

- local Lutron event still depends on cloud broker reachability
- less attractive for strict local-control narratives

### Option B: Connector relays on the LAN directly

Pros:

- stronger local-control story
- lower latency
- less broker dependency for Lutron-triggered actions

Cons:

- new local protocol work
- more firmware complexity
- more failure and discovery logic

Recommendation for MVP:

- start with `Option A`
- prove the Lutron-side integration first
- consider `Option B` only after the first path is stable

## Pairing Flow

Expected pairing shape:

1. Installer opens `/admin/integrations/lutron` or equivalent internal setup UI.
2. Installer selects:
   - home
   - Smart Shutter connector device
   - Lutron system type
3. App tells the connector to enter pairing mode.
4. Installer performs the required on-site local pairing action with the Lutron
   processor.
5. Connector stores:
   - paired processor identity
   - local certificate material or equivalent trust assets
   - connector state
6. App verifies a healthy local subscription/session.

Important:

- the exact on-site steps are not final until we test with real Lutron hardware
- do not promise remote-only setup until it is proven

## Mapping Model

The connector needs a small, explicit mapping table.

### Lutron Event Inputs

Expected MVP inputs:

- keypad button pressed
- scene activated
- phantom or virtual event if available
- possibly shade group open/close or raise/lower triggers later

### Smart Shutter Outputs

Expected MVP outputs:

- `OPEN`
- `CLOSE`
- `STOP`
- `SET_PERCENT`
- `SET_PRESET`
- `GROUP_SET_PERCENT`

### Example Mapping

- `Movie Scene Activated -> Close living-room shutters to 100%`
- `Morning Keypad Button -> Open east shutters to 30%`
- `All Off Scene -> Close first-floor shutters to 0%`

## Data Model Additions

Probable database additions:

### `HomeIntegration`

- `id`
- `profileId` or home/account scope
- `provider` = `lutron`
- `status`
- `systemType` = `radiora3`, `homeworks`, later others
- `pairedAt`
- `lastHealthyAt`
- `connectorDeviceId`

### `HomeIntegrationCredential`

- encrypted credential blob or references
- certificate metadata
- processor identifier
- key rotation timestamps

### `HomeIntegrationMapping`

- `integrationId`
- `sourceType`
- `sourceId`
- `sourceLabel`
- `targetDeviceId` or `targetGroupId`
- `actionType`
- `actionValue`
- `enabled`

### `HomeIntegrationEvent`

- audit and diagnostics
- source event
- mapped action
- result
- failure detail
- created timestamp

## Firmware Responsibilities

The connector-capable ESP32 firmware needs:

- connector role flag
- local network discovery and/or configured processor address support
- certificate storage and reload support
- LEAP session management
- event subscription handling
- mapping pull or cache refresh
- action relay to Smart Shutter devices
- health reporting back to the cloud app

Recommendation:

- do not merge Lutron logic into every ESP32 target immediately
- isolate connector-specific logic behind compile-time or role-based gates

## Web App Responsibilities

The web app should own:

- connector role assignment
- mapping authoring
- diagnostic views
- event history
- onboarding instructions
- failure guidance and reset flows

Suggested UI surfaces:

- `/admin/integrations`
- `/admin/integrations/lutron`
- a per-device indicator showing whether a device is:
  - normal device
  - connector candidate
  - active connector

## Security Boundaries

Must-have security expectations:

- Lutron connector credentials are stored encrypted
- connector role can only be assigned by admin
- pairing mode is time-limited
- app logs never print raw secrets or certificates
- mapping changes are audited
- connector-to-cloud health reporting is authenticated

Open question:

- whether credential storage belongs only on the connector or also in the cloud
  in encrypted form for recovery

Recommendation:

- store the minimum recoverable metadata in the cloud
- keep the active local trust material primarily on the connector

## Failure Modes

The MVP must define behavior for:

- connector device offline
- Lutron processor unreachable
- connector loses pairing or certificate validity
- cloud MQTT unavailable while Lutron events still arrive
- mapping references a deleted Smart Shutter device
- multiple connectors accidentally assigned in one home

Minimum safe behavior:

- fail closed
- do not send random fallback commands
- surface health clearly in the app

## Success Criteria

The MVP is successful if we can prove:

1. One ESP32 device can pair locally to a RadioRA 3 system.
2. That device can receive at least one useful Lutron event reliably.
3. That event can trigger one or more Smart Shutter movements consistently.
4. The connector recovers cleanly after reboot.
5. The installer-facing setup can be documented without guesswork.

## Engineering Stages

### Stage 0: Feasibility Spike

- obtain or borrow a real RadioRA 3 environment
- prove local pairing from ESP32-side code or a thin prototype
- measure memory, certificate, and connection overhead

Deliverable:

- internal feasibility note with hard pass/fail findings

### Stage 1: Connector Firmware Prototype

- designate one ESP32 as connector
- connect to one Lutron processor
- receive one event class
- relay one Smart Shutter command over existing MQTT

Deliverable:

- bench demo with one Lutron event moving one Smart Shutter target

### Stage 2: Internal Admin UI

- assign connector device
- view connector health
- define one or two mappings
- inspect event logs

Deliverable:

- internal-only setup flow usable by the team

### Stage 3: Recovery and Diagnostics

- re-pair
- reset connector role
- detect stale credentials
- expose useful support logs

Deliverable:

- supportable internal alpha

### Stage 4: Installer-Facing Beta

- controlled pilot in one or two real homes
- tighten setup copy
- validate reliability and support burden

Deliverable:

- go/no-go decision for broader investment

## Risks

Top technical risks:

- LEAP pairing from embedded firmware is harder than expected
- certificate storage and TLS handling on ESP32 are heavier than expected
- processor discovery or event subscription details require tooling that is
  awkward on embedded hardware
- cloud-MQTT relay path undermines the local-control story

Top product risks:

- too much on-site friction
- too much installer training requirement
- unclear support boundaries between Smart Shutter and Lutron
- customers assume deeper native Lutron app support than we actually provide

## Recommendation

Proceed only if Stage 0 proves the connector concept on real hardware.

If Stage 0 fails, fallback options are:

- keep Smart Shutter aligned with Alexa, Google, and Apple ecosystems
- revisit a software-only local connector on existing customer infrastructure
- avoid promising direct Lutron interoperability

If Stage 0 succeeds, continue with:

- one connector per home
- RadioRA 3 first
- MQTT relay first
- internal admin UI second

That is the most obtainable version of Lutron interoperability that still fits
the current Smart Shutter direction.
