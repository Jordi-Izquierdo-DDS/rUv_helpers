# Clean Vanilla Install Guide - V3+RV Skill v0.9.7

**Version:** v0.9.7
**Created:** 2026-02-04
**Purpose:** Fresh install with DEFAULT paths, SQLite storage, and auto-sync

---

## Overview

This guide installs the V3+RV skill with:
- **Default paths** (no symlinks, no path unification)
- **SQLite as final storage** (.db files)
- **Auto-sync** from JSON to SQLite (parallel, zero latency)

### What Gets Created

| Directory | Database | Purpose |
|-----------|----------|---------|
| `.swarm/` | `memory.db` | Claude-flow agent memory, sessions |
| `.ruvector/` | `intelligence.db` | RuVector learning data |
| `.ruvector/` | `intelligence.json` | Intermediate (auto-synced to .db) |
| `.claude/` | `memory.db` | Claude-flow sync copy |
| `.claude-flow/` | - | Config and metrics only |

---

## Prerequisites

```bash
# Node.js 20+ required
node --version  # Must be v20.x or higher

# npm 9+ required
npm --version   # Must be v9.x or higher

# Git (for pretrain)
git --version
```

---

## Phase 1: Create Project & Initialize Git

```bash
# Create project directory
mkdir my-project && cd my-project
npm init -y

# Initialize git (required for pretrain)
git init
git config user.email "you@example.com"
git config user.name "Your Name"

# Create initial files
echo "# My Project" > README.md
git add . && git commit -m "Initial commit"
```

---

## Phase 2: Create .env (SQLite Configuration)

```bash
cat > .env << 'EOF'
# === SQLite Backend Configuration ===
RUVECTOR_MEMORY_BACKEND=sqlite
RUVECTOR_SQLITE_PATH=.ruvector/intelligence.db

# === Embedding Config ===
RUVECTOR_EMBEDDING_MODEL=all-MiniLM-L6-v2
RUVECTOR_EMBEDDING_DIM=384
RUVECTOR_SEMANTIC_THRESHOLD=0.55
RUVECTOR_ONNX_ENABLED=true
RUVECTOR_SEMANTIC_EMBEDDINGS=true

# === Learning Config ===
RUVECTOR_INTELLIGENCE_ENABLED=true
RUVECTOR_LEARNING_ENABLED=true
RUVECTOR_LEARNING_RATE=0.1

# === SONA Config ===
RUVECTOR_SONA_ENABLED=true
RUVECTOR_HNSW_ENABLED=true
RUVECTOR_Q_LEARNING_ALGORITHM=double-q

# === Hook Config ===
RUVECTOR_HOOK_TIMEOUT=10000
RUVECTOR_PRETRAIN_DONE=false
EOF

# Load environment
set -a && source .env && set +a
```

---

## Phase 3: Install Dependencies

```bash
# Core dependencies
npm install better-sqlite3 ruvector

# Optional: ONNX embeddings (recommended)
npm install @xenova/transformers
```

---

## Phase 4: Initialize Claude-Flow

```bash
npx @claude-flow/cli@latest init --with-embeddings
```

This creates:
- `.claude/settings.json` - hooks, permissions
- `.claude-flow/config.yaml` - runtime config
- `.claude/` directory structure

---

## Phase 5: Initialize Claude-Flow Memory

```bash
npx @claude-flow/cli@latest memory init --force --verbose
```

This creates:
- `.swarm/memory.db` - Claude-flow memory database
- `.claude/memory.db` - Sync copy

---

## Phase 6: Initialize RuVector Hooks

```bash
npx ruvector hooks init --fast
```

This creates:
- `.ruvector/` directory
- `.claude/ruvector-fast.sh` - fast hook wrapper
- Merges hooks into `.claude/settings.json`

---

## Phase 7: Run Pretrain (Creates intelligence.json)

```bash
npx ruvector hooks pretrain --verbose
```

This creates:
- `.ruvector/intelligence.json` - pretrain data (JSON format)

**Note:** The ruvector npm package writes JSON, not SQLite. We handle this in Phase 8-9.

