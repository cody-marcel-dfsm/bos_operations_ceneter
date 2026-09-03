# BOS Operations Center constitution

1. **Explicit authority.** Every private operation proves canonical actor and
   tenant scope before access or side effects.
2. **Application neutrality.** Platform skills and runtime components contain
   no customer, franchise, or application-specific authority.
3. **Server-owned business state.** Clients render and transport server-owned
   state; application graphs own business decisions.
4. **PO/GO mutation boundary.** Routers validate and dispatch, POs orchestrate,
   and GOs persist.
5. **Credential containment and one BOS login.** Public source and generated
   clients contain no secrets or customer data. Each user-facing client context
   authorizes one root BOS MCP resource through host-managed OAuth 2.1. Claude
   uses one BOS account or organization Web connector; Copilot and Gemini
   declare the BOS resource directly; ChatGPT/Codex loads the root package's
   generated `.mcp.json` and derives authentication from BOS OAuth discovery.
   Education Center, CRM,
   Marketing Director, and other
   subservice plugins never create another BOS connection or login.
   Packages contain no user-entered BOS credential. Missing provider grants recover through
   BOS-hosted HTTPS authorization or credential collection and are stored only
   by the BOS service.
6. **Fail-closed execution.** Missing or ambiguous canonical state produces an
   explicit error and no fallback authority.
7. **Canonical generation.** Product manifests compose canonical sources into
   deterministic, equivalent client distributions.
8. **Customer-safe updates.** Package updates replace package-owned content and
   preserve customer-owned extensions with explicit compatibility warnings.
9. **Evidence-based approval.** Reviews inspect the actual diff, controlling
   Vault sources, current issue history, and validation results before approval.
   Every repository mutation requires the local Oracle's literal `APPROVED`
   verdict. A correction after review requires a fresh review of the complete
   updated diff.
10. **Repository specialization.** Application-specific rules extend these
    principles in the owning application repository and never weaken them.
11. **Customer configuration isolation.** Skills and generated clients contain
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
14. **Generic education product identity.** `Education Operation Center` is the
    reusable childhood-education franchise product display identity. The stable
    technical package and vertical identity remains `education-center`. Each tenant
    supplies its customer-facing franchise or brand name through the
    customer-owned settings initialization workflow. Skills apply that value to
    display copy only; technical identifiers remain package-owned.
15. **Server-evaluated subservices.** Every subservice request travels through
   the authenticated BOS connection. The server derives and validates
   organization, application, installation, subservice, plugin, role,
   capability, provider, and tool scope from canonical state for every request.
   Platform BOS operations never transit a subservice connection.
16. **Present-product completeness.** Implement and validate current products
    from their present contracts. Future products, anticipated growth, and
    expected package composition never satisfy a missing current capability or
    justify deferring its implementation.
17. **Single-organization default.** A multi-organization login selects exactly
    one authorized organization before ordinary domain execution. A validated
    local display-label preference supplies the default, and an explicit
    organization in the current request overrides it for that request.
    Cross-organization execution requires explicit scope. The preference never
    grants membership or stores an authority identifier.
