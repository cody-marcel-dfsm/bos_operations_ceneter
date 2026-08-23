# Named MCP server implementation specification

Status: required for marketplace release
Owner: BOS service and the owning BOS application repository
Date: 2026-08-09

## Objective

Implement authenticated, installation-aware MCP tool groups at stable,
human-readable application/group routes. Client route names select a public
tool-group contract. They never select a tenant installation and never replace
server-side installation authorization.

## Required public routes

The server must expose HTTPS Streamable HTTP MCP at:

```text
POST /mcp/apps/leaddirector/education-center
POST /mcp/apps/leaddirector/video-ads
```

Lead Director owns both routes. The shared BOS package is skills-only and
registers no MCP server.

Every route segment is a stable lowercase slug containing ASCII letters,
numbers, and hyphens. The server must not expose an installation ID in a public
MCP route.

The following routes must not be used by marketplace clients:

```text
/mcp/apps/{installed_app_id}
/mcp/apps/{one-segment-value}
```

## Transport contract

Each route must implement the MCP Streamable HTTP protocol already supported by
the BOS transport:

- authenticate every request before MCP dispatch;
- accept MCP JSON-RPC requests over HTTPS `POST`;
- support at minimum `initialize`, `notifications/initialized`, `tools/list`,
  `tools/call`, and protocol-level error responses;
- preserve request and correlation identity in logs and audits;
- return only JSON-RPC/MCP responses on the MCP route; and
- preserve the existing transport's bounded session and cancellation behavior.

Unsupported methods return the transport's standard JSON-RPC method error.
Malformed requests return the standard invalid-request or invalid-params error.
The transport must never redirect an unknown named route to an unnamed endpoint.

## Authentication contract

Every named-route request must require a resource-scoped OAuth access token:

```http
Authorization: Bearer <OAUTH_ACCESS_TOKEN>
```

The authenticated principal must resolve from canonical server-owned state and
include at least:

- actor identity;
- tenant and organization identity;
- OAuth grant identity, resource, status, and expiry;
- authorized installed applications;
- delegated roles; and
- enabled plugins and capabilities.

Authentication failure returns HTTP `401`. An authenticated principal with no
authority for the named application/group fails closed and returns no tool
manifest. The service must use one consistent forbidden/not-found policy that
does not disclose another tenant's installation state.

Route names are product selectors only. The validated resource-scoped OAuth
grant and canonical installed-app records determine authority. A client may
maintain simultaneous connections for multiple named groups, each with its own
grant. A grant resolves exactly one user, organization, installation, and role
for its named resource. The server evaluates every request exclusively from
that grant and never accepts actor, tenant, organization,
installation, role, plugin, or capability authority from client arguments.

## Resource-group registry

Declare each group in a server-owned immutable registry with this logical
shape:

```python
McpResourceGroup(
    application_name="leaddirector",
    application_code="lead_director",
    group_name="education-center",
    allowed_plugin_ids=frozenset(...),
    allowed_tool_names=frozenset(...),
)
```

The registry must uniquely key entries by `(application_name, group_name)` and
reject duplicates during application startup.

Group definitions must contain:

- public application name;
- canonical internal application code;
- public group name;
- title, description, and version;
- explicit allowed plugin IDs; and
- explicit allowed tool names.

Public groups must not use `None`, wildcard, or empty allowlists. A route with
no usable tools is not release-ready and must remain unregistered until its
tool contract is implemented.

## Required group definitions

### Lead Director: Education Center Operations

Route:

```text
/mcp/apps/leaddirector/education-center
```

Allowed plugins:

```text
calimatic
gmail
google-calendar
google-drive-context
education-center-automated-outreach
education-center-offline-ad-conversions
lead_director
platform-feedback
reputation
```

Allowed tools:

```text
bos_get_authorization_status
bos_get_context
bos_resume_operation
bos_submit_feedback
education_center_create_calendar_event
education_center_create_email_draft
education_center_create_lead
education_center_create_offline_ad_conversions
education_center_export_drive_text
education_center_get_email_thread
education_center_initiate_agent_call
education_center_list_enrollments
education_center_review_campaign_advance
education_center_review_campaign_approve
education_center_review_campaigns_list
education_center_review_outreach_run
education_center_search_calendar_events
education_center_search_drive_files
education_center_search_email_evidence
education_center_search_leads
education_center_search_review_profiles
education_center_search_reviews
education_center_search_students
education_center_update_calendar_event
education_center_update_email_draft
education_center_update_lead
```

