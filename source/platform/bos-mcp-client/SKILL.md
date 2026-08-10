---
name: bos-mcp-client
description: Operate a packaged application MCP resource group, including scope resolution, live tool discovery, transport recovery, and provider authorization recovery.
---

# BOS MCP Client

Use this skill for client-side application resource-group operations.
The client owns one configured `BOS_API_KEY`. The triggered domain skill selects
its named product connection; every connection uses that same authenticated
principal, and BOS derives canonical execution scope on the server.

Developer and operator work is outside this skill when the request explicitly
targets BOS source code, deployment infrastructure, Cloud Run, GCP Secret
Manager, an approved administrative provisioning path, or another
developer-controlled service surface. Perform that work through the owning
repository workflow and the developer's existing infrastructure identity. A
credential being created for a BOS MCP client does not make its server-side
provisioning a client runtime operation.

## Connection ownership

The agent owns the BOS MCP client lifecycle for the duration of the user's
request.

- Discover and use the installed product's configured BOS MCP connection.
- If BOS is absent from the callable tool manifest, inspect the active client's
  plugin and MCP registration immediately. Repair or reinstall the configured
  local product and bind the client's configured `BOS_API_KEY` through the
  supported secret mechanism. Preserve every other installed product
  connection. Restore only the immutable
  `/mcp/apps/{application-name}/{skill-group-name}` package route for every
  application runtime product, then verify that named server is registered.
  Packages own both human-readable route segments.
  Never discover, prompt for, repair,
  or materialize a URL from `installed_app_id` or customer settings.
  Do not stop at diagnosing client registration.
- If the transport, stream, or MCP session closes, reconnect or reinitialize
  that same configured connection, rediscover its live tools, call
  `bos_get_context` again, and retry the interrupted read-only operation once.
- Preserve the user's original request across recovery and continue it
  automatically. Never ask the user to reconnect BOS, resend the request, or
  start a new task.
- For a mutation whose completion is unknown after a disconnect, reconcile by
  its operation or idempotency identifier before deciding whether to resume.
  Never replay an uncertain mutation blindly.
- Ask for user action only when the client presents a secure provider sign-in
  or credential-entry surface that requires the user's direct interaction.
- When the host requires a fresh session to load repaired tools, create or
  continue that session through the client's task controls when available and
  carry the original request into it. State the host boundary only when the
  client offers no programmatic continuation mechanism.
- If bounded recovery fails, report the attempted recovery, sanitized error
  category, completed partial work, and the precise client or service repair
  required. Keep the current request active whenever the client supports
  recovery within the same task.

## Runtime workflow

1. Use the connection URL shipped by the package. Treat its application name
   and skill-group name as immutable package configuration, never as tenant
   authority or user-selectable settings.
2. On an application skill-group connection, do not send `org_id`, `app_code`,
   `installed_app_id`, or `delegated_role_id`; BOS derives execution scope from
   the authenticated principal and installed-app group enablement.
3. Fail closed when context is absent or ambiguous.
4. Use the triggered product skill to choose its matching named connection.
   For example, iCode operations use `icode-operations`; Video Ads operations
   use `video-ads`. The endpoint selects a tool group; it never selects an
   organization or another bearer credential.
5. Authenticate every BOS connection with the single client-configured
   `BOS_API_KEY`. Keep the key out of chat, tool arguments, package files, and logs.
   If BOS rejects the credential after reconnecting once, report that the
   client credential configuration requires repair.
6. When a domain call returns `authorization_required`, preserve its original
   operation ID and follow the returned authorization type automatically:
   - OAuth: open the returned URL, let the customer sign in directly with the
     provider, and poll `bos_get_authorization_status` with the exact scope.
   - Secret input: open the returned short-lived BOS HTTPS
     credential-collection URL. Let the customer submit the value directly to
     BOS and poll the sanitized transaction status.
7. Verify recovered authorization and call `bos_resume_operation` once. Stop
   if authorization or that single retry fails.

Domain skills interpret their workflows and execute only through their matching
configured product MCP. BOS derives actor, tenant, organization, application,
installation, role, plugin, and capability scope from that connection's bearer
principal and canonical server records.
