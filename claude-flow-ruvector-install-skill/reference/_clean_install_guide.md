# Clean Install Guide - V3+RV Skill v0.9.7

**Version:** v0.9.7
**Created:** 2026-02-03
**Purpose:** Fresh install from scratch with proper sequence

---

## Prerequisites

### System Requirements

```bash
# Node.js 20+ required
node --version  # Must be v20.x or higher

# npm 9+ required
npm --version   # Must be v9.x or higher

# Git (for pretrain)
git --version
```

### Required Global Tools

```bash
# None required - everything via npx
```

---

## Phase 1: Environment Variables (SET FIRST!)

**CRITICAL: Set these BEFORE running ANY init command.**

Create `.env` in your project root:

```bash
# === CORE PATHS ===
RUVECTOR_SQLITE_PATH=".ruvector/intelligence.db"
RUVECTOR_DATA_DIR=".ruvector"
CLAUDE_FLOW_DATA_DIR=".ruvector"
CLAUDE_FLOW_MEMORY_PATH=".ruvector"

# === EMBEDDING CONFIG ===
RUVECTOR_EMBEDDING_MODEL="all-MiniLM-L6-v2"
RUVECTOR_EMBEDDING_DIM="384"
RUVECTOR_SEMANTIC_THRESHOLD="0.55"
RUVECTOR_ONNX_ENABLED="true"

# === LEARNING CONFIG ===
RUVECTOR_INTELLIGENCE_ENABLED="true"
RUVECTOR_LEARNING_ENABLED="true"
RUVECTOR_LEARNING_RATE="0.1"
RUVECTOR_MEMORY_BACKEND="sqlite"

# === SONA CONFIG ===
RUVECTOR_SONA_ENABLED="true"
RUVECTOR_HNSW_ENABLED="true"
RUVECTOR_Q_LEARNING_ALGORITHM="double-q"

# === HOOK CONFIG ===
RUVECTOR_HOOK_TIMEOUT="10000"
RUVECTOR_SEMANTIC_EMBEDDINGS="true"
RUVECTOR_PRETRAIN_DONE="false"

# === OPTIONAL: SONA MODULE OVERRIDE ===
# SONA_MODULE_PATH="./packages/sona-fallback"

# === OPTIONAL: API KEYS ===
# ANTHROPIC_API_KEY="sk-ant-..."
# HF_TOKEN="hf_..."  # Only for private HuggingFace models
```

Load the environment:

```bash
# Option 1: Source the file
set -a && source .env && set +a

# Option 2: Use dotenv in scripts
# Handled automatically by setup.sh
```

---

## Phase 2: Directory Structure (CREATE FIRST!)

```bash
# Create required directories
mkdir -p .ruvector
mkdir -p .claude
mkdir -p .claude-flow

# Verify
ls -la .ruvector .claude .claude-flow
```

---

## Phase 3: Claude-Flow Init (FIRST!)

**Order matters: claude-flow creates `.claude/settings.json` that ruvector modifies.**

```bash
# Initialize claude-flow with embeddings support
npx @claude-flow/cli@latest init --with-embeddings

# This creates:
# - .claude/settings.json (base hooks, permissions)
# - .claude-flow/config.yaml (runtime config)
# - claude-flow.config.json (schema config - currently ignored by CLI)
```

### Verify claude-flow init:

```bash
# Check files exist
test -f .claude/settings.json && echo "OK: settings.json"
test -f .claude-flow/config.yaml && echo "OK: config.yaml"

# Check MCP server works
npx @claude-flow/cli@latest status
```

---

## Phase 4: Add Environment Variables to settings.json

**CRITICAL: The `env` section in `.claude/settings.json` is the PRIMARY config location.**

