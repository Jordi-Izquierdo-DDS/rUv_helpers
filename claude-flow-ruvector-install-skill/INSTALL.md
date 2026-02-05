# V3+RV Skill Installation Guide

**Version:** v0.9.9
**Updated:** 2026-02-04
**Tested With:** claude-flow v3.1.0-alpha.2, ruvector v0.1.96, Node.js v20+

---

## Executive Summary

This guide installs Claude-Flow V3 with RuVector intelligence integration. The installation follows a precise 15-phase sequence designed to ensure:

1. **Correct embedding dimensions** (384d ONNX, not 64d hash fallback)
2. **Populated learning pipeline** (neural_patterns, edges, agents tables)
3. **Functional SONA integration** (pattern storage, trajectory replay)
4. **SQLite as the single source of truth** (with JSON auto-sync for compatibility)

**Critical Ordering Constraint:** Phase 8 (setup.sh) MUST execute BEFORE Phase 9 (pretrain). Reversing this order produces 64-dimensional hash embeddings that are invisible to semantic search.

---

## Prerequisites

### Required Software

```bash
# Verify Node.js >= 20
node --version
# Expected: v20.x or higher

# Verify npm >= 9
npm --version
# Expected: v9.x or higher

# Verify Git
git --version
# Expected: git version 2.x or higher
```

### Required API Keys

```bash
# For claude-flow agent operations
export ANTHROPIC_API_KEY="sk-ant-..."
```

### Platform Build Tools

```bash
# Linux (Debian/Ubuntu)
sudo apt-get install build-essential pkg-config libssl-dev

# macOS
xcode-select --install

# Windows
# Install Visual Studio Build Tools with C++ workload
```

---

## Phase 1: Create Project and Initialize Git

**Purpose:** Establish project structure and git history (required for pretrain phase).

```bash
# Create and enter project directory
mkdir my-project && cd my-project

# Initialize npm package
npm init -y

# Initialize git repository
git init

# Configure git identity (if not already set globally)
git config user.email "you@example.com"
git config user.name "Your Name"

# Create initial files for git history
echo "# My Project" > README.md
git add README.md
git commit -m "Initial commit"
```

**Verification:**

```bash
# Confirm git is initialized
test -d .git && echo "OK: Git initialized" || echo "FAIL: No .git directory"

# Confirm at least one commit exists
git rev-parse HEAD >/dev/null 2>&1 && echo "OK: Git has commits" || echo "FAIL: No commits"
```

**Expected Output:**
```
OK: Git initialized
OK: Git has commits
```

---

## Phase 2: Create Environment Configuration

**Purpose:** Set environment variables that control embedding model, storage backend, and learning parameters. These must be set BEFORE any ruvector or claude-flow commands.

```bash
cat > .env << 'EOF'
# ============================================================================
# V3+RV Skill Environment Configuration v0.9.9
# ============================================================================

# === SQLite Backend Configuration ===
# The ruvector npm package writes JSON by default. These vars configure the
# skill's custom storage adapter to use SQLite as the primary store.
RUVECTOR_MEMORY_BACKEND=sqlite
RUVECTOR_SQLITE_PATH=.ruvector/intelligence.db

# === Embedding Configuration ===
# CRITICAL: These MUST be set BEFORE pretrain runs.
# Without them, embeddings use 64d hash fallback instead of 384d ONNX.
RUVECTOR_EMBEDDING_MODEL=all-MiniLM-L6-v2
RUVECTOR_EMBEDDING_DIM=384
RUVECTOR_SEMANTIC_THRESHOLD=0.55
RUVECTOR_ONNX_ENABLED=true
RUVECTOR_SEMANTIC_EMBEDDINGS=true

# === Learning Configuration ===
RUVECTOR_INTELLIGENCE_ENABLED=true
RUVECTOR_LEARNING_ENABLED=true
RUVECTOR_LEARNING_RATE=0.1
RUVECTOR_Q_LEARNING_ALGORITHM=double-q

# === SONA Configuration ===
RUVECTOR_SONA_ENABLED=true
RUVECTOR_HNSW_ENABLED=true
RUVECTOR_ATTENTION_ENABLED=true
RUVECTOR_DREAM_CYCLE_ENABLED=true

# === Hook Configuration ===
RUVECTOR_HOOK_TIMEOUT=10000
RUVECTOR_PRETRAIN_DONE=false

# === Debug (optional) ===
# RUVECTOR_VERBOSE=true
EOF

# Load environment variables into current shell
set -a && source .env && set +a
```

**Verification:**

