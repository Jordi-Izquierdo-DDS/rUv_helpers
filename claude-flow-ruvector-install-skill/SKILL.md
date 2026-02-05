---
name: "setting-up-claude-flow-ruvector"
description: "Installs, configures, validates, and maintains claude-flow v3 and ruvector together. Handles wiring between components, silent fallbacks, and the self-learning pipeline."
version: "0.9.9"
author: "V3+RV Skill Team"
triggers:
  - "install claude-flow"
  - "install ruvector"
  - "setup memory"
  - "setup learning"
  - "fix embeddings"
  - "troubleshoot hooks"
  - "validate installation"
---

# V3+RV Skill v0.9.9

## AGENT INSTRUCTIONS

**You are executing the V3+RV Skill.** This skill installs and configures Claude-Flow V3 with RuVector intelligence. Follow the decision trees exactly.

### CRITICAL RULES

1. **NEVER run `pretrain` before `setup.sh`** — causes 64d hash embeddings (broken)
2. **ALWAYS verify embedding dimensions** — must be 384d (1536 bytes)
3. **ALWAYS run consolidate after pretrain** — populates learning pipeline
4. **USE EXACT COMMANDS** — do not modify paths or flags unless specified

---

## STATE DETECTION

Before routing, detect current state:

```bash
# System state
npx ruvector info                    # Version, platform, modules
npx ruvector doctor --verbose        # System health + packages
npx ruvector install --list          # What's installed vs available

# Project state
npx claude-flow --version 2>/dev/null    # claude-flow present?
npx ruvector hooks stats                  # Intelligence state (if initialized)
ls -la .claude/settings.json .ruvector/intelligence.json .swarm/memory.db 2>/dev/null
```

**Route based on results:**
- Nothing exists → [FRESH INSTALL]
- ruvector present, no claude-flow → Add claude-flow first, then [FRESH INSTALL] from Phase 4
- claude-flow present, no ruvector → [FRESH INSTALL] from Phase 6
- Both exist, need upgrade → [UPGRADE FROM V0.9.7]
- Both exist, broken → [TROUBLESHOOT]

---

## PACKAGE IDENTITY (Critical npm Gotchas)

| Issue | Reality |
|-------|---------|
| `@claude-flow/cli` vs `claude-flow` | Same package. Use `claude-flow`. |
| `ruvector` vs `@ruvector/cli` | Different! `ruvector` is comprehensive. Always use `ruvector`. |
| `ruvector init` | Does NOT exist. Use `ruvector hooks init`. |
| `rvlite` | Unpublished. Use `@ruvector/rvlite`. |
| `@ruvector/mcp` | Does NOT exist on npm despite appearing in docs. |
| `@ruvector/vector-db` | Does NOT exist on npm despite appearing in docs. |
| `agentic-flow@alpha` | Stale peer deps. Use `agentic-flow@latest` (2.0.6+). |
| `@ruvector/ruvllm` | Version gap (0.2.4 → 2.4.0). Use `--legacy-peer-deps`. |
| `@claude-flow/*` packages | Cross peer-dep conflicts. Always use `--legacy-peer-deps`. |
| `@ruvector/spiking-neural` | Requires cmake. Skip if cmake unavailable. |
| Bulk npm install | Can hang with 20+ packages. Install sequentially if issues. |

---

## DISCOVERY TOOLS

Use these instead of hardcoding assumptions:

| Command | Purpose |
|---------|---------|
| `npx ruvector setup` | Install guide: packages, build deps, Rust crates |
| `npx ruvector install --list` | Package installed/available status |
| `npx ruvector info` | Version, platform, module availability |
| `npx ruvector doctor --verbose` | System health: Node, bindings, packages |
| `npx ruvector hooks doctor --fix` | Hooks config diagnosis + auto-fix |
| `npx ruvector hooks stats` | Intelligence state |

---

## REFERENCE ROUTING

