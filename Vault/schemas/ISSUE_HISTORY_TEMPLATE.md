# Operations Center issue-history schema

Use this schema for `Vault/docs/issues/ISSUE_HISTORY.md` and conclusion records
under `Vault/docs/issues/conclusions/`.

## Required rules

1. Preserve existing issue records and their numeric identities.
2. Check the active tracker and conclusion records before creating a new issue.
3. Append evidence and attempts to the matching issue instead of duplicating it.
4. Record user-visible symptoms separately from the technical root cause.
5. Mark an issue resolved only after focused validation and Oracle approval.
6. Preserve failed attempts because they are regression-prevention evidence.
7. Synchronize the Chroma-backed Vault index after every update.

## Active issue format

```markdown
## Issue #NNNN: Short user-visible title

- Status: ACTIVE | FIXED LOCALLY | RESOLVED | ARCHIVED
- Priority: CRITICAL | HIGH | MEDIUM | LOW
- Date identified: YYYY-MM-DD
- Area: package, client, auth, installation, release, documentation, or review
- Files: exact repository paths

### User goal and definition of done

### Observed evidence

### Root cause

### Required correction

### Attempts

### Validation and Oracle review

### Prevention guidance
```

## Conclusion record format

Conclusion records use `ISSUE_NNNN_CONCLUSION.md` and preserve:

- final status and resolution version;
- user-visible symptom and impact;
- causal chain and rejected assumptions;
- exact correction and owning files;
- focused, regression, contract, and live acceptance evidence;
- Oracle verdict and review record;
- prevention guidance and related issues.