```bash
# Add env vars to settings.json
cat .claude/settings.json | node -e "
const fs = require('fs');
let data = '';
process.stdin.on('data', chunk => data += chunk);
process.stdin.on('end', () => {
  const settings = JSON.parse(data);
  settings.env = {
    ...settings.env,
    'RUVECTOR_SQLITE_PATH': '.ruvector/intelligence.db',
    'RUVECTOR_DATA_DIR': '.ruvector',
    'CLAUDE_FLOW_DATA_DIR': '.ruvector',
    'CLAUDE_FLOW_MEMORY_PATH': '.ruvector',
    'RUVECTOR_EMBEDDING_MODEL': 'all-MiniLM-L6-v2',
    'RUVECTOR_EMBEDDING_DIM': '384',
    'RUVECTOR_SEMANTIC_THRESHOLD': '0.55',
    'RUVECTOR_INTELLIGENCE_ENABLED': 'true',
    'RUVECTOR_LEARNING_ENABLED': 'true',
    'RUVECTOR_LEARNING_RATE': '0.1',
    'RUVECTOR_MEMORY_BACKEND': 'sqlite',
    'RUVECTOR_SEMANTIC_EMBEDDINGS': 'true',
    'RUVECTOR_ONNX_ENABLED': 'true',
    'RUVECTOR_SONA_ENABLED': 'true',
    'RUVECTOR_HNSW_ENABLED': 'true',
    'RUVECTOR_Q_LEARNING_ALGORITHM': 'double-q',
    'RUVECTOR_HOOK_TIMEOUT': '10000',
    'RUVECTOR_PRETRAIN_DONE': 'false'
  };
  console.log(JSON.stringify(settings, null, 2));
});
" > .claude/settings.json.tmp && mv .claude/settings.json.tmp .claude/settings.json
```

### Verify env section:

```bash
grep -A 5 '"env"' .claude/settings.json
```

---

## Phase 5: Update .claude-flow/config.yaml

**Set paths to use unified .ruvector directory:**

```bash
cat > .claude-flow/config.yaml << 'EOF'
# Claude Flow V3 Runtime Configuration
version: "3.0.0"

swarm:
  topology: hierarchical-mesh
  maxAgents: 15
  autoScale: true
  coordinationStrategy: consensus

memory:
  backend: hybrid
  enableHNSW: true
  persistPath: .ruvector
  dbPath: .ruvector/intelligence.db
  cacheSize: 100

neural:
  enabled: true
  modelPath: .ruvector
  dbPath: .ruvector/intelligence.db

hooks:
  enabled: true
  autoExecute: true

mcp:
  autoStart: false
  port: 3000
EOF
```

---

## Phase 6: Install Dependencies

```bash
# Install better-sqlite3 (required for SSOT database)
npm install better-sqlite3

# Install ruvector (required for intelligence)
npm install ruvector

# Install ONNX embeddings (optional but recommended)
npm install @xenova/transformers onnxruntime-node

# Verify installations
node -e "require('better-sqlite3')" && echo "OK: better-sqlite3"
node -e "require('ruvector')" && echo "OK: ruvector"
```

---

## Phase 6b: RuVector Hooks Init (CRITICAL!)

**This merges ruvector hooks into settings.json. Do NOT use --pretrain yet!**

```bash
# Initialize ruvector hooks (NO --pretrain flag!)
npx ruvector hooks init --fast

# This:
# - Merges ruvector hooks into .claude/settings.json
# - Adds env vars for intelligence
# - Configures pre/post hooks for learning
# - Does NOT run pretrain (we do that later after setup.sh)
```

### Verify ruvector hooks:

```bash
# Check hooks were merged
grep -c "ruvector" .claude/settings.json
# Should show several matches
```

---

## Phase 7: Configure Memory Path

```bash
# Tell claude-flow to use .ruvector for memory
npx @claude-flow/cli@latest memory configure --path .ruvector

# Initialize memory database
npx @claude-flow/cli@latest memory init --force --verbose
```

---

## Phase 8: Create Symlinks (Database Unification)

**CRITICAL: Ensures all components use single .ruvector directory.**

```bash
# Backup existing .swarm if present
[ -d .swarm ] && [ ! -L .swarm ] && mv .swarm .swarm.bak

# Create symlink: .swarm -> .ruvector
ln -sf .ruvector .swarm

# Create symlink: .claude-flow/neural -> .ruvector
rm -rf .claude-flow/neural
ln -sf ../.ruvector .claude-flow/neural

# Verify symlinks
ls -la .swarm .claude-flow/neural
# Should show:
# .swarm -> .ruvector
# .claude-flow/neural -> ../.ruvector
```

---

## Phase 9: Update .gitignore

```bash
# Add required entries
cat >> .gitignore << 'EOF'

# V3+RV Skill
.ruvector/
.swarm/
.claude-flow/
*.db
*.db-journal
*.db-wal
node_modules/
EOF
```

