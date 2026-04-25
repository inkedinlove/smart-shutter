# Alexa Certification Checklist

Use this checklist before moving from scaffold to a real Alexa Smart Home submission.

## Discovery

- discovery returns only owned devices
- endpoints use the correct blind/shade category
- endpoint capabilities match the actual product behavior

## State Reporting

- Alexa can request current device state
- reported position matches Smart Shutter percent state
- reported connectivity matches real device health

## Endpoint Health

- offline devices report unreachable status
- health state is accurate when Wi-Fi or cloud connectivity is lost

## Percentage Control

- open maps correctly to 100
- close maps correctly to 0
- partial position commands map correctly
- position responses reflect the resulting state

## Safety Denials

- Alexa denies unsafe movement during safety mode
- Alexa denies full movement when calibration is incomplete
- Alexa denies control when the device is offline
- Alexa denies control for unowned devices

## Account Unlinking

- customer can disconnect Alexa
- revoked links are tracked
- revoked links no longer discover or control devices

## Privacy And Security

- browser never sees MQTT credentials
- Alexa endpoints use customer ownership checks
- no global device discovery for customer requests
- no MQTT secrets in Alexa payloads
- logs avoid leaking private credentials or tokens
