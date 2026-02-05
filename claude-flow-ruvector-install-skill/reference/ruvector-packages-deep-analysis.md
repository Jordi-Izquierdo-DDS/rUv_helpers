# RuVector Packages Deep Analysis

> **Version:** v0.7 | **Generated:** 2026-01-31 | **Ecosystem:** claude-flow v3.0.0-alpha.190 + ruvector 0.1.96
>
> Comprehensive investigation of all @ruvector/* packages, their API surfaces,
> configuration options, integration points, and ecosystem wiring.

---

## Contents

- [Summary Table](#summary-table)
- [Package Categories](#package-categories)
- [@ruvector/core (Native HNSW Vector DB)](#1-ruvectorcore-native-hnsw-vector-db)
  - [Exports](#exports-7)
  - [VectorDb Constructor](#vectordb-constructor)
  - [VectorDb Instance Methods](#vectordb-instance-methods)
  - [CollectionManager Methods](#collectionmanager-methods)
  - [Performance](#performance)
  - [Integration with ruvector CLI](#integration-with-ruvector-cli)
- [@ruvector/gnn (Graph Neural Networks)](#2-ruvectorgnn-graph-neural-networks)
  - [Exports](#exports-13)
  - [RuvectorLayer](#ruvectorlayer)
  - [TensorCompress - 5 Compression Levels](#tensorcompress---5-compression-levels)
  - [differentiableSearch](#differentiablesearch)
  - [Integration with ruvector CLI](#integration-with-ruvector-cli-1)
- [@ruvector/graph-node (Hypergraph DB)](#3-ruvectorgraph-node-hypergraph-db)
  - [Exports](#exports-8)
  - [GraphDatabase Constructor](#graphdatabase-constructor)
  - [GraphDatabase Instance Methods](#graphdatabase-instance-methods-15)
  - [Performance](#performance-1)
  - [Cypher Support](#cypher-support)
  - [Integration with ruvector CLI](#integration-with-ruvector-cli-2)
- [@ruvector/agentic-synth (Synthetic Data Generator)](#4-ruvectoragentic-synth-synthetic-data-generator)
  - [Package Exports](#package-exports)
  - [AgenticSynth Constructor](#agenticsynth-constructor)
  - [Key Methods](#key-methods)
  - [CLI Usage](#cli-usage)
  - [Environment Variables](#environment-variables)
  - [Integration](#integration)
- [ruvector-extensions (Persistence, Temporal Tracking)](#5-ruvector-extensions-persistence-temporal-tracking)
  - [Key Class: DatabasePersistence](#key-class-databasepersistence)
  - [Methods](#methods)
  - [Integration](#integration-1)
- [@ruvector/sona -- EXTENDED ANALYSIS](#6-ruvectorsona----extended-analysis)
  - [Single Export: SonaEngine](#single-export-sonaengine)
  - [SonaConfig (Full Options)](#sonaconfig-full-options)
  - [SonaEngine Instance Methods](#sonaengine-instance-methods-14)
  - [SONA Architecture: Dual Learning Loops](#sona-architecture-dual-learning-loops)
  - [Micro-LoRA (Instant Adaptation)](#micro-lora-instant-adaptation)
  - [Base LoRA (Background Learning)](#base-lora-background-learning)
  - [EWC++ (Elastic Weight Consolidation)](#ewc-elastic-weight-consolidation)
  - [ReasoningBank (Pattern Storage and Recall)](#reasoningbank-pattern-storage-and-recall)
  - [PatternType Classification](#patterntype-classification)
  - [Dream Cycles (Background Learning Variants)](#dream-cycles-background-learning-variants)
  - [Integration with ruvector CLI](#integration-with-ruvector-cli-3)
  - [Performance Characteristics](#performance-characteristics)
- [@ruvector/tiny-dancer -- EXTENDED ANALYSIS](#7-ruvectortiny-dancer----extended-analysis)
  - [Exports](#exports-3)
  - [Router Constructor](#router-constructor)
  - [Router Instance Methods](#router-instance-methods-3)
  - [FastGRNN Architecture](#fastgrnn-architecture)
  - [Circuit Breaker Behavior](#circuit-breaker-behavior)
  - [Hot-Reload](#hot-reload)
  - [RoutingRequest / RoutingResponse](#routingrequest--routingresponse)
  - [Why NO WASM Fallback](#why-no-wasm-fallback)
  - [Integration with ruvector CLI](#integration-with-ruvector-cli-4)
  - [Performance](#performance-2)
- [@ruvector/attention -- EXTENDED ANALYSIS](#8-ruvectorattention----extended-analysis)
  - [All 10 Attention Mechanism Types](#all-10-attention-mechanism-types)
  - [Attention Feature Categories](#attention-feature-categories-from-info)
  - [Common compute() Signature](#common-compute-signature)
  - [Training Infrastructure](#training-infrastructure-10-exports)
  - [Batch and Parallel Processing](#batch-and-parallel-processing-5-exports)
  - [Hyperbolic Math Utilities](#hyperbolic-math-utilities-5-exports)
  - [Enums](#enums)
  - [Integration with ruvector CLI](#integration-with-ruvector-cli-5)
- [@ruvector/router (Semantic Router)](#9-ruvectorrouter-semantic-router)
  - [Exports](#exports-3-1)
  - [SemanticRouter Constructor](#semanticrouter-constructor)
  - [SemanticRouter Instance Methods](#semanticrouter-instance-methods-11)
  - [Usage Pattern](#usage-pattern)
- [@ruvector/ruvllm (Self-Learning LLM Orchestration)](#10-ruvectorruvllm-self-learning-llm-orchestration)
  - [Package Exports](#package-exports-1)
  - [RuvLLM Constructor](#ruvllm-constructor)
  - [Key Methods](#key-methods-1)
  - [RlmController (Recursive Language Model)](#rlmcontroller-recursive-language-model)
  - [Key RLM Methods](#key-rlm-methods)
  - [SIMD Module](#simd-module)
  - [Performance](#performance-3)
  - [Integration](#integration-2)
- [@ruvector/rvlite (Edge Vector DB with WASM)](#11-ruvectorrvlite-edge-vector-db-with-wasm)
  - [Three Query Languages](#three-query-languages)
  - [CLI](#cli)
  - [Features](#features)
- [@ruvector/edge (Browser AI Swarms)](#12-ruvectoredge-browser-ai-swarms)
  - [Package Exports](#package-exports-2)
  - [Key WASM Classes](#key-wasm-classes)
  - [Two Consensus Modes](#two-consensus-modes)
  - [WorkerPool](#workerpool)
- [@ruvector/edge-full (Complete Browser WASM)](#13-ruvectoredge-full-complete-browser-wasm)
  - [Module Exports](#module-exports)
  - [6 Bundled Modules](#6-bundled-modules)
  - [initAll()](#initall)
- [@ruvector/postgres-cli (PostgreSQL Vector Extension)](#14-ruvectorpostgres-cli-postgresql-vector-extension)
  - [CLI Commands](#cli-commands)
  - [Install Options](#install-options)
  - [53+ SQL Functions](#53-sql-functions)
  - [Environment Variables](#environment-variables-1)
- [@ruvector/wasm (WASM Bindings for Core)](#15-ruvectorwasm-wasm-bindings-for-core)
- [@ruvector/router-wasm (WASM Semantic Router)](#16-ruvectorrouter-wasm-wasm-semantic-router)
  - [Key Features](#key-features)
  - [API (WASM)](#api-wasm)
- [ruvector-onnx-embeddings-wasm (Portable WASM Embeddings)](#17-ruvector-onnx-embeddings-wasm-portable-wasm-embeddings)
  - [Package Exports](#package-exports-3)
  - [WasmEmbedder API](#wasmembedder-api)
  - [Available Models](#available-models-6)
  - [Convenience Functions](#convenience-functions)
- [ruvector-attention-wasm (WASM Attention Mechanisms)](#18-ruvector-attention-wasm-wasm-attention-mechanisms)
  - [8 Attention Types (WASM)](#8-attention-types-wasm)
  - [Training Utilities (WASM)](#training-utilities-wasm)
  - [Usage](#usage)
- [Ecosystem Wiring Diagram](#ecosystem-wiring-diagram)
- [Key Integration Points for Claude Flow](#key-integration-points-for-claude-flow)
  - [Which packages does ruvector doctor detect?](#which-packages-does-ruvector-doctor-detect)
  - [Which packages does ruvector embed use?](#which-packages-does-ruvector-embed-use)
  - [Which packages register CLI hooks?](#which-packages-register-cli-hooks)
  - [Environment Variables (All Packages)](#environment-variables-all-packages)
- [Platform Binary Matrix](#platform-binary-matrix)

---

## Summary Table

| # | Package | Version | Type | Deps | Key Exports | Status |
|---|---------|---------|------|------|-------------|--------|
| 1 | `@ruvector/core` | 0.1.30 | Native (NAPI-RS) | 0 | VectorDb, CollectionManager | Installed |
| 2 | `@ruvector/gnn` | 0.1.22 | Native (NAPI-RS) | 0 | RuvectorLayer, TensorCompress, differentiableSearch | Installed |
| 3 | `@ruvector/graph-node` | 0.1.26 | Native (NAPI-RS) | 0 | GraphDatabase, QueryResultStream | Installed |
| 4 | `@ruvector/agentic-synth` | 0.1.6 | JS/TS | 5 | AgenticSynth, generators, cache | Available |
| 5 | `ruvector-extensions` | 0.1.0 | JS/TS | 4 | DatabasePersistence, snapshots, export/import | Available |
| 6 | `@ruvector/sona` | 0.1.5 | Native (NAPI-RS) | 0 | SonaEngine | NPM-only |
| 7 | `@ruvector/tiny-dancer` | 0.1.15 | Native (NAPI-RS) | 0 | Router | NPM-only |
| 8 | `@ruvector/attention` | 0.1.4 | Native (NAPI-RS) | 0 | 10 attention types, optimizers, trainers | Installed |
| 9 | `@ruvector/router` | 0.1.28 | Native (NAPI-RS) | 0 | SemanticRouter, VectorDb | NPM-only |
| 10 | `@ruvector/ruvllm` | 2.4.1 | JS/TS + Native | 3 | RuvLLM, RlmController, SIMD module | NPM-only |
| 11 | `@ruvector/rvlite` | 0.2.4 | WASM | 0 | Database (SQL+SPARQL+Cypher) | NPM-only |
| 12 | `@ruvector/edge` | 0.1.9 | WASM | 0 | Identity, Crypto, HNSW, Raft, Gossip, WorkerPool | NPM-only |
| 13 | `@ruvector/edge-full` | 0.1.0 | WASM bundle | 0 | edge + graph + rvlite + sona + dag + onnx | NPM-only |
| 14 | `@ruvector/postgres-cli` | 0.2.6 | CLI (JS/TS) | 6 | CLI tool, 53+ SQL functions | NPM-only |
| 15 | `@ruvector/wasm` | 0.1.22 | WASM | 1 | WASM bindings for core | NPM-only |
| 16 | `@ruvector/router-wasm` | 0.1.0 | WASM | 0 | VectorDB, SemanticRouter (browser) | NPM-only |
| 17 | `ruvector-onnx-embeddings-wasm` | 0.1.2 | WASM | 0 | WasmEmbedder, ModelLoader, parallel | NPM-only |
| 18 | `ruvector-attention-wasm` | 0.1.32 | WASM | 0 | 8 attention types + CGT Sheaf, trainers | NPM-only |

### Legend
- **Installed** = Present in `ruvector install --list` and detected by `ruvector doctor`
- **Available** = Listed in `ruvector install --list` but not yet installed
- **NPM-only** = Must be installed separately via npm; not in the built-in installer

---

## Package Categories

```
NATIVE (NAPI-RS, Rust compiled to Node.js)
  core, gnn, graph-node, sona, tiny-dancer, attention, router

WASM (Rust compiled to WebAssembly)
  rvlite, edge, edge-full, wasm, router-wasm,
  ruvector-onnx-embeddings-wasm, ruvector-attention-wasm

JS/TS (Pure JavaScript/TypeScript)
  agentic-synth, ruvector-extensions, ruvllm, postgres-cli
```

---

## 1. @ruvector/core (Native HNSW Vector DB)

**Version:** 0.1.30
**Description:** High-performance vector database with HNSW indexing - 50k+ inserts/sec, built in Rust for AI/ML similarity search.
**Dependencies:** None (zero deps, native binary)
**Main Entry:** `index.js`

### Exports (7)

| Export | Type | Purpose |
|--------|------|---------|
| `VectorDb` | Class | Main vector database with HNSW |
| `CollectionManager` | Class | Multi-collection management |
| `JsDistanceMetric` | Enum | Euclidean, Cosine, DotProduct, Manhattan |
| `hello()` | Function | Health check / hello world |
| `version()` | Function | Returns version string |
| `getHealth()` | Function | System health information |
| `getMetrics()` | Function | Performance metrics |

### VectorDb Constructor

```typescript
new VectorDb({
  dimensions: number,        // Required: vector dimensionality
  maxElements?: number,      // Default: 10000
  storagePath?: string,      // Persistent storage path (omit for in-memory)
  ef_construction?: number,  // Default: 200 (higher = better recall, slower build)
  m?: number,                // Default: 16 (higher = better recall, more memory)
  distanceMetric?: string,   // 'cosine' | 'euclidean' | 'dot'
})
```

### VectorDb Instance Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `insert` | `(entry: VectorEntry) => Promise<string>` | Insert a vector with id, metadata |
| `insertBatch` | `(entries: VectorEntry[]) => Promise<string[]>` | Bulk insert |
| `search` | `(query: SearchQuery) => Promise<SearchResult[]>` | k-NN similarity search |
| `get` | `(id: string) => Promise<VectorEntry \| null>` | Retrieve by ID |
| `delete` | `(id: string) => Promise<boolean>` | Remove a vector |
| `len` | `() => Promise<number>` | Total vector count |
| `isEmpty` | `() => Promise<boolean>` | Check if empty |

### CollectionManager Methods

| Method | Purpose |
|--------|---------|
| `createCollection` | Create a named collection |
| `deleteCollection` | Remove a collection |
| `listCollections` | List all collections |
| `getStats` | Collection statistics |
| `createAlias` | Create a named alias for a collection |
| `deleteAlias` | Remove an alias |
| `listAliases` | List all aliases |

### Performance

| Operation | Throughput | Latency (p50) |
|-----------|------------|---------------|
| Insert | 52,341 ops/sec | 0.019 ms |
| Search (k=10) | 11,234 ops/sec | 0.089 ms |
| Delete | 45,678 ops/sec | 0.022 ms |
| Memory | ~50 bytes/128-dim vector | - |

### Integration with ruvector CLI

- Detected by `ruvector doctor` as `@ruvector/core installed` with `Native binding working (native)`
- Used by `ruvector embed text <text>` for storing embeddings
- Used by `ruvector hooks` for memory-based pattern matching
- Backend for the SemanticRouter in `@ruvector/router`

---

## 2. @ruvector/gnn (Graph Neural Networks)

**Version:** 0.1.22
**Description:** Graph Neural Network capabilities - Node.js bindings with NAPI-RS.
**Dependencies:** None (requires platform-specific binary e.g. `@ruvector/gnn-linux-x64-gnu`)
**Main Entry:** `index.js`

### Exports (13)

| Export | Type | Purpose |
|--------|------|---------|
| `RuvectorLayer` | Class(4 args) | GNN layer: input_dim, hidden_dim, heads, dropout |
| `TensorCompress` | Class | Adaptive tensor compression (5 levels) |
| `NativeRuvectorLayer` | Class | Low-level native layer |
| `NativeTensorCompress` | Class | Low-level native compressor |
| `differentiableSearch` | Function(4) | Soft attention-based search with temperature |
| `hierarchicalForward` | Function(3) | Multi-layer GNN forward pass |
| `nativeDifferentiableSearch` | Function | Native variant |
| `nativeHierarchicalForward` | Function | Native variant |
| `init` | Function | Module initialization |
| `getCompressionLevel` | Function | Returns compression level for access frequency |
| `toFloat32Array` | Function(1) | Convert to Float32Array |
| `toFloat32ArrayBatch` | Function(1) | Batch conversion |
| `toFloat32ArrayBatchOptimized` | Function(2) | Optimized batch conversion |

### RuvectorLayer

```typescript
new RuvectorLayer(inputDim: number, hiddenDim: number, heads: number, dropout: number)

// Methods
layer.forward(nodeEmbedding: number[], neighborEmbeddings: number[][], edgeWeights: number[]): number[]
layer.toJson(): string
RuvectorLayer.fromJson(json: string): RuvectorLayer
```

### TensorCompress - 5 Compression Levels

| Level | Access Frequency | Use Case |
|-------|-----------------|----------|
| `none` | > 0.8 | Hot data, no compression |
| `half` | > 0.4 | Warm data, float16 |
| `pq8` | > 0.1 | Cool data, product quantization 8-bit |
| `pq4` | > 0.01 | Cold data, product quantization 4-bit |
| `binary` | <= 0.01 | Archive, 1-bit |

```typescript
const compressor = new TensorCompress();
const compressed = compressor.compress(embedding, accessFreq);     // Adaptive
const compressed2 = compressor.compressWithLevel(embedding, {      // Explicit
  level_type: 'pq8', subvectors: 8, centroids: 16
});
const original = compressor.decompress(compressed);
```

### differentiableSearch

```typescript
differentiableSearch(
  query: number[],
  candidateEmbeddings: number[][],
  k: number,
  temperature: number
): { indices: number[], weights: number[] }
```

Returns soft attention weights over candidates, enabling differentiable nearest-neighbor search.

### Integration with ruvector CLI

- Detected by `ruvector doctor` as `@ruvector/gnn installed`
- Used by `ruvector embed neural` for GNN-based embedding generation
- TensorCompress is used by the memory system for tiered storage compression
- `hierarchicalForward` powers hierarchical HNSW search through GNN layers

---

## 3. @ruvector/graph-node (Hypergraph DB)

**Version:** 0.1.26
**Description:** Native Node.js bindings for RuVector Graph Database with hypergraph support, Cypher queries, and persistence. 10x faster than WASM.
**Dependencies:** None
**Main Entry:** `index.js`

### Exports (8)

| Export | Type | Purpose |
|--------|------|---------|
| `GraphDatabase` | Class | Main database class |
| `QueryResultStream` | Class | Streaming query results |
| `HyperedgeStream` | Class | Streaming hyperedge results |
| `NodeStream` | Class | Streaming node results |
| `JsDistanceMetric` | Enum | Euclidean, Cosine, DotProduct, Manhattan |
| `JsTemporalGranularity` | Enum | Hourly, Daily, Monthly, Yearly |
| `version()` | Function | Version string |
| `hello()` | Function | Health check |

### GraphDatabase Constructor

```typescript
new GraphDatabase({
  distanceMetric: 'Cosine' | 'Euclidean' | 'DotProduct' | 'Manhattan',
  dimensions: number,
  storagePath?: string,   // Omit for in-memory
})

// Static
GraphDatabase.open(path: string): GraphDatabase  // Open existing persistent DB
```

### GraphDatabase Instance Methods (15)

| Method | Purpose |
|--------|---------|
| `createNode(opts)` | Create a node with id, embedding, labels, properties |
| `createEdge(opts)` | Create directed edge with from, to, description, embedding, confidence |
| `createHyperedge(opts)` | Create multi-node relationship |
| `query(cypher)` | Async Cypher query, returns JSON |
| `querySync(cypher)` | Synchronous Cypher query |
| `searchHyperedges(opts)` | Vector similarity search on hyperedges |
| `kHopNeighbors(nodeId, k)` | k-hop graph traversal |
| `batchInsert(nodes)` | Bulk insert (131K+ ops/sec) |
| `begin()` | Begin ACID transaction |
| `commit()` | Commit transaction |
| `rollback()` | Rollback transaction |
| `stats()` | Get totalNodes, totalEdges counts |
| `subscribe(callback)` | Event subscription |
| `isPersistent()` | Check if DB has persistence |
| `getStoragePath()` | Get storage path |

### Performance

| Operation | Throughput |
|-----------|------------|
| Node Creation | 9.17K ops/sec |
| Batch Node Creation | 131.10K ops/sec |
| Edge Creation | 9.30K ops/sec |
| Vector Search (k=10) | 2.35K ops/sec |
| k-hop Traversal | 10.28K ops/sec |

### Cypher Support

```sql
MATCH (n:Person) RETURN n
MATCH (n)-[:KNOWS]->(m) WHERE n.name = 'Alice' RETURN m
CREATE (n:Agent {id: 'agent-1', type: 'researcher'})
```

### Integration with ruvector CLI

- Detected by `ruvector doctor` as `@ruvector/graph-node installed`
- Used by the knowledge graph features in `ruvector hooks intelligence`
- Backs the graph-based coordination in swarm mode

---

## 4. @ruvector/agentic-synth (Synthetic Data Generator)

**Version:** 0.1.6
**Description:** High-performance synthetic data generator for AI/ML training, RAG systems, and agentic workflows.
**Dependencies:** `@google/generative-ai`, `commander`, `dotenv`, `dspy.ts`, `zod`
**Main Entry:** `./dist/index.cjs`

### Package Exports

```typescript
// Main
import { AgenticSynth } from '@ruvector/agentic-synth';
// Generators
import { ... } from '@ruvector/agentic-synth/generators';
// Cache
import { ... } from '@ruvector/agentic-synth/cache';
```

### AgenticSynth Constructor

```typescript
new AgenticSynth({
  provider: 'gemini' | 'openrouter',
  apiKey: string,
  model: string,              // e.g. 'gemini-2.0-flash-exp'
  cache: { enabled: boolean, maxSize: number },
})
```

### Key Methods

| Method | Purpose |
|--------|---------|
| `generateTimeSeries(opts)` | Time-series data (IoT, financial) |
| `generateEvents(opts)` | Event logs (login, purchase, error) |
| `generateStructured(opts)` | JSON/CSV structured data |
| `generateEmbeddings(opts)` | Vector data for RAG |

### CLI Usage

```bash
npx @ruvector/agentic-synth generate --count 100
npx @ruvector/agentic-synth interactive
```

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `GEMINI_API_KEY` | Google Gemini API key |
| `OPENROUTER_API_KEY` | OpenRouter API key |

### Integration

- Listed in `ruvector install --list` as `agentic-synth: available`
- Standalone package; does not register hooks with ruvector CLI
- Can output directly to ruvector-compatible vector formats

---

## 5. ruvector-extensions (Persistence, Temporal Tracking)

**Version:** 0.1.0
**Description:** Advanced features: embeddings, UI, exports, temporal tracking, and persistence.
**Dependencies:** `ruvector` (^0.1.20), `@anthropic-ai/sdk`, `express`, `ws`
**Main Entry:** `dist/index.js`

### Key Class: DatabasePersistence

```typescript
new DatabasePersistence(db: VectorDB, {
  baseDir: string,
  format: 'json' | 'binary' | 'sqlite',
  compression: 'none' | 'gzip' | 'brotli',
  incremental: boolean,
  autoSaveInterval: number,   // ms, 0 = disabled
  maxSnapshots: number,
  batchSize: number,
})
```

### Methods

| Method | Purpose |
|--------|---------|
| `save(opts)` | Full database save with progress callback |
| `saveIncremental(opts)` | Save only changed data |
| `load(opts)` | Load from disk with checksum verification |
| `createSnapshot(name, meta)` | Named snapshot |
| `listSnapshots()` | List all snapshots |
| `restoreSnapshot(id, opts)` | Restore from snapshot |
| `deleteSnapshot(id)` | Remove snapshot |
| `export(opts)` | Export to file |
| `import(opts)` | Import from file |
| `startAutoSave()` | Start periodic auto-save |

### Integration

- Listed in `ruvector install --list` as `extensions: available`
- Depends on legacy `ruvector` package (not `@ruvector/core`)
- Adds persistence to in-memory vector databases
- Includes express + WebSocket server for UI dashboard

---

## 6. @ruvector/sona -- EXTENDED ANALYSIS

**Version:** 0.1.5
**Description:** Self-Optimizing Neural Architecture (SONA) - Runtime-adaptive learning with LoRA, EWC++, and ReasoningBank.
**Dependencies:** None (native binary)
**Main Entry:** `index.js`

### Single Export: SonaEngine

```typescript
// Construction
new SonaEngine(hiddenDim: number)
SonaEngine.withConfig(config: SonaConfig): SonaEngine
```

### SonaConfig (Full Options)

```typescript
interface SonaConfig {
  hiddenDim: number;              // Required: e.g., 256, 512, 4096
  embeddingDim?: number;          // Default: hiddenDim
  microLoraRank?: number;         // Default: 1 (range 1-2, ultra-fast)
  baseLoraRank?: number;          // Default: 8 (deeper background learning)
  microLoraLr?: number;           // Default: 0.001
  baseLoraLr?: number;            // Default: 0.0001
  ewcLambda?: number;             // Default: 1000.0 (EWC++ strength)
  patternClusters?: number;       // Default: 50
  trajectoryCapacity?: number;    // Default: 10000
  backgroundIntervalMs?: number;  // Default: 3600000 (1 hour)
  qualityThreshold?: number;      // Default: 0.5
  enableSimd?: boolean;           // Default: true
}
```

### SonaEngine Instance Methods (14)

| Method | Signature | Purpose |
|--------|-----------|---------|
| `beginTrajectory` | `(queryEmbedding: Float64Array \| number[]) => TrajectoryBuilder` | Start recording inference trajectory |
| `endTrajectory` | `(builder: TrajectoryBuilder, quality: number) => void` | Complete trajectory, submit for learning |
| `addTrajectoryStep` | `(builder, activations, attentionWeights, reward) => void` | Alternative to builder.addStep |
| `setTrajectoryRoute` | `(builder, route: string) => void` | Set route identifier on trajectory |
| `addTrajectoryContext` | `(builder, contextId: string) => void` | Add context to trajectory |
| `applyMicroLora` | `(input: Float64Array \| number[]) => Float64Array` | Apply instant-loop LoRA (<1ms) |
| `applyBaseLora` | `(layerIdx: number, input: Float64Array \| number[]) => Float64Array` | Apply deeper background LoRA |
| `tick` | `() => string \| null` | Run background learning if due |
| `forceLearn` | `() => string` | Force immediate background cycle |
| `flush` | `() => void` | Flush instant loop updates |
| `findPatterns` | `(queryEmbedding, k: number) => LearnedPattern[]` | Find similar learned patterns |
| `getStats` | `() => string` | JSON stats (trajectories, patterns, updates) |
| `setEnabled` | `(enabled: boolean) => void` | Enable/disable learning |
| `isEnabled` | `() => boolean` | Check if learning is active |

### SONA Architecture: Dual Learning Loops

```
                 INSTANT LOOP (<1ms)              BACKGROUND LOOP (periodic)
                 ==================              =========================
Input          -> Micro-LoRA (rank 1-2)          Trajectory Buffer
               -> Gradient accumulation          -> k-means clustering
               -> Per-trajectory update          -> Pattern extraction
               -> Sub-millisecond overhead       -> Base LoRA update (rank 8+)
                                                 -> EWC++ consolidation
                                                 -> Low-quality pruning
```

### Micro-LoRA (Instant Adaptation)

- **Rank 1-2**: Extremely small, adds negligible overhead
- **Applied during inference**: Every forward pass gets adapted output
- **Learning rate**: Default 0.001, configurable via `microLoraLr`
- **Use case**: Instant per-query adaptation

```typescript
const enhanced = engine.applyMicroLora(layerActivations);
// Returns Float64Array with LoRA-adapted values, <1ms
```

### Base LoRA (Background Learning)

- **Rank 8+**: Deeper adaptation capacity
- **Applied periodically**: Via `tick()` or `forceLearn()`
- **Learning rate**: Default 0.0001 (slower, more stable)
- **Use case**: Accumulated pattern learning

```typescript
const deepEnhanced = engine.applyBaseLora(layerIndex, input);
```

### EWC++ (Elastic Weight Consolidation)

**When it activates:** During background learning cycles (`tick()` / `forceLearn()`).

- **Lambda**: Default 1000.0, controls consolidation strength
- **Purpose**: Prevents catastrophic forgetting when learning new patterns
- **Mechanism**: Maintains Fisher Information Matrix approximation; penalizes changes to important weights
- **Triggered by**: `ruvector embed adaptive --consolidate` at the CLI level

```typescript
// Higher lambda = stronger memory protection
SonaEngine.withConfig({ ewcLambda: 5000.0 }) // Very conservative
SonaEngine.withConfig({ ewcLambda: 100.0 })  // More plastic
```

### ReasoningBank (Pattern Storage and Recall)

The ReasoningBank stores learned inference patterns via trajectory clustering.

**How to store reasoning patterns:**
```typescript
// 1. Begin trajectory
const builder = engine.beginTrajectory(queryEmbedding);
builder.setRoute('code-generation');
builder.addContext('typescript');

// 2. Record steps during inference
builder.addStep(layerActivations, attentionWeights, rewardSignal);
builder.addStep(layer2Activations, layer2Attention, reward2);

// 3. End trajectory with quality score
engine.endTrajectory(builder, 0.92); // Quality 0-1
```

**How to recall reasoning patterns:**
```typescript
const patterns = engine.findPatterns(queryEmbedding, 5);
// Returns: LearnedPattern[] with:
//   id, centroid, clusterSize, totalWeight, avgQuality,
//   createdAt, lastAccessed, accessCount, patternType
```

### PatternType Classification

```typescript
enum PatternType {
  General        // Default
  Reasoning      // Chain-of-thought patterns
  Factual        // Knowledge retrieval patterns
  Creative       // Creative generation patterns
  CodeGen        // Code generation patterns
  Conversational // Dialog patterns
}
```

### Dream Cycles (Background Learning Variants)

SONA's "dream cycles" are the background learning phases triggered by `tick()` or `forceLearn()`. Based on the architecture documentation and code, the background loop performs these 6 operations:

1. **Trajectory Clustering**: k-means clustering of buffered trajectories into pattern groups
2. **Pattern Extraction**: Extracting centroid embeddings, quality scores, and metadata from clusters
3. **Base LoRA Update**: Training the rank-8+ LoRA weights on extracted patterns
4. **EWC++ Consolidation**: Computing Fisher Information and applying weight consolidation
5. **Pattern Pruning**: Removing low-quality patterns below `qualityThreshold`
6. **Statistics Update**: Updating counters for trajectories processed, patterns learned, cycles completed

**How to trigger:**
```typescript
// Automatic: runs every backgroundIntervalMs (default 1 hour)
const status = engine.tick(); // Returns string if cycle ran, null otherwise

// Manual: force immediate cycle
const result = engine.forceLearn(); // Always runs, returns status string

// CLI: Run consolidation
// npx ruvector embed adaptive --consolidate
```

### Integration with ruvector CLI

- NOT directly detected by `ruvector doctor` (not in installer)
- Used internally by `ruvector embed adaptive` commands:
  - `--stats`: Shows SonaEngine statistics
  - `--consolidate`: Triggers EWC++ consolidation
  - `--reset`: Resets adaptive weights
  - `--export <file>`: Exports learned weights
  - `--import <file>`: Imports learned weights
- Used by `@ruvector/ruvllm` for self-learning LLM routing
- Used by `@ruvector/edge-full` as WASM module (238KB) for browser-side learning

### Performance Characteristics

| Operation | Latency |
|-----------|---------|
| Micro-LoRA application | <1ms per forward pass |
| Trajectory recording | ~10us per step |
| Background learning | 100-500ms for 1000 trajectories |
| Pattern search | O(k * n) |
| Memory usage | ~50MB base + ~1KB/trajectory + ~10KB/pattern |

---

## 7. @ruvector/tiny-dancer -- EXTENDED ANALYSIS

**Version:** 0.1.15
**Description:** Neural router for AI agent orchestration - FastGRNN-based intelligent routing with circuit breaker, uncertainty estimation, and hot-reload.
**Dependencies:** None (native binary)
**Main Entry:** `index.js`

### Exports (3)

| Export | Type | Purpose |
|--------|------|---------|
| `Router` | Class | Main routing engine |
| `hello()` | Function | Health check |
| `version()` | Function | Version string |

### Router Constructor

```typescript
new Router({
  modelPath: string,              // Required: path to FastGRNN .safetensors model
  confidenceThreshold?: number,   // Default: 0.85
  maxUncertainty?: number,        // Default: 0.15
  enableCircuitBreaker?: boolean, // Default: true
  circuitBreakerThreshold?: number, // Default: 5 failures before open
  enableQuantization?: boolean,   // Default: true
  databasePath?: string,          // Optional persistence path
})
```

### Router Instance Methods (3)

| Method | Signature | Purpose |
|--------|-----------|---------|
| `route` | `(request: RoutingRequest) => Promise<RoutingResponse>` | Route query to best candidate |
| `reloadModel` | `() => Promise<void>` | Hot-reload model from disk |
| `circuitBreakerStatus` | `() => boolean \| null` | Check circuit health |

### FastGRNN Architecture

FastGRNN (Fast Gated Recurrent Neural Network) is a lightweight RNN variant designed for:
- **Ultra-low latency**: <100us per routing decision
- **Small memory footprint**: ~10MB base + model size
- **Quantization-friendly**: Works well with 4-bit and 8-bit quantization
- **SIMD optimized**: Uses AVX2/NEON instructions for vector operations

The architecture:
```
Input Features [query_embedding, candidate_embeddings, metadata]
      |
  FastGRNN Cell (gated recurrent processing)
      |
  Uncertainty Estimation (epistemic uncertainty via dropout)
      |
  Routing Decision [candidateId, confidence, uncertainty, useLightweight]
```

### Circuit Breaker Behavior

The circuit breaker is a fault-tolerance mechanism:

| State | Behavior |
|-------|----------|
| **Closed** (healthy) | Normal routing; failures counted |
| **Open** (unhealthy) | After N consecutive failures (default 5), routing short-circuits |
| **Half-Open** | Periodically tests if routing has recovered |

```typescript
const isHealthy = router.circuitBreakerStatus();
// true = closed (healthy)
// false = open (unhealthy)
// null = circuit breaker disabled
```

**When it opens:** After `circuitBreakerThreshold` consecutive routing failures.
**When it recovers:** Automatic half-open testing after a cooldown period.

### Hot-Reload

```typescript
// Update model file on disk, then:
await router.reloadModel();
// No application restart needed; new model loaded atomically
```

### RoutingRequest / RoutingResponse

```typescript
interface RoutingRequest {
  queryEmbedding: Float32Array;
  candidates: Candidate[];
  metadata?: string;  // JSON
}

interface Candidate {
  id: string;
  embedding: Float32Array;
  metadata?: string;
  createdAt?: number;
  accessCount?: number;
  successRate?: number;  // Historical success 0-1
}

interface RoutingResponse {
  decisions: RoutingDecision[];   // Ranked
  inferenceTimeUs: number;        // Microseconds
  candidatesProcessed: number;
  featureTimeUs: number;
}

interface RoutingDecision {
  candidateId: string;
  confidence: number;       // 0-1
  useLightweight: boolean;  // Suggests using faster/cheaper model
  uncertainty: number;      // 0-1 (lower = more certain)
}
```

### Why NO WASM Fallback

TinyDancer is native-only (no WASM build) because:
1. **Latency requirement**: <100us inference requires native code; WASM adds overhead
2. **SIMD**: Native builds use platform-specific SIMD (AVX2/NEON) not available in WASM
3. **Model loading**: SafeTensors file I/O is filesystem-dependent
4. **Memory management**: Fine-grained control needed for quantized weights

For browser use cases, `@ruvector/edge` includes its own spiking neural network routing that runs in WASM, and `@ruvector/edge-full` includes SONA WASM for self-learning routing.

### Integration with ruvector CLI

- NOT detected by `ruvector doctor` (not in installer)
- The `ruvector hooks route` command uses a simpler routing mechanism (keyword + confidence matching) that does NOT directly call TinyDancer
- `@ruvector/ruvllm` uses TinyDancer for its FastGRNN-based 3-tier routing
- The `useLightweight` field in routing decisions maps to the 3-tier model system (Tier 1 = booster, Tier 2 = Haiku, Tier 3 = Opus)

### Performance

| Metric | Value |
|--------|-------|
| Inference | <100us per decision |
| Throughput | 10,000+ routes/sec |
| Memory | ~10MB base + model |

---

## 8. @ruvector/attention -- EXTENDED ANALYSIS

**Version:** 0.1.4
**Description:** High-performance attention mechanisms for Node.js, powered by Rust.
**Dependencies:** None (native binary)
**Main Entry:** `index.js`

### All 10 Attention Mechanism Types

| # | Class | Constructor Args | Methods | Description |
|---|-------|-----------------|---------|-------------|
| 1 | `DotProductAttention` | `(dim, scale?)` | compute, computeRaw | Classic scaled dot-product |
| 2 | `MultiHeadAttention` | `(dim, numHeads)` | compute, computeRaw | Parallel attention heads |
| 3 | `FlashAttention` | `(dim, blockSize)` | compute, computeRaw | Memory-efficient block-wise |
| 4 | `HyperbolicAttention` | `(dim, curvature)` | compute, computeRaw | Poincare ball model for hierarchy |
| 5 | `LinearAttention` | `(dim, numFeatures)` | dim, features, compute, computeRaw | O(N) Performer-style kernel approx |
| 6 | `MoEAttention` | `({dim, numExperts, topK, expertCapacity?})` | dim, numExperts, topK, compute, computeRaw | Dynamic expert routing |
| 7 | `GraphRoPeAttention` | `({dim, numHeads, maxLen})` | compute | Rotary position encoding for graphs |
| 8 | `EdgeFeaturedAttention` | `(nodeDim, edgeDim)` | nodeDim, edgeDim, numHeads, compute, computeRaw | Edge features in graph attention |
| 9 | `DualSpaceAttention` | `({dim, numHeads, curvature})` | compute | Euclidean + Hyperbolic dual space |
| 10 | `LocalGlobalAttention` | `({dim, windowSize, numHeads?})` | compute | Sliding window + global tokens |

### Attention Feature Categories (from `info()`)

```
scaled-dot-product, multi-head, hyperbolic, flash, linear,
local-global, moe, edge-featured, graph-rope, dual-space,
training, async, batch, benchmark
```

### Common compute() Signature

```typescript
// All attention types share this interface:
attention.compute(
  query: Float32Array,
  keys: Float32Array[],
  values: Float32Array[]
): Float32Array

// Raw variant returns attention weights too:
attention.computeRaw(
  query: Float32Array,
  keys: Float32Array[],
  values: Float32Array[]
): { output: Float32Array, weights: Float32Array }
```

### Training Infrastructure (10 exports)

| Export | Type | Purpose |
|--------|------|---------|
| `AdamOptimizer` | Class | Adam optimizer with configurable betas |
| `AdamWOptimizer` | Class | AdamW with decoupled weight decay |
| `SgdOptimizer` | Class | Stochastic gradient descent |
| `InfoNceLoss` | Class | Contrastive loss (temperature param) |
| `LocalContrastiveLoss` | Class | Local neighborhood contrastive loss |
| `SpectralRegularization` | Class | Spectral norm regularization |
| `CurriculumScheduler` | Class | Curriculum learning scheduler |
| `TemperatureAnnealing` | Class | Temperature annealing for softmax |
| `LearningRateScheduler` | Class | Warmup + cosine decay |
| `HardNegativeMiner` | Class | Hard negative mining for contrastive learning |
| `InBatchMiner` | Class | In-batch negative mining |

### Batch and Parallel Processing (5 exports)

| Export | Purpose |
|--------|---------|
| `StreamProcessor` | Stream-based attention processing |
| `parallelAttentionCompute(type, queries, keys, values, numWorkers)` | Multi-worker parallel |
| `batchAttentionCompute(opts)` | Batch processing |
| `computeAttentionAsync(type, q, k, v)` | Async single computation |
| `batchFlashAttentionCompute(opts)` | Batch flash attention |

### Hyperbolic Math Utilities (5 exports)

| Export | Purpose |
|--------|---------|
| `expMap(point, tangent, curvature)` | Exponential map to Poincare ball |
| `logMap(point, target, curvature)` | Logarithmic map from Poincare ball |
| `mobiusAddition(a, b, curvature)` | Mobius addition in hyperbolic space |
| `poincareDistance(a, b, curvature)` | Distance in Poincare ball |
| `projectToPoincareBall(point, curvature)` | Project to valid ball coordinates |

### Enums

| Enum | Values |
|------|--------|
| `AttentionType` | ScaledDotProduct, Flash, Linear, LocalGlobal, Hyperbolic |
| `DecayType` | Linear, Exponential, Cosine, Step |
| `MiningStrategy` | Random, HardNegative, SemiHard, DistanceWeighted |

### Integration with ruvector CLI

- Detected by `ruvector doctor` as `@ruvector/attention installed`
- Used by `ruvector embed neural` for attention-based embedding enhancement
- Used by `@ruvector/postgres-cli` which exposes 39 attention mechanisms as SQL functions
- MoE attention type is used in the CLAUDE.md's MoE routing concept

---

## 9. @ruvector/router (Semantic Router)

**Version:** 0.1.28
**Description:** Semantic router for AI agents - vector-based intent matching with HNSW indexing and SIMD acceleration.
**Dependencies:** None (native binary)
**Main Entry:** `index.js`

### Exports (3)

| Export | Type | Purpose |
|--------|------|---------|
| `SemanticRouter` | Class | Main routing class |
| `VectorDb` | Class | Internal vector database |
| `DistanceMetric` | Enum | Euclidean(0), Cosine(1), DotProduct(2), Manhattan(3) |

### SemanticRouter Constructor

```typescript
new SemanticRouter({
  dimension: number,          // Required: embedding dimension
  metric?: string,            // 'cosine' | 'euclidean' | 'dot' (default: cosine)
  m?: number,                 // HNSW M parameter (default: 16)
  efConstruction?: number,    // HNSW ef_construction (default: 200)
  quantization?: boolean,     // Memory-efficient quantization (default: false)
})
```

### SemanticRouter Instance Methods (11)

| Method | Purpose |
|--------|---------|
| `setEmbedder(fn)` | Set embedding function for text-to-vector |
| `addIntent(intent)` | Add intent with name, utterances, optional embedding |
| `addIntentAsync(intent)` | Async variant |
| `route(query, k?)` | Route query (string or Float32Array) to matching intents |
| `routeWithEmbedding(embedding, k?)` | Route with pre-computed embedding (sync) |
| `removeIntent(name)` | Remove an intent |
| `getIntents()` | List all intent names |
| `getIntent(name)` | Get specific intent details |
| `clear()` | Remove all intents |
| `count()` | Number of registered intents |
| `save(path)` / `load(path)` | Persist/restore router state |

### Usage Pattern

```typescript
import { SemanticRouter } from '@ruvector/router';

const router = new SemanticRouter({ dimension: 384 });
router.addIntent({
  name: 'code-review',
  utterances: ['review my code', 'check for bugs'],
  metadata: { agent: 'reviewer' }
});

const results = await router.route('please review this pull request');
// [{ intent: 'code-review', score: 0.92, metadata: {agent: 'reviewer'} }]
```

---

## 10. @ruvector/ruvllm (Self-Learning LLM Orchestration)

**Version:** 2.4.1
**Description:** Self-learning LLM orchestration with SONA adaptive learning, HNSW memory, RLM recursive retrieval, FastGRNN routing, and SIMD inference.
**Dependencies:** `chalk`, `commander`, `ora`
**Main Entry:** `dist/cjs/index.js`

### Package Exports

```typescript
// Main
import { RuvLLM, RlmController } from '@ruvector/ruvllm';
// SIMD
import { simd } from '@ruvector/ruvllm/simd';
```

### RuvLLM Constructor

```typescript
new RuvLLM({
  modelPath?: string,  // Path to GGUF model file
  model?: string,      // Model name e.g., 'ruv/ruvltra'
  sonaEnabled?: boolean, // Enable SONA self-learning
})
```

### Key Methods

| Method | Purpose |
|--------|---------|
| `query(text)` | LLM inference with response |
| `route(text)` | Route to optimal agent (returns agent, confidence, tier) |
| `routeComplex(text)` | Multi-agent team routing |

### RlmController (Recursive Language Model)

```typescript
new RlmController({
  maxDepth?: number,               // Default: 3
  maxSubQueries?: number,          // Default: 5
  tokenBudget?: number,            // Default: 4096
  enableCache?: boolean,           // Default: true
  cacheTtl?: number,               // Default: 300000
  retrievalTopK?: number,          // Default: 10
  minQualityScore?: number,        // Default: 0.7
  enableReflection?: boolean,      // Default: false
  maxReflectionIterations?: number,// Default: 2
})
```

### Key RLM Methods

| Method | Purpose |
|--------|---------|
| `addMemory(text)` | Add knowledge for retrieval |
| `query(text)` | Recursive decomposition + synthesis |
| `queryStream(text)` | Streaming variant |

### SIMD Module

```typescript
import { simd } from '@ruvector/ruvllm/simd';
simd.batchCosineSimilarity(query, targets);
simd.flashAttention(q, k, v, scale);
```

### Performance

| Operation | Latency |
|-----------|---------|
| Query decomposition | 340 ns |
| Cache lookup | 23.5 ns |
| Embedding (384d) | 293 ns |
| End-to-end routing | <1 ms |
| Full RLM query | 50-200 ms |

### Integration

- Internally uses `@ruvector/sona` for self-learning
- Internally uses TinyDancer's FastGRNN for routing
- Uses HNSW from `@ruvector/core` for memory search
- Models hosted on HuggingFace: `ruv/ruvltra`
- Routes to 60+ agent types with 100% hybrid routing accuracy

---

## 11. @ruvector/rvlite (Edge Vector DB with WASM)

**Version:** 0.2.4
**Description:** Standalone vector database with SQL, SPARQL, and Cypher - powered by RuVector WASM.
**Dependencies:** None
**Main Entry:** `./wasm/rvlite.js`
**Bundle Size:** ~850KB WASM

### Three Query Languages

| Language | Use Case |
|----------|----------|
| SQL | Vector similarity search, metadata filtering |
| SPARQL | RDF triple queries, semantic relationships |
| Cypher | Graph traversal, property graphs |

### CLI

```bash
npx @ruvector/rvlite@latest serve          # Start dashboard on localhost:3000
npx @ruvector/rvlite@latest serve --port 8080
npx @ruvector/rvlite@latest repl            # Interactive REPL
```

### Features

- 100% client-side, no server required
- Built-in GNN training and embedding generation
- IndexedDB persistence for browser storage
- Interactive dashboard with supply chain simulation
- Export/import JSON

---

## 12. @ruvector/edge (Browser AI Swarms)

**Version:** 0.1.9
**Description:** Free edge-based AI swarms in the browser - P2P, crypto, vector search, neural networks.
**Dependencies:** None
**Bundle Size:** 364KB WASM

### Package Exports

```typescript
import init, { ... } from '@ruvector/edge';
import { WorkerPool } from '@ruvector/edge/worker-pool';
import '@ruvector/edge/worker';
```

### Key WASM Classes

| Class | Purpose |
|-------|---------|
| `WasmIdentity` | Ed25519 cryptographic identity (50K ops/sec) |
| `WasmCrypto` | AES-256-GCM encryption (1 GB/sec) |
| `WasmHnswIndex` | HNSW vector search (150x faster than brute force) |
| `WasmRaftNode` | Raft consensus for trusted cohorts |
| `WasmGossipNode` | Gossip + CRDT for open swarms |
| `WasmHybridKeyPair` | Post-quantum signatures |
| `WasmSpikingNetwork` | Bio-inspired spiking neural networks with STDP |

### Two Consensus Modes

| Mode | Protocol | Use Case |
|------|----------|----------|
| Trusted Cohort | Raft | Private teams, enterprise, 3-7 nodes |
| Open Swarm | Gossip + CRDT | Public browsers, high churn, Byzantine-tolerant |

### WorkerPool

```typescript
const pool = new WorkerPool(workerUrl, wasmUrl, {
  poolSize: navigator.hardwareConcurrency,
  dimensions: 384,
  useHnsw: true,
});
await pool.init();
await pool.insert(embedding, 'doc-1', metadata);
const results = await pool.search(queryEmbedding, 10);
pool.terminate();
```

---

## 13. @ruvector/edge-full (Complete Browser WASM)

**Version:** 0.1.0
**Description:** Complete WASM toolkit for edge AI: vector search, graph DB, neural networks, DAG workflows, SQL/SPARQL/Cypher, and ONNX inference.
**Dependencies:** None
**Total Size:** 1.28MB core + 7.1MB ONNX = 8.4MB complete

### Module Exports

```typescript
import { initAll } from '@ruvector/edge-full';
// Or selective:
import init from '@ruvector/edge-full/edge';
import graphInit from '@ruvector/edge-full/graph';
import rvliteInit from '@ruvector/edge-full/rvlite';
import sonaInit from '@ruvector/edge-full/sona';
import dagInit from '@ruvector/edge-full/dag';
import onnxInit from '@ruvector/edge-full/onnx';
```

### 6 Bundled Modules

| Module | Size | Content |
|--------|------|---------|
| Edge Core | 364KB | Identity, Crypto, HNSW, Raft, Spiking NN |
| Graph DB | 288KB | Cypher queries, relationship modeling |
| RVLite | 260KB | SQL + SPARQL + Cypher vector DB |
| SONA | 238KB | LoRA, EWC++, ReasoningBank |
| DAG | 132KB | Workflow orchestration, topological execution |
| ONNX | 7.1MB | 6 HuggingFace models, parallel workers |

### initAll()

```typescript
const { edge, graph, rvlite, sona, dag } = await initAll();
// ONNX loaded separately due to size:
import onnxInit from '@ruvector/edge-full/onnx';
await onnxInit();
```

---

## 14. @ruvector/postgres-cli (PostgreSQL Vector Extension)

**Version:** 0.2.6
**Description:** Advanced AI vector database CLI for PostgreSQL - pgvector drop-in replacement with 53+ SQL functions, 39 attention mechanisms, GNN layers, hyperbolic embeddings, and self-learning.
**Dependencies:** `commander`, `chalk`, `pg`, `inquirer`, `ora`, `cli-table3`

### CLI Commands

| Command | Purpose |
|---------|---------|
| `install` | Install PostgreSQL + RuVector extension |
| `status` | Check installation status |
| `start` / `stop` | Server management |
| `logs` | View PostgreSQL logs |
| `psql` | Connect with psql |
| `info` | Installation information |
| `uninstall` | Remove installation |
| `vector create <name> --dim N` | Create vector table |
| `vector insert <table> --file <json>` | Insert vectors |
| `vector search <table> --query [...] --top-k N` | Similarity search |

### Install Options

```bash
npx @ruvector/postgres-cli install [options]
  -m, --method <type>      # docker | native | auto
  -p, --port <number>      # Default: 5432
  -u, --user <name>        # Default: ruvector
  --password <pass>         # Default: ruvector
  -d, --database <name>    # Default: ruvector
  --pg-version <version>   # 14, 15, 16, 17
  --skip-postgres           # Use existing PostgreSQL
  --skip-rust               # Use existing Rust
```

### 53+ SQL Functions

Categories: vector operations, distance metrics, attention mechanisms (39 types), GNN layers, hyperbolic embeddings, sparse vectors, BM25, self-learning via ReasoningBank.

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `PGHOST` | PostgreSQL host |
| `PGPORT` | PostgreSQL port |
| `PGUSER` | Database user |
| `PGPASSWORD` | Database password |
| `PGDATABASE` | Database name |

---

## 15. @ruvector/wasm (WASM Bindings for Core)

**Version:** 0.1.22
**Description:** WebAssembly bindings for RuVector vector database.
**Dependencies:** `@ruvector/core` (^0.1.0)
**Main Entry:** `dist/index.js`

This is a thin WASM wrapper around `@ruvector/core`, providing the same VectorDb API for environments where native NAPI-RS bindings are not available (e.g., edge runtimes, sandboxed environments). No README available on npm.

---

## 16. @ruvector/router-wasm (WASM Semantic Router)

**Version:** 0.1.0
**Description:** WebAssembly bindings for ruvector-router - Semantic router with HNSW vector search for browsers.
**Dependencies:** None
**Main Entry:** `pkg/ruvector_router_wasm.js`
**Bundle Size:** <100KB gzipped

### Key Features

- Client-side vector search (sub-millisecond)
- No network roundtrips, privacy-first
- IndexedDB integration for persistence
- SIMD acceleration where available
- Web Worker ready

### API (WASM)

```typescript
import init, { VectorDB, DistanceMetric } from '@ruvector/router-wasm';
await init();
const db = new VectorDB(128);
db.insert('doc1', embedding);
const results = db.search(query, 5);
```

---

## 17. ruvector-onnx-embeddings-wasm (Portable WASM Embeddings)

**Version:** 0.1.2
**Description:** Portable WASM embedding generation with SIMD and parallel workers - runs in browsers, Cloudflare Workers, Deno, and Node.js.
**Dependencies:** None

### Package Exports

```typescript
import init, { WasmEmbedder, WasmEmbedderConfig } from 'ruvector-onnx-embeddings-wasm';
import { createEmbedder, similarity, embed, ModelLoader } from 'ruvector-onnx-embeddings-wasm/loader';
import { ParallelEmbedder } from 'ruvector-onnx-embeddings-wasm/parallel';
```

### WasmEmbedder API

```typescript
class WasmEmbedder {
  constructor(modelBytes: Uint8Array, tokenizerJson: string);
  static withConfig(modelBytes, tokenizerJson, config: WasmEmbedderConfig): WasmEmbedder;

  embedOne(text: string): Float32Array;
  embedBatch(texts: string[]): Float32Array;
  similarity(text1: string, text2: string): number;
  dimension(): number;
  maxLength(): number;
}
```

### Available Models (6)

| Model | Dimension | Size | Best For |
|-------|-----------|------|----------|
| all-MiniLM-L6-v2 | 384 | 23MB | Default, fast |
| all-MiniLM-L12-v2 | 384 | 33MB | Better quality |
| bge-small-en-v1.5 | 384 | 33MB | State-of-the-art |
| bge-base-en-v1.5 | 768 | 110MB | Best quality |
| e5-small-v2 | 384 | 33MB | Search/retrieval |
| gte-small | 384 | 33MB | Multilingual |

### Convenience Functions

```typescript
const score = await similarity("I love dogs", "I adore puppies"); // ~0.85
const embedding = await embed("Hello world"); // Float32Array(384)
```

---

## 18. ruvector-attention-wasm (WASM Attention Mechanisms)

**Version:** 0.1.32
**Description:** High-performance WebAssembly attention mechanisms for transformers and LLMs.
**Dependencies:** None

### 8 Attention Types (WASM)

All 10 native types except GraphRoPe and EdgeFeatured, plus the unique CGT Sheaf Attention:

1. Scaled Dot-Product
2. Multi-Head
3. Hyperbolic (Poincare ball)
4. Linear (Performer-style)
5. Flash Attention (memory-efficient)
6. Local-Global (sliding window + global)
7. Mixture of Experts (MoE)
8. **CGT Sheaf Attention** (coherence-gated via Prime-Radiant) -- WASM-exclusive

### Training Utilities (WASM)

- InfoNCE contrastive loss
- Adam optimizer
- AdamW optimizer (decoupled weight decay)
- Learning rate scheduler (warmup + cosine decay)

### Usage

```typescript
import { initialize, MultiHeadAttention, utils } from 'ruvector-attention-wasm';
await initialize();
const attention = new MultiHeadAttention({ dim: 64, numHeads: 8 });
const output = attention.compute(query, keys, values);
const sim = utils.cosineSimilarity(a, b);
```

---

## Ecosystem Wiring Diagram

```
ruvector CLI (v0.1.96)
  |
  |-- embed text       -> uses @ruvector/core (HNSW storage)
  |-- embed adaptive   -> uses @ruvector/sona (Micro-LoRA, EWC++)
  |-- embed neural     -> uses @ruvector/gnn + @ruvector/attention
  |-- embed optimized  -> uses ruvector-onnx-embeddings (native/WASM)
  |-- hooks route      -> simple keyword matching (built-in)
  |-- doctor           -> detects: core, gnn, graph-node, attention
  |
@ruvector/ruvllm (v2.4.1) -- High-level orchestration
  |-- uses @ruvector/sona        (self-learning)
  |-- uses @ruvector/tiny-dancer (FastGRNN routing)
  |-- uses @ruvector/core        (HNSW memory)
  |-- uses @ruvector/attention   (attention computation)
  |
@ruvector/edge-full (v0.1.0) -- Browser bundle
  |-- bundles @ruvector/edge     (crypto, P2P, consensus)
  |-- bundles @ruvector/rvlite   (SQL/SPARQL/Cypher)
  |-- bundles @ruvector/sona     (WASM build, 238KB)
  |-- bundles DAG module         (workflow engine)
  |-- bundles ONNX module        (embedding generation)
  |-- bundles Graph module       (Cypher graph DB)
  |
@ruvector/postgres-cli (v0.2.6) -- PostgreSQL extension
  |-- wraps all 39 attention mechanisms as SQL functions
  |-- includes GNN layers, hyperbolic embeddings
  |-- includes ReasoningBank for self-learning
  |-- includes TinyDancer for agent routing
  |
ruvector-extensions (v0.1.0) -- Persistence layer
  |-- wraps legacy ruvector package
  |-- adds snapshots, auto-save, export/import
  |-- adds express UI server
  |
@ruvector/agentic-synth (v0.1.6) -- Data generation
  |-- standalone, outputs to ruvector-compatible formats
  |-- uses Gemini/OpenRouter for generation
  |-- DSPy.ts for self-learning optimization
```

---

## Key Integration Points for Claude Flow

### Which packages does `ruvector doctor` detect?

```
@ruvector/core       -- checked (native binding status)
@ruvector/gnn        -- checked (installed/not)
@ruvector/attention   -- checked (installed/not)
@ruvector/graph-node  -- checked (installed/not)
```

### Which packages does `ruvector embed` use?

| Subcommand | Package(s) Used |
|------------|-----------------|
| `embed text` | @ruvector/core |
| `embed adaptive` | @ruvector/sona (LoRA, EWC++) |
| `embed optimized` | ruvector-onnx-embeddings or WASM variant |
| `embed neural` | @ruvector/gnn + @ruvector/attention |
| `embed benchmark` | All of the above |

### Which packages register CLI hooks?

None of the packages register hooks autonomously. The ruvector CLI's hooks system is self-contained. Packages are loaded on-demand when their features are invoked.

### Environment Variables (All Packages)

| Variable | Used By | Purpose |
|----------|---------|---------|
| `GEMINI_API_KEY` | agentic-synth | Gemini API |
| `OPENROUTER_API_KEY` | agentic-synth | OpenRouter API |
| `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE` | postgres-cli | PostgreSQL connection |
| `ANTHROPIC_API_KEY` | ruvector-extensions | Anthropic SDK |
| No env vars | core, gnn, graph-node, sona, tiny-dancer, attention, router | All config via constructor |

---

## Platform Binary Matrix

Packages with native binaries ship platform-specific packages:

| Package | linux-x64 | linux-arm64 | darwin-x64 | darwin-arm64 | win32-x64 |
|---------|-----------|-------------|------------|--------------|-----------|
| core | @ruvector/node-linux-x64-gnu | arm64-gnu | darwin-x64 | darwin-arm64 | win32-x64-msvc |
| gnn | @ruvector/gnn-linux-x64-gnu | arm64-gnu | darwin-x64 | darwin-arm64 | win32-x64-msvc |
| graph-node | built-in | built-in | built-in | built-in | built-in |
| sona | built-in | built-in | built-in | built-in | built-in |
| tiny-dancer | linux-x64-gnu | arm64-gnu | darwin-x64 | darwin-arm64 | win32-x64-msvc |
| attention | built-in | built-in | built-in | built-in | built-in |
| router | built-in | built-in | built-in | built-in | built-in |
