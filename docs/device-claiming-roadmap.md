# Device Claiming Roadmap

## Stage 1: Internal Ownership

- Keep a seeded internal profile for simulator and local testing
- Preserve fallback registry access only in internal test mode

## Stage 2: Customer Claim Codes

This stage is now implemented:

- `POST /api/devices/claims/create` creates a time-limited claim code
- `POST /api/devices/claims/redeem` redeems that code into the signed-in customer profile
- `/admin/claims` is the internal claim-code creation page
- `/claim` is the customer claim redemption page
- claim creation now also returns a customer claim URL
- `/claim?code=ABCD-EFGH` pre-fills the claim code from the link
- the claim URL can be turned into a QR code without exposing secrets

Current limits:

- claim creation still requires admin access
- customer sign-in currently uses credentials auth only
- QR output is still a claim-link handoff, not a full factory pairing flow

## Stage 3: QR Code On Device

- Print or attach a QR code to the device or packaging
- Customer scans the QR and opens the claim link directly
- Customer signs in, claims the device, and moves into Wi-Fi setup
- Device setup then continues through factory firmware and captive portal

## Stage 4: Authenticated Accounts

- Expand beyond credentials-only login
- Add account management and recovery flows
- Support multiple customer profiles cleanly

## Stage 5: Device Factory Provisioning

- Register device identity before shipment
- Preload device metadata in the platform
- Claim into an account after first install
