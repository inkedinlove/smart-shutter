# Alexa Lambda Bridge

Alexa Smart Home skills are configured in the Alexa developer console with an
AWS Lambda ARN for the smart home service endpoint. Smart Shutter's account
linking and smart-home logic can still stay in the Next.js app by using a tiny
Lambda bridge that forwards directives to the deployed web endpoint.

Bridge handler:

- [alexa/smart-home-lambda/handler.mjs](../alexa/smart-home-lambda/handler.mjs)

Required Lambda environment variable:

```text
SMART_SHUTTER_ALEXA_ENDPOINT=https://your-app.example.com/api/integrations/alexa/smart-home
```

Recommended first-pass test flow:

1. Create a Lambda function in AWS with runtime `Node.js 20.x`.
2. Paste `handler.mjs` into the Lambda code editor, or zip and upload it.
3. Set the handler name to `handler.handler`.
4. Add `SMART_SHUTTER_ALEXA_ENDPOINT` as an environment variable.
5. Copy the Lambda ARN.
6. Paste that ARN into the Alexa developer console smart home endpoint field.
7. Keep account linking pointed at the deployed Smart Shutter app:
   - Authorization URI: `/api/integrations/alexa/authorize`
   - Token URI: `/api/integrations/alexa/token`
8. Enable the skill in the Alexa app and link the Smart Shutter account.
9. Discover devices and test commands.

This bridge is intentionally small for the first live test. A later production
pass can move the smart-home handler fully into Lambda if needed.
