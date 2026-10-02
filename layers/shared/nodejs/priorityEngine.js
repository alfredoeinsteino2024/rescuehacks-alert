// Deterministic priority engine.
//
// Phase 1 (discreet flow) collects no free text — the emergency type IS the
// dialed digit, already known exactly, so there's nothing for AI to
// classify. Its baselines are pinned CRITICAL/high-by-default on purpose:
// no further information will ever arrive to refine them, so the safe
// assumption is the serious one.
//
// Phase 2.0 (general flow) collects a real description, which an AI
// classifier assesses for severity. Its baselines are deliberately more
// moderate starting points, then adjusted by that severity assessment —
// because unlike Phase 1, more information actually is available here.
//
// Either way this module stays rule-based and explainable, not a black
// box — every score comes with its reasons.

const BASE_PRIORITY = {
  // --- Phase 1 (discreet) ---
  "Medical Emergency": {
    score: 90,
    level: "CRITICAL",
    reason: "Reported medical emergency — potential life-threatening condition",
  },
  "Safety Threat": {
    score: 95,
    level: "CRITICAL",
    reason: "Reported safety threat — caller may be in immediate danger",
  },
  Accident: {
    score: 65,
    level: "HIGH",
    reason: "Reported accident — injury status unknown",
  },
  "Disaster (Fire/Flood)": {
    score: 88,
    level: "CRITICAL",
    reason: "Reported fire/flood disaster — risk to life and property",
  },

  // --- Phase 2.0 (general, AI-assisted) ---
  MEDICAL: { score: 75, reason: "Reported medical emergency" },
  FIRE: { score: 80, reason: "Reported fire emergency" },
  ACCIDENT: { score: 55, reason: "Reported accident" },
  CRIME_SECURITY: { score: 75, reason: "Reported crime/security incident" },
  OTHER: { score: 40, reason: "Reported emergency — type unspecified" },
};

// AI severity nudges the Phase 2.0 baseline toward the assessed severity,
// rather than overriding it outright — a deliberate average, not a
// replacement, so one bad AI call can't swing priority to an extreme.
const SEVERITY_SCORE = { CRITICAL: 95, HIGH: 70, MEDIUM: 50, LOW: 25 };

// Repeated dials from the same number, for the same emergency, in a short
// window is a real signal (person re-dialing because the situation is
// escalating, or they weren't able to finish the first time). Each redial
// nudges priority up, capped at 100.
const REDIAL_BUMP = 5;
const MAX_SCORE = 100;

function levelForScore(score) {
  if (score >= 80) return "CRITICAL";
  if (score >= 60) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

/**
 * @param {string} emergencyType - a key in BASE_PRIORITY
 * @param {object} [opts]
 * @param {number} [opts.redialCount] - prior dials detected as duplicates
 * @param {string|null} [opts.aiSeverity] - CRITICAL|HIGH|MEDIUM|LOW from the
 *   AI classifier (Phase 2.0 only — omit/null for Phase 1)
 * @returns {{ score: number, level: string, reasons: string[] }}
 */
function computePriority(emergencyType, { redialCount = 0, aiSeverity = null } = {}) {
  const base = BASE_PRIORITY[emergencyType];

  if (!base) {
    // Should not happen if called after emergencyType validation, but never
    // fabricate a priority for an unknown type.
    return {
      score: 0,
      level: "UNKNOWN",
      reasons: [`Unrecognized emergency type: ${emergencyType}`],
    };
  }

  const reasons = [base.reason];
  let score = base.score;

  if (aiSeverity && SEVERITY_SCORE[aiSeverity] !== undefined) {
    score = Math.round((score + SEVERITY_SCORE[aiSeverity]) / 2);
    reasons.push(`AI-assessed severity: ${aiSeverity}`);
  }

  if (redialCount > 0) {
    const bump = Math.min(redialCount * REDIAL_BUMP, MAX_SCORE - score);
    score = Math.min(score + bump, MAX_SCORE);
    reasons.push(
      `Caller re-dialed ${redialCount} time(s) within the duplicate window — possible escalation`
    );
  }

  return { score, level: levelForScore(score), reasons };
}

module.exports = { computePriority, BASE_PRIORITY };
