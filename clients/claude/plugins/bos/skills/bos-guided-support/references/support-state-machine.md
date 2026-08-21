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
| Register | Client connection/MCP listing and package runtime metadata | Restore the package-owned registered app or remote MCP declaration | Exact named product resource is visible |
| Sign in | Host connection state or OAuth result | Invoke the client's Connect/Sign in/Authenticate flow | Valid resource-scoped BOS OAuth grant is accepted |
| Discover | Fresh callable tool manifest | Reconnect or refresh MCP/tool discovery | Required product tools, including context discovery, appear |
| Verify | `bos_get_context` plus a bounded authenticated product read | Classify the returned server/provider error and recover that boundary | One canonical context and one read succeed |

## Classification rules

- `skill missing`, plugin absent, extension absent: **Install**.
- Skill exists but current conversation cannot invoke it: **Load**.
- Product skills load but the named connection is absent: **Register**.
- `authentication_required`, missing/expired/revoked/out-of-scope grant:
  **Sign in**.
- OAuth succeeded but schemas/tools are stale or absent: **Discover**.
- Context is canonical and a specific Google/SendGrid/Calimatic operation asks
  for authorization: **Provider ready**, after BOS connection verification.
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
