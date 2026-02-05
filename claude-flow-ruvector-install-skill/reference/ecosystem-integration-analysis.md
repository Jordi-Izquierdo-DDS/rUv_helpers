# Ecosystem Integration Analysis

> **Version:** v0.7 | **Generated:** 2026-01-31 | **Ecosystem:** claude-flow v3.0.0-alpha.190 + ruvector 0.1.96

Deep analysis of companion packages (agentic-flow, agentic-qe) and all
cross-cutting integration points between claude-flow, ruvector, agentic-flow,
and agentic-qe. Based on live CLI testing, npm metadata inspection, and
dependency chain analysis. January 2026.

## Contents

- [Part 1: agentic-flow Deep Dive](#part-1-agentic-flow-deep-dive)
- [Part 2: agentic-qe Deep Dive](#part-2-agentic-qe-deep-dive)
- [Part 3: Integration Pipeline Analysis](#part-3-integration-pipeline-analysis)
- [Part 4: Missing Integration Opportunities](#part-4-missing-integration-opportunities)

---

## Part 1: agentic-flow Deep Dive

**Package:** `agentic-flow` v2.0.6
**Description:** Production-ready AI agent orchestration platform with 87 agents
(marketed as 66, actual count is 87), 213 MCP tools (across 4 bundled servers),
ReasoningBank learning memory, and autonomous multi-agent swarms.

### What agentic-flow Actually Is

agentic-flow is a **CLI + proxy + agent runner**. It is NOT a library you import.
Its primary modes of operation:

1. **Agent runner** -- `npx agentic-flow --agent <name> --task "..."` runs an
   LLM-powered agent from `.claude/agents/` YAML definitions
2. **Model proxy** -- `npx agentic-flow proxy --provider openrouter` proxies
   Claude Code to use OpenRouter/Gemini/ONNX models (85-99% cost savings)
3. **MCP aggregator** -- `npx agentic-flow mcp start` starts bundled MCP servers
4. **Federation hub** -- `npx agentic-flow federation start` runs a WebSocket
   hub for ephemeral agent lifetimes with persistent memory

### The 87 Agents (by Category)

Actual `--list` output shows 87 agents, not 66. Organized by category:

| Category | Count | Key Agents |
|----------|-------|------------|
| CORE | 5 | coder, planner, researcher, reviewer, tester |
| CONSENSUS | 7 | byzantine-coordinator, crdt-synchronizer, gossip-coordinator, raft-manager, quorum-manager, security-manager, performance-benchmarker |
| GITHUB | 12 | code-review-swarm, github-modes, issue-tracker, multi-repo-swarm, pr-manager, release-manager, release-swarm, repo-architect, swarm-issue, swarm-pr, sync-coordinator, workflow-automation |
| FLOW-NEXUS | 9 | flow-nexus-app-store, -auth, -challenges, -neural, -payments, -sandbox, -swarm, -user-tools, -workflow |
| HIVE-MIND | 5 | collective-intelligence-coordinator, queen-coordinator, scout-explorer, swarm-memory-manager, worker-specialist |
| SWARM | 3 | adaptive-coordinator, hierarchical-coordinator, mesh-coordinator |
| SPARC | 4 | architecture, pseudocode, refinement, specification |
| GOAL | 3 | sublinear-goal-planner, code-goal-planner, goal-planner |
| SUBLINEAR | 5 | consensus-coordinator, matrix-optimizer, pagerank-analyzer, performance-optimizer, trading-predictor |
| OPTIMIZATION | 5 | Benchmark Suite, Load Balancing Coordinator, Performance Monitor, Resource Allocator, Topology Optimizer |
| V3 | 5 | v3-integration-architect, v3-memory-specialist, v3-performance-engineer, v3-queen-coordinator, v3-security-architect |
| TEMPLATES | 9 | smart-agent, swarm-init, pr-manager, sparc-coder, memory-coordinator, migration-planner, task-orchestrator, perf-analyzer, sparc-coord |
| Other | 15 | analyst, api-docs, cicd-engineer, backend-dev, ml-developer, mobile-dev, system-architect, code-analyzer, tdd-london-swarm, production-validator, sona-learning-optimizer, base-template-generator, agentic-payments, test-long-runner, Migration Summary |

### The 213 MCP Tools (Decomposed)

The 213 tools are spread across 4 bundled MCP servers (not a single server):

| MCP Server | Tools | What They Cover |
|------------|-------|-----------------|
| `agentic-flow` | 7 | Agent execution, creation, management, model optimization |
| `claude-flow` | 101 | Neural networks, GitHub, workflows, DAA (this is @claude-flow/mcp) |
| `flow-nexus` | 96 | Cloud sandboxes (E2B), distributed swarms, templates, challenges |
| `agentic-payments` | 6 | Payment authorization, multi-agent consensus |
| **Total** | **~210** | (marketed as 213) |

**Critical finding:** `npx agentic-flow mcp list` returns "No MCP servers configured"
until you explicitly add them. The tools exist as bundled server packages but are NOT
auto-registered. This is a configuration step.

### Key Dependencies (ruvector integration)

agentic-flow v2.0.6 directly depends on these ruvector packages:

| Package | Version | Purpose |
|---------|---------|---------|
| `@ruvector/core` | ^0.1.29 | Vector DB (Rust HNSW) |
| `@ruvector/edge-full` | ^0.1.0 | Complete edge WASM toolkit |
| `@ruvector/router` | ^0.1.25 | Semantic intent routing (HNSW + SIMD) |
| `@ruvector/ruvllm` | ^0.2.3 | Self-learning LLM orchestration |
| `@ruvector/tiny-dancer` | ^0.1.15 | FastGRNN neural routing |
| `ruvector` | ^0.1.69 | Full ruvector CLI/SDK |
| `agentdb` | ^2.0.0-alpha.2.20 | Graph DB with Cypher, hyperedges |

Plus: `@anthropic-ai/claude-agent-sdk`, `@anthropic-ai/sdk`, `@google/genai`,
`@supabase/supabase-js`, `@xenova/transformers`, `express`, `fastmcp`, `gun`,
`onnxruntime-node`, `ws`.

### ReasoningBank Memory Format

The ReasoningBank originates from `@ruvector/sona` and stores:
- **Trajectories** -- sequences of (state, action, reward) tuples
- **Patterns** -- clustered trajectory summaries (General, Reasoning, Factual,
  Creative, CodeGen, Conversational)
- **Q-tables** -- per-algorithm state-action value tables

In ruvector, this is persisted to `.ruvector/intelligence.json`. In agentic-flow,
it uses `agentdb` (graph DB with Cypher queries, ACID persistence, 150x faster
than SQLite for vector search per documentation). In agentic-qe, it uses a
`QEReasoningBank` backed by `better-sqlite3` + `hnswlib-node`.

**Critical finding:** These are three SEPARATE ReasoningBank implementations
with no shared persistence. They do not sync data between each other.

### How ruvector Workers Dispatch to agentic-flow

The `ruvector workers` subsystem delegates to agentic-flow:

```
User runs: npx ruvector workers dispatch "audit security for this project"
  -> ruvector extracts trigger keyword ("audit")
  -> shells out to: npx agentic-flow --agent <matched-agent> --task "<prompt>"
  -> agentic-flow runs the agent (requires API key for LLM calls)
  -> results stored locally
```

**Verified behavior:** When dispatching, agentic-flow's full help text is
printed (it doesn't parse the argument as a task). The dispatch mechanism
runs `npx agentic-flow` as a subprocess, but the argument mapping appears to
be fragile -- the help dump suggests the `dispatch` command passes arguments
in a way agentic-flow doesn't parse as an `--agent --task` invocation.

Available triggers: `ultralearn`, `optimize`, `audit`, `map`, `preload`,
`deepdive`, `document`, `refactor`, `benchmark`, `testgaps`, `consolidate`,
`predict`.

Available presets: `quick-scan`, `deep-analysis`, `security-scan`, `learning`,
`api-docs`, `test-analysis`.

24 phase executors: `file-discovery`, `pattern-extraction`, `embedding-generation`,
`vector-storage`, `similarity-search`, `security-scan`, `complexity-analysis`,
`summarization` (8 documented; the 24 count comes from custom phase support).

### Native Workers (Local Alternative)

`ruvector native` provides workers that do NOT delegate to agentic-flow:

| Worker | Phases | Dependencies |
|--------|--------|-------------|
| `security` | file-discovery, security-scan, summarization | None |
| `analysis` | file-discovery, pattern-extraction, embedding-generation, vector-storage, complexity-analysis, summarization | ONNX, VectorDB |
| `learning` | file-discovery, pattern-extraction, embedding-generation, vector-storage, summarization | ONNX, VectorDB, intelligence.json |

Native workers run entirely locally without API keys. They are the practical
alternative when agentic-flow dispatch fails or no LLM API key is available.

---

## Part 2: agentic-qe Deep Dive

**Package:** `agentic-qe` v3.3.5
**Description:** Domain-Driven Design Quality Engineering with 13 bounded contexts,
O(log n) coverage analysis, QE ReasoningBank learning, 51+ specialized QE agents,
mathematical Coherence verification, deep Claude Flow integration.

### What agentic-qe Actually Is

agentic-qe is a **quality engineering orchestration platform** that provides:
1. Domain-driven test generation and coverage analysis
2. Its own agent pool (QE-specialized, separate from agentic-flow)
3. A hooks system (mirrors ruvector hooks but QE-focused)
4. Fleet management for multi-agent QE operations
5. LLM routing with cost optimization
6. YAML-based workflow/pipeline execution

### The 13 Bounded Contexts (DDD Domains)

Verified via `aqe domain list`:

| Domain | Purpose |
|--------|---------|
| `test-generation` | Generate unit/integration/e2e tests |
| `test-execution` | Run and monitor test suites |
| `coverage-analysis` | O(log n) coverage gap detection |
| `quality-assessment` | Code quality scoring |
| `defect-intelligence` | Bug pattern recognition |
| `requirements-validation` | Requirements traceability |
| `code-intelligence` | AST analysis, dependency mapping |
| `security-compliance` | SAST/DAST, GDPR/HIPAA/SOC2 |
| `contract-testing` | API contract verification |
| `visual-accessibility` | Visual/a11y testing |
| `chaos-resilience` | Chaos engineering |
| `learning-optimization` | Self-learning from outcomes |
| `coordination` | Cross-domain coordination |

**Note:** 13 domains, not 12 as originally claimed. The `coordination` domain
is the 13th.

### The QE Agents

`aqe agent list` showed "0 agents" because agents are spawned on demand, not
pre-registered. The 51 agents are domain-specific workers that get created by
`aqe fleet spawn` or `aqe agent spawn <domain>`.

From the routing test, observed QE agent types include:
- `qe-test-architect`
- `qe-test-generator`
- `qe-security-auditor`
- `qe-coverage-analyzer`

These are NOT agentic-flow agents. They are agentic-qe's own internal agent
pool using its own LLM routing (`aqe llm route`).

### Mathematical Coherence Verification

The quality assessment uses a "CoherenceService" initialized with WASM engines.
From the logs:

```
[hooks] CoherenceService initialized with WASM engines
```

This appears to use `@ruvector/attention` and `@ruvector/gnn` for:
- Embedding-based similarity scoring between test cases and source code
- HNSW-indexed pattern matching for known quality patterns
- GNN differentiable search for finding related code clusters

The "mathematical" aspect is primarily:
1. **Vector cosine similarity** -- measuring test-to-code coherence
2. **HNSW approximate nearest neighbor** -- O(log n) pattern retrieval
3. **GNN attention scoring** -- weighted relevance across code graphs

It is NOT category theory or coalgebraic game theory (CGT). It is practical
vector math applied to quality engineering patterns.

### Key Dependencies

| Package | Purpose in agentic-qe |
|---------|----------------------|
| `@ruvector/attention` v0.1.3 | Attention scoring for coherence |
| `@ruvector/gnn` v0.1.19 | HNSW index + differentiable search |
| `@ruvector/sona` v0.1.5 | ReasoningBank pattern learning |
| `@xenova/transformers` ^2.6.0 | Transformer-based embeddings |
| `better-sqlite3` ^12.4.1 | Local SQLite memory (NOT sql.js) |
| `hnswlib-node` ^3.0.0 | HNSW indexing (C++ native) |
| `vibium` ^0.1.2 | Browser automation for agents |

**Critical finding:** agentic-qe uses `better-sqlite3` (native C++ addon) while
claude-flow uses `sql.js` (WASM). These are different SQLite implementations that
cannot share database files. agentic-qe stores its memory at `.agentic-qe/memory.db`.

### QE Hooks System (Parallel to ruvector hooks)

agentic-qe has 14 hooks that mirror ruvector's hook lifecycle:

| Hook | ruvector Equivalent | Notes |
|------|-------------------|-------|
| `pre-edit` | `hooks pre-edit` | File editing guidance |
| `post-edit` | `hooks post-edit` | Learn from edits |
| `route` | `hooks route` | Route to QE agents (different pool) |
| `pre-task` | N/A | Pre-task guidance for Task agents |
| `post-task` | N/A | Record task outcomes |
| `pre-command` | `hooks pre-command` | Command guidance |
| `post-command` | `hooks post-command` | Command learning |
| `session-start` | `hooks session-start` | Initialize QE state |
| `session-end` | `hooks session-end` | Save QE state |
| `learn` | `hooks remember` | Store patterns in QE ReasoningBank |
| `search` | `hooks recall` | Search QE patterns |
| `stats` | `hooks stats` | QE statistics |
| `list` | N/A | List hook events |
| `emit` | N/A | Emit custom events |

**The QE ReasoningBank** is separate from ruvector's intelligence.json. It
initializes with 4 foundational patterns:
1. AAA Unit Test (test-generation domain)
2. Dependency Mock (test-generation domain)
3. Risk-Based Coverage (coverage-analysis domain)
4. Timing-Based Flakiness (test-execution domain)

### QE LLM Router

agentic-qe has its own LLM router (`aqe llm`) with:
- Provider management (multiple LLM providers)
- Cost estimation per model
- Task-based routing (e.g., "security audit" routes to quality-priority model)
- TinyDancer integration for routing decisions

From the quality assessment test:
```
[Queen] TinyDancer routing: assess-quality -> tier=sonnet, model=sonnet, cost=$0.0135
```

This shows agentic-qe uses `@ruvector/tiny-dancer` (FastGRNN) for model tier
selection, integrating the same neural router as ruvector.

---

## Part 3: Integration Pipeline Analysis

### Pipeline 1: Memory

**Claimed flow:** claude-flow SQLite -> @claude-flow/memory -> @ruvector/rvlite ->
ruvector intelligence.json

**Actual reality:**

There are **4 completely independent memory systems** that do NOT share data:

| System | Storage | Format | Package |
|--------|---------|--------|---------|
| claude-flow | `.swarm/memory.db` | SQLite (sql.js WASM) | `@claude-flow/cli` |
| ruvector | `.ruvector/intelligence.json` | JSON file | `ruvector` |
| agentic-qe | `.agentic-qe/memory.db` | SQLite (better-sqlite3 native) | `agentic-qe` |
| agentdb | Configurable | Graph DB (Cypher) | `agentdb` |

**Verified:**
- `npx @claude-flow/cli@latest memory store` writes to `.swarm/memory.db`
  (requires `memory init` first; tested and got "Database not initialized")
- `npx ruvector hooks remember` writes to `.ruvector/intelligence.json`
  (tested and confirmed working)
- `npx agentic-qe hooks learn` writes to `.agentic-qe/memory.db`
  (tested via `hooks search`, confirmed separate storage)

**Bridge mechanism exists but is manual:**
```bash
npx @claude-flow/cli@latest memory store --key "rv-$(date +%s)" \
  --value "$(npx ruvector hooks export --include-all 2>/dev/null)" \
  --namespace ruvector-sync
```

**Verdict:** REAL but fragmented. No automatic sync. Each system learns
independently. Cross-system queries require manual bridging scripts.

### Pipeline 2: Learning

**Claimed flow:** ruvector hooks -> @ruvector/sona (SONA) -> @claude-flow/neural ->
agentic-qe (ReasoningBank)

**Actual reality:**

Three independent learning engines:

1. **ruvector learning:** Q-learning (9 algorithms) + SONA (LoRA/EWC++) + intelligence.json
   - Stores in `.ruvector/intelligence.json`
   - Q-tables, patterns, trajectories, memories
   - Works locally, verified via `hooks learn` and `hooks learning-stats`

2. **claude-flow learning:** Neural pattern system
   - `npx @claude-flow/cli@latest neural train` and `neural patterns`
   - Stores in `.claude-flow/neural/`
   - NOT wired to ruvector SONA automatically

3. **agentic-qe learning:** QE ReasoningBank (backed by @ruvector/sona)
   - Uses `@ruvector/sona` v0.1.5 directly
   - Stores via `better-sqlite3` at `.agentic-qe/memory.db`
   - 4 foundational patterns + learned patterns
   - Separate from ruvector's intelligence.json

**Key insight:** Both ruvector and agentic-qe use `@ruvector/sona` but with
separate instances. SONA's state is in-memory (Rust) and only persists when
the host application serializes it. ruvector serializes to intelligence.json.
agentic-qe serializes to its SQLite DB. They never share SONA state.

**Verdict:** FRAGMENTED. Three separate learning engines using overlapping
libraries but with zero cross-pollination. @claude-flow/neural and @ruvector/sona
are separate codebases.

### Pipeline 3: Routing

**Claimed flow:** User task -> claude-flow hooks pre-task -> ruvector hooks route ->
@ruvector/tiny-dancer (FastGRNN) -> @ruvector/router (semantic) -> agent selection

**Actual reality:**

Three independent routing systems:

1. **ruvector `hooks route`:**
   - Returns: `{"task":"...", "recommended":"coder", "confidence":0, "reasoning":"default for unknown files"}`
   - Uses hardcoded defaults until Q-learning accumulates enough data
   - Does NOT invoke @ruvector/tiny-dancer (that is a library dependency, not wired to CLI)
   - Does NOT invoke @ruvector/router

2. **ruvector `hooks route-enhanced`:**
   - Returns: `{"agent":"typescript-developer", "confidence":0.5, "reason":"default mapping"}`
   - Adds AST/coverage/diff signals but still falls back to defaults
   - Downloads ONNX model for semantic scoring
   - More sophisticated but still confidence is 0.5 (default mapping)

3. **agentic-qe `hooks route`:**
   - Returns: `qe-test-architect` at 25.3% confidence
   - Uses @ruvector/gnn HNSW + its own domain matching
   - Routes to QE-specific agents (not agentic-flow agents)
   - Uses TinyDancer for LLM model tier selection (verified in quality command)

4. **claude-flow `hooks pre-task`:**
   - `npx @claude-flow/cli@latest hooks pre-task --description "..."`
   - Returns agent type recommendation + model tier
   - Separate from ruvector routing

**Verdict:** FRAGMENTED. Four independent routing engines. None compose into a
pipeline. The claimed TinyDancer/semantic-router cascade does not happen in
practice. TinyDancer is used by agentic-qe for MODEL selection (haiku vs sonnet),
not for AGENT routing.

### Pipeline 4: Attention

**Claimed flow:** ruvector attention compute -> @ruvector/attention -> ruvector-attention-wasm

**Actual reality:**

`@ruvector/attention` is a real, working Rust native addon with 10 attention mechanisms.
Verified via `ruvector attention info`:
- DotProduct, MultiHead, Flash, Hyperbolic, Linear, MoE (core)
- GraphRoPe, EdgeFeatured, DualSpace, LocalGlobal (graph)
- Training utilities (Adam, InfoNCE, curriculum)

**When does attention actually get used?**

1. **In agentic-qe:** CoherenceService uses attention for test-to-code similarity
   scoring. Confirmed by log: `[hooks] CoherenceService initialized with WASM engines`

2. **In ruvector CLI:** `ruvector attention compute` is a standalone command for
   ad-hoc attention computations. Not automatically invoked during routing or search.

3. **In ruvector hooks:** NOT used by route, route-enhanced, remember, or recall.
   The hooks system uses ONNX embeddings + cosine similarity, NOT attention mechanisms.

4. **In @ruvector/gnn:** Used internally for GNN layer forward passes and
   differentiable search. The GNN-based HNSW in agentic-qe leverages this.

**Verdict:** REAL but underutilized. The attention module exists and works, but
it is primarily used by agentic-qe's CoherenceService and by GNN operations.
The ruvector hooks system does not invoke attention during normal operation.

### Pipeline 5: Worker Dispatch

**Claimed flow:** ruvector workers dispatch -> agentic-flow@alpha -> phase executors ->
results

**Actual reality:**

Tested `ruvector workers dispatch "audit security for this project"`:
- Output was agentic-flow's full help text (not an audit result)
- The dispatch command shells out to `npx agentic-flow` but the argument
  forwarding appears broken -- agentic-flow doesn't receive the prompt as
  `--task` argument

**What works:**
- `ruvector workers triggers` -- correctly lists 12 triggers
- `ruvector workers presets` -- correctly lists 6 presets
- `ruvector workers phases` -- correctly lists 8 base phases
- `ruvector native run security` -- works without agentic-flow (local phases)
- `ruvector native run analysis` -- works with ONNX (local phases)

**What doesn't:**
- Actual dispatch to agentic-flow fails silently (shows help instead of running)
- Requires valid API key (ANTHROPIC_API_KEY, OPENROUTER_API_KEY, etc.)
- No feedback loop -- results don't flow back to intelligence.json

**Verdict:** PARTIALLY BROKEN. The dispatch mechanism exists but the
argument forwarding is buggy. Native workers are the reliable alternative.
Even when dispatch works, results don't automatically feed back into
ruvector's learning system.

### Pipeline 6: Embedding

**Claimed flow:** ONNX model -> ruvector embed text -> @ruvector/sona adaptive LoRA ->
remember --semantic -> intelligence.json

**Actual reality:**

1. **Base embedding:** `ruvector embed text "..."` works. Downloads `all-MiniLM-L6-v2`
   (23MB), generates 384d embeddings via ONNX. Verified: 3293ms first run.

2. **Adaptive LoRA:** `ruvector embed adaptive --stats` works. Shows LoRA rank=4,
   3072 params (2.08% of base). BUT: 0 adaptations, 0 prototypes, 0 memory.
   The adaptive layer exists but has never learned anything.

3. **remember --semantic:** Works when `--semantic` flag is present. Stores
   384d ONNX embeddings into intelligence.json memories.

4. **LoRA modification:** The adaptive LoRA applies `micro-LoRA` (rank 1-2)
   adjustments to the base ONNX embedding. In theory, `embed text --adaptive`
   uses the LoRA-modified embedder. In practice, with 0 adaptations, it
   produces the same output as the base embedder.

5. **Learning loop:** For LoRA to actually modify embeddings, you need:
   - Multiple `embed text --adaptive --domain <X>` calls to build prototypes
   - `embed adaptive --consolidate` to run EWC consolidation
   - These steps are NOT automated by hooks

**Verdict:** REAL but cold-started. The pipeline exists end-to-end. Base
embeddings work immediately. Adaptive LoRA modification requires manual
training iterations that the hooks system does not automate.

### Pipeline 7: Consensus

**Claimed flow:** @ruvector/edge (Raft) -> hive-mind -> agentic-qe (MinCut/Consensus)

**Actual reality:**

1. **agentic-flow consensus agents:** 7 agents (byzantine-coordinator,
   raft-manager, gossip-coordinator, etc.) exist as YAML agent definitions.
   They are LLM-prompted agents that SIMULATE consensus, not actual
   distributed consensus implementations.

2. **ruvector graph algorithms:** `hooks graph-mincut` and `hooks graph-cluster`
   are real implementations (Stoer-Wagner MinCut, Louvain clustering) for CODE
   ARCHITECTURE analysis, not distributed consensus.

3. **@ruvector/edge-full:** A WASM toolkit for edge AI. Includes vector search,
   graph DB, DAG workflows. The Raft implementation, if present, is for the
   distributed cluster mode (`ruvector cluster`), not for code analysis.

4. **hive-mind in claude-flow:** `npx @claude-flow/cli@latest hive-mind` provides
   Queen-led coordination. This is task coordination, not Raft/BFT consensus.

**When would you use this?**
- MinCut/Louvain: During pretrain Phase 9 to analyze code architecture
- Hive-mind: When running 10+ claude-flow agents that need coordination
- Raft/BFT agents: Only in theory; they're prompt-based agents, not actual
  distributed systems

**Verdict:** MIXED. MinCut/Louvain are real algorithms for code analysis.
The "consensus" agents are LLM simulations. @ruvector/edge-full Raft may
exist at the library level but is not exposed through any CLI pipeline.

---

## Part 4: Missing Integration Opportunities

### 4.1 Packages That SHOULD Integrate But DON'T

#### Memory Unification (Critical Gap)

**Problem:** 4 separate memory stores with no automatic synchronization.

| System | Location | Format |
|--------|----------|--------|
| claude-flow | `.swarm/memory.db` | sql.js SQLite |
| ruvector | `.ruvector/intelligence.json` | JSON file |
| agentic-qe | `.agentic-qe/memory.db` | better-sqlite3 |
| agentdb | Configurable | Graph DB |

**What the skill should include:**
- Periodic sync script that exports ruvector intelligence to claude-flow memory
- Cross-search wrapper that queries both backends
- Session-end hook that triggers bidirectional sync

#### Routing Unification (High Priority Gap)

**Problem:** 4 independent routing systems give different recommendations.

Tested with "write integration tests for auth module":
- ruvector `route`: `coder` (confidence 0, default)
- ruvector `route-enhanced`: `typescript-developer` (confidence 0.5, default)
- agentic-qe `route`: `qe-test-architect` (confidence 25.3%)
- claude-flow `pre-task`: separate recommendation

**What the skill should include:**
- Unified routing strategy: Use agentic-qe for QE tasks, ruvector for general tasks
- Domain detection: if task mentions "test/coverage/quality" -> agentic-qe route
- Otherwise -> ruvector route-enhanced

#### ReasoningBank Convergence (Medium Gap)

**Problem:** ruvector SONA and agentic-qe SONA are separate instances with
separate pattern stores.

**What the skill should include:**
- Export/import bridge for SONA patterns
- `ruvector hooks export` -> `agentic-qe hooks learn` pipeline
- Shared foundational patterns

### 4.2 Configuration That Should Be Set But ISN'T

#### agentic-flow MCP Registration

`npx agentic-flow mcp list` returns "No MCP servers configured" by default.
The 213 tools exist but need explicit registration.

**Required setup (not documented in hooks init):**
```bash
npx agentic-flow mcp start claude-flow   # registers 101 tools
npx agentic-flow mcp start flow-nexus    # registers 96 tools
npx agentic-flow mcp start agentic-payments  # registers 6 tools
```

#### agentic-qe Initialization

agentic-qe auto-initializes on first command, creating `.agentic-qe/memory.db`.
However, it is NOT wired into `.claude/settings.json` hooks.

**Missing from hooks init:**
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Task",
        "command": "npx agentic-qe hooks pre-task --description \"$TASK_DESCRIPTION\" --json"
      }
    ]
  }
}
```

#### Worker Dispatch Fix

The `ruvector workers dispatch` -> agentic-flow integration is broken.

**Missing configuration:**
- agentic-flow needs to be configured with an API key
- The dispatch argument forwarding needs `--agent` and `--task` flags
- Workers should fall back to `ruvector native` when agentic-flow fails

#### claude-flow Memory Initialization

`npx @claude-flow/cli@latest memory store` fails with "Database not initialized".

**Required setup:**
```bash
npx @claude-flow/cli@latest memory init --force
```

This should be part of the standard init sequence but is NOT included in
`ruvector hooks init`.

### 4.3 Steps the Skill Should Include for Wiring

#### Step-by-Step Wiring Sequence

The skill (as of v0.5) covered claude-flow init and ruvector hooks init but
misses the companion package wiring. The complete sequence should be:

```bash
# 1. claude-flow init (already in skill)
npx @claude-flow/cli@latest init --wizard

# 2. claude-flow memory init (MISSING from skill)
npx @claude-flow/cli@latest memory init --force

# 3. ruvector hooks init (already in skill)
# WRONG: --pretrain here creates NULL embeddings! See SKILL.md Guardrail #1.
# Correct: npx ruvector hooks init --fast --build-agents quality
npx ruvector hooks init --fast --build-agents quality

# 4. post-init-fix.sh (already in skill)
bash scripts/post-init-fix.sh

# 5. agentic-qe init (MISSING from skill)
npx agentic-qe init

# 6. Register agentic-flow MCP servers (MISSING from skill)
# Only if user wants the 213 MCP tools:
npx agentic-flow mcp start claude-flow
npx agentic-flow mcp start flow-nexus

# 7. Configure API keys (MISSING from skill)
npx agentic-flow config set ANTHROPIC_API_KEY sk-ant-...
# or:
npx agentic-flow config set OPENROUTER_API_KEY sk-or-...

# 8. Wire agentic-qe hooks into settings.json (MISSING from skill)
# Add QE-specific hooks for test-related tasks

# 9. Verify cross-package integration
npx ruvector hooks remember "test pattern" --semantic
npx ruvector hooks recall "test pattern" --semantic
npx @claude-flow/cli@latest memory search --query "test"
npx agentic-qe hooks search --query "test"
```

#### Cross-Package Memory Sync Hook

Add to `.claude/settings.json` Stop hook:

```bash
# Export ruvector intelligence to claude-flow at session end
npx @claude-flow/cli@latest memory store \
  --key "rv-sync-$(date +%s)" \
  --value "$(npx ruvector hooks export --include-all 2>/dev/null)" \
  --namespace ruvector-sync 2>/dev/null || true
```

#### Unified Routing Wrapper

For the skill to recommend a single routing interface, it could use:

```bash
# For QE tasks (test, coverage, quality, security):
npx agentic-qe hooks route --task "$TASK"

# For general development tasks:
npx ruvector hooks route-enhanced "$TASK" --file "$FILE"

# Detection: check if task contains QE keywords
echo "$TASK" | grep -qiE 'test|coverage|quality|security|compliance' \
  && npx agentic-qe hooks route --task "$TASK" \
  || npx ruvector hooks route-enhanced "$TASK"
```

---

## Summary: What's Real vs What's Aspirational

### Fully Working (verified)

| Component | Status | Evidence |
|-----------|--------|----------|
| ruvector hooks (55 commands) | Working | remember/recall/route all produce output |
| ruvector embed text (ONNX) | Working | 384d embeddings generated in ~3s |
| ruvector attention info/compute | Working | 10 mechanisms listed, CLI functional |
| ruvector gnn info/compress/search | Working | GNN layer + TensorCompress operational |
| ruvector native workers | Working | security/analysis/learning run locally |
| agentic-qe routing | Working | Routes to QE agents with domain matching |
| agentic-qe hooks | Working | 14 hooks functional, ReasoningBank seeded |
| agentic-qe domains (13) | Working | All domains listed, idle but operational |
| agentic-flow agent list (87) | Working | All agents listed and categorizable |
| agentic-flow proxy | Working | Model proxy for cost optimization |

### Partially Working (issues found)

| Component | Issue |
|-----------|-------|
| ruvector workers dispatch | Argument forwarding to agentic-flow broken (shows help) |
| ruvector route confidence | Always 0 until Q-learning trained (cold start) |
| ruvector embed adaptive | LoRA exists but 0 adaptations (never trained) |
| ruvector hooks graph-mincut | Crashed with "Cannot read properties of undefined" |
| claude-flow memory | "Database not initialized" until explicit init |
| agentic-flow MCP tools | "No servers configured" until explicit setup |

### Aspirational / Not Wired

| Claimed Feature | Reality |
|----------------|---------|
| Unified memory pipeline | 4 separate stores, no automatic sync |
| Cascading routing pipeline | 4 independent routers, no composition |
| SONA cross-package learning | Separate SONA instances per package |
| ReasoningBank sharing | 3 separate implementations |
| Automatic LoRA adaptation | Requires manual training iterations |
| Worker -> agentic-flow -> results | Dispatch broken, no result feedback |
| Consensus (Raft/BFT) agents | LLM-simulated, not real distributed consensus |
| 213 MCP tools auto-available | Require explicit server start |

### Dependency Overlap Map

Shared packages between the ecosystem:

| Package | ruvector | agentic-flow | agentic-qe |
|---------|----------|-------------|------------|
| `@ruvector/core` | Built-in | ^0.1.29 | -- |
| `@ruvector/router` | Built-in | ^0.1.25 | -- |
| `@ruvector/tiny-dancer` | Built-in | ^0.1.15 | -- |
| `@ruvector/sona` | Built-in | (via ruvector) | 0.1.5 |
| `@ruvector/gnn` | Built-in | (via ruvector) | 0.1.19 |
| `@ruvector/attention` | Built-in | (via ruvector) | 0.1.3 |
| `@xenova/transformers` | -- | ^2.17.2 | ^2.6.0 |
| `onnxruntime-node` | (via embed) | ^1.23.2 | -- |
| `hnswlib-node` | -- | -- | ^3.0.0 |
| `better-sqlite3` | -- | -- | ^12.4.1 |
| `agentdb` | -- | ^2.0.0-alpha | -- |
| `ruvector` (full) | -- | ^0.1.69 | -- |

The key observation: agentic-flow depends on ruvector directly (full package).
agentic-qe depends on 3 @ruvector sub-packages but NOT ruvector itself.
claude-flow has its own separate dependency tree via @claude-flow/* packages.
