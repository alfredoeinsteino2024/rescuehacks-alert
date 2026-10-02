// Classifies a Phase 2.0 free-text emergency description.
//
// This is ONLY used by the general (Phase 2.0) flow, which collects real
// text. Phase 1's emergency type is already known exactly (it's the dialed
// digit) — running this against it would be classification theater, so it
// never is.
//
// Every output is validated against a strict schema before use. If the API
// call fails, times out, or returns something malformed, classify() falls
// back to a deterministic keyword classifier rather than throwing — a
// slower/dumber classification beats no classification in an emergency
// pipeline.

let config;
try {
  config = require("/opt/nodejs/config");
} catch {
  config = require("./config");
}

const VALID_CATEGORIES = ["MEDICAL", "FIRE", "ACCIDENT", "CRIME_SECURITY", "OTHER"];
const VALID_SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

const SYSTEM_PROMPT = `You are an emergency-report classification assistant. You are NOT a medical diagnostic system — you are triage support for human responders, who make the real decisions.

Given a short emergency description, respond with ONLY a JSON object (no prose, no markdown fences) with exactly these fields:
{
  "category": one of ${JSON.stringify(VALID_CATEGORIES)},
  "severity": one of ${JSON.stringify(VALID_SEVERITIES)},
  "summary": a plain, concise sentence (max 160 chars) a responder could read in 2 seconds,
  "confidence": a number from 0 to 1
}

Err toward a higher severity when the description is ambiguous but could plausibly involve risk to life. Never invent details not present in the description.`;

function validate(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  if (!VALID_CATEGORIES.includes(parsed.category)) return null;
  if (!VALID_SEVERITIES.includes(parsed.severity)) return null;
  if (typeof parsed.summary !== "string" || parsed.summary.trim().length === 0) return null;
  if (typeof parsed.confidence !== "number" || parsed.confidence < 0 || parsed.confidence > 1) {
    return null;
  }
  return {
    category: parsed.category,
    severity: parsed.severity,
    summary: parsed.summary.slice(0, 200),
    confidence: parsed.confidence,
    source: "AI",
  };
}

async function callAnthropic(description) {
  const { apiKey, model, timeoutMs } = config.anthropic;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: description }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const text = (data.content || []).map((b) => b.text || "").join("").trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`AI response was not valid JSON: ${text.slice(0, 200)}`);
    }

    const validated = validate(parsed);
    if (!validated) throw new Error(`AI response failed schema validation: ${text.slice(0, 200)}`);

    return validated;
  } finally {
    clearTimeout(timer);
  }
}

// Deterministic fallback — intentionally simple and conservative. Keyword
// lists are short and legible on purpose; this is a safety net, not meant
// to rival the AI path on nuance.
const KEYWORD_RULES = [
  { category: "FIRE", severity: "CRITICAL", words: ["fire", "smoke", "burning", "flames", "explosion"] },
  { category: "MEDICAL", severity: "CRITICAL", words: ["not breathing", "unconscious", "unresponsive", "collapsed", "bleeding heavily", "heart attack"] },
  { category: "MEDICAL", severity: "HIGH", words: ["injured", "pain", "sick", "pregnant", "labour", "labor"] },
  { category: "CRIME_SECURITY", severity: "CRITICAL", words: ["gun", "knife", "weapon", "attack", "break in", "breaking in", "assault"] },
  { category: "CRIME_SECURITY", severity: "HIGH", words: ["robbery", "theft", "threat", "stalking", "intruder"] },
  { category: "ACCIDENT", severity: "HIGH", words: ["crash", "collision", "accident", "fell", "trapped"] },
];

function keywordFallback(description) {
  const text = description.toLowerCase();

  for (const rule of KEYWORD_RULES) {
    if (rule.words.some((w) => text.includes(w))) {
      return {
        category: rule.category,
        severity: rule.severity,
        summary: description.slice(0, 160),
        confidence: 0.4, // deliberately low — this is a keyword match, not real analysis
        source: "FALLBACK_KEYWORD",
      };
    }
  }

  return {
    category: "OTHER",
    severity: "MEDIUM",
    summary: description.slice(0, 160),
    confidence: 0.2,
    source: "FALLBACK_DEFAULT",
  };
}

/**
 * @param {string} description - caller-provided free text
 * @returns {Promise<{category: string, severity: string, summary: string, confidence: number, source: string}>}
 *   Always resolves — never rejects. `source` tells you whether this came
 *   from the AI or a fallback path (AI | FALLBACK_KEYWORD | FALLBACK_DEFAULT).
 */
async function classify(description) {
  try {
    return await callAnthropic(description);
  } catch (err) {
    console.warn("AI_ANALYSIS_FAILED — using deterministic fallback:", err.message);
    return keywordFallback(description);
  }
}

module.exports = { classify, keywordFallback, VALID_CATEGORIES, VALID_SEVERITIES };
