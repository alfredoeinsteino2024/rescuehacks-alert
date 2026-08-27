// Local test for the WhatsApp alert path — run BEFORE deploying.
// Loads .env via Node's native --env-file flag (Node 20.6+, no dependency needed).

const { sendWhatsAppAlert } = require("../../functions/ussd-handler/whatsappNotify");

async function run() {
  console.log("Sending test WhatsApp alert...");
  try {
    const result = await sendWhatsAppAlert({
      type: "Safety Threat",
      callerPhone: "2348000000000", // fake test caller number
      timestamp: new Date().toISOString(),
    });
    console.log("SUCCESS:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("FAILED:", err.message);
  }
}

run();