---

## Phase 8: Copy Custom Packages

```bash
# Set skill path (adjust to your installation)
SKILL_PATH="/path/to/howto_V3+RV_Skill/v0.9.7"

# Copy required packages
mkdir -p packages
cp -r "$SKILL_PATH/packages/ruvector-storage" packages/
cp -r "$SKILL_PATH/packages/sona-fallback" packages/
cp -r "$SKILL_PATH/packages/sona-shim" packages/
```

---

## Phase 9: Create SQLite Database & Import JSON

```bash
node << 'NODESCRIPT'
const { createStorage } = require('./packages/ruvector-storage');
const fs = require('fs');

console.log('Creating SQLite database...');
const storage = createStorage('.ruvector/intelligence.db');

// Import pretrain data from JSON
if (fs.existsSync('.ruvector/intelligence.json')) {
  console.log('Importing from intelligence.json...');
  const data = storage.importFromJson();
  if (data) {
    console.log('  Memories:', (data.memories || []).length);
    console.log('  Patterns:', Object.keys(data.patterns || {}).length);
  }
}

// Validate schema
if (storage.validateSchema()) {
  console.log('Schema validated: OK');
}

storage.close();
console.log('SQLite database created!');
NODESCRIPT
```

---

## Phase 10: Patch ruvector-fast.sh for Auto-Sync (CRITICAL!)

**This is the key fix:** Modify the hook wrapper to auto-sync JSON→SQLite after every hook call, in parallel (zero latency).

```bash
cat > .claude/ruvector-fast.sh << 'WRAPPER_EOF'
#!/bin/bash
# Fast RuVector hooks wrapper with AUTO-SYNC to SQLite
# v0.9.7 - Parallel sync (zero latency)

# Find ruvector CLI
RUVECTOR_CLI=""
if [ -f "$PWD/node_modules/ruvector/bin/cli.js" ]; then
  RUVECTOR_CLI="$PWD/node_modules/ruvector/bin/cli.js"
elif command -v ruvector &> /dev/null; then
  RUVECTOR_CLI=$(which ruvector)
else
  # Fallback to npx
  npx ruvector@latest "$@"
  # Sync after npx completes
  node -e "try{require('./packages/ruvector-storage').createStorage().importFromJson()}catch(e){}" 2>/dev/null &
  exit $?
fi

# Run the hook (writes to JSON)
node "$RUVECTOR_CLI" "$@"
HOOK_EXIT=$?

# AUTO-SYNC: Import JSON to SQLite in BACKGROUND (parallel, no latency)
# This runs after the hook completes, Claude doesn't wait
node -e "try{var s=require('./packages/ruvector-storage').createStorage();s.importFromJson();s.close()}catch(e){}" 2>/dev/null &

exit $HOOK_EXIT
WRAPPER_EOF

chmod +x .claude/ruvector-fast.sh
echo "Patched ruvector-fast.sh with auto-sync"
```

### How Auto-Sync Works

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Hook fires  │ ──► │ Writes to JSON  │ ──► │ Hook returns    │
└─────────────┘     └─────────────────┘     └────────┬────────┘
                                                     │
                                                     │ (parallel, background)
                                                     ▼
                                            ┌─────────────────┐
                                            │ Sync JSON→SQLite│
                                            └─────────────────┘
```

- **Zero latency:** Claude doesn't wait for sync
- **Every hook:** All hooks auto-sync
- **Always in sync:** JSON and SQLite stay synchronized

---

## Phase 11: Update .gitignore

```bash
cat >> .gitignore << 'EOF'

# V3+RV Skill
.ruvector/
.swarm/
.claude-flow/
*.db
*.db-journal
*.db-wal
*.db-shm
node_modules/
EOF

git add .gitignore && git commit -m "Add V3+RV ignores"
```

---

## Phase 12: Verify Installation

```bash
echo "=== Checking files ==="
test -f .claude/settings.json && echo "OK: settings.json"
test -f .ruvector/intelligence.db && echo "OK: intelligence.db"
test -f .ruvector/intelligence.json && echo "OK: intelligence.json"
test -f .swarm/memory.db && echo "OK: memory.db"
test -f .claude/ruvector-fast.sh && echo "OK: ruvector-fast.sh"
test -d packages/ruvector-storage && echo "OK: ruvector-storage package"

