# Reviewer access and fixture plan

## Credential handling

Create one dedicated reviewer identity and provide its secret only through the
OpenAI submission portal's protected reviewer field. Keep the credential out of
this repository, tickets, chat, screenshots, and release artifacts.

The sign-in path must work from the public internet and require no MFA, SMS,
email confirmation, VPN, IP allowlist, or private network. The reviewer should
complete the same OAuth flow as a customer.

## Authorization scope

The reviewer identity must resolve exactly one synthetic tenant, one
non-administrative review role, and one BOS installation with the Education
Center subservice enabled. Grant only the capabilities required by the eight
submitted test cases. The reviewer authenticates to BOS once.

Use the existing synthetic BOS acceptance-test organization as the foundation
only after confirming that it contains no real customer, student, family,
employee, or provider data.

## Required fixtures

- A stable customer-facing center name.
- Two fictional Rivera student records with different statuses.
- Synthetic enrollments from September 14 through September 20, 2026, plus at
  least one out-of-range record.
- Two fictional camps for September 14 through September 18, 2026, including
  capacity and daily attendance.
- Three fictional leads in new, trial-booked, and enrolled states.
- Provider-readiness states that support each positive test or produce a clear,
  intentional reviewer instruction.

## Acceptance test

Run every case in a new ChatGPT or Codex task. Record the prompt, tools invoked,
privacy-safe result shape, status, and timestamp. Revoke and recreate the
reviewer secret after the review window or immediately after suspected
exposure.
