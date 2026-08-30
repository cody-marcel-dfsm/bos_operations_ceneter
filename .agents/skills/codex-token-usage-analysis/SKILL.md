---
name: codex-token-usage-analysis
description: Analyze local Codex session logs, aggregate token consumption by user request, and identify the prompts, projects, models, dates, tool I/O categories, MCP usage, and execution patterns that consume the most tokens. Use when the user asks about Codex token usage, expensive requests, MCP versus other I/O, tool-call volume, context-window consumption, cached versus uncached input, reasoning/output usage, or opportunities to reduce Codex usage.
---

# Codex Token Usage Analysis

Use the bundled analyzer to produce evidence from local Codex JSONL session
logs. Treat one request as one user message plus every model call and tool call
that follows it until the next user message or task completion.

## Run the analysis

For a general request such as "summarize my token usage," analyze the most
recent 30 days and run both analyzers. The token report alone is incomplete.

```bash
python3 <skill-dir>/scripts/analyze_codex_tokens.py --days 30 --limit 15
python3 <skill-dir>/scripts/analyze_codex_io.py --days 30 --output /tmp/codex-io-analysis.json
```

The default scans `$CODEX_HOME/sessions` and `$CODEX_HOME/archived_sessions`,
or `~/.codex` when `CODEX_HOME` is unset. It redacts prompt content while
retaining timestamp, request ID, project, model, prompt length, call count, and
token metrics.

Use the smallest scope that answers the request:

```bash
python3 <skill-dir>/scripts/analyze_codex_tokens.py --days 30 --limit 25
python3 <skill-dir>/scripts/analyze_codex_tokens.py --since 2026-07-01 --project lead_director
python3 <skill-dir>/scripts/analyze_codex_tokens.py --sort uncached --prompt-mode preview
python3 <skill-dir>/scripts/analyze_codex_tokens.py --format csv --output /absolute/path/token-usage.csv
python3 <skill-dir>/scripts/analyze_codex_tokens.py --format json --output /absolute/path/token-usage.json
python3 <skill-dir>/scripts/analyze_codex_io.py --output /absolute/path/codex-io-analysis.json
```

If a command yields a live process/session ID, poll it until its actual exit
code is available. Do not treat the initial empty yield as completion. Keep
temporary JSON outside the user's workspace unless the user requests an
artifact.

Only use `--prompt-mode preview` or `--prompt-mode full` when the user requests
prompt-level identification or the output remains in a user-approved private
location. Never paste sensitive prompt text into a public issue, commit, or
external service.

## Interpret the metrics

- Rank by `total_tokens` to find requests that consumed the most context and
  generation tokens.
- Rank by `uncached_input_tokens` to find requests that introduced the most new
  context and are the strongest optimization candidates.
- Treat `reasoning_output_tokens` as a subset of output usage; never add it to
  total tokens again.
- Use `model_calls` to distinguish a single large response from a tool-heavy
  agent loop.
- Use `cached_input_percent` to distinguish reused context from newly processed
  context.
- Treat local token counts as activity evidence. Do not convert them directly
  into ChatGPT credits or API cost without current model, plan, service-tier,
  and pricing data.
- Use `analyze_codex_io.py` for MCP-versus-other-I/O questions. Report its call
  counts and payload characters as exact log measurements. Report its
  token-equivalent values as estimates based on four characters per token.
  Never present tool-level token-equivalents as exact model billing because
  Codex token events do not allocate model input tokens to individual tools.

## Report findings

Default to a visual-first dashboard. Do not lead with a long request table.
Use compact Unicode bars, small Markdown tables, and clearly labeled totals so
the user can understand the distribution at a glance. Include all of these
sections unless the user requests a narrower view:

1. **Headline metrics:** date range, files, requests, model calls, total model
   tokens, uncached input, cached-input percentage, output, and reasoning.
2. **Inference composition:** a bar chart for cached input, uncached input, and
   output. State that reasoning is included in output. This is the regular
   model-inference view.
3. **Project and model concentration:** horizontal bars with values and shares.
4. **Tool I/O:** a bar chart of MCP, shell/filesystem, agents/threads,
   browser/media, planning/state, and other local tools. Show exact call counts
   and payload characters; label four-characters-per-token conversions as
   estimates.
5. **MCP detail:** top MCP servers by calls and text payload size, plus material
   media payloads. Always include MCP even when its share is small.
6. **Largest loops:** show only the three to five largest requests, with model
   calls, total tokens, uncached input, and cache percentage.
7. **Actions:** two or three direct recommendations tied to observed drivers.

Use one shared reporting period for both analyzers. Never compare an all-time
token report with a 30-day I/O report without prominently labeling the mismatch.

Keep model tokens separate from tool payload estimates. Tool payloads become
part of model context selectively and cannot be reconciled one-for-one with
token events. Describe the two views as:

- **Model inference:** exact logged cached input, uncached input, and output.
- **Tool I/O:** exact logged calls and characters, with approximate text-token
  equivalents.

Lead the interpretation with:

1. The highest-consuming request or pattern.
2. Its total and uncached-input tokens.
3. The likely driver supported by call count, prompt size, cache ratio, project,
   and model.
4. Two or three direct changes that will reduce usage.

Call out incomplete or malformed logs using the analyzer's warnings. State the
date range, number of requests, and number of session files scanned so the
result is reproducible.
