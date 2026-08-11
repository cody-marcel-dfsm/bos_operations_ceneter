# Canonical Codex marketplace layout

## Decision

BOS-managed Codex products use one physical marketplace tree:

```text
~/.agents/bos-education-center-marketplace/
├── .agents/plugins/marketplace.json
└── plugins/
    ├── bos/
    └── education-center/
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

## Upgrade behavior

During apply, the installer recognizes the retired `~/plugins/<product>`
directory and a marketplace symlink that resolves to it. After validating the
product metadata and link target, the installer removes the link and moves the
physical product directory into the canonical marketplace tree. Existing
settings, extensions, and unmanaged customer files move with the product.

If both legacy and canonical physical directories exist, installation stops
for review. This avoids choosing between two potentially divergent customer
states.

## Outcome

Finder, the installer, the extension manager, and Codex all show the same
product path. Tenant settings have one location, packaged skills have one
location, and optional extensions sit beside the base skills they customize.
