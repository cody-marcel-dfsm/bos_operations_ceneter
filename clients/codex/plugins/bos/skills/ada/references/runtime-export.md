# Producer-owned Ada runtime export

The shared `references/behavior-core.md` is the single primary runtime
instruction entry. Host SKILL wrappers read the same core. The closed
`runtime-export.json` profile classifies every root-skill file: instruction,
supporting_reference, resource, ui, host_wrapper or metadata. Only the selected
core and Markdown supporting references are emitted with text. Scripts remain
resource metadata; UI, host wrappers and descriptors stay separate. No fetched
script is executed. Full exact manifest dependencies are integrity-checked and
version-reported, without injecting their host-oriented prompts into a runtime.

The producer CLI `scripts/export-runtime-skill.mjs` accepts exact `--commit`,
`--release` and `--skill ada@VERSION` pins, reusing the existing public repository,
`skill-release-manifest.json` and read-only pinned Git resolver. It writes one JSON
artifact to stdout and creates no consumer source copy. The normal path requires
the existing published-main ancestry and native source-provenance checks before
emitting behavior. A local preview requires explicit `--preview` and has
`status: unpublished_preview`; it is never production-admitted.

The JSON envelope contains exactly `artifact`, `profile`, `pin`, `status`,
`contentRevision`, `dependencies`, `entries`, `resources` and `provenance`:

- `artifact` is `bos-runtime-skill`; `profile` is `ada-conversation`.
- `pin` contains repository, full immutable commit, exact repository release,
  skill and exact skill version. Package/skill/artifact revisions are separate
  from public API versions.
- `status` is `published_admitted` or `unpublished_preview`.
- `contentRevision` is SHA-256 of canonical JSON (two-space indentation, trailing
  newline) for `{profile, closure}`. `closure` is the alphabetically sorted exact
  skill map with each version, requires and complete per-file hash/mode inventory.
  Obtain inventories from the pinned release manifest; select only the required
  transitive closure. `profile` is the verified runtime-export.json object.
- `dependencies` maps every transitive dependency except Ada to its exact version.
- `entries` contain path, role, sha256, mode, mediaType (`text/markdown`) and text.
  Role is instruction or supporting_reference. `resources` contain only path,
  role, sha256 and mode. Paths are relative to the root Ada skill. All inventory
  ordering is deterministic. Digests cover original UTF-8 file bytes.
- `provenance` reports method and source commit. The normal method is
  `published_main_native_provenance`; preview uses `unpublished_preview`.

Consumers admit artifacts through their trusted artifact-loader path, binding
the expected owner, immutable pins, profile, contentRevision, complete inventory
and publication proof. Never trust a caller/model-provided status, source hash or
provenance string as publication evidence. Revalidate publication through the
trusted producer/export pipeline or equivalent independent native verification.
Cached artifacts retain their exact admission identity; no mutable latest ref,
automatic upgrade or preview-to-production promotion is permitted. A changed
artifact requires fresh exact admission. Source-only verification supplies no
publication permission and never bypasses the existing release/history gate.

The runtime adapter supplies authorized identity, current work/discovery, exact
approval/effect checks and contract-verified execution. App-owned templates may
supply goals, checklist and entry copy as lower-trust domain data, while generic
Ada behavior comes from the admitted producer artifact. They cannot override
the core's scope, consent or safety rules. No sibling source/build dependency,
new transport, credential lifecycle or public API version is introduced.
