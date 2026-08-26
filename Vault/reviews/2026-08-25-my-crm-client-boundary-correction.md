# My CRM client boundary correction review

Date: 2026-08-25
Scope: BOS Operations Center My CRM package and Lead Director `crm` resource

## Finding corrected

The earlier implementation duplicated BOS platform behavior with a new generic
CRM façade, source catalog, recovery model, persistence repository, migrations,
and capability seeds. Lead Director already owned the resource-group registry,
operation catalog, provider adapters, federation PO, canonical authorization,
and existing persistence boundaries. My CRM requires client composition over
those primitives.

The duplicate Lead Director implementation was reverted in commit `8cc05e975`.
The two added migrations, their capability-publication path, the added recovery
repository/model/runtime code, and the matching tests were removed. No database
migration or data operation was executed as part of this correction.

## Evidence

- `Vault/specs/federated-query-execution.md:5-9` assigns the feature to the
  packaged client and states that it adds no service, schema, grant, or
  persistence. Lines 53-77 derive the client source map from `tools/list` and
  require absent tools to fail closed without creating server state.
- `source/capabilities/my-crm/SKILL.md:23-43` loads the live MCP manifest,
  selects only discovered operations, and forbids registration, capability,
  database, and cross-connection fallbacks. Lines 48-60 make explain and
  per-source fan-out client behavior.
- `source/capabilities/my-crm/references/tool-workflows.md:5-19` keeps discovery
  and freshness metadata local. Lines 21-46 call exact discovered source tools
  and compile explain locally. Lines 48-76 preserve underlying transaction
  guarantees and task-local eventual-consistency recovery.
- `source/platform/bos-federated-query/SKILL.md:18-39` owns manifest-derived
  planning, cache preflight, parallel source units, progressive evidence, and
  partial aggregation in the client. Lines 44-55 expressly create no server
  state or schema.
- `source/platform/bos-federated-query/scripts/federated-query.mjs:64-127`
  requires a manifest fingerprint and exact discovered tool in every plan and
  explain result. Lines 148-222 preserve the tool in normalized source results
  and cache identity.
- `Vault/specs/federated-query-execution.md:84-99` defines the implemented
  identity and field-authority boundary; lines 197-213 define bounded dataset
  freshness; and lines 367-375 bound task-local recovery without background
  state.
- `Vault/docs/my-crm-plugin-architecture-proposal.md:287-317` records the
  implemented client policy and leaves only external host activation and live
  acceptance as launch gates.
- In Lead Director,
  `backend/platform_orchestration/agent_operation_catalog.py:2483-2548` already
  defines Lead Director lead operations through the existing federation PO;
  lines 2755-2824 already define GoHighLevel, Gmail, and Calendar operations;
  lines 2930-2965 already define Calimatic operations.
- Lead Director commit `2f3a42224` changes only resource-group composition and
  its focused test. `backend/platform_orchestration/mcp_operational_profiles.py:82-98`
  maps existing operations to CRM-facing names, while lines 315-368 apply a
  fail-closed tool/plugin allowlist and safety annotations. It adds no model,
  repository, migration, seed, endpoint, or execution service.
- `backend/tests/unit/test_crm_mcp_operational_profile.py:113-200` verifies
  filtered discovery, exact aliases, opaque-context schemas, and mutation
  annotations. Lines 250-288 preserve raw-authority and foreign-context
  rejection.

## Boundary verdict

- Client-to-MCP alignment: approved.
- Skill grouping and explain/cache/fan-out ownership: approved.
- Existing BOS operation reuse: approved.
- Tenant, role, plugin, provider, and capability filtering: approved.
- Database impact from My CRM: none.
- Licensing and payment dependency: none.
- Final release validation: package and credential checks plus all 136 tests
  passed against the complete `0.4.47` branch.

APPROVED
