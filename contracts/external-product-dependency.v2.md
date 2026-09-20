# BOS-owned connection dependency contract v2

A dependent product retains its application skills and runtime requirements and
uses the installed BOS foundation's connection. BOS alone declares the platform
MCP resource and native OAuth action. The host owns token storage and refresh.
The service enforces the exact actor, organization, application, installation,
role, capability, and provider scope for every operation.

## Package metadata

Publish `.bos-product.json` with schema version `2`, the product's name, version,
client, descriptive application name, `connection_owner: "bos"`,
`dependency_products: ["bos"]`, and `authentication: "bos_dependency"`.
Retain `ONE_ORGANIZATION_APPLICATION_INSTALLATION_ROLE_PER_GRANT` and the generic
`bos.authentication-handoff/v1` readiness contract. Package identity supplies no
execution authority and never selects server context.

Dependent packages contain no MCP endpoint, OAuth configuration, native MCP
binding, or connector instructions. BOS contains the single transport
configuration. Domain skills discover authorized operations through BOS and
preserve the pending request across automatic authentication recovery. Native
consent may require direct user interaction; a revoked grant stays revoked.

The installed BOS package publishes `bos-external-dependency-adapter` as the
executable dependency seam. Its public methods are `recoverAuthentication`,
`waitForAuthentication`, `invokeReturnedAction`, and `invokeStateAction`.
External products supply only the exact resource/condition or server-returned
action/payload. BOS injects the existing host transport and fresh context
provider, keeps tokens and identity-v2 handles private, and preserves
header-free legacy/v1 invocation.

Validate against `external-product-dependency.v2.schema.json` and run:

```bash
node scripts/verify-product-mcp-contract.mjs --external-product-root /absolute/path/to/package --format json
```

## Upgrade and compatibility

Version 1 describes independent product connections. It remains available for
explicit legacy validation with `--external-contract-version 1`. A successful
v1 check never establishes v2 compatibility. Upgrade through a published package
release, preserve customer settings and unrelated plugins, and verify removal
of the superseded product transport through supported host controls. Never
rewrite an installed cache or reuse its released version label.

The platform service must support the selected, explicitly authorized application
context before the v2 package cutover is accepted. Preserve existing grants,
audience validation and fail-closed request-time authorization. Verify native BOS
login, live application discovery, the requested operation and its rendered
result against the published release. Source checks alone establish no live
acceptance.

## Versioned identity-context compatibility

Generated first-party runtime metadata may additionally declare
`execution_context_compatibility: bos.identity-context-compatibility/v1`.
The separate `identity-context-compatibility.v1.json` defines its activation:
only a live `bos-identity-mcp/v2` response and callable context discovery/execution
tools enable per-operation contexts. The legacy `authorization_scope_policy`
field retains its meaning for legacy discovery and external v2 consumers.
This opt-in contract does not widen an existing grant. New consumers must apply
the versioned branch before legacy instructions; unsupported versions fail closed.
