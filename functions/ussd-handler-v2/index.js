// Phase 2.0 — general public emergency reporting.
//
// Unlike functions/ussd-handler (Phase 1, discreet), this flow is visible
// by design: a menu, a description prompt, a location prompt, and a
// confirmation with a reference ID. It exists for general reporting where
// discretion isn't the point — speed and information quality are.
//
// Africa's Talking session convention: `text` accumulates every input the
// caller has made this session, joined by "*". Session depth = number of
// "*"-separated parts. A "CON " prefix keeps the session open for another
// prompt; "END " closes it.

let config;
try {
  config = require("/opt/nodejs/config");
} catch {
  config = require("../../layers/shared/nodejs/config");
}
let sendWhatsAppAlert, classify, recordIncident;
try {
  sendWhatsAppAlert = require("/opt/nodejs/whatsappNotify").sendWhatsAppAlert;
  classify = require("/opt/nodejs/aiClassifier").classify;
  recordIncident = require("/opt/nodejs/incidentService").recordIncident;
} catch {
  sendWhatsAppAlert = require("../../layers/shared/nodejs/whatsappNotify").sendWhatsAppAlert;
  classify = require("../../layers/shared/nodejs/aiClassifier").classify;
  recordIncident = require("../../layers/shared/nodejs/incidentService").recordIncident;
}

function menuPrompt() {
  return (
    "CON Welcome to RescueHacks\n" +
    "Report an emergency:\n" +
    "1. Medical\n" +
    "2. Fire\n" +
    "3. Accident\n" +
    "4. Crime/Security\n" +
    "5. Other"
  );
}

exports.handler = async (event) => {
  try {
    const params = new URLSearchParams(event.body);
    const phoneNumber = params.get("phoneNumber");
    const text = (params.get("text") || "").trim();

    // Session depth, per the AT convention described above. An empty
    // string means "just dialed, nothing entered yet" (0 parts), which
    // split("*") would otherwise report as 1 — handled explicitly.
    const parts = text === "" ? [] : text.split("*");

    if (parts.length === 0) {
      return respond(menuPrompt());
    }

    if (parts.length === 1) {
      const choice = parts[0];
      if (!config.emergencyTypesV2[choice]) {
        return respond("END Invalid selection. Please dial again and choose 1-5.");
      }
      return respond("CON Briefly describe the emergency:");
    }

    if (parts.length === 2) {
      return respond("CON Enter your location (area/landmark):");
    }

    if (parts.length === 3) {
      const [choice, description, location] = parts;
      const emergencyType = config.emergencyTypesV2[choice];

      if (!emergencyType || !description.trim()) {
        return respond("END Invalid input. Please dial again.");
      }

      console.log("USSD_V2_REQUEST_RECEIVED", { emergencyType });

      const aiAnalysis = await classify(description.trim());
      console.log(
        aiAnalysis.source === "AI" ? "AI_ANALYSIS_COMPLETED" : "FALLBACK_CLASSIFIER_USED",
        { category: aiAnalysis.category, severity: aiAnalysis.severity }
      );

      let notification;
      try {
        // Richer context (description, AI summary, location) lives on the
        // incident record / dashboard, not in the WhatsApp message itself —
        // the existing approved Meta template has 3 fixed parameter slots,
        // and getting a new richer template approved isn't something that
        // can be relied on inside a hackathon deadline. The ping says
        // enough to make a responder open the dashboard.
        const result = await sendWhatsAppAlert({
          type: `${aiAnalysis.category} (${aiAnalysis.severity})`,
          callerPhone: phoneNumber,
          timestamp: new Date().toISOString(),
        });
        notification = { whatsapp: result.method === "template" ? "SENT" : "SENT_FALLBACK" };
        console.log("WHATSAPP_NOTIFICATION_SENT", { method: result.method });
      } catch (err) {
        notification = { whatsapp: "FAILED" };
        console.error("WHATSAPP_NOTIFICATION_FAILED", err.message);
      }

      let incident;
      try {
        incident = await recordIncident({
          source: "USSD_V2",
          reporterPhone: phoneNumber,
          emergencyType,
          notification,
          description: description.trim(),
          location: location.trim(),
          aiAnalysis,
        });
        console.log("INCIDENT_RECORDED", { id: incident.id, priority: incident.priority });
      } catch (err) {
        console.error("INCIDENT_PERSISTENCE_FAILED", err.message);
      }

      // Unlike Phase 1, showing a reference and confirming receipt is the
      // whole point here — this flow has no discretion requirement.
      const reference = incident ? incident.id : "UNAVAILABLE";
      return respond(
        `END Emergency report received.\nReference: ${reference}\nHelp is being coordinated.`
      );
    }

    // More than 3 parts — shouldn't happen via normal use, fail safe.
    return respond("END Session error. Please dial again.");
  } catch (err) {
    console.error("ussd-handler-v2 error:", err);
    return respond("END Something went wrong. Please try again.");
  }
};

function respond(body) {
  return { statusCode: 200, headers: { "Content-Type": "text/plain" }, body };
}
