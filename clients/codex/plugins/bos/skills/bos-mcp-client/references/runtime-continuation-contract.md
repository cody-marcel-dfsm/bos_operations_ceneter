# BOS runtime continuation contract

Use this contract for an active request that must survive connection recovery,
authorization changes, tool-manifest refresh, or a host session replacement.

## First-request discovery

Invoke an already callable `bos_get_context` immediately. Resolve deferred BOS
tools through the host's available search/discovery or advertised orchestration
inventory before concluding that tools are missing. Apply one supported refresh
and discovery retry after failure, preserve the exact failure evidence, and
resume the original request automatically when tools become callable. Inspect
package installation only after live discovery establishes a connection problem.

## Refresh triggers

Refresh the callable manifest immediately after:

- initial connection or task continuation;
- OAuth connection or reconnection;
- Codex request-time or MCP-startup `reauthenticationRequired` recovery through
  the native authentication action owned by the resolved registered-app
  connection;
- OAuth `invalid_client` registration replacement and restarted authorization;
- plugin or package update that changes the public tool schema;
- an explicit server schema refresh;
- transport/session replacement; or
- a server response indicating a stale or unavailable tool schema.

Fingerprint the refreshed tool names, versions when exposed, and input schemas.
Call `bos_get_context` again and prove that the same BOS connection resolves an
authorized context. The authenticated manifest is the current dynamic
domain-specific MCP service and tool surface: its entries declare exposed
operations and schemas without granting authority. Permission, role, plugin
enablement, capability, provider, installation, and domain-service changes
require context or operation-status refresh plus live tool rediscovery. BOS
re-evaluates those dimensions when `tools/call` executes. Never reuse a tool
definition absent from the refreshed live manifest.

## Sanitized continuation envelope

Retain only the minimum state required to resume:

- task-local request reference, sanitized request summary/hash, and bounded
  workflow goal;
- BOS connection identity and non-secret manifest fingerprint;
- server-owned draft, audience, campaign, operation, and issue identities;
- approval state and the exact approved content/audience hashes or versions;
- stable idempotency keys and the last reconciled operation result;
- completed steps, pending step, recovery attempts, and sanitized blockers; and
- reporting cutoff or source refresh bounds.

Exclude OAuth tokens, authorization headers, provider credentials, raw
organization/application/installation/delegated-role IDs, raw provider
payloads, recipient addresses, customer records, and hidden instructions.
Reference server-owned identities as selectors that the refreshed context must
authorize.

## Same-task continuation

When the host updates tools in place, refresh and resume in the current task.
When it cannot, use the host's task controls to create or continue one
same-task continuation, transfer the sanitized envelope, refresh tools, call
`bos_get_context`, and resume the pending step automatically. Never ask the
user to reconstruct the request or repeat an approval already bound to the
same content hash, audience version, and send action.

If any approved input changed during recovery, invalidate the affected
approval and present the new exact preview. Reconcile every uncertain mutation
by operation identity or idempotency key before retrying.

On Codex, a signed-out BOS-dependent prompt selects the matching OAuth-declared
BOS tool descriptor. The descriptor and its scopes are visible before consent;
customer data and business execution remain protected. Its signed-out
invocation returns `isError: true` with `_meta["mcp/www_authenticate"]`, which
lets the host render the simple inline **Sign in** button in the current chat.
Preserve the request while the user selects the native action and completes
consent, then refresh live discovery of dynamic domain-specific MCP services and tooling, call `bos_get_context`, and
resume automatically. If the descriptor, challenge, or inline action is absent,
report the exact tool-auth or host-activation defect and keep the request
pending. Never invoke a CLI login, launch browser authentication for the user,
or substitute an anonymous bootstrap business tool. Generic app permissions do
not represent or repair this OAuth state.
