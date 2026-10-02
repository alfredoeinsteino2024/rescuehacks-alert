const test = require("node:test");
const assert = require("node:assert/strict");
const { keywordFallback, VALID_CATEGORIES, VALID_SEVERITIES } = require("../../layers/shared/nodejs/aiClassifier");

test("fire keywords classify as FIRE/CRITICAL", () => {
  const r = keywordFallback("There is smoke and fire coming from the building");
  assert.equal(r.category, "FIRE");
  assert.equal(r.severity, "CRITICAL");
});

test("unresponsive person classifies as MEDICAL/CRITICAL", () => {
  const r = keywordFallback("A person collapsed and is not responding");
  assert.equal(r.category, "MEDICAL");
  assert.equal(r.severity, "CRITICAL");
});

test("break-in classifies as CRIME_SECURITY", () => {
  const r = keywordFallback("Someone is breaking in through the back window");
  assert.equal(r.category, "CRIME_SECURITY");
});

test("vehicle collision classifies as ACCIDENT", () => {
  const r = keywordFallback("Two cars had a collision at the junction");
  assert.equal(r.category, "ACCIDENT");
});

test("unmatched text falls back to OTHER/MEDIUM, never throws", () => {
  const r = keywordFallback("Something strange is happening nearby");
  assert.equal(r.category, "OTHER");
  assert.equal(r.severity, "MEDIUM");
});

test("fallback output always has a valid category and severity", () => {
  const samples = ["fire", "collapsed person", "random text", "", "car crash"];
  for (const s of samples) {
    const r = keywordFallback(s);
    assert.ok(VALID_CATEGORIES.includes(r.category));
    assert.ok(VALID_SEVERITIES.includes(r.severity));
    assert.equal(r.source.startsWith("FALLBACK"), true);
  }
});

test("fallback confidence is always low — it's a keyword match, not analysis", () => {
  const r = keywordFallback("fire in the kitchen");
  assert.ok(r.confidence <= 0.5);
});