```bash
# Confirm critical embedding vars are set
echo "RUVECTOR_EMBEDDING_DIM=$RUVECTOR_EMBEDDING_DIM"
echo "RUVECTOR_EMBEDDING_MODEL=$RUVECTOR_EMBEDDING_MODEL"
echo "RUVECTOR_SEMANTIC_EMBEDDINGS=$RUVECTOR_SEMANTIC_EMBEDDINGS"
```

**Expected Output:**
```
RUVECTOR_EMBEDDING_DIM=384
RUVECTOR_EMBEDDING_MODEL=all-MiniLM-L6-v2
RUVECTOR_SEMANTIC_EMBEDDINGS=true
```

**Rationale:** Without `RUVECTOR_SEMANTIC_EMBEDDINGS=true`, the ruvector CLI falls back to a 64-dimensional hash function. These hash embeddings have no semantic meaning and produce zero results from similarity search.

---

## Phase 3: Install Dependencies

**Purpose:** Install npm packages required for the skill.

```bash
# Core dependencies
npm install ruvector@latest claude-flow@latest

# SQLite storage (required for intelligence.db)
npm install better-sqlite3

# Optional: ONNX runtime for embeddings (recommended)
npm install @xenova/transformers
```

**Verification:**

```bash
# Confirm installations
node -e "require('better-sqlite3'); console.log('OK: better-sqlite3')"
node -e "require('ruvector'); console.log('OK: ruvector')"
npx --version && echo "OK: npx available"
```

**Expected Output:**
```
OK: better-sqlite3
OK: ruvector
10.x.x
OK: npx available
```

**Troubleshooting:**
- If `better-sqlite3` fails to compile, ensure platform build tools are installed (see Prerequisites)
- On Alpine Linux, use glibc-based images (better-sqlite3 requires glibc)

---

## Phase 4: Initialize Claude-Flow

**Purpose:** Create settings.json, memory database, and claude-flow configuration.

```bash
npx claude-flow init --full --start-all --with-embeddings
```

**Verification:**

```bash
test -f .claude/settings.json && echo "OK: settings.json created" || echo "FAIL: No settings.json"
test -d .claude-flow && echo "OK: .claude-flow directory created" || echo "FAIL: No .claude-flow"
```

**Expected Output:**
```
OK: settings.json created
OK: .claude-flow directory created
```

**Note:** Use `npx claude-flow` (local), not `npx @claude-flow/cli@latest`. The `@latest` tag can hit semver resolution bugs with peer dependencies.

---

## Phase 5: Initialize Claude-Flow Memory

**Purpose:** Create the memory.db SQLite database used by claude-flow for agent state.

```bash
npx claude-flow memory init --force --verbose
```

**Verification:**

```bash
test -f .swarm/memory.db && echo "OK: memory.db created ($(ls -lh .swarm/memory.db | awk '{print $5}'))" || echo "FAIL: No memory.db"
```

**Expected Output:**
```
OK: memory.db created (32K)
```

---

## Phase 6: Initialize RuVector Hooks

**Purpose:** Merge ruvector hooks into settings.json. Creates .ruvector directory and hook bridge script.

**CRITICAL: Do NOT add `--pretrain` flag here. Pretrain must run AFTER setup.sh (Phase 9).**

```bash
npx ruvector hooks init --fast --build-agents quality
```

**Verification:**

```bash
test -d .ruvector && echo "OK: .ruvector directory created" || echo "FAIL: No .ruvector"
test -f .claude/ruvector-fast.sh && echo "OK: Fast wrapper created" || echo "FAIL: No fast wrapper"
npx ruvector hooks verify --verbose 2>/dev/null && echo "OK: Hooks verify passes" || echo "WARN: Hooks verify has issues"
```

**Expected Output:**
```
OK: .ruvector directory created
OK: Fast wrapper created
OK: Hooks verify passes
```

**Why No `--pretrain`:** Running pretrain at this point would create memories with 64d hash embeddings (or NULL embeddings) because the ONNX pipeline is not yet configured. Phase 8 (setup.sh) configures the embedding pipeline correctly.

---

## Phase 7: Copy Skill Packages

**Purpose:** Deploy the skill's custom packages (ruvector-storage, sona-fallback, sona-shim) which provide SQLite storage and SONA fallback support.