echo ""
echo "=== Database tables ==="
node -e "
const D = require('better-sqlite3');
const db = new D('.ruvector/intelligence.db', {readonly:true});
const tables = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite%'\").all();
console.log('Tables:', tables.length);
tables.forEach(t => {
  const c = db.prepare('SELECT COUNT(*) as c FROM ' + t.name).get().c;
  if (c > 0) console.log('  ' + t.name + ':', c, 'rows');
});
db.close();
"

echo ""
echo "=== Test auto-sync ==="
# Run a hook
./.claude/ruvector-fast.sh hooks post-edit "package.json" 2>/dev/null
sleep 1  # Wait for background sync

# Check both storages
node -e "
const fs = require('fs');
const D = require('better-sqlite3');

const json = JSON.parse(fs.readFileSync('.ruvector/intelligence.json'));
const db = new D('.ruvector/intelligence.db', {readonly:true});
const dbMem = db.prepare('SELECT COUNT(*) as c FROM memories').get().c;

console.log('JSON memories:', (json.memories||[]).length);
console.log('SQLite memories:', dbMem);
console.log('In sync:', (json.memories||[]).length === dbMem ? 'YES' : 'NO');
db.close();
"
```

---

## Quick Reference: Complete Sequence

```bash
# 1. Create project
mkdir my-project && cd my-project && npm init -y

# 2. Initialize git
git init && git config user.email "you@example.com" && git config user.name "You"
echo "# Project" > README.md && git add . && git commit -m "Initial"

# 3. Create .env (see Phase 2)

# 4. Load env
set -a && source .env && set +a

# 5. Install deps
npm install better-sqlite3 ruvector @xenova/transformers

# 6. Init claude-flow
npx @claude-flow/cli@latest init --with-embeddings

# 7. Init memory
npx @claude-flow/cli@latest memory init --force

# 8. Init ruvector hooks
npx ruvector hooks init --fast

# 9. Pretrain
npx ruvector hooks pretrain --verbose

# 10. Copy packages
mkdir -p packages
cp -r "$SKILL_PATH/packages/ruvector-storage" packages/
cp -r "$SKILL_PATH/packages/sona-fallback" packages/

# 11. Create SQLite DB
node -e "const {createStorage}=require('./packages/ruvector-storage');const s=createStorage();s.importFromJson();s.close()"

# 12. Patch wrapper for auto-sync (see Phase 10)

# 13. Update .gitignore

