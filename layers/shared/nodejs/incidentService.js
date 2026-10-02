const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
  QueryCommand,
  GetCommand,
  ScanCommand,
} = require("@aws-sdk/lib-dynamodb");
const crypto = require("crypto");

let config;
try {
  config = require("/opt/nodejs/config");
} catch {
  config = require("./config");
}
const { computePriority } = require("./priorityEngine");
const { nextAllowed } = require("./statusLifecycle");

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// Window within which a repeat dial from the same number, for the same
// emergency type, is treated as a duplicate/follow-up rather than a brand
// new incident. Kept short deliberately — this is about catching an
// immediate re-dial, not merging unrelated incidents hours apart.
const DUPLICATE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// Statuses that still count as "open" for duplicate matching — a RESOLVED
// incident should never silently absorb a new dial.
const OPEN_STATUSES = new Set(["PENDING", "ACCEPTED", "EN_ROUTE", "REACHED"]);

function generateIncidentId() {
  const year = new Date().getUTCFullYear();
  const suffix = crypto.randomBytes(3).toString("hex").toUpperCase(); // 6 hex chars
  // Not a sequential counter — DynamoDB has no cheap atomic global counter
  // without an extra hot-partition item, and a random suffix is more than
  // sufficient to avoid collisions at this scale. Documented, not hidden.
  return `RH-${year}-${suffix}`;
}

/**
 * Best-effort lookup for an open incident from the same phone number and
 * emergency type within the duplicate window. Returns null (never throws
 * outward as a crash) — callers should treat lookup failure the same as
 * "no duplicate found," since failing open (creating a fresh incident) is
 * safer than failing closed (silently dropping an alert).
 */
async function findRecentDuplicate(phoneNumber, emergencyType) {
  const cutoff = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();

  const result = await client.send(
    new QueryCommand({
      TableName: config.incidentsTable,
      IndexName: "ReporterPhoneIndex",
      KeyConditionExpression: "reporterPhone = :phone AND createdAt > :cutoff",
      FilterExpression: "emergencyType = :type",
      ExpressionAttributeValues: {
        ":phone": phoneNumber,
        ":cutoff": cutoff,
        ":type": emergencyType,
      },
      ScanIndexForward: false, // most recent first
      Limit: 5,
    })
  );

  const items = result.Items || [];
  return items.find((item) => OPEN_STATUSES.has(item.status)) || null;
}

/**
 * Creates a new incident, or — if a genuine duplicate is found — bumps the
 * existing one's redial count and priority instead of creating a second
 * record. Works for both Phase 1 (type only) and Phase 2.0 (type +
 * description + location + AI analysis) — the extra fields are simply
 * omitted from the stored record when not provided, rather than written
 * as null/placeholder values.
 *
 * @param {object} input
 * @param {string} input.source - "USSD" | "USSD_V2" | "IOT_DEVICE" (future)
 * @param {string} input.reporterPhone
 * @param {string} input.emergencyType
 * @param {{ whatsapp: string }} input.notification - outcome the caller
 *   already attempted (this function persists status, it does not send
 *   the alert itself — see the ussd-handler functions for ordering)
 * @param {string} [input.description] - Phase 2.0 only
 * @param {string} [input.location] - Phase 2.0 only, caller-entered text —
 *   NEVER a fabricated coordinate. Absent means LOCATION_UNAVAILABLE.
 * @param {object} [input.aiAnalysis] - output of aiClassifier.classify()
 * @returns {Promise<object>} the incident record as stored
 */
async function recordIncident({
  source,
  reporterPhone,
  emergencyType,
  notification,
  description,
  location,
  aiAnalysis,
}) {
  const now = new Date().toISOString();
  const aiSeverity = aiAnalysis ? aiAnalysis.severity : null;

  let duplicate = null;
  try {
    duplicate = await findRecentDuplicate(reporterPhone, emergencyType);
  } catch (err) {
    console.warn("Duplicate lookup failed — proceeding as a new incident:", err.message);
  }

  if (duplicate) {
    const redialCount = (duplicate.redialCount || 0) + 1;
    const priority = computePriority(emergencyType, { redialCount, aiSeverity });

    await client.send(
      new UpdateCommand({
        TableName: config.incidentsTable,
        Key: { id: duplicate.id },
        UpdateExpression:
          "SET redialCount = :redialCount, priority = :priority, updatedAt = :now, notification = :notification",
        ExpressionAttributeValues: {
          ":redialCount": redialCount,
          ":priority": priority,
          ":now": now,
          ":notification": notification,
        },
      })
    );

    return { ...duplicate, redialCount, priority, updatedAt: now, notification };
  }

  const priority = computePriority(emergencyType, { aiSeverity });
  const incident = {
    id: generateIncidentId(),
    source,
    reporterPhone,
    emergencyType,
    priority,
    status: "PENDING",
    redialCount: 0,
    notification,
    createdAt: now,
    updatedAt: now,
    ...(description ? { description } : {}),
    // Never fabricate coordinates — an explicit sentinel, not a guess.
    location: location || "LOCATION_UNAVAILABLE",
    ...(aiAnalysis ? { aiAnalysis } : {}),
    timeline: [{ status: "PENDING", at: now }],
  };

  await client.send(new PutCommand({ TableName: config.incidentsTable, Item: incident }));

  return incident;
}

/** Single incident by id, or null if not found. */
async function getIncident(id) {
  const result = await client.send(
    new GetCommand({ TableName: config.incidentsTable, Key: { id } })
  );
  return result.Item || null;
}

/**
 * Lists incidents, most recent first. Prototype-scale only (DynamoDB Scan,
 * capped at `limit`) — fine for a hackathon demo's incident volume, NOT
 * how this should work at real scale (a GSI on status/createdAt would be
 * the next step — see NEXT-STEPS.md).
 */
async function listIncidents({ limit = 50 } = {}) {
  const result = await client.send(
    new ScanCommand({ TableName: config.incidentsTable, Limit: limit })
  );
  const items = result.Items || [];
  items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return items;
}

/**
 * Validates and applies a lifecycle transition. Throws (does not silently
 * no-op) on an illegal transition, so the API layer can return a clear
 * 409 rather than pretending it worked.
 */
async function updateStatus(id, newStatus) {
  const incident = await getIncident(id);
  if (!incident) {
    const err = new Error(`Incident ${id} not found`);
    err.code = "NOT_FOUND";
    throw err;
  }

  if (!nextAllowed(incident.status).includes(newStatus)) {
    const err = new Error(
      `Illegal transition: ${incident.status} → ${newStatus}. Allowed: ${nextAllowed(incident.status).join(", ") || "(none — terminal state)"}`
    );
    err.code = "ILLEGAL_TRANSITION";
    throw err;
  }

  const now = new Date().toISOString();
  const timeline = [...(incident.timeline || []), { status: newStatus, at: now }];

  await client.send(
    new UpdateCommand({
      TableName: config.incidentsTable,
      Key: { id },
      UpdateExpression: "SET #status = :status, updatedAt = :now, timeline = :timeline",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":status": newStatus, ":now": now, ":timeline": timeline },
    })
  );

  return { ...incident, status: newStatus, updatedAt: now, timeline };
}

module.exports = {
  recordIncident,
  findRecentDuplicate,
  generateIncidentId,
  getIncident,
  listIncidents,
  updateStatus,
};
