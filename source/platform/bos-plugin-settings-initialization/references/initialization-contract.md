# Plugin settings initialization contract

## Trigger conditions

Run or resume after first authenticated product installation, a changed server
initialization epoch, a required unset or invalid partial field, invalidated
confirmed cache, or an explicit repair request.

## Ownership order

1. The Agent Harness loads the product and completes BOS authentication.
2. The product customer-settings initializer establishes local non-secret
   source roles such as organization website, display name, location, and
   timezone and includes **Default BOS organization** in its consolidated
   recommendation when the shared preference is missing or stale.
3. The client validates and commits the default organization display label
   against the organizations returned by `bos_get_context`, then selects that
   organization's unique default role context. A sole available organization
   may be committed without eliciting a choice. Several organizations require
   the user's consolidated confirmation. An explicit organization in the
   pending request applies to that request and does not silently rewrite the
   saved default.
4. BOS returns the canonical plugin inventory, field states, schemas, and
   allowlisted recommendation strategies.
5. Client research workers resolve those strategies from validated client
   settings and public evidence.
6. BOS validates prepared drafts.
7. The Agent Harness collects one consolidated user authorization.
8. Delegated mutation workers persist each independent plugin through BOS.
9. The client commits confirmed snapshots and the completion receipt.
10. The Agent Harness resumes the pending request.

The server owns canonical completion. The local receipt is a fast client
preflight bound to its opaque authority scope, server initialization epoch,
plugin revisions, and schema versions.

The default organization is client preference state rather than server plugin
state. Store only its display label and update time through
`client-preferences.mjs`; never place organization IDs, context IDs, roles,
tokens, credentials, or grant metadata in that file. Revalidate it against the
current authenticated context before every organization-scoped initialization.

## Business Hours

The Business Hours profile declares a weekly schedule type and source roles for
the client website, organization display name, location display name, and IANA
timezone. The client website is established during client-settings
initialization. The research worker extracts structured data, an authoritative
hours page, a location page, and visible site content in that order. Public
search is a profile-controlled fallback.

The review states that BOS has no confirmed value, shows all seven days,
timezone, sources, freshness, confidence, conflicts, and the exact proposed
schedule. User authorization precedes the server mutation.
