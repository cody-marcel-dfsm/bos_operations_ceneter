// Pure feedback presentation/payload checks plus an explicit fresh read.
// Current discovery, the existing adapter and BOS still decide access and schema.
const transitions = Object.freeze({
  open: ["acknowledged", "wontfix"],
  acknowledged: ["in_progress", "wontfix"],
  in_progress: ["resolved", "wontfix"],
  resolved: ["verified", "reopened"],
  verified: ["closed", "reopened"],
  closed: ["reopened"],
  wontfix: ["reopened"],
  reopened: ["acknowledged", "in_progress", "wontfix"]
});
const knownStatus = value => typeof value === "string" && Object.hasOwn(transitions, value);
const identifier = value => typeof value === "string" && value.length > 0 && value.length <= 512 &&
  !/[\p{Cc}\p{Cf}]/u.test(value);
const uuid = value => typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(value);

function detail(response) {
  const record = response?.body?.result;
  if (response?.status !== 200 || !record || !identifier(record.feedback_id) || !knownStatus(record.status)) {
    throw new TypeError("Read feedback through its current discovered detail contract.");
  }
  return record;
}

export function observeFeedback(response, {operation} = {}) {
  const record = detail(response);
  if (operation === "feedback.resolve" && record.status !== "closed") {
    throw new TypeError("Reporter completion did not return the declared closed result.");
  }
  // History has no ordering guarantee or current-resolution field. Even an old
  // confirmation followed by reopening/reclosing remains historical evidence.
  const historicalReporterConfirmations = (Array.isArray(record.history) ? record.history : [])
    .filter(event => event?.status === "closed" && event.resolution === "reporter_confirmed")
    .map(event => ({event_id: event.event_id, occurred_at: event.occurred_at}));
  return {
    next: operation === "feedback.resolve" ? "reporter_completion_accepted" : "feedback_observed",
    feedback_id: record.feedback_id,
    status: record.status,
    historicalReporterConfirmations
  };
}

export function feedbackRecovery(response, {uncertain = false} = {}) {
  if (uncertain) return {next: "read_feedback_before_deciding", replay: false};
  const code = response?.body?.error?.code;
  if (response?.status === 409 && code === "conflict") {
    return {next: "refresh_feedback", replay: false, code};
  }
  // A diagnostic reason never becomes a second machine-code vocabulary.
  return {next: "report_error", replay: false, ...(typeof code === "string" ? {code} : {})};
}

export async function prepareFeedbackMutation(options) {
  const {adapter, readContact, mutationContact, feedbackId, intent, status} = options;
  if (!identifier(feedbackId) || !["update", "triage", "resolve"].includes(intent)) {
    throw new TypeError("Select one current feedback record and requested change.");
  }
  if (!mutationContact) return {next: "capability_unavailable"};
  if (mutationContact.effect !== "write" || mutationContact.execution?.method !== "POST" ||
      (intent === "resolve" && mutationContact.operation !== "feedback.resolve")) {
    throw new TypeError("Use the exact discovered feedback mutation contract.");
  }
  if (typeof adapter?.invokeDiscoveredOperation !== "function" || readContact?.effect !== "read" ||
      readContact.execution?.method !== "POST") {
    throw new TypeError("An uncached current feedback read through the existing BOS adapter is required.");
  }
  const response = await adapter.invokeDiscoveredOperation(readContact, {feedback_id: feedbackId});
  if (response.status !== 200) return feedbackRecovery(response);
  const record = detail(response);
  if (record.feedback_id !== feedbackId) throw new TypeError("The feedback read changed the selected record.");
  const payload = {feedback_id: feedbackId, expected_status: record.status};
  if (intent === "resolve") {
    if (Object.hasOwn(options, "status") || Object.hasOwn(options, "assignedTo")) {
      throw new TypeError("Reporter completion supplies only feedback_id and expected_status.");
    }
    // Closed alone proves no reporter completion; the service decides replay.
  } else {
    if (!knownStatus(status)) throw new TypeError("Refresh the declared feedback status contract.");
    const assignment = Object.hasOwn(options, "assignedTo");
    if (assignment && (intent !== "triage" || !(options.assignedTo === null || uuid(options.assignedTo)))) {
      throw new TypeError("Assignment requires the discovered team triage operation and a member UUID or null.");
    }
    const sameStateAssignment = intent === "triage" && assignment &&
      Object.hasOwn(record, "assigned_to") && options.assignedTo !== record.assigned_to;
    if (record.status === status ? !sameStateAssignment : !transitions[record.status].includes(status)) {
      throw new TypeError("The requested feedback transition is unavailable from the fresh state.");
    }
    payload.status = status;
    if (assignment) payload.assigned_to = options.assignedTo;
  }
  // This is a preview, not permission, confirmation or a mutation. Invoke only
  // the actual discovered contract after applicable user authorization; the
  // adapter validates its complete current schema and the server rechecks rights.
  return {next: "review_feedback_change", operation: mutationContact.operation, payload};
}

export function feedbackCommentPayload({record, body, parentCommentId}) {
  if (!record || !identifier(record.feedback_id) || typeof body !== "string" ||
      [...body].length < 1 || [...body].length > 4000) {
    throw new TypeError("Use one feedback record and a bounded plain-text comment.");
  }
  const payload = {feedback_id: record.feedback_id, body};
  if (parentCommentId !== undefined) {
    if (!uuid(parentCommentId) || !Array.isArray(record.comments) ||
        !record.comments.some(comment => comment.event_id === parentCommentId)) {
      throw new TypeError("Select the parent comment from this feedback record's fresh discussion.");
    }
    payload.parent_comment_id = parentCommentId;
  }
  return payload;
}
