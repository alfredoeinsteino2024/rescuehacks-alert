# Next Steps & Long-Term Vision — RescueHacks Alert

This document outlines how RescueHacks Alert would continue to develop beyond the hackathon, including near-term fixes, planned features, and the long-term vision for bringing it into real-world use.

---

## Immediate Post-Hackathon Fixes

**1. Move the WhatsApp access token out of environment variables entirely.**
Currently the token is stored as a plain-text SSM Parameter Store `String` (a pragmatic choice made under hackathon time pressure). The correct long-term approach is to store it as a `SecureString`, remove it from the Lambda's environment variables altogether, and instead have the Lambda fetch and decrypt it at runtime via the AWS SDK (`ssm:GetParameter` with `WithDecryption: true`), caching it in memory for the life of the execution environment. This keeps the token encrypted at rest and out of the Lambda console entirely.

**2. Confirm and lock in the approved WhatsApp message template.**
The `rescuehacks_emergency_alert` Utility template was submitted for Meta review during the hackathon build. Once approved, remove reliance on the plain-text fallback path as the primary channel — the fallback should remain only as a safety net for edge cases, not the default.

**3. Expand automated testing.**
Currently there's a single manual local test script for the WhatsApp send path. This should grow into a proper test suite covering: each of the four emergency type codes individually, malformed/unexpected `text` input, and WhatsApp API failure handling.

---

## Planned Features

### Automatic AI Voice Call Escalation
The core vision for this project beyond the hackathon: when the USSD code is dialed, in addition to (or as an escalation path beyond) the WhatsApp alert, the system would automatically place a phone call to the emergency contact using a telephony API (e.g. Africa's Talking Voice API or Twilio Voice) with text-to-speech, reading out the emergency type, the caller's number, and encouraging the contact to act immediately. This matters because WhatsApp messages can go unseen for minutes if a phone is on silent or the contact isn't looking at it — a phone call is much harder to miss. The call would ideally trigger automatically if the WhatsApp message isn't acknowledged (read/opened) within a short window, giving a graduated escalation rather than a single point of failure.

### Multi-Contact & User Registration
Right now, the emergency contact is a single hardcoded number for demo purposes. The real system needs a lightweight registration flow — likely via a one-time USSD or web registration step — allowing each caller's phone number to be mapped to one or more of their own trusted contacts, so the alert reaches the right person for the right caller.

### Location Sharing Without GPS
USSD cannot access GPS directly. A future version could prompt (as part of registration, not during the emergency dial itself, to preserve discretion) for a "usual location" or frequently-visited area, or integrate with cell-tower-based approximate location data where available through telco partnerships, so the alert can include a rough location without adding any extra screens during an actual emergency.

### Silent Follow-Up Check
A safe, equally discreet way for the emergency contact to check on the situation without needing the original caller to respond visibly — for example, a status the caller could update later once safe, again without needing to interact with anything conspicuous in the moment.

### Multi-Language Support
Given the real-world deployment context, the system should support common Nigerian languages for any user-facing text and for the AI voice-call script, since discretion and clarity both matter more in a person's first language.

---

## Long-Term Vision

The eventual goal is a **dedicated, telco-registered USSD short code** (rather than a shared sandbox code), making the service directly dialable by anyone without needing to remember a long code string — closer to how `*911#`-style emergency codes work in some regions. This would involve partnering with a telecom provider or an aggregator like Africa's Talking's production tier, along with the necessary business verification.

Longer-term, this could extend beyond individual safety threats into a broader community emergency-response layer — integrating with local community responders, campus security systems (building on patterns from other ChainEngineers projects like FJAY Dispatch), or NGOs working in personal safety and disaster response, so that alerts don't only reach one contact but can also notify nearby verified responders when appropriate and consented to.

The core design principle — that seeking help should never look different from an ordinary action on a phone — would remain central to every feature added going forward.