```bash
# Set skill path (adjust to your installation)
# Example paths:
#   ~/.claude-code/skills/howto_V3+RV_Skill/v0.9.9
#   /path/to/CFV3/howto_V3+RV_Skill/v0.9.9
SKILL_PATH="/mnt/data/dev/CFV3/howto_V3+RV_Skill/v0.9.9"

# Create package directories
mkdir -p packages scripts fixes/ruvector assets

# Copy packages
cp -r "$SKILL_PATH/packages/ruvector-storage" packages/
cp -r "$SKILL_PATH/packages/sona-fallback" packages/
cp -r "$SKILL_PATH/packages/sona-shim" packages/

# Copy scripts
cp "$SKILL_PATH/scripts/setup.sh" scripts/
cp "$SKILL_PATH/scripts/validate-setup.sh" scripts/
cp "$SKILL_PATH/scripts/diagnose-db.sh" scripts/
cp "$SKILL_PATH/scripts/post-process.js" scripts/
cp "$SKILL_PATH/scripts/sona-consolidate.js" scripts/
cp "$SKILL_PATH/scripts/ruvector-hook-bridge.sh" scripts/
cp "$SKILL_PATH/scripts/memory-sync.sh" scripts/ 2>/dev/null || true

# Copy fixes
cp "$SKILL_PATH/fixes/ruvector/patch-cli.js" fixes/ruvector/
cp "$SKILL_PATH/fixes/ruvector/patch-engine.js" fixes/ruvector/ 2>/dev/null || true

# Copy assets
cp "$SKILL_PATH/assets/embedding-gateway.js" assets/ 2>/dev/null || true

# Fix potential Windows line endings in scripts (cross-platform compatibility)
find scripts -name "*.sh" -exec sed -i 's/\r$//' {} \; 2>/dev/null || true

# Also fix bridge script line endings (critical for session-end to work)
sed -i 's/\r$//' .claude/ruvector-hook-bridge.sh 2>/dev/null || true
```

**Verification:**

```bash
test -f packages/ruvector-storage/index.js && echo "OK: ruvector-storage" || echo "FAIL: Missing ruvector-storage"
test -f packages/sona-fallback/index.js && echo "OK: sona-fallback" || echo "FAIL: Missing sona-fallback"
test -f scripts/setup.sh && echo "OK: setup.sh" || echo "FAIL: Missing setup.sh"
test -f scripts/post-process.js && echo "OK: post-process.js" || echo "FAIL: Missing post-process.js"
test -f scripts/sona-consolidate.js && echo "OK: sona-consolidate.js" || echo "FAIL: Missing sona-consolidate.js"
test -f scripts/ruvector-hook-bridge.sh && echo "OK: ruvector-hook-bridge.sh" || echo "FAIL: Missing ruvector-hook-bridge.sh"
test -f fixes/ruvector/patch-cli.js && echo "OK: patch-cli.js" || echo "FAIL: Missing patch-cli.js"
```

**Expected Output:**
```
OK: ruvector-storage
OK: sona-fallback
OK: setup.sh
OK: post-process.js
OK: patch-cli.js
```

---

## Phase 8: Run setup.sh (Pre-Pretrain Configuration)

**Purpose:** Configure the embedding pipeline, apply upstream patches, set hook timeouts, and create the hook bridge. This phase MUST complete BEFORE pretrain.

**This is the most critical phase. Without it, the entire learning pipeline is broken.**

```bash
bash scripts/setup.sh all-MiniLM-L6-v2 384
```

**What setup.sh Does:**

1. **GITIGNORE**: Adds node_modules/, .ruvector/, .swarm/, *.db to .gitignore (prevents 95k-file pretrain hang)
2. **ENV VARS**: Sets RUVECTOR_SEMANTIC_EMBEDDINGS=true and 12 other learning env vars
3. **TIMEOUTS**: Increases hook timeouts from 300ms to 5000-10000ms (ONNX needs time)
4. **SEMANTIC FLAG**: Adds --semantic to all remember hooks
5. **BRIDGE**: Creates .claude/ruvector-hook-bridge.sh for stdin JSON parsing
6. **SCHEMA**: Extends database schema (compressed_patterns table, neural_patterns.embedding column)
7. **PATCHES**: Applies patch-cli.js (7 upstream fixes) and patch-engine.js (optional)
8. **CONSOLIDATE**: Populates learning pipeline tables (FIX-024)

**Verification:**

