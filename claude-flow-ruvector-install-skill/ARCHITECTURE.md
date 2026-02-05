# V3+RV Skill Architecture

> **Version:** v0.9.9 | **Updated:** 2026-02-04

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            V3+RV Skill v0.9.8                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐   │
│   │ Claude Code │────▶│ Hook Bridge │────▶│  RuVector   │────▶│   SQLite    │   │
│   │   (IDE)     │     │ (stdin/JSON)│     │    CLI      │     │ intelligence│   │
│   └─────────────┘     └─────────────┘     └─────────────┘     │     .db     │   │
│         │                    │                   │            └─────────────┘   │
│         │                    │                   │                   ▲          │
│         │                    │                   │                   │          │
│         │                    │                   ▼                   │          │
│         │             ┌─────────────┐     ┌─────────────┐            │          │
│         │             │post-process │────▶│  Learning   │────────────┘          │
│         │             │    .js      │     │  Pipeline   │                       │
│         │             └─────────────┘     └─────────────┘                       │
│         │                                                                       │
│         │             ┌─────────────┐     ┌─────────────┐                       │
│         └────────────▶│ Claude-Flow │────▶│   .swarm/   │                       │
│                       │    CLI      │     │  memory.db  │                       │
│                       └─────────────┘     └─────────────┘                       │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Architecture

### 1. Hook Bridge Layer

**Purpose:** Translates Claude Code stdin JSON to RuVector CLI arguments.

```
Claude Code stdin JSON:
{
  "hook_event_name": "PreToolUse",
  "tool_name": "Read",
  "tool_input": {"file_path": "/path/to/file.js"},
  "tool_response": {...}
}

                    ↓ ruvector-hook-bridge.sh ↓

RuVector CLI:
npx ruvector hooks remember "Reading: /path/to/file.js" -t edit --semantic
```

**Files:**
- `.claude/ruvector-hook-bridge.sh` - stdin JSON parser
- `.claude/settings.json` - hook configuration

### 2. Embedding Gateway

**Purpose:** Single source of truth for all embeddings.

```
                    ┌─────────────────────────────────────┐
                    │         Embedding Gateway           │
                    │    (assets/embedding-gateway.js)    │
                    ├─────────────────────────────────────┤
                    │                                     │
┌──────────┐        │   ┌─────────────────────────────┐   │
│ RuVector │───────▶│   │    ONNX Runtime             │   │
│   CLI    │        │   │  (all-MiniLM-L6-v2)         │   │
└──────────┘        │   │        384d vectors         │   │
                    │   └─────────────────────────────┘   │
┌──────────┐        │               │                     │
│  post-   │───────▶│               ▼                     │
│ process  │        │   ┌─────────────────────────────┐   │
└──────────┘        │   │   Cosine Similarity          │   │
                    │   │   Semantic Edge Creation     │   │
                    │   └─────────────────────────────┘   │
                    │                                     │
                    └─────────────────────────────────────┘
```

**Files:**
- `assets/embedding-gateway.js` - embedding generation
- Fallback: hash-based 384d (if ONNX unavailable)

### 3. Learning Pipeline

**Purpose:** Extracts patterns, creates edges, populates intelligence.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Learning Pipeline                                 │
│                      (scripts/post-process.js)                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   EVENT: post-edit                    EVENT: consolidate                │
│   ┌───────────────────────┐          ┌───────────────────────┐         │
│   │ 1. Create temporal    │          │ 1. Extract patterns   │         │
│   │    edges (memory→mem) │          │    from all memories  │         │
│   │ 2. Create file edges  │          │ 2. Create semantic    │         │
│   │    (memory→file)      │          │    edges (high sim)   │         │
│   │ 3. Extract neural     │          │ 3. Register agents    │         │
│   │    patterns           │          │ 4. Sync stats (FIX027)│         │
│   └───────────────────────┘          └───────────────────────┘         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Event Handlers:**
- `session-start` - Register agent in agents table
- `post-edit` - Record edit, create edges, extract patterns
- `post-command` - Record command, create edges
- `consolidate` - Batch process all memories, sync stats

