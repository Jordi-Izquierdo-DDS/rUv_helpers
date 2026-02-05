# Learning & Consolidation Reference

> **Version:** v0.9.1 | **Updated:** 2026-02-02 | **Ecosystem:** claude-flow v3.0.0-alpha.190 + ruvector 0.1.96

## Contents
- SONA (Self-Optimizing Neural Architecture)
- HNSW Indexing
- Q-Learning (9 algorithms, 6 task types)
- TinyDancer (FastGRNN model routing)
- Dream Cycles (6 variants of memory consolidation) -- SEPARATE from MinCut
- MinCut (Stoer-Wagner graph partitioning) -- SEPARATE from Dream Cycles
- Louvain / Spectral Clustering
- Attention Mechanisms (10 types)
- GNN + TensorCompress

**IMPORTANT:** Dream Cycles and MinCut are completely unrelated features with
zero shared code. Dream Cycles = neural memory consolidation (Rust/SONA).
MinCut = graph partitioning for code architecture (TypeScript). They are
documented together here only because both are in the ruvector ecosystem.

---

## SONA (Self-Optimizing Neural Architecture)

**Package:** `@ruvector/sona` (Rust native N-API)

Dual-loop adaptive learning modeled on biological memory:
- **Micro-LoRA** (rank 1-2): <1ms inference adaptation
- **Base-LoRA** (rank 8+): Background k-means clustering
- **EWC++** (Elastic Weight Consolidation): Prevents catastrophic forgetting
- **ReasoningBank**: Trajectory clustering for pattern storage

### SonaConfig

```typescript
{
  hiddenDim: 64, embeddingDim: 128,
  microLoraRank: 2, baseLoraRank: 8,
  microLoraLr: 0.01, baseLoraLr: 0.001,
  ewcLambda: 0.4, patternClusters: 16,
  trajectoryCapacity: 1000, backgroundIntervalMs: 5000,
  qualityThreshold: 0.5, enableSimd: true
}
```

### API

```typescript
import { SonaEngine } from '@ruvector/sona';
const engine = new SonaEngine(); // or SonaEngine.withConfig({...})
const trajId = engine.beginTrajectory();
engine.endTrajectory(trajId, 0.9);
const adapted = engine.applyMicroLora(new Float64Array([...]));
engine.tick(); // triggers background consolidation every 5000ms
engine.forceLearn();
const patterns = engine.findPatterns();
```

**Pattern types:** General, Reasoning, Factual, Creative, CodeGen, Conversational

**Storage:** In-memory (Rust). No native serialize/deserialize API.
Persistence via trajectory warm-up replay on load (FIX-013): the last 50 trajectories
from the database are replayed into a fresh SonaEngine on each hook invocation, warming
up LoRA weights. Without FIX-013, SONA starts from zero every invocation.
`tick()` and `forceLearn()` are wired into hook lifecycle by FIX-015:
tick() runs after post-edit and post-command, forceLearn() runs at session-end.

> **Edge/WASM cross-reference:** For browser/WASM usage, the same SONA Rust core is available as `WasmSonaEngine` in `@ruvector/edge-full/sona`. The `WasmEphemeralAgent` and `WasmFederatedCoordinator` enable federated learning across browser tabs. See [edge-full-reference.md](edge-full-reference.md) Module 5: SONA.

---

## HNSW Indexing

**Packages:** `@ruvector/core` (Rust native), claude-flow memory system

```typescript
{
  dimensions: 384, maxElements: 10000,
  distanceMetric: 'cosine', // cosine | euclidean | dot | manhattan
  hnswM: 16, hnswEfConstruction: 200, hnswEfSearch: 50
}
```

**Performance:** 150x-12,500x faster than brute force, ~0.045ms search, 95%+ recall at k=10.

**Persistence:** VectorDB supports a `storagePath` option that enables automatic HNSW
index persistence to disk. FIX-014 patches the constructor to use `.ruvector/hnsw.db`.
In many engine versions, `storagePath` is already configured — FIX-014 detects this and
skips if unnecessary. Without persistence, the HNSW index is rebuilt from scratch on
every hook invocation.

