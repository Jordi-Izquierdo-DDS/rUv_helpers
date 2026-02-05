# Hardcoded Values Audit Report

**Version:** v0.9.7
**Audit Date:** 2026-02-03
**Status:** 🔴 CRITICAL - Configuration system fundamentally broken

---

## Executive Summary

| Source | Hardcoded Items | Severity |
|--------|-----------------|----------|
| **Skill** (`howto_V3+RV_Skill/v0.9.7`) | 36 values | Medium |
| **Implementation** (`memoryV3.07`) | 47 values | High |
| **Claude-Flow CLI** (`node_modules/claude-flow`) | 100+ paths | **CRITICAL** |
| **Total** | **183+ items** | |

### Root Cause Discovery (CONFIRMED 2026-02-03)

**The claude-flow CLI has a fundamentally broken configuration system:**

1. ✅ Configuration loading works (`@claude-flow/shared` loads `claude-flow.config.json` correctly)
2. ✅ Configuration passes Zod schema validation
3. ✅ Configuration is passed to commands via `ctx.config`
4. ❌ **ZERO commands use `ctx.config` - verified by grep showing NO matches**
5. ❌ 100+ hardcoded path references across 12+ files
6. ❌ Config values are loaded then completely discarded

**Verification:**
```bash
# Search for ctx.config usage in commands - returns ZERO results
grep -rn "ctx\.config" node_modules/claude-flow/v3/@claude-flow/cli/dist/src/commands/
# (empty output)
```

**Note:** The config file is `claude-flow.config.json` in project root, NOT `.claude-flow/config.yaml`

**This explains why configuration is being ignored - the commands were never modified to actually read `ctx.config`.**

---

## Part 1: Claude-Flow CLI Hardcoding (CRITICAL)

### The Disconnection Problem

```
┌─────────────────┐    ┌──────────────┐    ┌─────────────────┐
│  config.yaml    │ -> │ ctx.config   │ -> │   IGNORED!      │
│  (loads fine)   │    │ (populated)  │    │ Commands use    │
│                 │    │              │    │ hardcoded paths │
└─────────────────┘    └──────────────┘    └─────────────────┘
```

### All Hardcoded Directory Names (15 patterns)

| Directory | Files Using It | Occurrences | Config Key That SHOULD Be Used |
|-----------|----------------|-------------|-------------------------------|
| `.claude-flow` | 12+ files | 50+ | `projectRoot` |
| `.claude` | 10+ files | 40+ | None defined |
| `.swarm` | 8+ files | 30+ | `swarm.stateDir` |
| `.claude-flow/neural` | neural.js | 5+ | `neural.modelPath` |
| `.claude-flow/memory` | neural.js, embeddings.js | 10+ | `memory.persistPath` |
| `.claude/sessions` | hooks.js, swarm.js | 5+ | `orchestrator.session` |
| `.claude-flow/hnsw` | hooks.js | 3+ | `memory.enableHNSW` path |
| `.claude-flow/benchmarks` | benchmark.js | 2 | None defined |
| `.claude/memory.db` | memory.js, swarm.js | 5+ | `memory.persistPath` |
| `.swarm/memory.db` | hooks.js, swarm.js | 5+ | `memory.persistPath` |

### Critical Files With Hardcoded Paths

#### 1. hooks.js (3,548 lines) - THE PRIMARY OFFENDER

```javascript
// Line 2642-2903: Memory path detection - NO config lookup
path.join(process.cwd(), '.swarm', 'memory.db')      // Line 2642
path.join(process.cwd(), '.claude', 'memory.db')     // Line 2643
path.join(process.cwd(), '.claude', 'sessions')      // Line 2663
path.join(process.cwd(), '.claude-flow', 'learning.json')  // Line 2754
// ... 7 more memory.db locations checked sequentially (2897-2903)
// ... 4 agentdb directory paths (2920-2923)
// ... 3 HNSW index paths (2947-2949)
```

#### 2. neural.js - Pattern Storage

```javascript
// Line 676: ALWAYS writes to .claude-flow/neural
const patternDir = path.join(process.cwd(), '.claude-flow', 'neural');
const patternFile = path.join(patternDir, 'patterns.json');
// config.yaml neural.modelPath is IGNORED
```

#### 3. daemon.js - Daemon State

```javascript
// Lines 50, 160, 249, 298: Daemon paths hardcoded
const stateDir = join(projectRoot, '.claude-flow');
const pidFile = join(stateDir, 'daemon.pid');
const logFile = join(stateDir, 'daemon.log');
```

#### 4. swarm.js - Swarm Coordination

```javascript
// Lines 12-16: Swarm paths hardcoded
const swarmDir = path.join(process.cwd(), '.swarm');
const sessionDir = path.join(process.cwd(), '.claude', 'sessions');
```

---

## Part 2: Implementation Hardcoding (memoryV3.07)