| User needs... | Read |
|---------------|------|
| Init creates, wiring breaks, verify | reference/wiring-and-validation.md |
| Hooks CLI syntax (55 commands) | reference/ruvector-hooks-reference.md |
| Non-hooks ruvector tools | reference/ruvector-tools-reference.md |
| ruvector-extensions | reference/ruvector-extensions-reference.md |
| claude-flow CLI and MCP | reference/claude-flow-reference.md |
| SONA, Dream Cycles, HNSW, Q-Learning | reference/learning-and-consolidation.md |
| Storage backends | reference/storage-backends.md |
| Browser/edge WASM | reference/edge-full-reference.md |
| FOX method for patches | reference/fox-method.md |
| Pre-upgrade, rollback | reference/upgrade-validation.md |
| Files created, env vars | reference/generated-artifacts.md |
| Diagnostics, recovery | reference/troubleshooting.md |
| Daily workflow | reference/daily-workflow.md |
| Package catalog | reference/package-selection.md |

---

## DECISION TREE: What Does the User Need?

```
START
  │
  ├─► User says "install" / "setup" / "fresh" / "new project"
  │     └─► GO TO: [FRESH INSTALL]
  │
  ├─► User says "upgrade" / "update" / "from v0.9.7"
  │     └─► GO TO: [UPGRADE FROM V0.9.7]
  │
  ├─► User says "fix" / "broken" / "not working" / "error"
  │     └─► GO TO: [TROUBLESHOOT]
  │
  ├─► User says "validate" / "check" / "verify"
  │     └─► GO TO: [VALIDATE INSTALLATION]
  │
  ├─► User says "how does it work" / "architecture" / "explain"
  │     └─► GO TO: [ARCHITECTURE REFERENCE]
  │
  └─► User says something else
        └─► ASK: "Do you want to: (1) Fresh install, (2) Upgrade from v0.9.7, (3) Fix an issue, (4) Validate setup?"
```

---

## [FRESH INSTALL]

### Prerequisites Check

**Execute these commands. ALL must pass before proceeding:**

```bash
# Check Node.js version (MUST be 20+)
node --version | grep -E "^v(2[0-9]|[3-9][0-9])" && echo "OK: Node.js" || echo "FAIL: Need Node.js 20+"

# Check npm version (MUST be 9+)
npm --version | grep -E "^(9|[1-9][0-9])" && echo "OK: npm" || echo "FAIL: Need npm 9+"

# Check git
git --version && echo "OK: git" || echo "FAIL: Need git"
```

**IF ANY FAIL:** Stop and tell user to install missing prerequisites.

### Phase 1-7: Project Setup

**Execute in sequence. Do not parallelize.**

```bash
# Phase 1: Create project
mkdir my-project && cd my-project
npm init -y
git init
git config user.email "agent@claude.ai"
git config user.name "Claude Agent"
echo "# Project" > README.md
git add . && git commit -m "Initial commit"

# Phase 2: Create .env
cat > .env << 'ENVEOF'
RUVECTOR_MEMORY_BACKEND=sqlite
RUVECTOR_SQLITE_PATH=.ruvector/intelligence.db
RUVECTOR_EMBEDDING_MODEL=all-MiniLM-L6-v2
RUVECTOR_EMBEDDING_DIM=384
RUVECTOR_SEMANTIC_THRESHOLD=0.55
RUVECTOR_ONNX_ENABLED=true
RUVECTOR_SEMANTIC_EMBEDDINGS=true
RUVECTOR_INTELLIGENCE_ENABLED=true
RUVECTOR_LEARNING_ENABLED=true
RUVECTOR_LEARNING_RATE=0.1
RUVECTOR_SONA_ENABLED=true
RUVECTOR_HNSW_ENABLED=true
RUVECTOR_Q_LEARNING_ALGORITHM=double-q
RUVECTOR_HOOK_TIMEOUT=10000
RUVECTOR_PRETRAIN_DONE=false
ENVEOF
set -a && source .env && set +a

# Phase 3: Install dependencies
npm install better-sqlite3 ruvector --legacy-peer-deps

# Phase 4: Initialize Claude-Flow
npx @claude-flow/cli@latest init --with-embeddings

# Phase 5: Initialize Claude-Flow Memory
npx @claude-flow/cli@latest memory init --force --verbose

# Phase 6: Initialize RuVector Hooks (NO --pretrain flag!)
npx ruvector hooks init --fast

# Phase 7: Copy skill packages
SKILL_PATH="/mnt/data/dev/CFV3/howto_V3+RV_Skill/v0.9.8"
mkdir -p packages
cp -r "$SKILL_PATH/packages/ruvector-storage" packages/
cp -r "$SKILL_PATH/packages/sona-fallback" packages/
cp -r "$SKILL_PATH/packages/sona-shim" packages/
```

