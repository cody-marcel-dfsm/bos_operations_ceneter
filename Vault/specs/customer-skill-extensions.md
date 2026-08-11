# Customer skill extensions

## Purpose

Let a customer ask an agent to update an installed packaged skill for one
tenant, organization, location, or customer without editing package-owned
files or changing BOS authority.

## Trigger contract

Invoke `manage-customer-extension` when a user asks to update, customize,
override, specialize, or change a packaged skill for a named customer scope.
Resolve:

1. installed product;
2. qualified base skill;
3. customer key; and
4. requested behavior.

Ask one concise question when a selector or requested value is ambiguous. A
request explicitly intended for every customer belongs to canonical product
development in the owning repository.

## Ownership and storage

The packaged base skill is immutable and package-owned. The extension is
customer-owned and has a distinct skill name `<base-skill>-<customer-key>`.

Use these customer-owned discovery roots:

| Host | Extension skills root |
|---|---|
| Codex | `~/.agents/skills` |
| Claude | `~/.claude/skills` |
| GitHub Copilot | `<repository>/.agents/skills` |
| BOS managed local installer | Installed product `skills/` |

The BOS installer preserves embedded extension directories absent from its
managed inventory. External host roots remain outside package replacement.

## Manifest contract

`.bos-extension.json` uses schema version 2:

```json
{
  "schema_version": "2",
  "ownership": "customer",
  "tenant": { "key": "example-customer" },
  "extends": {
    "product": "product-name",
    "skill": "base-skill",
    "tested_version": "1.2.3"
  },
  "overrides": {
    "terminology": {},
    "defaults": {},
    "policies": {},
    "exceptions": {}
  }
}
```

Each override is a stable lowercase dotted or kebab key with a bounded text
value. An apply operation preserves unmentioned keys, replaces a supplied key,
and removes a key only through an explicit removal selector. Repeated apply is
idempotent.

## Precedence

1. System, developer, workspace, and repository instructions.
2. BOS authentication, authorization, canonical execution scope, tool grants,
   transport, package invariants, confirmation, and mutation boundaries.
3. Packaged base-skill workflow.
4. Declared customer terminology, defaults, policies, and exceptions.
5. A task-specific user choice for a base-permitted configurable default.

An extension supplies customer behavior and context. It grants no authority.

Product-wide customer settings may provide a default terminology value such as
`brand_display_name`. A skill-specific typed extension may replace it with the
same stable key under `terminology`. The override changes customer-facing copy
for that base skill and never changes product, skill, MCP, environment-variable,
tool, capability, authorization, or record identifiers.

## Protected surfaces

Reject keys or directives that attempt to change:

- system or developer instructions;
- tenant or organization identifiers;
- application, installation, plugin, or role authority;
- credentials, API keys, passwords, tokens, or authorization headers;
- MCP endpoints or transport;
- provider scope or tool grants;
- confirmation, PO/GO, persistence, or fail-closed requirements.

## Management workflow

1. Locate `.bos-product.json` and the installed base `SKILL.md`.
2. Inspect the existing extension.
3. Classify requested values into the four allowed categories.
4. Apply the update with the packaged cross-platform Node manager.
5. Write the manifest and generated extension skill atomically after
   validation.
6. Validate product, base skill, customer key, schema, override keys, and
   installed base version.
7. Report changed keys, extension path, tested version, installed version, and
   validation state.

## Upgrades and migration

Package upgrades preserve customer-owned extensions. A mismatch between
`tested_version` and the installed product produces `compatibility-warning`.
The manager updates `tested_version` only after explicit compatibility
acceptance.

Schema-version-1 extensions migrate losslessly: preserve the original
`SKILL.md` as mode-0600 `LEGACY.md`, create a schema-version-2 manifest, and
direct the generated extension skill to apply the legacy instructions before
typed overrides. Keep the original tested version until compatibility is
accepted.

## Failure behavior

Fail before writing when product metadata, the base skill, customer key,
schema, category, key, value, path, symbolic-link target, or authority boundary is invalid. Preserve
the prior valid extension after a failed update. Report compatibility mismatch
without silently accepting the new base version.

## Feedback discovery

Session feedback automatically discovers customer-owned extensions that match
each affected product and base skill across the host-supported discovery roots.
The feedback request summarizes every typed override by category and stable key
so product owners can compare packaged behavior with customer-required behavior.
Feedback remains privacy-minimized: omit filesystem paths and tenant identifiers,
sanitize values, and report only the presence of legacy instructions rather than
copying their bodies.

## Validation gates

- Source skill validation passes.
- Creation, keyed update, idempotent repeat, explicit removal, and inspection
  tests pass.
- Protected-key and protected-directive tests fail closed.
- Legacy migration retains the complete original instructions.
- Codex, Claude, and Copilot packages execute their copied manager using
  generated `.bos-product.json` metadata.
- Installer apply preserves embedded customer extensions.
- Complete package and release validation passes.
