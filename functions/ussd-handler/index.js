let config;
try {
  config = require("/opt/nodejs/config");
} catch {
  config = require("../../layers/shared/nodejs/config");
}
let sendWhatsAppAlert, recordIncident;
try {
  sendWhatsAppAlert = require("/opt/nodejs/whatsappNotify").sendWhatsAppAlert;
  recordIncident = require("/opt/nodejs/incidentService").recordIncident;
} catch {
  sendWhatsAppAlert = require("../../layers/shared/nodejs/whatsappNotify").sendWhatsAppAlert;
  recordIncident = require("../../layers/shared/nodejs/incidentService").recordIncident;
}

// IMPORTANT: nothing below this point may change what the caller sees.
// The response body is `config.ussdCoverMessage` in every branch — success,
// partial failure, or total failure — because a visible difference is
// exactly the pattern this system exists to avoid creating. Persistence and
// priority scoring are backend-only side effects; they must never be able
// to alter, delay past a reasonable timeout, or leak into the USSD response.

exports.handler = async (event) => {
  try {
    const params = new URLSearchParams(event.body);
    const phoneNumber = params.get("phoneNumber");
    const text = (params.get("text") || "").trim();

    const emergencyType = config.emergencyTypes[text];

    if (emergencyType && phoneNumber) {
      console.log("USSD_REQUEST_RECEIVED", { emergencyType });

      // Awaited (not fire-and-forget) — Lambda freezes the execution
      // environment as soon as we return, so background work after
      // the response is NOT guaranteed to complete. Must await here.
      let notification;
      try {
        const result = await sendWhatsAppAlert({
          type: emergencyType,
          callerPhone: phoneNumber,
          timestamp: new Date().toISOString(),
        });
        notification = { whatsapp: result.method === "template" ? "SENT" : "SENT_FALLBACK" };
        console.log("WHATSAPP_NOTIFICATION_SENT", { method: result.method });
      } catch (err) {
        notification = { whatsapp: "FAILED" };
        console.error("WHATSAPP_NOTIFICATION_FAILED", err.message);
      }

      // Persistence happens AFTER the alert attempt, and is itself
      // best-effort: a DB outage must never be allowed to block or fail
      // the alert path above, which is the one part of this system that
      // actually has to work. See NEXT-STEPS.md / README for the tradeoff.
      try {
        const incident = await recordIncident({
          source: "USSD",
          reporterPhone: phoneNumber,
          emergencyType,
          notification,
        });
        console.log("INCIDENT_RECORDED", {
          id: incident.id,
          redialCount: incident.redialCount,
          priority: incident.priority,
        });
      } catch (err) {
        console.error("INCIDENT_PERSISTENCE_FAILED", err.message);
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