### Phase 8: Run setup.sh (CRITICAL - BEFORE PRETRAIN)

```bash
SKILL_PATH="/mnt/data/dev/CFV3/howto_V3+RV_Skill/v0.9.8"
cp -r "$SKILL_PATH/scripts" ./
cp -r "$SKILL_PATH/fixes" ./
chmod +x scripts/*.sh
bash scripts/setup.sh
```

**VERIFY Phase 8 SUCCESS:**
```bash
grep "PRETRAIN_DONE=false" .env && echo "OK: Ready for pretrain" || echo "FAIL: setup.sh did not complete"
```

### Phase 9: Run Pretrain

```bash
npx ruvector hooks pretrain --verbose
```

**VERIFY Phase 9 SUCCESS:**
```bash
test -f .ruvector/intelligence.json && echo "OK: intelligence.json created" || echo "FAIL: pretrain did not create JSON"
```

### Phase 10: Create SQLite Database

```bash
node << 'NODESCRIPT'
const { createStorage } = require('./packages/ruvector-storage');
const storage = createStorage('.ruvector/intelligence.db');
const data = storage.importFromJson();
console.log('Imported:', (data?.memories || []).length, 'memories');
storage.close();
NODESCRIPT
```

**VERIFY Phase 10 SUCCESS:**
```bash
test -f .ruvector/intelligence.db && echo "OK: SQLite DB created" || echo "FAIL: DB not created"
```

### Phase 11: Patch ruvector-fast.sh (Auto-Sync)

```bash
cat > .claude/ruvector-fast.sh << 'WRAPPER_EOF'
#!/bin/bash
RUVECTOR_CLI=""
if [ -f "$PWD/node_modules/ruvector/bin/cli.js" ]; then
  RUVECTOR_CLI="$PWD/node_modules/ruvector/bin/cli.js"
elif command -v ruvector &> /dev/null; then
  RUVECTOR_CLI=$(which ruvector)
else
  npx ruvector@latest "$@"
  node -e "try{require('./packages/ruvector-storage').createStorage().importFromJson()}catch(e){}" 2>/dev/null &
  exit $?
fi
node "$RUVECTOR_CLI" "$@"
HOOK_EXIT=$?
node -e "try{var s=require('./packages/ruvector-storage').createStorage();s.importFromJson();s.close()}catch(e){}" 2>/dev/null &
exit $HOOK_EXIT
WRAPPER_EOF
chmod +x .claude/ruvector-fast.sh
```

### Phase 12: Run Consolidate (Populate Learning Pipeline)

```bash
node scripts/post-process.js --event session-start --agent-name setup-agent 2>/dev/null || true
node scripts/post-process.js --event consolidate 2>/dev/null || true
```

### Phase 13: Verify Installation

```bash
node -e "
const D = require('better-sqlite3');
const db = new D('.ruvector/intelligence.db', {readonly:true});

// Check table counts
const tables = ['memories', 'patterns', 'trajectories', 'stats'];
let allOk = true;
tables.forEach(t => {
  const c = db.prepare('SELECT COUNT(*) as c FROM ' + t).get().c;
  const ok = c > 0;
  console.log((ok ? 'OK' : 'WARN') + ': ' + t + ' = ' + c + ' rows');
  if (!ok && t !== 'patterns') allOk = false;
});

// Check embedding dimensions (CRITICAL)
const embCheck = db.prepare('SELECT length(embedding) as b, COUNT(*) as c FROM memories WHERE embedding IS NOT NULL GROUP BY b').all();
embCheck.forEach(r => {
  const dim = r.b / 4;
  const ok = dim === 384;
  console.log((ok ? 'OK' : 'FAIL') + ': ' + r.c + ' embeddings are ' + dim + 'd');
  if (!ok) allOk = false;
});

db.close();
process.exit(allOk ? 0 : 1);
"
```

