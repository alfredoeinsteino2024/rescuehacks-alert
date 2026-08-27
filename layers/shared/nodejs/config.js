// Central config — no secrets hardcoded here, pulled from environment variables.
// Set these in your Lambda environment (or .env for local testing).

module.exports = {
  // WhatsApp Cloud API (Meta) config
  whatsapp: {
    token: process.env.WHATSAPP_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    apiVersion: "v20.0",
  },

  // Hardcoded emergency contact for the hackathon demo.
  // TODO (post-hackathon): replace with per-user contact lookup (see NEXT-STEPS.md)
  emergencyContact: process.env.EMERGENCY_CONTACT_NUMBER, // e.g. "2348012345678"

  // Emergency type map — keeps ussd-handler free of magic strings
  emergencyTypes: {
    "1": "Medical Emergency",
    "2": "Safety Threat",
    "3": "Accident",
    "4": "Disaster (Fire/Flood)",
  },

  // Deliberately boring END message — must not reveal an alert was sent
  ussdCoverMessage: "END Service temporarily unavailable.",
};