# Production Deploy Checklist

## Vercel Environment Variables

Set these before enabling customer mode:

- `INTERNAL_TEST_MODE=false`
- `DISABLE_DATABASE=false`
- `DATABASE_URL`
- `AUTH_SECRET`
- `MQTT_HOST`
- `MQTT_PORT`
- `MQTT_USERNAME`
- `MQTT_PASSWORD`
- `ADMIN_TOKEN`
- `PUBLIC_APP_BASE_URL`
- `FIRMWARE_UPDATE_CHANNEL=stable`
- `ENABLE_EXPERIMENTAL_OTA_UI=false`

Optional:

- `ADMIN_EMAILS`

## Neon Database

Run these before customer launch:

```powershell
cd apps/web
npm run db:generate
npm run db:migrate
npm run db:seed
```

## Admin Account

1. Set `ADMIN_EMAILS` to the email that should receive admin access.
2. Create that account through `/login`.
3. Confirm admin-only pages open:
   - `/setup`
   - `/flash`
   - `/firmware/releases`
   - `/admin/claims`

## Claim-Code Test

1. Create a claim code from `/admin/claims`.
2. Sign in as a customer account.
3. Redeem the claim at `/claim`.
4. Confirm the device appears on `/devices`.
5. Confirm `/connect?deviceId=...` loads only for the owned device.

## Simulator Test

1. Run the web app with production-like env.
2. Start the simulator against the same broker.
3. Confirm `/connect`, `/devices`, `/firmware`, and `/api/health` all behave correctly.

## Real Device Safe Calibration Test

1. Keep `SAFE_SETUP_MODE=true` in firmware.
2. Keep OTA disabled on the installed device.
3. Open `/connect`.
4. Confirm the device is online.
5. Run safe calibration first.
6. Confirm STOP is visible before any larger movement.
7. Only test larger movement after calibration is complete.

## Final Health Check

Open `/api/health` and confirm:

- `runtimeMode` is `customer`
- `productionConfigReady` is `true`
- `missingProductionConfig` is empty
- `customerModeBlockedReason` is `null`
- `mqttConfigured` is `true`
- `databaseMode` is `configured`
- `deviceRegistryAvailable` is `true`
- `firmwareReleaseConfigured` matches your rollout plan