```bash
# Check env vars in settings.json
node -e '
var s = JSON.parse(require("fs").readFileSync(".claude/settings.json"));
console.log("SEMANTIC_EMBEDDINGS:", s.env.RUVECTOR_SEMANTIC_EMBEDDINGS);
console.log("EMBEDDING_DIM:", s.env.RUVECTOR_EMBEDDING_DIM);
console.log("HOOK_TIMEOUT:", s.env.RUVECTOR_HOOK_TIMEOUT);
'

# Check bridge exists
test -x .claude/ruvector-hook-bridge.sh && echo "OK: Bridge executable" || echo "FAIL: No bridge"

# Check patch applied
grep -q "__PATCH_CLI_V098__\|__PATCH_CLI_V097__" node_modules/ruvector/bin/cli.js 2>/dev/null && echo "OK: CLI patched" || echo "WARN: CLI not patched (may be using npx)"
```

**Expected Output:**
```
SEMANTIC_EMBEDDINGS: true
EMBEDDING_DIM: 384
HOOK_TIMEOUT: 10000
OK: Bridge executable
OK: CLI patched
```

**Rationale for Phase 8 Before Phase 9:**
- The ruvector `pretrain` command reads codebase files and creates memories
- Without `RUVECTOR_SEMANTIC_EMBEDDINGS=true`, it uses the 64d hash fallback
- setup.sh sets this env var and creates the ONNX embedding pipeline
- Running pretrain AFTER setup.sh ensures memories have correct 384d embeddings

---

## Phase 9: Run Pretrain (With Correct Embeddings)

**Purpose:** Bootstrap intelligence from git history and codebase. Now that setup.sh has configured the embedding pipeline, memories will have correct 384d ONNX embeddings.

```bash
npx ruvector hooks pretrain --verbose
```

**Verification:**

```bash
# Check memories were created with correct dimension
if [ -f ".ruvector/intelligence.db" ]; then
  node -e '
  var D = require("better-sqlite3");
  var db = new D(".ruvector/intelligence.db", {readonly:true});
  var total = db.prepare("SELECT COUNT(*) as c FROM memories").get().c;
  var correct = db.prepare("SELECT COUNT(*) as c FROM memories WHERE embedding IS NOT NULL AND length(embedding) = 1536").get().c;
  var wrong = db.prepare("SELECT COUNT(*) as c FROM memories WHERE embedding IS NOT NULL AND length(embedding) != 1536").get().c;
  var nullEmb = db.prepare("SELECT COUNT(*) as c FROM memories WHERE embedding IS NULL").get().c;
  console.log("Total memories:", total);
  console.log("Correct 384d:", correct, "(expected: all)");
  console.log("Wrong dimension:", wrong, "(expected: 0)");
  console.log("NULL embeddings:", nullEmb, "(expected: 0)");
  db.close();
  '
elif [ -f ".ruvector/intelligence.json" ]; then
  node -e '
  var d = JSON.parse(require("fs").readFileSync(".ruvector/intelligence.json"));
  var mems = d.memories || [];
  var correct = mems.filter(m => m.embedding && m.embedding.length === 384).length;
  var wrong = mems.filter(m => m.embedding && m.embedding.length !== 384).length;
  var nullEmb = mems.filter(m => !m.embedding).length;
  console.log("Total memories:", mems.length);
  console.log("Correct 384d:", correct, "(expected: all)");
  console.log("Wrong dimension:", wrong, "(expected: 0)");
  console.log("NULL embeddings:", nullEmb, "(expected: 0)");
  '
fi
```

**Expected Output:**
```
Total memories: 50-200 (varies by codebase)
Correct 384d: 50-200 (expected: all)
Wrong dimension: 0 (expected: 0)
NULL embeddings: 0 (expected: 0)
```

**Troubleshooting:**
- If all embeddings are NULL or 64d: Phase 8 (setup.sh) was skipped or failed
- Run `bash scripts/setup.sh all-MiniLM-L6-v2 384` to fix, then re-pretrain

---

## Phase 10: Create SQLite Database and Import JSON

**Purpose:** The ruvector npm package writes JSON format by default. This phase creates the SQLite database and imports pretrain data.

```bash
node << 'NODESCRIPT'
const { createStorage } = require('./packages/ruvector-storage');
const fs = require('fs');

console.log('Creating SQLite database...');
const storage = createStorage('.ruvector/intelligence.db');

// Import pretrain data from JSON if it exists
if (fs.existsSync('.ruvector/intelligence.json')) {
  console.log('Importing from intelligence.json...');
  const data = storage.importFromJson();
  if (data) {
    console.log('  Memories:', (data.memories || []).length);
    console.log('  Patterns:', Object.keys(data.patterns || {}).length);
    console.log('  Trajectories:', (data.trajectories || []).length);
  }
}

// Validate schema
if (storage.validateSchema()) {
  console.log('Schema validated: OK');
}

storage.close();
console.log('SQLite database created and populated!');
NODESCRIPT
```

