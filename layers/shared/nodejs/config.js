// Central config — no secrets hardcoded here, pulled from environment variables.
// Set these in your Lambda environment (or .env for local testing).

module.exports = {
  // "prod" unless STAGE is explicitly set — the existing production stack
  // never sets STAGE, so its behavior is byte-for-byte unchanged by this.
  stage: process.env.STAGE || "prod",
  get isDev() {
    return this.stage !== "prod";
  },

  // WhatsApp Cloud API (Meta) config
  whatsapp: {
    token: process.env.WHATSAPP_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    apiVersion: "v20.0",
  },

  // Hardcoded emergency contact for the hackathon demo.
  // TODO (post-hackathon): replace with per-user contact lookup (see NEXT-STEPS.md)
  emergencyContact: process.env.EMERGENCY_CONTACT_NUMBER, // e.g. "2348012345678"

  // DynamoDB table for incident persistence. Backend-only — never surfaced
  // to the caller, since the USSD response must stay identical regardless
  // of whether persistence succeeds (see incidentService.js).
  incidentsTable: process.env.INCIDENTS_TABLE || "rescuehacks-incidents",

  // --- Phase 1: discreet silent-alert flow (functions/ussd-handler) ---
  // Type IS the dialed digit — no ambiguity, no AI needed to resolve it.
  emergencyTypes: {
    "1": "Medical Emergency",
    "2": "Safety Threat",
    "3": "Accident",
    "4": "Disaster (Fire/Flood)",
  },

  // Deliberately boring END message — must not reveal an alert was sent
  ussdCoverMessage: "END Service temporarily unavailable.",

  // --- Phase 2.0: general visible-menu flow (functions/ussd-handler-v2) ---
  // Different category set/labels than Phase 1 on purpose — this flow is a
  // distinct product (general public emergency reporting, not the discreet
  // threat-alert tool), and its categories match what the AI classifier
  // and the rest of the submission's documented data model use.
  emergencyTypesV2: {
    "1": "MEDICAL",
    "2": "FIRE",
    "3": "ACCIDENT",
    "4": "CRIME_SECURITY",
    "5": "OTHER",
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    // Stable, free-tier-eligible as of this writing. NOT gemini-2.5-flash —
    // that generation is scheduled for shutdown; verify at
    // ai.google.dev/gemini-api/docs/models before changing this.
    model: "gemini-3.1-flash-lite",
    timeoutMs: 6000, // must stay well under the Lambda/USSD session timeout
  },

  // Shared-secret header the dashboard sends on every request to
  // incidents-api. Deliberately simple (not a full auth system) — adequate
  // for a prototype demo, documented as a limitation, not hidden as if it
  // were production-grade auth.
  dashboardApiKey: process.env.DASHBOARD_API_KEY,
};
