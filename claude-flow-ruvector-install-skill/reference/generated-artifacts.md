# Generated Artifacts Reference

> **Version:** v0.9 | **Generated:** 2026-02-01 | **Ecosystem:** claude-flow v3.0.0-alpha.190 + ruvector 0.1.96

Verified by running `hooks init` in a clean directory and inspecting every file.

## Contents

- [Files Created by claude-flow init](#files-created-by-claude-flow-init)
- [Files Created by ruvector hooks init](#files-created-by-ruvector-hooks-init)
- [intelligence.json Structure (after init + pretrain)](#intelligencejson-structure-after-init--pretrain)
- [settings.json Structure (after hooks init)](#settingsjson-structure-after-hooks-init)
- [Environment Variables](#environment-variables)
  - [Written by hooks init (13 vars)](#written-by-hooks-init-13-vars)
  - [Added by post-init-fix.sh (3 vars — CRITICAL)](#added-by-post-init-fixsh-3-vars--critical)
  - [Required by claude-flow](#required-by-claude-flow)

---

## Files Created by claude-flow init

| File/Directory | Purpose |
|---|---|
| `claude-flow.config.json` | Main configuration |
| `.claude/` | Claude Code integration directory |
| `.claude/settings.json` | Base hooks, env, permissions, MCP |
| `.claude-flow/` | Project-specific data |
| `.claude-flow/neural/` | Neural pattern storage |
| `.swarm/` | Runtime state directory |
| `.swarm/memory.db` | SQLite memory database |

## Files Created by ruvector hooks init

| File | Condition | Purpose |
|---|---|---|
| `.claude/settings.json` | Always (MERGE) | Adds: env (13 vars), hooks (7 events), workers (12 triggers), performance, agents, permissions (21+5), statusLine, agentConfig |
| `.claude/ruvector-fast.sh` | `--fast` | Fast npx bypass wrapper (checks local → node_modules → global → npx) |
| `.claude/agentic-flow-fast.sh` | `--fast` | Fast agentic-flow wrapper (same search order) |
| `.claude/statusline-command.sh` | Always | Bash status display (reads intelligence.json for live stats) |
| `.claude/agents/*.yaml` | `--build-agents` | Agent configs (2 for "quality": test-architect, project-coordinator) |
| `.claude/agents/index.yaml` | `--build-agents` | Agent index file |
| `.ruvector/` | Always | Intelligence directory |
| `.ruvector/intelligence.json` | Always | Learning state (see structure below) |
| `ruvector.db` | Runtime (optional) | Native VectorDB (redb format, NOT SQLite). ANN accelerator created by IntelligenceEngine. NOT the SSOT. |
| `CLAUDE.md` | Unless `--no-claude-md` | Project instructions |
| `.gitignore` | Unless `--no-gitignore` | Adds `.ruvector/` entry |

## Files Created by v0.9 Fixes

| File | Created By | Purpose |
|---|---|---|
| `.claude/ruvector-hook-bridge.sh` | FIX-007 | Reads Claude Code stdin JSON, extracts tool_input fields, calls ruvector with real data |
| `.ruvector/kv.json` | FIX-008 (JSON backend) | Persists lastEditedFile and other KV pairs across hook invocations |

## KV Store Entries (v0.9)

| Key | Written By | Purpose |
|---|---|---|
| `lastEditedFile` | FIX-008 (post-edit handler) | Last file edited; enables file_sequences co-edit tracking |
| `pretrained` | post-init-fix.sh FIX 8 | Flag indicating pretrain has completed |

## intelligence.json Structure (after init + pretrain)

```json
{
  "patterns": {},                    // Q-learning routing patterns (empty at init)
  "memories": [                      // Vector memories from pretrain Phase 3
    {"content": "...", "type": "project", "embedding": null}  // ← NULL without --semantic!
  ],
  "trajectories": [],               // Execution trajectories (populated during sessions)
  "errors": {},                      // Error patterns (populated by error-record)
  "file_sequences": [],             // Co-edit patterns (from pretrain Phase 2)
  "agents": {},                      // Agent registry
  "edges": [],                       // Coordination edges
  "stats": {
    "total_patterns": 0, "total_memories": 0,  // Note: stats.total_memories can be 0
    "total_trajectories": 0, "session_count": 0 // even when memories array has entries
  },
  "dirPatterns": {},                 // Directory-to-agent mappings (Phase 4)
  "neuralCapabilities": {            // Detected native packages (Phase 8)
    "attention": true, "gnn": true,
    "mechanisms": ["DotProductAttention", ...]  // 9-10 types
  },
  "learning": {
    "qTables": {},                   // Q-table 1 (double-q)
    "qTables2": {},                  // Q-table 2 (double-q)
    "criticValues": {},              // Actor-critic values
    "trajectories": [],              // Learning trajectories
    "stats": {                       // Per-algorithm stats (9 algorithms, all 0 updates at init)
      "double-q": {"updates": 0, "avgReward": 0, "convergenceScore": 0},
      // ... sarsa, q-learning, actor-critic, ppo, decision-transformer, monte-carlo, td-lambda, dqn
    },
    "configs": {                     // 6 task-type configs
      "agent-routing": {"algorithm": "double-q", "learningRate": 0.1, "discountFactor": 0.95},
      // ... error-avoidance, confidence-scoring, trajectory-learning, context-ranking, memory-recall
    },
    "rewardHistory": []
  },
  "compressedPatterns": {"tensors": {}, "totalAccesses": 0},
  "pretrained": {"date": "...", "version": "2.1", "stats": {...}}
}
```

## settings.json Structure (after hooks init)

Key sections written by hooks init:

| Section | Contents |
|---------|----------|
| `env` | 13 environment variables (see wiring-and-validation.md) |
| `hooks` | 7 events: PreToolUse, PostToolUse, SessionStart, Stop, UserPromptSubmit, PreCompact, Notification |
| `workers` | enabled, parallel, maxConcurrent:10, native types, 12 triggers |
| `performance` | modelCache, benchmarkThresholds, optimizations |
| `agents` | 4 presets (quick-scan, deep-analysis, security-scan, learning) |
| `permissions` | 21 allow patterns, 5 deny patterns |
| `mcpServers` | `{}` (EMPTY — registration needs `claude mcp add`) |
| `enabledMcpjsonServers` | `["claude-flow"]` |
| `statusLine` | type:command, points to statusline-command.sh |
| `agentConfig` | directory, focus, generated agents list |

## Environment Variables

### Written by hooks init (13 vars)

| Variable | Default | What reads it |
|----------|---------|--------------|
| `RUVECTOR_INTELLIGENCE_ENABLED` | `true` | All hooks |
| `RUVECTOR_LEARNING_RATE` | `0.1` | Q-learning |
| `RUVECTOR_MEMORY_BACKEND` | `rvlite` | Memory ops (may need @ruvector/rvlite installed) |
| `INTELLIGENCE_MODE` | `treatment` | A/B testing |
| `RUVECTOR_AST_ENABLED` | `true` | ast-analyze, ast-complexity |
| `RUVECTOR_DIFF_EMBEDDINGS` | `true` | diff-analyze, diff-similar |
| `RUVECTOR_COVERAGE_ROUTING` | `true` | coverage-route, coverage-suggest |
| `RUVECTOR_GRAPH_ALGORITHMS` | `true` | graph-mincut, graph-cluster |
| `RUVECTOR_SECURITY_SCAN` | `true` | security-scan |
| `RUVECTOR_MULTI_ALGORITHM` | `true` | Multi-algorithm RL |
| `RUVECTOR_DEFAULT_ALGORITHM` | `double-q` | Default RL algorithm |
| `RUVECTOR_TENSOR_COMPRESS` | `true` | TensorCompress |
| `RUVECTOR_AUTO_COMPRESS` | `true` | Auto-compress on session end |

### Added by post-init-fix.sh (3 vars — CRITICAL)

| Variable | Value | What it fixes |
|----------|-------|--------------|
| `RUVECTOR_SEMANTIC_EMBEDDINGS` | `true` | Enables ONNX embeddings instead of 64d n-gram |
| `RUVECTOR_EMBEDDING_MODEL` | `all-MiniLM-L6-v2` | Which ONNX model to use (384d MiniLM or 768d mpnet) |
| `RUVECTOR_EMBEDDING_DIM` | `384` | Embedding dimensions (must match model: 384 for MiniLM, 768 for mpnet) |

### Required by claude-flow

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | LLM calls (required) |
| `OPENAI_API_KEY` | Alternative provider (optional) |
| `GOOGLE_API_KEY` | Alternative provider (optional) |
