let config;
try {
  config = require("/opt/nodejs/config");
} catch {
  config = require("./config");
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

  // Dev/staging stacks must never look identical to a real alert on the
  // receiving end — this is data injected into an approved template's
  // parameter slot, not a change to the template itself, so it needs no
  // re-approval from Meta.
  const displayType = config.isDev ? `[TEST — ${config.stage}] ${type}` : type;

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
            { type: "text", text: displayType },
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

    return { method: "template", data: await response.json() };
  } catch (templateErr) {
    console.warn("Template send failed, falling back to plain text:", templateErr.message);

    const textBody = {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: {
        body:
          `EMERGENCY ALERT\n` +
          `Type: ${displayType}\n` +
          `From: ${callerPhone}\n` +
          `Time: ${timestamp}\n\n` +
          (config.isDev
            ? `This is a TEST alert from the "${config.stage}" environment — not a real emergency.`
            : `This is an automated alert. Please try to reach them immediately.`),
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

    return { method: "fallback", data: await fallbackResponse.json() };
  }
}

module.exports = { sendWhatsAppAlert };