---

## Q-Learning & Reinforcement Learning

### 9 Algorithms

| Algorithm | Best For | Default lr | gamma |
|-----------|---------|-----------|-------|
| `q-learning` | General routing | 0.1 | 0.95 |
| `sarsa` | Error avoidance | 0.05 | 0.99 |
| `double-q` | Agent routing (DEFAULT) | 0.1 | 0.95 |
| `actor-critic` | Confidence scoring | 0.01 | 0.95 |
| `ppo` | Context ranking | 0.0003 | 0.99 |
| `decision-transformer` | Trajectory learning | 0.001 | 0.99 |
| `monte-carlo` | Unbiased estimates | 0.1 | 0.99 |
| `td-lambda` | Memory recall | 0.1 | 0.9 |
| `dqn` | Complex routing | 0.001 | 0.99 |

### 6 Pre-configured Task Types

| Task | Algorithm |
|------|-----------|
| agent-routing | double-q |
| error-avoidance | sarsa |
| confidence-scoring | actor-critic |
| trajectory-learning | decision-transformer |
| context-ranking | ppo |
| memory-recall | td-lambda |

### CLI

```bash
npx ruvector hooks learning-config --list                     # list all algorithms
npx ruvector hooks learning-config --show                     # show current config
npx ruvector hooks learning-config -t agent-routing -a double-q -l 0.1 -g 0.95
npx ruvector hooks learning-stats                             # show performance
npx ruvector hooks learning-stats --json
npx ruvector hooks learn -s "ts-file" -a "coder" -r 0.9 -t agent-routing
npx ruvector hooks learning-update -t agent-routing -s "state" -a "action" -r 0.8 -n "next-state" -d
npx ruvector hooks batch-learn -f experiences.json -t agent-routing
```

---

## TinyDancer (Intelligent Model Routing)

**Package:** `@ruvector/tiny-dancer` (Rust native, FastGRNN, **NO WASM fallback**)

Supported platforms: linux-x64/arm64-gnu, darwin-x64/arm64, win32-x64-msvc.

> **Platform limitation:** Pre-built binaries are published for Linux x64 only. macOS ARM64 and Windows binaries are not yet available. Systems without binaries will fail to load TinyDancer; use `ruvector doctor --verbose` to check.

```typescript
import { Router } from '@ruvector/tiny-dancer';
const router = new Router({
  modelPath: './model.safetensors',
  confidenceThreshold: 0.85
});
const response = await router.route({
  queryEmbedding: new Float32Array([...]),
  candidates: [{ id: 'agent-1', embedding: new Float32Array([...]), successRate: 0.85 }]
});
```

---

## Dream Cycles (Memory Consolidation)

**COMPLETELY SEPARATE from MinCut.** Dream Cycles is neural memory consolidation
modeled on biological sleep. MinCut is graph partitioning for code architecture.
Zero shared code, different languages (Rust vs TypeScript), different purposes.

### What Dream Cycles Does

Strengthens frequently-accessed memories, prunes low-quality patterns, models
forgetting curves. Triggered by SONA's `tick()` (every 5000ms) and at session end.

### 6 Consolidation Variants

| Variant | Description | Mechanism |
|---------|-------------|-----------|
| **EWC** | Elastic Weight Consolidation | Protects important weights from overwriting |
| **Memory Physics** | Physical memory model | Gravitational attraction + entropic decay |
| **SONA Loop C** | Core consolidation loop | Background k-means within SONA engine |
| **Dream Generation** | Synthetic memory replay | Generates new patterns from existing memories |
| **Collective Dreaming** | Multi-agent consolidation | Agents share memories across swarm |
| **Federated Consolidation** | Cross-project patterns | Aggregates intelligence from multiple projects |

### Sleep Stage Model

Dream Cycles uses a biological sleep stage model:
- **Awake** — Normal operation, no consolidation
- **LightSleep** — Begin memory scoring, low-priority consolidation
- **DeepSleep** — Full EWC consolidation, weight protection
- **REM** — Dream generation, synthetic replay
- **Lucid** — Directed consolidation with specific goals