---

## Phase 10: Copy Skill Files

```bash
# Set skill path (adjust to your installation)
SKILL_PATH="/path/to/howto_V3+RV_Skill/v0.9.7"

# Copy custom packages
mkdir -p packages
cp -r "$SKILL_PATH/packages/ruvector-storage" packages/
cp -r "$SKILL_PATH/packages/sona-fallback" packages/
cp -r "$SKILL_PATH/packages/sona-shim" packages/

# Copy assets
mkdir -p assets
cp "$SKILL_PATH/assets/embedding-gateway.js" assets/

# Copy scripts
mkdir -p scripts
cp "$SKILL_PATH/scripts/post-process.js" scripts/
cp "$SKILL_PATH/scripts/sync-neural-to-ssot.js" scripts/
```

---

## Phase 11: Run Skill Setup

```bash
# Run the skill setup script
bash "$SKILL_PATH/scripts/setup.sh"

# This will:
# - Increase hook timeouts
# - Add semantic embedding support
# - Create bridge scripts
# - Patch CLI if needed
```

---

## Phase 12: Pretrain (Bootstrap Intelligence - Creates JSON)

**NOTE: Pretrain creates `intelligence.json` (not SQLite directly). We convert in Phase 13.**

```bash
# IMPORTANT: Only after .gitignore is set up!
npx ruvector hooks pretrain --verbose

# This:
# - Creates .ruvector/intelligence.json (JSON format)
# - Scans git history for commits, files, patterns
# - Creates initial memories with embeddings
# - Bootstraps the learning system data
```

### Verify pretrain output:

```bash
# Check JSON was created
test -f .ruvector/intelligence.json && echo "OK: intelligence.json created"
ls -la .ruvector/intelligence.json
```

---

## Phase 13: Create SQLite Database & Import JSON (CRITICAL!)

**CRITICAL: This step converts `intelligence.json` to `intelligence.db` SQLite database with 13 tables.**

The ruvector npm package writes to JSON, but the skill uses SQLite for better performance.
We need to initialize the SQLite storage and import the JSON data.

```bash
# Create the SQLite database with schema and import JSON data
node -e "
const path = require('path');
const fs = require('fs');

// Load the storage adapter (creates DB with schema)
const storagePath = './packages/ruvector-storage';
if (!fs.existsSync(storagePath + '/index.js')) {
  console.error('ERROR: packages/ruvector-storage not found. Run Phase 10 first.');
  process.exit(1);
}

const { createStorage } = require(storagePath);
const dbPath = process.env.RUVECTOR_SQLITE_PATH || '.ruvector/intelligence.db';
console.log('Creating SQLite database at:', dbPath);

// Create storage (this creates the schema)
const storage = createStorage(dbPath);

// Import from JSON if it exists
const jsonPath = '.ruvector/intelligence.json';
if (fs.existsSync(jsonPath)) {
  console.log('Importing from intelligence.json...');
  const data = storage.importFromJson();
  if (data) {
    const memCount = (data.memories || []).length;
    const patCount = Object.keys(data.patterns || {}).length;
    const trajCount = (data.trajectories || []).length;
    console.log('  Imported:', memCount, 'memories,', patCount, 'patterns,', trajCount, 'trajectories');
  }
}

// Validate schema
if (storage.validateSchema()) {
  console.log('OK: Schema validated successfully');
} else {
  console.error('ERROR: Schema validation failed');
}

storage.close();
console.log('SQLite database created and initialized!');
"

# Verify database was created
echo ""
echo "=== Verifying SQLite database ==="
test -f .ruvector/intelligence.db && echo "OK: intelligence.db created" || echo "ERROR: intelligence.db NOT created"
ls -la .ruvector/intelligence.db 2>/dev/null

# List tables
node -e "
const Database = require('better-sqlite3');
const db = new Database('.ruvector/intelligence.db', { readonly: true });
const tables = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name\").all();
console.log('Tables in database:', tables.length);
tables.forEach(t => console.log('  -', t.name));
db.close();
" 2>/dev/null
```

### What Phase 13 creates:

