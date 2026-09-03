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
| Register | Client connection listing, package binding metadata, authentication control, and OAuth client status | Restore the client-native root binding; on Codex restore the package-owned `.mcp.json` BOS resource | Exact BOS resource is visible and the host-owned public client is accepted |
| Sign in | Resolved registered-app connection state or OAuth result | Invoke the client's inline Connect/Sign in/Authenticate flow | Valid resource-scoped BOS OAuth grant is accepted |
| Discover | Fresh static BOS tool manifest | Reconnect or refresh MCP/tool discovery | Complete operation/schema catalog, including context discovery, appears |
| Verify | `bos_get_context` plus a bounded authenticated product read | Classify the returned server/provider error and recover that boundary | One canonical context and one read succeed |

## Classification rules

- `skill missing`, plugin absent, extension absent: **Install**.
- Skill exists but current conversation cannot invoke it: **Load**.
- Product skills load but the BOS connection is absent: **Register BOS**.
- The Codex host has no **Login**, **Connect**, or **Authenticate** control
  after loading the BOS `.mcp.json`: **Register BOS**. Inspect the package MCP
  binding and BOS OAuth discovery before evaluating later stages.
- OAuth token endpoint `invalid_client`: **Register BOS**. Preserve the active
  request, keep the sealed BOS resource fixed, discard the stale host-owned
  public-client registration, repeat dynamic client registration from current
  authorization metadata, and restart BOS authorization once.
- `authentication_required`, missing/expired/revoked/out-of-scope grant:
  **Sign in**. Select the requested OAuth-declared BOS tool. Its descriptor is
  visible before consent, while customer data and business execution stay
  protected. Its unauthenticated result returns
  `_meta["mcp/www_authenticate"]`, which renders the simple inline action in the
  current chat. Preserve the request through consent, then refresh the static
  BOS tool catalog, call `bos_get_context`, and resume.
- OAuth token endpoint `invalid_grant`, including `Refresh token replay
  detected`: **Sign in**. The current grant is unusable. Stop the refresh retry
  loop, preserve the pending request, and obtain fresh consent through the
  native root BOS authentication action before refreshing discovery and
  resuming.
- Codex `reauthenticationRequired` or `requires OAuth reauthentication`:
  **Sign in**. Preserve the active request, select the exact OAuth-declared BOS
  tool required by the prompt, and invoke it once. Its signed-out
  `_meta["mcp/www_authenticate"]` result activates the native inline
  authentication control. When the descriptor or challenge is missing, report
  a tool-auth-contract defect. When the host receives the challenge but omits
  the action, report an authentication-activation defect. Preserve the pending
  request; never
  invoke CLI login or launch authentication for the user. Never translate this
  state into unavailable tools, missing business data, or a generic
  app-permission problem.
- OAuth succeeded but the static schema catalog is stale or absent:
  **Discover**. Catalog presence proves operation shape, not authorization.
- Context is canonical and a specific Google/SendGrid/Calimatic operation asks
  for authorization: **Provider ready**, after BOS connection verification.
- A provider recovery page requests root BOS sign-in after an authenticated BOS
  context or provider call succeeded: **Provider ready** remains the current
  stage. Never click, follow, launch, or restart BOS authentication. Poll the
  existing transaction once and classify a still-missing provider surface as
  `provider_recovery_identity_boundary`; preserve the pending provider request
  for the owning server repair.
- Empty business records after an authenticated read are a valid data result.
  They are never evidence that installation or authentication failed.
- Multiple or ambiguous BOS contexts fail closed and require BOS-side account or
  installation repair. Never let the user choose a raw tenant or installation ID.

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