The three `bos_*` lifecycle operations are application-neutral controls. They
authenticate with the named product connection's declared bearer and return
only the context or operation state authorized for the named Education Center connection.
They never broaden the resource-group tool allowlist or accept client-supplied
authority.

The server implementation may add a tool only after the Education Center product contract,
tool classification, tests, and marketplace disclosure are updated together.

`education_center_initiate_agent_call` is a mutating action owned by
`education-center-automated-outreach`. Its public input contains only the opaque `lead_id`
returned from the same authorized context and a stable `idempotency_key`. The
server derives the organization, application, installation, delegated role,
plugin execution role, FSM action, destination phone, and provider binding. It
must verify the lead's current state exposes `agent_call`, lock the operation,
route through the dedicated PO and existing bound Agent Call service, persist
audit and operation state through GO repositories, and reconcile repeated keys
without a second provider dispatch. The public schema must not expose
`plugin_id`, `action_id`, phone, provider, or execution-scope selectors.

### Lead Director: Video Ads

Route:

```text
/mcp/apps/leaddirector/video-ads
```

Allowed plugins:

```text
video-ads
```

Allowed tools:

```text
bos_get_authorization_status
bos_get_context
bos_resume_operation
video_ads_get_generation
video_ads_get_readiness
video_ads_list_generations
video_ads_list_options
video_ads_retry_transfer
video_ads_start_generation
```

The Video Ads product remains disabled and the route must remain unpublished
unless every listed tool is registered and
the authenticated installed application enables the `video-ads` resource
group. Google Drive remains a server-side dependency of the `video-ads` plugin;
the named route exposes no generic Drive operation.

Missing Arcads credentials, provider readiness, or Video Ads installation
authority affects only this disabled product and its operations. It cannot
change another organization's principal mapping, tool catalog, installation
status, build gate, or release readiness.

Every mutating video tool must route through its PO, use an idempotency key,
record an audit, and validate any provider credential against the resolved
installation.

## Installation enablement model

Application/group enablement is canonical installed-app metadata. The minimum
logical value is:

```json
{
  "metadata": {
    "fsm": {
      "mcp_resource_groups": ["education-center"]
    }
  }
}
```

The metadata must be owned by the application seed/graph source and reconciled
through the established AP to PO to GO update path. Direct SQL, arbitrary
migration-file execution, and client-side provisioning have no authority.

Reconciliation must:

1. resolve the exact tenant, organization, application, and installed app;
2. merge the intended group into existing group values unless an explicit
   reviewed replacement is requested;
3. preserve unrelated FSM metadata and enabled groups;
4. acquire required operation locks;
5. persist through the owning GO repository;
6. emit audit and reconciliation evidence; and
7. be deterministic and idempotent on repeat execution.

The owning repository must update every intended Lead Director installation
seed, including both ISM and Cherry Creek where applicable. It must resolve the
canonical installation from seed/current state rather than hardcode an
unverified UUID.

## Installation-aware tool discovery

`tools/list` must be computed for the authenticated principal and exactly one
authorized installation context.

The algorithm is:

1. authenticate the principal;
2. load only canonical installed plugins visible to that principal;
3. filter installations by the group's internal application code;
4. retain installations whose canonical metadata enables the requested group;
5. resolve exactly one authorized installation and delegated role for the
   connection;
6. fail closed when zero or multiple contexts remain;
7. load operations only from that resolved installation;
8. intersect operations with both `allowed_plugin_ids` and
   `allowed_tool_names`;
9. remove server-derived scope properties from public tool input schemas; and
10. return the resulting immutable descriptors.

The implementation must not enable discovery because any installation has the
group and then filter an aggregate cross-installation catalog. Discovery and
execution must use the same resolved installation context.

The following input fields must be absent from named-route public schemas:

```text
org_id
app_code
installed_app_id
delegated_role_id
```

## Tool execution

`tools/call` must:

1. authenticate the same principal;
2. reject a tool absent from the route's current `tools/list` result;
3. reject client-supplied execution-scope fields;
4. resolve the same unique installation and delegated role used for discovery;
5. verify application code, group enablement, plugin ID, tool name, and
   capability authorization;
