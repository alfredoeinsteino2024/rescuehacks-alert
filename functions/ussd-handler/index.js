let config;
try {
  config = require("/opt/nodejs/config");
} catch {
  config = require("../../layers/shared/nodejs/config");
}
const { sendWhatsAppAlert } = require("./whatsappNotify");

exports.handler = async (event) => {
  try {
    const params = new URLSearchParams(event.body);
    const phoneNumber = params.get("phoneNumber");
    const text = (params.get("text") || "").trim();

    const emergencyType = config.emergencyTypes[text];

    if (emergencyType && phoneNumber) {
      // Awaited (not fire-and-forget) — Lambda freezes the execution
      // environment as soon as we return, so background work after
      // the response is NOT guaranteed to complete. Must await here.
      try {
        await sendWhatsAppAlert({
          type: emergencyType,
          callerPhone: phoneNumber,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        console.error("WhatsApp alert failed:", err);
      }
    } else {
      console.warn("USSD dialed with unrecognized/missing text:", text);
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "text/plain" },
      body: config.ussdCoverMessage,
    };
  } catch (err) {
    console.error("ussd-handler error:", err);
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/plain" },
      body: config.ussdCoverMessage,
    };
  }
};