### CLI Access

```bash
npx ruvector embed adaptive --consolidate     # EWC consolidation
npx ruvector embed neural --consolidate       # Full dream cycle
npx ruvector embed neural --memory-stats      # Memory physics stats
npx ruvector embed neural --drift-stats       # Semantic drift monitoring
npx ruvector embed adaptive --stats           # Consolidation statistics
npx ruvector embed adaptive --export weights.json   # Export learned weights
npx ruvector embed adaptive --import weights.json   # Import weights
```

### Programmatic (via @ruvector/sona)

```typescript
import { SonaEngine } from '@ruvector/sona';
const engine = new SonaEngine();
engine.tick();         // triggers consolidation if interval elapsed
engine.forceLearn();   // force immediate consolidation
```

---

## MinCut (Stoer-Wagner Graph Partitioning)

**COMPLETELY SEPARATE from Dream Cycles.** MinCut finds minimum-weight cuts in
code dependency graphs to identify optimal module boundaries. Implemented in
TypeScript (graph-algorithms.ts, 618 lines). Used for code architecture analysis.

### CLI

```bash
npx ruvector hooks graph-mincut src/**/*.ts --partitions 2
npx ruvector hooks graph-mincut src/auth/*.ts src/db/*.ts --partitions 3
```

Finds the minimum weight cut to partition code files. Used for:
- Identifying module boundaries
- Detecting tightly-coupled code
- Suggesting refactoring boundaries
- Automated during pretrain Phase 9

Also available in claude-flow: `npx @claude-flow/cli@latest analyze boundaries src/`

---

## Louvain / Spectral Clustering

Related to MinCut but different algorithm. Detects code communities.

```bash
npx ruvector hooks graph-cluster src/**/*.ts --method louvain
npx ruvector hooks graph-cluster src/**/*.ts --method spectral --clusters 3
```

- **Louvain**: Community detection via modularity optimization. Automatic cluster count.
- **Spectral**: Eigenvalue-based clustering. Requires specifying cluster count.

---

## Attention Mechanisms (10 types)

**Package:** `@ruvector/attention` (Rust native)

| Type | Complexity | Notes |
|------|-----------|-------|
| DotProductAttention | O(n^2) | Standard |
| MultiHeadAttention | O(n^2) | Configurable heads |
| FlashAttention | O(n^2) IO-optimized | 2.49x-7.47x speedup |
| HyperbolicAttention | O(n^2) | Poincare ball model |
| LinearAttention | O(n) | Fastest |
| MoEAttention | O(n*k) | Mixture of Experts |
| GraphRoPeAttention | O(n^2) | Rotary position |
| EdgeFeaturedAttention | O(n^2) | Edge features |
| DualSpaceAttention | O(n^2) | Dual space |
| LocalGlobalAttention | O(n*k) | Hierarchical |

**Training:** AdamOptimizer, AdamWOptimizer, SgdOptimizer, InfoNceLoss, CurriculumScheduler

### CLI

```bash
npx ruvector attention info
npx ruvector attention list --verbose
npx ruvector attention compute -q '[1,0,0]' -k keys.json -t flash
npx ruvector attention benchmark -d 256 -n 100 -t dot,flash,linear
npx ruvector attention hyperbolic -a exp-map -v '[0.1,0.2,0.3]' -c 1.0
```

---

## GNN + TensorCompress

**Package:** `@ruvector/gnn` (Rust native)

### TensorCompress Levels

| Level | Access Frequency | Savings |
|-------|-----------------|---------|
| none | > 0.8 | Full precision |
| half | > 0.4 | ~50% |
| pq8 | > 0.1 | ~8x |
| pq4 | > 0.01 | ~16x |
| binary | <= 0.01 | ~32x |

**Features:** RuvectorLayer (multi-head), differentiableSearch (soft attention), hierarchicalForward (multi-layer)

### CLI