### 4. Storage Architecture

**Purpose:** SQLite-based SSOT with JSON bridge.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Storage Architecture                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   PRIMARY (SSOT)                        SECONDARY                       │
│   ┌───────────────────────┐            ┌───────────────────────┐       │
│   │ .ruvector/            │            │ .swarm/               │       │
│   │   intelligence.db     │            │   memory.db           │       │
│   │   ┌───────────────┐   │            │   (claude-flow)       │       │
│   │   │ memories      │   │            └───────────────────────┘       │
│   │   │ patterns      │   │                                            │
│   │   │ learning_data │   │            INTERMEDIATE                    │
│   │   │ trajectories  │   │            ┌───────────────────────┐       │
│   │   │ edges         │   │            │ .ruvector/            │       │
│   │   │ neural_patterns   │            │   intelligence.json   │       │
│   │   │ compressed_   │   │◀──sync────│   (ruvector writes)   │       │
│   │   │   patterns    │   │            └───────────────────────┘       │
│   │   │ file_sequences│   │                                            │
│   │   │ agents        │   │                                            │
│   │   │ errors        │   │                                            │
│   │   │ stats (FIX027)│   │                                            │
│   │   │ kv_store      │   │                                            │
│   │   └───────────────┘   │                                            │
│   └───────────────────────┘                                            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Tables (12 in intelligence.db):**

| Table | Purpose | Populated By |
|-------|---------|--------------|
| `memories` | Semantic memories with embeddings | pretrain, post-edit hooks |
| `patterns` | Legacy Q-learning state-action pairs | updatePattern() |
| `learning_data` | Multi-algorithm Q-tables (double-q, sarsa) | RL system |
| `trajectories` | Experience replay buffer | trajectory recording |
| `edges` | Semantic relationship graph | post-process.js |
| `neural_patterns` | Learned patterns with confidence | post-process.js |
| `compressed_patterns` | SONA hierarchical storage | SONA compress |
| `file_sequences` | Co-edit prediction | FIX-008 |
| `agents` | Agent registry | post-process.js |
| `errors` | Error pattern learning | error handlers |
| `stats` | Learning statistics (FIX-027) | post-process.js |
| `kv_store` | Key-value storage | various |

---

## Data Flow

### Install Flow (Correct Order)

```
Phase 1-7: Prerequisites and initialization
    │
    ▼
Phase 8: setup.sh
    │   ├── Configure ONNX embeddings
    │   ├── Create database schema
    │   └── Apply upstream patches
    │
    ▼
Phase 9: pretrain
    │   ├── Scan git history
    │   ├── Generate 384d ONNX embeddings
    │   └── Populate memories table
    │
    ▼
Phase 10: consolidate (FIX-024)
    │   ├── Register setup agent
    │   ├── Extract neural patterns
    │   ├── Create semantic edges
    │   └── Sync stats table (FIX-027)
    │
    ▼
Phase 11-13: Validation and finalization
```

**CRITICAL:** Phase 8 (setup.sh) MUST run BEFORE Phase 9 (pretrain).
Otherwise: 64d hash embeddings instead of 384d ONNX.

### Runtime Flow

```
┌──────────┐    stdin JSON    ┌──────────┐    CLI args    ┌──────────┐
│ Claude   │─────────────────▶│  Hook    │───────────────▶│ RuVector │
│ Code     │                  │  Bridge  │                │   CLI    │
└──────────┘                  └──────────┘                └────┬─────┘
                                                               │
                    ┌──────────────────────────────────────────┘
                    │
                    ▼
            ┌──────────────┐         ┌──────────────────────┐
            │ intelligence │◀────────│   post-process.js    │
            │     .json    │         │  (background sync)   │
            └──────┬───────┘         └──────────────────────┘
                   │                            │
                   │ JSON→SQLite sync           │
                   ▼                            ▼
            ┌──────────────┐         ┌──────────────────────┐
            │ intelligence │◀────────│   Learning Pipeline  │
            │     .db      │         │   (edges, patterns)  │
            └──────────────┘         └──────────────────────┘
```