| Table | Purpose |
|-------|---------|
| `memories` | Pretrain memories from git history |
| `patterns` | Q-learning state-action pairs |
| `trajectories` | Learning traces |
| `edges` | Semantic/temporal relationships |
| `neural_patterns` | SONA neural patterns |
| `file_sequences` | Edit prediction data |
| `agents` | Registered agents |
| `compressed_patterns` | SONA compressed storage |
| `kv_store` | Key-value storage |
| `stats` | Statistics |
| `errors` | Error patterns |
| `learning_data` | Learning algorithm data |

---

## Phase 14: Run Setup Again (Post-Pretrain)

```bash
# Re-run setup to re-embed pretrain memories with ONNX
bash "$SKILL_PATH/scripts/setup.sh"
```

---

## Phase 15: Train Neural Patterns

```bash
# Train SONA patterns
npx @claude-flow/cli@latest neural train --sona

# Sync to SSOT database
node scripts/sync-neural-to-ssot.js
```

---

## Phase 16: Verify Installation

```bash
# Run validation script
bash "$SKILL_PATH/scripts/validate-setup.sh"

# Manual checks:
echo "=== Checking files ==="
test -f .claude/settings.json && echo "OK: settings.json"
test -f .claude-flow/config.yaml && echo "OK: config.yaml"
test -f .ruvector/intelligence.db && echo "OK: intelligence.db"
test -L .swarm && echo "OK: .swarm symlink"
test -L .claude-flow/neural && echo "OK: neural symlink"

echo "=== Checking env vars in settings.json ==="
grep RUVECTOR_SQLITE_PATH .claude/settings.json && echo "OK: env vars set"

echo "=== Checking database ==="
sqlite3 .ruvector/intelligence.db "SELECT COUNT(*) FROM memories;" 2>/dev/null && echo "OK: memories table"

echo "=== Checking patterns ==="
ls -la .ruvector/patterns.json 2>/dev/null && echo "OK: patterns.json (via symlink)"
```

---

## Complete Initialization Sequence (Quick Reference)

```bash
# === FULL SEQUENCE ===

# 1. Set environment variables
set -a && source .env && set +a

# 2. Create directories
mkdir -p .ruvector .claude .claude-flow

# 3. Init claude-flow (creates settings.json)
npx @claude-flow/cli@latest init --with-embeddings

# 4. Add env vars to settings.json (see Phase 4)

# 5. Update config.yaml (see Phase 5)

# 6. Install deps
npm install better-sqlite3 ruvector

# 6b. Init ruvector hooks (merges hooks, NO --pretrain!)
npx ruvector hooks init --fast

# 7. Configure memory path
npx @claude-flow/cli@latest memory configure --path .ruvector

# 8. Create symlinks
ln -sf .ruvector .swarm
ln -sf ../.ruvector .claude-flow/neural

# 9. Update .gitignore (BEFORE pretrain!)

# 10. Copy skill files

# 11. Run setup.sh (pre-pretrain configuration)

# 12. Pretrain (creates intelligence.json)
npx ruvector hooks pretrain --verbose

# 13. Create SQLite DB and import JSON (CRITICAL!)
node -e "const {createStorage}=require('./packages/ruvector-storage');const s=createStorage();s.importFromJson();s.close();console.log('SQLite DB created')"

# 14. Run setup.sh again (re-embed with ONNX)
bash "$SKILL_PATH/scripts/setup.sh"

# 15. Train neural
npx @claude-flow/cli@latest neural train --sona
node scripts/sync-neural-to-ssot.js

# 16. Validate
bash scripts/validate-setup.sh
```

---

## Troubleshooting

### Issue: "init --force wiped my settings"

**Cause:** `init --force` overwrites `.claude/settings.json`

**Prevention:** Never use `--force` after customizing, or backup first:
```bash
cp .claude/settings.json .claude/settings.json.bak
```

### Issue: Memory uses .swarm instead of .ruvector

**Cause:** Hardcoded paths in claude-flow CLI

**Fix:** Create symlink:
```bash
ln -sf .ruvector .swarm
```

### Issue: Neural patterns not in SSOT

**Cause:** Hardcoded path in neural.js

**Fix:** Create symlink + sync:
```bash
ln -sf ../.ruvector .claude-flow/neural
node scripts/sync-neural-to-ssot.js
```

### Issue: Embeddings failing

**Cause:** ONNX not installed or model not downloaded

**Fix:**
```bash
npm install @xenova/transformers onnxruntime-node
# First embedding call downloads ~23MB model
```

