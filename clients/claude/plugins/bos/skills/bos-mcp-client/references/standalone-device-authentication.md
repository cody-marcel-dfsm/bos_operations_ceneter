# Standalone BOS device authentication

Contract: `bos.standalone-device-auth/v1`. This opt-in profile supports a trusted
standalone OAuth transport with outbound HTTPS when the user's browser runs on
another machine. Native Codex, Claude, Copilot and Gemini retain their existing
host authentication and generated bindings. Select the standalone profile only
when the runtime explicitly provides its secure credential store and direct-user
verification surface. A missing native sign-in action does not select this profile.

BOS still owns one connection to `https://dfsm.ai/mcp/apps/bos/platform`.
Dependent products use that connection and the unchanged
`bos.authentication-handoff/v1`; they receive readiness, never OAuth material.
The service derives current actor, organization, installation, application, role
and operation authority. Device authentication changes no consent ceiling,
installation enablement, context selection, permission or existing grant.

## Trusted runtime interface

Import `createStandaloneBosTransport` from
`../scripts/standalone-device-auth.mjs`. This module belongs to the trusted
runtime, outside model-visible tools. Supply:

- `credentialStore.load(resource)`, `.save(resource, record)` and `.delete(resource)`
  backed by the runtime's protected secret-storage facility. Scope records to the
  exact sealed resource and issuer. The store contains public registration and
  access/refresh credentials; it must protect them from other users and ordinary
  package/cache/log files. There is no plaintext file, environment-variable or
  skill-state fallback. Production integrations provide their existing secure
  storage implementation; an unavailable facility blocks authentication.
- `presentVerification({verification_uri, user_code, expires_in})`, a direct-user
  surface that displays the server-returned, validated BOS URL and user code and
  returns `true` after presentation. It opens no browser and automates no login.
  The user opens the URL in their own browser, enters the code, signs in and
  verifies the displayed client, resource, code and account before approving.
  Display the challenge only for the active transaction; never retain it in logs,
  transcripts, package files, customer settings or caches. A host that cannot
  keep this challenge out of durable transcripts must provide another secure
  user surface or report the missing capability.
- Optional trusted `fetchImpl`, `sleep`, `now` and cancellation `signal` facilities.
  These support runtime integration and tenant-neutral synthetic tests. They are
  never model-supplied controls, alternate resources or credential arguments.

The returned transport implements `getProtectedResource()`,
`recoverAuthentication(message)` and `request({method, href, headers, body})`.
It fits the BOS external adapter's existing host-transport seam. Validate one
transport-decoded normalized route before credential lookup; forward the original
safe URI. OAuth routes and caller credential, origin/proxy-routing or hop header
overrides are rejected. All fetches omit ambient cookies and referrers; the
user's separate verification browser retains its own session. MCP/session,
content and current operation-context headers retain their existing meaning.
SSE processing has an 8 MiB byte bound, parses incremental events, ignores
notifications/unrelated response IDs, returns the matching JSON-RPC response
without waiting for stream closure, and cancels its reader on completion,
malformed data, cancellation or transport timeout. Recovery accepts
only the closed authentication-handoff request and returns credential-free
`READY`. Terminal failures expose a bounded `BosDeviceAuthError.code`, without
raw response, URL, callback value or underlying exception. Requests attach the
bearer internally, return HTTP status/safe headers/body, and never automatically
replay a business call. Missing grants require explicit authentication recovery.
Sensitive operations still require the adapter's existing trusted scope and
execution-review callbacks; this transport creates no permissive verifier.

## Protocol

1. Validate the exact protected-resource challenge, resource metadata, issuer
   and HTTPS authorization-server metadata. Require the advertised device
   endpoint and `urn:ietf:params:oauth:grant-type:device_code`. When new device
   starts are disabled or unsupported, report `device_flow_unavailable`; keep
   native hosts and previously issued grants on their current lifecycle.
2. Register a public native client with `token_endpoint_auth_method: "none"`,
   `grant_types: ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"]`,
   `response_types: []` and `redirect_uris: []`. Existing native-host registration
   defaults remain unchanged. No client secret or callback listener is needed.
3. POST form-encoded `client_id`, the exact `resource` and
   `scope=mcp:tools offline_access` to the advertised device endpoint
   `/api/v1/mcp/oauth/device/authorize`.
4. Keep `device_code` private in transient runtime memory. Present only
   `verification_uri`, `user_code` and `expires_in`. The request expires after
   at most 600seconds; initial polling is at least 5seconds. This profile uses the
   plain verification URI `/api/v1/mcp/oauth/device` with the displayed code;
   it does not rely on automatic navigation to `verification_uri_complete`.
5. Poll the advertised token endpoint with form-encoded `grant_type` equal to
   the device grant, `device_code`, `client_id` and the exact `resource`.
   Send no redirect URI or PKCE verifier for this grant. Wait the returned
   interval before every poll, defaulting to 5seconds. `authorization_pending`
   continues polling; `slow_down` adds 5seconds to every subsequent interval.
   HTTP 429 `rate_limited` and transport failures use bounded exponential backoff
   separately from that RFC rule. A request has a 15-second transport budget,
   and polling stops at the device expiry or cancellation.
6. Stop on `access_denied`, `expired_token`, `invalid_grant`, `invalid_client`, `unauthorized_client`,
   malformed response or other terminal error. Never automatically start a new
   device request after denial or expiry. A later explicit user request can
   begin a fresh transaction. Concurrent recovery shares one active transaction.
7. Store validated tokens privately, attach the bearer to the BOS connection,
   initialize MCP, refresh live tools/resources and call `bos_get_context`.
   Resume the retained user operation through current server-authorized context.
   Normal refresh stays inside this transport; rejected refresh clears the grant
   and requires fresh user consent. An HTTP 401 clears the unusable grant and
   returns the original response without replaying the business operation.

No step asks for a BOS API key, credentials pasted into chat, Google automation,
an inbound listener, temporary HTTPS ingress or a dependent product login.
OAuth protocol polling never creates business retry or reconciliation authority.

## Acceptance

Keep `npm run contract:check`, `contract:oauth-discovery-live`,
`contract:oauth-login-trigger-live` and `contract:oauth-live` as existing gates.
Use `contract:oauth-discovery-live -- --device --format json` to require the
advertised device metadata without starting a grant. The default native
discovery gate remains unchanged. These discovery and Google-handoff results do not prove completed device or
native login. The synthetic authentication suite exercises the actual standalone
transport through registration, polling, token storage, MCP initialization,
tool/context discovery and advertised resource reads.

Run `npm run contract:oauth-device-live -- --user-verification` explicitly from
a user-controlled terminal after the device-enabled server is deployed. The
harness displays the transient challenge directly on the terminal, bypassing
redirected result logs; it launches no browser and collects no credentials.
Its protected process-memory store is ephemeral acceptance storage and is cleared
on completion; production integrations supply their secure runtime store.
The report contains statuses and counts only. It verifies initialize,
notifications/initialized, tools/list, bos_get_context, resources/list and one
advertised resources/read. No advertised readable resource produces
`incomplete`, with `resource_read: "not_advertised"`. Retain that limitation and
retest using an eligible existing BOS identity; never guess a resource URI.

Genuine device-user completion and existing native-host acceptance are separate
release evidence. Synthetic success and a published package establish no claim
that a specific user's browser consent, secure host integration or native
reconnection has passed.
