// Consumer-owned callback v1 validation. Contracts are discovered from BOS URLs.
import {validateActionEnvelope, validateJourneyEnvelope} from "./journey-runtime-client.mjs";

function object(value, keys, required = keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("callback contract requires an object");
  if (Object.keys(value).some(key => !keys.includes(key)) || required.some(key => !Object.hasOwn(value,key))) throw new Error("callback contract has missing or undeclared fields");
  return value;
}
function integer(value, nullable = false) {
  if (nullable && value === null) return;
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("callback usage and limits require non-negative integers");
}
function text(value) { if (typeof value !== "string" || !value || value.length > 512) throw new Error("callback contract requires bounded text"); }
function date(value, nullable = false) { if (nullable && value === null) return; if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error("callback contract requires a timestamp"); }
function array(value, maximum = 128) { if (!Array.isArray(value) || value.length > maximum) throw new Error("callback contract requires a bounded array"); }
function boolean(value) { if (typeof value !== "boolean") throw new Error("callback contract requires boolean"); }

export function validateWorkflowAction(action) {
  validateActionEnvelope(action);
  if (!["state","start","stop","retire","replay","complete","step","failed"].includes(action.verb) ||
      !/\/journey-controls\/ctrl_[A-Za-z0-9_-]{8,}$/u.test(action.href)) throw new Error("workflow action must be a returned opaque control operation");
  if (action.method !== (action.verb === "state" ? "GET" : "POST")) throw new Error("workflow action method does not match its verb");
  if (["stop","retire","replay"].includes(action.verb) && action.payload_schema !== null) throw new Error("workflow controls require no payload schema");
  return action;
}

function validateStatePageAction(action, label) {
  validateWorkflowAction(action);
  if (action.verb !== "state" || action.method !== "GET") {
    throw new Error(`${label} requires a bodyless state action`);
  }
}

function adjustments(value, terms) {
  array(value);
  for (const item of value) {
    object(item,["field","requested","granted","reason"]);
    if (!terms.includes(item.field) || !["PROFILE_LIMIT","SOURCE_LIMIT"].includes(item.reason)) throw new Error("callback adjustment is undeclared");
    integer(item.requested,true); integer(item.granted,true);
  }
}

export function validateCallbackUsage(usage) {
  array(usage,16);
  for (const item of usage) {
    object(item,["resource","scope","visibility","used","limit","remaining","reserved_by_submission"]);
    if (!["definitions","registrations","active_runs","pending_events","callbacks"].includes(item.resource) ||
        !["organization","installation","source","execution"].includes(item.scope) ||
        !["visible","restricted"].includes(item.visibility)) throw new Error("callback usage labels are undeclared");
    for (const key of ["used","limit","remaining"]) integer(item[key],true);
    integer(item.reserved_by_submission);
    if (item.visibility === "restricted" && (item.used !== null || item.remaining !== null)) throw new Error("restricted callback usage must be redacted");
    if (item.visibility === "visible" && item.used === null) throw new Error("visible usage requires a count");
    if (item.limit === null && item.remaining !== null) throw new Error("unlimited usage has no finite remaining count");
  }
  return usage;
}

export function validateCallbackReport(report) {
  object(report,["as_of","callbacks","waits","usage"]); date(report.as_of);
  array(report.callbacks,64); array(report.waits,64); validateCallbackUsage(report.usage);
  const codes = new Set();
  for (const callback of report.callbacks) {
    object(callback,["code","source","requested","granted","adjustments"]); text(callback.code); text(callback.source);
    if (codes.has(callback.code)) throw new Error("callback report contains duplicate codes"); codes.add(callback.code);
    const terms=["queue","max_attempts","max_delay_seconds","retention_seconds"];
    for (const term of [callback.requested,callback.granted]) {
      object(term,terms);
      if (term.queue !== "journey") throw new Error("callback failure queue must belong to the journey");
      for (const key of terms.slice(1)) { integer(term[key]); if (term[key] < 1) throw new Error("callback physical limits require positive values"); }
      if (term.max_attempts>5 || term.max_delay_seconds>900 || term.retention_seconds>604800) throw new Error("callback physical ceiling exceeded");
    }
    adjustments(callback.adjustments,terms.slice(1));
  }
  for (const wait of report.waits) {
    object(wait,["code","callback","requested","granted","adjustments"]); text(wait.code); text(wait.callback);
    if (!codes.has(wait.callback)) throw new Error("callback wait report references an undeclared callback");
    for (const term of [wait.requested,wait.granted]) { object(term,["ttl_seconds"]); integer(term.ttl_seconds,true); if (term.ttl_seconds===0) throw new Error("wait TTL must be positive or permanent"); }
    adjustments(wait.adjustments,["ttl_seconds"]);
  }
  return report;
}