```bash
npx ruvector gnn info
npx ruvector gnn layer -i 384 -h 128 -a 4 --test
npx ruvector gnn compress -f embeddings.json -l auto -a 0.5
npx ruvector gnn search -q '[0.1,0.2,...]' -c candidates.json -k 5 -t 0.5
npx ruvector hooks compress                       # TensorCompress on patterns
npx ruvector hooks compress-stats --json
npx ruvector hooks compress-store -k "mykey" -v '[0.1,...]' -l pq8
npx ruvector hooks compress-get -k "mykey"
```

---

## Self-Learning Pipeline: End-to-End Data Flow

> **Required dependency:** Stages 3-6 of this pipeline require `@ruvector/sona`
> (`npm install @ruvector/sona`). Without it, trajectory recording, LoRA
> adaptation, pattern clustering, and EWC++ consolidation silently do nothing.
> The CLI hooks (`hooks intelligence trajectory-*`) will run but store no data.
> Only stages 1-2 (hook recording + embedding generation) and stage 7 (routing
> via Q-learning) function without SONA. If you skipped `@ruvector/sona` during
> Q2b package selection, the learning pipeline is limited to event recording
> and keyword/Q-learning routing.

The ruvector ecosystem contains a complete self-learning loop that spans user
actions, embedding generation, trajectory recording, LoRA adaptation, pattern
clustering, EWC++ consolidation, and routing decisions. The edge WASM bundle
(`@ruvector/edge-full`) wires these stages into a single binary. On the CLI
side, the same stages exist as separate packages connected through `ruvector
hooks` and `claude-flow` commands. This section documents the full pipeline as
it actually executes, mapping each stage to both its CLI surface and its
underlying package.

### Pipeline Diagram

```
 USER ACTION (edit file, complete task, record outcome)
       |
       v
 +---------------------+   CLI: hooks post-task / post-edit
 | 1. HOOKS TRIGGER    |   Pkg: ruvector CLI (TypeScript)
 |    Record event      |   Writes to: .ruvector/intelligence.json
 +---------------------+
       |
       v
 +---------------------+   CLI: hooks remember --semantic / memory store
 | 2. EMBEDDING GEN    |   Pkg: @ruvector/core (HNSW, Rust NAPI)
 |    Text -> Float32   |        or @ruvector/edge-full/onnx (WASM)
 |    via ONNX / HNSW   |   Stores: HNSW index (in-memory, Rust)
 +---------------------+
       |
       v
 +---------------------+   CLI: hooks intelligence trajectory-start / -step / -end
 | 3. SONA TRAJECTORY  |   Pkg: @ruvector/sona (Rust NAPI)
 |    RECORDING         |        or @ruvector/edge-full/sona (WASM)
 |    Begin -> Steps    |   API: startTrajectory(emb) -> recordStep(tid, node,
 |    -> End(score)     |        score, latency) -> endTrajectory(tid, score)
 +---------------------+
       |
       v
 +---------------------+   Automatic (SONA internal)
 | 4. MICRO-LoRA       |   Pkg: @ruvector/sona
 |    ADAPTATION        |   Mechanism: rank-1/2 LoRA applied on inference
 |    (< 1ms)           |   API: applyLora(input) / runInstantCycle()
 +---------------------+
       |
       v
 +---------------------+   CLI: hooks worker dispatch --trigger consolidate
 | 5. PATTERN           |        (KNOWN BROKEN -- use alternative below)
 |    CLUSTERING        |   Alt: npx ruvector native run learning --path .
 |    (background)      |   Pkg: @ruvector/sona (k-means, Rust)
 +---------------------+   Config: patternClusters (default 16)
                           API: findPatterns(query, k)
                           Types: General, Reasoning, Factual, Creative,
       |                         CodeGen, Conversational
       v
 +---------------------+   CLI: ruvector embed adaptive --consolidate
 | 6. EWC++            |   Pkg: @ruvector/sona (Rust)
 |    CONSOLIDATION    |   Also: SONA tick() every 5000ms (automatic)
 |    (Dream Cycles)   |   Config: ewcLambda (default 0.4 CLI / 1000.0 edge)
 +---------------------+   Prevents catastrophic forgetting of old patterns
       |
       v
 +---------------------+   CLI: hooks route / pre-task / route-enhanced
 | 7. ROUTING          |   Pkg: see "Three Routers" below
 |    DECISIONS        |   Output: agent type, model tier, confidence
 +---------------------+
       |
       v
 NEXT ACTION (agent selection, model tier, task execution)
       |
       +---> loops back to step 1 when the next task completes
```

