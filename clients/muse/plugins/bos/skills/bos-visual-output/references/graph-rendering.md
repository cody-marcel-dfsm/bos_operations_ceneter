# Render the graph on the active host

Check the active host's advertised inline visualization tools and rendering
guide. Some hosts expose a native `visualize` tool set rather than an installed
skill. Read that tool set's guide, select its diagram module when advertised,
and invoke its inline renderer with the verified domain-selected route. Use
the exact discovered tool names and input schema. An installed skill with the
same name is not required when those native tools are available.

Prefer that inline renderer, including in Claude Code Desktop when it exposes
native visualization tools. A fenced Mermaid block is a fallback only when
the active surface is known to render it. Claude Code Desktop can display that
block as literal source even while native inline visualization works. Host
name, a valid Mermaid syntax check, and an agent's claim of rendering do not
establish a rendered graph. ASCII arrows and code blocks leave graph delivery
incomplete unless the user explicitly requested text.

Use the packaged [delivery selector](../scripts/plan-graph-rendering.mjs) when
local script execution is available. Its stdin/stdout JSON is a client-owned
capability projection: `inline: {render_tool, guide_tool}` contains exact
advertised active-interaction tools, `mermaid_renders: true` requires confirmed
host support, and `format: "text"` honors the user's explicit preference.
The selector reads no CRM data, invokes no tool, and supplies no execution or
rendering proof. Supply only inline tools whose current guide establishes this
delivery; a guide tool alone is insufficient. Apply the same rules directly
when local execution is unavailable.

Render only the selected states, edges and necessary gates. Put plain labels
in native SVG text or diagram labels; apply bold emphasis through font styling.
Keep internal record, node, transition and provider identifiers out of visible
labels and ordinary prose unless specifically requested. Preserve the domain's source labels, conditions,
ranking and eligibility uncertainty. Keep alternative routes and negative
branches for an explicit request, with concise ranking/tie notes when needed.

Deliver the visual inside the active interaction, with requested fields and
source/freshness directly in the conversation below it. This workflow creates
no hosted Artifact, customer-data file, export, background server or additional
connection. If the selected renderer fails, check another advertised inline
renderer or the confirmed Mermaid fallback once. When no supported renderer
remains, keep verified fields visible and state the exact rendering limitation;
retain the incomplete graph status instead of claiming that raw code rendered.

Source tests check selection and response contracts. Published-client
acceptance separately records the installed version and release commit, actual
renderer action, and visually inspected output. A renderer call or passing
synthetic response check alone does not prove native presentation or automatic
CRM lookup completion.