export function validateStandingRegistration(registration) {
  object(registration,["callback","active_since","expires_at","admission_status","run_counts","runs","runs_truncated","next_page"],
    ["callback","active_since","expires_at","admission_status","run_counts","runs","runs_truncated"]);
  text(registration.callback); date(registration.active_since); date(registration.expires_at,true);
  if (!["active","stopped","retired"].includes(registration.admission_status)) throw new Error("standing admission status is undeclared");
  const statuses=["not_started","in_progress","awaiting_client","client_action_required","step_completed","failure_caught","completed","failed","expired"];
  object(registration.run_counts,statuses,[]);
  for (const count of Object.values(registration.run_counts)) integer(count);
  array(registration.runs,25); boolean(registration.runs_truncated);
  for (const run of registration.runs) { object(run,["status","action"]); if (!statuses.includes(run.status)) throw new Error("standing run status is undeclared"); validateWorkflowAction(run.action); if(run.action.verb!=="state") throw new Error("run summary requires state action"); }
  if (registration.runs_truncated) { validateWorkflowAction(registration.next_page); if(registration.next_page.verb!=="state") throw new Error("run paging requires state action"); }
  else if(Object.hasOwn(registration,"next_page")) throw new Error("final run page has no continuation");
  return registration;
}

export function validateWorkflowCatalog(body) {
  object(body,["workflows","truncated","next_page"],["workflows","truncated"]); array(body.workflows,25); boolean(body.truncated);
  for (const workflow of body.workflows) {
    object(workflow,["workflow_ref","identity","name","is_author","can_edit","status","graph","callbacks","redactions","action"]);
    for (const key of ["workflow_ref","identity","name","status"]) text(workflow[key]);
    boolean(workflow.is_author); boolean(workflow.can_edit); if(workflow.can_edit&&!workflow.is_author) throw new Error("only the author may edit the workflow");
    object(workflow.graph,["entry","nodes"]); text(workflow.graph.entry); array(workflow.graph.nodes,64);
    for(const node of workflow.graph.nodes) { object(node,["code","type","operation","next","transitions","catch","terminal"],["code","type"]); text(node.code); if(!["client","server"].includes(node.type)) throw new Error("workflow graph ownership is invalid"); }
    array(workflow.callbacks,64); for(const callback of workflow.callbacks) {object(callback,["code","source"]);text(callback.code);text(callback.source);}
    array(workflow.redactions,16); workflow.redactions.forEach(text);
    validateStatePageAction(workflow.action,"workflow catalog inspection");
  }
  if(body.truncated) validateStatePageAction(body.next_page,"workflow catalog paging");
  else if(Object.hasOwn(body,"next_page")) throw new Error("final workflow page has no continuation");
  return body;
}

export function validateWorkflowControlResponse(body) {
  object(body,["workflow_ref","target","is_author","can_edit","lifecycle","actions","failures"],["workflow_ref","target","is_author","can_edit","lifecycle","actions"]);
  text(body.workflow_ref); object(body.target,["kind","identity"]); text(body.target.identity);
  if(!["definition","run"].includes(body.target.kind)) throw new Error("workflow target is invalid");
  boolean(body.is_author); boolean(body.can_edit); if(body.can_edit&&!body.is_author) throw new Error("workflow editing is author-only");
  object(body.actions,["state","start","stop","retire","replay","complete","step","failed"],[]);
  for(const [verb,action] of Object.entries(body.actions)) {validateWorkflowAction(action);if(verb!==action.verb) throw new Error("workflow action verb does not match its key");}
  if(Object.keys(body.lifecycle).length===2) {object(body.lifecycle,["identity","status"]);text(body.lifecycle.status);}
  else validateJourneyEnvelope(body.lifecycle);
  if(body.lifecycle.identity!==body.target.identity) throw new Error("workflow lifecycle must retain the authored identity");
  if(body.failures!==undefined) {
    object(body.failures,["items","truncated","next_page"],["items","truncated"]);array(body.failures.items,25);boolean(body.failures.truncated);
    for(const failure of body.failures.items) {object(failure,["event","error"]);object(failure.event,["kind","reference"]);if(failure.event.kind!=="callback_event" || !/^bosevt_[A-Za-z0-9_-]{32}$/u.test(failure.event.reference)) throw new Error("failure event reference is invalid");object(failure.error,["code"]);text(failure.error.code);}
    if(body.failures.truncated) validateStatePageAction(body.failures.next_page,"failure paging");
    else if(Object.hasOwn(body.failures,"next_page")) throw new Error("final failure page has no continuation");
  }
  return body;
}

export function presentCallbackReport(report) {
  validateCallbackReport(report);
  return {usage:report.usage.map(item=>({resource:item.resource, used:item.visibility==="restricted"?"Restricted":item.used,
    limit:item.limit===null?"Unlimited":item.limit, remaining:item.remaining})),
    waits:report.waits.map(wait=>({step:wait.code,lifetime:wait.granted.ttl_seconds===null?"Permanent":`${wait.granted.ttl_seconds} seconds`})),
    adjustments:[...report.callbacks,...report.waits].flatMap(item=>item.adjustments.map(adjustment=>({code:item.code,...adjustment}))),
    downgrade_disclosure:"A downgrade clears pending workflow queues and disables registrations. Re-upload and explicitly start workflows after the reset."};
}
