# Ecosystem Packages Reference

> **Version:** v0.7 | **Generated:** 2026-01-31 | **Ecosystem:** claude-flow v3.0.0-alpha.190 + ruvector 0.1.96

Maturity assessments, version details, and dependency relationships for all
packages in the claude-flow + ruvector ecosystem.

All version numbers and metadata sourced from `npm view`, `npx ruvector
install --list`, and live CLI inspection on 2026-01-31.

## Contents

- [@ruvector/* Packages (30 packages)](#ruvector-packages-30-packages)
- [@claude-flow/* Packages (18 packages)](#claude-flow-packages-18-packages)
- [Standalone Packages](#standalone-packages)
- [Key Relationships](#key-relationships)
- [What "doctor" Checks](#what-doctor-checks)

---

## @ruvector/* Packages (30 packages)

### Native Packages (NAPI-RS, Rust compiled to Node.js)

| Package | Version | Maturity | Purpose | Install Priority |
|---------|---------|----------|---------|-----------------|
| `@ruvector/core` | 0.1.30 | Stable | HNSW vector DB (50k+ inserts/sec, 150x-12,500x search) | Required -- detected by `doctor` |
| `@ruvector/gnn` | 0.1.22 | Stable | Graph Neural Networks, TensorCompress (5 compression levels), differentiable search | Required for neural embedding -- detected by `doctor` |
| `@ruvector/graph-node` | 0.1.26 | Stable | Hypergraph DB with Cypher queries, ACID transactions (131K+ batch ops/sec) | Optional -- detected by `doctor` |
| `@ruvector/sona` | 0.1.5 | Stable | SONA: Micro-LoRA (<1ms), EWC++, ReasoningBank, Dream Cycles | Required for learning pipeline |
| `@ruvector/tiny-dancer` | 0.1.15 | Stable | FastGRNN neural routing (<100us), circuit breaker, hot-reload. Native ONLY, no WASM | Required for intelligent routing |
| `@ruvector/attention` | 0.1.4 | Stable | 10 attention mechanisms (Flash, Hyperbolic, MoE, Multi-Head, Linear, etc.) + training infra | Optional -- detected by `doctor` |
| `@ruvector/router` | 0.1.28 | Stable | Semantic intent router with HNSW + SIMD acceleration | Optional (programmatic use) |

All native packages have zero runtime dependencies. They ship platform-specific
binaries (linux-x64, linux-arm64, darwin-x64, darwin-arm64, win32-x64). Config
is via constructor parameters, not environment variables.

### WASM Packages (Rust compiled to WebAssembly)

| Package | Version | Maturity | Purpose | Install Priority |
|---------|---------|----------|---------|-----------------|
| `@ruvector/rvlite` | 0.2.4 | Stable | Edge vector DB: SQL + SPARQL + Cypher (850KB WASM) | Optional (edge/browser use) |
| `@ruvector/edge` | 0.1.9 | Beta | Browser AI swarms: P2P, post-quantum crypto, Raft, Gossip, HNSW (364KB) | Optional (browser deployment) |
| `@ruvector/edge-full` | 0.1.0 | Beta | Complete browser bundle: edge + graph + rvlite + sona + dag + onnx (8.4MB total) | Optional (browser deployment) |

#### @ruvector/edge-full Details

**6 bundled WASM modules** (zero runtime dependencies, ESM, tree-shakeable via `"sideEffects": false`):

| Module | Subpath Import | Size | Key Classes |
|--------|---------------|------|-------------|
| Edge Core | `@ruvector/edge-full/edge` | 364KB | `WasmIdentity`, `WasmCrypto`, `WasmHnswIndex`, `WasmRaftNode`, `WasmSpikingNetwork`, `WasmHybridKeyPair`, `WasmQuantizer`, `WasmSemanticMatcher`, `WasmAdaptiveCompressor` (9) |
| Graph DB | `@ruvector/edge-full/graph` | 288KB | `GraphDB`, `AsyncQueryExecutor`, `AsyncTransaction`, `BatchOperations`, `JsNode`, `JsEdge`, `JsHyperedge`, `QueryResult`, `ResultStream` (9) |
| RVLite | `@ruvector/edge-full/rvlite` | 260KB | `RvLite`, `Embedder`, `BaseLoRA`, `MicroLoRA`, `TrmEngine`, `TrmConfig`, `TrmResult`, `EmbeddingConfig`, `RvLiteConfig`, `LoraConfig` (10) |
| SONA | `@ruvector/edge-full/sona` | 238KB | `WasmSonaEngine`, `WasmEphemeralAgent`, `WasmFederatedCoordinator` (3) |
| DAG | `@ruvector/edge-full/dag` | 132KB | `WasmDag` (1) -- workflow orchestration, topological sort, critical path, attention |
| ONNX | `@ruvector/edge-full/onnx` | 7.1MB | `WasmEmbedder`, `WasmEmbedderConfig`, `PoolingStrategy` (3) -- 6 HuggingFace models, SIMD |

**Total:** 1.28MB core (5 modules) + 7.1MB optional ONNX = 8.4MB complete. 35 exported classes.

**Initialization API:**
- `initAll()` -- loads all 5 core modules in parallel (excludes ONNX). Returns `{ edge, graph, rvlite, sona, dag }`.
- `initModules(['edge', 'graph'])` -- selective loading, only initializes named modules. Supports `'onnx'`.
- Individual subpath imports (e.g., `import init from '@ruvector/edge-full/edge'`) for tree-shaking.

**When to use:** Edge-full is for browser/edge runtimes with zero server infrastructure. Use the CLI stack (`ruvector`, `@ruvector/core`, `@ruvector/sona`, etc.) for Node.js server workloads where native NAPI-RS performance matters. WASM and native runtimes do NOT share state -- see "Do NOT" item 14 in SKILL.md.

Full API documentation: [edge-full-reference.md](edge-full-reference.md)

#### @ruvector/edge-net Details

**Distributed compute network** (1.13MB WASM, 65 classes + 2 enums, zero runtime dependencies, ESM):

| Category | Key Classes |
|----------|------------|
| Identity | `PiKeyIdentity`, `IdentityManager`, `ReputationEngine` |
| Economics | `EconomicEngine`, `CreditLedger`, `StakingManager`, `RewardDistributor` |
| Security | `AdaptiveSecurity`, `SybilDefense`, `QLearningDefense`, `ThreatClassifier` |
| Consensus | `RacCoherence`, `ConsensusManager`, `ByzantineDetector` |
| Network | `KademliaDht`, `PeerManager`, `GossipProtocol`, `NatTraversal` |
| Compute | `TaskScheduler`, `WasmExecutor`, `ResourceAllocator` |
| Federated ML | `FederatedCoordinator`, `ModelAggregator`, `DifferentialPrivacy` |
| MCP | `WasmMcpServer`, `WasmMcpTransport`, `ToolRegistry` |
| Simulation | `AdversarialSimulator` (DDoS, Sybil, Byzantine fault injection) |

**CLI entry point:** `npx @ruvector/edge-net start` launches a local compute node.

**When to use:** Edge-net extends edge-full with a full distributed compute layer including token economics, adversarial security, and federated ML. Use edge-full for browser AI workloads; use edge-net when building decentralized compute networks with credit-based incentives.

Full API documentation: [edge-net-reference.md](edge-net-reference.md)

| `@ruvector/edge-net` | 0.5.3 | Beta | Distributed compute network: 65 classes + 2 enums, Pi-Key identity, rUv credits, Q-learning security, RAC consensus, federated ML, MCP browser server, Kademlia DHT (1.13MB) | Optional (distributed compute) |

> **Note:** @ruvector/edge-net npm latest is v0.5.3 (21 published versions). Previous documentation listed v0.1.0 -- significant version drift. The package has evolved to include Firebase, Google Cloud, genesis node, plugins, and models CLI commands.

| Package | Version | Maturity | Purpose | Install Priority |
|---------|---------|----------|---------|-----------------|
| `@ruvector/wasm` | 0.1.22 | Stable | WASM bindings for @ruvector/core VectorDb API | Optional (edge runtimes) |
| `@ruvector/router-wasm` | 0.1.0 | Beta | WASM semantic router for browsers (<100KB) | Optional (browser routing) |
| `ruvector-onnx-embeddings-wasm` | 0.1.2 | Stable | Portable WASM embeddings: 6 models, SIMD, parallel workers | Optional (cross-platform embeddings) |
| `ruvector-attention-wasm` | 0.1.32 | Stable | 8 WASM attention types + CGT Sheaf Attention (WASM-exclusive) | Optional (browser attention) |
| `@ruvector/nervous-system-wasm` | 0.1.29 | Beta | Bio-inspired AI: Hyperdimensional Computing (HDC), BTSP, neuromorphic computing (WASM) | Optional (neuromorphic computing) |

### JS/TS Packages

| Package | Version | Maturity | Purpose | Install Priority |
|---------|---------|----------|---------|-----------------|
| `@ruvector/ruvllm` | 2.4.1 | Most mature | Self-learning LLM orchestration: SONA + HNSW + RLM + FastGRNN + SIMD | Optional (LLM orchestration) |
| `@ruvector/agentic-synth` | 0.1.6 | Beta | Synthetic data generation for AI/ML training and RAG | Optional (data generation) |
| `ruvector-extensions` | 0.1.0 | Beta | Persistence (snapshots, export/import), temporal tracking, embedding providers, UI | Optional (persistence + providers) |
| `@ruvector/postgres-cli` | 0.2.6 | Stable | PostgreSQL vector extension: 53+ SQL functions, 39 attention mechanisms as SQL | Optional (PostgreSQL deployment) |
| `@ruvector/agentic-integration` | 1.0.0 | Stable | Distributed agent coordination with claude-flow integration | Optional (agent bridge) |
| `@ruvector/burst-scaling` | 1.0.0 | Stable | Adaptive burst scaling for 10-50x traffic spikes | Optional (production scaling) |
| `@ruvector/spiking-neural` | 1.0.1 | Stable | High-performance Spiking Neural Network with SIMD, CLI and SDK | Optional (neural networks) |
| `@ruvector/raft` | 0.1.1 | Beta | Raft consensus: leader election, log replication, fault tolerance | Optional (distributed consensus) |
| `@ruvector/replication` | 0.1.1 | Beta | Data replication, vector clocks, change data capture | Optional (multi-node) |
| `@ruvector/scipix` | 0.1.1 | Beta | OCR client for scientific documents: LaTeX, MathML extraction | Optional (scientific OCR) |
| `@ruvector/rudag` | 0.1.1 | Beta | Fast DAG library (Rust/WASM): topological sort, critical path, scheduling | Optional (DAG operations) |
| `@ruvector/graph-data-generator` | 0.1.0 | Beta | AI-powered synthetic graph data generation | Optional (test data) |

All 8 packages above are npm-only (not in `ruvector install --list`). Install
with `npm install <package>` directly.

### Miscellaneous @ruvector/* Packages

| Package | Version | Maturity | Purpose | Install Priority |
|---------|---------|----------|---------|-----------------|
| `@ruvector/cli` | 0.1.29 | Stable | TypeScript hooks-only subset of ruvector CLI. Use `ruvector` instead | Not recommended (use `ruvector`) |
| `@ruvector/node` | 0.1.18 | Beta | Unified ruvector package for Node.js | Optional (alternative entry) |

### Installed vs NPM-only

Only 5 packages appear in `ruvector install --list`:

| Package | Status in installer |
|---------|-------------------|
| `@ruvector/core` | Installed (detected by doctor) |
| `@ruvector/gnn` | Installed (detected by doctor) |
| `@ruvector/graph-node` | Installed (detected by doctor) |
| `@ruvector/agentic-synth` | Available (install via `ruvector install`) |
| `ruvector-extensions` | Available (install via `ruvector install`) |

All other packages must be installed via `npm install <package>` directly.

---

## @claude-flow/* Packages (18 packages)

### CLI Dependencies (bundled with `@claude-flow/cli`)

These are automatically installed when you install `claude-flow@latest`:

| Package | Version | Type | Purpose |
|---------|---------|------|---------|
| `@claude-flow/shared` | 3.0.0-alpha.1 | Direct dep | Foundation: shared types, events, utilities, core interfaces (11.2 MB, 541 files) |
| `@claude-flow/mcp` | 3.0.0-alpha.8 | Direct dep | MCP server implementation (stdio/http/websocket transports) |
| `@claude-flow/aidefence` | 3.0.2 | Direct dep | AI defense: prompt injection, jailbreak, PII detection. Most mature package (past alpha, zero deps) |
| `@claude-flow/embeddings` | 3.0.0-alpha.12 | Optional dep | Embedding providers: OpenAI, Transformers.js, ONNX. Most actively developed (7 versions) |
| `@claude-flow/plugin-gastown-bridge` | 0.1.1 | Optional dep | Gas Town orchestrator bridge: 20 MCP tools, WASM formula parsing |

### Library-Only Packages (install separately via npm)

These are NOT imported by the CLI. The CLI reimplements their functionality
internally. Install these only for programmatic/library use in TypeScript
projects:

| Package | Version | Maturity | Purpose |
|---------|---------|----------|---------|
| `@claude-flow/memory` | 3.0.0-alpha.2 | Alpha, stale | AgentDB unification, HNSW indexing, hybrid SQLite+AgentDB backend |
| `@claude-flow/neural` | 3.0.0-alpha.7 | Alpha, active | SONA bridge -- wraps @ruvector/sona for claude-flow integration. KEY ruvector integration point |
| `@claude-flow/hooks` | 3.0.0-alpha.7 | Alpha, moderate | Event-driven hooks, ReasoningBank, 12 background workers, statusline |
| `@claude-flow/providers` | 3.0.0-alpha.1 | Alpha, stale | Multi-LLM providers (Anthropic/OpenAI/Google/Cohere/Ollama/RuVector). Never updated |
| `@claude-flow/plugins` | 3.0.0-alpha.2 | Alpha, minimal | Plugin SDK: Worker, Hook, Provider integration. Framework, not functionality |
| `@claude-flow/security` | 3.0.0-alpha.1 | Alpha, stale | CVE remediation, input validation (Zod), path security. Never updated |
| `@claude-flow/claims` | 3.0.0-alpha.8 | Alpha, active | Issue claiming, work coordination, handoff. Exports MCP tools |
| `@claude-flow/browser` | 3.0.0-alpha.2 | Alpha, new | Browser automation via Playwright. Exports MCP tools |
| `@claude-flow/testing` | 3.0.0-alpha.2 | Alpha, stale | TDD London School framework, mocks, fixtures. References unpublished @claude-flow/swarm peer dep |
| `@claude-flow/plugin-agentic-qe` | 3.0.0-alpha.4 | Alpha, active | QE plugin: 51 agents, 13 DDD contexts, Coherence verification |
| `@claude-flow/swarm` | 3.0.0-alpha.1 | Alpha, new | Swarm coordination module for multi-agent orchestration |
| `@claude-flow/performance` | 3.0.0-alpha.1 | Alpha, new | Performance profiling and optimization module |
| `@claude-flow/deployment` | 3.0.0-alpha.1 | Alpha, new | Deployment management and release automation |

### Key architectural insight

**The CLI reimplements most package functionality internally.** Only 3 packages
are direct CLI dependencies (shared, mcp, aidefence) plus 2 optional
(embeddings, gastown-bridge). The standalone packages exist for:

1. **Programmatic library use** -- importing into TypeScript projects
2. **Plugin development** -- using the SDK to build extensions
3. **Standalone deployment** -- running hooks daemon or MCP server independently
4. **Testing** -- mock services for development

Installing @claude-flow/* library packages does NOT add CLI features. The CLI
at v3.0.0-alpha.190 has evolved independently of most packages. Some packages
(providers, security) have not been updated since initial publish and may
diverge from CLI internals.

---

## Standalone Packages

| Package | Version | Purpose | Relation to Ecosystem |
|---------|---------|---------|----------------------|
| `agentdb` | 2.0.0-alpha.2.20 | Graph memory DB with Cypher, hyperedges, ACID | Used by agentic-flow. Optional peer dep of @claude-flow/aidefence |
| `agentic-flow` | 2.0.6 | Agent orchestration: 87 agents, ~210 MCP tools (across 4 servers), ReasoningBank, model proxy | Worker dispatch target for ruvector. Depends on 7 @ruvector packages |
| `agentic-qe` | 3.3.5 | Quality Engineering: 51 QE agents, 13 DDD domains, O(log n) coverage, QE ReasoningBank | Separate hooks system, separate memory store. Uses @ruvector/gnn, sona, attention |

### agentic-flow agent count

The npm description says 66 agents. Actual `--list` output shows **87 agents**
across 13 categories: Core (5), Consensus (7), GitHub (12), Flow-Nexus (9),
Hive-Mind (5), Swarm (3), SPARC (4), Goal (3), Sublinear (5), Optimization (5),
V3 (5), Templates (9), Other (15).

### agentic-qe domain count

The npm description says 12 DDD bounded contexts. Actual `aqe domain list`
returns **13 domains** -- the `coordination` meta-domain is the 13th.

---

## Key Relationships

### Dependency layers

```
Layer 0 (Foundation):    @claude-flow/shared
Layer 1 (Core):          @claude-flow/memory, @claude-flow/mcp, @claude-flow/aidefence
Layer 2 (Intelligence):  @claude-flow/neural -> @ruvector/sona (THE bridge)
                         @claude-flow/embeddings
Layer 3 (Automation):    @claude-flow/hooks -> memory + neural + shared
                         @claude-flow/claims, @claude-flow/browser
Layer 4 (Plugins):       @claude-flow/plugins (SDK), @claude-flow/testing
Layer 5 (Extensions):    @claude-flow/plugin-agentic-qe, @claude-flow/plugin-gastown-bridge
```

### RuVector integration points in @claude-flow/*

| Package | RuVector Dependency | Integration Type |
|---------|-------------------|------------------|
| `@claude-flow/neural` | `@ruvector/sona` (direct) | Bridge -- wraps SONA for claude-flow |
| `@claude-flow/plugins` | `@ruvector/wasm`, `@ruvector/learning-wasm` (optional peer) | SDK support |
| `@claude-flow/providers` | `@ruvector/ruvllm` (optional peer) | LLM provider option |
| `@claude-flow/plugin-agentic-qe` | `@ruvector/gnn`, `/sona`, `/attention` (optional) | Acceleration layer |
| `@claude-flow/plugin-gastown-bridge` | `ruvector-gnn-wasm` (optional) | WASM graph ops |
| `@claude-flow/cli` | `@ruvector/sona`, `/attention`, `/learning-wasm` (optional) | Direct optional integration |

### Shared native bindings across ecosystem

These @ruvector packages are used by multiple consumers:

| Package | ruvector CLI | agentic-flow | agentic-qe |
|---------|-------------|-------------|------------|
| `@ruvector/core` | Built-in | ^0.1.29 | -- |
| `@ruvector/router` | Built-in | ^0.1.25 | -- |
| `@ruvector/tiny-dancer` | Built-in | ^0.1.15 | -- |
| `@ruvector/sona` | Built-in | (via ruvector) | 0.1.5 |
| `@ruvector/gnn` | Built-in | (via ruvector) | 0.1.19 |
| `@ruvector/attention` | Built-in | (via ruvector) | 0.1.3 |

agentic-flow depends on `ruvector` (the full CLI package, ^0.1.69) directly.
agentic-qe depends on 3 individual @ruvector sub-packages but NOT the full
ruvector CLI. claude-flow has its own separate dependency tree via @claude-flow
packages.

### The ruvllm orchestration layer

`@ruvector/ruvllm` (v2.4.1) is the highest-level orchestrator in the ruvector
ecosystem. It internally wires together:

- `@ruvector/sona` for self-learning (LoRA, EWC++, ReasoningBank)
- `@ruvector/tiny-dancer` for FastGRNN model-tier routing
- `@ruvector/core` for HNSW memory search
- SIMD module for batch cosine similarity and flash attention

It is listed in SKILL.md Q2b but is not integrated into the init sequence.

### Four separate memory stores

| System | Location | Format | Package |
|--------|----------|--------|---------|
| claude-flow | `.swarm/memory.db` | SQLite (sql.js WASM) | `@claude-flow/cli` |
| ruvector | `.ruvector/intelligence.json` | JSON file | `ruvector` |
| agentic-qe | `.agentic-qe/memory.db` | SQLite (better-sqlite3 native) | `agentic-qe` |
| agentdb | Configurable | Graph DB (Cypher) | `agentdb` |

**These do not synchronize automatically.** See
[daily-workflow.md](daily-workflow.md) for the manual bridge script.

### Three separate ReasoningBank implementations

| System | Backed by | Persisted to |
|--------|-----------|-------------|
| ruvector | `@ruvector/sona` (NAPI-RS) | `.ruvector/intelligence.json` |
| agentic-qe | `@ruvector/sona` (same library, separate instance) | `.agentic-qe/memory.db` (better-sqlite3) |
| claude-flow | `@claude-flow/neural` (internal reimplementation) | `.claude-flow/neural/` |

Both ruvector and agentic-qe use `@ruvector/sona` but with separate in-memory
instances. SONA state is in Rust and only persists when the host application
serializes it. They never share SONA state across packages.

---

## What "doctor" Checks

### `ruvector doctor -v`

Checks system health and a specific subset of packages:

| Check | What it verifies |
|-------|-----------------|
| Node.js version | >= 20 |
| Native bindings | `@ruvector/core` installed and working (native vs WASM) |
| `@ruvector/gnn` | Installed or not |
| `@ruvector/attention` | Installed or not |
| `@ruvector/graph-node` | Installed or not |
| Rust toolchain | Available for building from source |
| Build tools | Platform-specific (gcc, pkg-config, etc.) |

**Only checks 4 of 30 @ruvector packages.** Does not check sona, tiny-dancer,
router, ruvllm, edge, rvlite, postgres-cli, or any WASM packages.

### `npx @claude-flow/cli@latest doctor`

Checks claude-flow system health:

| Check | What it verifies |
|-------|-----------------|
| Node.js version | >= 20 |
| npm version | >= 9 |
| Git | Installed |
| Config file | `claude-flow.config.json` valid |
| Daemon | Running or stopped |
| Memory database | `.swarm/memory.db` accessible |
| API keys | `ANTHROPIC_API_KEY` present |
| MCP servers | Configured in settings.json |
| Disk space | Sufficient |
| TypeScript | Installed |

### What NEITHER doctor checks

| Gap | Why it matters |
|-----|---------------|
| Cross-package wiring | The 4 memory stores, 4 routers, and 3 ReasoningBanks are siloed |
| Pipeline integrity | Hooks may pass verify but produce NULL embeddings |
| Memory synchronization | No check that ruvector and claude-flow memories are bridged |
| Embedding quality | 64d n-gram vs 384d ONNX -- both pass, only ONNX is useful |
| Worker dispatch | `workers dispatch` is broken but no doctor checks this |
| agentic-qe initialization | Not checked by either doctor |
| ONNX model availability | First use downloads 23MB model; no pre-check |

For deep validation that covers these gaps, use:
```bash
bash scripts/validate-setup.sh
```

---

## Packages That Register MCP Tools

| Package | Tool Count | Tool Prefix | How to Access |
|---------|-----------|-------------|---------------|
| `@claude-flow/mcp` | ~40+ | (core tools) | `claude mcp add claude-flow -- npx -y @claude-flow/cli@latest` |
| `@claude-flow/hooks` | Variable | hooks_* | Via `@claude-flow/hooks/mcp` export |
| `@claude-flow/claims` | ~6 | claims_* | Via `@claude-flow/claims/api/mcp-tools` export |
| `@claude-flow/browser` | ~6 | browser_* | Via `@claude-flow/browser/mcp-tools` export |
| `@claude-flow/plugin-gastown-bridge` | 20 | gt_* | Optional CLI dep, auto-registered |
| `agentic-flow` | ~210 | (across 4 servers) | `npx agentic-flow mcp start <server>` (requires explicit registration) |

agentic-flow's 210 tools are spread across 4 bundled MCP servers (claude-flow:
101, flow-nexus: 96, agentic-payments: 6, agentic-flow: 7). They are NOT
auto-registered. Run `npx agentic-flow mcp start <server-name>` to activate.

---

> **Version:** v0.7 | **Generated:** 2026-01-31 | **Ecosystem:** claude-flow v3.0.0-alpha.190, @claude-flow/cli v3.0.0-alpha.190, ruvector v0.1.96, agentic-flow v2.0.6, agentic-qe v3.3.5
