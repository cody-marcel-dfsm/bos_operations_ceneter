---
name: bos-external-dependency-adapter
description: Provide the installed BOS product's authenticated dependency seam to external BOS-family plugins without giving those plugins tokens, context handles, authority selectors, or a second connection.
metadata:
  version: "1.0.5"
  requires: "{}"
---

# BOS External Dependency Adapter

## Identity-wide connection

Use one BOS identity connection across its current authorized organizations,
apps, installations and assigned roles. GPT/Claude use OAuth; Muse currently uses
a user-issued identity API key held privately by the host. Delegation returns
readiness for that supported method. The existing BOS context-selection workflow
resolves explicit requests or confirmed defaults without another BOS login/key.
Keep credentials and opaque handles inside the BOS/host boundary.


Use this BOS-owned adapter whenever a separately installed product delegates
authentication recovery, invokes an operation advertised by Describe, or
invokes a BOS-returned journey action. The adapter
uses the already installed host-managed BOS connection, its exact discovered
protected resource, and a fresh versioned BOS context provider. It never
creates a product connection or accepts a token, grant,
authority selector, context handle, retry key, or journey state from the
dependent product.

Read [the dependency adapter contract](references/dependency-adapter.md) before
integrating an external product. Use
[`external-dependency-adapter.mjs`](scripts/external-dependency-adapter.mjs) as
the executable reference implementation.
For byte responses, its exported `readDiscoveredHttpResponse` helper supplies
bounded HTTP reading to the existing host transport; preserve the bytes and
filename for local saving or a discovered upload.

The core public dependency seam is:

- `recoverAuthentication({ resource, condition, host_correlation? })`;
- `waitForAuthentication({ resource, condition, host_correlation? })`;
- `invokeDiscoveredOperation(contact, payload?)`;
- `invokeReturnedAction(action, payload?)`; and
- `invokeStateAction(action)`.

`action` remains the exact server-returned
`{ verb, method, href, payload_schema }` envelope. The adapter validates the
envelope and payload, obtains the current fresh context internally, attaches
the identity-v2 context handle under the static header name published by
Describe only inside the host transport request, and
returns a sanitized service response. Legacy/v1 calls remain header-free.

`contact` is the complete current operation descriptor returned by Describe.
The adapter validates its described deterministic HTTPS execution and input
schema, validates the payload, privately obtains the current context, and calls
the advertised method and URI. The dependent product never constructs the
route or receives a context handle.

Authentication recovery is bounded to one BOS recovery cycle and one resumed
transport invocation. This bound applies only to authentication readiness.
BOS Service continues to own business idempotency, retries, reconciliation,
and journey state.

The optional notification extension exposes `getNotificationCapabilities()`,
`openNotificationStream(contact, {identities, cursor?, signal?})` and
`scheduleNotificationWake({taskRef, pendingWorkRef})`. It requires the existing
host to implement authenticated incremental stream transport, durable task wake,
current-scope checks and trusted intent verification. Capability absence keeps
these paths unavailable. Host-owned opaque task bindings come from protected
host integration, never model-authored notification text. Credentials remain
inside the same host-managed BOS connection.
