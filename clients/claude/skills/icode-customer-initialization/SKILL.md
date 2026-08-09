---
name: icode-customer-initialization
description: Initialize or repair iCode customer settings after installation by deriving non-secret values from the active client and authenticated BOS context, then asking the user only for unresolved or ambiguous values.
---

# iCode Customer Initialization

Run this workflow immediately after installing or upgrading iCode Operations
Center when `config/customer-settings.json` is missing, incomplete, or invalid.
This workflow configures non-secret operating context. It grants no authority
and never collects credentials, API keys, tokens, passwords, or provider
secrets.

## Derivation order

1. Load `config/customer-settings.json` when present, otherwise load
   `config/customer-settings.initialization.json` and
   `config/customer-settings.template.json` from the installed product.
2. Preserve every existing valid user-confirmed value.
3. Derive the IANA timezone from the active client's local system context.
4. When BOS is already authenticated, call `bos_get_context` once. Use an
   organization or location display name only when exactly one authorized
   matching scope exists. Request selectors remain untrusted and never become
   authority.
5. Inspect connected-account metadata already visible to the client. Use a
   Care.com mailbox only when exactly one connected mailbox receives the
   configured Care.com sender. Never inspect message bodies merely to derive
   configuration.
6. Derive billing fields only from explicit non-secret customer configuration
   already present in the client or canonical BOS organization metadata. Never
   infer a billing address, contact, phone number, rate, or invoice prefix from
   unrelated messages or public web data.
7. Track each derived value with its source. Treat multiple candidates,
   conflicting values, and low-confidence guesses as unresolved.

## User elicitation

Ask one concise consolidated question in the agent conversation for all
unresolved required values. Show derived values and their sources so the user
can correct them. Required base values are organization display name, location
display name, and IANA timezone. Ask for the Care.com mailbox and billing
fields only when the customer uses those workflows.

Do not open a separate authentication page or create another login for this
configuration. Provider authentication remains the BOS-owned recovery flow.

## Apply and verify

1. Validate the completed object against the installed template and allowlist.
2. Write it to `config/customer-settings.json` with mode `0600`.
3. Remove `config/customer-settings.initialization.json` after the validated
   file is safely written.
4. Re-read the file, confirm required values, and report which values were
   derived, confirmed, or intentionally left unused.
5. Preserve the file as customer-owned configuration across package upgrades.

Fail closed with `configuration_required` while required values remain
unresolved. Never place settings into canonical skills or generated package
content.