### Issue: Pretrain creates JSON not SQLite (intelligence.json only)

**Cause:** The `ruvector` npm package is hardcoded to write `intelligence.json`

**Fix:** After pretrain, create SQLite and import:
```bash
node -e "const {createStorage}=require('./packages/ruvector-storage');const s=createStorage();s.importFromJson();s.close();console.log('SQLite DB created')"
```

This is now **Phase 13** in the guide. The `ruvector-storage` package:
1. Creates `intelligence.db` with 13-table schema
2. Imports data from `intelligence.json`
3. Keeps them in sync via `importFromJson()`/`writeJsonMirror()`

### Issue: learning-service.mjs uses different database

**Cause:** Hardcoded path `.claude-flow/learning/patterns.db`

**Fix:** This is a known issue. Use sync scripts to consolidate:
```bash
node scripts/sync-neural-to-ssot.js
```

---

## Environment Variables Reference

### Required

| Variable | Value | Purpose |
|----------|-------|---------|
| `RUVECTOR_SQLITE_PATH` | `.ruvector/intelligence.db` | SSOT database path |
| `RUVECTOR_DATA_DIR` | `.ruvector` | Data directory |
| `CLAUDE_FLOW_DATA_DIR` | `.ruvector` | Claude-flow data (should match) |

### Recommended

| Variable | Value | Purpose |
|----------|-------|---------|
| `RUVECTOR_EMBEDDING_MODEL` | `all-MiniLM-L6-v2` | Embedding model |
| `RUVECTOR_EMBEDDING_DIM` | `384` | Embedding dimension |
| `RUVECTOR_SEMANTIC_THRESHOLD` | `0.55` | Similarity threshold |
| `RUVECTOR_SONA_ENABLED` | `true` | Enable SONA learning |
| `RUVECTOR_HNSW_ENABLED` | `true` | Enable HNSW indexing |

### Optional

| Variable | Value | Purpose |
|----------|-------|---------|
| `SONA_MODULE_PATH` | `./packages/sona-fallback` | Force JS fallback |
| `RUVECTOR_VERBOSE` | `true` | Debug output |
| `HF_TOKEN` | `hf_...` | HuggingFace token (private models) |

---

## Files Created by This Guide

| File/Directory | Purpose | Created By |
|----------------|---------|------------|
| `.env` | Environment variables | Manual (Phase 1) |
| `.ruvector/` | SSOT data directory | Manual (Phase 2) |
| `.claude/settings.json` | Hooks, env, permissions | claude-flow init (Phase 3) |
| `.claude-flow/config.yaml` | Runtime config | claude-flow init (Phase 3) |
| `.swarm` → `.ruvector` | Symlink | Manual (Phase 8) |
| `.claude-flow/neural` → `.ruvector` | Symlink | Manual (Phase 8) |
| `.ruvector/memory.db` | Claude-flow memory database | memory init (Phase 7) |
| `.ruvector/intelligence.json` | RuVector pretrain data (JSON) | pretrain (Phase 12) |
| `.ruvector/intelligence.db` | RuVector SSOT database (SQLite) | import script (Phase 13) |
| `.ruvector/patterns.json` | Neural patterns | neural train (Phase 15) |

### Note: Three Data Files

The system creates THREE main data files:

| File | Created By | Contains | Format |
|------|-----------|----------|--------|
| `memory.db` | `claude-flow memory init` | Agent memories, sessions | SQLite |
| `intelligence.json` | `ruvector hooks pretrain` | Pretrain data (git history) | JSON |
| `intelligence.db` | `ruvector-storage` adapter | Same data as JSON + schema | SQLite |

The `ruvector` npm package writes to JSON (hardcoded). The custom `ruvector-storage` adapter creates SQLite with 13 tables and imports from JSON. Both files are kept in sync:
- JSON → SQLite: `storage.importFromJson()`
- SQLite → JSON: `storage.writeJsonMirror(data)`

Both are stored in `.ruvector/` thanks to the symlinks.

---

## Next Steps After Installation

1. **Start Claude Code** in the project directory
2. **Verify hooks are working:** Make an edit, check for hook output
3. **Test memory:** `npx @claude-flow/cli@latest memory search --query "test"`
4. **Monitor learning:** Check `.ruvector/intelligence.db` for new entries
