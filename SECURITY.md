# Security Policy

## Supported versions

Security updates apply to the latest published release.

## Reporting

Report suspected vulnerabilities privately through the security contact
published by Infinite State Machines LLC. Do not include live credentials,
customer records, or exploit data in a public issue.

## Credential policy

This repository and every generated client package must remain credential-free.
Never commit or distribute:

- BOS or provider API keys;
- OAuth client secrets, access tokens, or refresh tokens;
- passwords, cookies, service-account files, or private keys;
- customer records, tenant exports, or reusable installation authority.

Customers authorize BOS product connections only through the host-managed OAuth
flow. Clients never request a BOS credential in chat, configuration, scripts,
or environment variables. For an underlying API-key provider, BOS presents a
short-lived HTTPS credential-entry page and encrypts and stores the provider
credential without exposing it to the client or conversation.
Customers complete OAuth directly with the provider through a short-lived
BOS-created authorization transaction; provider passwords and OAuth tokens
never enter Codex.

Public project identifiers, endpoint URLs, schemas, and public signing
certificates may be distributed. Pre-authenticated setup links may not be
distributed.

If a credential is committed, revoke it immediately, remove it from current and
historical releases, audit access, and publish a security notice when
customer action is required.
