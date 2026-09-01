# Local Oracle review: Codex login incident context

Date: 2026-09-01

## Scope

Review only the repository-local Oracle update that records the Codex BOS login
incident, its package and resolver causes, the repository correction, and the
required end-to-end acceptance evidence. Existing release 0.4.69 worktree
changes are outside this approval.

## Findings

No material findings.

## Evidence

- `.agents/skills/oracle/SKILL.md:14-24` routes missing Codex login actions,
  unavailable registered apps, and absent callable tools to the focused
  incident reference.
- `.agents/skills/oracle/SKILL.md:26-41` requires package binding,
  registered-app resolution, OAuth grant state, and callable discovery to be
  evaluated as independent readiness layers.
- `Vault/docs/codex-registered-app-incident.md:7-26`
  records the 0.4.65 optional-app regression, the 0.4.66 `required: true`
  correction, the independent resolver 404, and the replacement app identity
  plus bounded retired-identity cleanup.
- `Vault/docs/codex-registered-app-incident.md:27-62`
  defines four-layer readiness and requires live `ok: true` runtime evidence
  before approving the end-to-end result.
- The update remains under `.agents/skills/oracle`; generated customer clients
  contain no Oracle skill.

## Validation

- Local Oracle skill validation: passed.
- Repository-local Oracle exclusion test: passed.
- `git diff --check`: passed.

## Conclusion

The local Oracle now retains the causal chain, resolution boundaries, current
identity transition, and acceptance requirements needed to avoid repeating the
misdiagnosis. The update does not approve the separate 0.4.69 release or claim
live registered-app resolution without host evidence.

APPROVED
