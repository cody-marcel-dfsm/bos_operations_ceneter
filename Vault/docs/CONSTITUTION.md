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
   secrets or customer data. A scoped client uses its single provisioned API
   key. Missing provider grants recover through BOS-owned secure handoff or
   OAuth and are stored only by the BOS service.
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