### Stage Details

**Stage 1 -- Hooks Trigger.** Every completed task or file edit fires a CLI
hook that records the event. `hooks post-task` writes a task outcome
(success/failure, agent used, latency). `hooks post-edit` writes a file-level
outcome and optionally triggers neural training (`--train-neural true`). On the
edge, the equivalent is `WasmEphemeralAgent.processTask(embedding, quality)`,
which records a trajectory internally without CLI involvement.

```bash
# CLI
npx ruvector hooks post-task --task-id "fix-auth-bug" --success true
npx ruvector hooks post-edit --file "src/auth.ts" --train-neural true

# Edge (programmatic)
agent.processTask(embedding, 0.9);
```

**Stage 2 -- Embedding Generation.** The event text is converted to a
Float32Array vector. On the CLI side, `@ruvector/core` provides HNSW indexing
(Rust NAPI) and embeddings are generated via the ONNX model downloaded by
`hooks route-enhanced` or via `ruvector embed`. On the edge,
`@ruvector/edge-full/onnx` runs an ONNX model (e.g., all-MiniLM-L6-v2) in WASM
to produce 384-dimension embeddings. The HNSW index (`@ruvector/core` on CLI,
`WasmHnswIndex` on edge) stores the vector for fast nearest-neighbor retrieval.

```bash
# CLI
npx ruvector hooks remember "JWT refresh token pattern" --semantic
npx @claude-flow/cli@latest memory store --key "pattern-jwt" \
  --value "Use refresh tokens with short-lived access tokens" \
  --namespace patterns

# Edge
const hnsw = new WasmHnswIndex();
hnsw.insert("pattern-jwt", embedding);
```

**Stage 3 -- SONA Trajectory Recording.** A trajectory is a sequence of
decision steps taken during a task. SONA records the query embedding at start,
each intermediate step (node visited, quality score, latency), and a final
score at end. Trajectories accumulate in a buffer (capacity configurable,
default 1000 on CLI / 10000 on edge). On the CLI, the `hooks intelligence`
subcommands drive this; on the edge, `WasmSonaEngine` methods are called
directly.

```bash
# CLI
npx ruvector hooks intelligence trajectory-start --embedding "[0.1,0.2,...]"
npx ruvector hooks intelligence trajectory-step --id 42 --node 7 --score 0.8
npx ruvector hooks intelligence trajectory-end --id 42 --score 0.85
```

**Stage 4 -- Micro-LoRA Adaptation.** When trajectories accumulate, SONA
applies rank-1 or rank-2 LoRA updates to its internal weight matrices. This
happens at inference time (<1ms) and adapts the routing model to the most recent
patterns. `runInstantCycle()` flushes pending micro-LoRA updates immediately.
There is no separate CLI command; this is automatic inside `@ruvector/sona`.
The adapted weights are applied via `applyLora(input)`, which transforms an
input embedding through the learned LoRA matrices.

**Stage 5 -- Pattern Clustering.** Periodically (every `backgroundIntervalMs`,
default 5000ms), SONA runs k-means clustering over accumulated trajectories to
produce base-LoRA patterns (rank 8+). These are the durable learned patterns
categorized into 6 types. `findPatterns(query, k)` retrieves the k nearest
patterns to a query embedding. On the CLI, `hooks worker dispatch --trigger
consolidate` forces this; on the edge, `engine.forceLearn()` does the same.

