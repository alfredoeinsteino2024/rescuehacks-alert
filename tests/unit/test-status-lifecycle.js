const test = require("node:test");
const assert = require("node:assert/strict");
const { isValidTransition, nextAllowed, ALL_STATUSES } = require("../../layers/shared/nodejs/statusLifecycle");

test("the full happy path is legal, one step at a time", () => {
  assert.ok(isValidTransition("PENDING", "ACCEPTED"));
  assert.ok(isValidTransition("ACCEPTED", "EN_ROUTE"));
  assert.ok(isValidTransition("EN_ROUTE", "REACHED"));
  assert.ok(isValidTransition("REACHED", "RESOLVED"));
});

test("skipping a step is rejected", () => {
  assert.equal(isValidTransition("PENDING", "RESOLVED"), false);
  assert.equal(isValidTransition("PENDING", "EN_ROUTE"), false);
  assert.equal(isValidTransition("ACCEPTED", "RESOLVED"), false);
});

test("moving backward is rejected", () => {
  assert.equal(isValidTransition("EN_ROUTE", "ACCEPTED"), false);
  assert.equal(isValidTransition("RESOLVED", "REACHED"), false);
});

test("RESOLVED is terminal — nothing is allowed next", () => {
  assert.deepEqual(nextAllowed("RESOLVED"), []);
});

test("an unrecognized status has no legal moves, not a crash", () => {
  assert.deepEqual(nextAllowed("NOT_A_STATUS"), []);
  assert.equal(isValidTransition("NOT_A_STATUS", "PENDING"), false);
});

test("every status is reachable in ALL_STATUSES for API validation use", () => {
  assert.deepEqual(ALL_STATUSES, ["PENDING", "ACCEPTED", "EN_ROUTE", "REACHED", "RESOLVED"]);
});
