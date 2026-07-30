# Backend-only communications contract

Apply this contract to every organization communication or provider-file task.

## Authority and credential resolution

1. Select `bos_icode` or `bos_dfsm` from explicit business context.
2. Authenticate with that tenant's BOS API key.
3. Call `bos_get_context` and preserve the returned `org_id`, `app_code`,
   `installed_app_id`, and `delegated_role_id`.
4. Invoke only a capability authorized for that context.
5. Let BOS resolve the provider credential from the canonical plugin settings
   for the exact organization and installed plugin.

The client never supplies a provider account, OAuth token, mailbox identity,
sender identity, or alternate organization. A credential from another tenant
is never a fallback.

## Supported backend paths

- Gmail and email: BOS Gmail search, thread, draft, attachment, and message APIs.
- Calendar: BOS Calendar search and event APIs.
- Drive and files: BOS Drive search plus `drive_export_text` for Google Docs
  and text-like transcript/document content. Use future BOS fetch/download
  APIs only when they are published in the live MCP manifest.
- Calls and transcripts: the organization's BOS telephony, meeting, Gmail,
  Calendar, or Drive plugin according to source provenance.
- SMS and parent communications: the organization's BOS communications plugin.
- Reviews and outreach: BOS reputation, Drive-template, workflow, and SendGrid
  capabilities.
- Calimatic and student operations: the organization's BOS Calimatic plugin.

Write fetched bytes or text directly from the BOS response to the requested
local path when a download is requested. Do not create server-side file storage
for arbitrary Drive content. `drive_export_text` should report
`server_persisted=false`.

## Prohibited access paths

Never inspect, open, or rely on:

- Chrome or any other browser;
- an in-app browser or Computer Use;
- browser cookies, sessions, profiles, tabs, or logged-in accounts;
- native/local Gmail, Calendar, or Drive connectors;
- local provider OAuth credentials;
- a different BOS tenant's provider connection.

Unrelated browser login state has no bearing on BOS authorization or provider
health. A browser flow initiated by a published BOS URL-mode setup operation is
the approved surface for human login, OAuth consent, or secure API-key entry.

## Failure handling

When a capability is absent or the provider reports `reconnect_required`:

1. Report the selected BOS tenant and organization.
2. Report the installed plugin, required capability, and sanitized credential
   status returned by BOS.
3. Read and follow [authentication-recovery.md](authentication-recovery.md).
4. Inspect the live manifest for a BOS onboarding, plugin-administration, or
   credential-authorization operation.
5. Use that operation when authorized and prompt the user to complete the
   service-specific secure BOS browser flow.
6. Verify status and retry the original operation once.
7. If no backend repair operation exists, report the missing secure BOS
   onboarding capability.

Do not inspect browser state, recommend switching browser accounts, invoke a
native connector, or query another tenant as a workaround.