**Stage 6 -- EWC++ Consolidation (Dream Cycles).** Elastic Weight Consolidation
prevents new learning from overwriting important old patterns. SONA computes a
Fisher information matrix over the current pattern weights and adds a quadratic
penalty (controlled by `ewcLambda`) that resists deviation from previously
consolidated weights. This runs during `tick()` calls (every 5s) and can be
forced via `forceLearn()`. Dream Cycles model biological sleep stages (Awake,
LightSleep, DeepSleep, REM, Lucid) with different consolidation strategies at
each stage. See the "Dream Cycles" section above for the 6 consolidation
variants.

**Stage 7 -- Routing Decisions.** The consolidated patterns and adapted LoRA
weights feed into routing. See the next subsection for how the three routing
subsystems interact.

### Three Routers: When Each Is Used

The ruvector ecosystem has three routing subsystems. They are independent
libraries with different algorithms and different CLI entry points. The edge
WASM bundle compresses all three into a single binary where they chain
naturally; on the CLI side, they do not currently chain automatically.

```
               Task Description (text)
                       |
          +------------+------------+
          |            |            |
          v            v            v
   @ruvector/router  @ruvector/   @ruvector/sona
   (SemanticRouter)  tiny-dancer  (WasmSonaEngine)
                     (Router)
          |            |            |
   HNSW intent     FastGRNN       LoRA-adapted
   matching        neural net     embedding
   (cosine sim     (< 100us)      transform
    on intents)                    (< 1ms)
          |            |            |
          v            v            v
   Agent type      Model tier     Quality-aware
   by intent       (Haiku/        pattern-
   match score     Sonnet/Opus)   adjusted route
```

**@ruvector/router (SemanticRouter)** -- HNSW-based intent matching. Compares
the task embedding against pre-registered intents (e.g., "code-review",
"security-audit") using cosine similarity on a 384-dim HNSW index. Returns the
best-matching intent with a score. Used for coarse agent-type selection (which
kind of agent handles this task).

- CLI: `npx ruvector hooks route "[task]"` uses keyword/Q-learning routing
  internally (NOT the SemanticRouter library directly). The SemanticRouter is
  available programmatically via `@ruvector/router` but is not wired to
  `hooks route` in current CLI versions.
- Edge: `WasmSemanticMatcher.matchAgent(task_description)` provides the same
  HNSW-based intent matching in WASM.
- When to use: first-pass routing to determine agent type. Fast, deterministic,
  requires pre-registered intents.

**@ruvector/tiny-dancer (Router)** -- FastGRNN neural network for model-tier
selection. Takes a query embedding and a list of candidate agents (each with
their own embedding and success rate), and returns a routing decision with
confidence and a `useLightweight` flag. The `useLightweight` field maps to the
3-tier model system: Tier 1 (agent booster, <1ms), Tier 2 (Haiku, ~500ms),
Tier 3 (Sonnet/Opus, 2-5s). Native-only (no WASM), requires SafeTensors model
file.

- CLI: Wired to IntelligenceEngine's `route()` via FIX-016. The engine tries
  TinyDancer first (confidence threshold 0.6), falls back to Q-learning if
  TinyDancer is unavailable or below threshold. Also used internally by
  `@ruvector/ruvllm` and `agentic-qe hooks route` for model tier decisions.
- Edge: Not available (native-only). The edge equivalent is
  `WasmSpikingNetwork` (LIF neurons with STDP learning) which provides
  bio-inspired routing in WASM.
- When to use: after agent type is known, to select the optimal model tier for
  cost/performance balance.

**@ruvector/sona (SonaEngine)** -- LoRA-based adaptive routing. Transforms
input embeddings through learned LoRA weights that encode patterns from past
task outcomes. The transformed embedding is then used for similarity search
against accumulated patterns. This is the self-improving component: each
completed task adjusts the LoRA weights, so routing quality improves over time
without explicit re-training.

- CLI: `npx ruvector hooks intelligence trajectory-*` commands record
  trajectories. `hooks post-task` with `--train-neural true` triggers learning.
  The actual LoRA-transformed routing is not exposed as a single CLI command;
  it happens within the intelligence engine.
- Edge: `WasmSonaEngine.applyLora(input)` applies the learned transformation,
  then `findPatterns(transformed, k)` retrieves the best matches.