6. inject `org_id`, `app_code`, `installed_app_id`, and `delegated_role_id`
   internally;
7. execute through the existing runtime executor; and
8. return the standard MCP tool result.

No fallback may retry the call through an unnamed endpoint or another group.

## Mutation boundary

For every mutating MCP tool:

- Router authenticates, validates the JSON-RPC envelope, and dispatches.
- PO validates scope and the complete mutation plan, enforces idempotency,
  acquires locks, invokes providers and GOs, and writes audit/events.
- GO performs repository and SQL work for the explicit resolved scope.
- Database constraints persist canonical state.

Provider credentials remain in BOS-managed storage and must match the resolved
tenant, organization, installed app, and plugin. Provider authorization
recovery continues through BOS-hosted secure URLs.

## Error contract

The server must fail closed with sanitized errors:

| Condition | Required result |
| --- | --- |
| Missing, invalid, expired, revoked, or wrong-resource OAuth token | HTTP `401` |
| Unknown application/group route | HTTP `404`; no broad fallback |
| Authenticated principal lacks group authority | Consistent non-disclosing `403` or `404` policy |
| Zero enabled installation scopes | MCP tool unavailable/authorization error |
| Multiple enabled installation scopes | MCP ambiguity error; no arbitrary selection |
| Tool outside group allowlist | JSON-RPC `-32601` |
| Client supplies server-derived scope | JSON-RPC `-32602` |
| Provider authorization required | Standard URL-mode elicitation when supported, with a sanitized `authorization_required` resource-link result for clients without URL elicitation |
| Mutation result uncertain after disconnect | Reconcile by operation/idempotency identity before replay |

Errors and logs must not contain provider secrets, raw OAuth tokens, or
another tenant's identifiers.

## Required automated tests

### Routing and transport

- both exact routes are registered as owned;
- unknown application/group combinations return `404`;
- one-segment and installed-ID routes return `404`;
- no named route redirects or falls back to an unnamed endpoint;
- initialize and tools/list work over Streamable HTTP; and
- unauthenticated requests return `401`.

### Discovery

- Education Center returns exactly the approved tool set supported by enabled plugins;
- disabled plugins remove their tools;
- enabled Video Ads returns its final approved non-empty set; disabled Video
  Ads remains unpublished and cannot affect another route;
- BOS returns only its explicit platform set;
- scope fields are absent from every public schema;
- one authorized installation succeeds;
- zero installations fail closed;
- two eligible installations fail as ambiguous; and
- a group enabled on installation A never exposes a tool owned only by
  installation B.

### Execution

- every advertised tool executes in the same installation scope;
- non-advertised tools return `-32601`;
- supplied scope fields return `-32602`;
- unauthorized plugin/tool/group combinations fail closed;
- cross-tenant and cross-installation calls fail;
- provider authorization recovery resumes the original operation once; and
- Gmail recovery returns provider OAuth while Calimatic recovery returns a
  short-lived BOS-hosted portal-URL and API-key page through the same request
  interceptor; and
- repeated mutations reconcile through idempotency.

### Reconciliation and deployment

- seed metadata adds the intended group without deleting existing groups;
- reconciliation is idempotent;
- dry-run reports the exact intended changes;
- the canonical ISM and Cherry Creek installations are targeted from seed
  authority;
- post-deploy authenticated tools/list matches the approved catalogs; and
- representative read and mutation smoke tests pass in staging.

## Deployment gates

The server is marketplace-ready only when all gates pass:

1. Complete application-repository diff is reviewed.
2. Every published runtime product has a non-empty explicit allowlist; disabled
   Video Ads is excluded until its full allowlist and provider implementation
   are ready.
3. Multi-install discovery isolation tests pass.
4. Seed reconciliation dry-run and idempotency evidence pass.
5. Full MCP, auth, PO/GO, provider, graph, and secret tests pass.
6. Owning repository Oracle returns `APPROVED`.
7. Changes land on a clean protected branch.
8. Staging deploy runs through the canonical deployment orchestrator.
9. Authenticated staging tools/list and representative tools/call smoke tests
   pass for every published route.
10. Production deploy completes and each public route returns an authenticated
    MCP response rather than `404`.

Until all gates pass, marketplace packages may be built and reviewed locally,
but they must not be represented as fully operational or submitted for public
release.
