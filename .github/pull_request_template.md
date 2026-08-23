## Summary

Describe the workflow, client adapter, or documentation change.

## Security

- [ ] No credentials, customer data, private endpoints, or local user paths.
- [ ] Authentication remains in a secure BOS-hosted flow.
- [ ] Tenant scope is resolved from authenticated BOS context.

## Validation

- [ ] Credential-free local `npm run release:check`
- [ ] Changed skills pass `quick_validate.py`
- [ ] For a Claude release, the version is declared once in each generated `plugin.json`
- [ ] For a Claude release, this version-bump PR will be merged to trigger marketplace sync
