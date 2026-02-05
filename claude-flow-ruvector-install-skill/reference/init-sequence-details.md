# Init Sequence Details

> **Version:** v0.7 | **Generated:** 2026-01-31 | **Ecosystem:** claude-flow v3.0.0-alpha.190 + ruvector 0.1.96

Extended steps for ACTION:INIT-SEQUENCE. The core path (Steps 1-7) is in SKILL.md.
This file covers optional/advanced steps and detailed configuration.

---

## Contents

- [Step 5b: Learning Algorithm Config (from Q5)](#step-5b-learning-algorithm-config-from-q5)
- [Step 5c: Embedding Extras (from Q6b)](#step-5c-embedding-extras-from-q6b)
- [Step 5d: Seed Q-Learning Tables (Optional)](#step-5d-seed-q-learning-tables-optional)
- [Step 5e: Optional Advanced Configuration](#step-5e-optional-advanced-configuration)
- [Step 8: Worker Setup (from Q8)](#step-8-worker-setup-from-q8)
- [Step 9: Advanced Setup (from Q9)](#step-9-advanced-setup-from-q9)
  - [Rust Server Details](#rust-server-details)
- [Q3 --no-env Warning](#q3---no-env-warning)
- [Q9 Server/Advanced Options Table](#q9-serveradvanced-options-table)

---

## Step 5b: Learning Algorithm Config (from Q5)

If the user chose non-default algorithms, apply each change:

```bash
npx ruvector hooks learning-config -t <task-type> -a <algorithm> -l <learning-rate> -g <gamma> -e <epsilon> [--lambda <lambda>]
```

Flags: `-l` = learning rate, `-g` = discount factor (gamma), `-e` = exploration rate (epsilon), `--lambda` = trace-decay (TD(lambda) only).

`--lambda <value>` sets the trace-decay parameter for the TD(lambda) algorithm (range 0-1, default 0.9).
Only meaningful when `-a td-lambda` is selected. With other algorithms, the flag is accepted but ignored.

**Defaults per task type:**

| Task type | Default algorithm | Alternatives |
|-----------|------------------|-------------|
| agent-routing | double-q | q-learning, sarsa, actor-critic, ppo, dqn, monte-carlo, td-lambda, decision-transformer |
| error-avoidance | sarsa | (same 9 algorithms) |
| confidence-scoring | actor-critic | |
| trajectory-learning | decision-transformer | |
| context-ranking | ppo | |
| memory-recall | td-lambda | |

Example: user wants PPO for agent-routing with higher learning rate:
```bash
npx ruvector hooks learning-config -t agent-routing -a ppo -l 0.001 -g 0.99 -e 0.2
```

Verify: `npx ruvector hooks learning-config --show`

If user chose defaults, skip this step entirely.

---

## Step 5c: Embedding Extras (from Q6b)

Skip if the user only selected the default ONNX model.

```bash
# Custom cache size (default 512):
npx ruvector embed optimized --cache-size <cache-size>

# Custom vector DB (non-standard dimensions or metrics):
npx ruvector create <db-path> -d <dim> -m <metric>   # metric: cosine|euclidean|dot

# Adaptive LoRA embeddings (runs on top of base ONNX):
npx ruvector embed adaptive --stats    # verify LoRA state initialized

# External provider (requires ruvector-extensions installed):
# Set the appropriate API key: OPENAI_API_KEY, ANTHROPIC_API_KEY, or COHERE_API_KEY
# See reference/ruvector-extensions-reference.md for provider setup
```

---

## Step 5d: Seed Q-Learning Tables (Optional)

If `hooks route` gives low-confidence (0%) recommendations, the Q-learning tables are cold:

```bash
npx ruvector hooks batch-learn -d '[{"state":"ts-file","action":"coder","reward":0.9},{"state":"test-file","action":"tester","reward":0.9},{"state":"config-file","action":"devops","reward":0.8}]' -t agent-routing
```

The `-d` flag takes an inline JSON array of experiences. This syntax is consistent with
[wiring-and-validation.md](wiring-and-validation.md) and [daily-workflow.md](daily-workflow.md).
Without seeding, all routing returns defaults with confidence: 0.

---

## Step 5e: Optional Advanced Configuration

Skip any that do not apply.

**RAG-enhanced context** (richer code context during routing):
```bash
npx ruvector hooks rag-context -k 5 --rerank
```

**Neural embedding configuration** (beyond base ONNX):
```bash
npx ruvector embed neural --health           # Check neural substrate health
npx ruvector embed neural --calibrate        # Calibrate coherence baseline
npx ruvector embed neural --dimension 384    # Set dimension (match Q6 choice)
```

**Graph DB setup** (if @ruvector/graph-node is installed):
```bash
npx ruvector graph --init                    # Initialize the hypergraph DB
```

---

## Step 8: Worker Setup (from Q8)

For native workers (no external deps):
```bash
npx ruvector native list              # 3 types: security, analysis, learning
npx ruvector native run <type> --path .
```

For custom workers from presets:
```bash
npx ruvector workers create <name> --preset <preset> --triggers "<keywords>"
```

Available presets: `quick-scan`, `deep-analysis`, `security-scan`, `learning`, `api-docs`, `test-analysis`

**Known issues:**
- `workers init-config` delegates to agentic-flow and may dump help instead of running. `workers presets` and `workers phases` work correctly.
- `workers dispatch` argument forwarding is broken. Use `ruvector native run` as the reliable alternative.

Worker results do not automatically feed back into ruvector's learning system. After `native run`, manually store useful results: `npx ruvector hooks remember "worker-result: <summary>" --semantic`.

---

## Step 9: Advanced Setup (from Q9)

Apply each feature the user selected:

```bash
# Semantic router intents:
npx ruvector router --add-intent "<intent-name>" --examples '<examples-json>'

# Real-time watch:
npx ruvector hooks watch --path <dir> --ignore "node_modules,dist,.git" [--dry-run]

# HTTP/gRPC server:
npx ruvector server -p <http-port> -g <grpc-port> -d <data-dir>

# Cluster join:
npx ruvector cluster --join <cluster-address>

# Event subscription:
npx ruvector hooks subscribe --events <event-types>
```

### Rust Server Details

The server binary ships inside the npm package (NAPI-RS). No separate Rust toolchain required.

- **gRPC API with streaming** -- bidirectional streams for bulk insert/search,
  real-time similarity monitoring, and subscription to index events.
- **HTTP REST endpoints** -- `/v1/search`, `/v1/insert`, `/v1/stats`, `/v1/health`
  for non-Node clients (Python, Go, curl).
- **Cluster join** -- `ruvector cluster --join <address>` connects nodes into a
  partitioned HNSW ring. Queries fan out; results merge by score.

**Use the server** (vs CLI/library) when you need: gRPC streaming, multi-language access,
multi-node vector search, or Rust-level performance without Node.js overhead.

---

## Q3 --no-env Warning

`--no-env` skips 13 env vars ruvector needs for the learning pipeline:
`RUVECTOR_INTELLIGENCE_ENABLED`, `RUVECTOR_LEARNING_RATE`, `RUVECTOR_MEMORY_BACKEND`,
`INTELLIGENCE_MODE`, `RUVECTOR_AST_ENABLED`, `RUVECTOR_DIFF_EMBEDDINGS`,
`RUVECTOR_COVERAGE_ROUTING`, `RUVECTOR_GRAPH_ALGORITHMS`, `RUVECTOR_SECURITY_SCAN`,
`RUVECTOR_MULTI_ALGORITHM`, `RUVECTOR_DEFAULT_ALGORITHM`, `RUVECTOR_TENSOR_COMPRESS`,
`RUVECTOR_AUTO_COMPRESS`.

Without these, the learning pipeline, AST analysis, coverage routing, tensor compression,
and security scanning are all disabled. Only use `--no-env` if you plan to set env vars manually.

---

## Q9 Server/Advanced Options Table

| Feature | When to ask | Command |
|---------|------------|---------|
| HTTP/gRPC server | Production deployment | `npx ruvector server -p <port> -g <grpc-port> -d <data-dir>` |
| Cluster mode | Multi-node setup | `npx ruvector cluster --join <address>` |
| Semantic router intents | Custom routing | `npx ruvector router --intents <file> --add-intent <name>` |
| Real-time watch | Continuous learning | `npx ruvector hooks watch --path <dir> [--dry-run]` |
| Event subscription | Monitoring | `npx ruvector hooks subscribe --events learn,route,compress,memory` |

---

*v0.7 | 2026-01-31*
