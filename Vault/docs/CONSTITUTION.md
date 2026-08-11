# BOS Operations Center constitution

1. **Explicit authority.** Every private operation proves canonical actor and
   tenant scope before access or side effects.
2. **Application neutrality.** Platform skills and runtime components contain
   no customer, franchise, or application-specific authority.
3. **Server-owned business state.** Clients render and transport server-owned
   state; application graphs own business decisions.
4. **PO/GO mutation boundary.** Routers validate and dispatch, POs orchestrate,
   and GOs persist.
5. **Credential containment.** Public source and release artifacts contain no
   secrets or customer data. Claude and ChatGPT/Codex desktop clients authorize
   each named BOS MCP resource through host-managed OAuth 2.1. Packages contain
   no user-entered BOS credential. Missing provider grants recover through
   BOS-hosted HTTPS authorization or credential collection and are stored only
   by the BOS service.
6. **Fail-closed execution.** Missing or ambiguous canonical state produces an
   explicit error and no fallback authority.
7. **Canonical generation.** Product manifests compose canonical sources into
   deterministic, equivalent client distributions.
8. **Customer-safe updates.** Package updates replace package-owned content and
   preserve customer-owned extensions with explicit compatibility warnings.
9. **Evidence-based approval.** Reviews inspect the actual diff, controlling
   Vault sources, and validation results before approval.
10. **Repository specialization.** Application-specific rules extend these
    principles in the owning application repository and never weaken them.
11. **Customer configuration isolation.** Skills and release artifacts contain
    no customer's names, mailboxes, addresses, phone numbers, locations, or
    defaults. Installers apply those values from validated customer-owned
    settings and preserve them across package updates.
12. **Typed customer specialization.** A customer changes packaged workflow
    behavior through a customer-owned extension declaring its product, base
    skill, tested version, customer key, and typed overrides. Extensions may
    change terminology, defaults, policies, and exceptions. Platform authority,
    credentials, system instructions, transport, and tool grants remain under
    their canonical owners.
13. **Authority-scoped local reuse.** BOS-family plugins share one OS-user
    document cache through authority-scoped indexes and content-addressed
    objects. Each read proves current source authority. Incremental refreshes
    advance their watermark only after complete atomic publication of changes
    and tombstones.
14. **Generic education product identity.** `Education Center` is the reusable
    childhood-education franchise product and vertical identity. Each tenant
    supplies its customer-facing franchise or brand name through the
    customer-owned settings initialization workflow. Skills apply that value to
    display copy only; technical identifiers remain package-owned.
