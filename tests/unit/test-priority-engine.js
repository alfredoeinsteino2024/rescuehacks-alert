const test = require("node:test");
const assert = require("node:assert/strict");
const { computePriority } = require("../../layers/shared/nodejs/priorityEngine");

// --- Phase 1 (discreet) — no redials, no AI severity ---

test("Phase 1: Medical Emergency is CRITICAL at baseline", () => {
  const p = computePriority("Medical Emergency");
  assert.equal(p.level, "CRITICAL");
  assert.equal(p.score, 90);
});

test("Phase 1: Safety Threat scores highest of the four base types", () => {
  const threat = computePriority("Safety Threat");
  const medical = computePriority("Medical Emergency");
  const accident = computePriority("Accident");
  const disaster = computePriority("Disaster (Fire/Flood)");
  assert.ok(threat.score >= medical.score);
  assert.ok(threat.score > accident.score);
  assert.ok(threat.score >= disaster.score);
});

test("Phase 1: Accident is HIGH, not CRITICAL, at baseline", () => {
  assert.equal(computePriority("Accident").level, "HIGH");
});

test("Phase 1: redials increase score but never exceed 100", () => {
  const noRedials = computePriority("Accident", { redialCount: 0 });
  const manyRedials = computePriority("Accident", { redialCount: 20 });
  assert.ok(manyRedials.score > noRedials.score);
  assert.ok(manyRedials.score <= 100);
});

test("Phase 1: redial reason only appears when redialCount > 0", () => {
  const fresh = computePriority("Medical Emergency", { redialCount: 0 });
  const redialed = computePriority("Medical Emergency", { redialCount: 1 });
  assert.equal(fresh.reasons.length, 1);
  assert.equal(redialed.reasons.length, 2);
});

test("unknown emergency type never fabricates a priority", () => {
  const p = computePriority("Not A Real Type");
  assert.equal(p.level, "UNKNOWN");
  assert.equal(p.score, 0);
});

// --- Phase 2.0 (general, AI-assisted) ---

test("Phase 2.0: AI severity nudges score, doesn't replace baseline outright", () => {
  const noAi = computePriority("ACCIDENT");
  const withCriticalAi = computePriority("ACCIDENT", { aiSeverity: "CRITICAL" });
  assert.ok(withCriticalAi.score > noAi.score);
  assert.ok(withCriticalAi.score < 95);
});

test("Phase 2.0: LOW AI severity pulls score down from baseline", () => {
  const noAi = computePriority("FIRE");
  const withLowAi = computePriority("FIRE", { aiSeverity: "LOW" });
  assert.ok(withLowAi.score < noAi.score);
});

test("Phase 2.0: an invalid aiSeverity value is ignored, not applied", () => {
  const p = computePriority("MEDICAL", { aiSeverity: "NOT_A_SEVERITY" });
  assert.equal(p.reasons.length, 1);
});

test("Phase 2.0: redials still stack on top of AI-adjusted score", () => {
  const base = computePriority("OTHER", { aiSeverity: "HIGH", redialCount: 0 });
  const redialed = computePriority("OTHER", { aiSeverity: "HIGH", redialCount: 3 });
  assert.ok(redialed.score > base.score);
});
