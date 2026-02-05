# Feature Overlap Resolution

> **Version:** v0.7 | **Generated:** 2026-01-31 | **Ecosystem:** claude-flow v3.0.0-alpha.190 + ruvector 0.1.96

When both claude-flow and ruvector provide a capability, use this reference to decide
which to use. **Default rule:** Use ruvector for intelligence/learning features; use
claude-flow for coordination/MCP features.

---

## Contents

- [Overlapping Features](#overlapping-features)
- [Unique Features (only one tool provides)](#unique-features-only-one-tool-provides)
- [Memory Fragmentation Warning](#memory-fragmentation-warning)
- [Routing Fragmentation](#routing-fragmentation)
- [Programmatic Routing Layers (@ruvector/*)](#programmatic-routing-layers-ruvector)

---

## Overlapping Features

| Feature | claude-flow | ruvector | Use when... |
|---------|------------|---------|-------------|
| Persistent memory | SQLite (sql.js) -- durable | JSON file -- volatile | claude-flow for durability; ruvector for hooks pipeline |
| Unified memory | @claude-flow/memory (AgentDB + HNSW) | @ruvector/rvlite (WASM + JSON) | claude-flow for cross-agent; ruvector for intelligence data |
| Vector search | @claude-flow/memory HNSW | @ruvector/core HNSW 150x-12,500x | ruvector for performance-critical search |
| Graph partitioning | `analyze boundaries` | `hooks graph-mincut` (Stoer-Wagner) | ruvector for algorithmic precision |
| Model routing | 3-tier (Haiku/Sonnet/Opus) | @ruvector/tiny-dancer FastGRNN | claude-flow for cost tiers; ruvector for neural routing |
| Q-Learning | agent routing | 9 algorithms, 6 task types | ruvector for advanced RL algorithms |
| Background workers | 12 daemon workers | 12 agentic-flow triggers + 3 native types | claude-flow daemon for MCP; ruvector native for local analysis |
| Adaptive learning | @claude-flow/neural (SONA integration) | @ruvector/sona (LoRA, ReasoningBank) | ruvector for LoRA/EWC++; claude-flow for MCP neural ops |
| Embeddings | ONNX (sql.js cached) | Adaptive LoRA + neural substrate | ruvector for adaptive; claude-flow for cached ONNX |
| Embedding providers | @claude-flow/embeddings (OpenAI, Transformers.js) | ruvector-extensions (OpenAI/Anthropic/Cohere/HF) | whichever matches your provider |
| Quality Engineering | @claude-flow/plugin-agentic-qe | agentic-qe (51 agents, 13 DDD) | agentic-qe standalone; plugin for claude-flow integration |
| HNSW (native vs WASM) | -- | `@ruvector/core` (NAPI-RS) vs `WasmHnswIndex` (@ruvector/edge-full) | native for server; WASM for browser/edge |
| SONA (native vs WASM) | -- | `@ruvector/sona` (NAPI-RS) vs `WasmSonaEngine` (@ruvector/edge-full) | native for persistent; WASM for ephemeral browser |
| Graph DB (native vs WASM) | -- | `@ruvector/graph-node` vs `GraphDB` (@ruvector/edge-full) | native for throughput; WASM for browser |
| Embeddings (CLI vs WASM) | -- | `ruvector embed` CLI vs `WasmEmbedder` (@ruvector/edge-full) | CLI for server pipelines; WASM for client-side |

---

## Unique Features (only one tool provides)

| Feature | Provider | Package/Command |
|---------|----------|-----------------|
| Module clustering | ruvector | `hooks graph-cluster` (Louvain/spectral) |
| Semantic routing | ruvector | @ruvector/router |
| LLM orchestration | ruvector | @ruvector/ruvllm |
| Memory consolidation | ruvector | @ruvector/sona Dream Cycles |
| Attention mechanisms | ruvector | @ruvector/attention (10 types) |
| Coherence verification | ruvector | agentic-qe, ruvector-attention-wasm (CGT Sheaf) |
| Graph export | ruvector | ruvector-extensions: Neo4j/D3/GEXF/GraphML/NetworkX |
| Temporal tracking | ruvector | ruvector-extensions: TemporalTracker |
| GNN + TensorCompress | ruvector | @ruvector/gnn |
| Hypergraph + Cypher | ruvector | @ruvector/graph-node |
| Edge/Browser (minimal) | ruvector | @ruvector/edge (364KB) |
| Edge/Browser (full stack) | ruvector | @ruvector/edge-full (8.4MB). See [edge-full-reference.md](edge-full-reference.md) |
| Distributed compute | ruvector | @ruvector/edge-net |
| Browser MCP server | ruvector | @ruvector/edge-net (WasmMcpServer) |
| Adversarial simulation | ruvector | @ruvector/edge-net |
| PostgreSQL | ruvector | @ruvector/postgres-cli |
| Consensus | ruvector | @ruvector/edge (Raft), agentic-qe (MinCut/Consensus) |
| Multi-LLM providers | claude-flow | @claude-flow/providers |
| Security | claude-flow | @claude-flow/security (Zod, path validation) |
| AI defense | claude-flow | @claude-flow/aidefence (AIMDS) |
| Browser automation | claude-flow | @claude-flow/browser (Playwright) |
| Plugin system | claude-flow | @claude-flow/plugins (SDK) |

---

## Memory Fragmentation Warning

This setup creates **4 separate memory stores** that do NOT automatically synchronize:

| Store | Location | Backend | Package |
|-------|----------|---------|---------|
| claude-flow | `.swarm/memory.db` | SQLite (sql.js) | @claude-flow/cli |
| ruvector | `.ruvector/intelligence.json` | JSON file | ruvector |
| agentic-qe | `.agentic-qe/memory.db` | SQLite (better-sqlite3) | agentic-qe |
| agentdb | varies | Graph DB | agentdb |

Patterns learned by ruvector are invisible to claude-flow and vice versa.
See [daily-workflow.md](daily-workflow.md) for session-end sync strategies.

---

## Routing Fragmentation

Four independent routing engines exist and may give DIFFERENT recommendations:

| Router | Command | Basis | Use When |
|--------|---------|-------|----------|
| ruvector route | `ruvector hooks route --task "..."` | Q-learning + keyword matching | General agent routing |
| ruvector route-enhanced | `ruvector hooks route-enhanced --task "..."` | Enhanced with file context | File-specific routing |
| claude-flow pre-task | `npx @claude-flow/cli@latest hooks pre-task --description "..."` | Model tier recommendation | Cost/performance routing |
| agentic-qe route | `npx agentic-qe hooks route --task "..."` | QE domain detection | Quality/testing tasks |

**Default:** Use `ruvector hooks route` for general tasks. Use `claude-flow hooks pre-task`
for cost optimization. Use `agentic-qe hooks route` for quality/testing.

---

## Programmatic Routing Layers (@ruvector/*)

Three packages provide programmatic routing at different latency tiers:

| Layer | Package | Algorithm | Latency | Use Case |
|-------|---------|-----------|---------|----------|
| Semantic intent | `@ruvector/router` | HNSW + SIMD | <1ms | Programmatic routing by intent similarity |
| Neural (FastGRNN) | `@ruvector/tiny-dancer` | FastGRNN circuit | <100us | Real-time hot-path routing with circuit breaker |
| Adaptive (SONA) | `@ruvector/sona` | LoRA + trajectory | <5ms | Learning-based routing that improves over time |

**CLI vs library usage:** The CLI `ruvector hooks route` does **NOT** chain these packages.
It uses Q-learning + keyword matching regardless of which packages are installed.
These packages are for **programmatic (library) use only**:

```javascript
// Programmatic chaining (your code, not hooks route):
import { SemanticRouter } from '@ruvector/router';
import { TinyDancerRouter } from '@ruvector/tiny-dancer';
// Chain manually: tiny-dancer -> router -> SONA
```

The ideal tiny-dancer -> router -> SONA chain is not yet automated on CLI.
See [learning-and-consolidation.md](learning-and-consolidation.md) for the full pipeline architecture.

---

## Worker Trigger Fallback Mapping

| Trigger | Native Alternative | Notes |
|---------|-------------------|-------|
| security | `npx ruvector native run security --path .` | Full replacement |
| analysis | `npx ruvector native run analysis --path .` | Full replacement |
| learning/consolidate | `npx ruvector native run learning --path .` | Full replacement |
| map | `npx ruvector hooks pretrain --verbose` | Partial (different scope) |
| ultralearn | (none) | Requires agentic-flow@alpha |
| optimize | (none) | Requires agentic-flow@alpha |
| audit | (none) | Requires agentic-flow@alpha |
| preload | (none) | Requires agentic-flow@alpha |
| deepdive | (none) | Requires agentic-flow@alpha |
| document | (none) | Requires agentic-flow@alpha |
| refactor | (none) | Requires agentic-flow@alpha |
| benchmark | (none) | Requires agentic-flow@alpha |
| testgaps | (none) | Requires agentic-flow@alpha |
| predict | (none) | Requires agentic-flow@alpha |

---

*v0.7 | 2026-01-31*
