# BOS Authentication Recovery

Use this contract whenever BOS MCP or an installed provider reports an
authentication, authorization, credential, scope, or reconnect error.

## Classify the failing boundary

| Failure | Evidence | Recovery method |
|---|---|---|
| BOS client authorization | MCP transport returns `401`, expired/revoked installation, invalid bearer credential, or `bos_get_context` cannot run | Prompt the user to connect or log in to BOS through the client-supported BOS OAuth flow. For legacy API-key clients, direct the user to the secure BOS installation flow; never request the key in chat or a tool argument. |
| Google provider authorization | Gmail, Calendar, Drive, Sheets, Ads, Search Console, or Business Profile returns `reconnect_required`, `authorization_required`, expired grant, or missing provider scopes | Initiate the published BOS integration-setup operation. Prompt the user to open the returned secure BOS URL and complete Google authorization in the browser. |
| API-key provider configuration | Calimatic or another API-key plugin returns `configuration_missing`, invalid credential, or reconnect required | Initiate the published BOS integration-setup operation. Prompt the user to open the returned secure BOS URL and enter the API key directly into BOS. |
| Capability or tenant authorization | BOS authenticates, but the installation grant, delegated role, plugin capability, or selected tenant is rejected | Re-run `bos_get_context`, select only a returned authorized scope, and prompt the user to ask a BOS administrator to grant access when no matching scope exists. Do not describe this as a provider login problem. |
| Provider data or transport | Credential is healthy and the provider returns no records, rate limit, timeout, or service error | Report the provider-data or transport condition. Do not ask the user to reconnect unless BOS explicitly reports an authentication or credential state. |

## Recovery workflow

1. Capture the sanitized error, correlation ID, selected tenant, `app_code`,
   `installed_app_id`, plugin, capability, and credential status.
2. Call `bos_get_context` when the transport still permits it. Use the returned
   status to distinguish BOS client authorization from provider authorization.
3. Inspect the live MCP manifest for onboarding operations such as
   `bos_get_onboarding_status`, `bos_begin_integration_setup`,
   `bos_get_integration_setup_status`, `bos_verify_integration`, or an
   equivalent published BOS administration operation.
4. When a setup operation exists, initiate it and ask the user to open the
   secure BOS URL. State the service name and expected action:
   - Google services: log in to Google and approve the displayed scopes.
   - Google Business Profile: first read
     [google-business-profile-onboarding.md](google-business-profile-onboarding.md),
     provide the shared BOS project identifiers when Google requests them, then
     initiate the secure BOS Google authorization flow.
   - Calimatic/API-key services: enter the API key directly into the BOS page.
5. Never request, accept, repeat, transform, store, or transmit a provider
   credential through chat, form-mode elicitation, an MCP tool argument,
   feedback, logs, files, or client configuration.
6. After the user completes setup, poll or call the published status operation,
   then re-run `bos_get_context` and retry the original operation once.
7. If URL-mode elicitation or a published setup operation is unavailable,
   provide the exact service and sanitized state, then state that secure BOS
   onboarding capability is required. Never substitute browser state, native
   connectors, another tenant, or a locally supplied credential.

## User prompt standard

Keep the prompt short and action-oriented:

- BOS client: `Your BOS connection has expired. Select Connect BOS and complete
  the secure BOS login, then tell me when it is complete.`
- Gmail or another Google plugin: `Gmail needs authorization for this BOS
  organization. Open the secure BOS setup link, sign in to Google, and approve
  the displayed permissions. I will verify the connection afterward.`
- Calimatic or another API-key plugin: `Calimatic needs a valid API key. Open
  the secure BOS setup link and enter it directly there. Do not paste the key
  into this chat. I will verify the connection afterward.`

Never expose setup URLs containing credentials, personal data, or
pre-authenticated authority. Display only URLs returned by a live authorized
BOS setup operation.