**SUCCESS CRITERIA:**
- memories > 0
- stats > 0
- All embeddings are 384d (1536 bytes)

**IF EMBEDDINGS ARE 64d:** Run `bash scripts/setup.sh` then re-pretrain.

---

## [UPGRADE FROM V0.9.7]

### Step 1: Backup Current State

```bash
cp -r .ruvector .ruvector.backup.$(date +%Y%m%d)
cp -r packages packages.backup.$(date +%Y%m%d)
```

### Step 2: Copy New Skill Files

```bash
SKILL_PATH="/mnt/data/dev/CFV3/howto_V3+RV_Skill/v0.9.8"
cp -r "$SKILL_PATH/packages/"* packages/
cp -r "$SKILL_PATH/scripts/"* scripts/
cp -r "$SKILL_PATH/fixes/"* fixes/
```

### Step 3: Run Consolidate (New FIX-024)

```bash
node scripts/post-process.js --event consolidate
```

### Step 4: Fix Embedding Dimensions (If Needed)

**Check current dimensions:**
```bash
node -e "
const D = require('better-sqlite3');
const db = new D('.ruvector/intelligence.db', {readonly:true});
const r = db.prepare('SELECT length(embedding) as b, COUNT(*) as c FROM memories WHERE embedding IS NOT NULL GROUP BY b').all();
r.forEach(x => console.log((x.b/4) + 'd: ' + x.c + ' memories'));
db.close();
"
```

**IF 64d embeddings exist:** Run re-embed:
```bash
bash scripts/setup.sh
# This will re-embed all 64d memories to 384d
```

### Step 5: Verify Upgrade

```bash
bash scripts/validate-setup.sh
```

---

## [TROUBLESHOOT]

### Decision Tree: Identify the Problem

```
PROBLEM
  │
  ├─► "embeddings are 64d" / "semantic search not working"
  │     └─► GO TO: [FIX: WRONG EMBEDDING DIMENSIONS]
  │
  ├─► "tables are empty" / "no patterns" / "no edges"
  │     └─► GO TO: [FIX: EMPTY LEARNING PIPELINE]
  │
  ├─► "hooks not firing" / "remember not working"
  │     └─► GO TO: [FIX: HOOKS NOT WORKING]
  │
  ├─► "SONA not storing" / "compressed_patterns empty"
  │     └─► GO TO: [FIX: SONA STORAGE]
  │
  ├─► "JSON and SQLite out of sync"
  │     └─► GO TO: [FIX: SYNC ISSUES]
  │
  └─► Unknown problem
        └─► RUN: bash scripts/diagnose-db.sh
```

### [FIX: WRONG EMBEDDING DIMENSIONS]

**Symptom:** Embeddings are 64d (256 bytes) instead of 384d (1536 bytes)

**Root Cause:** Pretrain ran before setup.sh applied ONNX patches

**Diagnosis:**
```bash
# Check current embedding dimensions
node -e "
const D = require('better-sqlite3');
const db = new D('.ruvector/intelligence.db', {readonly:true});
const r = db.prepare('SELECT length(embedding) as b, COUNT(*) as c FROM memories WHERE embedding IS NOT NULL GROUP BY b').all();
r.forEach(x => console.log((x.b/4) + 'd: ' + x.c + ' memories'));
db.close();
"
```

**Fix:**
```bash
# 1. ALWAYS backup before recovery
cp .ruvector/intelligence.db .ruvector/intelligence.db.bak.$(date +%Y%m%d%H%M%S)

# 2. Ensure .env has correct config
grep "RUVECTOR_EMBEDDING_DIM=384" .env || echo "RUVECTOR_EMBEDDING_DIM=384" >> .env
grep "RUVECTOR_ONNX_ENABLED=true" .env || echo "RUVECTOR_ONNX_ENABLED=true" >> .env

# 3. Source .env
set -a && source .env && set +a

# 4. Run setup.sh (will re-embed bad memories)
bash scripts/setup.sh

# 5. Verify fix
node -e "
const D = require('better-sqlite3');
const db = new D('.ruvector/intelligence.db', {readonly:true});
const r = db.prepare('SELECT length(embedding) as b, COUNT(*) as c FROM memories WHERE embedding IS NOT NULL GROUP BY b').all();
const bad = r.filter(x => x.b !== 1536);
if (bad.length === 0) console.log('OK: All embeddings are 384d');
else console.log('FAIL: Still have wrong dimensions:', bad);
db.close();
"
```