- When to use: quality-aware routing that adapts based on outcome history.
  Requires accumulated trajectory data to be useful (cold-start returns
  defaults).

**Ideal chain (partially automated on CLI via FIX-016):**

```
1. SemanticRouter.route(text) -> candidate agent types  (NOT wired on CLI)
2. SonaEngine.applyLora(embedding) -> quality-adjusted embedding  (wired in engine)
3. TinyDancer.route(adjusted_emb, candidates) -> model tier for winner  (wired via FIX-016)
```

With FIX-016, steps 2-3 are automated: IntelligenceEngine's `route()` applies SONA
micro-LoRA to the query embedding, then passes it to TinyDancer for neural routing.
If TinyDancer confidence is below 0.6, it falls back to Q-learning. Step 1
(SemanticRouter) remains unwired on CLI — the engine uses its own agentMap + Q-learning
for coarse agent-type selection instead.

On the edge WASM bundle, all three subsystems chain in a single process.

### Federated Learning Across CLI Agents

When multiple CLI agents work on the same codebase (via `claude-flow swarm`),
each agent accumulates its own learning independently. Cross-agent learning
relies on the shared memory stores:

```
 Agent A (coder)              Agent B (tester)
 +-----------------+          +-----------------+
 | hooks post-task |          | hooks post-task |
 | --success true  |          | --success true  |
 +--------+--------+          +--------+--------+
          |                            |
          v                            v
 +-----------------+          +-----------------+
 | memory store    |          | memory store    |
 | --namespace     |          | --namespace     |
 |   patterns      |          |   patterns      |
 | --key "coder-   |          | --key "tester-  |
 |   jwt-pattern"  |          |   jwt-coverage" |
 +--------+--------+          +--------+--------+
          |                            |
          +-------+      +------------+
                  |      |
                  v      v
          +-------------------+
          | claude-flow       |
          | memory search     |  <-- Agent C (reviewer) queries
          | --query "jwt"     |      and finds both patterns
          | --namespace       |
          |   patterns        |
          +-------------------+
```

The mechanism is explicit, not automatic:

1. **After each task**, an agent stores its outcome via `memory store` (for
   claude-flow) or `hooks remember` (for ruvector). Both write to their
   respective stores (`.swarm/memory.db` for claude-flow, `.ruvector/
   intelligence.json` for ruvector).

2. **Before each task**, an agent searches memory via `memory search` or
   `hooks recall`. This retrieves patterns stored by ANY agent in that memory
   store, since all agents in a swarm share the same file-backed store.

3. **Cross-system bridge** does not happen automatically. Patterns in ruvector's
   `intelligence.json` are invisible to claude-flow's `memory.db` and vice
   versa. The session-end manual bridge (see daily-workflow.md) copies key
   ruvector patterns into claude-flow memory, but this runs only at session end,
   not in real time.

On the edge, federated learning is explicit but more structured:

```
 WasmEphemeralAgent("agent-1")     WasmEphemeralAgent("agent-2")
 +---------------------------+     +---------------------------+
 | processTask(emb, 0.9)    |     | processTask(emb, 0.7)    |
 | exportState()             |     | exportState()             |
 +------------+--------------+     +------------+--------------+
              |                                 |
              +--------+    +-------------------+
                       |    |
                       v    v
              +-------------------+
              | WasmFederated-    |
              | Coordinator       |
              | .aggregate(state) |  <-- quality filter (threshold 0.4)
              | .consolidate()    |  <-- EWC++ merge
              | .applyLora(input) |  <-- unified model
              +-------------------+
```

Each `WasmEphemeralAgent` collects trajectories and exports its state as JSON.
The `WasmFederatedCoordinator` aggregates these exports, applies a quality
threshold (rejecting trajectories below the threshold), runs EWC++
consolidation on the merged data, and produces a unified LoRA model that can be
applied to any subsequent embedding. This is the pattern that the CLI could
adopt: each CLI agent session exports its SONA state, a coordinator process
merges them, and the merged model is distributed back.

### Dream Cycles and Idle Consolidation