**Verification:**

```bash
test -f .ruvector/intelligence.db && echo "OK: intelligence.db exists ($(ls -lh .ruvector/intelligence.db | awk '{print $5}'))" || echo "FAIL: No intelligence.db"

# Check table counts
node -e '
var D = require("better-sqlite3");
var db = new D(".ruvector/intelligence.db", {readonly:true});
var tables = ["memories", "patterns", "trajectories", "neural_patterns", "edges", "agents"];
tables.forEach(t => {
  try {
    var c = db.prepare("SELECT COUNT(*) as c FROM " + t).get().c;
    console.log(t + ":", c);
  } catch(e) { console.log(t + ": table missing"); }
});
db.close();
'
```

**Expected Output:**
```
OK: intelligence.db exists (128K-512K depending on pretrain)
memories: 50-200
patterns: 5-20
trajectories: 10-50
neural_patterns: 0 (populated in Phase 12)
edges: 0 (populated in Phase 12)
agents: 0 (populated in Phase 12)
```

---

## Phase 11: Patch ruvector-fast.sh for Auto-Sync

**Purpose:** Modify the hook wrapper to auto-sync JSON to SQLite after every hook call. This ensures both stores stay synchronized without manual intervention.

```bash
cat > .claude/ruvector-fast.sh << 'WRAPPER_EOF'
#!/bin/bash
# Fast RuVector hooks wrapper with AUTO-SYNC to SQLite
# v0.9.8 - Parallel sync (zero latency)

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

**Verification:**

```bash
grep -q "importFromJson" .claude/ruvector-fast.sh && echo "OK: Auto-sync patched" || echo "FAIL: Auto-sync not patched"
```

**Expected Output:**
```
Patched ruvector-fast.sh with auto-sync
OK: Auto-sync patched
```

---

## Phase 12: Run Consolidate + SONA (Populate Learning Pipeline)

**Purpose:** Backfill neural_patterns, edges, and agents tables from existing memories and trajectories. This phase includes FIX-024 through FIX-031 - the complete SONA pipeline fix.

```bash
# Register setup agent
node scripts/post-process.js --event session-start --agent-name setup-agent

# Run consolidation (populates neural_patterns, edges, stats)
node scripts/post-process.js --event consolidate

# Run SONA consolidate (FIX-030: bridges neural_patterns → compressed_patterns)
node scripts/sona-consolidate.js --verbose 2>/dev/null || echo "SONA consolidate skipped (will run on first session-end)"
```

**Verification:**

```bash
node -e '
var D = require("better-sqlite3");
var db = new D(".ruvector/intelligence.db", {readonly:true});
console.log("neural_patterns:", db.prepare("SELECT COUNT(*) as c FROM neural_patterns").get().c);
console.log("edges:", db.prepare("SELECT COUNT(*) as c FROM edges").get().c);
console.log("agents:", db.prepare("SELECT COUNT(*) as c FROM agents").get().c);

// Check for semantic edges specifically
try {
  var sem = db.prepare("SELECT COUNT(*) as c FROM edges WHERE data LIKE \"%semantic%\"").get().c;
  console.log("semantic edges:", sem);
} catch(e) {}

db.close();
'
```

**Expected Output:**
```
post-process.js v0.9.8 [session-start]: 1 entities created
post-process.js v0.9.8 [consolidate]: N entities created
neural_patterns: 5-30 (varies by codebase)
edges: 10-100 (varies by memory count)
agents: 1 (setup-agent)
semantic edges: 0-50 (depends on memory similarity)
```

**Rationale for Phase 12:**
- The ruvector CLI populates memories and trajectories during pretrain and hooks
- But neural_patterns, edges, and agents tables have no write paths in stock ruvector
- post-process.js extracts patterns from memories and creates edges between related entities
- Without this phase, the learning pipeline appears functional but these tables stay empty

---

## Phase 13: Verify Installation

**Purpose:** Comprehensive validation of all installation phases.

```bash
bash scripts/validate-setup.sh
```

**Expected Output:**

```
=== Deep Setup Validation v0.9.8 (date) ===

--- Level 1: Packages ---
  Node.js >= 20: OK - v20.x.x
  claude-flow: OK - 3.1.0-alpha.x
  ruvector CLI: OK - 0.1.96
  ruvector doctor: OK - all system checks passed