### [FIX: EMPTY LEARNING PIPELINE]

**Symptom:** edges, neural_patterns, agents tables have 0 rows

**Root Cause:** post-process.js --event consolidate never ran

**Diagnosis:**
```bash
# Check table populations
node -e "
const D = require('better-sqlite3');
const db = new D('.ruvector/intelligence.db', {readonly:true});
['memories', 'patterns', 'trajectories', 'neural_patterns', 'edges', 'agents'].forEach(t => {
  try {
    const c = db.prepare('SELECT COUNT(*) as c FROM ' + t).get().c;
    console.log(t + ':', c);
  } catch(e) { console.log(t + ': table missing'); }
});
db.close();
"
```

**Fix:**
```bash
# 1. ALWAYS backup before recovery
cp .ruvector/intelligence.db .ruvector/intelligence.db.bak.$(date +%Y%m%d%H%M%S)

# 2. Run consolidate
node scripts/post-process.js --event session-start --agent-name fix-agent
node scripts/post-process.js --event consolidate

# 3. Verify
node -e "
const D = require('better-sqlite3');
const db = new D('.ruvector/intelligence.db', {readonly:true});
['edges', 'neural_patterns', 'agents'].forEach(t => {
  const c = db.prepare('SELECT COUNT(*) as c FROM ' + t).get().c;
  console.log(t + ':', c, 'rows', c > 0 ? 'OK' : 'STILL EMPTY');
});
db.close();
"
```

### [FIX: HOOKS NOT WORKING]

**Symptom:** File reads/edits don't create memories

**Diagnostic:**
```bash
# Check hooks are configured
grep -l "ruvector" .claude/settings.json && echo "OK: hooks configured" || echo "FAIL: hooks not in settings.json"

# Check ruvector-fast.sh exists and is executable
test -x .claude/ruvector-fast.sh && echo "OK: wrapper executable" || echo "FAIL: wrapper not executable"

# Test hook manually
./.claude/ruvector-fast.sh hooks post-edit "test.js" 2>&1 | head -5
```

**Fix:**
```bash
# Re-initialize hooks
npx ruvector hooks init --fast

# Re-apply wrapper patch (Phase 11 from install)
# [Execute Phase 11 commands from FRESH INSTALL section]
```

### [FIX: SONA STORAGE]

**Symptom:** compressed_patterns table stays empty

**Root Cause (v0.9.9 Discovery):** The SONA pipeline was disconnected. No code path called `storePattern()` to bridge `neural_patterns` → `compressed_patterns`.

**v0.9.9 Fixes Applied:**
- **FIX-028**: Added `pre-command` handler (was missing)
- **FIX-029**: Added `session-end` handler with consolidate + SONA trigger
- **FIX-030**: Created `sona-consolidate.js` script
- **FIX-031**: Updated Stop hook to call consolidate

**When compressed_patterns fills:**
- During **session-end hook** (now properly wired via FIX-029)
- During **explicit SONA calls** (via `node scripts/sona-consolidate.js`)
- During **daemon consolidate worker** (if configured)
- **NOT during regular post-edit/post-command hooks** (by design)

**Diagnosis:**
```bash
# Check if SONA consolidate script exists
test -f scripts/sona-consolidate.js && echo "OK: SONA consolidate script" || echo "FAIL: copy from skill"

# Check if session-end handler is wired
grep -q "session-end)" .claude/ruvector-hook-bridge.sh && echo "OK: session-end handler" || echo "FAIL: update bridge"

# Check current compressed_patterns count
node -e "
const D = require('better-sqlite3');
const db = new D('.ruvector/intelligence.db', {readonly:true});
console.log('compressed_patterns:', db.prepare('SELECT COUNT(*) c FROM compressed_patterns').get().c);
db.close();
"
```