SONA Dream Cycles consolidate patterns during idle periods. The `tick()` method,
called on a timer (default every 5000ms), checks whether the background
learning interval has elapsed and, if so, runs a consolidation cycle. This
means that between tasks, while the user is thinking or the agent is waiting,
SONA is quietly strengthening frequently-accessed patterns and pruning low-
quality ones.

The sleep-stage model controls consolidation depth:

| Stage | Triggered By | What Happens |
|-------|-------------|--------------|
| Awake | Normal operation | No consolidation; micro-LoRA only |
| LightSleep | `tick()` interval elapsed | Score patterns, prune below threshold |
| DeepSleep | `forceLearn()` / `--consolidate` | Full EWC++ weight protection |
| REM | Extended idle (multiple ticks) | Dream generation (synthetic replay) |
| Lucid | Manual trigger | Directed consolidation on specific pattern types |

On the CLI, dream cycles run within the `@ruvector/sona` Rust runtime
(in-process). The `consolidate` background worker (`hooks worker dispatch
--trigger consolidate`) invokes this. If the worker dispatch is broken (known
bug), use `npx ruvector native run learning --path .` as the reliable
alternative.

On the edge, `WasmSonaEngine.tick()` and `WasmFederatedCoordinator.consolidate()`
serve the same purpose. A typical pattern is to run `tick()` on a
`setInterval` in the browser and `consolidate()` on a longer interval (e.g.,
every 30 seconds) in the coordinator tab or worker.

### Quantization in the Pipeline

The `WasmQuantizer` (edge) and `@ruvector/gnn` TensorCompress (CLI) sit between
embedding generation and HNSW storage. They reduce memory footprint for stored
vectors:

- **Scalar quantize** (4x compression): `WasmQuantizer.scalarQuantize(vector)`
- **Binary quantize** (32x compression): `WasmQuantizer.binaryQuantize(vector)`
- **TensorCompress** (CLI): `npx ruvector hooks compress` applies automatic
  tiered compression based on access frequency

Quantized vectors trade precision for memory savings. HNSW search works on the
original Float32 vectors; quantization is for storage and network transfer. The
`WasmAdaptiveCompressor` on the edge dynamically selects compression level based
on network conditions (bandwidth and latency).

### Summary: Package-to-Stage Mapping

| Pipeline Stage | CLI Command | Underlying Package | Edge WASM Class |
|----------------|-------------|-------------------|-----------------|
| Hooks trigger | `hooks post-task`, `hooks post-edit` | ruvector CLI (TS) | `WasmEphemeralAgent.processTask()` |
| Embedding gen | `hooks remember --semantic`, `embed` | `@ruvector/core` (HNSW) | `@ruvector/edge-full/onnx` |
| HNSW indexing | `memory store` (claude-flow) | `@ruvector/core` | `WasmHnswIndex` |
| Trajectory record | `hooks intelligence trajectory-*` | `@ruvector/sona` | `WasmSonaEngine.startTrajectory()` |
| Micro-LoRA adapt | (automatic) | `@ruvector/sona` | `WasmSonaEngine.applyLora()` |
| Pattern cluster | `hooks worker dispatch --trigger consolidate` (BROKEN -- use `npx ruvector native run learning --path .`) | `@ruvector/sona` (k-means) | `WasmSonaEngine.forceLearn()` |
| EWC++ consolidation | `ruvector embed adaptive --consolidate` | `@ruvector/sona` (EWC++) | `WasmFederatedCoordinator.consolidate()` |
| Semantic routing | `hooks route` | `@ruvector/router` (not wired) | `WasmSemanticMatcher` |
| Neural routing | engine `route()` (FIX-016) | `@ruvector/tiny-dancer` | `WasmSpikingNetwork` |
| Adaptive routing | `hooks intelligence` | `@ruvector/sona` | `WasmSonaEngine.findPatterns()` |
| Quantization | `hooks compress` | `@ruvector/gnn` | `WasmQuantizer` |
| Federated merge | (not available on CLI) | -- | `WasmFederatedCoordinator.aggregate()` |
