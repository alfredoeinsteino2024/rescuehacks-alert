// Dashboard-facing read/write API over the incidents table.
//
// Auth is deliberately minimal for a hackathon prototype: a shared-secret
// header checked against an SSM-stored value. This is NOT a real auth
// system (no per-responder identity, no audit trail of who changed what) —
// documented as a known limitation in README/NEXT-STEPS.md, not disguised
// as something stronger than it is.

let config, incidentService;
try {
  config = require("/opt/nodejs/config");
  incidentService = require("/opt/nodejs/incidentService");
} catch {
  config = require("../../layers/shared/nodejs/config");
  incidentService = require("../../layers/shared/nodejs/incidentService");
}
const { ALL_STATUSES } = (() => {
  try {
    return require("/opt/nodejs/statusLifecycle");
  } catch {
    return require("../../layers/shared/nodejs/statusLifecycle");
  }
})();

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function authorized(event) {
  if (!config.dashboardApiKey) {
    // Misconfiguration, not an open door — fail closed.
    console.error("DASHBOARD_API_KEY not set — refusing all requests");
    return false;
  }
  const headers = event.headers || {};
  const provided = headers["x-dashboard-key"] || headers["X-Dashboard-Key"];
  return provided === config.dashboardApiKey;
}

exports.handler = async (event) => {
  try {
    if (!authorized(event)) {
      return json(401, { error: "Unauthorized" });
    }

    const method = event.httpMethod;
    const resource = event.resource; // e.g. "/api/incidents/{id}/status"

    if (method === "GET" && resource === "/api/incidents") {
      const limit = Number(event.queryStringParameters?.limit) || 50;
      const incidents = await incidentService.listIncidents({ limit });
      return json(200, { incidents });
    }

    if (method === "GET" && resource === "/api/incidents/{id}") {
      const incident = await incidentService.getIncident(event.pathParameters.id);
      if (!incident) return json(404, { error: "Incident not found" });
      return json(200, { incident });
    }

    if (method === "PATCH" && resource === "/api/incidents/{id}/status") {
      let payload;
      try {
        payload = JSON.parse(event.body || "{}");
      } catch {
        return json(400, { error: "Malformed JSON body" });
      }

      if (!ALL_STATUSES.includes(payload.status)) {
        return json(400, { error: `status must be one of: ${ALL_STATUSES.join(", ")}` });
      }

      try {
        const incident = await incidentService.updateStatus(event.pathParameters.id, payload.status);
        console.log("STATUS_CHANGED", { id: incident.id, status: incident.status });
        return json(200, { incident });
      } catch (err) {
        if (err.code === "NOT_FOUND") return json(404, { error: err.message });
        if (err.code === "ILLEGAL_TRANSITION") return json(409, { error: err.message });
        throw err;
      }
    }

    return json(404, { error: "Route not found" });
  } catch (err) {
    console.error("incidents-api error:", err);
    return json(500, { error: "Internal error" });
  }
};
