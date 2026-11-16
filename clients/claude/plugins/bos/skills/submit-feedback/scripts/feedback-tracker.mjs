// Pure feedback-request tracker: maintain one status record of filed
// feedback items and render a consistent status report from it.
// The agent feeds it item states already read through the native bos_*
// tools. This module performs no feedback read and no mutation itself.
// It holds identifiers, short names, lane, where-the-work-is, and
// last-verified time only — never feedback bodies, screenshots, personal
// data, or credentials, and never an offline submission queue.
const WHERE = Object.freeze([
  "Service implementing",
  "Waiting on service",
  "Waiting on Muse",
  "Waiting on the user",
  "Blocked",
  "Parked"
]);

const LIFECYCLE = Object.freeze([
  "open",
  "acknowledged",
  "in_progress",
  "resolved",
  "verified",
  "closed",
  "wontfix",
  "reopened"
]);

const RESOLVED_LIFECYCLE = Object.freeze(["resolved", "verified", "closed"]);

// Fields that would turn the tracker into a copy of the feedback or an
// offline queue. Rejected outright.
const FORBIDDEN_FIELDS = Object.freeze([
  "body",
  "message",
  "description",
  "attachments",
  "screenshots",
  "images",
  "transcript",
  "email",
  "phone",
  "token",
  "credential",
  "password",
  "secret"
]);

const identifier = value => typeof value === "string" && value.length > 0 && value.length <= 512 &&
  !/[\p{Cc}\p{Cf}]/u.test(value);

const shortText = (value, max) => typeof value === "string" && value.length > 0 && value.length <= max &&
  !/[\p{Cc}\p{Cf}]/u.test(value);

const isoDate = value => typeof value === "string" && !Number.isNaN(Date.parse(value));

export function createTracker() {
  return { items: [], updated_at: null };
}

export function validateItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new TypeError("Tracker item must be an object.");
  }
  for (const field of FORBIDDEN_FIELDS) {
    if (Object.hasOwn(item, field)) {
      throw new TypeError(`Tracker holds status only; field "${field}" is not a tracker field.`);
    }
  }
  if (!identifier(item.feedback_id)) throw new TypeError("Tracker item needs a feedback_id.");
  if (!shortText(item.name, 200)) throw new TypeError("Tracker item needs a short human-readable name (max 200).");
  if (!shortText(item.category, 100)) throw new TypeError("Tracker item needs a category (the swim-lane marker).");
  if (!WHERE.includes(item.where)) {
    throw new TypeError(`Tracker "where" must be one of: ${WHERE.join(", ")}.`);
  }
  if (item.where === "Blocked" && !shortText(item.blocked_cause, 200)) {
    throw new TypeError("A Blocked item needs a blocked_cause naming the cause.");
  }
  if (!isoDate(item.last_verified)) throw new TypeError("Tracker item needs a last_verified ISO date.");
  if (item.lifecycle !== undefined && !LIFECYCLE.includes(item.lifecycle)) {
    throw new TypeError(`Tracker lifecycle must be one of: ${LIFECYCLE.join(", ")}.`);
  }
  return {
    feedback_id: item.feedback_id,
    name: item.name,
    category: item.category,
    where: item.where,
    ...(item.where === "Blocked" ? { blocked_cause: item.blocked_cause } : {}),
    last_verified: item.last_verified,
    ...(item.lifecycle !== undefined ? { lifecycle: item.lifecycle } : {})
  };
}

// Add or update one item by feedback_id. Returns the tracker.
export function upsertItem(tracker, item) {
  if (!tracker || !Array.isArray(tracker.items)) throw new TypeError("Pass a tracker from createTracker.");
  const clean = validateItem(item);
  const at = tracker.items.findIndex(entry => entry.feedback_id === clean.feedback_id);
  if (at >= 0) tracker.items[at] = clean;
  else tracker.items.push(clean);
  tracker.updated_at = clean.last_verified;
  return tracker;
}

// Remove items whose lifecycle is resolved, verified, or closed. The
// tracker keeps them by default so they can be shown when asked; use this
// only when the record itself should drop them.
export function dropResolved(tracker) {
  if (!tracker || !Array.isArray(tracker.items)) throw new TypeError("Pass a tracker from createTracker.");
  tracker.items = tracker.items.filter(entry => !RESOLVED_LIFECYCLE.includes(entry.lifecycle));
  return tracker;
}

export function serialize(tracker) {
  if (!tracker || !Array.isArray(tracker.items)) throw new TypeError("Pass a tracker from createTracker.");
  for (const entry of tracker.items) validateItem(entry);
  return JSON.stringify(tracker, null, 2) + "\n";
}

export function parseTracker(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new TypeError("Tracker file is not valid JSON.");
  }
  if (!parsed || !Array.isArray(parsed.items)) throw new TypeError("Tracker file needs an items array.");
  const tracker = createTracker();
  for (const entry of parsed.items) upsertItem(tracker, entry);
  if (parsed.updated_at !== undefined && !isoDate(parsed.updated_at)) {
    throw new TypeError("Tracker updated_at must be an ISO date.");
  }
  tracker.updated_at = parsed.updated_at ?? tracker.updated_at;
  return tracker;
}

const isResolved = entry => RESOLVED_LIFECYCLE.includes(entry.lifecycle);

// Render a status report grouped by lane (category), then by where the
// work is. Resolved items are omitted unless includeResolved is true.
// Each item is listed by its short name, with the feedback ID only as a
// secondary reference.
export function renderStatus(tracker, { includeResolved = false } = {}) {
  if (!tracker || !Array.isArray(tracker.items)) throw new TypeError("Pass a tracker from createTracker.");
  const visible = tracker.items.filter(entry => includeResolved || !isResolved(entry));
  const byLane = new Map();
  for (const entry of visible) {
    if (!byLane.has(entry.category)) byLane.set(entry.category, new Map());
    const lane = byLane.get(entry.category);
    if (!lane.has(entry.where)) lane.set(entry.where, []);
    lane.get(entry.where).push(entry);
  }
  const lines = [];
  const scope = includeResolved ? `${visible.length} item${visible.length === 1 ? "" : "s"} (including resolved)` : `${visible.length} open item${visible.length === 1 ? "" : "s"}`;
  lines.push(`Feedback status — ${scope}${tracker.updated_at ? ` (tracker last verified ${tracker.updated_at})` : ""}.`);
  for (const [lane, groups] of [...byLane.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push("", `## ${lane}`);
    for (const where of WHERE) {
      const entries = groups.get(where);
      if (!entries || entries.length === 0) continue;
      lines.push("", `### ${where}`);
      for (const entry of entries) {
        const cause = entry.where === "Blocked" && entry.blocked_cause ? ` — ${entry.blocked_cause}` : "";
        lines.push(`- ${entry.name} (${entry.feedback_id})${cause}`);
      }
    }
  }
  if (visible.length === 0) lines.push("", "No open items in the tracker.");
  return lines.join("\n") + "\n";
}