**To manually trigger SONA consolidation:**
```bash
# Run the SONA consolidate script directly (FIX-030)
node scripts/sona-consolidate.js --verbose

# Or trigger via bridge
.claude/ruvector-hook-bridge.sh session-end

# Or run full consolidation pipeline
node scripts/post-process.js --event consolidate && node scripts/sona-consolidate.js
```

**Expected behavior after v0.9.9 fixes:**
- Fresh install: 0 rows (fills after first session-end)
- After session use: Accumulates each session-end
- Manual testing: Immediate population via `sona-consolidate.js`

### [FIX: SYNC ISSUES]

**Symptom:** JSON and SQLite have different data

**Diagnosis:**
```bash
# Compare JSON and SQLite counts
node -e "
const fs = require('fs');
const D = require('better-sqlite3');
const json = JSON.parse(fs.readFileSync('.ruvector/intelligence.json'));
const db = new D('.ruvector/intelligence.db', {readonly:true});
const jsonMem = (json.memories || []).length;
const dbMem = db.prepare('SELECT COUNT(*) as c FROM memories').get().c;
console.log('JSON:', jsonMem, 'SQLite:', dbMem, jsonMem === dbMem ? 'IN SYNC' : 'OUT OF SYNC');
db.close();
"
```

**Fix:**
```bash
# 1. ALWAYS backup before recovery
cp .ruvector/intelligence.db .ruvector/intelligence.db.bak.$(date +%Y%m%d%H%M%S)

# 2. Force re-import from JSON to SQLite
node -e "
const { createStorage } = require('./packages/ruvector-storage');
const storage = createStorage('.ruvector/intelligence.db');
const data = storage.importFromJson();
console.log('Synced:', (data?.memories || []).length, 'memories');
storage.close();
"

# 3. Verify sync
node -e "
const fs = require('fs');
const D = require('better-sqlite3');
const json = JSON.parse(fs.readFileSync('.ruvector/intelligence.json'));
const db = new D('.ruvector/intelligence.db', {readonly:true});
const jsonMem = (json.memories || []).length;
const dbMem = db.prepare('SELECT COUNT(*) as c FROM memories').get().c;
console.log('JSON:', jsonMem, 'SQLite:', dbMem, jsonMem === dbMem ? 'IN SYNC' : 'OUT OF SYNC');
db.close();
"
```

---

## THREE DOCTOR SCOPES

| Command | Scope | Checks | Misses |
|---------|-------|--------|--------|
| `ruvector doctor -v` | System | Node, bindings, packages | Wiring, embeddings |
| `ruvector hooks doctor --fix` | Config | settings.json structure | Embedding quality, MCP |
| `ruvector hooks verify --verbose` | Runtime | Hooks execute | Learning pipeline, e2e |

**None validate learning pipeline end-to-end.** Use `bash scripts/validate-setup.sh`.

---

## DATA ACCUMULATION BEHAVIOR

Understanding when each table fills is important for debugging:

| Table | Fills When | Fresh Install |
|-------|-----------|---------------|
| `memories` | Pretrain + every hook (remember, post-edit) | 4+ rows |
| `patterns` | Post-edit/post-command hooks | 1+ rows |
| `trajectories` | Post-edit/post-command hooks (RL traces) | 0 (fills during use) |
| `neural_patterns` | Consolidate event | 5+ rows |
| `edges` | Consolidate event (temporal, pattern, semantic) | 10+ rows |
| `agents` | Session-start event | 2 rows |
| `compressed_patterns` | Dream cycles / session-end (SONA) | 0-1 rows |
| `learning_data` | Post-edit/post-command (Q-tables) | 1 row |
| `stats` | Consolidate event | 10+ rows |
| `file_sequences` | Co-edit tracking (multiple file edits) | 0 (fills during use) |
| `errors` | Error events | 0 (good!) |

**Key insight:** `trajectories` and `compressed_patterns` start at 0 after fresh install. This is NORMAL.
- `trajectories` fills as you use the system (edits, commands)
- `compressed_patterns` fills during dream cycles (session end with consolidation)

---

## [VALIDATE INSTALLATION]

**Run the full validation script:**

```bash
bash scripts/validate-setup.sh
```

**Expected Output (all should be OK or PASS):**

