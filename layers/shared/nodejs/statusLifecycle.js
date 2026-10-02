// Incident lifecycle state machine.
//
// PENDING → ACCEPTED → EN_ROUTE → REACHED → RESOLVED
//
// Deliberately linear, no skipping (e.g. PENDING → RESOLVED is rejected,
// not silently allowed) — an incident jumping straight from "reported" to
// "resolved" with no responder action in between is far more likely to be
// a bug or a mistaken tap than a real resolution, and this is a system
// where that distinction matters. If responders need an administrative
// override later, that should be an explicit, logged, separate action —
// not a side effect of the normal transition path.

const TRANSITIONS = {
  PENDING: ["ACCEPTED"],
  ACCEPTED: ["EN_ROUTE"],
  EN_ROUTE: ["REACHED"],
  REACHED: ["RESOLVED"],
  RESOLVED: [], // terminal
};

/** @returns {string[]} statuses this one is legally allowed to move to */
function nextAllowed(currentStatus) {
  return TRANSITIONS[currentStatus] || [];
}

/** @returns {boolean} whether currentStatus -> targetStatus is a legal move */
function isValidTransition(currentStatus, targetStatus) {
  return nextAllowed(currentStatus).includes(targetStatus);
}

const ALL_STATUSES = Object.keys(TRANSITIONS);

module.exports = { nextAllowed, isValidTransition, ALL_STATUSES, TRANSITIONS };
