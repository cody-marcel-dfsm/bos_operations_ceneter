---
name: implementation
description: Implement application-neutral Business Operating System platform changes while preserving tenant isolation, explicit app scope, PO/GO data boundaries, server-owned runtime behavior, and fail-closed execution. Use for shared BOS runtime, MCP, plugin, authentication-context, provider, migration, or cross-application infrastructure changes.
---

# BOS Implementation

## Repository ownership boundary

When this skill runs from BOS Operations Center, implement only package-owned
surfaces: canonical skills and documentation, product and plugin manifests,
client generators and generated packages, release metadata, and package tests.

Never enter or mutate a BOS server repository from an Operations Center task.
Do not create a sibling server worktree, edit backend routes, commit or push a
server branch, open or merge a server pull request, operate Cloud Run or GCP,
change a server database, or deploy server code.

If the requested behavior requires server implementation, preserve the package
finding and return a paste-ready prompt for an agent running in the owning
server repository. Give that agent the sanitized evidence, required invariant,
relevant protocol contract, deployment scope, and observable post-deployment
verification. Make the client-owned Operations Center acceptance suite part of
the server change's acceptance criteria: `npm run contract:check`, `npm run
contract:oauth-discovery-live -- --resource-url "$BOS_MCP_RESOURCE_URL"
--format json`, and `npm run contract:oauth-live -- --authorize-url
"$BOS_OAUTH_AUTHORIZE_URL" --format json`. The server-side agent independently
determines the implementation and release path. Return exactly one continuous
Markdown prompt as the entire server handoff response. Keep all protocol
requirements, client-owned commands, and acceptance criteria in that single
copyable prompt.

## Workflow

1. Read the controlling architecture and locate the owning platform component.
2. Reproduce the requirement or failure with the narrowest deterministic check.
3. Identify the native BOS primitive and existing implementation pattern.
4. Add or update a focused test that captures the required invariant.
5. Implement the smallest application-neutral change.
6. Keep routers, PO orchestration, GO persistence, providers, and clients within
   their documented responsibilities.
7. Update shared documentation or skill guidance when the change establishes a
   durable platform rule.
8. Run focused tests, boundary contracts, security checks, and packaging checks.
9. Review the actual diff against the architecture before handoff.

## Required boundaries

- Back every required file, marker, manifest field, boundary, and release
  precondition with an automated test that exercises the real repository
  shape. Fixture-only tests may supplement this coverage; they never replace
  verification of required canonical files.
- Implement every current product from its present contract and observable
  user journey. Never defer a required connection, capability, or workflow to
  an assumed future product, future package composition, or anticipated growth.
- BOS owns one host-managed OAuth connection per user-facing client context.
  Subservice plugins use that existing BOS connection and never register,
  borrow, or require another BOS login. The server evaluates product,
  installation, plugin, role, capability, and provider scope for every request.
- Keep transport ownership separate from capability ownership. A subservice
  plugin may contribute skills and server capabilities without owning the BOS
  transport. Never route platform BOS operations through Education Center,
  CRM, Marketing Director, or another subservice.
- Derive authority from authenticated context and canonical installed-app
  records.
- Treat request identifiers as selectors that require authorization.
- Keep secrets in managed credential storage.
- Keep provider side effects inside explicit tenant and installation scope.
- Preserve idempotency for mutations and migrations.
- Keep application-specific paths, terminology, tests, and release gates in
  application specialization skills.

Treat a passing implementation that depends on another product's connection or
on an unimplemented future product as incomplete. Record the missing current
capability explicitly and block release until its present owner implements it.

Report changed files, validation results, migration effects, and remaining
risks. Require independent architecture review when the owning repository
defines one.
