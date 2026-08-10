---
name: icode-service-routing
description: Route iCode requests to the appropriate tenant-scoped BOS capability according to the installed customer's provider settings. Use whenever an iCode workflow needs Gmail, Calendar, Drive, Calimatic, Lead Director, calls, SMS, reviews, outreach, student data, camp data, enrollment data, or another connected business service.
---

# iCode Service Routing

Choose capabilities for the active iCode task inside the tenant-neutral BOS
MCP. This skill defines provider preferences; `bos-mcp-client` owns authentication,
authorization, and exact tenant scope.

Load `config/customer-settings.template.json` from the installed
`icode-operations-center` product as package defaults, then recursively overlay
the customer-owned `config/customer-settings.json`. Apply the resulting source
route, name, location, timezone, mailbox, billing identity, and workflow
defaults. Package builds never rewrite the customer overlay. Fail closed with a
configuration-required result when a required effective setting is absent,
then invoke `icode-customer-initialization` to derive safe client-visible values
and ask the user for the unresolved remainder.

## Routing workflow

1. Route every domain marked `bos` through the installed `icode-operations` MCP
   connection. The client's configured `BOS_API_KEY` identifies the canonical
   BOS principal; the named endpoint selects the iCode tool group.
2. Identify the requested operation and any provider preference stated by the
   user.
3. Call `bos_get_context` once and accept the exact organization, application,
   installation, role, and capability scope for the requested operation.
4. Use the effective `source_routes` value for the requested domain. A
   task-specific user instruction may select another configured connector for
   that task; it never changes BOS authority.
5. For `connected_gmail`, invoke `email-account-routing`, select the exact
   configured mailbox, then use the normal Gmail connector's search and thread
   tools. That connector owns its own account authorization.
6. If the configured capability is unavailable, return a source-specific
   partial result and label the source used. Never silently switch mailboxes.
7. Preserve provider provenance and freshness in the result.

## Domain routes

- Use `source_routes.calimatic` for class, camp, enrollment, attendance,
  student, and paid-registration reports; the package default is BOS.
- Use `source_routes.lead_director` for lead, pipeline, trial, attribution, and
  application graph state; the package default is BOS.
- Use `source_routes.calendar` for schedules and events; the package default is
  BOS.
- Use `source_routes.parent_communications` for general family correspondence;
  the package default is BOS. For `connected_gmail`, select exactly
  `mailboxes.parent_communications`.
- Use `source_routes.care_com` for Care.com notices. When it is
  `connected_gmail`, use the normal Gmail connector and the exact
  `mailboxes.care_com` selector. The package default is BOS.
- Use the configured calls, SMS, reviews, or outreach capability for that
  channel.
- Use `email-account-routing` when the user explicitly names a mailbox or asks
  for cross-account email work.

Never expose credentials, authorization headers, or secret values. A
customer-configured external connector supplies evidence only for its declared
domain and never changes BOS tenant, role, organization, or mutation authority.

## Scope

Apply these preferences only to provider access required by the active iCode
task. Use the packaged skill-group connection and omit `org_id`, `app_code`,
`installed_app_id`, and `delegated_role_id`; BOS derives them. A companion domain
skill may define how to perform its workflow; this routing skill owns only
provider selection within authorized BOS capabilities.
