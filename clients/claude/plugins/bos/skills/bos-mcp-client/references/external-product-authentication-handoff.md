# Generic protected-resource authentication delegation

Normative contract ID: `bos.authentication-handoff/v1`.
The machine-readable request and readiness-result contract is
[external-product-authentication-handoff.v1.schema.json](external-product-authentication-handoff.v1.schema.json).

Use this application-neutral client-skill handoff when an external caller asks
the installed BOS plugin to establish or recover authentication readiness for
an exact OAuth-protected resource. It defines no
REST endpoint, MCP operation, server registration, or product-specific service.

## Ownership

- The caller owns its package, domain skills, MCP binding, pending operation,
  connection and discovery lifecycle, retry, reconciliation, cache, continuation,
  and presentation.
- BOS receives a minimal authentication delegation request and coordinates the
  applicable host-native OAuth flow.
- The client host owns OAuth metadata discovery, dynamic registration when
  required, PKCE, credential storage, refresh, bearer attachment, and its native
  consent surface.
- The BOS service issues and validates resource-scoped grants and canonical
  execution authority.

Neither caller nor BOS skill receives, copies, persists, or transfers an access
token, refresh token, authorization code, provider credential, or reusable
authority.

## Delegation request

The caller supplies only:

- `schema_version`: exactly `bos.authentication-handoff/v1`;
- `message_type`: exactly `request`;
- `protected_resource`: the exact OAuth resource already configured on the
  caller's host-managed connection;
- `condition`: a structured authentication or MCP-session
  condition and its observed source; and
- `host_correlation` only when the host requires a non-secret value to correlate
  the active native authentication transaction.

The request contains no caller product or package identity, domain operation,
request text or hash, workflow goal, customer data, authority identifier,
approval, idempotency key, completed or pending step, retry count,
reconciliation state, cache state, or presentation instruction. BOS derives no
route or resource from a product name; it uses the exact supplied protected
resource and current OAuth metadata.

Condition categories are `authentication` and `mcp_session`. Current codes
include `MISSING_GRANT`, `EXPIRED_TOKEN`,
`REVOKED_GRANT`, `INVALID_CLIENT`, `INVALID_GRANT`, `RESOURCE_MISMATCH`,
`REAUTHENTICATION_REQUIRED`, `AUTHORIZATION_REQUIRED`,
`MCP_SESSION_CLOSED`,
`PROVIDER_AUTHORIZATION_REQUIRED`. A future structured code in one of these
categories follows
the same generic delegation path. A timeout, provider denial, or business
validation error remains outside this contract unless the host or protected
resource classifies it as one of these categories.

## Readiness result

BOS returns:

- `schema_version`: exactly `bos.authentication-handoff/v1`;
- `message_type`: exactly `result`;
- the same `protected_resource`;
- `status`: `READY`, `HOST_ACTION_REQUIRED`, or `NOT_READY`;
- the same `host_correlation` only when one was required for the host transaction.

`READY` means BOS authentication prerequisites are ready at
the time of the result. `HOST_ACTION_REQUIRED` means the host has an active native
consent or selection surface requiring direct user interaction. `NOT_READY`
means BOS could not establish readiness; `condition` may contain the remaining
structured condition.

The result contains no credential, authorization header, internal organization,
application, installation, role, provider, database identifier, or authority
selector. The caller owns every action after this result, including refreshing
its connection and discovery, reconciling uncertain work, and deciding whether
or how to continue.

## Required execution

1. Validate the closed request shape and reject prohibited data.
2. Keep the supplied protected resource exact. Use its current OAuth metadata
   and the host's native authentication lifecycle.
3. Coordinate authentication bootstrap or recovery without accepting the
   caller's operation state or selecting authorization scope.
4. Return the typed readiness result. Do not refresh the caller's MCP, replay its
   operation, reconcile its mutation, or control its continuation.
