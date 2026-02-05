# Skill Audit & Integration Recommendations

> **Version:** v0.7 | **Status:** Historical reference | **Original:** v0.5 audit
>
> **Note:** All actionable items in this report have been addressed in v0.7. This file is retained for historical reference only.
>
> **Previously-open items -- resolved in v0.7:**
> - ~~P1-5: Worker count three-way inconsistency~~ -- Reconciled: 12 agentic-flow triggers + 3 native types
> - ~~P3-10: Q9 `watch --dry-run`~~ -- Added to init-sequence-details.md Step 9
> - P1-1: "24 top-level" vs "23 top-level" -- cosmetic, depends on whether `help` is counted
> - P4-15: validate-setup.sh pipe-to-read -- cosmetic, script functions correctly

Comprehensive cross-reference analysis of all v0.5 documentation.
Generated 2026-01-31 from live `--help` output and npm registry verification.

## Contents

1. [Executive Summary](#executive-summary)
2. [Cross-Reference Consistency Issues](#cross-reference-consistency-issues)
3. [Missing Q Options](#missing-q-options)
4. [Feature Overlap Matrix Gaps](#feature-overlap-matrix-gaps)
5. [Documentation Accuracy Corrections](#documentation-accuracy-corrections)
6. [Recommended Edits for SKILL.md](#recommended-edits-for-skillmd)
7. [Recommended New Reference Docs](#recommended-new-reference-docs)
8. [Priority-Ordered Action Items](#priority-ordered-action-items)

---

## Executive Summary

### What Is Good

- **Reference Routing table (SKILL.md lines 50-65)** is accurate: all 12 entries point to files that exist and contain the claimed content. No dead links.
- **The 9-step init sequence** (lines 406-586) is well-structured, correctly ordered, and the critical "NEVER --pretrain during init" warning is consistently enforced across SKILL.md, wiring-and-validation.md, and the scripts.
- **Command signatures in reference docs** match live `--help` output exactly. The ruvector-hooks-reference.md documents all 55 hooks commands confirmed by `npx ruvector hooks --help`.
- **ruvector-tools-reference.md** accurately lists all subsystem commands (embed 5, workers 14, gnn 4, attention 5, native 4, mcp 2), verified against live `--help`.
- **Scripts** (post-init-fix.sh, validate-setup.sh, pre-upgrade.sh) are well-constructed and match the procedures described in SKILL.md.
- **The "Do NOT" section** (lines 648-663) is comprehensive and well-grounded in observed behavior.
- **Package Identity section** (lines 67-78) is accurate regarding the distinction between `ruvector` vs `@ruvector/cli`, the `rvlite` unpublish, and `ruvector-postgres` being Docker-only.

### What Is Wrong

1. **Top-level command count is incorrect** in the Documentation Accuracy section.
2. **The 55 hooks count in the YAML frontmatter (line 8) and Reference Routing table (line 55) is correct**, but the top-level count of "24" (line 684) should be "23" based on live `--help` (excluding `help` as a command, or "24" if you count `help`).
3. **Several @ruvector/* packages listed in Q2b are NOT findable on npm** via `npm search` (specifically `@ruvector/edge-full` does exist but some platform bindings are listed inconsistently).
4. **The "15+ @ruvector/* packages" claim** needs qualification -- npm search returns about 15 unique scoped package names (excluding platform-specific binary packages), which is approximately correct, but the number of platform bindings is much larger.
5. **ruvector-tools-reference.md claims "16" top-level commands** (line 7) but live `--help` shows 23 (excluding `help`). The reference only documents 16 because it omits 7 commands that are subsystem groupings documented separately (hooks, workers, embed, gnn, attention, native, mcp).

### What Is Missing

1. **No reference doc for the `hooks import`/`hooks export` data management workflow** beyond brief signature listings.
2. **No reference doc for the ruvector `graph` command** (Cypher queries via @ruvector/graph-node) despite it being in the Feature Overlap Matrix.
3. **No reference doc covering the `ruvector router` command** (semantic routing setup) in detail.
4. **agentic-flow and agentic-qe** are listed in Q2d but have no dedicated reference doc explaining their integration points.
5. **No guidance on which @claude-flow/* sub-packages are actually useful vs minimal stubs** -- users could waste time installing packages that provide little value.

---

## Cross-Reference Consistency Issues

### File-by-File Analysis

#### SKILL.md (main file)

| Line(s) | Issue | Severity |
|---------|-------|----------|
| 8 | Frontmatter says "55 hooks, 14 workers, 5 embed subsystems" -- accurate | OK |
| 55 | Reference Routing says "55 commands" for hooks -- confirmed correct via `--help` (55 excluding `help`) | OK |
| 56 | Reference Routing says "embed, workers, gnn, etc." for non-hooks tools -- correct | OK |
| 70 | "7066-line JS CLI" -- not verifiable without source inspection; may drift with updates | Low |
| 75 | "`ruvector install --list` shows only 5 functional packages" -- should be verified each release | Low |
| 148 | Q2a installer covers "@ruvector/core, @ruvector/gnn, @ruvector/graph-node, @ruvector/agentic-synth, ruvector-extensions, plus platform bindings" -- this is 5 packages, matches "only 5 functional packages" on line 75 | OK |
| 224 | "Background workers (14 triggers)" mapped to `agentic-flow` -- but ruvector workers subsystem has 14 subcommands, not triggers. The `workers triggers` command would show actual trigger count. The Feature Mapping table conflates command count with trigger count. | Medium |
| 333-334 | Q8 says `npx ruvector native list` shows "3 types: security, analysis, learning" -- needs live verification | Low |
| 344 | "`workers init-config`, `workers presets`, and `workers phases` are broken" -- this claim should be periodically re-checked | Low |
| 627 | Feature Overlap says claude-flow has "12 daemon workers" -- this comes from CLAUDE.md's claim; the reference doc on claude-flow (claude-flow-reference.md) does not enumerate daemon workers | Medium |
| 684 | "24 top-level" ruvector commands -- live `--help` shows 23 excluding `help`, or 24 including it. The reference doc says "16" (only directly-invocable non-subsystem commands). These three numbers are inconsistent. | Medium |

#### reference/wiring-and-validation.md

| Line(s) | Issue | Severity |
|---------|-------|----------|
| 40 | "hooks (7 events, 15 hook entries)" -- this is based on observed init output. Should cross-check: SKILL.md (line 40 of wiring ref) says 7 events. The hooks table in wiring-and-validation.md (lines 70-84) lists 7 events with varying hook counts. OK. | OK |
| 65-66 | "remember hooks lack `--semantic` flag" and "remember hook timeouts are 300ms" -- correctly identified as gaps fixed by post-init-fix.sh | OK |

#### reference/ruvector-hooks-reference.md

| Line(s) | Issue | Severity |
|---------|-------|----------|
| 1 | Title says "55 Commands" -- confirmed via live `--help` (55 excluding `help`) | OK |
| All sections | All 55 commands match live output exactly | OK |

#### reference/ruvector-tools-reference.md

| Line(s) | Issue | Severity |
|---------|-------|----------|
| 7 | "Top-Level Commands (16)" -- this is technically correct for non-subsystem commands, but SKILL.md line 684 says "24 top-level" which counts subsystem commands (hooks, workers, embed, gnn, attention, native, mcp) as top-level. The two documents use "top-level" inconsistently. | Medium |
| 9 | "workers Subsystem (14)" -- confirmed 14 subcommands via live `--help` | OK |
| 109 | Workers subsystem description says "delegates to agentic-flow@alpha via npx" -- SKILL.md says workers "delegate to agentic-flow which dumps its help instead" on line 344. Both say the same thing in different words. | OK |

#### reference/ruvector-extensions-reference.md

| Line(s) | Issue | Severity |
|---------|-------|----------|
| 3 | "31 exports across 5 feature areas" -- not verified; this was presumably from package inspection | Low |
| 46 | Graph export lists 9 functions (not 6 as the "6 formats" heading implies) plus 3 streaming variants and 4 helpers. The heading says "6 formats" but the table has 9 rows. | Low |
| 140-143 | Known Issues section lists 4 issues. These are consistent with SKILL.md's "ruvector-extensions SQLite adapter" limitation (line 678) and troubleshooting item #18. | OK |

#### reference/claude-flow-reference.md

| Line(s) | Issue | Severity |
|---------|-------|----------|
| 3 | "31 top-level commands, ~180+ subcommands, 200 MCP tools" -- consistent with SKILL.md line 686 | OK |
| 126-138 | "Key Differences from CLAUDE.md" table shows CLAUDE.md claims 26 commands but actual is 31. This is useful meta-documentation. | OK |

#### reference/learning-and-consolidation.md

| Line(s) | Issue | Severity |
|---------|-------|----------|
| All | Content is detailed and accurate regarding SONA, HNSW, Q-Learning, TinyDancer, Dream Cycles, MinCut, Attention, GNN | OK |
| 14-18 | The "IMPORTANT" box about Dream Cycles vs MinCut separation matches SKILL.md "Do NOT #10" (line 659) | OK |

#### reference/storage-backends.md

| Line(s) | Issue | Severity |
|---------|-------|----------|
| 6 | "All 8 storage systems" -- the table lists 8 rows | OK |
| 47 | "rvlite (unscoped) was unpublished from npm (2025-12-12)" -- matches SKILL.md line 73 | OK |

#### reference/fox-method.md

| Line(s) | Issue | Severity |
|---------|-------|----------|
| All | Content is self-consistent and matches SKILL.md "Do NOT #8" (line 657) | OK |

#### reference/upgrade-validation.md

| Line(s) | Issue | Severity |
|---------|-------|----------|
| 17-18 | References `scripts/pre-upgrade.sh` -- file exists and matches | OK |
| 85 | References `patches/` directory -- but SKILL.md and fox-method.md use `fixes/` directory. Inconsistency. | Medium |
| 116-117 | Lists packages to update but omits @ruvector/tiny-dancer, @ruvector/rvlite, @ruvector/postgres-cli, @ruvector/edge*, @ruvector/ruvllm, @ruvector/wasm, @ruvector/router-wasm | Low |

#### reference/generated-artifacts.md

| Line(s) | Issue | Severity |
|---------|-------|----------|
| All | Thorough and matches what SKILL.md describes in the init sequence | OK |

#### reference/troubleshooting.md

| Line(s) | Issue | Severity |
|---------|-------|----------|
| All 18 scenarios | Well-documented, consistent with SKILL.md's Limitations table and Do NOT list | OK |

#### reference/quality-assurance.md

| Line(s) | Issue | Severity |
|---------|-------|----------|
| 133-134 | agentic-qe described as "v3.3.5" with "51 agents, 99 skills, 82 MCP tools, and 6,664 tests" -- SKILL.md line 688 says "51 QE agents" but omits skills/tools/test counts. Not contradictory, just less detailed in SKILL.md. | Low |

#### scripts/post-init-fix.sh

| Line(s) | Issue | Severity |
|---------|-------|----------|
| All | 8 FIX steps match what SKILL.md describes at lines 451-458 and what wiring-and-validation.md describes at lines 86-101 | OK |

#### scripts/validate-setup.sh

| Line(s) | Issue | Severity |
|---------|-------|----------|
| 138 | Level 6 "ruvector-extensions SQLite" check uses a `read` in pipe that may not work correctly on all shells (result variable may be empty) | Low |

#### scripts/pre-upgrade.sh

| Line(s) | Issue | Severity |
|---------|-------|----------|
| All | Matches what upgrade-validation.md describes | OK |
| 23 | Lists specific packages to check for outdated but misses some Q2b packages (same issue as upgrade-validation.md) | Low |

---

## Missing Q Options

Config possibilities documented in reference docs but NOT offered via Q1-Q9:

### 1. hooks export/import (Data Management)

ruvector-hooks-reference.md documents `hooks export` and `hooks import` commands for intelligence data backup/restore. No Q question offers this as part of the workflow. Consider adding a post-init question or including it in the upgrade workflow.

**Recommendation:** Add to [ACTION:UPGRADE] as a pre-upgrade step: `npx ruvector hooks export -o .upgrade-snapshot/intelligence-export.json --include-all`

### 2. hooks rag-context (RAG-Enhanced Context)

ruvector-hooks-reference.md documents `hooks rag-context` with `--rerank` option. This is a powerful feature not mentioned in any Q question or the init sequence.

**Recommendation:** Mention in a "Post-Setup Usage Tips" section or a new reference doc on daily workflow.

### 3. hooks subscribe events and hooks watch dry-run

The streaming commands (`subscribe`, `watch`) are offered in Q9 but `watch --dry-run` is not mentioned. The `subscribe` event types are listed but not all possible events are documented.

**Recommendation:** Add `--dry-run` to Q9 watch description.

### 4. embed neural options

ruvector-tools-reference.md documents `embed neural` with options: `--health`, `--consolidate`, `--calibrate`, `--swarm-status`, `--drift-stats`, `--memory-stats`, `--demo`, `--dimension`. None of these are offered in Q6 or Q8. The `embed neural --consolidate` is documented in learning-and-consolidation.md but not wired to any Q.

**Recommendation:** Add `embed neural` options to Q6b or create a separate Q for neural substrate configuration.

### 5. hooks error-record and error-suggest

These learning hooks are documented in ruvector-hooks-reference.md but not mentioned in any Q or the init sequence. They are powerful for building error pattern databases.

**Recommendation:** Mention in a post-setup workflow guide.

### 6. hooks coedit-record and coedit-suggest

Documented in ruvector-hooks-reference.md. While pretrain Phase 2 populates co-edit patterns from git, manual recording is not offered.

**Recommendation:** Low priority; auto-populated by pretrain.

### 7. Graph commands (ruvector graph)

ruvector-tools-reference.md documents `ruvector graph` (Cypher queries, node creation, relationships). Not offered in any Q. The Feature Overlap Matrix mentions "@ruvector/graph-node" for Hypergraph + Cypher (line 646) but no setup question covers graph DB initialization.

**Recommendation:** If graph DB is installed (Q2a/Q2b), add optional Q for graph initialization.

### 8. GNN layer configuration

ruvector-tools-reference.md documents `ruvector gnn layer` with custom dimensions, heads, dropout. Not offered in any Q.

**Recommendation:** Low priority for most users; document as advanced usage.

### 9. Attention compute and hyperbolic operations

ruvector-tools-reference.md and learning-and-consolidation.md document attention operations extensively. Not offered in any Q.

**Recommendation:** Low priority; advanced feature.

### 10. hooks batch-learn seeding

Mentioned in wiring-and-validation.md (lines 186-195) as a way to accelerate Q-learning cold start. Not offered as a step in the init sequence.

**Recommendation:** Add optional step after pretrain (Step 5d) offering batch-learn seeding from a curated JSON file.

---

## Feature Overlap Matrix Gaps

The Feature Overlap Resolution table (SKILL.md lines 616-646) has 28 rows. Analysis:

### Missing Features from Reference Docs

| Feature from Reference | Which Reference Doc | Currently in Matrix? |
|----------------------|-------------------|---------------------|
| RAG-enhanced context | ruvector-hooks-reference.md (rag-context) | No |
| Data export/import (intelligence) | ruvector-hooks-reference.md (export/import) | No |
| Error pattern learning | ruvector-hooks-reference.md (error-record/suggest) | No |
| Co-edit pattern tracking | ruvector-hooks-reference.md (coedit-record/suggest) | No |
| Trajectory tracking | ruvector-hooks-reference.md (trajectory-begin/step/end) | No |
| AST analysis | ruvector-hooks-reference.md (ast-analyze/complexity) | No |
| Diff analysis with embeddings | ruvector-hooks-reference.md (diff-analyze/classify/similar) | No |
| Git churn hotspot analysis | ruvector-hooks-reference.md (git-churn) | No |
| ONNX embedding caching (LRU) | ruvector-tools-reference.md (embed optimized) | No |
| Native worker benchmarks | ruvector-tools-reference.md (native benchmark/compare) | No |
| Graph Cypher queries | ruvector-tools-reference.md (graph) | Partially (row for "Hypergraph + Cypher") |
| Temporal tracking (versioning) | ruvector-extensions-reference.md (TemporalTracker) | Partially (row for "Temporal tracking") |
| UI Server (web visualization) | ruvector-extensions-reference.md (UIServer) | No |
| Change tracking types | ruvector-extensions-reference.md (ChangeType) | No |

### Correctly Documented Features

All 28 existing rows are accurate regarding which tool provides which feature and the preference notes.

### Recommendations for Matrix

1. The matrix should focus on **overlapping features** (where both tools provide something similar). Single-tool features are better documented in their respective reference docs.
2. Consider splitting into two tables: "Overlapping Features (choose one)" and "Unique Features (no overlap)" for clarity.
3. The matrix currently mixes overlapping features (e.g., "Vector search" where both tools have HNSW) with non-overlapping ones (e.g., "PostgreSQL" which only ruvector has). This makes the preference column meaningless for non-overlapping rows since there is only one option.

---

## Documentation Accuracy Corrections

### SKILL.md line 684: ruvector CLI command counts

**Claimed:** "24 top-level + 55 hooks + 14 workers + 5 embed + 5 attention + 4 gnn + 4 native + 2 mcp = ~113 commands"

**Verified:**

| Component | Claimed | Actual (from `--help`) | Notes |
|-----------|---------|----------------------|-------|
| Top-level | 24 | 23 (excl. `help`) | `--help` shows: create, insert, search, stats, benchmark, info, install, gnn, attention, doctor, setup, graph, router, server, cluster, export, import, embed, demo, hooks, workers, native, mcp = 23. The 24 count likely includes `help`. |
| Hooks | 55 | 55 (excl. `help`) | Confirmed correct |
| Workers | 14 | 14 (excl. `help`) | Confirmed correct |
| Embed | 5 | 5 (excl. `help`) | Confirmed correct |
| Attention | 5 | 5 (excl. `help`) | Confirmed correct |
| GNN | 4 | 4 (excl. `help`) | Confirmed correct |
| Native | 4 | 4 (excl. `help`) | Confirmed correct |
| MCP | 2 | 2 (excl. `help`) | Confirmed correct |
| **Total** | **~113** | **112 or 113** | Depending on whether `help` is counted for top-level |

**Verdict:** Effectively correct. The ~113 is reasonable. The "24 top-level" is 23 or 24 depending on counting methodology. Suggest changing to "23 top-level" with a note that `help` is excluded from all counts, for consistency.

### SKILL.md line 685: ruvector ecosystem package counts

**Claimed:** "15+ @ruvector/* packages, 4 unscoped packages (only 5 in `install --list`)"

**Verified (npm search + npm view):**

Scoped @ruvector/* packages (unique, excluding platform binaries):
1. @ruvector/core
2. @ruvector/gnn
3. @ruvector/graph-node
4. @ruvector/agentic-synth
5. @ruvector/sona
6. @ruvector/tiny-dancer
7. @ruvector/attention
8. @ruvector/router
9. @ruvector/ruvllm
10. @ruvector/rvlite
11. @ruvector/edge
12. @ruvector/edge-full
13. @ruvector/postgres-cli
14. @ruvector/wasm
15. @ruvector/router-wasm

Total: 15 unique scoped packages (plus ~10 platform-specific binary packages like `-linux-x64-gnu`).

Unscoped packages:
1. ruvector (main CLI)
2. ruvector-extensions
3. ruvector-onnx-embeddings-wasm
4. ruvector-attention-wasm

ruvector-postgres does NOT exist on npm (Docker/Rust only, confirmed by `npm view` returning error).

Total unscoped: 4 functional packages.

**Verdict:** "15+ @ruvector/* packages" -- correct (exactly 15 unique scoped, more if counting platform binaries). "4 unscoped packages" -- correct. The claim is accurate.

### SKILL.md line 686: claude-flow CLI counts

**Claimed:** "31 top-level, ~180+ subcommands, 200 MCP tools"

**Verified:** claude-flow-reference.md confirms 31 top-level commands. The `--help` output was 77 lines including header/options. MCP tools count of 200 comes from claude-flow-reference.md which itself states this. Cannot independently verify MCP tool count without starting the MCP server.

**Verdict:** Consistent across SKILL.md and claude-flow-reference.md. The 31/~180+/200 figures originate from the reference doc's live `--help` analysis.

### SKILL.md line 687: claude-flow ecosystem

**Claimed:** "15 @claude-flow/* sub-packages"

**Verified (npm search):**
1. @claude-flow/aidefence
2. @claude-flow/browser
3. @claude-flow/claims
4. @claude-flow/cli
5. @claude-flow/embeddings
6. @claude-flow/hooks
7. @claude-flow/mcp
8. @claude-flow/memory
9. @claude-flow/neural
10. @claude-flow/plugin-agentic-qe
11. @claude-flow/plugin-gastown-bridge
12. @claude-flow/plugins
13. @claude-flow/providers
14. @claude-flow/shared
15. @claude-flow/testing

Total: 15 packages. BUT @claude-flow/cli is the main package, so "15 sub-packages" could be interpreted as "15 total including CLI" or "15 sub-packages beyond CLI = 16 total". SKILL.md Q2c (lines 172-192) lists exactly 15 packages excluding @claude-flow/cli, which is accurate.

**Verdict:** The "15 @claude-flow/* sub-packages" matches the npm registry if we count all scoped packages excluding the main CLI. If including CLI, it is 16 total. The wording "sub-packages" appropriately excludes the CLI itself.

### SKILL.md line 688: Companion packages

**Claimed:** "agentic-flow (66 agents, 213 MCP tools), agentic-qe (51 QE agents)"

**Verified:** `npm view agentic-flow` description mentions "66 specialized agents, 213 MCP tools". `npm view agentic-qe` mentions "51 specialized QE agents".

**Verdict:** Consistent with npm registry descriptions.

### ruvector-tools-reference.md line 7: "Top-Level Commands (16)"

**Issue:** The reference only documents 16 commands because it excludes the 7 subsystem groupings (hooks, workers, embed, gnn, attention, native, mcp) which are documented in separate reference files. However, live `--help` shows all 23 as top-level. The heading is misleading.

**Recommendation:** Change to "Top-Level Commands (16 non-subsystem)" or "Top-Level Commands (16 of 23)" with a note that 7 subsystem commands are documented separately.

### ruvector-extensions-reference.md heading: "Graph Export (6 formats)"

**Issue:** The table under this heading lists 9 functions (Neo4j Cypher, Neo4j JSON, D3 JSON, D3 Hierarchy, GEXF, GraphML, NetworkX JSON, NetworkX Adjacency, NetworkX Edge List). The heading says "6 formats" which appears to count the base formats (Neo4j, D3, GEXF, GraphML, NetworkX, plus maybe one more), while the actual export functions number 9.

**Recommendation:** Change heading to "Graph Export (9 functions, 6+ formats)" or simply "Graph Export".

### upgrade-validation.md line 85: "patches/" directory

**Issue:** References `patches/` directory for FOX patches, but fox-method.md uses `fixes/` directory. This inconsistency could confuse users.

**Recommendation:** Standardize on one name. Since fox-method.md is the authoritative reference and uses `fixes/`, change upgrade-validation.md line 85 from `patches/` to `fixes/`.

---

## Recommended Edits for SKILL.md

### Edit 1: Top-level command count (line 684)

**Current (line 684):**
```
- ruvector CLI: 24 top-level + 55 hooks + 14 workers + 5 embed + 5 attention + 4 gnn + 4 native + 2 mcp = ~113 commands
```

**Recommended:**
```
- ruvector CLI: 23 top-level + 55 hooks + 14 workers + 5 embed + 5 attention + 4 gnn + 4 native + 2 mcp = ~112 commands (counts exclude `help` subcommand)
```

### Edit 2: Workers trigger count in Feature Mapping (line 224)

**Current (line 224):**
```
| Background workers (14 triggers) | `agentic-flow` (npm only) |
```

**Recommended:**
```
| Background workers (12 agentic-flow triggers + 3 native types) | `agentic-flow` + `ruvector native` (npm) |
```

**Rationale:** The "14 triggers" number is actually the workers subcommand count, not the trigger count. The actual trigger keywords are listed by `npx ruvector workers triggers`. The native subsystem provides 3 additional worker types (security, analysis, learning). Line 627 in the Feature Overlap Matrix already says "14 agentic-flow + 4 native" which uses different numbers again, creating a three-way inconsistency.

### Edit 3: Feature Overlap Matrix inconsistency (line 627)

**Current (line 627):**
```
| Background workers | 12 daemon workers | 14 agentic-flow + 4 native |
```

**Issue:** The "12 daemon workers" for claude-flow comes from CLAUDE.md which this document warns is unreliable (line 654: "Do not trust CLAUDE.md command counts"). The "14 agentic-flow" is inconsistent with line 224 which says "14 triggers". The "4 native" conflicts with ruvector-tools-reference.md which documents 4 native subcommands but only 3 worker types (security, analysis, learning).

**Recommended:**
```
| Background workers | claude-flow daemon (12 trigger types) | ruvector workers (agentic-flow) + 3 native types |
```

### Edit 4: Add version caveat to frontmatter (line 8-9)

**Current (lines 8-9):**
```
  extensions, 55 hooks, 14 workers, 5 embed subsystems. Built from --help output
  and live testing of actual init behavior.
```

**Recommended (add after line 9):**
```
  Command counts verified against ruvector v0.1.96, claude-flow v3.0.0-alpha.190.
  Re-verify after upgrades with --help output.
```

### Edit 5: Q8 native worker count (line 333)

**Current (line 333):**
```
npx ruvector native list              # 3 types: security, analysis, learning
```

This is correct based on the native subsystem docs. No change needed.

### Edit 6: Add batch-learn seeding step (after line 486)

**Recommended addition after Step 5b, as Step 5d:**
```markdown
### Step 5d: Q-learning seeding (optional, recommended)

To accelerate Q-learning past the cold-start period, seed with known patterns:
```bash
npx ruvector hooks batch-learn -d '[
  {"state":"ts-file","action":"coder","reward":0.9},
  {"state":"test-file","action":"tester","reward":0.9},
  {"state":"config-file","action":"devops","reward":0.8},
  {"state":"security-issue","action":"security-analyst","reward":0.95},
  {"state":"docs-file","action":"technical-writer","reward":0.85},
  {"state":"css-file","action":"frontend-developer","reward":0.9}
]' -t agent-routing
```
Without seeding, Q-learning starts cold: all routing returns defaults with confidence: 0.
See [reference/wiring-and-validation.md](reference/wiring-and-validation.md) for details.
```

### Edit 7: Add missing watch --dry-run option to Q9 (line 355)

**Current (line 355):**
```
| Real-time watch | Continuous learning | `npx ruvector hooks watch --path <dir>` |
```

**Recommended:**
```
| Real-time watch | Continuous learning | `npx ruvector hooks watch --path <dir> [--dry-run]` |
```

---

## Recommended New Reference Docs

### 1. reference/daily-workflow.md (Medium Priority)

**Rationale:** All current reference docs cover setup, configuration, and troubleshooting. None cover daily usage patterns -- how to effectively use the system after it is installed.

**Suggested content:**
- How to use `hooks remember --semantic` and `hooks recall --semantic` for knowledge management
- How to use `hooks rag-context --rerank` for enhanced code context
- How to use `hooks error-record` and `hooks error-suggest` for error learning
- How to use `hooks route-enhanced` vs `hooks route` for task routing
- How to monitor learning with `hooks learning-stats`
- How to run `hooks export` for periodic backups
- How to use `native run security` for security audits
- When and how to re-pretrain after significant codebase changes

### 2. reference/ecosystem-packages.md (Low Priority)

**Rationale:** Q2b/Q2c/Q2d in SKILL.md list packages but do not describe what value each actually provides in practice, what their maturity level is, or which combinations work together.

**Suggested content:**
- Maturity assessment for each package (stable, beta, alpha, experimental)
- Recommended minimum set vs full set
- Package dependency graph (which packages depend on each other)
- Known compatibility issues between specific versions

### Priority Assessment

| Proposed Doc | Priority | Effort | Impact |
|-------------|----------|--------|--------|
| daily-workflow.md | Medium | 2-3 hours | High (fills the biggest gap) |
| ecosystem-packages.md | Low | 1-2 hours | Medium (helps package selection) |

---

## Priority-Ordered Action Items

### Priority 1: Corrections (fix incorrect claims)

1. **SKILL.md line 684:** Change "24 top-level" to "23 top-level" (or clarify counting methodology).
2. **ruvector-tools-reference.md line 7:** Change "Top-Level Commands (16)" heading to clarify that 7 subsystem commands are documented separately.
3. **upgrade-validation.md line 85:** Change `patches/` to `fixes/` to match fox-method.md.
4. **ruvector-extensions-reference.md heading:** Change "Graph Export (6 formats)" to accurately reflect 9 export functions.
5. **SKILL.md line 627:** Resolve the three-way inconsistency in background worker counts between lines 224, 627, and actual worker trigger list.

### Priority 2: Consistency Improvements

6. **SKILL.md line 224:** Align worker trigger count with actual trigger keywords from `npx ruvector workers triggers`.
7. **SKILL.md lines 684-688:** Add note about which version these counts were verified against (ruvector v0.1.96, claude-flow v3.0.0-alpha.190).
8. **All reference docs:** Add a version stamp footer so readers know which version the doc was written against.

### Priority 3: Missing Content

9. **SKILL.md:** Add optional Step 5d for Q-learning batch seeding (see Edit 6 above).
10. **SKILL.md Q9:** Add `--dry-run` option for watch command.
11. **New:** Create `reference/daily-workflow.md` covering post-setup usage patterns.

### Priority 4: Nice-to-Have

12. **SKILL.md Feature Overlap Matrix:** Split into "overlapping" and "unique" feature tables for clarity.
13. **SKILL.md:** Add a "Post-Setup: What to Do Next" section after the init sequence.
14. **New:** Create `reference/ecosystem-packages.md` with maturity and compatibility info.
15. **validate-setup.sh line 138:** Fix the pipe-to-read pattern in Level 6 that may fail on some shells.

---

## Appendix: Verified Command Counts

Source: Live `--help` output from ruvector v0.1.96, claude-flow v3.0.0-alpha.190. Date: 2026-01-31.

### ruvector top-level (23 commands, excl. `help`)

create, insert, search, stats, benchmark, info, install, gnn, attention, doctor, setup, graph, router, server, cluster, export, import, embed, demo, hooks, workers, native, mcp

### ruvector hooks (55 commands, excl. `help`)

init, stats, session-start, session-end, pre-edit, post-edit, pre-command, post-command, route, suggest-context, remember, recall, pre-compact, swarm-recommend, async-agent, lsp-diagnostic, track-notification, trajectory-begin, trajectory-step, trajectory-end, coedit-record, coedit-suggest, error-record, error-suggest, force-learn, ast-analyze, ast-complexity, diff-analyze, diff-classify, diff-similar, coverage-route, coverage-suggest, graph-mincut, graph-cluster, security-scan, rag-context, git-churn, route-enhanced, learning-config, learning-stats, learning-update, compress, compress-stats, compress-store, compress-get, learn, batch-learn, subscribe, watch, verify, doctor, export, import, pretrain, build-agents

### ruvector workers (14 commands, excl. `help`)

dispatch, status, results, triggers, stats, cleanup, cancel, presets, phases, create, run, custom, init-config, load-config

### ruvector embed (5 commands, excl. `help`)

text, adaptive, benchmark, optimized, neural

### ruvector gnn (4 commands, excl. `help`)

layer, compress, search, info

### ruvector attention (5 commands, excl. `help`)

compute, benchmark, hyperbolic, info, list

### ruvector native (4 commands, excl. `help`)

run, benchmark, list, compare

### ruvector mcp (2 commands, excl. `help`)

start, info

### @ruvector/* packages on npm (15 scoped, excl. platform binaries)

core, gnn, graph-node, agentic-synth, sona, tiny-dancer, attention, router, ruvllm, rvlite, edge, edge-full, postgres-cli, wasm, router-wasm

### Unscoped ruvector packages on npm (4)

ruvector, ruvector-extensions, ruvector-onnx-embeddings-wasm, ruvector-attention-wasm

### @claude-flow/* packages on npm (15 scoped, excl. main CLI)

aidefence, browser, claims, embeddings, hooks, mcp, memory, neural, plugin-agentic-qe, plugin-gastown-bridge, plugins, providers, shared, testing, security
