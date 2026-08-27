let config;
try {
  config = require("/opt/nodejs/config");
} catch {
  config = require("../../layers/shared/nodejs/config");
}

const TEMPLATE_NAME = "rescuehacks_emergency_alert";
const TEMPLATE_LANG = "en_US";

// Retries a fetch once on network-level failure (e.g. stale Lambda socket).
// Does NOT retry on a normal HTTP error response (e.g. 404, 401) — only on
// actual connection failures, since those are the transient ones.
async function fetchWithRetry(url, options, retries = 1) {
  try {
    return await fetch(url, options);
  } catch (err) {
    if (retries > 0) {
      console.warn("Fetch failed, retrying once:", err.message);
      return fetchWithRetry(url, options, retries - 1);
    }
    throw err;
  }
}

async function sendWhatsAppAlert({ type, callerPhone, timestamp }) {
  const { token, phoneNumberId, apiVersion } = config.whatsapp;
  const to = config.emergencyContact;

  if (!token || !phoneNumberId || !to) {
    throw new Error("WhatsApp config incomplete — check environment variables");
  }

  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const templateBody = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: TEMPLATE_NAME,
      language: { code: TEMPLATE_LANG },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: type },
            { type: "text", text: callerPhone },
            { type: "text", text: timestamp },
          ],
        },
      ],
    },
  };

  try {
    const response = await fetchWithRetry(url, {
      method: "POST",
      headers,
      body: JSON.stringify(templateBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Template send failed (${response.status}): ${errText}`);
    }

    return await response.json();
  } catch (templateErr) {
    console.warn("Template send failed, falling back to plain text:", templateErr.message);

    const textBody = {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: {
        body:
          `EMERGENCY ALERT\n` +
          `Type: ${type}\n` +
          `From: ${callerPhone}\n` +
          `Time: ${timestamp}\n\n` +
          `This is an automated alert. Please try to reach them immediately.`,
      },
    };

    const fallbackResponse = await fetchWithRetry(url, {
      method: "POST",
      headers,
      body: JSON.stringify(textBody),
    });

    if (!fallbackResponse.ok) {
      const errText = await fallbackResponse.text();
      throw new Error(`Both template and text send failed: ${errText}`);
    }

    return await fallbackResponse.json();
  }
}

module.exports = { sendWhatsAppAlert };