### High Severity Items (14)

| File | Line | Hardcoded Value | Should Use |
|------|------|-----------------|------------|
| post-process.js | 36 | `0.55` threshold | `RUVECTOR_SEMANTIC_THRESHOLD` |
| post-process.js | 132,140,142 | `384` dimension | `RUVECTOR_EMBEDDING_DIM` |
| post-process.js | 241 | `.ruvector/intelligence.db` | `RUVECTOR_SQLITE_PATH` |
| viz/server.js | 22 | `.ruvector/intelligence.db` | `RUVECTOR_SQLITE_PATH` |
| viz/server.js | 292 | `384` dimension | `RUVECTOR_EMBEDDING_DIM` |
| viz/server.js | 293 | `0.55` threshold | `RUVECTOR_SEMANTIC_THRESHOLD` |
| setup.sh | 297-300 | `5000`, `10000` timeouts | `RUVECTOR_HOOK_TIMEOUT_*` |
| sona-fallback | 16 | `384, 0.01, 1000` | Multiple env vars |
| embedding-gateway.js | 33-34 | Model and dim | Env vars (exists but duplicated) |

### Medium Severity Items (24)

| Category | Count | Examples |
|----------|-------|----------|
| Confidence calculations | 6 | `0.1`, `0.15`, `0.05` learning rates |
| Query limits | 5 | `50` memory limit, `20` recent memories |
| Edge limits | 4 | `10` temporal, `5` max semantic |
| Schema validation | 4 | Hardcoded table/column names |
| Model paths | 3 | 5 hardcoded model search locations |
| Pattern thresholds | 2 | `2` min occurrences |

### Duplicated Values (SSOT Violations)

```
Semantic threshold 0.55 appears in:
  - scripts/post-process.js:36 (reads env ✅)
  - viz/server.js:293 (hardcoded ❌)
  - setup.sh:262 (sets env ✅)

Embedding dimension 384 appears in:
  - scripts/post-process.js: 4 locations
  - viz/server.js: 2 locations
  - embedding-gateway.js: 1 location
  - sona-fallback/index.js: 1 location
  - migrate-embeddings.js: 1 location
```

---

## Part 3: Skill Hardcoding (v0.9.7)

### Medium Severity Items (7)

| File | Line | Hardcoded Value | Should Use |
|------|------|-----------------|------------|
| setup.sh | 117 | `.claude/settings.json` | `CLAUDE_SETTINGS_PATH` |
| setup.sh | 354 | `packages/ruvector-storage/index.js` | `STORAGE_ADAPTER_PATH` |
| setup.sh | 389-390 | `.claude/` bridge paths | `CLAUDE_CONFIG_DIR` |
| post-process.js | 241 | `.ruvector/intelligence.db` | `RUVECTOR_SQLITE_PATH` |
| diagnose-db.sh | 15-18 | `.ruvector/` paths | `RUVECTOR_DB_PATH` |
| patch-cli.js | 44 | `node_modules/ruvector/bin/cli.js` | `RUVECTOR_CLI_PATH` |
| embedding-gateway.js | 61-65 | Model search paths | `MODEL_SEARCH_PATHS` |

### Timeout Configuration (5 items)

```bash
# All hardcoded in setup.sh, should be configurable:
PreToolUse timeout:     5000ms  → PRETOOL_USE_TIMEOUT
Remember hook timeout:  5000ms  → REMEMBER_HOOK_TIMEOUT
Post-edit timeout:     10000ms  → POSTEDIT_HOOK_TIMEOUT
Post-command timeout:  10000ms  → POSTCOMMAND_HOOK_TIMEOUT
Validation threshold:   5000ms  → HOOK_TIMEOUT_THRESHOLD
```

---

## Recommended Environment Variables

### Paths (High Priority)

```bash
# Core paths
export RUVECTOR_SQLITE_PATH=".ruvector/intelligence.db"
export RUVECTOR_KV_STORE_PATH=".ruvector/kv.json"
export CLAUDE_SETTINGS_PATH=".claude/settings.json"
export CLAUDE_CONFIG_DIR=".claude"
export RUVECTOR_CLI_PATH="node_modules/ruvector/bin/cli.js"
export STORAGE_ADAPTER_PATH="packages/ruvector-storage/index.js"

# Model paths (colon-separated)
export MODEL_SEARCH_PATHS="node_modules/@xenova/transformers/models:.ruvector/models:$HOME/.cache/huggingface/hub"
```

### Algorithm Parameters

