# RescueHacks

**An AI-assisted, low-connectivity emergency-response platform: report an emergency by USSD, no smartphone or mobile internet required, routed through AI classification, a priority engine, and a responder dashboard.**

Built by Fadipe Toluwanimi Alfred ([ChainEngineers](https://github.com/alfredoeinsteino2024)).

This repo contains **two distinct USSD flows that share the same backend**, plus a responder dashboard:

- **Phase 1 — discreet silent alert.** No menu, no confirmation, no description collected. For situations where visibility itself is dangerous (e.g. a threatening presence nearby). Originally built for the [RescueHacks hackathon](https://rescuehacks.devpost.com/).
- **Phase 2.0 — general emergency reporting.** A visible menu, free-text description, location, AI classification, and a confirmation with a reference ID. For everything else, where speed and information quality matter more than discretion.

Both write to the same DynamoDB table and the same responder dashboard — a physical panic-button device, when built, would be a third input into this same pipeline (see `NEXT-STEPS.md`).

---

## Phase 1: Discreet Silent Alert

No one glancing at the phone can tell the difference between checking an airtime balance and silently calling for help.

| Code | Emergency Type |
|---|---|
| `*384*23492*1#` | Medical Emergency |
| `*384*23492*2#` | Safety Threat |
| `*384*23492*3#` | Accident |
| `*384*23492*4#` | Disaster (Fire/Flood) |

Every response — success or failure — is the identical `"Service temporarily unavailable."` A WhatsApp alert still fires to a pre-registered contact in the background. No free text is ever collected, so there's nothing for AI to classify here — the type *is* the dialed digit. Priority is assigned by deterministic rule (`priorityEngine.js`), pinned high-by-default since no further information will ever arrive to refine it.

## Phase 2.0: General Emergency Reporting

```
CON Welcome to RescueHacks
Report an emergency:
1. Medical   2. Fire   3. Accident   4. Crime/Security   5. Other
   → CON Briefly describe the emergency:
       → CON Enter your location (area/landmark):
           → AI classifies the description → priority assigned → incident stored
             → WhatsApp alert sent → END "Reference: RH-2026-XXXXXX"
```

The free-text description is sent to Google's Gemini API (free tier) for category/severity/summary — validated against a strict schema, with a **deterministic keyword-based fallback** (`aiClassifier.js`) if the API call fails, times out, or returns something malformed. Classification never hard-fails the pipeline.

## Responder Dashboard (`dashboard/index.html`)

A static page (open directly in a browser, or host anywhere) showing active incidents, priority, and a lifecycle action per incident:

```
PENDING → ACCEPTED → EN_ROUTE → REACHED → RESOLVED
```

Transitions are validated server-side (`statusLifecycle.js`) — skipping a step (e.g. `PENDING → RESOLVED`) is rejected, not silently allowed. Enter the API Gateway URL and the dashboard key (both from deployment) into the two fields at the top to connect.

## Architecture

```
                    Phase 1 (discreet)          Phase 2.0 (general)
                 POST /ussd                   POST /ussd-v2
                       │                             │
                       │                       AI classification
                       │                      (+ deterministic fallback)
                       └──────────────┬──────────────┘
                                      ▼
                          incidentService.js
                     (priority, duplicate/redial detection,
                            DynamoDB persistence)
                                      │
                       ┌──────────────┼──────────────┐
                       ▼                              ▼
              WhatsApp alert                 GET/PATCH /api/incidents
              (Meta Cloud API)                (incidents-api → dashboard)
```

**Stack:** AWS SAM, AWS Lambda (Node.js 20.x), API Gateway, DynamoDB, SSM Parameter Store, Africa's Talking (USSD gateway), Meta WhatsApp Cloud API, Gemini API (gemini-3.1-flash-lite, free tier, Phase 2.0 classification only).

## Project Structure

```
rescuehacks-alert/
├── template.yaml
├── functions/
│   ├── ussd-handler/index.js       # Phase 1 — discreet
│   ├── ussd-handler-v2/index.js    # Phase 2.0 — general, AI-assisted
│   └── incidents-api/index.js      # GET/PATCH for the dashboard
├── layers/shared/nodejs/
│   ├── config.js
│   ├── whatsappNotify.js
│   ├── priorityEngine.js           # deterministic, both phases
│   ├── aiClassifier.js             # Phase 2.0 only — AI + fallback
│   ├── statusLifecycle.js          # validated status transitions
│   └── incidentService.js          # persistence, duplicate detection
├── dashboard/index.html            # responder dashboard (static)
├── tests/unit/
│   ├── test-whatsapp.js            # manual, live-credential test
│   ├── test-priority-engine.js     # automated (npm test)
│   ├── test-ai-fallback.js         # automated (npm test)
│   └── test-status-lifecycle.js    # automated (npm test)
└── NEXT-STEPS.md
```

## Setup & Deployment

**Prerequisites:** AWS account, AWS SAM CLI, Node.js 20.x, an Africa's Talking sandbox account (a second sandbox app for Phase 2.0's callback), a Meta WhatsApp Business app, a Gemini API key (free, aistudio.google.com).

1. Store secrets in SSM Parameter Store:
   ```
   aws ssm put-parameter --name "/rescuehacks/WHATSAPP_TOKEN" --value "<token>" --type String
   aws ssm put-parameter --name "/rescuehacks/WHATSAPP_PHONE_NUMBER_ID" --value "<id>" --type String
   aws ssm put-parameter --name "/rescuehacks/EMERGENCY_CONTACT_NUMBER" --value "<number>" --type String
   aws ssm put-parameter --name "/rescuehacks/GEMINI_API_KEY" --value "<key from aistudio.google.com>" --type String
   aws ssm put-parameter --name "/rescuehacks/DASHBOARD_API_KEY" --value "<any-strong-random-string>" --type String
   ```
2. Build and deploy:
   ```
   sam build
   sam deploy --stack-name rescuehacks-alert --region us-east-1 --resolve-s3 --capabilities CAPABILITY_IAM
   ```
3. Register `UssdEndpoint` as the Phase 1 callback, `UssdV2Endpoint` as the Phase 2.0 callback (a second AT sandbox app), and open `dashboard/index.html` with `DashboardApiBaseUrl` + the dashboard key you set above.

## Local Testing

```
node --env-file=.env tests\unit\test-whatsapp.js   # manual, hits real WhatsApp API
npm test                                            # automated: priority engine, AI fallback, status lifecycle
```

## Current Limitations

This is a hackathon prototype, not a deployed emergency service:
- WhatsApp and USSD integrations run on sandbox/test infrastructure
- Location in Phase 2.0 is caller-entered text, not GPS — no coordinates are ever fabricated
- Dashboard auth is a single shared secret, not per-responder identity or an audit trail
- No physical IoT device has been built — see `NEXT-STEPS.md` for the planned ESP32/GSM/GPS design and a software simulator as the next step
- AI classification is decision support for a human responder, not a medical diagnosis

## Safety & Responsible Design Note

This project is **not a replacement for official emergency services**, trained responders, or professional support. It's designed to make reporting and reaching a responder faster — not to replace calling official emergency services where available.

## Roadmap

See [`NEXT-STEPS.md`](./NEXT-STEPS.md), including the IoT device simulator and an AI-voice phone call escalation feature.

## License

MIT
