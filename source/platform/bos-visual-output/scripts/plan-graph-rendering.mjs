import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

// Local presentation capability projection; never a BOS operation or schema.
// Tool names come from the active host catalog, after checking its guide.
export function planGraphRendering(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Host capabilities are required");
  const format = input.format ?? "auto";
  if (!["auto", "text"].includes(format)) throw new TypeError("Unknown output format");
  if (format === "text") return {status: "text", graph_required: false};
  const inline = input.inline ?? {};
  if (typeof inline !== "object" || Array.isArray(inline)) throw new TypeError("Inline capability must be an object");
  for (const field of ["render_tool", "guide_tool"]) {
    if (inline[field] !== undefined && (typeof inline[field] !== "string" || !inline[field].trim())) {
      throw new TypeError("Advertised tool names must be nonempty strings");
    }
  }
  if (input.mermaid_renders !== undefined && typeof input.mermaid_renders !== "boolean") {
    throw new TypeError("Mermaid rendering must be established as a boolean");
  }
  if (inline.render_tool) return {status: "ready", kind: "native-inline",
    render_tool: inline.render_tool, guide_tool: inline.guide_tool ?? null};
  if (input.mermaid_renders === true) return {status: "ready", kind: "mermaid"};
  return {status: "unavailable", graph_required: true, reason: "NO_CONFIRMED_RENDERER"};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    let source = "";
    for await (const chunk of process.stdin) source += chunk;
    process.stdout.write(JSON.stringify(planGraphRendering(JSON.parse(source))) + "\n");
  } catch (error) {
    process.stderr.write(error.message + "\n");
    process.exitCode = 1;
  }
}