--- Level 2: Configuration ---
  settings.json: OK - exists
  SEMANTIC_EMBEDDINGS=true: OK - 384d ONNX (all-MiniLM-L6-v2)
  EMBEDDING_MODEL: OK - all-MiniLM-L6-v2
  Remember hooks --semantic: OK - present in bridge script
  Hook timeouts: OK - all embedding hooks >= 5000ms

--- Level 3: Memory Pipeline ---
  Intelligence store: OK - intelligence.db 256K (SQLite)
  Embedding quality: OK - 73/73 at 384d ONNX
  memory.db (claude-flow): OK - 32K

--- Level 4: Learning Pipeline ---
  Q-learning state: OK - N Q-entries, 1 algo(s)
  Pretrain completed: OK - yes (kv_store)
  PreToolUse hook timeouts: OK - 5000ms

--- Level 7: Upstream Patches ---
  CLI consolidated patch: OK - all cli patches applied
  Semantic edges: OK - N semantic edge(s) found
  Neural pattern embeddings: OK - N/N
  compressed_patterns table: OK - exists

--- Level 8: Learning Pipeline ---
  post-process.js exists: OK - scripts/post-process.js
  neural_patterns populated: OK - N neural patterns
  edges populated: OK - N edges
  agents registered: OK - 1 agent(s)
  trajectory reward variance: OK - N distinct values (FIX-023 active)

=== Validation Complete: N passed, 0 warnings, 0 failures ===
All checks passed.
```

**If Validation Fails:**

| Failure | Cause | Fix |
|---------|-------|-----|
| Level 2: SEMANTIC_EMBEDDINGS | Phase 8 skipped | `bash scripts/setup.sh all-MiniLM-L6-v2 384` |
| Level 3: Wrong embeddings | Pretrain before setup.sh | Re-run Phase 8, then Phase 9 |
| Level 7: CLI not patched | patch-cli.js failed | Check fixes/ruvector/patch-cli.js exists |
| Level 8: Empty tables | Phase 12 skipped | `node scripts/post-process.js --event consolidate` |

---

## Phase 14: MCP Server Registration

**Purpose:** Register MCP servers for tool integration with Claude Code.

```bash
# Try claude CLI first (requires Claude Code CLI installed)
claude mcp add claude-flow -- npx -y @claude-flow/cli@latest 2>/dev/null && \
claude mcp add ruvector -- npx -y ruvector mcp start 2>/dev/null || {
  # Fallback: Create .claude.json manually if claude CLI unavailable
  echo "Claude CLI not available, creating .claude.json manually..."
  cat > .claude.json << 'MCPEOF'
{
  "mcpServers": {
    "claude-flow": {
      "command": "npx",
      "args": ["-y", "@claude-flow/cli@latest"]
    },
    "ruvector": {
      "command": "npx",
      "args": ["-y", "ruvector", "mcp", "start"]
    }
  }
}
MCPEOF
  echo "Created .claude.json with MCP server configuration"
}

# Verify MCP registration
npx ruvector mcp info 2>/dev/null || echo "MCP info check complete"
```

**Note:** The `claude mcp add` command requires Claude Code CLI. When running as an automated agent or in environments without Claude CLI, the fallback creates `.claude.json` directly.

**Verification:**

```bash
test -f .claude.json && grep -q "claude-flow" .claude.json && echo "OK: MCP registered in project" || \
test -f ~/.claude.json && grep -q "claude-flow" ~/.claude.json && echo "OK: MCP registered globally" || \
echo "WARN: MCP config not found - may need manual setup"
```

**Expected Output:**
```
OK: MCP registered in project
```

---

## Phase 15: Daemon Start & Final Validation

**Purpose:** Start the claude-flow daemon for background workers and run comprehensive validation.

```bash
# Start claude-flow daemon for background workers
npx claude-flow daemon start

# Run claude-flow doctor
npx claude-flow doctor --fix

# Final comprehensive validation
bash scripts/validate-setup.sh
bash scripts/diagnose-db.sh
```

**Verification:**

```bash
npx claude-flow daemon status && echo "OK: Daemon running" || echo "FAIL: Daemon not running"
```

**Expected Output:**
```
Daemon Status: running
OK: Daemon running
```

---

## Quick Reference: Complete Command Sequence

For experienced users who want the minimal command sequence:

```bash
# Phase 1: Project
mkdir my-project && cd my-project && npm init -y && git init
git config user.email "you@example.com" && git config user.name "Your Name"
echo "# Project" > README.md && git add . && git commit -m "Initial"

# Phase 2: .env (see full guide for content)
# Phase 3: Dependencies
npm install ruvector claude-flow better-sqlite3 @xenova/transformers