---

## Fix Registry

### v0.9.8 Fixes

| Fix | Description | Location |
|-----|-------------|----------|
| FIX-024 | Consolidate step in setup.sh | scripts/setup.sh SECTION 4 |
| FIX-025 | Embedding dimension verification | scripts/setup.sh Step 8b, validate-setup.sh Level 9 |
| FIX-026 | Unified INSTALL.md | INSTALL.md |
| FIX-027 | Stats table sync in consolidate | scripts/post-process.js handleConsolidate() |

### Prior Fixes (v0.9.0-v0.9.7)

| Fix | Description |
|-----|-------------|
| FIX-005 | Stdin bridge for hook input |
| FIX-006 | Async action handlers |
| FIX-006b | Actual callsite async conversion |
| FIX-007 | Hook bridge shell script |
| FIX-008 | lastEditedFile persistence |
| FIX-009 | Atomic save (no delete-all) |
| FIX-010 | Embedding dimension consistency |
| FIX-013 | SONA warm-up replay |
| FIX-014 | HNSW storagePath |
| FIX-015 | tick/forceLearn wiring |
| FIX-016 | TinyDancer routing (optional) |
| FIX-023 | Trajectory reward variance |

---

## Integration Points

### Claude-Flow Integration

```
claude-flow CLI ──────────────▶ .swarm/memory.db
       │
       ├── swarm init
       ├── agent spawn
       ├── memory store/retrieve
       └── hooks (pre-task, post-task)
```

### RuVector Integration

```
ruvector CLI ─────────────────▶ .ruvector/intelligence.json
       │                                    │
       ├── hooks init                       │ auto-sync
       ├── hooks pretrain                   ▼
       ├── hooks post-edit      .ruvector/intelligence.db
       ├── hooks recall
       └── hooks stats
```

### MCP Server Integration