# 14. Verify
```

---

## Data Flow Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA FLOW                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PRETRAIN                                                                   │
│  ────────                                                                   │
│  git history ──► ruvector pretrain ──► intelligence.json ──► intelligence.db│
│                                              │                    ▲         │
│                                              │    (Phase 9 import)│         │
│                                              └────────────────────┘         │
│                                                                             │
│  RUNTIME (hooks)                                                            │
│  ───────────────                                                            │
│  Claude edit ──► post-edit hook ──► intelligence.json ──► intelligence.db   │
│                                              │                    ▲         │
│                                              │   (auto-sync, parallel)      │
│                                              └────────────────────┘         │
│                                                                             │
│  SONA (fallback)                                                            │
│  ───────────────                                                            │
│  Pattern store ──► sona-fallback ──► intelligence.db (direct)               │
│                                                                             │
│  CLAUDE-FLOW                                                                │
│  ───────────                                                                │
│  memory store ──► claude-flow ──► .swarm/memory.db                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Databases Created

| Database | Location | Tables | Populated By |
|----------|----------|--------|--------------|
| `intelligence.db` | `.ruvector/` | 12 tables | pretrain, hooks (via sync), SONA |
| `memory.db` | `.swarm/` | 9 tables | claude-flow memory commands |
| `memory.db` | `.claude/` | 9 tables | claude-flow sync copy |

### intelligence.db Tables (12)

| Table | Purpose |
|-------|---------|
| `memories` | Semantic memories with embeddings |
| `patterns` | Q-learning state-action pairs |
| `learning_data` | Multi-algorithm Q-tables |
| `trajectories` | Experience replay buffer |
| `edges` | Semantic relationship graph |
| `neural_patterns` | Learned patterns with confidence |
| `compressed_patterns` | SONA hierarchical storage |
| `file_sequences` | Co-edit prediction |
| `agents` | Agent registry |
| `errors` | Error pattern learning |
| `stats` | Learning statistics |
| `kv_store` | Key-value storage |

### memory.db Tables (9)

| Table | Purpose |
|-------|---------|
| `memory_entries` | Agent working memory |
| `patterns` | Task-routing patterns |
| `pattern_history` | Pattern versioning |
| `trajectories` | SONA learning traces |
| `trajectory_steps` | Individual steps |
| `sessions` | Session persistence |
| `vector_indexes` | HNSW configuration |
| `migration_state` | Migration tracking |
| `metadata` | System metadata |

---

## Troubleshooting

### Issue: Hooks write to JSON but SQLite not updated

**Check:** Is ruvector-fast.sh patched?
```bash
grep "importFromJson" .claude/ruvector-fast.sh
```

**Fix:** Re-run Phase 10 to patch the wrapper.

### Issue: intelligence.db not created

**Cause:** ruvector-storage package missing or not imported.

**Fix:**
```bash
# Ensure package exists
ls packages/ruvector-storage/index.js

# Manually create and import
node -e "const {createStorage}=require('./packages/ruvector-storage');const s=createStorage();s.importFromJson();s.close()"
```

### Issue: SONA patterns not saving

**Check:** Is sona-fallback package present?
```bash
ls packages/sona-fallback/index.js
```

**Fix:** Copy from skill directory (Phase 8).

### Issue: Embeddings failing

**Fix:**
```bash
npm install @xenova/transformers
# First run downloads ~23MB model
```

---

## Environment Variables Reference

| Variable | Value | Purpose |
|----------|-------|---------|
| `RUVECTOR_SQLITE_PATH` | `.ruvector/intelligence.db` | SQLite database path |
| `RUVECTOR_MEMORY_BACKEND` | `sqlite` | Storage backend hint |
| `RUVECTOR_EMBEDDING_MODEL` | `all-MiniLM-L6-v2` | Embedding model |
| `RUVECTOR_EMBEDDING_DIM` | `384` | Vector dimensions |
| `RUVECTOR_SONA_ENABLED` | `true` | Enable SONA learning |
| `RUVECTOR_HNSW_ENABLED` | `true` | Enable HNSW indexing |

**Note:** The ruvector npm package ignores most of these. They're used by:
- `ruvector-storage` package (reads `RUVECTOR_SQLITE_PATH`)
- `sona-fallback` package (reads `RUVECTOR_SQLITE_PATH`)
- Setup scripts

---

## Key Difference from _clean_install_guide.md

| Aspect | _clean_install_guide | This guide (vanilla&db) |
|--------|---------------------|-------------------------|
| Symlinks | `.swarm` → `.ruvector` | None (default paths) |
| SSOT | Single unified directory | Separate directories |
| Databases | 1 (unified) | 2 (intelligence.db + memory.db) |
| Auto-sync | Manual import | Automatic (parallel) |
| Complexity | More setup | Simpler, but 2 databases |

---

## Next Steps After Installation

1. **Start Claude Code** in the project directory
2. **Make an edit** - verify hooks fire and sync works
3. **Check databases:**
   ```bash
   node -e "const D=require('better-sqlite3');console.log(new D('.ruvector/intelligence.db',{readonly:true}).prepare('SELECT COUNT(*) as c FROM memories').get())"
   ```
4. **Test SONA:**
   ```bash
   node -e "const {SonaEngine}=require('./packages/sona-fallback');const s=new SonaEngine(384);s.storePattern('test',new Float32Array(384),{});console.log(s.getStats())"
   ```