# Phase 4-5: Claude-Flow
npx claude-flow init --full --start-all --with-embeddings
npx claude-flow memory init --force

# Phase 6: RuVector hooks (NO --pretrain)
npx ruvector hooks init --fast --build-agents quality

# Phase 7: Copy packages (adjust SKILL_PATH)
SKILL_PATH="/path/to/v0.9.9"
cp -r "$SKILL_PATH/packages/ruvector-storage" packages/
cp -r "$SKILL_PATH/packages/sona-fallback" packages/
cp "$SKILL_PATH/scripts/"*.sh scripts/
cp "$SKILL_PATH/scripts/post-process.js" scripts/
cp "$SKILL_PATH/fixes/ruvector/patch-cli.js" fixes/ruvector/
find scripts -name "*.sh" -exec sed -i 's/\r$//' {} \; 2>/dev/null || true

# Phase 8: setup.sh BEFORE pretrain
bash scripts/setup.sh all-MiniLM-L6-v2 384

# Phase 9: Pretrain (now with correct embeddings)
npx ruvector hooks pretrain --verbose

# Phase 10: SQLite
node -e "require('./packages/ruvector-storage').createStorage().importFromJson()"

# Phase 11: Patch wrapper (see full guide)
# Phase 12: Consolidate
node scripts/post-process.js --event consolidate

# Phase 13: Verify
bash scripts/validate-setup.sh

# Phase 14: MCP Server Registration (with fallback)
claude mcp add claude-flow -- npx -y @claude-flow/cli@latest 2>/dev/null && \
claude mcp add ruvector -- npx -y ruvector mcp start 2>/dev/null || \
echo '{"mcpServers":{"claude-flow":{"command":"npx","args":["-y","@claude-flow/cli@latest"]},"ruvector":{"command":"npx","args":["-y","ruvector","mcp","start"]}}}' > .claude.json

# Phase 15: Daemon + Final Validation
npx claude-flow daemon start
npx claude-flow doctor --fix 2>/dev/null || true
```

---

## Appendix A: Why Phase Order Matters

The installation sequence is designed around a critical constraint: the ruvector CLI's embedding behavior depends on environment variables that must be set before the CLI runs.

### The Embedding Problem

```
WITHOUT setup.sh first:
  pretrain -> intel.remember() -> embed() -> hashEmbed() -> 64d array

WITH setup.sh first:
  pretrain -> intel.remember() -> embedAsync() -> ONNX -> 384d array
```

The difference is `RUVECTOR_SEMANTIC_EMBEDDINGS=true` in settings.json, which setup.sh sets.

### The 5-Whys Analysis

1. **Why are embeddings 64d?** Because `embed()` uses `hashEmbed()` fallback.
2. **Why does embed() use hashEmbed()?** Because `RUVECTOR_SEMANTIC_EMBEDDINGS` is not set.
3. **Why is it not set?** Because setup.sh didn't run before pretrain.
4. **Why didn't setup.sh run first?** Because the old vanilla guide had pretrain in Phase 7, before setup.sh.
5. **Why was that order wrong?** Because pretrain creates memories immediately, and setup.sh configures how memories should be created.

### v0.9.8 Fix

Phase 8 (setup.sh) now runs BEFORE Phase 9 (pretrain). This ensures:
- Environment variables are set
- Hook timeouts are adequate
- CLI patches are applied
- ONNX model is downloaded
- All subsequent memories have correct 384d embeddings

---

## Appendix B: Rollback Procedure

If installation fails and you need to start fresh:

```bash
# Remove generated files
rm -rf .ruvector .swarm .claude .claude-flow node_modules package-lock.json

