// Host-neutral event wake for the protected feedback-item companion. A host whose
// supported facility turns each stdout line of a long-running process into a task
// wake (Claude Code Monitor/background task) runs `discussion-subscribe`; this
// writer emits one line per newly committed queued event. Lines carry only opaque
// registration references, the local control path, event identity and the
// committed cursor: never a credential, context handle, URL or discussion body.

const KIND = "bos.feedback.subscriber";
const STOP_REASONS = new Set(["stopped", "authority_ended", "connection_budget_exhausted", "lifetime_ended", "retired", "failed"]);
const ERROR_CODES = new Set(["authentication_required", "authorization_denied", "context_required", "invalid_request",
  "rate_limited", "conflict", "service_unavailable"]);
const bounded = (value, pattern) => typeof value === "string" && pattern.test(value) ? value : null;

// Actual host facilities, stated truthfully. Source tests prove none of them live.
export const hostSubscriberCapabilities = Object.freeze({
  claude_code: Object.freeze({available: true, event_wake: "monitor_stdout_line_per_committed_event",
    credential_custody: "protected_current_user_credential_file", native_wake_proven: false}),
  codex: Object.freeze({available: false,
    missing_facility: "no supported facility delivers a background process's output into an existing idle task as a wake"}),
  muse: Object.freeze({available: true, event_wake: "native_hook", mode: "feedback"})
});

export function createEventWakeWriter({binding, controlPath, write, maximumRemembered = 2000}) {
  if (typeof write !== "function" || typeof controlPath !== "string" || !controlPath ||
      !binding || typeof binding.registrationRef !== "string" || typeof binding.taskRef !== "string" ||
      !Number.isSafeInteger(maximumRemembered) || maximumRemembered < 1 || maximumRemembered > 10000) {
    throw new Error("Event wake writer requires an exact registration binding");
  }
  const refs = {registration_ref: binding.registrationRef, task_ref: binding.taskRef};
  const emitted = new Set();
  let baseline = false, terminal = false;
  const line = value => { if (!terminal) write(JSON.stringify({kind: KIND, ...value, ...refs}) + "\n"); };
  const remember = key => {
    emitted.delete(key); emitted.add(key);
    while (emitted.size > maximumRemembered) emitted.delete(emitted.values().next().value);
  };
  return Object.freeze({
    started() { line({type: "started", control_path: controlPath, wake: "stdout_line_per_committed_event"}); },
    // Called after each durable queue commit with the committed state.
    committed(state) {
      if (terminal || !state || !Array.isArray(state.pending)) return;
      const cursor = typeof state.cursor === "string" && state.cursor.length <= 160 ? state.cursor : null;
      const fresh = [];
      for (const row of state.pending) {
        const key = `${row.stream}:${row.event?.event_id}`;
        if (!emitted.has(key)) fresh.push(row);
        remember(key);
      }
      if (!baseline) {
        // The first commit is the subscription's snapshot; one line, never a burst.
        if (cursor === null) return;
        baseline = true;
        line({type: "ready", pending: state.pending.length, cursor});
        return;
      }
      for (const row of fresh) {
        line({type: "event", stream: row.stream, event_id: row.event.event_id, cursor,
          occurred_at: bounded(row.event.occurred_at, /^[0-9T:.+\-Z ]{10,40}$/u),
          author_type: bounded(row.event.author_type, /^[a-z_]{1,32}$/u)});
      }
    },
    stopped(reason, code) {
      if (terminal) return;
      line({type: "stopped", reason: STOP_REASONS.has(reason) ? reason : "failed",
        ...(ERROR_CODES.has(code) ? {code} : {})});
      terminal = true;
    }
  });
}
