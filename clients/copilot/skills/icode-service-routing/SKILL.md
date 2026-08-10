---
name: icode-service-routing
description: Route iCode requests to the appropriate tenant-scoped BOS capability according to the installed customer's provider settings. Use whenever an iCode workflow needs Gmail, Calendar, Drive, Calimatic, Lead Director, calls, SMS, reviews, outreach, student data, camp data, enrollment data, or another connected business service.
---

# iCode Service Routing

Choose capabilities for the active iCode task inside the tenant-neutral BOS
MCP. This skill defines provider preferences; `bos-mcp-client` owns authentication,
authorization, and exact tenant scope.

Load `config/customer-settings.json` from the installed
`icode-operations-center` product before applying any customer-specific name,
location, timezone, mailbox, billing identity, or default. Fail closed with a
configuration-required result when the file or a required setting is absent,
then invoke `icode-customer-initialization` to derive safe client-visible
values and ask the user for the unresolved remainder.

## Routing workflow

1. Route every iCode operation through the installed `icode-operations` MCP
   connection. The client's configured `BOS_API_KEY` identifies the canonical
   BOS principal; the named endpoint selects the iCode tool group.
2. Identify the requested operation and any provider preference stated by the
   user.
3. Call `bos_get_context` once and accept the exact organization, application,
   installation, role, and capability scope for the requested operation.
4. Use the explicitly requested provider through its authorized BOS capability
   when available.
5. Otherwise use the preferred BOS capability listed below.
6. If that capability is unavailable, continue only with another authorized
   BOS capability that can answer the request and label the source used.
7. Preserve provider provenance and freshness in the result.

## Domain routes

- Use the authorized BOS Calimatic capability for class, camp, enrollment,
  attendance, student, and paid-registration reports.
- Use Lead Director capabilities for lead, pipeline, trial, attribution, and
  application graph state.
- Use the connected Gmail, Calendar, and Drive services for iCode
  communications, schedules, files, invoices, and evidence.
- Use the configured calls, SMS, reviews, or outreach capability for that
  channel.
- Use `email-account-routing` when the user explicitly names a mailbox or asks
  for cross-account email work.

Never expose credentials, authorization headers, or secret values. Never route
private provider work around BOS. Capability unavailability permits a partial
result only from another capability present in the same validated BOS context.

## Scope

Apply these preferences only to provider access required by the active iCode
task. Use the packaged skill-group connection and omit `org_id`, `app_code`,
`installed_app_id`, and `delegated_role_id`; BOS derives them. A companion domain
skill may define how to perform its workflow; this routing skill owns only
provider selection within authorized BOS capabilities.