# Keep only source files
# Then restart from Phase 1
```

---

## Appendix C: Version History

| Version | Date | Changes |
|---------|------|---------|
| v0.9.9 | 2026-02-04 | Session tracking (FIX-032-034), db-paths.js (FIX-035), safe-number.js (FIX-036), vector_indexes fix (FIX-037), Phase 14-15 |
| v0.9.8 | 2026-02-04 | FIX-024 consolidate step, FIX-025 embedding verification, corrected phase order |
| v0.9.7 | 2026-02-03 | Validation checkpoints, DREAM_CYCLE default, PreToolUse timeout 5000ms |
| v0.9.6 | 2026-02-02 | Semantic edges, neural pattern embeddings, SONA fixes |

## Appendix D: Session Tracking (v0.9.9)

### Stats Table Keys

After v0.9.9, the stats table tracks the following session-related keys:

| Key | Description | Updated By |
|-----|-------------|------------|
| `last_session` | Session ID of the most recent session | session-start |
| `last_session_timestamp` | Unix timestamp of last session-start | session-start |
| `session_count` | Total number of sessions started | session-start |
| `total_sessions` | Total sessions completed (end-to-end) | session-end |
| `last_session_end` | Unix timestamp of last session-end | session-end |
| `last_agent` | Name of the most recently active agent | session-start |

### Agent Registration

Agents are now registered in the `agents` table with:
- New schema: `id, name, type, status, created_at, last_seen, metadata`
- The `metadata` JSON field contains `session_count`, `last_session`, `first_seen`
- Name index (`idx_agents_name`) enables fast lookups by agent name

### Verifying Session Tracking

```bash
# Check session stats
node -e '
const D = require("better-sqlite3");
const db = new D(".ruvector/intelligence.db", {readonly:true});
const keys = ["session_count", "last_session", "total_sessions", "last_agent"];
keys.forEach(k => {
  const row = db.prepare("SELECT value FROM stats WHERE key = ?").get(k);
  console.log(k + ":", row ? row.value : "not set");
});
db.close();
'

# Check registered agents
node -e '
const D = require("better-sqlite3");
const db = new D(".ruvector/intelligence.db", {readonly:true});
const agents = db.prepare("SELECT name, metadata FROM agents").all();
agents.forEach(a => {
  const meta = JSON.parse(a.metadata || "{}");
  console.log(a.name + ": sessions=" + (meta.session_count || 0));
});
db.close();
'
```

---

## Appendix E: Viz Server Utilities (v0.9.9)

### Centralized DB Paths (FIX-035)

The V3+RV system uses 5 databases. The `db-paths.js` utility centralizes all path configuration.

**Location:** `viz/server/config/db-paths.js`

**Usage:**
```javascript
const { INTELLIGENCE_DB, getAbsolutePath, listDatabases } = require('./config/db-paths');

// Get absolute path
const dbPath = getAbsolutePath(INTELLIGENCE_DB);

// List all databases with status
const dbs = listDatabases();
console.log(dbs);
```

**Database Constants:**

| Constant | Path | Format | Dimensions |
|----------|------|--------|------------|
| `INTELLIGENCE_DB` | `.ruvector/intelligence.db` | SQLite | 384d |
| `SWARM_MEMORY_DB` | `.swarm/memory.db` | SQLite | 384d |
| `CLAUDE_MEMORY_DB` | `.claude/memory.db` | SQLite | 384d |
| `LEARNING_PATTERNS_DB` | `.claude-flow/learning/patterns.db` | SQLite | N/A |
| `RUVECTOR_VECTOR_DB` | `ruvector.db` | redb | 256d |

### Safe Number Utilities (FIX-036)

The `safe-number.js` utility prevents NaN and Infinity from propagating through calculations.

**Location:** `viz/server/utils/safe-number.js`

**Usage:**
```javascript
const { safeNumber, safeDivide, safePercent, clamp } = require('./utils/safe-number');

// Convert safely (returns 0 for null/undefined/NaN)
const value = safeNumber(maybeUndefined, 0);

// Divide safely (returns 0 for divide-by-zero)
const ratio = safeDivide(completed, total, 0);

// Calculate percentage safely
const pct = safePercent(25, 100);  // 25

// Clamp to range
const clamped = clamp(150, 0, 100);  // 100
```

**Functions:**

| Function | Description |
|----------|-------------|
| `safeNumber(val, default)` | Convert to number safely |
| `safeDivide(a, b, default)` | Division without NaN |
| `safePercent(part, total)` | Percentage without NaN |
| `clamp(val, min, max)` | Clamp to range |
| `safeRound(val, decimals)` | Round safely |
| `safeAverage(arr, default)` | Array average safely |
| `safeSum(arr, default)` | Array sum safely |

### Vector Index Dimensions (FIX-037)

Claude-Flow databases use 384d vectors (matching `all-MiniLM-L6-v2`), but the default schema creates 768d indexes. setup.sh now automatically fixes this:

```bash
# Automatic fix during setup
bash scripts/setup.sh

# Manual fix
node -e "
const D = require('better-sqlite3');
['.swarm/memory.db', '.claude/memory.db'].forEach(p => {
  const db = new D(p);
  db.prepare('UPDATE vector_indexes SET dimensions = 384 WHERE dimensions = 768').run();
  db.close();
});
"
```

---

*V3+RV Skill v0.9.9 - Installation Guide*
