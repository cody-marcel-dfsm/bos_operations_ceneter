# Canonical Codex marketplace layout

## Decision

BOS-managed Codex products use one physical marketplace tree:

```text
~/.agents/bos-education-center-marketplace/
├── .agents/plugins/marketplace.json
└── plugins/
    ├── bos/
    ├── education-center/
    └── ism-meta-ads/
```

Each product entry is a real directory. The marketplace manifest references
that directory with `./plugins/<product>`. BOS does not create a second
`~/plugins/<product>` directory or a marketplace symlink.

The installer owns released files within each product and preserves these
customer-owned locations:

- `config/customer-settings.json` for product-wide tenant values;
- `skills/<base-skill>-<tenant-key>/.bos-extension.json` and its sibling
  `SKILL.md` for optional per-skill customization.

The settings template and packaged skills remain package-owned. A customer
extension directory exists only after a tenant requests a per-skill change.

The same marketplace also owns subservice skill packages managed by this
project. `ism-meta-ads` is the private Lead Director package for Meta Ads
workflows. It is a separate product from `video-ads`; the latter is a disabled
creative-generation product. A managed private package remains `AVAILABLE`
until its BOS-routed tool catalog and authority contract are current, then it
may be installed explicitly. Subservice packages contain no MCP connection or
MCP binding. The account-app form of this binding is superseded by
`2026-08-29-codex-package-owned-mcp.md`.

## Upgrade behavior

During apply, the installer recognizes the retired `~/plugins/<product>`
directory and a marketplace symlink that resolves to it. After validating the
product metadata and link target, the installer removes the link and moves the
physical product directory into the canonical marketplace tree. Existing
settings, extensions, and unmanaged customer files move with the product.

If both retired and canonical physical directories exist, installation stops
for review. This avoids choosing between two potentially divergent customer
states.

An upgrade replaces entries for products declared by the installed release
and preserves validated application skill-group entries such as
`ism-meta-ads`. Preservation keeps Lead Director packages inside the same
physical marketplace without silently publishing them in the Education Center
customer distribution.

## Outcome

Finder, the installer, the extension manager, and Codex all show the same
product path. Tenant settings have one location, packaged skills have one
location, and optional extensions sit beside the base skills they customize.
