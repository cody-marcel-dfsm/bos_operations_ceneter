# BOS guided-support state machine

Use the first row whose evidence is not yet proven. Each stage has one exit
condition. A later-stage error never proves an earlier stage failed.
Treat the user's explicit account of a completed step as provisional evidence,
display it as `✓ reported`, and test the next uncertain stage. Revisit the
reported stage only when later evidence contradicts it.

| Stage | Prove with | Primary recovery | Exit condition |
|---|---|---|---|
| Install | Marketplace/plugin/extension listing or package metadata | Install or update the named BOS product from its canonical distribution | Correct product and expected version are present |
| Load | Skill list, plugin enabled state, or a new task/session | Enable the product and restart or start a new task as the client requires | Current session recognizes `bos-guided-support` and product skills |
| Register | Client connection listing and package binding metadata; OAuth client status on OAuth-capable hosts | Restore the supported host binding; on Codex restore the package-owned `.mcp.json` BOS resource; on Muse use the packaged resource in private host configuration | Exact BOS resource is registered for the host-supported identity proof |
| Sign in | Current host-supported BOS identity proof | OAuth hosts: inline Connect/Sign in/Authenticate; Muse: existing identity key in private host configuration | Valid BOS identity proof is accepted through its own credential lifecycle |
| Discover | Fresh live MCP tool manifest | Reconnect or refresh MCP/tool discovery | Current dynamic domain-specific services and tooling appear |
| Verify | `bos_get_context` plus a bounded authenticated product read | Classify the returned server/provider error and recover that boundary | One canonical context and one read succeed |

## Classification rules

- `skill missing`, plugin absent, extension absent: **Install**.
- Skill exists but current conversation cannot invoke it: **Load**.
- Product skills load but the BOS connection is absent: **Register BOS**.
- The Codex host has no **Login**, **Connect**, or **Authenticate** control
  after loading the BOS `.mcp.json`: **Register BOS**. Inspect the package MCP
  binding and BOS OAuth discovery before evaluating later stages.
- OAuth token endpoint `invalid_client`: **Register product MCP**. Preserve the active
  request, keep the sealed product resource fixed, discard the stale host-owned
  public-client registration, repeat dynamic client registration from current
  authorization metadata, and restart product authorization once.
- On OAuth-capable hosts, `authentication_required` or a missing/expired/revoked/out-of-scope grant:
  **Sign in**. Use the protected MCP resource's HTTP 401 `WWW-Authenticate`
  resource-metadata challenge and the host's native authentication action.
  Preserve the request through consent, then refresh live
  discovery of dynamic domain-specific MCP services and tooling, call
  `bos_get_context`, and resume.
- Muse missing/expired/revoked identity key: **Sign in**. Preserve the request,
  use Muse's private host credential configuration and supported key recovery,
  then refresh discovery and resume. Receive no key in chat or package files.
  Selecting another authorized organization/app requires no replacement key.
- OAuth token endpoint `invalid_grant`, including `Refresh token replay
  detected`: **Sign in**. The current grant is unusable. Stop the refresh retry
  loop, preserve the pending request, and obtain fresh consent through the
  native product authentication action before refreshing discovery and
  resuming.
- Codex `reauthenticationRequired` or `requires OAuth reauthentication`:
  **Sign in**. Preserve the active request and use the exact protected-resource
  challenge for the registered product connection. When the host receives the
  challenge but omits its native action, report an authentication-activation
  defect. Preserve the pending
  request; never
  invoke CLI login or launch authentication for the user. Never translate this
  state into unavailable tools, missing business data, or a generic
  app-permission problem.
- OAuth succeeded but the live domain-specific tool surface is stale or absent:
  **Discover**. Catalog presence proves operation shape, not authorization.
- Context is canonical and a specific Google/SendGrid/Calimatic operation asks
  for authorization: **Provider ready**, after BOS connection verification.
- A provider recovery page requests product MCP sign-in after an authenticated
  product
  context or provider call succeeded: **Provider ready** remains the current
  stage. Never click, follow, launch, or restart product authentication. Poll the
  existing transaction once and classify a still-missing provider surface as
  `provider_recovery_identity_boundary`; preserve the pending provider request
  for the owning server repair.
- Empty business records after an authenticated read are a valid data result.
  They are never evidence that installation or authentication failed.
- Multiple authorized BOS contexts are a normal multi-organization account. Use
  the `bos-mcp-client` identity-context rules: match explicit safe labels or the
  calling plugin's confirmed default against fresh choices; ask for the needed
  organization, application, installation or role label when still ambiguous.
  Select the fresh returned handle through the same authenticated connection.
  Context selection requires no additional BOS login, key or reconnect. Invalid
  discovery and genuine access failures retain their existing error/recovery
  paths. Never ask for raw tenant, installation or role IDs.

## Conversation loop

Repeat this bounded loop:

1. State the proven stage and the next checkpoint.
2. Show one action with exact labels or a copy-ready command.
3. State the one visible or machine-readable result to expect.
4. Inspect the result directly or ask for one screenshot/output.
5. Advance, branch, or escalate.

Do safe client-side actions directly when the active client provides a browser,
UI, filesystem, plugin, or command capability and the user's request authorizes
onboarding or repair. Pause only for user-owned sign-in, consent, or secure
credential entry.
