# Oracle review: required Codex app login surface

Date: 2026-09-01

## Scope

Review the actual BOS Operations Center diff for release 0.4.66. The change
restores the required registered-app dependency that ChatGPT/Codex uses to
display the BOS plugin connection action. BOS server code and infrastructure
are outside this review and remain unchanged.

## Findings

No blocking or advisory findings.

## Evidence

- `clients/codex/plugins/bos/.app.json:1-8` contains exactly one durable BOS app
  identity with `required: true`. The 0.4.65 artifact omitted that field, while
  the earlier registered-app package at commit `135f5ea` included it.
- `scripts/lib/package-model.mjs:528-540` generates the required app entry from
  canonical product metadata. `scripts/check-package.mjs:266-279` rejects
  generated output when the app is optional, malformed, or has extra fields.
- `scripts/install-package.mjs:126-140` fails installation verification when
  the required binding is absent or optional. `scripts/verify-codex-runtime.mjs:76-90`
  independently rejects an installed package whose app entry lacks
  `required: true`.
- `contracts/single-bos-mcp-connection.v1.json:1-23` makes
  `codex_app_required: true` part of the portable client contract.
  `scripts/lib/single-bos-contract.mjs:122-147` validates that contract field,
  and lines 253-266 enforce it against the generated Codex artifact.
- `source/platform/bos-mcp-client/SKILL.md:53-60` and
  `source/platform/bos-guided-support/references/client-runbooks.md:55-72`
  instruct future recovery work to treat a missing or false `required` value as
  a client display-binding defect, independently of MCP OAuth responses.
- `tests/codex-login-surface-contract.test.mjs:11-60` locks the complete
  generated app shape and keeps display binding independent from server OAuth
  discovery. `tests/codex-runtime-verification.test.mjs:182-210` and
  `tests/installer.test.mjs:182-194` reject the exact 0.4.65 optional-app
  regression in runtime and installation paths.

## Validation

- `npm run release:check`: passed; 209 tests passed.
- `npm run contract:check`: passed with zero violations.
- Focused Codex login, runtime, installer, package-model, and single-connection
  suites: passed.
- Skill validation: passed for `bos-mcp-client` and `bos-guided-support`.
- The bundled generic plugin validator rejects the host-recognized `required`
  field because its app schema currently accepts only `id` and `category`.
  Repository validation intentionally enforces the desktop runtime contract;
  the installed OpenAI Plugin Management package and the earlier working BOS
  registered-app artifact both use `required: true`.
- `git diff --check`: passed.

## Conclusion

The change restores the client-owned display binding, preserves the separate
server OAuth discovery contract, and prevents the omission across generation,
package validation, installation, runtime verification, skills, and tests. It
does not alter server behavior or create a fallback authentication path.

APPROVED
