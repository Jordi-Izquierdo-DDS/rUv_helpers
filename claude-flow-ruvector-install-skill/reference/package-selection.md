# Package Selection Reference

> **Version:** v0.7 | **Generated:** 2026-01-31 | **Ecosystem:** claude-flow v3.0.0-alpha.190 + ruvector 0.1.96

Companion to SKILL.md Q2. Use this when the user wants to pick specific packages
beyond the built-in installer.

---

## Contents

- [Recommended Default Bundle](#recommended-default-bundle)
- [Q2a: ruvector installer packages](#q2a-ruvector-installer-packages)
- [Q2b: Additional @ruvector/* packages (npm install)](#q2b-additional-ruvector-packages-npm-install)
- [Q2c: @claude-flow/* packages (npm install)](#q2c-claude-flow-packages-npm-install)
- [Q2d: Ecosystem packages (companion tools)](#q2d-ecosystem-packages-companion-tools)
- [Feature-to-Package Mapping](#feature-to-package-mapping)

---

## Recommended Default Bundle

For most projects, start with this and add packages as needed:

```bash
npm install claude-flow@latest ruvector@latest
npx ruvector install --all          # core + gnn + graph-node + agentic-synth + extensions
npm install @ruvector/sona @ruvector/tiny-dancer @ruvector/attention @ruvector/router
```

This gives you: HNSW search, SONA learning, FastGRNN routing, attention mechanisms,
semantic routing, GNN, graph DB, and the full hooks pipeline.

---

## Q2a: ruvector installer packages

Run `npx ruvector install --list` to see current status. The installer covers:
`@ruvector/core`, `@ruvector/gnn`, `@ruvector/graph-node`, `@ruvector/agentic-synth`,
`ruvector-extensions`, plus platform bindings.

| Command | Effect |
|---------|--------|
| `npx ruvector install --all` | Install all 5 installer packages |
| `npx ruvector install -i` | Interactive 13-item menu |
| `npx ruvector install <names>` | Specific packages |

---

## Q2b: Additional @ruvector/* packages (npm install)

These are NOT in `ruvector install --list`. Install via npm directly.

| Package | What it provides | Install |
|---------|-----------------|---------|
| `@ruvector/sona` | SONA: Micro-LoRA, EWC++, ReasoningBank, Dream Cycles | `npm i @ruvector/sona` |
| `@ruvector/tiny-dancer` | FastGRNN model routing, circuit breaker, hot-reload (native, NO WASM) | `npm i @ruvector/tiny-dancer` |
| `@ruvector/attention` | 10 attention mechanisms: Flash, Hyperbolic, MoE, Linear, Multi-Head, etc. | `npm i @ruvector/attention` |
| `@ruvector/router` | Semantic router: HNSW intent matching, SIMD acceleration | `npm i @ruvector/router` |
| `@ruvector/ruvllm` | Self-learning LLM orchestration: SONA + HNSW + RLM + FastGRNN | `npm i @ruvector/ruvllm` |
| `@ruvector/rvlite` | Edge vector DB (WASM): SQL/SPARQL/Cypher, SONA integration | `npm i @ruvector/rvlite` |
| `@ruvector/edge` | Browser AI swarms: P2P, post-quantum crypto, Raft consensus, HNSW (364KB) | `npm i @ruvector/edge` |
| `@ruvector/edge-full` | Complete browser WASM bundle (8.4MB): 6 modules. See [edge-full-reference.md](edge-full-reference.md) | `npm i @ruvector/edge-full` |
| `@ruvector/edge-net` | Distributed compute network (1.13MB WASM): 65 classes + 2 enums. See [edge-net-reference.md](edge-net-reference.md) | `npm i @ruvector/edge-net` |
| `@ruvector/postgres-cli` | PostgreSQL client: 53+ SQL functions, pgvector replacement | `npm i @ruvector/postgres-cli` |
| `@ruvector/wasm` | WASM bindings for @ruvector/core vector DB | `npm i @ruvector/wasm` |
| `@ruvector/router-wasm` | WASM semantic router for browsers | `npm i @ruvector/router-wasm` |
| `ruvector-extensions` | Temporal tracking, embedding providers (OpenAI/Anthropic/Cohere/HF), graph export, UI | `npm i ruvector-extensions` |
| `ruvector-onnx-embeddings-wasm` | Portable WASM embeddings (browser, Cloudflare Workers, Deno) | `npm i ruvector-onnx-embeddings-wasm` |
| `ruvector-attention-wasm` | WASM attention: CGT Sheaf Attention, coherence gating, GPU+SIMD | `npm i ruvector-attention-wasm` |
| `@ruvector/agentic-integration` | Distributed agent coordination with claude-flow integration | `npm i @ruvector/agentic-integration` |
| `@ruvector/burst-scaling` | Adaptive burst scaling for 10-50x traffic spikes | `npm i @ruvector/burst-scaling` |
| `@ruvector/spiking-neural` | High-performance Spiking Neural Network with SIMD, CLI and SDK | `npm i @ruvector/spiking-neural` (**requires cmake**; skip if cmake unavailable) |
| `@ruvector/raft` | Standalone Raft consensus: leader election, log replication, fault tolerance | `npm i @ruvector/raft` |
| `@ruvector/replication` | Data replication with vector clocks and change data capture | `npm i @ruvector/replication` |
| `@ruvector/scipix` | OCR client for scientific documents: LaTeX, MathML extraction | `npm i @ruvector/scipix` |
| `@ruvector/rudag` | Fast DAG library (Rust/WASM): topological sort, critical path, scheduling | `npm i @ruvector/rudag` |
| `@ruvector/graph-data-generator` | AI-powered synthetic graph data generation | `npm i @ruvector/graph-data-generator` |
| `@ruvector/nervous-system-wasm` | Bio-inspired AI: Hyperdimensional Computing (HDC), BTSP, neuromorphic computing (WASM) | `npm i @ruvector/nervous-system-wasm` |

---

## Q2c: @claude-flow/* packages (npm install)

> **Note:** The claude-flow CLI reimplements most of these internally. Only
> `@claude-flow/shared`, `@claude-flow/mcp`, and `@claude-flow/aidefence` are direct
> CLI dependencies. The rest are for **programmatic/library use** in your own code --
> installing them does NOT add features to the CLI.

| Package | What it provides | Install (latest tag) |
|---------|-----------------|----------------------|
| `@claude-flow/memory` | AgentDB unification, HNSW indexing, hybrid SQLite+AgentDB | `npm i @claude-flow/memory@v3alpha` |
| `@claude-flow/neural` | SONA learning integration, neural modes | `npm i @claude-flow/neural` |
| `@claude-flow/hooks` | Event-driven hooks, ReasoningBank learning integration | `npm i @claude-flow/hooks@alpha` |
| `@claude-flow/mcp` | Standalone MCP server (stdio/http/websocket transports) | `npm i @claude-flow/mcp` |
| `@claude-flow/embeddings` | Embedding providers: OpenAI, Transformers.js, Mock | `npm i @claude-flow/embeddings@v3alpha` |
| `@claude-flow/providers` | Multi-LLM provider system (Anthropic/OpenAI/Google/Cohere/Ollama) | `npm i @claude-flow/providers` |
| `@claude-flow/plugins` | Plugin SDK: Worker, Hook, Provider integration | `npm i @claude-flow/plugins@v3alpha` |
| `@claude-flow/security` | CVE remediation, input validation (Zod), path security | `npm i @claude-flow/security` |
| `@claude-flow/claims` | Issue claiming, work coordination for multi-agent | `npm i @claude-flow/claims` |
| `@claude-flow/browser` | Browser automation via Playwright for AI agents | `npm i @claude-flow/browser@alpha` |
| `@claude-flow/aidefence` | AIMDS: prompt injection detection, jailbreak detection, PII | `npm i @claude-flow/aidefence` |
| `@claude-flow/testing` | TDD London School framework, test utilities, fixtures | `npm i @claude-flow/testing@v3alpha` |
| `@claude-flow/shared` | Common types, events, utilities, core interfaces | `npm i @claude-flow/shared` |
| `@claude-flow/plugin-agentic-qe` | QE plugin: 51 agents, 13 DDD contexts, Coherence verification | `npm i @claude-flow/plugin-agentic-qe` |
| `@claude-flow/plugin-gastown-bridge` | Gas Town orchestrator, WASM formula parsing, graph analysis | `npm i @claude-flow/plugin-gastown-bridge` |
| `@claude-flow/swarm` | Swarm coordination module for multi-agent orchestration | `npm i @claude-flow/swarm` |
| `@claude-flow/performance` | Performance profiling and optimization module | `npm i @claude-flow/performance` |
| `@claude-flow/deployment` | Deployment management and release automation | `npm i @claude-flow/deployment@v3alpha` |

> **Dist-tag notice (2026-01-31):** 7 packages have newer versions behind `v3alpha` or `alpha`
> tags instead of `latest`. The install commands above already use the correct tag for each
> package. If you used plain `npm i @claude-flow/<pkg>` before, re-install with the tagged
> versions shown above. Key gaps: embeddings (alpha.1 → alpha.12), hooks (alpha.1 → alpha.7),
> deployment (alpha.1 → alpha.7).

---

## Q2d: Ecosystem packages (companion tools)

| Package | What it provides | Install |
|---------|-----------------|---------|
| `agentic-flow` | Worker orchestration: 87 agents, 213 MCP tools, ReasoningBank memory | `npm i agentic-flow@latest` |
| `agentic-qe` | Quality Engineering: 51 QE agents, mathematical Coherence verification, ReasoningBank learning | `npm i agentic-qe@latest` |

> **v0.9.4.1:** Use `agentic-flow@latest` (v2.0.6+), NOT `@alpha`. The `@alpha` tag (v2.0.2-alpha) has `peerDep: claude-flow@^2.7.0` which conflicts with CF v3 and creates a duplicate dependency subtree. The `@latest` tag dropped all peer deps.

If you selected agentic-qe, initialize after installation:
```bash
npx agentic-qe init
npx agentic-qe hooks wire   # Wire QE hooks into settings.json
```

---

## Feature-to-Package Mapping

| Feature | Required package(s) |
|---------|-------------------|
| HNSW vector search (150x-12,500x) | `@ruvector/core` (via installer) |
| TinyDancer intelligent routing | `@ruvector/tiny-dancer` (npm only) |
| SONA adaptive learning | `@ruvector/sona` (npm only) |
| ReasoningBank + Dream Cycles | `@ruvector/sona` (npm only) |
| Flash/Hyperbolic/MoE attention | `@ruvector/attention` (npm only) |
| Coherence verification (mathematical) | `agentic-qe` or `ruvector-attention-wasm` (CGT Sheaf) |
| MinCut graph partitioning | Built into `ruvector` CLI (`hooks graph-mincut`) |
| Louvain/Spectral clustering | Built into `ruvector` CLI (`hooks graph-cluster`) |
| Semantic intent routing | `@ruvector/router` (npm only) |
| Q-Learning (9 algorithms) | Built into `ruvector` CLI (`hooks learning-config`) |
| Graph Neural Networks | `@ruvector/gnn` (via installer) |
| TensorCompress | `@ruvector/gnn` (via installer) |
| Hypergraph DB + Cypher | `@ruvector/graph-node` (via installer) |
| PostgreSQL vector DB | `@ruvector/postgres-cli` (npm only) |
| Edge/Browser deployment (minimal) | `@ruvector/edge` (364KB) |
| Edge/Browser deployment (full) | `@ruvector/edge-full` (8.4MB). See [edge-full-reference.md](edge-full-reference.md) |
| LLM orchestration (self-learning) | `@ruvector/ruvllm` (npm only) |
| Prompt injection defense | `@claude-flow/aidefence` (npm only) |
| Multi-LLM failover | `@claude-flow/providers` (npm only) |
| Browser automation | `@claude-flow/browser` (npm only) |
| Background workers (12 agentic-flow triggers + 3 native types) | `agentic-flow` + `ruvector native` (npm) |
| Distributed compute network | `@ruvector/edge-net` (npm only) |
| Credit/token economy | `@ruvector/edge-net` (EconomicEngine, CreditLedger) |
| Q-learning adaptive security | `@ruvector/edge-net` (AdaptiveSecurity, SybilDefense) |
| Browser MCP server | `@ruvector/edge-net` (WasmMcpServer) |

---

*v0.7 | 2026-01-31*
