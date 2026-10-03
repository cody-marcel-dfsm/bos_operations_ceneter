# External product dependency adapter contract

The adapter is owned and packaged by BOS. External products depend on its
public methods; they do not copy its context binding or authentication logic.

## Injected owners

Construct the adapter with:

- `hostTransport.request(request)` for the existing BOS host connection;
- `hostTransport.getProtectedResource()` for the current exact discovered OAuth
  resource when a transport result does not include one;
- `hostTransport.recoverAuthentication(message)` for a native BOS
  authentication handoff;
- `hostTransport.waitForAuthentication(message)` when the host reports an
active authentication action that must finish; and
- `contextProvider.getCurrentContext()` for either
  `{ contract_version: "bos-identity-mcp/v2", context }` with the freshly
  selected safe public context, or the explicit
  `{ contract_version: "bos-identity-mcp/v1" }` legacy marker; and
- `contextProvider.getExecutionContextHeader()` for the static
  `execution.context_header` name published by the selected Describe contract.

The adapter preserves an exact protected resource supplied by discovery or an
authentication result. It consults the injected host only when that result has
no resource. It never substitutes a base URL, opens a connection, discovers
OAuth metadata, stores a credential, or accepts bearer material.
When recovery creates a host correlation, the adapter carries that value and
the recovery result's exact protected resource into the single bounded wait.

## Authentication wire contract

The adapter builds and validates `bos.authentication-handoff/v1` messages.
Every request contains only:

- `schema_version: "bos.authentication-handoff/v1"`;
- `message_type: "request"`;
- the exact configured `protected_resource`;
- `condition: { category, code, source }`; and
- optional non-secret `host_correlation`.

The recognized packaged trigger list is exact and ordered:
`MISSING_GRANT`, `EXPIRED_TOKEN`, `REVOKED_GRANT`, `INVALID_CLIENT`,
`INVALID_GRANT`, `RESOURCE_MISMATCH`, `REAUTHENTICATION_REQUIRED`,
`AUTHORIZATION_REQUIRED`, `MCP_WWW_AUTHENTICATE`, `MCP_SESSION_CLOSED`, and
`PROVIDER_AUTHORIZATION_REQUIRED`. A future structured condition can still be
delegated when it supplies a valid category, code, and source.

## Discovered operation invocation

Call `invokeDiscoveredOperation(contact, payload?)` with the complete current
operation descriptor returned by authenticated Describe. The adapter accepts
the complete closed envelope—operation, status, effect, limits, guarantees,
execution, input and output schemas, error contract, and sources—without a
client-authored projection. It accepts only a `described` deterministic HTTPS
operation with the published
`X-BOS-Context-Handle` binding and validates the payload against its
`input_schema`. `GET` is bodyless; every other advertised HTTPS method requires
that payload. It obtains a fresh identity-v2 context internally, invokes the
advertised method and origin-relative URI through the existing host transport,
and returns a sanitized response. Legacy identity-v1 execution remains
header-free. Authentication recovery uses the same single bounded BOS-owned
cycle as returned actions.

The external caller supplies no route, context handle, authority selector,
token, retry identity, or provider mapping. Journey-runtime operations use the
returned-action methods.

## Journey action invocation

The dependency-facing product supplies the exact origin-relative returned
action and only the
payload declared by `payload_schema`. At invocation the adapter reads a fresh
context. An identity-v2 context causes the adapter to add
the discovered `X-BOS-Context-Handle` name and current opaque value inside the
host request. A legacy/v1 context causes no
context header. The header and value never enter the returned action, payload,
dependent-product cache, or public response.

If the first transport result is an authentication or MCP-session condition,
the adapter performs one generic BOS authentication handoff, waits through one
host-owned action when required, obtains a fresh context, and invokes the same
action once. A second authentication result is a terminal sanitized recovery
failure. Non-authentication failures are never replayed.


## Trusted execution review and scope continuity

The trusted BOS host supplies `hostTransport.captureExecutionScope()`, returning a private verification closure, and `hostTransport.verifyExecutionIntent(intent)`, returning exactly `true` only after validating the exact immutable request/contract. Approval artifacts and scope fingerprints stay inside the host. Bind approval to actor, organization, application, installation, role, effect, targets, parameters and version, with expiry and one-time use. Verify one conceptual record for CRM updates/deletes and genuine human approval for deletion; verify required goal completion before journey success. Model-supplied confirmation booleans never replace that evidence. The host must invalidate pending scope-bound approvals when its scope closure detects a change and validate the request context atomically at dispatch.

Sensitive described effects and non-GET returned actions require both guards before dispatch. The adapter checks scope again after asynchronous review. Every retry after authentication recovery requires the original closure to prove continuity; handle rotation within the same business scope remains valid. Missing or changed scope stops execution and requires rediscovery/re-preview, preserving service-owned state reconciliation. The public adapter exposes captureExecutionScope and verifyExecutionIntent as delegation methods, without exposing raw scope or approval artifacts to dependent products.

A native host without these callbacks supports reads and request preparation; sensitive invocation and unproven recovery fail closed. This repository supplies the integration contract and synthetic tests; it contains no permissive production verifier and establishes no native approval acceptance. Server wire APIs, grants, credential storage and the single BOS connection retain their existing owners. Removing host support returns to preparation-only behavior.
