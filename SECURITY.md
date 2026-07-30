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

Customers enter provider API keys only in a secure BOS-hosted setup page.
Customers complete OAuth only on the provider and BOS authorization pages.
Skills may receive connection status and a setup URL; they must never receive
the credential itself.

Public project identifiers, endpoint URLs, schemas, and public signing
certificates may be distributed. Pre-authenticated setup links may not be
distributed.

If a credential is committed, revoke it immediately, remove it from current and
historical release artifacts, audit access, and publish a security notice when
customer action is required.
