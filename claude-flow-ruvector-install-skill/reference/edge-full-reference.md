# @ruvector/edge-full -- Complete WASM API Reference

> **Version:** v0.7 | **Generated:** 2026-01-31 | **Package:** @ruvector/edge-full 0.1.0

---

## Contents

- [Package Identity](#package-identity)
- [Export Map](#export-map)
- [initAll()](#initall)
- [initModules(names)](#initmodulesnames)
- [Quick Start: Browser Deployment](#quick-start-browser-deployment)
- [Tree-Shaking Patterns](#tree-shaking-patterns)
- [WASM Initialization](#wasm-initialization)
- [Module Quick Reference](#module-quick-reference)
- [Cross-Module Performance Summary](#cross-module-performance-summary)
- [Module 1: Edge Core](#module-1-edge-core)
  - [Module-Level Functions](#module-level-functions)
  - [Cryptography](#cryptography)
    - [WasmIdentity](#wasmidentity)
    - [WasmCrypto](#wasmcrypto)
    - [WasmHybridKeyPair](#wasmhybridkeypair)
  - [Vector Search](#vector-search)
    - [WasmHnswIndex](#wasmhnswindex)
    - [WasmQuantizer](#wasmquantizer)
    - [WasmSemanticMatcher](#wasmsemanticmatcher)
  - [Distributed Systems](#distributed-systems)
    - [WasmRaftNode](#wasmraftnode)
  - [Neural](#neural)
    - [WasmSpikingNetwork](#wasmspikingnetwork)
  - [Network](#network)
    - [WasmAdaptiveCompressor](#wasmadaptivecompressor)
  - [Availability Matrix](#availability-matrix)
  - [Performance Summary (Edge Core)](#performance-summary-edge-core)
- [Module 2: Graph DB](#module-2-graph-db)
  - [GraphDB](#graphdb)
  - [AsyncQueryExecutor](#asyncqueryexecutor)
  - [AsyncTransaction](#asynctransaction)
  - [BatchOperations](#batchoperations)
  - [JsNode, JsEdge, JsHyperedge](#jsnode-jsedge-jshyperedge)
  - [QueryResult / ResultStream](#queryresult--resultstream)
- [Module 3: RVLite](#module-3-rvlite)
  - [RvLite](#rvlite)
  - [Embedder](#embedder)
  - [BaseLoRA / MicroLoRA](#baselora--microlora)
  - [TrmEngine (Think-Reason-Match)](#trmengine-think-reason-match)
  - [Free Functions](#free-functions-14)
- [Module 4: DAG](#module-4-dag)
  - [WasmDag](#wasmdag)
  - [Attention mechanisms](#attention-mechanisms)
- [Module 5: SONA](#module-5-sona)
  - [WasmSonaEngine](#wasmsonaengine)
  - [WasmEphemeralAgent](#wasmephemeralagent)
  - [WasmFederatedCoordinator](#wasmfederatedcoordinator)
- [Module 6: ONNX](#module-6-onnx)
  - [Module-level exports](#module-level-exports)
  - [PoolingStrategy enum](#poolingstrategy-enum)
  - [WasmEmbedderConfig](#wasmembedderconfig)
  - [WasmEmbedder](#wasmembedder)
  - [Pre-trained HuggingFace Models](#pre-trained-huggingface-models)
  - [Parallel Worker Support](#parallel-worker-support)
- [Interactive Generator](#interactive-generator)
  - [6 Network Topologies](#6-network-topologies)
  - [4 P2P Transports](#4-p2p-transports)
  - [6 Use Cases](#6-use-cases)
  - [8 Core Features (toggleable)](#8-core-features-toggleable)
  - [7 Exotic Patterns](#7-exotic-patterns)
- [Free P2P Infrastructure](#free-p2p-infrastructure)
- [CLI Stack vs Edge Stack Decision Guide](#cli-stack-vs-edge-stack-decision-guide)
- [@ruvector/edge vs @ruvector/edge-full](#ruvectoredge-vs-ruvectoredge-full)
- [WorkerPool (from @ruvector/edge)](#workerpool-from-ruvectoredge)
  - [Constructor](#constructor)
  - [Methods](#methods)
  - [Load Balancing](#load-balancing)
  - [Timeouts](#timeouts)
  - [Worker Protocol](#worker-protocol)
  - [Usage Example](#usage-example)
- [Known Limitations](#known-limitations)
- [Error Handling](#error-handling)
  - [WASM-to-JavaScript Error Surface](#wasm-to-javascript-error-surface)
  - [Common Throw Scenarios](#common-throw-scenarios)
  - [WASM Out-of-Memory (OOM)](#wasm-out-of-memory-oom)
  - [Catching Errors](#catching-errors)
  - [Best Practice](#best-practice)
- [Memory Management](#memory-management)

---

## Package Identity

| Field | Value |
|-------|-------|
| Name | `@ruvector/edge-full` |
| Version | `0.1.0` |
| License | MIT |
| Module format | ESM only (`"type": "module"`) |
| `sideEffects` | `false` (safe for tree-shaking) |
| Dependencies | Zero |
| Core size | 1.28 MB (edge + graph + rvlite + sona + dag) |
| Full size | 8.4 MB (core + ONNX) |
| Language | Rust compiled to WebAssembly via `wasm-bindgen` |
| Repository | `https://github.com/ruvnet/ruvector` |

The package ships six WASM modules, each independently loadable. The ONNX module accounts for 7.1 MB of the total; every other module combined totals 1.28 MB. Because `sideEffects` is false and every module lives behind a separate export path, bundlers can eliminate unused modules at build time.

---

## Export Map

The `package.json` `exports` field defines seven entry points. Each resolves to a `.js` loader and a companion `.d.ts` type declaration.

| Export specifier | Resolves to | Purpose |
|------------------|-------------|---------|
| `.` | `./index.js` / `./index.d.ts` | Barrel: re-exports all namespaces, `initAll()`, `initModules()` |
| `./edge` | `./edge/ruvector_edge.js` | Crypto identity, HNSW, Raft, spiking NN, post-quantum |
| `./graph` | `./graph/ruvector_graph_wasm.js` | Neo4j-style graph DB with Cypher |
| `./rvlite` | `./rvlite/rvlite.js` | Vector database with LoRA and TRM reasoning |
| `./sona` | `./sona/ruvector_sona.js` | SONA self-optimizing neural architecture |
| `./dag` | `./dag/ruvector_dag_wasm.js` | DAG workflow orchestration |
| `./onnx` | `./onnx/ruvector_onnx_embeddings_wasm.js` | ONNX inference for HuggingFace embedding models |

All paths are ESM `import` only. No CommonJS `require` entry is provided.

---

## `initAll()`

```typescript
export function initAll(): Promise<{
  edge:   typeof import('./edge/ruvector_edge');
  graph:  typeof import('./graph/ruvector_graph_wasm');
  rvlite: typeof import('./rvlite/rvlite');
  sona:   typeof import('./sona/ruvector_sona');
  dag:    typeof import('./dag/ruvector_dag_wasm');
}>;
```

Dynamically imports the default init function from each of the five core modules, calls all five concurrently via `Promise.all`, and returns an object whose keys are the fully-initialized module namespaces. ONNX is excluded deliberately because of its 7.1 MB payload -- load it separately when needed.

```javascript
import { initAll } from '@ruvector/edge-full';
const { edge, graph, rvlite, sona, dag } = await initAll();
```

---

## `initModules(names)`

```typescript
export function initModules(
  moduleNames: Array<'edge' | 'graph' | 'rvlite' | 'sona' | 'dag' | 'onnx'>
): Promise<{
  edge?:   typeof import('./edge/ruvector_edge');
  graph?:  typeof import('./graph/ruvector_graph_wasm');
  rvlite?: typeof import('./rvlite/rvlite');
  sona?:   typeof import('./sona/ruvector_sona');
  dag?:    typeof import('./dag/ruvector_dag_wasm');
  onnx?:   typeof import('./onnx/ruvector_onnx_embeddings_wasm');
}>;
```

Accepts a string array naming which modules to initialize. Unlike `initAll()`, this function processes modules sequentially and can include `'onnx'`. Only requested modules appear on the returned object.

```javascript
import { initModules } from '@ruvector/edge-full';
const { edge, graph } = await initModules(['edge', 'graph']);
```

---

## Quick Start: Browser Deployment

Minimal steps to get edge-full running in a browser:

1. Install: `npm install @ruvector/edge-full`
2. Configure your bundler to serve `.wasm` files with `application/wasm` MIME type
3. Import and initialize:

```javascript
import { initModules } from '@ruvector/edge-full';
const { edge, graph } = await initModules(['edge', 'graph']);

// Create identity
const identity = new edge.WasmIdentity();
console.log('Agent ID:', identity.publicKeyHex());

// Create HNSW index
const hnsw = new edge.WasmHnswIndex();
hnsw.insert('doc-1', new Float32Array(384).fill(0.1));
const results = hnsw.search(new Float32Array(384).fill(0.1), 5);
console.log('Search results:', results);
```

**Bundler configs:**
- **Vite:** WASM files auto-served. No extra config needed.
- **Webpack 5:** Add `experiments: { asyncWebAssembly: true }` to config.
- **esbuild:** Use `--loader:.wasm=file` flag.

**Common pattern -- semantic search in browser (requires ONNX):**

```javascript
import { initModules } from '@ruvector/edge-full';
const { edge, onnx } = await initModules(['edge', 'onnx']);

// Load model (fetch separately, ~23 MB for MiniLM-L6-v2)
const modelBytes = new Uint8Array(
  await fetch('/models/minilm-l6.onnx').then(r => r.arrayBuffer())
);
const tokenizerJson = await fetch('/models/tokenizer.json').then(r => r.text());
const embedder = new onnx.WasmEmbedder(modelBytes, tokenizerJson);

// Build index
const hnsw = new edge.WasmHnswIndex();
hnsw.insert('doc-1', embedder.embedOne('First document text'));
hnsw.insert('doc-2', embedder.embedOne('Second document text'));

// Search
const queryVec = embedder.embedOne('search query');
const results = hnsw.search(queryVec, 5);
```

**Bundle size considerations:** The ONNX module adds 7.1 MB to your bundle plus
~23-110 MB model weights fetched at runtime. For minimum size without ML
inference, import only from `@ruvector/edge-full/edge` (364 KB). See
Tree-Shaking Patterns below for selective imports.

---

## Tree-Shaking Patterns

Because `sideEffects: false` is set and each module has its own export path, bundlers (Vite, webpack, Rollup, esbuild) can eliminate entire WASM modules that are never imported.

**Pattern A -- Single module direct import:**

```javascript
import init, { WasmIdentity, WasmHnswIndex } from '@ruvector/edge-full/edge';
await init();
```

Only the edge WASM binary (364 KB) is included in the bundle.

**Pattern B -- Two modules:**

```javascript
import edgeInit, { WasmIdentity } from '@ruvector/edge-full/edge';
import graphInit, { GraphDB } from '@ruvector/edge-full/graph';
await Promise.all([edgeInit(), graphInit()]);
```

Bundle includes edge (364 KB) + graph (288 KB) = 652 KB.

**Pattern C -- Barrel import (no tree-shaking benefit):**

```javascript
import { initAll } from '@ruvector/edge-full';
```

All five core modules included (1.28 MB). For minimum bundle size, import directly from sub-paths.

**Bundle size by combination:**

| Configuration | Size |
|---------------|------|
| Edge only | 364 KB |
| Edge + Graph | 652 KB |
| Edge + RVLite | 624 KB |
| Edge + SONA | 602 KB |
| All core (5 modules) | 1.28 MB |
| All core + ONNX | 8.4 MB |

---

## WASM Initialization

Every module exposes two initialization functions generated by `wasm-bindgen`:

### `default export` (async `init`)

```typescript
export default function __wbg_init(
  module_or_path?: InitInput | Promise<InitInput>
): Promise<InitOutput>;
```

Fetches the `.wasm` binary via `fetch()` when given a URL or `RequestInfo`. Instantiates via `WebAssembly.instantiateStreaming` where available. In Node.js, pass a `Buffer` or `ReadableStream`. Called with no arguments, it resolves `.wasm` relative to the JS loader.

### `initSync`

```typescript
export function initSync(
  module: SyncInitInput | { module: SyncInitInput }
): InitOutput;
```

Accepts a pre-compiled `WebAssembly.Module` or raw `BufferSource`. Blocks until instantiation completes. Not usable in browsers when the module exceeds 4 KB (Chrome's synchronous compilation limit).

**When to use which:**

| Environment | Recommended | Reason |
|-------------|-------------|--------|
| Browser (any) | `await init()` (default export) | Streaming compilation, non-blocking |
| Node.js with top-level await | `await init()` (default export) | Non-blocking, standard |
| Node.js in sync context | `initSync(wasmBuffer)` | No async available |
| Cloudflare Workers / Edge | `await init()` or `initSync(wasmModule)` | Depends on runtime |
| Service Worker | `await init()` | Async context required |

---

## Module Quick Reference

| Module | Size | Key Classes | Primary Use Case |
|--------|------|-------------|------------------|
| **edge** | 364 KB | 9 (`WasmIdentity`, `WasmCrypto`, `WasmHnswIndex`, `WasmRaftNode`, `WasmSemanticMatcher`, `WasmSpikingNetwork`, `WasmHybridKeyPair`, `WasmQuantizer`, `WasmAdaptiveCompressor`) | Cryptographic identity, vector search, consensus, neural networks |
| **graph** | 288 KB | 9 (`GraphDB`, `JsNode`, `JsEdge`, `JsHyperedge`, `QueryResult`, `AsyncQueryExecutor`, `AsyncTransaction`, `BatchOperations`, `ResultStream`) | Neo4j-style graph database with Cypher queries and hypergraph support |
| **rvlite** | 260 KB | 10 (`RvLite`, `RvLiteConfig`, `Embedder`, `EmbeddingConfig`, `BaseLoRA`, `MicroLoRA`, `LoraConfig`, `TrmEngine`, `TrmConfig`, `TrmResult`) | Vector DB, lightweight embeddings, LoRA adapters, TRM reasoning engine |
| **sona** | 238 KB | 3 (`WasmSonaEngine`, `WasmEphemeralAgent`, `WasmFederatedCoordinator`) | Self-optimizing neural routing, federated learning, trajectory recording |
| **dag** | 132 KB | 1 (`WasmDag`) | Workflow DAG with topological sort, critical path, attention mechanisms |
| **onnx** | 7.1 MB | 3 (`WasmEmbedder`, `WasmEmbedderConfig`, `PoolingStrategy`) | ONNX model inference for HuggingFace sentence embedding models |

Total exported classes across all six modules: 35.

---

## Cross-Module Performance Summary

Consolidated benchmarks across all six WASM modules, measured on a mid-range laptop (M2 MacBook Air, Chrome 124, WASM SIMD enabled).

| Module | Operation | Throughput / Latency | Notes |
|--------|-----------|---------------------|-------|
| **Edge** | Ed25519 sign/verify | ~50,000 ops/sec | Pure WASM, no Web Crypto API dependency |
| **Edge** | AES-256-GCM encrypt/decrypt | ~1 GB/sec | 256-bit key, streaming capable |
| **Edge** | HNSW search (vs brute force) | 150x faster | Default params M=16, ef_construction=200 |
| **Edge** | Binary quantization | 32x size reduction | Lossy (sign-bit only) |
| **Edge** | Scalar quantization | 4x size reduction | Reversible via `scalarDequantize()` |
| **Graph** | Cypher query (simple MATCH) | <1 ms | Single-label lookup, <10K nodes |
| **Graph** | Hyperedge creation | <1 ms | Including optional embedding attachment |
| **RVLite** | Vector search (k-NN) | Sub-millisecond | Hash-based embeddings, cosine metric |
| **RVLite** | TRM reasoning iteration | ~0.5 ms/iteration | Depends on `defaultK` config |
| **SONA** | Route decision (`applyLora`) | <5 ms | 256-dim hidden, micro-LoRA rank 1-2 |
| **SONA** | Trajectory end + learn | ~10 ms | Includes EWC++ consolidation pass |
| **ONNX** | Single embed (MiniLM-L6-v2) | ~20 ms | 384-dim output, SIMD128 enabled |
| **ONNX** | Batch embed (parallel workers) | 3.8x speedup | Application-level Worker partitioning |
| **DAG** | Topological sort (Kahn's) | Sub-millisecond | Up to ~10K nodes |
| **DAG** | Critical path analysis | Sub-millisecond | Single pass over topo order |

All timings are WASM-internal. JavaScript marshalling (wasm-bindgen serde) adds 0.01-0.1 ms per call depending on payload size.

---

# Module 1: Edge Core

`@ruvector/edge-full/edge` -- 364 KB WASM, 9 classes

The foundation layer for cryptographic identity, vector search, distributed consensus, neural computation, and network-aware compression. In a CLI/server workflow these concerns are handled natively; Edge Core exists for browser and edge deployments where no server runtime is available.

```js
import init, {
  WasmIdentity, WasmCrypto, WasmHybridKeyPair,
  WasmHnswIndex, WasmQuantizer, WasmSemanticMatcher,
  WasmRaftNode, WasmSpikingNetwork, WasmAdaptiveCompressor,
  version
} from '@ruvector/edge-full/edge';

await init();
console.log(version());
```

## Module-Level Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `default` (async) | `(module_or_path?: InitInput) => Promise<InitOutput>` | Load and instantiate the WASM module |
| `initSync` | `(module: SyncInitInput) => InitOutput` | Synchronous instantiation from pre-compiled module or buffer |
| `version` | `() => string` | Library version string |

---

## Cryptography

### WasmIdentity

Ed25519/X25519 identity manager. Generates signing (Ed25519) and key-exchange (X25519) key pairs from the same seed. All key material is held inside WASM linear memory; JavaScript only sees hex-encoded public keys and signatures.

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `constructor()` | -- | `WasmIdentity` | Generate fresh Ed25519 + X25519 key pairs |
| `publicKeyHex()` | -- | `string` | Ed25519 public key as hex |
| `x25519PublicKeyHex()` | -- | `string` | X25519 public key (Diffie-Hellman) as hex |
| `sign(message)` | `string` | `string` | Sign UTF-8 string, return signature hex |
| `signBytes(data)` | `Uint8Array` | `string` | Sign raw bytes, return signature hex |
| `createRegistration(agent_id, capabilities)` | `string, any` | `any` (JSON) | Signed registration payload for swarm enrollment |
| _static_ `verify(public_key_hex, message, signature_hex)` | `string, string, string` | `boolean` | Verify Ed25519 signature |
| _static_ `generateNonce()` | -- | `string` | Cryptographically random nonce |
| `free()` | -- | `void` | Release WASM memory |

**Standalone equivalent:** `ruvector-core` crate provides server-side identity; WasmIdentity is the WASM-only surface.

```js
const id = new WasmIdentity();
const sig = id.sign("hello");
console.log(WasmIdentity.verify(id.publicKeyHex(), "hello", sig)); // true
```

### WasmCrypto

Static utility class for hashing and symmetric encryption. Private constructor -- all methods are static.

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| _static_ `sha256(data)` | `Uint8Array` | `string` | SHA-256 digest as hex |
| _static_ `sha256String(text)` | `string` | `string` | SHA-256 of UTF-8 string as hex |
| _static_ `generateCid(data)` | `Uint8Array` | `string` | Content-addressed identifier (CID) |
| _static_ `encrypt(data, key_hex)` | `Uint8Array, string` | `any` (JSON: `{ciphertext, nonce}`) | AES-256-GCM encryption. Key = 64 hex chars |
| _static_ `decrypt(encrypted, key_hex)` | `any, string` | `Uint8Array` | AES-256-GCM decryption |

Performance: AES-256-GCM throughput ~1 GB/sec in WASM.

```js
const key = "a".repeat(64); // 32-byte hex key (demo only)
const ct  = WasmCrypto.encrypt(new Uint8Array([1,2,3]), key);
const pt  = WasmCrypto.decrypt(ct, key); // Uint8Array [1, 2, 3]
```

### WasmHybridKeyPair

Post-quantum hybrid signature scheme combining Ed25519 with a Dilithium-style lattice signature. Both signatures are produced on `sign()` and both must pass on `verify()`.

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `constructor()` | -- | `WasmHybridKeyPair` | Generate fresh hybrid key pair |
| `publicKeyHex()` | -- | `string` | Combined public key as hex |
| `sign(message)` | `Uint8Array` | `string` | Hybrid signature as JSON string |
| _static_ `verify(public_key_json, message, signature_json)` | `string, Uint8Array, string` | `boolean` | Verify both classical and post-quantum components |
| `free()` | -- | `void` | Release WASM memory |

**Edge-full exclusive** -- no standalone WASM crate for hybrid PQ signatures.

```js
const kp  = new WasmHybridKeyPair();
const msg = new TextEncoder().encode("quantum-safe payload");
const sig = kp.sign(msg);
console.log(WasmHybridKeyPair.verify(kp.publicKeyHex(), msg, sig)); // true
```

---

## Vector Search

### WasmHnswIndex

Hierarchical Navigable Small World graph for approximate nearest-neighbor search. Operates on `Float32Array` vectors of arbitrary dimensionality.

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `constructor()` | -- | `WasmHnswIndex` | Create with default parameters |
| _static_ `withParams(m, ef_construction)` | `number, number` | `WasmHnswIndex` | Explicit graph connectivity and construction search width |
| `insert(id, vector)` | `string, Float32Array` | `void` | Add a vector |
| `search(query, k)` | `Float32Array, number` | `any` (JSON array of `{id, distance}`) | k-nearest-neighbor search |
| `len()` | -- | `number` | Number of vectors stored |
| `isEmpty()` | -- | `boolean` | Whether index is empty |
| `free()` | -- | `void` | Release WASM memory |

Performance: 150x faster than brute-force search.

```js
const idx = WasmHnswIndex.withParams(16, 200);
idx.insert("vec-0", new Float32Array([0.1, 0.2, 0.3]));
const results = idx.search(new Float32Array([0.1, 0.2, 0.35]), 1);
```

### WasmQuantizer

Static utility for vector compression. Two strategies: binary (32x compression, lossy) and scalar (4x compression, reversible).

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| _static_ `binaryQuantize(vector)` | `Float32Array` | `Uint8Array` | Each float becomes 1 bit (sign). 32x reduction |
| _static_ `scalarQuantize(vector)` | `Float32Array` | `any` (JSON with quantized bytes + metadata) | 4x compression via uint8 scaling |
| _static_ `scalarDequantize(quantized)` | `any` | `Float32Array` | Reconstruct from scalar-quantized representation |
| _static_ `hammingDistance(a, b)` | `Uint8Array, Uint8Array` | `number` | Hamming distance between binary-quantized vectors |

### WasmSemanticMatcher

Lightweight in-WASM task-to-agent matching using TF-IDF-style similarity.

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `constructor()` | -- | `WasmSemanticMatcher` | Create empty matcher |
| `registerAgent(agent_id, capabilities)` | `string, string` | `void` | Register agent with free-text capability description |
| `matchAgent(task_description)` | `string` | `any` (`{agentId, score}` or `null`) | Find best-matching agent |
| `agentCount()` | -- | `number` | Number of registered agents |
| `free()` | -- | `void` | Release WASM memory |

**Edge-full exclusive.** Server-side routing uses `ruvector-router-core` with richer ML models.

```js
const matcher = new WasmSemanticMatcher();
matcher.registerAgent("coder-1", "rust typescript code generation debugging");
matcher.registerAgent("reviewer-1", "code review security audit best practices");
const best = matcher.matchAgent("review this pull request for security issues");
// {agentId: "reviewer-1", score: 0.82}
```

---

## Distributed Systems

### WasmRaftNode

Single-node Raft consensus for coordinating state across browser tabs or P2P peers. The caller handles message transport (e.g., BroadcastChannel, WebRTC data channel). Synchronous, single-threaded distillation of the async `ruvector-raft` crate.

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `constructor(node_id, members)` | `string, any` (JSON array) | `WasmRaftNode` | Create node. Starts as Follower |
| `state()` | -- | `string` | `"Follower"`, `"Candidate"`, or `"Leader"` |
| `term()` | -- | `bigint` | Current election term (u64) |
| `isLeader()` | -- | `boolean` | Whether this node is leader |
| `startElection()` | -- | `any` (JSON vote request) | Transition to Candidate and produce RequestVote |
| `handleVoteRequest(request)` | `any` | `any` (JSON vote response) | Process incoming RequestVote |
| `handleVoteResponse(response)` | `any` | `boolean` | Process vote response. Returns `true` if became leader |
| `appendEntry(data)` | `Uint8Array` | `any` (log index or `null`) | Append to log. Only succeeds if leader |
| `getLogLength()` | -- | `number` | Number of log entries |
| `getCommitIndex()` | -- | `bigint` | Highest committed log index |
| `free()` | -- | `void` | Release WASM memory |

```js
const node = new WasmRaftNode("node-1", ["node-1", "node-2", "node-3"]);
const voteReq = node.startElection();
// ... broadcast via WebRTC, collect responses ...
const becameLeader = node.handleVoteResponse(peerResponse);
if (becameLeader) {
  node.appendEntry(new TextEncoder().encode(JSON.stringify({op: "set", key: "x", value: 1})));
}
```

---

## Neural

### WasmSpikingNetwork

Three-layer spiking neural network using Leaky Integrate-and-Fire (LIF) neurons with STDP learning. Input and output are binary spike trains (`Uint8Array`, each byte 0 or 1).

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `constructor(input_size, hidden_size, output_size)` | `number, number, number` | `WasmSpikingNetwork` | Allocate 3-layer network |
| `forward(inputs)` | `Uint8Array` | `Uint8Array` | Process one timestep, return output spikes |
| `stdpUpdate(pre, post, learning_rate)` | `Uint8Array, Uint8Array, number` | `void` | Apply STDP weight update |
| `reset()` | -- | `void` | Reset all membrane potentials |
| `free()` | -- | `void` | Release WASM memory |

```js
const net = new WasmSpikingNetwork(8, 16, 4);
const input  = new Uint8Array([1, 0, 1, 0, 0, 1, 1, 0]);
const output = net.forward(input);
net.stdpUpdate(input, output, 0.01);
```

---

## Network

### WasmAdaptiveCompressor

Network-aware vector compression that adjusts strategy based on current bandwidth and latency conditions.

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `constructor()` | -- | `WasmAdaptiveCompressor` | Create with default (good network) assumptions |
| `updateMetrics(bandwidth_mbps, latency_ms)` | `number, number` | `void` | Feed current network measurements |
| `compress(data)` | `Float32Array` | `any` (JSON with compressed payload + metadata) | Compress using strategy appropriate for current conditions |
| `condition()` | -- | `string` | Human-readable label (e.g., `"Excellent"`, `"Poor"`) |
| `free()` | -- | `void` | Release WASM memory |

**Edge-full exclusive.** No standalone crate; purpose-built for variable-quality edge networks.

---

## Availability Matrix

| Class | edge-full | Standalone Crate | Notes |
|-------|-----------|-----------------|-------|
| WasmIdentity | Yes | -- (ruvector-core server-side) | WASM-only surface |
| WasmCrypto | Yes | -- | WASM-only surface |
| WasmHybridKeyPair | Yes | **edge-full exclusive** | Post-quantum hybrid |
| WasmHnswIndex | Yes | micro-hnsw-wasm (neuromorphic variant) | Standard HNSW in edge-full |
| WasmQuantizer | Yes | ruQu (server-side) | WASM-only surface |
| WasmSemanticMatcher | Yes | **edge-full exclusive** | Lightweight TF-IDF matcher |
| WasmRaftNode | Yes | ruvector-raft (async/Tokio) | Sync single-thread distillation |
| WasmSpikingNetwork | Yes | ruvector-nervous-system-wasm (broader) | Focused LIF/STDP subset |
| WasmAdaptiveCompressor | Yes | **edge-full exclusive** | Network-adaptive compression |

## Performance Summary (Edge Core)

| Operation | Throughput / Latency |
|-----------|---------------------|
| Ed25519 sign/verify | ~50,000 ops/sec |
| AES-256-GCM encrypt/decrypt | ~1 GB/sec |
| HNSW search (vs brute force) | 150x faster |
| Binary quantization | 32x size reduction |
| Scalar quantization | 4x size reduction (reversible) |

---

# Module 2: Graph DB

`@ruvector/edge-full/graph` -- 288 KB WASM, 9 classes

A property-graph database with first-class hypergraph support. Nodes carry labels and arbitrary properties; edges (binary) and hyperedges (n-ary with embedding vectors) are queryable through a Cypher subset. All data lives in WASM linear memory and is volatile unless exported.

**Query language:** Cypher (basic subset). `GraphDB.query()` accepts Cypher and returns a `Promise<QueryResult>`. Bulk import/export via `importCypher()` / `exportCypher()`.

**Persistence:** In-memory. State serializes to Cypher CREATE statements with `exportCypher()` and reloads with `importCypher()`.

## GraphDB

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `constructor(metric?)` | `string \| null` | `GraphDB` | Create instance. Metric: `"euclidean"`, `"cosine"`, `"dotproduct"`, `"manhattan"` |
| `createNode(labels, properties)` | `string[], any` | `string` | Insert node; returns ID |
| `getNode(id)` | `string` | `JsNode \| undefined` | Retrieve node by ID |
| `deleteNode(id)` | `string` | `boolean` | Remove node |
| `createEdge(from, to, edge_type, properties)` | `string, string, string, any` | `string` | Insert directed relationship |
| `getEdge(id)` | `string` | `JsEdge \| undefined` | Retrieve edge |
| `deleteEdge(id)` | `string` | `boolean` | Remove edge |
| `createHyperedge(nodes, description, embedding?, confidence?)` | `string[], string, Float32Array?, number?` | `string` | Insert n-ary relationship |
| `getHyperedge(id)` | `string` | `JsHyperedge \| undefined` | Retrieve hyperedge |
| `query(cypher)` | `string` | `Promise<QueryResult>` | Execute Cypher query |
| `importCypher(statements)` | `string[]` | `Promise<number>` | Bulk-import Cypher CREATE statements |
| `exportCypher()` | -- | `string` | Serialize entire DB as Cypher |
| `stats()` | -- | `any` | Node/edge/hyperedge counts |
| `free()` | -- | `void` | Release WASM memory |

## AsyncQueryExecutor

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `constructor(batch_size?)` | `number?` | `AsyncQueryExecutor` | Optional batch size |
| `executeInWorker(query)` | `string` | `Promise<any>` | Run Cypher in Web Worker |
| `executeStreaming(query)` | `string` | `Promise<any>` | Stream results for large sets |

## AsyncTransaction

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `constructor()` | -- | `AsyncTransaction` | Begin transaction |
| `addOperation(operation)` | `string` | `void` | Queue Cypher operation |
| `commit()` | -- | `Promise<any>` | Commit all queued operations |
| `rollback()` | -- | `void` | Discard queued operations |
| `isCommitted` | _(readonly)_ | `boolean` | Whether committed |
| `operationCount` | _(readonly)_ | `number` | Queued operations |

## BatchOperations

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `constructor(max_batch_size?)` | `number?` | `BatchOperations` | Optional size cap |
| `executeBatch(statements)` | `string[]` | `Promise<any>` | Run multiple Cypher statements |

## JsNode, JsEdge, JsHyperedge

Read-only handles (private constructors):

- **JsNode**: `id`, `labels`, `properties`, `embedding`, `getProperty(key)`, `hasLabel(label)`
- **JsEdge**: `id`, `from`, `to`, `type`, `properties`, `getProperty(key)`
- **JsHyperedge**: `id`, `nodes`, `description`, `embedding` (Float32Array), `confidence`, `order`, `properties`

## QueryResult / ResultStream

- **QueryResult**: `nodes`, `edges`, `hyperedges`, `data`, `count`, `isEmpty()`
- **ResultStream**: `constructor(chunk_size?)`, `nextChunk()`, `reset()`, `chunkSize`, `offset`

```js
import initGraph, { GraphDB } from '@ruvector/edge-full/graph';
await initGraph();

const db = new GraphDB("cosine");
const alice = db.createNode(["Person"], { name: "Alice" });
const bob   = db.createNode(["Person"], { name: "Bob" });
db.createEdge(alice, bob, "KNOWS", { since: 2024 });
db.createHyperedge([alice, bob], "co-authors on paper");
const result = await db.query('MATCH (n:Person) RETURN n');
```

---

# Module 3: RVLite

`@ruvector/edge-full/rvlite` -- 260 KB WASM, 10 classes

In-memory vector database with hash-based embeddings, LoRA-family adaptation (Base + Micro), and a Think-Reason-Match (TRM) iterative reasoning engine. Designed for edge inference with no GPU or external model server.

**Query language:** SQL, Cypher, and SPARQL stubs are declared and callable but not yet implemented. Primary interface is vector search via `search()` and `search_with_filter()`.

**Persistence:** Purely in-memory. No IndexedDB or filesystem.

## RvLite

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `constructor(config)` | `RvLiteConfig` | `RvLite` | Create with explicit config |
| _static_ `default()` | -- | `RvLite` | 384-dim cosine-similarity instance |
| `insert(vector, metadata?)` | `Float32Array, any?` | `string` | Insert; returns auto-generated ID |
| `insert_with_id(id, vector, metadata?)` | `string, Float32Array, any?` | `void` | Insert with caller-chosen ID |
| `search(query_vector, k)` | `Float32Array, number` | `any` | k-NN search |
| `search_with_filter(query_vector, k, filter)` | `Float32Array, number, any` | `any` | k-NN with metadata predicate |
| `get(id)` | `string` | `any` | Retrieve vector+metadata by ID |
| `delete(id)` | `string` | `boolean` | Remove by ID |
| `len()` / `is_empty()` / `is_ready()` | -- | `number` / `boolean` / `boolean` | Status queries |
| `sql(query)` / `cypher(query)` / `sparql(query)` | `string` | `Promise<any>` | Query stubs (not yet implemented) |

## Embedder

Hash-based projection embedder (no model weights, TF-IDF-like).

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `constructor()` | -- | `Embedder` | Default: 384-dim, MiniLM-compatible |
| _static_ `with_config(config)` | `EmbeddingConfig` | `Embedder` | Custom config |
| `embed(text)` | `string` | `Float32Array` | Embed single text |
| `embed_batch(texts)` | `any` (string[]) | `any` | Batch embed |
| `dimensions()` | -- | `number` | Output dimensionality |
| `similarity(text_a, text_b)` | `string, string` | `number` | Cosine similarity between texts |
| _static_ `cosine_similarity(a, b)` | `Float32Array, Float32Array` | `number` | Raw vector similarity |

## BaseLoRA / MicroLoRA

- **BaseLoRA** (rank 4-16): `forward(input)`, `distillFrom(micro, blend_factor)`, `applyGradients()`, `stats()`
- **MicroLoRA** (rank 1-2, <100us): `forward(input)`, `accumulateGradient(input, feedback)`, `applyGradients()`, `exportWeights()`, `reset()`, `stats()`

Configured via `LoraConfig(hidden_dim, rank, alpha, learning_rate)` with static presets `LoraConfig.base(dim)` and `LoraConfig.micro(dim)`.

## TrmEngine (Think-Reason-Match)

Iterative reasoning engine with configurable attention, early stopping, and convergence detection.

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `constructor(config)` | `TrmConfig` | `TrmEngine` | Create engine |
| `reason(question, answer)` | `Float32Array, Float32Array` | `TrmResult` | Run with default K iterations |
| `reasonWithK(question, answer, k)` | `Float32Array, Float32Array, number` | `TrmResult` | Run with explicit K |

`TrmConfig` presets: `balanced(dim)`, `fast(dim)`, `quality(dim)`. Builders: `withAttention()`, `withDefaultK()`, `withEarlyStopping()`, `withConfidenceThreshold()`.

`TrmResult` fields: `getAnswer()` (Float32Array), `confidence`, `iterations_used`, `early_stopped`, `latency_ms`.

## Free Functions (14)

`cosineSimilarity`, `dotProduct`, `l2Distance`, `normalizeVector`, `lerp`, `meanPooling`, `softmax`, `randomVector`, `zeros`, `benchmark_embeddings`, `benchmark_trm`, `init`, `version`, `features`.

```js
import initRvLite, { RvLite, Embedder, cosineSimilarity } from '@ruvector/edge-full/rvlite';
await initRvLite();

const embedder = new Embedder();
const db = RvLite.default();
db.insert(embedder.embed("graph database"), { label: "graph" });
db.insert(embedder.embed("vector search"), { label: "vector" });
const hits = db.search(embedder.embed("database"), 2);
```

---

# Module 4: DAG

`@ruvector/edge-full/dag` -- 132 KB WASM, 1 class

Minimal directed acyclic graph with operator-cost nodes, cycle detection, topological sorting (Kahn's algorithm), critical-path analysis, and attention-score computation. The lightest module with zero runtime dependencies beyond wasm-bindgen.

**Persistence:** In-memory. Round-trip via JSON (`to_json()` / `from_json()`) or compact binary (`to_bytes()` / `from_bytes()` using bincode).

## WasmDag

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `constructor()` | -- | `WasmDag` | Create empty DAG |
| `add_node(op, cost)` | `number, number` | `number` | Add node with operator type and cost; returns node ID |
| `add_edge(from, to)` | `number, number` | `boolean` | Add directed edge. Returns `false` if it would create a cycle |
| `node_count()` | -- | `number` | Current node count |
| `edge_count()` | -- | `number` | Current edge count |
| `topo_sort()` | -- | `Uint32Array` | Topological ordering via Kahn's algorithm |
| `critical_path()` | -- | `any` (`{path, cost}`) | Longest-cost path through DAG |
| `attention(mechanism)` | `number` | `Float32Array` | Per-node attention scores. `0`=topological, `1`=critical_path, `2`=uniform |
| `to_json()` / `from_json(json)` | `string` | `string` / `WasmDag` | JSON round-trip |
| `to_bytes()` / `from_bytes(data)` | `Uint8Array` | `Uint8Array` / `WasmDag` | Bincode round-trip |
| `free()` | -- | `void` | Release WASM memory |

### Attention mechanisms

- **0 -- topological**: Later nodes score higher
- **1 -- critical_path**: Nodes on the critical path get higher scores
- **2 -- uniform**: All nodes get equal weight

```js
import initDag, { WasmDag } from '@ruvector/edge-full/dag';
await initDag();

const dag = new WasmDag();
const a = dag.add_node(0, 1.0);
const b = dag.add_node(1, 3.0);
const c = dag.add_node(2, 2.0);
dag.add_edge(a, b);
dag.add_edge(a, c);
dag.add_edge(b, c);

console.log(dag.topo_sort());      // Uint32Array [0, 1, 2]
console.log(dag.critical_path());   // { path: [0, 1, 2], cost: 6 }
console.log(dag.attention(1));      // Float32Array, critical-path weighted
```

---

# Module 5: SONA

`@ruvector/edge-full/sona` -- 238 KB WASM, 3 classes

Self-Optimizing Neural Architecture for in-browser adaptive learning with LoRA fine-tuning, trajectory-based experience replay, EWC++ anti-forgetting, and federated aggregation across tabs/workers. The same Rust core that powers the Node.js `@ruvector/sona` package (NAPI-RS) is compiled here to WASM; the API surface is identical, but the binding layer is `wasm-bindgen` instead of `napi-rs`.

## WasmSonaEngine

Core neural router. Manages LoRA weights, trajectory buffers, pattern clustering, and background learning cycles.

**Constructor:** `new WasmSonaEngine(hidden_dim)` or `WasmSonaEngine.withConfig(config)` (JSON with keys: `hidden_dim`, `embedding_dim`, `micro_lora_rank`, `base_lora_rank`, `micro_lora_lr`, `base_lora_lr`, `ewc_lambda`, `pattern_clusters`, `trajectory_capacity`, `quality_threshold`).

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `startTrajectory(query_embedding)` | `Float32Array` | `bigint` (u64) | Begin recording trajectory; returns ID |
| `recordStep(trajectory_id, node_id, score, latency_us)` | `bigint, number, number, bigint` | `void` | Record step: node visited, quality [0,1], latency in us |
| `endTrajectory(trajectory_id, final_score)` | `bigint, number` | `void` | Finish trajectory and submit for learning |
| `learnFromFeedback(success, latency_ms, quality)` | `boolean, number, number` | `void` | One-shot feedback without full trajectory |
| `applyLora(input)` | `Float32Array` | `Float32Array` | Apply learned LoRA transformation |
| `applyLoraLayer(layer_idx, input)` | `number, Float32Array` | `Float32Array` | Apply LoRA at specific layer |
| `findPatterns(query_embedding, k)` | `Float32Array, number` | `any` (JSON) | k nearest learned patterns |
| `forceLearn()` | -- | `string` (JSON) | Force learning cycle; returns stats |
| `runInstantCycle()` | -- | `void` | Flush micro-LoRA updates immediately |
| `tick()` | -- | `boolean` | Try background learning cycle |
| `getStats()` | -- | `any` (JSON) | Engine statistics |
| `getConfig()` | -- | `any` (JSON) | Current config |
| `isEnabled()` / `setEnabled(enabled)` | `boolean` | `boolean` / `void` | Enable/disable learning |
| `free()` | -- | `void` | Release WASM memory |

```js
import init, { WasmSonaEngine } from '@ruvector/edge-full/sona';
await init();

const engine = new WasmSonaEngine(256);
const emb = new Float32Array(256).fill(0.1);
const tid = engine.startTrajectory(emb);
engine.recordStep(tid, 42, 0.8, 1000n);
engine.endTrajectory(tid, 0.85);
engine.forceLearn();
```

## WasmEphemeralAgent

Lightweight (~5 MB footprint) agent for federated training. Unlike CLI agents (long-lived processes via `claude-flow agent spawn` over stdio/MCP), ephemeral agents are short-lived in-process objects that collect trajectory data in a browser tab or Web Worker and export state for aggregation. No network transport -- coordination purely via `exportState()` / `aggregate()`.

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `constructor(agent_id)` or `.withConfig(id, config)` | `string` | `WasmEphemeralAgent` | Create with default or custom config |
| `processTask(embedding, quality)` | `Float32Array, number` | `void` | Process task, record trajectory |
| `processTaskWithRoute(embedding, quality, route)` | `Float32Array, number, string` | `void` | Same but tagged with model route |
| `exportState()` | -- | `any` (JSON) | Export for coordinator aggregation |
| `getPatterns()` / `getStats()` | -- | `any` (JSON) | Retrieve patterns/statistics |
| `forceLearn()` | -- | `string` (JSON) | Force learning cycle |
| `trajectoryCount()` / `averageQuality()` / `uptimeSeconds()` | -- | `number` / `number` / `bigint` | Metrics |
| `clear()` | -- | `void` | Clear collected trajectories |
| `free()` | -- | `void` | Release WASM memory |

## WasmFederatedCoordinator

Central aggregator for federated learning. Collects exports from multiple ephemeral agents, applies quality filtering, consolidates via EWC++, and produces a unified LoRA model. Star topology: agents push state, coordinator merges.

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `constructor(coordinator_id)` or `.withConfig(id, config)` | `string` | `WasmFederatedCoordinator` | Create with default or custom config |
| `aggregate(agent_export)` | `any` (JSON) | `any` (`{accepted, rejected}`) | Ingest agent export |
| `consolidate()` | -- | `string` (JSON) | Run EWC++ consolidation |
| `applyLora(input)` | `Float32Array` | `Float32Array` | Apply merged LoRA |
| `findPatterns(query, k)` / `getPatterns()` / `getStats()` | -- | `any` (JSON) | Search/retrieve patterns/stats |
| `setQualityThreshold(threshold)` | `number` | `void` | Min quality for acceptance (default 0.4) |
| `agentCount()` / `totalTrajectories()` | -- | `number` | Aggregation metrics |
| `clear()` | -- | `void` | Reset contributions |
| `free()` | -- | `void` | Release WASM memory |

```js
// Coordinator tab
const coord = new WasmFederatedCoordinator("central");
coord.setQualityThreshold(0.5);

// Receive exports from worker tabs via postMessage
onmessage = (e) => {
  const result = coord.aggregate(e.data.agentState);
  console.log("accepted:", result.accepted);
};
setInterval(() => coord.consolidate(), 30_000);
```

---

# Module 6: ONNX

`@ruvector/edge-full/onnx` -- 7.1 MB WASM, 2 classes + 1 enum

ONNX model inference for sentence/document embeddings entirely in the browser. Uses the Tract Rust ONNX runtime compiled to WASM (not the onnxruntime C library), enabling fully self-contained execution with no external dependencies.

## Module-level exports

| Function | Signature | Description |
|----------|-----------|-------------|
| `simd_available()` | `() => boolean` | Runtime SIMD128 check. When present, Tract uses vectorized f32 ops (Chrome 91+, Firefox 89+, Safari 16.4+) |
| `version()` | `() => string` | Library version |
| `cosineSimilarity(a, b)` | `(Float32Array, Float32Array) => number` | Cosine similarity in WASM (faster than JS for large vectors) |
| `normalizeL2(embedding)` | `(Float32Array) => Float32Array` | L2-normalize; returns new copy |

## PoolingStrategy enum

| Value | Name | Description |
|-------|------|-------------|
| 0 | Mean | Average all token embeddings (default) |
| 1 | Cls | [CLS] token only |
| 2 | Max | Per-dimension maximum |
| 3 | MeanSqrtLen | Mean normalized by sqrt(sequence length) |
| 4 | LastToken | Last token (decoder-style models) |

## WasmEmbedderConfig

Builder configuration consumed by `WasmEmbedder.withConfig()`.

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `constructor()` | -- | `WasmEmbedderConfig` | Default config |
| `setPooling(pooling)` | `number` (0-4) | `WasmEmbedderConfig` | Set pooling strategy |
| `setNormalize(normalize)` | `boolean` | `WasmEmbedderConfig` | L2-normalize output |
| `setMaxLength(max_length)` | `number` | `WasmEmbedderConfig` | Max token sequence length |

## WasmEmbedder

Loads ONNX model bytes + HuggingFace `tokenizer.json` at construction time.

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `constructor(model_bytes, tokenizer_json)` | `Uint8Array, string` | `WasmEmbedder` | Load with default config |
| _static_ `withConfig(model_bytes, tokenizer_json, config)` | `Uint8Array, string, WasmEmbedderConfig` | `WasmEmbedder` | Load with explicit config |
| `embedOne(text)` | `string` | `Float32Array` | Generate embedding for single text |
| `embedBatch(texts)` | `string[]` | `Float32Array` | Batch embed; flat array, slice at `dimension()` stride |
| `similarity(text1, text2)` | `string, string` | `number` | Embed both and return cosine similarity |
| `dimension()` | -- | `number` | Embedding dimensionality |
| `maxLength()` | -- | `number` | Max sequence length |
| `free()` | -- | `void` | Release WASM memory |

## Pre-trained HuggingFace Models

Model files (ONNX format) and `tokenizer.json` must be fetched separately; the WASM binary does not bundle them.

| Model | Dimensions | Approx Size | Quality | Use Case |
|-------|-----------|-------------|---------|----------|
| `all-MiniLM-L6-v2` | 384 | ~23 MB | Good | Fastest general-purpose (~20 ms/embed) |
| `all-MiniLM-L12-v2` | 384 | ~33 MB | Better | Higher quality than L6 |
| `bge-small-en-v1.5` | 384 | ~33 MB | SOTA (small) | State-of-the-art for 384-dim class |
| `bge-base-en-v1.5` | 768 | ~110 MB | Highest | Best quality; 768-dim vectors |
| `e5-small-v2` | 384 | ~33 MB | Good | Optimized for search/retrieval |
| `gte-small` | 384 | ~33 MB | Good | Multilingual support |

## Parallel Worker Support

For batch workloads, spawn multiple Web Workers each with its own `WasmEmbedder` instance and distribute texts across them. The README documents a 3.8x batch speedup. This is an application-level pattern -- the caller partitions input, posts chunks to workers, and concatenates results.

```js
const modelBytes = new Uint8Array(await fetch('/models/minilm-l6.onnx').then(r => r.arrayBuffer()));
const tokenizerJson = await fetch('/models/tokenizer.json').then(r => r.text());

const config = new WasmEmbedderConfig()
  .setPooling(0)
  .setNormalize(true)
  .setMaxLength(512);

const embedder = WasmEmbedder.withConfig(modelBytes, tokenizerJson, config);
const vec = embedder.embedOne("Hello world");
console.log(`dim=${embedder.dimension()}, vec[0]=${vec[0]}`);
```

---

# Interactive Generator

The package includes `generator.html`, a self-contained single-file application that generates ready-to-run swarm code based on user selections.

## 6 Network Topologies

| Topology | Description |
|----------|-------------|
| Mesh | All agents connect to all others; full connectivity |
| Star | Central coordinator routes all communication |
| Hierarchical | Tree structure with propagate-down / aggregate-up |
| Ring | Circular message passing with hop-by-hop transform |
| Gossip | Epidemic broadcast with configurable fanout |
| Sharded | Domain-partitioned with per-shard HNSW indexes |

## 4 P2P Transports

| Transport | Library | Description |
|-----------|---------|-------------|
| GUN.js | `gun` | Free, offline-first, CRDT-based real-time sync via public relay servers |
| WebRTC | Browser native | Direct peer-to-peer data channels via STUN/TURN; lowest latency (~50ms) |
| libp2p | `libp2p` | IPFS-compatible; WebSocket, Noise encryption, GossipSub, Kademlia DHT |
| Nostr | `nostr-tools` | Relay-based pub/sub using NIP-29000; censorship-resistant |

## 6 Use Cases

| Use Case | Generated Class | Description |
|----------|-----------------|-------------|
| AI Assistants | `AIAssistantSwarm` | Multi-agent chat with semantic routing |
| Data Pipeline | `DataPipelineSwarm` | Distributed ETL with adaptive compression |
| Multiplayer Gaming | `GameSwarm` | Real-time state sync with Raft and signed actions |
| IoT Swarm | `IoTSwarm` | Edge device coordination with geo-spatial HNSW |
| Marketplace | `MarketplaceSwarm` | Cryptographically signed order books |
| Research | `ResearchSwarm` | Distributed compute with spiking-network fusion |

## 8 Core Features (toggleable)

| Feature | WASM Class | Effect |
|---------|------------|--------|
| Identity | `WasmIdentity` | Ed25519 key generation, signing, verification |
| Encryption | `WasmCrypto` | AES-256-GCM, SHA-256, CID generation |
| HNSW Index | `WasmHnswIndex` | Approximate nearest-neighbor vector search |
| Semantic Match | `WasmSemanticMatcher` | TF-IDF agent capability matching |
| Raft Consensus | `WasmRaftNode` | Leader election, log replication |
| Post-Quantum | `WasmHybridKeyPair` | Hybrid Ed25519 + Dilithium signatures |
| Spiking NN | `WasmSpikingNetwork` | Bio-inspired neural network with STDP |
| Compression | `WasmQuantizer` + `WasmAdaptiveCompressor` | Scalar/binary quantization, adaptive compression |

## 7 Exotic Patterns

| Pattern | Description |
|---------|-------------|
| MCP Tools | Browser-based MCP server with encrypted messaging and vector memory |
| Byzantine Fault | BFT agreement tolerating f < n/3 faulty nodes with signed votes |
| Quantum Resistant | Post-quantum hybrid signature swarm |
| Neural Consensus | Spiking-network voting with STDP learning from outcomes |
| Swarm Intelligence | Particle swarm optimization with global/local best tracking |
| Self-Healing | Heartbeat monitoring, failure detection, automatic replacement |
| Emergent Behavior | Genetic algorithm agent evolution with crossover and mutation |

---

# Free P2P Infrastructure

All transport layers use publicly available, zero-cost infrastructure.

| Type | Endpoint | Provider |
|------|----------|----------|
| GUN.js Relay | `https://gun-manhattan.herokuapp.com/gun` | US East |
| GUN.js Relay | `https://gun-us.herokuapp.com/gun` | US West |
| STUN | `stun:stun.l.google.com:19302` | Google |
| STUN | `stun:stun.cloudflare.com:3478` | Cloudflare |
| Signaling | PeerJS Cloud | Free tier (WebRTC) |
| Nostr Relay | `wss://relay.damus.io` | High availability |
| Nostr Relay | `wss://nos.lol` | General purpose |
| Nostr Relay | `wss://relay.nostr.band` | Indexed search |

Monthly cost: $0. No API keys required.

---

# CLI Stack vs Edge Stack Decision Guide

| Criterion | CLI Stack (`ruvector` + `claude-flow`) | Edge Stack (`@ruvector/edge-full`) |
|-----------|---------------------------------------|-------------------------------------|
| Runtime | Node.js (server, CI/CD) | Browser, Deno, Cloudflare Workers |
| Installation | `npx @claude-flow/cli@latest` | `npm install @ruvector/edge-full` |
| Infrastructure | Server required | Zero servers; fully client-side |
| Monthly cost | Varies (compute + API keys) | $0 |
| Agent orchestration | `claude-flow swarm init`, `agent spawn` | Build with WASM primitives |
| Memory/persistence | AgentDB with SQLite backend | In-memory (Cypher/JSON/bincode export) |
| AI model inference | External LLM APIs (Anthropic, OpenAI) | ONNX models in WASM |
| Learning system | CLI hooks, neural train, memory store | SONA engine in-browser, federated coordinator |
| Consensus | Hive-mind (BFT, Raft, gossip via CLI) | WasmRaftNode per browser tab |
| Cryptography | Delegated to runtime | Ed25519, AES-256-GCM, post-quantum in WASM |
| P2P networking | N/A (server-mediated) | GUN.js, WebRTC, libp2p, Nostr |
| Tree-shaking | N/A (CLI binary) | Full support via `sideEffects: false` |

**Use CLI Stack when:** persistent server-side agents, external LLM APIs, MCP coordination, background daemons, or CI/CD pipelines.

**Use Edge Stack when:** zero infrastructure cost, browser-native execution, direct P2P, offline-first, or embedded AI in a web app.

**Use both when:** server-side `claude-flow` swarm coordinates strategy while browser `@ruvector/edge-full` agents handle local compute, P2P, and on-device inference.

---

## @ruvector/edge vs @ruvector/edge-full

Two npm packages share the Edge Core WASM binary but differ significantly in scope and extras.

| Aspect | `@ruvector/edge` | `@ruvector/edge-full` |
|--------|-------------------|------------------------|
| npm package | `@ruvector/edge` (v0.1.9) | `@ruvector/edge-full` (v0.1.0) |
| Total size | 364 KB | 8.4 MB (1.28 MB core + 7.1 MB ONNX) |
| WASM modules | 1 (edge) | 6 (edge, graph, rvlite, sona, dag, onnx) |
| Exported classes | 9 | 35 |
| Module format | ESM (`"type": "module"`) | ESM (`"type": "module"`) |
| `sideEffects` | `["./snippets/*"]` | `false` |
| `worker.js` | Yes -- `@ruvector/edge/worker` | No |
| `worker-pool.js` | Yes -- `@ruvector/edge/worker-pool` | No |
| Graph DB | No | Yes (`./graph`) |
| RVLite vector DB | No | Yes (`./rvlite`) |
| SONA engine | No | Yes (`./sona`) |
| DAG workflows | No | Yes (`./dag`) |
| ONNX inference | No | Yes (`./onnx`) |
| `generator.html` | Yes (bundled) | Yes (bundled) |

**Key architectural difference:** `@ruvector/edge` ships `worker.js` and `worker-pool.js` for distributing vector operations across Web Workers, which is critical for parallelizing HNSW insert/search on multi-core devices. `@ruvector/edge-full` does _not_ include these files; its ONNX module documents an application-level Worker pattern instead (see "Parallel Worker Support" in Module 6).

**When to use `@ruvector/edge`:**
- Minimum bundle size is paramount (364 KB total).
- You need built-in Worker pool for parallel vector ops.
- You only require cryptographic identity, HNSW, Raft, spiking NN, and adaptive compression.

**When to use `@ruvector/edge-full`:**
- You need graph DB, RVLite, SONA, DAG, or ONNX modules.
- Tree-shaking via sub-path imports keeps your effective bundle small.
- You will manage your own Worker orchestration for parallelism.

**Using both together:** `@ruvector/edge` declares `@ruvector/edge-full` as an optional peer dependency. You can install both and use `@ruvector/edge/worker-pool` for Worker-based parallelism while importing additional modules from `@ruvector/edge-full/graph`, `@ruvector/edge-full/sona`, etc.

---

## WorkerPool (from @ruvector/edge)

`@ruvector/edge` exports a `WorkerPool` class for distributing vector operations across Web Workers. Each Worker loads its own WASM instance; the pool manages lifecycle, load balancing, and promise-based request/response.

**Import path:**

```javascript
import { WorkerPool } from '@ruvector/edge/worker-pool';
```

**Note:** This class is NOT available in `@ruvector/edge-full`. It is exclusive to the `@ruvector/edge` package.

### Constructor

```javascript
new WorkerPool(workerUrl, wasmUrl, options?)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `workerUrl` | `string` | URL to `worker.js` (or a bundled equivalent) |
| `wasmUrl` | `string` | URL to `ruvector_edge_bg.wasm` |
| `options.poolSize` | `number` | Number of Workers. Default: `navigator.hardwareConcurrency \|\| 4` |
| `options.dimensions` | `number` | Vector dimensionality passed to each Worker's VectorDB |
| `options.metric` | `string` | Distance metric (`"cosine"`, `"euclidean"`, etc.) |
| `options.useHnsw` | `boolean` | Whether Workers should use HNSW index |

### Methods

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `init()` | -- | `Promise<void>` | Initialize all Workers and their WASM instances concurrently via `Promise.all` |
| `insert(vector, id?, metadata?)` | `Float32Array, string?, any?` | `Promise<string>` | Insert single vector on next available Worker |
| `insertBatch(entries)` | `Array<{vector, id?, metadata?}>` | `Promise<string[]>` | Split entries across Workers by chunk; each Worker processes its chunk in parallel |
| `search(query, k?, filter?)` | `Float32Array, number?, any?` | `Promise<Array<{id, score, vector?, metadata?}>>` | k-NN search on next available Worker |
| `searchBatch(queries, k?, filter?)` | `Float32Array[], number?, any?` | `Promise<Array<...>[]>` | Distribute queries round-robin across Workers |
| `delete(id)` | `string` | `Promise<boolean>` | Delete vector by ID |
| `get(id)` | `string` | `Promise<{id, vector, metadata} \| null>` | Retrieve vector by ID |
| `len()` | -- | `Promise<number>` | Get database length (queries first Worker) |
| `terminate()` | -- | `void` | Terminate all Workers and reset pool state |
| `getStats()` | -- | `{poolSize, busyWorkers, idleWorkers, pendingRequests}` | Pool health snapshot (synchronous) |

### Load Balancing

The pool uses an **idle-first with round-robin fallback** strategy:

1. Starting from the current round-robin index, scan forward for a Worker whose `busy` flag is `false`.
2. If an idle Worker is found, dispatch to it.
3. If all Workers are busy, fall back to strict round-robin (next index in sequence).

For `insertBatch`, entries are split into `ceil(entries.length / poolSize)` chunks and dispatched one chunk per Worker in parallel. For `searchBatch`, each query is dispatched to `queries[i] % poolSize`.

### Timeouts

Every request has a 30-second timeout. If a Worker does not respond within 30 seconds, the pending promise is rejected with `Error('Request timeout')` and the request is removed from the pending map.

### Worker Protocol

Each Worker (`worker.js`) listens for `postMessage` with `{type, data}` and responds with `{type, requestId, data}` or `{type: 'error', error: {message, stack}}`. The Worker instantiates a `VectorDB` from the WASM module during `init` and delegates insert/search/delete/get/len operations to it. All `Float32Array` vectors are reconstructed from transferred arrays inside the Worker.

### Usage Example

```javascript
import { WorkerPool } from '@ruvector/edge/worker-pool';

const pool = new WorkerPool(
  new URL('./worker.js', import.meta.url).href,
  new URL('./ruvector_edge_bg.wasm', import.meta.url).href,
  { poolSize: 4, dimensions: 384, metric: 'cosine', useHnsw: true }
);

await pool.init();

// Insert vectors
await pool.insert(new Float32Array(384).fill(0.1), 'vec-0', { label: 'demo' });

// Batch insert
await pool.insertBatch([
  { vector: new Float32Array(384).fill(0.2), id: 'vec-1' },
  { vector: new Float32Array(384).fill(0.3), id: 'vec-2' },
]);

// Search
const results = await pool.search(new Float32Array(384).fill(0.15), 5);
console.log(results);

// Stats
console.log(pool.getStats());
// { poolSize: 4, busyWorkers: 0, idleWorkers: 4, pendingRequests: 0 }

pool.terminate();
```

---

## Known Limitations

1. **All persistence is in-memory.** Every WASM module (edge, graph, rvlite, sona, dag) stores data in WASM linear memory. Page reload or Worker termination destroys all state. Round-trip serialization is available via `GraphDB.exportCypher()`, `WasmDag.to_json()` / `to_bytes()`, and `WasmEphemeralAgent.exportState()`, but there is no built-in IndexedDB or filesystem integration.

2. **RVLite SQL/SPARQL/Cypher stubs are not implemented.** `RvLite.sql()`, `RvLite.cypher()`, and `RvLite.sparql()` are declared and callable but currently return stub responses. The primary query interface is `search()` and `search_with_filter()` with `Float32Array` vectors.

3. **ONNX model files must be fetched separately.** The 7.1 MB ONNX WASM binary does not bundle any model weights. Model files range from ~23 MB (`all-MiniLM-L6-v2`) to ~110 MB (`bge-base-en-v1.5`) and must be fetched at runtime along with their `tokenizer.json`. Plan for network latency and cache headers accordingly.

4. **No cross-Worker state sharing.** Each Web Worker that uses a WASM module must instantiate its own copy of the `.wasm` binary. There is no `SharedArrayBuffer`-based memory sharing between Workers. The `WorkerPool` in `@ruvector/edge` works around this by maintaining independent VectorDB instances per Worker and merging results in the main thread.

5. **Safari large WASM decode workaround.** Safari versions prior to 17.4 may fail to compile WASM modules larger than a certain threshold synchronously. The `wasm-bindgen` loader includes a `MAX_SAFARI_DECODE_BYTES` guard that falls back to `WebAssembly.instantiate` (async) when the binary exceeds this limit. This primarily affects the ONNX module (7.1 MB). Use `await init()` (the async path) to avoid issues.

6. **COOP/COEP headers required for SharedArrayBuffer.** If you use `SharedArrayBuffer` in federated Worker scenarios (e.g., passing typed arrays between a `WasmFederatedCoordinator` in the main thread and `WasmEphemeralAgent` instances in Workers), the page must serve the following HTTP headers:
   ```
   Cross-Origin-Opener-Policy: same-origin
   Cross-Origin-Embedder-Policy: require-corp
   ```
   Without these headers, `SharedArrayBuffer` is unavailable in most browsers (Chrome 92+, Firefox 79+).

---

## Error Handling

### WASM-to-JavaScript Error Surface

All public WASM methods compiled with `wasm-bindgen` throw standard JavaScript `Error` objects when a Rust function returns `Err(...)` or panics. The `wasm-bindgen` glue converts Rust error types into `Error` instances with string messages.

### Common Throw Scenarios

| Class | Method | Condition | Error Message (typical) |
|-------|--------|-----------|------------------------|
| `WasmCrypto` | `encrypt` / `decrypt` | Key is not exactly 64 hex characters (32 bytes) | `"Invalid key length"` |
| `WasmDag` | `add_edge` | Adding an edge that creates a cycle | Returns `false` (does not throw); however, deserializing a cyclic graph via `from_json` will throw |
| `WasmRaftNode` | `constructor` | Deserializing invalid JSON for the members array | `"Failed to deserialize"` |
| `WasmRaftNode` | `appendEntry` | Calling `appendEntry` when not leader | Returns `null` (does not throw) |
| `WasmHnswIndex` | `insert` | Mismatched vector dimensionality across inserts | Panic -> thrown `Error` |
| `WasmEmbedder` | `constructor` | Invalid ONNX model bytes or malformed `tokenizer.json` | `"Failed to load model"` or tract deserialization error |
| `RvLite` | `search` | Query vector dimensionality does not match index | Panic -> thrown `Error` |

### WASM Out-of-Memory (OOM)

WASM linear memory grows dynamically up to the browser's per-tab limit (typically 2-4 GB, browser-dependent). When the allocator requests more pages than the engine allows:

- The WASM `memory.grow` instruction returns `-1`.
- The Rust allocator (typically `wee_alloc` or `dlmalloc`) triggers a panic.
- The panic is caught by the `wasm-bindgen` panic hook (if installed via `console_error_panic_hook` in `init()`) and re-thrown as a JavaScript `Error` with a Rust backtrace in the message.

Monitor `performance.measureUserAgentSpecificMemory()` (Chrome) or fall back to heuristics (tracking `WasmHnswIndex.len()`, `GraphDB.stats()`, etc.) to avoid hitting the limit.

### Catching Errors

Standard `try/catch` works for all WASM-originating errors:

```javascript
try {
  const ct = WasmCrypto.encrypt(data, "bad-key");
} catch (err) {
  console.error(err.message); // "Invalid key length"
  console.error(err.stack);   // includes WASM frames if panic hook is installed
}
```

If the `console_error_panic_hook` crate is initialized (this happens automatically when `init()` is called for each module), panics produce full Rust stack traces in the error message. Without the hook, panic messages are generic (`"unreachable"` or similar).

### Best Practice

Call `init()` (the default async export) for every module before using any of its classes. This ensures the panic hook is installed, giving you meaningful error messages instead of opaque WASM traps.

---

## Memory Management

All classes across all modules implement `free()` and `Symbol.dispose` for TC39 Explicit Resource Management. Every class is registered with a `FinalizationRegistry` for eventual GC collection, but deterministic `free()` calls are preferred in performance-sensitive code.

```js
{
  using identity = new WasmIdentity(); // auto-freed at block exit
  console.log(identity.publicKeyHex());
}
```