```
Level 1: Directory Structure ... OK
Level 2: Environment Variables ... OK
Level 3: Package Installation ... OK
Level 4: Hook Configuration ... OK
Level 5: Database Files ... OK
Level 6: Schema Validation ... OK
Level 7: Data Population ... OK
Level 8: Learning Pipeline ... OK
Level 9: Embedding Dimensions ... OK (384d)
Level 10: Consolidation Status ... OK
```

**Quick validation (single command):**

```bash
node -e "
const D = require('better-sqlite3');
const db = new D('.ruvector/intelligence.db', {readonly:true});
const mem = db.prepare('SELECT COUNT(*) as c FROM memories').get().c;
const emb = db.prepare('SELECT COUNT(*) as c FROM memories WHERE embedding IS NOT NULL AND length(embedding) = 1536').get().c;
const pat = db.prepare('SELECT COUNT(*) as c FROM patterns').get().c;
console.log('Memories:', mem, 'Correct embeddings:', emb, 'Patterns:', pat);
console.log('Status:', (mem > 0 && emb === mem) ? 'HEALTHY' : 'NEEDS ATTENTION');
db.close();
"
```

---

## [ARCHITECTURE REFERENCE]

### Data Flow

```
Claude Code → settings.json → ruvector-fast.sh → ruvector hooks → intelligence.json
                                      │                                    │
                                      └──────── AUTO-SYNC (background) ────┘
                                                       │
                                                       ▼
                                              intelligence.db (SQLite)
                                                       │
                              ┌─────────────┬─────────┴─────────┬─────────────┐
                              ▼             ▼                   ▼             ▼
                          memories      patterns           trajectories   edges
                          (384d emb)    (Q-values)         (SONA)         (graph)
```

### Database Schema (12 Tables)

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `memories` | Semantic memory store | id, content, embedding (384d), metadata |
| `patterns` | Q-learning state-action pairs | key, state, action, q_value, visits |
| `trajectories` | SONA execution traces | id, state, action, reward, timestamp |
| `learning_data` | Multi-algorithm Q-tables | algorithm, q_table (JSON) |
| `stats` | Learning statistics | key, value |
| `agents` | Agent session registry | name, data (JSON) |
| `edges` | Semantic/temporal graph | source, target, weight |
| `neural_patterns` | Extracted patterns | id, content, embedding, confidence |
| `compressed_patterns` | SONA hierarchical | id, layer, data (binary) |
| `file_sequences` | Co-edit prediction | from_file, to_file, count |
| `errors` | Error pattern learning | key, data (JSON) |
| `kv_store` | General key-value | key, value |

### Fix Registry

| Fix ID | Problem | Solution | Location |
|--------|---------|----------|----------|
| FIX-005 | ruvector npm only writes JSON | ruvector-storage SQLite adapter | packages/ruvector-storage |
| FIX-006 | No async ONNX path | patch-cli.js embedding patch | fixes/ruvector/patch-cli.js |
| FIX-007 | Stdin bridge broken | Hook bridge parser | patch-cli.js |
| FIX-008 | lastEditedFile lost | Persisted state | patch-cli.js |
| FIX-013 | SONA never initialized | sona-fallback package | packages/sona-fallback |
| FIX-023 | Flat rewards (no signal) | Reward differentiation | patch-cli.js |
| FIX-024 | Learning pipeline empty | Consolidate step in setup.sh | scripts/setup.sh |
| FIX-025 | Wrong embedding dimensions | Dimension verification | scripts/validate-setup.sh |
| FIX-026 | Conflicting install guides | Unified INSTALL.md | INSTALL.md |
| FIX-027 | Stale stats table | Stats sync in consolidate | scripts/post-process.js |
| FIX-028 | pre-command handler missing | Added pre-command case in bridge | scripts/ruvector-hook-bridge.sh |
| FIX-029 | session-end not triggering SONA | Added session-end with consolidate + SONA | scripts/ruvector-hook-bridge.sh |
| FIX-030 | SONA pipeline disconnected | Created sona-consolidate.js | scripts/sona-consolidate.js |
| FIX-031 | Stop hook missing consolidate | Updated Stop hook with consolidate call | setup.sh (settings.json patch) |
| FIX-032 | neural_patterns missing embeddings | Auto-generate hash embeddings | scripts/sona-consolidate.js |
| FIX-033 | Schema variation: pattern_type | Detect column existence dynamically | scripts/sona-consolidate.js |
| FIX-034 | Schema variation: updated_at | Detect column existence dynamically | scripts/sona-consolidate.js |
| FIX-035 | Centralized DB paths missing | db-paths.js config utility | scripts/templates/db-paths.js |
| FIX-036 | NaN/Infinity in calculations | safe-number.js utility | scripts/templates/safe-number.js |
| FIX-037 | vector_indexes wrong dimensions | Update 768d→384d in memory.db | scripts/setup.sh |

