# Production Environment Template

Use placeholder values only. Do not commit real secrets.

```dotenv
INTERNAL_TEST_MODE=false
DISABLE_DATABASE=false

DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
AUTH_SECRET=replace-with-long-random-secret

MQTT_HOST=your-cluster.s1.eu.hivemq.cloud
MQTT_PORT=8883
MQTT_USERNAME=replace-with-mqtt-username
MQTT_PASSWORD=replace-with-mqtt-password

ADMIN_TOKEN=replace-with-admin-token
ADMIN_EMAILS=admin@example.com

PUBLIC_APP_BASE_URL=https://your-production-domain.example
FIRMWARE_UPDATE_CHANNEL=stable
ENABLE_EXPERIMENTAL_OTA_UI=false
```

Optional notes:

- Keep `INTERNAL_TEST_MODE=false` in customer production mode.
- Keep `DISABLE_DATABASE=false` in customer production mode.
- Set `PUBLIC_APP_BASE_URL` to the real deployed HTTPS origin.