```
┌──────────────────────────────────────────────────────────────────────┐
│                        MCP Servers                                   │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   claude-flow MCP                    ruvector MCP                    │
│   ┌────────────────────┐            ┌────────────────────┐          │
│   │ npx @claude-flow/  │            │ npx ruvector       │          │
│   │   cli@latest       │            │   mcp start        │          │
│   │                    │            │                    │          │
│   │ Tools:             │            │ Tools:             │          │
│   │ - memory_store     │            │ - hooks_remember   │          │
│   │ - memory_search    │            │ - hooks_recall     │          │
│   │ - agent_spawn      │            │ - hooks_route      │          │
│   │ - swarm_init       │            │ - hooks_stats      │          │
│   └────────────────────┘            └────────────────────┘          │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Performance Characteristics

| Operation | Latency | Storage |
|-----------|---------|---------|
| Hook execution | 200-500ms | - |
| Embedding generation | 100-300ms | 1.5KB per memory |
| Semantic search (HNSW) | <10ms | O(log n) |
| Consolidate (1000 memories) | 2-5s | - |
| Pretrain (100 commits) | 30-60s | - |

---

## Security Model

### File Access

| Directory | Read | Write | Purpose |
|-----------|------|-------|---------|
| `.ruvector/` | Yes | Yes | Intelligence storage |
| `.swarm/` | Yes | Yes | Claude-flow memory |
| `.claude/` | Yes | Yes | Configuration |
| `node_modules/` | Yes | FOX patches only | Dependencies |
| Project root | Yes | Limited | Source files |

### Data Sensitivity

- **intelligence.db**: Contains code patterns, file paths - treat as sensitive
- **memory.db**: Contains session data - treat as sensitive
- **settings.json**: Contains configuration - version control safe (no secrets)

---

## Environment Variables Reference

### 12 variables from `hooks init`:

| Variable | Default | Purpose |
|----------|---------|---------|
| RUVECTOR_INTELLIGENCE_ENABLED | true | Master switch for all hooks |
| RUVECTOR_LEARNING_RATE | 0.1 | Q-learning alpha |
| RUVECTOR_MEMORY_BACKEND | rvlite | Memory storage backend |
| INTELLIGENCE_MODE | treatment | A/B testing (treatment/control) |
| RUVECTOR_AST_ENABLED | true | AST analysis |
| RUVECTOR_DIFF_EMBEDDINGS | true | Diff similarity |
| RUVECTOR_COVERAGE_ROUTING | true | Coverage-aware routing |
| RUVECTOR_GRAPH_ALGORITHMS | true | Graph analysis |
| RUVECTOR_SECURITY_SCAN | true | Security scanning |
| RUVECTOR_MULTI_ALGORITHM | true | Multi-algorithm RL |
| RUVECTOR_DEFAULT_ALGORITHM | double-q | Default RL algorithm |
| RUVECTOR_SEMANTIC_THRESHOLD | 0.55 | Minimum cosine similarity |

### 3 CRITICAL variables from `setup.sh`:

| Variable | Default | Purpose |
|----------|---------|---------|
| RUVECTOR_SEMANTIC_EMBEDDINGS | true | Enables ONNX (without: 64d hash!) |
| RUVECTOR_EMBEDDING_MODEL | all-MiniLM-L6-v2 | ONNX model name |
| RUVECTOR_EMBEDDING_DIM | 384 | Must match model |

### Dream cycle (optional):

| Variable | Default | Purpose |
|----------|---------|---------|
| RUVECTOR_DREAM_CYCLE_ENABLED | true | Background consolidation |
| RUVECTOR_TENSOR_COMPRESS | true | Tensor compression |
| RUVECTOR_AUTO_COMPRESS | true | Auto-compress on session end |

---

## Hook Timeout Reference

| Hook Event | Hook Type | Timeout | Reason |
|------------|-----------|---------|--------|
| PreToolUse | Edit | 5000ms | ONNX embedding |
| PreToolUse | Bash | 5000ms | ONNX embedding |
| PreToolUse | Read | 5000ms | ONNX embedding |
| PostToolUse | Edit | 10000ms | ONNX + trajectory + post-process |
| PostToolUse | Bash | 10000ms | ONNX + trajectory + post-process |
| PostToolUse | Task | 10000ms | Agent registration + post-process |
| SessionStart | - | 5000ms | Session restore + warmup |
| SessionEnd | - | 10000ms | SONA flush + EWC++ |
| remember | - | 5000ms | ONNX cold-start (1-1.5s) |
| recall | - | 5000ms | HNSW search + reranking |

**Note:** First ONNX call downloads 23MB model. Allow 10000ms+ for first invocation.

**Verify timeouts:**
```bash
node -e 'var s=JSON.parse(require("fs").readFileSync(".claude/settings.json"));var h=s.hooks||{};Object.keys(h).forEach(function(e){(h[e]||[]).forEach(function(entry){var hooks=entry.hooks||[entry];hooks.forEach(function(hk){if(hk.timeout)console.log(e,hk.timeout+"ms")})})})'
```

---

## Failure Modes

### Silent Failures (Pattern B)

- Hook commands use `2>/dev/null || true`
- Use validate-setup.sh to detect
- Run hooks manually without suppression for debugging

### Dimension Mismatch (Pattern D)

- Different code paths produce different embedding dimensions
- Causes silent semantic search failures
- Detect: query `length(embedding)` in SQLite
- Fix: re-embed all to consistent dimension

### Stateless Invocations (Pattern E)

- Each hook is a fresh process
- Instance state resets per invocation
- Persist critical state in kv_store

### Install Order (Pattern H)

- setup.sh MUST run before pretrain
- Consolidate MUST run after pretrain
- Validation catches order violations
