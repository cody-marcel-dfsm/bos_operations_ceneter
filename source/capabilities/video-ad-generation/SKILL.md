---
name: video-ad-generation
description: Generate and monitor a video advertisement from an approved brief through an authorized tenant-scoped BOS video capability.
---

# Video Ad Generation

Generate video only through the BOS capability authorized for the active
organization, installed application, and Video Ads plugin.

Follow `bos-mcp-client` and use only the installed `video-ads` MCP connection.
The host-managed, resource-scoped OAuth grant identifies the server-side
principal; the named endpoint selects the Video Ads tool group.

## Workflow

1. Require an approved brief revision and identify its intended aspect ratio,
   duration, language, and source assets.
2. Call `video_ads_get_readiness` without execution-scope arguments. BOS derives
   the exact ISM Lead Director scope from the authenticated skill-group
   connection. Stop when Arcads, Drive delivery, or policy readiness is unavailable.
3. Call `video_ads_list_options` and select only server-returned generation
   families, actors, situations, models, and output constraints.
4. Create a unique idempotency key and call `video_ads_start_generation` with
   the approved brief revision, selected option identifiers, bounded settings,
   and explicit cost approval when the returned policy requires it.
5. Preserve the server-issued operation and generation identifiers. Treat
   generation as asynchronous unless the capability reports a terminal result.
6. Poll with `video_ads_get_generation` at the server-returned cadence. Stop at
   a terminal success, failure, cancellation, expiry, or server deadline.
7. Return the result reference, preview or retrieval reference, provider
   provenance, brief revision, generation settings, and any warnings.

Use only the six semantic Video Ads operations exposed by the scoped service.
Do not select a generic provider operation or invent cancellation behavior.
The server owns provider-specific fields, limits, status values, and retry
rules. Never place provider credentials in chat, files, logs, or client
configuration.

`delegated_role_id` describes authorized actor scope. Never supply, infer, or
repair plugin `run_as_role`; BOS resolves it exclusively from installed-app FSM
metadata.

When a Video Ads operation returns `authorization_required`, preserve the
original operation identifier and follow the exact provider recovery flow
returned by the scoped service in the agent interface. This recovers the
underlying plugin grant through BOS; it never creates another client login or
password. Resume the original operation once. Never request a provider key in
chat.
