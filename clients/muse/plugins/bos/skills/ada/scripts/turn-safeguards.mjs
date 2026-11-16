// Pure local projections. This module never executes or authorizes an action.
import { createHash } from "node:crypto";

const text = (value, name) => {
  if (typeof value !== "string" || !value.trim() || value.length > 16384) throw new Error(`Invalid ${name}`);
  return value;
};
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const copy = value => structuredClone(value);

function current(snapshot, actionRef) {
  text(snapshot?.scope, "scope");
  text(snapshot?.revision, "revision");
  if (!Array.isArray(snapshot.actions)) throw new Error("Current actions required");
  const refs = snapshot.actions.map(action => text(action?.ref, "action reference"));
  if (new Set(refs).size !== refs.length) throw new Error("Duplicate action references");
  const action = snapshot.actions.find(row => row.ref === actionRef);
  if (!action) throw new Error("Current action unavailable");
  return action;
}

export function presentConfirmation(snapshot, actionRef) {
  const action = current(snapshot, actionRef);
  if (!Array.isArray(action.targets) || action.targets.some(ref => typeof ref !== "string" || !ref.trim())) {
    throw new Error("Exact targets required");
  }
  const value = {
    scope: snapshot.scope, revision: snapshot.revision, actionRef: action.ref,
    itemRef: text(action.itemRef, "item reference"),
    itemRevision: text(action.itemRevision, "item revision"),
    statement: text(action.statement, "exact statement"), targets: [...action.targets],
    configurationRevision: action.configurationRevision === undefined ? null : text(action.configurationRevision, "configuration revision")
  };
  return {...value, presentationId: digest(value)};
}

export function resolveConfirmation({snapshot, pending, replyAnchor, decision}) {
  if (!["confirm", "decline", "revoke"].includes(decision)) throw new Error("Explicit decision required");
  if (!Array.isArray(pending)) throw new Error("Pending presentations required");
  if (!replyAnchor?.presentationId || !replyAnchor.scope) return {status: "clarify"};
  if (replyAnchor.scope !== snapshot?.scope) return {status: "refresh"};
  const matches = pending.filter(row => row.presentationId === replyAnchor.presentationId && row.scope === replyAnchor.scope);
  if (matches.length !== 1) return {status: "clarify"};
  let fresh;
  try { fresh = presentConfirmation(snapshot, matches[0].actionRef); }
  catch { return {status: "refresh"}; }
  if (fresh.presentationId !== replyAnchor.presentationId || JSON.stringify(fresh) !== JSON.stringify(matches[0])) {
    return {status: "refresh"};
  }
  return {status: "eligible", actionRef: fresh.actionRef, decision};
}

export function projectProgress(snapshot, {hostCapabilities = {}, nextAction = null} = {}) {
  text(snapshot?.scope, "scope");
  text(snapshot?.revision, "revision");
  if (!Array.isArray(snapshot.work) || !Array.isArray(snapshot.milestones)) throw new Error("Current work and milestones required");
  const work = snapshot.work.map(row => {
    if (!["ada", "customer", "service", "external"].includes(row.party)) throw new Error("Invalid waiting party");
    return {ref: text(row.ref, "work reference"), status: text(row.status, "actual status"),
      party: row.party, summary: text(row.summary, "work summary")};
  });
  const milestones = snapshot.milestones.map(row => ({ref: text(row.ref, "milestone reference"),
    status: text(row.status, "actual status"), ...(row.receiptRef === undefined ? {} : {receiptRef: text(row.receiptRef, "receipt reference")})}));
  const selected = nextAction === null ? null : copy(current(snapshot, text(nextAction, "next action")));
  return {scope: snapshot.scope, revision: snapshot.revision, work, milestones, nextAction: selected,
    observationMode: hostCapabilities.authenticatedSubscription === true && hostCapabilities.durableRecovery === true &&
      hostCapabilities.boundedWake === true && hostCapabilities.cancellation === true ? "host_supported" : "active_conversation_only"};
}
