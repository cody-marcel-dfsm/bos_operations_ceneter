## Summary

Describe the workflow, client adapter, or documentation change.

## Security

- [ ] No credentials, customer data, private endpoints, or local user paths.
- [ ] Authentication remains in a secure BOS-hosted flow.
- [ ] Tenant scope is resolved from authenticated BOS context.

## Validation

- [ ] Oracle utility returned `APPROVED` for the exact committed tree.
- [ ] Commit has matching receipt-derived `Oracle-Verdict`, `Oracle-Reviewed-Tree`, and `Oracle-Receipt-SHA256` trailers.
- [ ] Credential-free local `npm run release:check`
- [ ] Changed skills pass `quick_validate.py`
- [ ] For a Claude release, the version is declared once in each generated `plugin.json`
- [ ] For an organization-managed Claude release, automatic GitHub sync is enabled