```bash
# Embeddings
export RUVECTOR_EMBEDDING_MODEL="all-MiniLM-L6-v2"
export RUVECTOR_EMBEDDING_DIM=384
export RUVECTOR_SEMANTIC_THRESHOLD=0.55

# Timeouts (milliseconds)
export PRETOOL_USE_TIMEOUT=5000
export REMEMBER_HOOK_TIMEOUT=5000
export POSTEDIT_HOOK_TIMEOUT=10000
export POSTCOMMAND_HOOK_TIMEOUT=10000

# Learning rates
export RUVECTOR_CONFIDENCE_SUCCESS_RATE=0.1
export RUVECTOR_CONFIDENCE_FAILURE_RATE=0.15
export RUVECTOR_CONFIDENCE_DEFAULT_RATE=0.05
export RUVECTOR_DEFAULT_CONFIDENCE=0.5

# Limits
export RUVECTOR_MEMORY_BATCH_SIZE=50
export RUVECTOR_EDGE_MEMORY_WINDOW=20
export RUVECTOR_MAX_SEMANTIC_EDGES_PER_MEMORY=5
export RUVECTOR_PATTERN_MIN_OCCURRENCES=2
```

---

## Fix Priority Matrix

### P0 - Critical (Fix Immediately)

| Issue | Impact | Fix |
|-------|--------|-----|
| Claude-flow ignores config.yaml | All config useless | Patch commands to read ctx.config |
| Neural patterns path hardcoded | SSOT violation | Symlink workaround (done) |
| Memory path hardcoded | Cannot relocate DB | Patch or symlink |

### P1 - High (Fix Soon)

| Issue | Impact | Fix |
|-------|--------|-----|
| Semantic threshold duplicated | Inconsistent behavior | Centralize to env var |
| Embedding dim hardcoded 9 places | Breaks 768d models | Use RUVECTOR_EMBEDDING_DIM |
| Database path not configurable in viz | Hardcoded .ruvector | Add env var support |

### P2 - Medium (Plan to Fix)

| Issue | Impact | Fix |
|-------|--------|-----|
| Hook timeouts static | Performance tuning impossible | Add RUVECTOR_HOOK_TIMEOUT_* |
| Confidence rates hardcoded | Learning tuning impossible | Add env vars |
| Query limits hardcoded | Scale issues | Add batch size configs |

### P3 - Low (Nice to Have)

| Issue | Impact | Fix |
|-------|--------|-----|
| Hash embedding params | Minor quality tuning | Add RUVECTOR_HASH_* vars |
| Gitignore entries | Flexibility | Add GITIGNORE_ENTRIES var |
| Version markers | Extensibility | Add PATCH_VERSION_MARKERS |

---

## Workarounds Currently Applied

### 1. Neural Patterns Symlink
```bash
rm -rf .claude-flow/neural
ln -s ../.ruvector .claude-flow/neural
```
**Status:** ✅ Working - patterns now save to SSOT directory

### 2. Memory Configure
```bash
npx @claude-flow/cli@latest memory configure --path .ruvector
```
**Status:** ✅ Working - memory path updated

### 3. Manual Config.yaml Update
```yaml
# Values documented but ignored by CLI:
neural:
  modelPath: .ruvector  # IGNORED
  dbPath: .ruvector/intelligence.db  # IGNORED
```
**Status:** ⚠️ Documented intent only - CLI ignores these

### 4. Sync Script
```bash
node scripts/sync-neural-to-ssot.js
```
**Status:** ✅ Working - syncs JSON patterns to SQLite

---

## Testing Checklist

For each config key, verify:

- [ ] Setting via `config set` persists
- [ ] Setting via environment variable works
- [ ] Setting via config.yaml works
- [ ] Runtime actually uses the setting
- [ ] Default fallback works when unset

### Test Commands

```bash
# Test 1: Memory path configuration
RUVECTOR_SQLITE_PATH=/custom/path.db npx ruvector hooks post-edit test.js
# Expected: Uses /custom/path.db
# Actual: ???

# Test 2: Neural model path
npx @claude-flow/cli@latest config set --key neural.modelPath --value /custom/neural
npx @claude-flow/cli@latest neural train --sona
# Expected: Saves to /custom/neural/patterns.json
# Actual: Saves to .claude-flow/neural/patterns.json (BROKEN)

# Test 3: Semantic threshold
RUVECTOR_SEMANTIC_THRESHOLD=0.7 node scripts/post-process.js
# Expected: Uses 0.7 threshold
# Actual: Works ✅ (env var is read)
```

---

## Next Steps

1. **Immediate:** Document all workarounds applied
2. **Short-term:** Create centralized config loader for ruvector scripts
3. **Medium-term:** Submit PR to claude-flow to fix config reading
4. **Long-term:** Propose unified config schema across both systems

---

## Appendix: Files Modified for Workarounds

| File | Modification | Purpose |
|------|--------------|---------|
| `.claude-flow/neural` | Symlinked to `.ruvector` | Route patterns to SSOT |
| `.claude-flow/config.yaml` | Added dbPath entries | Document intent |
| `scripts/sync-neural-to-ssot.js` | Created | JSON→SQLite sync |
| `_howto_init&config.md` | Created | Document the issue |
