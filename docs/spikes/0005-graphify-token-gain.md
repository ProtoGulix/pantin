# Spike 0005. Real token gain of Graphify on this repository

- Date: 2026-09-29. Graphify CLI `graphify`, PyPI package `graphifyy` 0.8.35.
- Scope: CLAUDE.md section 6 item 6 and section 12, spike 6. AST mode only:
  no semantic extraction, no `label`, no LLM call was made.
- Repository state: HEAD `60589d2` plus uncommitted edits by other agents
  (packages/core, packages/viewer). Token counts use **characters / 4**
  everywhere (the same approximation Graphify uses).

## Question

Does `graphify query "<q>" --budget 1500` really save tokens compared with
reading the files needed to answer a realistic orientation question, and what
does it cost to keep the graph fresh?

## Verdict

**No measurable gain for natural-language questions: the graph answer is
smaller, but it pointed to the right files in 0 of 8 cases (1 partial).**
In AST mode the query matches question words against node labels (symbol and
file names), so generic words ("module", "save", "files", "Path") win and the
BFS drifts to unrelated code. When the question contains the exact identifier,
the graph is correct and useful (`graphify explain <symbol>` gives callers and
callees in ~130 tokens), but then `grep` finds the same place for a similar
cost. The built-in `graphify benchmark` figure (16.3x) compares a subgraph with
the whole repository and does not check relevance: it is not a real gain.
Keeping the graph fresh is cheap (~2 s, no tokens) and the post-commit hook works.

## Method

1. `graphify benchmark`, and its source (`graphify/benchmark.py`, `__main__.py`).
2. Eight orientation questions, run with `graphify query "<q>" --budget 1500`.
   Ground truth found with `grep` and by reading the code. "Files" = minimal set
   of whole files one would read without the graph. Q7 is a negative control
   (the tag bus is not implemented yet).
3. Five follow-up queries phrased with identifiers, plus `graphify explain`.
4. `graphify update .` timed (incremental in the repo, cold on a scratch copy
   of the tracked files); `lefthook run post-commit` run by hand.

## Results

### How `graphify benchmark` computes its number

Output here: corpus ~109,666 tokens, 1,645 nodes, 3,522 edges, average query
~6,738 tokens, **"16.3x fewer tokens per query"**. Method, from source:
- Corpus size: `total_words` from `.graphify_detect.json` if present; it is
  absent here, so it is **estimated as nodes x 50 words**, then x 4/3 to tokens.
  (Actual tracked text: 533,584 bytes, ~133k tokens; code only ~98k tokens.)
- Questions: five fixed generic ones ("how does authentication work",
  "what are the core abstractions"...), not about this repository.
- Query cost: top 3 label-matching nodes, BFS depth 3, no budget, NODE/EDGE
  lines counted at 4 chars per token.
- Ratio = whole corpus / subgraph. Nobody reads the whole repo to answer one
  question, and the relevance of the subgraph is never checked.

### Practical comparison (natural-language questions)

| # | Question | Graph tok | Graph pointed to | Right? | Files needed (whole) | Files tok |
|---|---|---|---|---|---|---|
| 1 | Where is the Host header checked | 853 | path-traversal tests, test-server, Python `ConversionResult` | wrong | core/src/http/request-handler.ts, core/src/domain/network-config.ts | 2,156 |
| 2 | How does STEP import reach the Python converter | 110 | 3 isolated nodes (`ConverterError`, a Python test, a workspace test) | wrong | core/src/service/import-operations.ts, core/src/converter/step-converter.ts, core/src/converter/process-runner.ts, step-converter/.../\_\_main\_\_.py | 3,577 |
| 3 | Which module converts core frames to Babylon | 36 | `module` key of tsconfig.base.json | wrong | viewer/src/frames.ts | 1,558 |
| 4 | How are unsaved mesh deletions handled on save | 1,158 | `save()` helper in discard.test.ts, test-server | wrong | core/src/service/mesh-lifecycle.ts, core/src/service/open-pantins.ts | 2,265 |
| 5 | Where are translations loaded | 1,159 | viewer scene (`LoadedBody`, viewport.ts) | wrong | viewer/src/i18n/translate.ts | 582 |
| 6 | What enforces package boundaries | 333 | `boundaries` script in package.json (`depcruise`) | partial | .dependency-cruiser.cjs, package.json | 828 |
| 7 | How does the viewer receive tag updates from the core (control: not implemented) | 1,210 | Python converter errors | wrong (no "absent" signal) | none; one grep, ~370 tok, shows it is absent | 0 |
| 8 | Where is path traversal prevented for mesh files | 1,169 | Python converter, biome.json | wrong | core/src/store/safe-paths.ts, core/src/store/pantin-store.ts | 1,967 |
| | **Total** | **6,028** | | **0 / 1 / 7** | | **12,933** |

