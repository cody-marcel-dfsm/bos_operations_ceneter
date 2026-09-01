# Contributing

Contributions are welcome through issues and pull requests.

1. Keep canonical skills in `source/skills`.
2. Keep client-specific metadata in `clients`.
3. Never add credentials, customer data, private endpoints, or tenant-specific
   authorization material.
4. Install `tools/requirements-dev.txt`, synchronize the local Chroma-backed
   Vault index, and query current issue history before implementation.
5. Run the credential-free local `npm run release:check`.
6. Submit the complete actual diff and validation evidence to the
   repository-local Oracle. Resolve every `REJECTED` finding and request a fresh
   review until the verdict is `APPROVED`.
7. Describe behavioral and security effects in the pull request.

By contributing, you agree that your contribution is licensed under
Apache License 2.0.
