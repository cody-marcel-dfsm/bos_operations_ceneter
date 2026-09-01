# Implementation status

## Runtime contract

- BOS is the only connection-owning product.
- The BOS resource is `https://dfsm.ai/mcp/apps/bos/platform`.
- Education Center, CRM, Marketing Director, and other subservices contain no
  BOS connection binding.
- The BOS service evaluates authorization and tool availability per request.
- Provider authorization remains installation- and plugin-scoped behind BOS.

## Package contract

`products/bos/product.json` owns the runtime, application name, and MCP group.
Every subservice manifest omits those fields.
The generator emits host-native connection files only for BOS and records the
BOS-owned connection in subservice metadata.

## Validation contract

Package, installer, client-parity, credential-containment, and marketplace tests
must prove that one BOS login enables every authorized installed subservice and
that no subservice exposes another BOS authentication action.
