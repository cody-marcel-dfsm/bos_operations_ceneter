---
name: video-ad-drive-delivery
description: Deliver an approved generated video and traceable production metadata to an authorized Google Drive location through BOS.
---

# Video Ad Drive Delivery

Store an approved generation result through the Drive capability authorized in
the same BOS organization and application context.

Follow `bos-mcp-client` and use only the installed `video-ads` MCP connection.
Its bearer principal supplies all server-derived tenant and application scope.

## Workflow

1. Require a completed generation result, approval status, and deliverable
   name. Confirm whether the user also wants the brief, captions, thumbnail,
   and production metadata delivered.
2. Call `video_ads_get_generation` in the exact authorized Video Ads scope.
   Successful jobs already include the automatic server-owned Drive transfer.
3. For a completed transfer, return its sanitized Drive artifact reference,
   checksum, and creation timestamp. Never request or expose the configured
   folder identity.
4. When the generation is complete and its Drive transfer alone has failed,
   call `video_ads_retry_transfer` once with the generation ID and a unique
   idempotency key. This operation cannot regenerate media or change the
   destination.
5. Poll `video_ads_get_generation` at the server-returned cadence and return the
   terminal Drive artifact or sanitized failure.

The BOS service owns the server-to-Drive transfer, destination folder,
dependency credential, and idempotency contract. Never call a generic Drive
write operation from this workflow. Fail closed when the two exact Video Ads
operations are unavailable.

Never expose Drive tokens, provider credentials, signed download URLs, or
authorization headers.
