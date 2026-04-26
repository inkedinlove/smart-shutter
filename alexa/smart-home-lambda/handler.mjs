export const handler = async (event) => {
  const upstreamUrl = process.env.SMART_SHUTTER_ALEXA_ENDPOINT?.trim();

  if (!upstreamUrl) {
    console.error("Missing SMART_SHUTTER_ALEXA_ENDPOINT.");
    return {
      event: {
        header: {
          namespace: "Alexa",
          name: "ErrorResponse",
          payloadVersion: "3",
          messageId: crypto.randomUUID(),
        },
        payload: {
          type: "INTERNAL_ERROR",
          message: "Alexa bridge is not configured.",
        },
      },
    };
  }

  let response;

  try {
    response = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    });
  } catch (error) {
    console.error("Unable to reach Smart Shutter Alexa endpoint.", error);
    return {
      event: {
        header: {
          namespace: "Alexa",
          name: "ErrorResponse",
          payloadVersion: "3",
          messageId: crypto.randomUUID(),
        },
        payload: {
          type: "INTERNAL_ERROR",
          message: "Smart Shutter Alexa bridge could not reach the web endpoint.",
        },
      },
    };
  }

  const responseText = await response.text();

  try {
    return JSON.parse(responseText);
  } catch (error) {
    console.error("Alexa bridge received invalid JSON.", {
      status: response.status,
      responseText,
      error,
    });

    return {
      event: {
        header: {
          namespace: "Alexa",
          name: "ErrorResponse",
          payloadVersion: "3",
          messageId: crypto.randomUUID(),
        },
        payload: {
          type: "INTERNAL_ERROR",
          message: "Smart Shutter Alexa bridge received an invalid response.",
        },
      },
    };
  }
};