---

## AGENT QUICK REFERENCE

### When to Use This Skill

- User mentions: install, setup, configure, claude-flow, ruvector, memory, learning, hooks
- User has errors related to: embeddings, SQLite, hooks, SONA, patterns

### Key Commands to Remember

```bash
# Fresh install (13 phases)
# → Follow [FRESH INSTALL] section exactly

# Validate installation
bash scripts/validate-setup.sh

# Fix wrong embeddings
bash scripts/setup.sh

# Populate learning pipeline
node scripts/post-process.js --event consolidate

# Debug database
bash scripts/diagnose-db.sh

# Force sync JSON→SQLite
node -e "require('./packages/ruvector-storage').createStorage().importFromJson()"
```

### Success Verification (One-Liner)

```bash
node -e "const D=require('better-sqlite3');const db=new D('.ruvector/intelligence.db');const m=db.prepare('SELECT COUNT(*) c FROM memories').get().c;const e=db.prepare('SELECT COUNT(*) c FROM memories WHERE length(embedding)=1536').get().c;console.log(m>0&&e===m?'HEALTHY':'BROKEN');db.close()"
```

---

## CHANGELOG

### v0.9.9 (2026-02-04)

**Critical SONA Pipeline Fixes:**
- **FIX-028**: Added `pre-command` handler to ruvector-hook-bridge.sh (was missing, fell through to wildcard)
- **FIX-029**: Added `session-end` handler with consolidate + SONA dream cycle trigger
- **FIX-030**: Created `sona-consolidate.js` script (bridges neural_patterns → compressed_patterns)
- **FIX-031**: Updated Stop hook in settings.json to call consolidate + SONA
- **FIX-032**: Auto-generate embeddings for neural_patterns without embeddings
- **FIX-033**: Schema detection for `pattern_type` vs `category` column variations
- **FIX-034**: Schema detection for `updated_at` column in stats table
- **FIX-035**: Centralized db-paths.js config for all 5 database paths
- **FIX-036**: safe-number.js utility prevents NaN/Infinity propagation
- **FIX-037**: Fixed vector_indexes dimensions (768d→384d) in swarm/claude memory.db

**Additions:**
- Phase 14: MCP server registration (was optional, now in install sequence)
- Phase 15: Daemon start and final validation
- Phase 7: Line ending fix for cross-platform compatibility
- State Detection section with routing commands
- Package Identity section (11 npm gotchas)
- Discovery Tools table (6 diagnostic commands)
- Reference Routing table (15+ reference links)
- Three Doctor Scopes comparison
- Backup commands before all recovery procedures

**Restored from v0.9.7:**
- Detailed error recovery procedures with diagnosis steps
- Enhanced troubleshoot fixes with backup commands

**Kept from v0.9.8:**
- AI-optimized decision tree structure
- Machine-verifiable success criteria
- YAML frontmatter with triggers

### v0.9.8 (2026-02-04)
- **FIX-024**: Added consolidate step to setup.sh
- **FIX-025**: Added embedding dimension verification
- **FIX-026**: Unified INSTALL.md (vanilla approach)
- **FIX-027**: Stats table sync in consolidate
- Restructured SKILL.md for AI agent consumption
- Added decision trees for troubleshooting
- Added machine-verifiable success criteria

### v0.9.7 (2026-02-03)
- Initial skill structure
- ruvector-storage, sona-fallback, sona-shim packages
- setup.sh with FIX-005 through FIX-023
