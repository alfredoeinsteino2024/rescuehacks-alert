# RescueHacks Alert

**A discreet USSD emergency alert system — no visible menu, no evidence on screen, just a silent signal for help.**

Built for [RescueHacks](https://rescuehacks.devpost.com/) by Fadipe Toluwanimi Alfred ([ChainEngineers](https://github.com/alfredoeinsteino2024)).

---

## The Problem

Most emergency apps assume the user has privacy and time to interact with a screen — open an app, tap through a menu, confirm a request. But in many real emergencies (an unsafe situation, a threatening presence nearby, a domestic safety concern), the person in danger doesn't have either. If a phone visibly shows a menu, an alert screen, or a "help is on the way" message, it can escalate the exact danger the person is trying to escape.

USSD is also uniquely suited to this problem in contexts like Nigeria: it works on any phone (no smartphone or data required), it's instant, and — critically for this use case — dialing a USSD code looks completely ordinary. No one glancing at a phone screen can tell the difference between someone checking their airtime balance and someone silently calling for help.

## How It Works

1. **Dial a code.** No menu ever appears. The emergency type is encoded directly in the digits dialed:

   | Code | Emergency Type |
   |---|---|
   | `*384*23492*1#` | Medical Emergency |
   | `*384*23492*2#` | Safety Threat |
   | `*384*23492*3#` | Accident |
   | `*384*23492*4#` | Disaster (Fire/Flood) |

2. **The screen shows nothing revealing.** Every response — successful or not — is an identical, neutral message: `"Service temporarily unavailable."` There is no visible difference between a successful alert and an invalid dial. This is intentional: any visible difference is a pattern a bystander could learn to recognize.

3. **A real alert fires silently in the background.** The system sends a WhatsApp message to a pre-registered emergency contact with the emergency type, the caller's phone number, and a timestamp — all within seconds, with no confirmation ever shown on the dialing phone.

## Architecture

```
Phone dials *384*23492*[1-4]#
        │
        ▼
Africa's Talking USSD Gateway
        │  (POST callback)
        ▼
AWS API Gateway → Lambda (ussd-handler)
        │
        ├─→ Parses emergency type from dialed digits
        ├─→ Sends WhatsApp alert (Meta Cloud API) — awaited before responding
        └─→ Returns neutral cover message to USSD session
```

**Stack:**
- AWS SAM (Infrastructure as Code)
- AWS Lambda (Node.js 20.x)
- API Gateway (USSD callback endpoint)
- AWS Systems Manager Parameter Store (config/secrets)
- Africa's Talking (USSD gateway)
- Meta WhatsApp Cloud API (alert delivery, with an approved Utility message template and a plain-text fallback)

## Project Structure

```
rescuehacks-alert/
├── template.yaml              # SAM infrastructure definition
├── functions/
│   └── ussd-handler/
│       ├── index.js           # USSD request handler — no menu, instant response
│       └── whatsappNotify.js  # WhatsApp alert sender (template + fallback)
├── layers/
│   └── shared/nodejs/
│       ├── at.js
│       └── config.js          # Shared config, emergency type mapping
├── tests/unit/
│   └── test-whatsapp.js       # Local WhatsApp send test
└── NEXT-STEPS.md              # Post-hackathon roadmap
```

## Setup & Deployment

**Prerequisites:** AWS account, AWS SAM CLI, Node.js 20.x, an Africa's Talking sandbox account, a Meta WhatsApp Business app.

1. Store secrets in SSM Parameter Store:
   ```
   aws ssm put-parameter --name "/rescuehacks/WHATSAPP_TOKEN" --value "<token>" --type String
   aws ssm put-parameter --name "/rescuehacks/WHATSAPP_PHONE_NUMBER_ID" --value "<id>" --type String
   aws ssm put-parameter --name "/rescuehacks/EMERGENCY_CONTACT_NUMBER" --value "<number>" --type String
   ```
2. Build and deploy:
   ```
   sam build
   sam deploy --stack-name rescuehacks-alert --region us-east-1 --resolve-s3 --capabilities CAPABILITY_IAM
   ```
3. Copy the `UssdEndpoint` output and register it as the callback URL for your Africa's Talking USSD channel.

## Local Testing

```
node --env-file=.env tests\unit\test-whatsapp.js
```

## Safety & Responsible Design Note

This project is a prototype built for a hackathon. It is **not a replacement for emergency services, trained responders, or professional support**. It's designed to make reaching a trusted contact faster and more discreet — not to replace calling official emergency services where available.

## Roadmap

See [`NEXT-STEPS.md`](./NEXT-STEPS.md) for the full post-hackathon development plan, including an automatic AI-voice phone call escalation feature.

## License

MIT