Raw ratio 12,933 / 6,028 = 2.1x, but since 7 answers were wrong the agent
would still have to grep and read the files: in practice the graph query is
an **extra** ~750 tokens per question, not a saving.

### Identifier-phrased queries (the graph used as intended)

| Query | Tok | Right? | Note |
|---|---|---|---|
| `query "isHostAccepted"` | 1,167 | correct | network-config.ts, request-handler.ts |
| `query "frames.ts"` | 1,174 | correct | frames.ts and its users (viewport, stage) |
| `query "resolveInside"` | 1,168 | correct | safe-paths.ts, pantin-store.ts |
| `query "translate.ts"` | 1,178 | partial | 246 nodes reached, translate.ts barely shown |
| `query "pendingMeshDeletions"` | 6 | no match | object fields are not nodes |
| `explain "isHostAccepted"` | 130 | correct | location + 7 typed call/import edges |

For comparison `grep -rn isHostAccepted packages` is ~190 tokens. The graph's
added value is typed relations (who calls, who imports), not locating code.
Reading GRAPH_REPORT.md costs ~6,170 tokens.

### Cost of keeping it fresh

| Item | Measured |
|---|---|
| `graphify update .` incremental (136 of 202 files uncached) | 2.7 s |
| `graphify update .` with nothing changed | 2.0 s |
| Cold build on a copy of tracked files | 2.6 s |
| Graph | 1,645 nodes (1,456 code, 156 document, 33 rationale), 3,522 edges, 108 communities |
| Edges by confidence | 3,474 EXTRACTED, 48 INFERRED |
| graphify-out/ on disk | 4.0 MB (graph.json 1.7 MB, graph.html 1.5 MB, cache 0.9 MB), git-ignored |
| Tokens spent | 0 (no LLM) |

Post-commit hook: `.git/hooks/post-commit` is lefthook's; `lefthook run
post-commit` ran the `graphify-update` job in 1.98 s. graph.json was
rewritten at 07:41:53, between two commits by other agents, so the hook fires
in practice. Caveats: the job discards output and ends in `|| true`, so a
failure is silent; it also indexes the working tree (uncommitted edits
included), not the commit.

## Vendor claims vs measured

| Claim | Source | Measured here |
|---|---|---|
| "71.5x fewer tokens per query vs reading the raw files", 52-file mixed corpus (Karpathy repos + 5 papers + 4 images) | README v4, https://github.com/safishamsi/graphify/blob/v4/README.md (fetched 2026-09-29) | Not reproduced. Built-in benchmark 16.3x (method flawed, see above); practical: no gain, 0/8 correct |
| Same README: 5.4x (4 files), ~1x (6 files); "reduction scales with corpus size" | same | Consistent with a ~200-file repo gaining little |
| User report that Graphify increased token use in Claude Code | https://github.com/safishamsi/graphify/issues/580 | Consistent with our result |

## NOT VERIFIED

- Real token counts from a tokenizer: all numbers use chars / 4.
- The 71.5x vendor figure on its own corpus (not rerun).
- Semantic (LLM) extraction mode: excluded by instruction. It might answer
  natural-language questions better, at a token cost not measured here.
- End-to-end session cost (an agent with and without the graph on the same
  task); only per-question retrieval cost was measured.
- That every commit triggers the hook (seen once in practice, once by hand).
- `graphify path` was not measured.

## Recommendation for CLAUDE.md section 6

- Item 2: do not make `graphify query "<natural question>"` the mandatory first
  step. When a symbol name is known, use `graphify explain "<symbol>"` or
  `graphify path "<A>" "<B>"` for callers, callees and imports. For
  natural-language orientation, use `grep` or delegate to an Explore subagent.
- Do not read graphify-out/GRAPH_REPORT.md for orientation (~6k tokens).
- Item 3: keep the lefthook post-commit update: ~2 s, no tokens.
- Item 6: replace "NOT VERIFIED" with a pointer to this report: vendor 71.5x,
  built-in benchmark 16.3x (flawed), measured on 8 questions: no gain in AST mode.
- Align the English `## graphify` block at the end of CLAUDE.md with the above.
- Measure again when the repo is several times larger, or if semantic mode is
  approved.
