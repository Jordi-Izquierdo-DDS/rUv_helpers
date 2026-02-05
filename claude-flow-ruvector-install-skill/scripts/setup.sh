#!/bin/bash
# setup.sh v0.9.9 — Post-init configuration + upstream patches + SONA pipeline fix.
# Run AFTER: npx ruvector hooks init --fast --build-agents quality
# Run BEFORE: pretrain (CRITICAL!)
#
# 11 steps in 4 sections:
#   SECTION 0: GITIGNORE  (step 0)    — ensure .gitignore before any git operations
#   SECTION 1: CONFIGURE  (steps 1-5) — env vars, timeouts, --semantic, backend, bridge
#   SECTION 1B: ASSETS    (step 5b)   — embedding gateway + schema extensions + parseEmbedding
#   SECTION 2: PATCH      (steps 6-7) — consolidated upstream patches (FATAL on failure)
#   SECTION 3: RE-EMBED   (step 8)    — fix memories + set PRETRAIN_DONE + semantic edge verification
#   SECTION 4: CONSOLIDATE (step 9)   — populate learning pipeline (FIX-024) + stats sync (FIX-027)
#   SECTION 5: SONA PIPELINE (step 10) — wire SONA to session-end (FIX-028,029,030,031)
#
# v0.9.9 changes:
#   - FIX-028: Added pre-command handler to bridge (was missing)
#   - FIX-029: Added session-end handler with consolidate + SONA dream cycle
#   - FIX-030: Created sona-consolidate.js script (neural_patterns → compressed_patterns)
#   - FIX-031: Updated Stop hook in settings.json to call consolidate
#   - FIX-032: Session tracking: last_session timestamp, session_count++ in stats
#   - FIX-033: Agent registration handles both new and legacy table schemas
#   - FIX-034: Agents table now has name index for efficient lookups
#   - FIX-035: Added db-paths.js centralized DB configuration
#   - FIX-036: Added safe-number.js utility for NaN/Infinity protection
#   - FIX-037: Fix vector_indexes dimensions (768d → 384d) in memory.db files
#   - Updated bridge template with all fixes
#   - Version marker: __PATCH_CLI_V099__
#
# v0.9.8 changes:
#   - FIX-024: Step 9 runs post-process.js --event consolidate (populates neural_patterns, edges, agents)
#   - FIX-025: Embedding dimension verification function
#   - FIX-027: Stats table sync in consolidate
#   - Version marker: __PATCH_CLI_V098__
#   - Summary now includes consolidate status
#
# v0.9.7 changes:
#   - VALIDATION CHECKPOINTS after critical steps (better-sqlite3, schema, patches)
#   - DREAM_CYCLE_ENABLED default: "true" (was "false")
#   - SEMANTIC_THRESHOLD: "0.55" (new env var for edge creation)
#   - PreToolUse timeout: 5000ms (was 500ms)
#   - FATAL patch failures (critical patches must succeed)
#   - Schema validation function checks all required tables
#   - parseEmbedding utility deployment to assets/
#   - Semantic edge count verification after consolidation
#   - Version marker: __PATCH_CLI_V097__
#
# v0.9.6 changes:
#   - Step 5b: Copy embedding-gateway.js to assets/ (SSOT for embeddings)
#   - Step 5b: Add compressed_patterns table to schema (SONA/EWC++ support)
#   - Step 5b: Add embedding column to neural_patterns table
#   - Bridge template: v0.9.6 markers
#   - patch-cli.js: FIX-STORAGE-GETTER, FIX-SONA-INIT, FIX-023 regex fix
#   - patch-engine.js: SONA warmup in route() and learn()
#   - post-process.js: Semantic edge builder, neural pattern embeddings
#
# v0.9.5 changes:
#   - Step 0: .gitignore setup (prevents 95k file pretrain hang)
#   - Bridge template: post-process.js calls after post-edit and post-command
#   - Bridge template: session-start case for agent registration
#   - patch-cli.js idempotency marker updated to __PATCH_CLI_V095__
#   - --section flag from v0.9.5-FAIL (good addition): configure/patch/reembed
#
# Usage:
#   bash scripts/setup.sh [model] [dimension] [--section configure|patch|reembed|all]
#   bash scripts/setup.sh all-mpnet-base-v2 768
#   bash scripts/setup.sh --section configure
#   bash scripts/setup.sh all-MiniLM-L6-v2 384 --section reembed
#   bash scripts/setup.sh                        # defaults: all-MiniLM-L6-v2, 384, all

set -euo pipefail

# ---------------------------------------------------------------------------
# Parse arguments: model, dim, and --section can be in any order.
# ---------------------------------------------------------------------------
EMBED_MODEL="all-MiniLM-L6-v2"
EMBED_DIM="384"
SECTION="all"

for arg in "$@"; do
  case "$arg" in
    --section)
      # Next arg will be handled below
      ;;
    configure|patch|reembed|all)
      # Could be a bare section name after --section, or standalone
      SECTION="$arg"
      ;;
    --section=*)
      SECTION="${arg#--section=}"
      ;;
    *)
      # Not a section flag — treat as model or dim (positional)
      ;;
  esac
done

# Now re-parse positional args (skip --section and its value)
POSITIONALS=()
SKIP_NEXT=false
for arg in "$@"; do
  if $SKIP_NEXT; then
    SKIP_NEXT=false
    continue
  fi
  case "$arg" in
    --section)
      SKIP_NEXT=true
      continue
      ;;
    --section=*)
      continue
      ;;
    configure|patch|reembed|all)
      continue
      ;;
    *)
      POSITIONALS+=("$arg")
      ;;
  esac
done

# Assign positional args to model/dim
if [ ${#POSITIONALS[@]} -ge 1 ]; then
  EMBED_MODEL="${POSITIONALS[0]}"
fi
if [ ${#POSITIONALS[@]} -ge 2 ]; then
  EMBED_DIM="${POSITIONALS[1]}"
fi

# Validate section
case "$SECTION" in
  configure|patch|reembed|all) ;;
  *)
    echo "ERROR: Invalid --section value: $SECTION"
    echo "  Valid values: configure, patch, reembed, all"
    exit 1
    ;;
esac

SETTINGS=".claude/settings.json"
ERRORS=0

if [ ! -f "$SETTINGS" ]; then
  echo "ERROR: $SETTINGS not found. Run hooks init first."
  exit 1
fi

echo "=========================================="
echo " setup.sh v0.9.9 (model=$EMBED_MODEL, dim=$EMBED_DIM, section=$SECTION)"
echo "=========================================="
echo ""

# ==========================================================================
# VALIDATION FUNCTIONS (v0.9.7)
# ==========================================================================

# Validate better-sqlite3 is installed and working
validate_better_sqlite3() {
  if ! node -e "require('better-sqlite3')" 2>/dev/null; then
    echo "FATAL: better-sqlite3 not installed or not working"
    echo "  Run: npm install better-sqlite3"
    exit 1
  fi
  echo "  CHECKPOINT: better-sqlite3 validated"
}

# Validate database schema has all required tables
validate_schema() {
  if [ ! -f ".ruvector/intelligence.db" ]; then
    echo "  INFO: No database yet (will be created during pretrain)"
    return 0
  fi

  local missing_tables=""
  for table in memories edges neural_patterns compressed_patterns trajectories agents; do
    local count
    count=$(node -e "
      const db = require('better-sqlite3')('.ruvector/intelligence.db', { readonly: true });
      const row = db.prepare(\"SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='\").get();
      console.log(row ? row.c : 0);
      db.close();
    " 2>/dev/null | head -1 || echo "0")

    # Alternative check method
    count=$(node -e "
      const db = require('better-sqlite3')('.ruvector/intelligence.db', { readonly: true });
      try {
        const row = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name='$table'\").get();
        console.log(row ? 1 : 0);
      } catch(e) { console.log(0); }
      db.close();
    " 2>/dev/null || echo "0")

    if [ "$count" = "0" ]; then
      missing_tables="$missing_tables $table"
    fi
  done

  if [ -n "$missing_tables" ]; then
    echo "  WARNING: Missing tables:$missing_tables"
    return 1
  fi

  echo "  CHECKPOINT: All required tables exist (memories, edges, neural_patterns, compressed_patterns, trajectories, agents)"
  return 0
}

# Validate CLI patch was applied
validate_cli_patch() {
  if [ ! -f "node_modules/ruvector/bin/cli.js" ]; then
    echo "  INFO: CLI not found (may be using npx)"
    return 0
  fi

  if ! grep -qE "__PATCH_CLI_V09[78]__" node_modules/ruvector/bin/cli.js 2>/dev/null; then
    echo "FATAL: CLI patch __PATCH_CLI_V097__ or __PATCH_CLI_V098__ not applied"
    echo "  Run: node fixes/ruvector/patch-cli.js"
    exit 1
  fi

  echo "  CHECKPOINT: CLI patch verified"
}

# ==========================================================================
# STEP 0: GITIGNORE (always runs — prevents 95k file pretrain hang)
# Guardrail #19: Always .gitignore before git add
# ==========================================================================
echo "--- STEP 0: GITIGNORE ---"
echo ""

GITIGNORE=".gitignore"
GITIGNORE_ENTRIES=("node_modules/" ".ruvector/" ".swarm/" "*.db" ".claude-flow/" "*.db-journal" "*.db-wal")
ADDED_ENTRIES=0

if [ ! -f "$GITIGNORE" ]; then
  touch "$GITIGNORE"
  echo "  Created $GITIGNORE"
fi

for entry in "${GITIGNORE_ENTRIES[@]}"; do
  if ! grep -qF "$entry" "$GITIGNORE" 2>/dev/null; then
    echo "$entry" >> "$GITIGNORE"
    ADDED_ENTRIES=$((ADDED_ENTRIES+1))
  fi
done

if [ $ADDED_ENTRIES -gt 0 ]; then
  echo "  Added $ADDED_ENTRIES entries to $GITIGNORE"
else
  echo "  OK: $GITIGNORE already has all required entries"
fi
echo ""

# ==========================================================================
# SECTION 1: CONFIGURE
# Settings that hooks init gets wrong or doesn't set.
# ==========================================================================
if [ "$SECTION" = "all" ] || [ "$SECTION" = "configure" ]; then

echo "--- SECTION 1: CONFIGURE ---"
echo ""

# --- Step 1: Enable ONNX semantic embeddings + 10 additional env vars (v0.9.7: +SEMANTIC_THRESHOLD, DREAM_CYCLE=true) ---
echo "[1] ONNX semantic embeddings + env vars"
node -e '
var fs = require("fs");
var model = "'"$EMBED_MODEL"'";
var dim = "'"$EMBED_DIM"'";
var s = JSON.parse(fs.readFileSync("'"$SETTINGS"'", "utf-8"));
var changed = false;
s.env = s.env || {};
var pairs = {
  RUVECTOR_SEMANTIC_EMBEDDINGS: "true",
  RUVECTOR_EMBEDDING_MODEL: model,
  RUVECTOR_EMBEDDING_DIM: dim,
  RUVECTOR_LEARNING_ENABLED: "true",
  RUVECTOR_ONNX_ENABLED: "true",
  RUVECTOR_HOOK_TIMEOUT: "10000",
  RUVECTOR_PRETRAIN_DONE: "false",
  RUVECTOR_SONA_ENABLED: "true",
  RUVECTOR_HNSW_ENABLED: "true",
  RUVECTOR_ATTENTION_ENABLED: "true",
  RUVECTOR_Q_LEARNING_ALGORITHM: "double-q",
  RUVECTOR_DREAM_CYCLE_ENABLED: "true",
  RUVECTOR_SEMANTIC_THRESHOLD: "0.55"
};
var added = [];
Object.keys(pairs).forEach(function(k) {
  if (s.env[k] !== pairs[k]) { s.env[k] = pairs[k]; changed = true; added.push(k); }
});
if (changed) {
  fs.writeFileSync("'"$SETTINGS"'", JSON.stringify(s, null, 2));
  console.log("  Fixed: " + added.length + " env var(s) set (" + model + ", " + dim + "d)");
  console.log("    Set: " + added.join(", "));
} else {
  console.log("  OK: All 13 embedding/runtime env vars already configured (" + model + ", " + dim + "d)");
}
'

# --- Step 2: Increase hook timeouts (300ms -> 5000-10000ms) + v0.9.7: PreToolUse=5000 ---
echo "[2] Hook timeouts"
node -e '
var fs = require("fs");
var s = JSON.parse(fs.readFileSync("'"$SETTINGS"'", "utf-8"));
var fixed = 0;
var hooks = s.hooks || {};
Object.keys(hooks).forEach(function(event) {
  var hookList = hooks[event];
  if (!Array.isArray(hookList)) return;
  hookList.forEach(function(entry) {
    var innerHooks = entry.hooks || [];
    innerHooks.forEach(function(h) {
      if (!h.command || !h.timeout) return;
      var isRemember = h.command.indexOf("remember") !== -1;
      var isPostEdit = h.command.indexOf("post-edit") !== -1;
      var isPostCommand = h.command.indexOf("post-command") !== -1;
      var isPreToolUse = event === "PreToolUse";
      // v0.9.7: PreToolUse timeout = 5000 (was 500)
      if (isPreToolUse && h.timeout < 5000) {
        h.timeout = 5000;
        fixed++;
      } else if ((isRemember || isPostEdit || isPostCommand) && h.timeout < 5000) {
        h.timeout = isPostEdit || isPostCommand ? 10000 : 5000;
        fixed++;
      }
    });
  });
});
if (fixed > 0) {
  fs.writeFileSync("'"$SETTINGS"'", JSON.stringify(s, null, 2));
  console.log("  Fixed: " + fixed + " hook timeout(s) increased (remember: 5s, post-edit/command: 10s, PreToolUse: 5s)");
} else {
  console.log("  OK: Hook timeouts adequate");
}
'

# --- Step 3: Add --semantic flag to remember hooks ---
echo "[3] --semantic flag on remember hooks"
node -e '
var fs = require("fs");
var s = JSON.parse(fs.readFileSync("'"$SETTINGS"'", "utf-8"));
var fixed = 0;
var hooks = s.hooks || {};
Object.keys(hooks).forEach(function(event) {
  var hookList = hooks[event];
  if (!Array.isArray(hookList)) return;
  hookList.forEach(function(entry) {
    var innerHooks = entry.hooks || [];
    innerHooks.forEach(function(h) {
      if (h.command && h.command.indexOf("remember") !== -1 && h.command.indexOf("--semantic") === -1) {
        h.command = h.command.replace(/(remember\s)/, "$1--semantic ");
        fixed++;
      }
    });
  });
});
if (fixed > 0) {
  fs.writeFileSync("'"$SETTINGS"'", JSON.stringify(s, null, 2));
  console.log("  Fixed: " + fixed + " remember hook(s) now use --semantic");
} else {
  console.log("  OK: Remember hooks already use --semantic");
}
'

# --- Step 4: Fix MEMORY_BACKEND (detect sqlite adapter, rvlite, or json) ---
echo "[4] Memory backend"
node -e '
var fs = require("fs");
var path = require("path");
var s = JSON.parse(fs.readFileSync("'"$SETTINGS"'", "utf-8"));
s.env = s.env || {};
var backend = s.env.RUVECTOR_MEMORY_BACKEND;

// Check for SQLite storage adapter + better-sqlite3
var hasSqliteAdapter = false;
try {
  fs.accessSync("packages/ruvector-storage/index.js", fs.constants.R_OK);
  require("better-sqlite3");
  hasSqliteAdapter = true;
} catch(e) {}

if (hasSqliteAdapter) {
  if (backend !== "sqlite") {
    s.env.RUVECTOR_MEMORY_BACKEND = "sqlite";
    fs.writeFileSync("'"$SETTINGS"'", JSON.stringify(s, null, 2));
    console.log("  Fixed: MEMORY_BACKEND changed " + (backend || "unset") + " -> sqlite (storage adapter + better-sqlite3 detected)");
  } else {
    console.log("  OK: sqlite backend configured (storage adapter present)");
  }
} else if (backend === "rvlite") {
  try {
    require("@ruvector/rvlite");
    console.log("  OK: rvlite backend installed");
  } catch(e) {
    s.env.RUVECTOR_MEMORY_BACKEND = "json";
    fs.writeFileSync("'"$SETTINGS"'", JSON.stringify(s, null, 2));
    console.log("  Fixed: MEMORY_BACKEND changed rvlite -> json (@ruvector/rvlite not installed)");
  }
} else {
  console.log("  OK: Memory backend is " + (backend || "default"));
}
'

# v0.9.7: Validate better-sqlite3 after configure
echo "[4b] Validate better-sqlite3"
validate_better_sqlite3

# --- Step 5: Stdin bridge + rewrite $TOOL_INPUT_* hook commands ---
echo "[5] Stdin bridge (absorbs FIX-007) + post-process.js integration"

# Part A: Create bridge script
BRIDGE_DIR=".claude"
BRIDGE_PATH="${BRIDGE_DIR}/ruvector-hook-bridge.sh"
mkdir -p "$BRIDGE_DIR"

cat > "$BRIDGE_PATH" << 'BRIDGE_EOF'
#!/bin/bash
# ruvector-hook-bridge.sh — Reads Claude Code stdin JSON, extracts fields, calls ruvector.
# Created by setup.sh v0.9.9. Do not edit manually; re-run setup.sh to regenerate.
#
# Claude Code sends JSON on stdin for hook events:
#   {"hook_event_name":"PostToolUse","tool_name":"Write","tool_input":{...},"tool_response":{...}}
#
# v0.9.9 Fixes:
#   - FIX-028: Added pre-command handler (was missing, fell through to wildcard)
#   - FIX-029: Added session-end handler with consolidate + SONA dream cycle
#   - FIX-031: Stop hook now triggers full consolidation pipeline
#
# v0.9.7: PreToolUse timeout increased to 5000ms for reliable operation.
# v0.9.6: Calls post-process.js in background after post-edit/post-command.

set -euo pipefail

INPUT="$(cat)"
HOOK_CMD="${1:-}"; shift 2>/dev/null || true

if [ -x ".claude/ruvector-fast.sh" ]; then
  RV_CMD=".claude/ruvector-fast.sh"
else
  RV_CMD="npx ruvector"
fi

extract() {
  echo "$INPUT" | node -e "
    let d='';
    process.stdin.on('data', c => d += c);
    process.stdin.on('end', () => {
      try {
        const j = JSON.parse(d);
        const val = $1;
        process.stdout.write(String(val || ''));
      } catch(e) {
        process.stdout.write('');
      }
    });
  " 2>/dev/null
}

case "$HOOK_CMD" in
  pre-edit)
    FILE=$(extract "j.tool_input?.file_path")
    [ -n "$FILE" ] && exec $RV_CMD hooks pre-edit "$FILE" "$@" || exit 0
    ;;

  post-edit)
    FILE=$(extract "j.tool_input?.file_path")
    if [ -n "$FILE" ]; then
      if [ -f "scripts/post-process.js" ]; then
        node scripts/post-process.js --event post-edit --file "$FILE" --success true --train-neural true 2>/dev/null &
      fi
      exec $RV_CMD hooks post-edit "$FILE" --success "$@"
    fi
    exit 0
    ;;

  pre-command)
    # FIX-028: Added pre-command handler (was missing in v0.9.8)
    CMD=$(extract "j.tool_input?.command")
    if [ -n "$CMD" ]; then
      if [ -f "scripts/post-process.js" ]; then
        node scripts/post-process.js --event pre-command --command "$CMD" 2>/dev/null &
      fi
      exec $RV_CMD hooks pre-command "$CMD" "$@"
    fi
    exit 0
    ;;

  post-command)
    CMD=$(extract "j.tool_input?.command")
    if [ -n "$CMD" ]; then
      if [ -f "scripts/post-process.js" ]; then
        node scripts/post-process.js --event post-command --command "$CMD" --success true 2>/dev/null &
      fi
      exec $RV_CMD hooks post-command "$CMD" --success "$@"
    fi
    exit 0
    ;;

  session-start)
    AGENT=$(extract "j.tool_input?.agent_name || j.agent_name")
    SESSION=$(extract "j.tool_input?.session_id || j.session_id")
    if [ -f "scripts/post-process.js" ]; then
      node scripts/post-process.js --event session-start --agent-name "${AGENT:-claude-code}" --session-id "${SESSION:-auto}" 2>/dev/null &
    fi
    exec $RV_CMD hooks session-start "$@" || exit 0
    ;;

  session-end)
    # FIX-029: Added session-end handler with consolidate + SONA dream cycle
    # Step 1: Run consolidate to populate neural_patterns, edges, stats
    if [ -f "scripts/post-process.js" ]; then
      node scripts/post-process.js --event consolidate 2>/dev/null || true
    fi
    # Step 2: Trigger SONA dream cycle (neural_patterns → compressed_patterns)
    if [ -f "scripts/sona-consolidate.js" ]; then
      node scripts/sona-consolidate.js 2>/dev/null || true
    fi
    # Step 3: Call learning-hooks.sh if available
    if [ -f ".claude/helpers/learning-hooks.sh" ]; then
      bash .claude/helpers/learning-hooks.sh session-end 2>/dev/null || true
    fi
    # Step 4: Call ruvector session-end
    exec $RV_CMD hooks session-end "$@" || exit 0
    ;;

  remember-read)
    FILE=$(extract "j.tool_input?.file_path")
    if [ -n "$FILE" ]; then
      BNAME=$(basename "$FILE")
      PDIR=$(basename "$(dirname "$FILE")")
      exec $RV_CMD hooks remember "Reading: $BNAME in $PDIR/" -t file_access --semantic --silent "$@"
    fi
    exit 0
    ;;

  remember-search)
    PATTERN=$(extract "j.tool_input?.pattern")
    [ -n "$PATTERN" ] && exec $RV_CMD hooks remember "Search: $PATTERN" -t search_pattern --semantic --silent "$@" || exit 0
    ;;

  remember-agent)
    TYPE=$(extract "j.tool_input?.subagent_type")
    DESC=$(extract "j.tool_input?.description")
    if [ -n "$TYPE" ]; then
      LABEL="Agent: $TYPE"
      [ -n "$DESC" ] && LABEL="Agent: $TYPE — $DESC"
      exec $RV_CMD hooks remember "$LABEL" -t agent_spawn --semantic --silent "$@"
    fi
    exit 0
    ;;

  coedit-suggest)
    FILE=$(extract "j.tool_input?.file_path")
    [ -n "$FILE" ] && exec $RV_CMD hooks coedit-suggest "$FILE" "$@" || exit 0
    ;;

  consolidate)
    # FIX-031: Direct consolidate command support
    if [ -f "scripts/post-process.js" ]; then
      node scripts/post-process.js --event consolidate 2>/dev/null || true
    fi
    if [ -f "scripts/sona-consolidate.js" ]; then
      node scripts/sona-consolidate.js 2>/dev/null || true
    fi
    exit 0
    ;;

  *)
    exec $RV_CMD hooks "$HOOK_CMD" "$@" || exit 0
    ;;
esac
BRIDGE_EOF

chmod +x "$BRIDGE_PATH"
echo "  Created $BRIDGE_PATH"

# Part B: Rewrite $TOOL_INPUT_* references in settings.json
node -e '
var fs = require("fs");
var path = require("path");

var SETTINGS_PATH = "'"$SETTINGS"'";
var settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
var hooks = settings.hooks || {};
var patchCount = 0;

var replacements = [
  { match: /.*\$TOOL_INPUT_file_path.*pre-edit.*|.*pre-edit.*\$TOOL_INPUT_file_path.*/, bridge: ".claude/ruvector-hook-bridge.sh pre-edit" },
  { match: /.*\$TOOL_INPUT_file_path.*post-edit.*|.*post-edit.*\$TOOL_INPUT_file_path.*/, bridge: ".claude/ruvector-hook-bridge.sh post-edit" },
  { match: /.*\$TOOL_INPUT_command.*post-command.*|.*post-command.*\$TOOL_INPUT_command.*/, bridge: ".claude/ruvector-hook-bridge.sh post-command" },
  { match: /.*remember.*Reading.*\$TOOL_INPUT_file_path.*|.*\$TOOL_INPUT_file_path.*remember.*Reading.*/, bridge: ".claude/ruvector-hook-bridge.sh remember-read" },
  { match: /.*remember.*Search.*\$TOOL_INPUT_pattern.*|.*\$TOOL_INPUT_pattern.*remember.*Search.*/, bridge: ".claude/ruvector-hook-bridge.sh remember-search" },
  { match: /.*remember.*Agent.*\$TOOL_INPUT_subagent_type.*|.*\$TOOL_INPUT_subagent_type.*remember.*Agent.*/, bridge: ".claude/ruvector-hook-bridge.sh remember-agent" },
  { match: /.*coedit-suggest.*\$TOOL_INPUT_file_path.*|.*\$TOOL_INPUT_file_path.*coedit-suggest.*/, bridge: ".claude/ruvector-hook-bridge.sh coedit-suggest" }
];

Object.keys(hooks).forEach(function(event) {
  var hookList = hooks[event];
  if (!Array.isArray(hookList)) return;
  hookList.forEach(function(entry) {
    var innerHooks = entry.hooks || [entry];
    innerHooks.forEach(function(h) {
      if (!h.command || h.command.indexOf("$TOOL_INPUT_") === -1) return;
      var matched = false;
      for (var i = 0; i < replacements.length; i++) {
        var r = replacements[i];
        if (r.match.test(h.command)) {
          var suffix = h.command.match(/\s*(2>\/dev\/null\s*\|\|\s*true)\s*$/);
          h.command = r.bridge + (suffix ? " " + suffix[1] : "");
          patchCount++;
          matched = true;
          break;
        }
      }
      if (!matched && h.command.indexOf("$TOOL_INPUT_") !== -1) {
        var hookCmdMatch = h.command.match(/hooks\s+(\S+)/);
        if (hookCmdMatch) {
          var suffix = h.command.match(/\s*(2>\/dev\/null\s*\|\|\s*true)\s*$/);
          h.command = ".claude/ruvector-hook-bridge.sh " + hookCmdMatch[1] + (suffix ? " " + suffix[1] : "");
          patchCount++;
        }
      }
    });
  });
});

if (patchCount > 0) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  console.log("  Fixed: " + patchCount + " $TOOL_INPUT_* reference(s) replaced with bridge calls");
} else {
  var raw = fs.readFileSync(SETTINGS_PATH, "utf-8");
  if (raw.indexOf("$TOOL_INPUT_") !== -1) {
    console.log("  WARNING: $TOOL_INPUT_ references found but no patterns matched. Check manually.");
  } else {
    console.log("  OK: No $TOOL_INPUT_* references (already clean or using bridge)");
  }
}
'

# ==========================================================================
# STEP 5b: ASSETS + SCHEMA (v0.9.6 + v0.9.7 parseEmbedding)
# Copy embedding gateway, parseEmbedding utility, and extend database schema
# ==========================================================================
echo "[5b] Embedding gateway + parseEmbedding utility + schema extensions (v0.9.7)"

# Part A: Copy embedding-gateway.js to assets/
ASSETS_DIR="assets"
mkdir -p "$ASSETS_DIR"

# Check if embedding-gateway.js exists in skill assets or create it
if [ -f "assets/embedding-gateway.js" ]; then
  echo "  OK: assets/embedding-gateway.js already exists"
else
  # Create a minimal embedding gateway if the full one isn't available
  cat > "$ASSETS_DIR/embedding-gateway.js" << 'GATEWAY_EOF'
// embedding-gateway.js v0.9.7 — SSOT for embeddings
// Auto-generated by setup.sh; replace with full version from skill if available
'use strict';
var CONFIG = {
  model: process.env.RUVECTOR_EMBEDDING_MODEL || 'all-MiniLM-L6-v2',
  dimension: parseInt(process.env.RUVECTOR_EMBEDDING_DIM, 10) || 384
};
function hashEmbed(text) {
  var dim = CONFIG.dimension;
  var embedding = new Float32Array(dim);
  var str = String(text || '').toLowerCase();
  for (var pass = 0; pass < 5; pass++) {
    for (var i = 0; i < str.length; i++) {
      var idx = ((i * 31 + str.charCodeAt(i) * 127 + pass * 17) % dim + dim) % dim;
      embedding[idx] += (1.0 / (pass + 1)) * (str.charCodeAt(i) / 128.0 - 0.5);
    }
  }
  var norm = 0;
  for (var j = 0; j < dim; j++) norm += embedding[j] * embedding[j];
  norm = Math.sqrt(norm) || 1;
  for (var k = 0; k < dim; k++) embedding[k] /= norm;
  return Array.from(embedding);
}
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  var dot = 0, normA = 0, normB = 0;
  for (var i = 0; i < a.length; i++) { dot += a[i] * b[i]; normA += a[i] * a[i]; normB += b[i] * b[i]; }
  var denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}
module.exports = {
  embed: hashEmbed,
  cosineSimilarity: cosineSimilarity,
  dimension: CONFIG.dimension,
  model: CONFIG.model,
  DIMENSION: CONFIG.dimension
};
GATEWAY_EOF
  echo "  Created minimal $ASSETS_DIR/embedding-gateway.js"
fi

# Part A2 (v0.9.7): Deploy parseEmbedding utility
if [ -f "assets/parseEmbedding.js" ]; then
  echo "  OK: assets/parseEmbedding.js already exists"
else
  cat > "$ASSETS_DIR/parseEmbedding.js" << 'PARSE_EOF'
// parseEmbedding.js v0.9.7 — Shared utility for parsing embeddings from various formats
// Auto-generated by setup.sh v0.9.7
'use strict';

/**
 * Parse embedding from various storage formats (BLOB, JSON, Float32Array)
 * @param {Buffer|string|Array|Float32Array|null} raw - Raw embedding data
 * @param {number} expectedDim - Expected dimension (default: 384)
 * @returns {Float32Array|null} - Parsed embedding or null if invalid
 */
function parseEmbedding(raw, expectedDim) {
  expectedDim = expectedDim || parseInt(process.env.RUVECTOR_EMBEDDING_DIM, 10) || 384;

  if (!raw) return null;

  // Already a Float32Array
  if (raw instanceof Float32Array) {
    return raw.length === expectedDim ? raw : null;
  }

  // Buffer (SQLite BLOB)
  if (Buffer.isBuffer(raw)) {
    if (raw.length === expectedDim * 4) {
      return new Float32Array(raw.buffer, raw.byteOffset, expectedDim);
    }
    // Try parsing as JSON string in buffer
    try {
      const arr = JSON.parse(raw.toString('utf-8'));
      if (Array.isArray(arr) && arr.length === expectedDim) {
        return new Float32Array(arr);
      }
    } catch (e) { /* not JSON */ }
    return null;
  }

  // Array
  if (Array.isArray(raw)) {
    return raw.length === expectedDim ? new Float32Array(raw) : null;
  }

  // String (JSON)
  if (typeof raw === 'string') {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length === expectedDim) {
        return new Float32Array(arr);
      }
    } catch (e) { /* not valid JSON */ }
    return null;
  }

  return null;
}

/**
 * Convert embedding to Buffer for SQLite storage
 * @param {Float32Array|Array} embedding - Embedding to convert
 * @returns {Buffer} - Buffer suitable for SQLite BLOB
 */
function embeddingToBuffer(embedding) {
  if (embedding instanceof Float32Array) {
    return Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
  }
  if (Array.isArray(embedding)) {
    return Buffer.from(new Float32Array(embedding).buffer);
  }
  throw new Error('Invalid embedding type');
}

/**
 * Calculate cosine similarity between two embeddings
 * @param {Float32Array|Array} a - First embedding
 * @param {Float32Array|Array} b - Second embedding
 * @returns {number} - Cosine similarity (-1 to 1)
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

module.exports = {
  parseEmbedding,
  embeddingToBuffer,
  cosineSimilarity,
  DIMENSION: parseInt(process.env.RUVECTOR_EMBEDDING_DIM, 10) || 384
};
PARSE_EOF
  echo "  Created $ASSETS_DIR/parseEmbedding.js (v0.9.7 shared utility)"
fi

# Part B: Extend database schema if SQLite is in use
if [ -f ".ruvector/intelligence.db" ]; then
  node -e '
  var Database = require("better-sqlite3");
  var db = new Database(".ruvector/intelligence.db");
  var schemaChanges = 0;

  // Check if compressed_patterns table exists (for SONA/EWC++)
  var hasCompressedPatterns = db.prepare("SELECT name FROM sqlite_master WHERE type=\"table\" AND name=\"compressed_patterns\"").get();
  if (!hasCompressedPatterns) {
    db.exec("\
      CREATE TABLE IF NOT EXISTS compressed_patterns (\
        id TEXT PRIMARY KEY,\
        layer TEXT NOT NULL,\
        data BLOB NOT NULL,\
        compression_ratio REAL DEFAULT 1.0,\
        created_at INTEGER NOT NULL,\
        metadata TEXT DEFAULT \"{}\"\
      );\
      CREATE INDEX IF NOT EXISTS idx_compressed_patterns_layer ON compressed_patterns(layer);\
    ");
    console.log("  Created: compressed_patterns table (SONA/EWC++ support)");
    schemaChanges++;
  }

  // Check if neural_patterns has embedding column
  var columns = db.prepare("PRAGMA table_info(neural_patterns)").all();
  var hasEmbeddingCol = columns.some(function(c) { return c.name === "embedding"; });
  if (!hasEmbeddingCol) {
    try {
      db.exec("ALTER TABLE neural_patterns ADD COLUMN embedding BLOB");
      console.log("  Added: embedding column to neural_patterns");
      schemaChanges++;
    } catch (e) { /* column might already exist */ }
  }

  // Check if edges.data supports semantic type
  // (no schema change needed, just verify data column exists)
  var edgeCols = db.prepare("PRAGMA table_info(edges)").all();
  var hasDataCol = edgeCols.some(function(c) { return c.name === "data"; });
  if (!hasDataCol) {
    try {
      db.exec("ALTER TABLE edges ADD COLUMN data TEXT DEFAULT \"{}\"");
      console.log("  Added: data column to edges");
      schemaChanges++;
    } catch (e) { /* column might already exist */ }
  }

  // v0.9.7: Ensure trajectories table exists
  var hasTrajectoriesTable = db.prepare("SELECT name FROM sqlite_master WHERE type=\"table\" AND name=\"trajectories\"").get();
  if (!hasTrajectoriesTable) {
    db.exec("\
      CREATE TABLE IF NOT EXISTS trajectories (\
        id TEXT PRIMARY KEY,\
        session_id TEXT,\
        steps TEXT DEFAULT \"[]\",\
        reward REAL DEFAULT 0,\
        created_at INTEGER NOT NULL,\
        metadata TEXT DEFAULT \"{}\"\
      );\
      CREATE INDEX IF NOT EXISTS idx_trajectories_session ON trajectories(session_id);\
    ");
    console.log("  Created: trajectories table");
    schemaChanges++;
  }

  // v0.9.9: Ensure agents table exists with new schema (supports session tracking)
  var hasAgentsTable = db.prepare("SELECT name FROM sqlite_master WHERE type=\"table\" AND name=\"agents\"").get();
  if (!hasAgentsTable) {
    db.exec("\
      CREATE TABLE IF NOT EXISTS agents (\
        id TEXT PRIMARY KEY,\
        name TEXT NOT NULL,\
        type TEXT DEFAULT \"claude-code\",\
        status TEXT DEFAULT \"active\",\
        created_at INTEGER NOT NULL,\
        last_seen INTEGER,\
        metadata TEXT DEFAULT \"{}\"\
      );\
      CREATE INDEX IF NOT EXISTS idx_agents_name ON agents(name);\
      CREATE INDEX IF NOT EXISTS idx_agents_type ON agents(type);\
      CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);\
    ");
    console.log("  Created: agents table (v0.9.9 schema with name index)");
    schemaChanges++;
  } else {
    // v0.9.9: Ensure name index exists on existing agents table
    try {
      db.exec("CREATE INDEX IF NOT EXISTS idx_agents_name ON agents(name)");
    } catch (e) { /* index may already exist */ }
  }

  db.close();

  if (schemaChanges === 0) {
    console.log("  OK: Database schema already up to date");
  }
  ' 2>/dev/null || echo "  INFO: Schema extension skipped (database not accessible)"

  # v0.9.7: Validate schema after extension
  echo "[5c] Validate database schema"
  validate_schema
else
  echo "  SKIP: No intelligence.db yet (will be created during pretrain)"
fi

echo ""

# Part C (v0.9.7): Deploy SONA fallback if not already present
echo "[5d] Check SONA fallback package"
if [ -d "packages/sona-fallback" ] && [ -f "packages/sona-fallback/index.js" ]; then
  echo "  OK: packages/sona-fallback already deployed"
else
  mkdir -p packages/sona-fallback
  echo "  Creating packages/sona-fallback/index.js (JS fallback for native SONA bug)"
  cat > packages/sona-fallback/index.js << 'SONA_FALLBACK_EOF'
/**
 * sona-fallback/index.js - v0.9.7
 * Pure JS fallback for SONA pattern storage when native module is buggy.
 * Uses compressed_patterns table in intelligence.db.
 */
'use strict';
var path = require('path');

function SonaFallback(embeddingDim, learningRate, maxPatterns) {
  this.embeddingDim = embeddingDim || 384;
  this.learningRate = learningRate || 0.01;
  this.maxPatterns = maxPatterns || 1000;
  this.db = null;
  this.nativeSona = null;
  this.useFallback = false;
  this.stats = { patterns_stored: 0, calls_store: 0, calls_retrieve: 0, ewc_tasks: 0, adaptations: 0, fallback_active: false };
  this._init();
}

SonaFallback.prototype._init = function() {
  try {
    var Database = require('better-sqlite3');
    var dbPath = process.env.RUVECTOR_SQLITE_PATH || '.ruvector/intelligence.db';
    this.db = new Database(dbPath);
    this.db.exec('CREATE TABLE IF NOT EXISTS compressed_patterns (id TEXT PRIMARY KEY, layer TEXT NOT NULL, data BLOB NOT NULL, compression_ratio REAL DEFAULT 1.0, created_at INTEGER NOT NULL, metadata TEXT DEFAULT "{}")');
    var count = this.db.prepare('SELECT COUNT(*) as c FROM compressed_patterns').get();
    this.stats.patterns_stored = count.c;
  } catch (e) { console.error('[SONA-FALLBACK] DB init error:', e.message); }
  try {
    var sona = require('@ruvector/sona');
    this.nativeSona = new sona.SonaEngine(this.embeddingDim, this.learningRate, this.maxPatterns);
  } catch (e) {
    this.useFallback = true;
    this.stats.fallback_active = true;
  }
};

SonaFallback.prototype.storePattern = function(layer, embedding, metadata) {
  this.stats.calls_store++;
  if (this.nativeSona && !this.useFallback) {
    try {
      this.nativeSona.storePattern(layer, embedding, metadata);
      var ns = this.nativeSona.getStats();
      if (this.stats.calls_store > 5 && ns.patterns_stored === 0) {
        this.useFallback = true; this.stats.fallback_active = true;
      } else { this.stats.patterns_stored = ns.patterns_stored; return true; }
    } catch (e) { this.useFallback = true; this.stats.fallback_active = true; }
  }
  return this._storeJS(layer, embedding, metadata);
};

SonaFallback.prototype._storeJS = function(layer, embedding, metadata) {
  if (!this.db) return false;
  try {
    var id = 'sona-' + layer + '-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    var blob = embedding instanceof Float32Array ? Buffer.from(embedding.buffer) : Buffer.from(new Float32Array(embedding).buffer);
    this.db.prepare('INSERT INTO compressed_patterns (id, layer, data, compression_ratio, created_at, metadata) VALUES (?, ?, ?, ?, ?, ?)').run(id, layer, blob, 1.0, Date.now(), JSON.stringify(metadata || {}));
    this.stats.patterns_stored++;
    return true;
  } catch (e) { return false; }
};

SonaFallback.prototype.getPatterns = function(layer, limit) {
  this.stats.calls_retrieve++;
  if (!this.db) return [];
  try {
    var rows = this.db.prepare('SELECT * FROM compressed_patterns WHERE layer = ? ORDER BY created_at DESC LIMIT ?').all(layer, limit || 100);
    return rows.map(function(r) { return { id: r.id, layer: r.layer, embedding: r.data ? new Float32Array(r.data.buffer, r.data.byteOffset, r.data.length/4) : null, metadata: JSON.parse(r.metadata || '{}') }; });
  } catch (e) { return []; }
};

SonaFallback.prototype.tick = function() { if (this.nativeSona) try { return this.nativeSona.tick(); } catch(e){} return true; };
SonaFallback.prototype.flush = function() { if (this.nativeSona) try { return this.nativeSona.flush(); } catch(e){} return true; };
SonaFallback.prototype.forceLearn = function() { if (this.nativeSona) try { return this.nativeSona.forceLearn(); } catch(e){} this.stats.ewc_tasks++; return true; };
SonaFallback.prototype.warmup = function() { if (this.nativeSona) try { return this.nativeSona.warmup(); } catch(e){} return true; };
SonaFallback.prototype.applyMicroLora = function(emb) { if (this.nativeSona) try { return this.nativeSona.applyMicroLora(emb); } catch(e){} this.stats.adaptations++; return emb; };
SonaFallback.prototype.applyBaseLora = function(emb) { if (this.nativeSona) try { return this.nativeSona.applyBaseLora(emb); } catch(e){} return emb; };
SonaFallback.prototype.getStats = function() {
  var ns = {};
  if (this.nativeSona) try { ns = this.nativeSona.getStats() || {}; } catch(e){}
  return Object.assign({}, ns, this.stats, { fallback_active: this.stats.fallback_active, native_available: !!this.nativeSona });
};
SonaFallback.prototype.close = function() { if (this.db) try { this.db.close(); } catch(e){} };

module.exports = { SonaEngine: SonaFallback, SonaFallback: SonaFallback };
SONA_FALLBACK_EOF
  echo "  Created packages/sona-fallback/index.js"
fi

# Part D (v0.9.7): Deploy SONA shim (cleaner Fox Method alternative)
# The shim auto-detects the native SONA bug at runtime, avoiding require patching.
# Two integration approaches:
#   1. patch-engine.js (classic Fox): patches node_modules, revert with npm install
#   2. sona-shim (cleaner Fox): zero node_modules changes, set SONA_MODULE_PATH env
echo "[5e] Check SONA shim package (Fox Method clean alternative)"
if [ -d "packages/sona-shim" ] && [ -f "packages/sona-shim/index.js" ]; then
  echo "  OK: packages/sona-shim already deployed"
else
  mkdir -p packages/sona-shim
  echo "  Creating packages/sona-shim/index.js (runtime auto-detection)"
  cat > packages/sona-shim/index.js << 'SONA_SHIM_EOF'
/**
 * sona-shim/index.js - v0.9.7
 * Fox-Method compliant SONA shim with zero node_modules modifications.
 *
 * USAGE: Set SONA_MODULE_PATH=./packages/sona-shim in environment,
 * or use directly: const { SonaEngine } = require('./packages/sona-shim');
 *
 * This module tests native @ruvector/sona at load time and auto-switches
 * to sona-fallback if the storage bug is detected.
 */
'use strict';

var customPath = process.env.SONA_MODULE_PATH;
if (customPath && customPath !== __dirname && customPath.indexOf('sona-shim') === -1) {
  try { module.exports = require(customPath); return; } catch (e) {}
}

var nativeWorks = false, nativeSona = null;
try {
  nativeSona = require('@ruvector/sona');
  var test = new nativeSona.SonaEngine(384, 0.01, 100);
  var emb = new Float32Array(384).fill(0.1);
  test.storePattern('test', emb, {}); test.storePattern('test', emb, {}); test.storePattern('test', emb, {});
  var s = test.getStats();
  if (s.patterns_stored > 0) { nativeWorks = true; console.log('[SONA-SHIM] Native @ruvector/sona is functional'); }
  else { console.log('[SONA-SHIM] Native has storage bug (patterns_stored=0)'); }
  if (test.close) test.close();
} catch (e) { console.log('[SONA-SHIM] Native unavailable:', e.message); }

if (nativeWorks) {
  module.exports = nativeSona;
} else {
  try {
    var fallbackPath = require('path').resolve(__dirname, '../sona-fallback');
    module.exports = require(fallbackPath);
    console.log('[SONA-SHIM] Using sona-fallback (pure JS)');
  } catch (e) {
    console.error('[SONA-SHIM] CRITICAL: No SONA implementation available!');
    module.exports = {
      SonaEngine: function() {
        this.stats = { patterns_stored: 0, fallback_active: false, stub: true };
      }
    };
    module.exports.SonaEngine.prototype.storePattern = function() { return false; };
    module.exports.SonaEngine.prototype.getPatterns = function() { return []; };
    module.exports.SonaEngine.prototype.tick = function() { return true; };
    module.exports.SonaEngine.prototype.flush = function() { return true; };
    module.exports.SonaEngine.prototype.forceLearn = function() { return false; };
    module.exports.SonaEngine.prototype.warmup = function() { return true; };
    module.exports.SonaEngine.prototype.applyMicroLora = function(e) { return e; };
    module.exports.SonaEngine.prototype.applyBaseLora = function(e) { return e; };
    module.exports.SonaEngine.prototype.getStats = function() { return this.stats; };
    module.exports.SonaEngine.prototype.close = function() {};
  }
}
SONA_SHIM_EOF
  echo "  Created packages/sona-shim/index.js"
fi

fi  # end SECTION 1: CONFIGURE

# ==========================================================================
# SECTION 2: PATCH UPSTREAM
# Consolidated patches applied to ruvector CLI and engine.
# These replace the individual FIX-006/006b/008/009/010/011/013/014/015/016/023 steps.
# v0.9.7: CRITICAL PATCHES ARE FATAL (no || true)
# ==========================================================================
if [ "$SECTION" = "all" ] || [ "$SECTION" = "patch" ]; then

echo "--- SECTION 2: PATCH UPSTREAM ---"
echo ""

# --- Step 6: Consolidated CLI patch (v0.9.7: FATAL on failure) ---
echo "[6] Patch CLI (patch-cli.js) — CRITICAL"
if [ -f "fixes/ruvector/patch-cli.js" ]; then
  # v0.9.7: No || true — patch failure is FATAL
  if node fixes/ruvector/patch-cli.js; then
    echo "  OK: CLI patches applied"
    # v0.9.7: Validate patch was applied
    validate_cli_patch
  else
    echo "FATAL: patch-cli.js failed"
    echo "  Check fixes/ruvector/patch-cli.js for errors"
    exit 1
  fi
else
  echo "  SKIP: fixes/ruvector/patch-cli.js not found"
  echo "  WARNING: CLI patches not available — some features may not work"
fi

# --- Step 7: Consolidated engine patch (optional, non-fatal) ---
echo "[7] Patch engine (patch-engine.js)"
if [ -f "fixes/ruvector/patch-engine.js" ]; then
  if node fixes/ruvector/patch-engine.js; then
    echo "  OK: Engine patches applied"
  else
    echo "  INFO: patch-engine.js skipped or errored (non-fatal)"
  fi
else
  echo "  SKIP: fixes/ruvector/patch-engine.js not found (optional)"
fi

echo ""

fi  # end SECTION 2: PATCH

# ==========================================================================
# SECTION 3: RE-EMBED
# Fix memories with NULL or wrong-dimension embeddings.
# hooks pretrain does NOT use ONNX; pre-FIX-006 hooks produce 64d hash embeddings.
# v0.9.7: Added semantic edge count verification after consolidation.
# ==========================================================================
if [ "$SECTION" = "all" ] || [ "$SECTION" = "reembed" ]; then

echo "--- SECTION 3: RE-EMBED ---"
echo ""

echo "[8] Re-embed bad memories + set PRETRAIN_DONE + consolidate learning pipeline"
EXPECTED_BYTES=$((EMBED_DIM * 4))  # 384d = 1536 bytes, 768d = 3072 bytes

if [ -f ".ruvector/intelligence.db" ]; then
  # --- SQLite backend ---
  BAD_COUNT=$(node -e '
  var Database = require("better-sqlite3");
  var expected = parseInt(process.argv[1]) || 1536;
  var db = new Database(".ruvector/intelligence.db", { readonly: true });
  var nullRow = db.prepare("SELECT COUNT(*) as c FROM memories WHERE embedding IS NULL").get();
  var wrongRow = db.prepare("SELECT COUNT(*) as c FROM memories WHERE embedding IS NOT NULL AND length(embedding) != ?").bind(expected).get();
  db.close();
  console.log(JSON.stringify({ nullCount: nullRow.c, wrongDim: wrongRow.c, total: nullRow.c + wrongRow.c }));
  ' "$EXPECTED_BYTES" 2>/dev/null || echo '{"nullCount":0,"wrongDim":0,"total":0}')

  BAD_TOTAL=$(echo "$BAD_COUNT" | node -e 'var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf-8"));console.log(d.total)' 2>/dev/null || echo "0")
  NULL_N=$(echo "$BAD_COUNT" | node -e 'var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf-8"));console.log(d.nullCount)' 2>/dev/null || echo "0")
  WRONG_N=$(echo "$BAD_COUNT" | node -e 'var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf-8"));console.log(d.wrongDim)' 2>/dev/null || echo "0")

  if [ "$BAD_TOTAL" -gt 0 ] 2>/dev/null; then
    echo "  Fixing $BAD_TOTAL SQLite memories (${NULL_N} NULL, ${WRONG_N} wrong-dim)..."

    REEMBED_IDX=0
    node -e '
    var Database = require("better-sqlite3");
    var expected = parseInt(process.argv[1]) || 1536;
    var db = new Database(".ruvector/intelligence.db", { readonly: true });
    var rows = db.prepare("SELECT id, memory_type, content FROM memories WHERE embedding IS NULL OR (embedding IS NOT NULL AND length(embedding) != ?)").bind(expected).all();
    db.close();
    rows.forEach(function(r) {
      var summary = (r.content || "").substring(0, 200).replace(/\n/g, " ").replace(/"/g, "");
      console.log(JSON.stringify({ id: r.id, type: r.memory_type || "project", content: summary }));
    });
    ' "$EXPECTED_BYTES" 2>/dev/null | while IFS= read -r line; do
      REEMBED_IDX=$((REEMBED_IDX+1))
      MTYPE=$(echo "$line" | node -e 'var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf-8"));console.log(d.type)')
      MCONTENT=$(echo "$line" | node -e 'var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf-8"));console.log(d.content)')
      if npx ruvector hooks remember "$MCONTENT" -t "$MTYPE" --semantic --silent 2>/dev/null; then
        echo "    [${REEMBED_IDX}/${BAD_TOTAL}] re-embedded: ${MCONTENT:0:60}..."
      else
        echo "    [${REEMBED_IDX}/${BAD_TOTAL}] FAIL: could not re-embed: ${MCONTENT:0:60}..."
        ERRORS=$((ERRORS+1))
      fi
    done

    # Remove bad originals
    node -e '
    var Database = require("better-sqlite3");
    var expected = parseInt(process.argv[1]) || 1536;
    var db = new Database(".ruvector/intelligence.db");
    var before = db.prepare("SELECT COUNT(*) as c FROM memories").get().c;
    db.prepare("DELETE FROM memories WHERE embedding IS NULL OR (embedding IS NOT NULL AND length(embedding) != ?)").run(expected);
    var after = db.prepare("SELECT COUNT(*) as c FROM memories").get().c;
    db.prepare("INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)").run("pretrained", "true");
    db.prepare("INSERT OR REPLACE INTO stats (key, value) VALUES (?, ?)").run("total_memories", String(after));
    db.close();
    console.log("  Cleaned: removed " + (before - after) + " bad entries, " + after + " remain at " + (expected/4) + "d");
    ' "$EXPECTED_BYTES"
  else
    TOTAL=$(node -e 'var D=require("better-sqlite3");var db=new D(".ruvector/intelligence.db",{readonly:true});console.log(db.prepare("SELECT COUNT(*) as c FROM memories").get().c);db.close()' 2>/dev/null || echo "0")
    if [ "$TOTAL" -gt 0 ]; then
      echo "  OK: All $TOTAL SQLite memories have ${EMBED_DIM}d embeddings"
    else
      echo "  OK: No memories yet (run pretrain next)"
    fi
  fi

elif [ -f ".ruvector/intelligence.json" ]; then
  # --- JSON backend ---
  BAD_COUNT=$(node -e '
  var dim = parseInt(process.argv[1]) || 384;
  var d = JSON.parse(require("fs").readFileSync(".ruvector/intelligence.json", "utf-8"));
  var mems = d.memories || [];
  var nullN = mems.filter(function(m) { return m.embedding === null; }).length;
  var wrongN = mems.filter(function(m) { return m.embedding !== null && m.embedding.length !== dim; }).length;
  console.log(JSON.stringify({ nullCount: nullN, wrongDim: wrongN, total: nullN + wrongN }));
  ' "$EMBED_DIM" 2>/dev/null || echo '{"nullCount":0,"wrongDim":0,"total":0}')

  BAD_TOTAL=$(echo "$BAD_COUNT" | node -e 'var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf-8"));console.log(d.total)' 2>/dev/null || echo "0")
  NULL_N=$(echo "$BAD_COUNT" | node -e 'var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf-8"));console.log(d.nullCount)' 2>/dev/null || echo "0")
  WRONG_N=$(echo "$BAD_COUNT" | node -e 'var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf-8"));console.log(d.wrongDim)' 2>/dev/null || echo "0")

  if [ "$BAD_TOTAL" -gt 0 ] 2>/dev/null; then
    echo "  Fixing $BAD_TOTAL JSON memories (${NULL_N} NULL, ${WRONG_N} wrong-dim)..."

    REEMBED_IDX=0
    node -e '
    var dim = parseInt(process.argv[1]) || 384;
    var d = JSON.parse(require("fs").readFileSync(".ruvector/intelligence.json", "utf-8"));
    var bad = (d.memories || []).filter(function(m) { return m.embedding === null || (m.embedding !== null && m.embedding.length !== dim); });
    bad.forEach(function(m) {
      var summary = (m.content || "").substring(0, 200).replace(/\n/g, " ").replace(/"/g, "");
      console.log(JSON.stringify({ type: m.type || "project", content: summary }));
    });
    ' "$EMBED_DIM" 2>/dev/null | while IFS= read -r line; do
      REEMBED_IDX=$((REEMBED_IDX+1))
      MTYPE=$(echo "$line" | node -e 'var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf-8"));console.log(d.type)')
      MCONTENT=$(echo "$line" | node -e 'var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf-8"));console.log(d.content)')
      if npx ruvector hooks remember "$MCONTENT" -t "$MTYPE" --semantic --silent 2>/dev/null; then
        echo "    [${REEMBED_IDX}/${BAD_TOTAL}] re-embedded: ${MCONTENT:0:60}..."
      else
        echo "    [${REEMBED_IDX}/${BAD_TOTAL}] FAIL: could not re-embed: ${MCONTENT:0:60}..."
        ERRORS=$((ERRORS+1))
      fi
    done

    # Remove bad entries from JSON
    node -e '
    var fs = require("fs");
    var dim = parseInt(process.argv[1]) || 384;
    var d = JSON.parse(fs.readFileSync(".ruvector/intelligence.json", "utf-8"));
    var before = d.memories.length;
    d.memories = d.memories.filter(function(m) { return m.embedding !== null && m.embedding.length === dim; });
    if (!d.pretrained) d.pretrained = true;
    fs.writeFileSync(".ruvector/intelligence.json", JSON.stringify(d, null, 2));
    console.log("  Cleaned: removed " + (before - d.memories.length) + " bad entries, " + d.memories.length + " remain at " + dim + "d");
    ' "$EMBED_DIM"
  else
    TOTAL=$(node -e 'var d=JSON.parse(require("fs").readFileSync(".ruvector/intelligence.json","utf-8"));console.log((d.memories||[]).length)' 2>/dev/null || echo "0")
    if [ "$TOTAL" -gt 0 ]; then
      echo "  OK: All $TOTAL JSON memories have ${EMBED_DIM}d embeddings"
    else
      echo "  OK: No memories yet (run pretrain next)"
    fi
  fi

else
  echo "  OK: No memory store found (will be created during pretrain)"
fi

# Set PRETRAIN_DONE=true after successful re-embed
if [ $ERRORS -eq 0 ]; then
  node -e '
  var fs = require("fs");
  var s = JSON.parse(fs.readFileSync("'"$SETTINGS"'", "utf-8"));
  s.env = s.env || {};
  if (s.env.RUVECTOR_PRETRAIN_DONE !== "true") {
    s.env.RUVECTOR_PRETRAIN_DONE = "true";
    fs.writeFileSync("'"$SETTINGS"'", JSON.stringify(s, null, 2));
    console.log("  Fixed: RUVECTOR_PRETRAIN_DONE set to true");
  } else {
    console.log("  OK: RUVECTOR_PRETRAIN_DONE already true");
  }
  '
else
  echo "  SKIP: Re-embed had errors; PRETRAIN_DONE remains false"
fi

# v0.9.8: Consolidation moved to dedicated SECTION 4 (FIX-024)
# This ensures it runs even on fresh installs where DB may not exist yet
echo "  NOTE: Consolidation will run in Step 9 (SECTION 4)"

# v0.9.7: Verify semantic edge count after consolidation
echo "[8b] Semantic edge verification (v0.9.7)"
if [ -f ".ruvector/intelligence.db" ]; then
  SEMANTIC_THRESHOLD="${RUVECTOR_SEMANTIC_THRESHOLD:-0.55}"
  EDGE_COUNT=$(node -e "
    const db = require('better-sqlite3')('.ruvector/intelligence.db', { readonly: true });
    try {
      const row = db.prepare(\"SELECT COUNT(*) as c FROM edges WHERE json_extract(data, '\$.type') = 'semantic'\").get();
      console.log(row ? row.c : 0);
    } catch(e) {
      // Fallback: count edges where data contains 'semantic'
      try {
        const row = db.prepare(\"SELECT COUNT(*) as c FROM edges WHERE data LIKE '%semantic%'\").get();
        console.log(row ? row.c : 0);
      } catch(e2) {
        console.log(0);
      }
    }
    db.close();
  " 2>/dev/null || echo "0")

  MEMORY_COUNT=$(node -e "
    const db = require('better-sqlite3')('.ruvector/intelligence.db', { readonly: true });
    const row = db.prepare('SELECT COUNT(*) as c FROM memories').get();
    console.log(row ? row.c : 0);
    db.close();
  " 2>/dev/null || echo "0")

  if [ "$EDGE_COUNT" -lt 1 ] && [ "$MEMORY_COUNT" -gt 10 ]; then
    echo "  WARNING: Zero semantic edges detected with $MEMORY_COUNT memories."
    echo "    Current RUVECTOR_SEMANTIC_THRESHOLD: $SEMANTIC_THRESHOLD"
    echo "    Consider lowering threshold in .claude/settings.json if edges are expected."
    echo "    Example: Set RUVECTOR_SEMANTIC_THRESHOLD to 0.45 or 0.50"
  elif [ "$EDGE_COUNT" -gt 0 ]; then
    echo "  OK: $EDGE_COUNT semantic edge(s) found"
  else
    echo "  INFO: No semantic edges yet (will be created as memories accumulate)"
  fi
else
  echo "  SKIP: No database to verify semantic edges"
fi

echo ""

fi  # end SECTION 3: RE-EMBED

# ==========================================================================
# SECTION 4: CONSOLIDATE (v0.9.8 FIX-024)
# Populate learning pipeline tables from existing memories/trajectories.
# This step ensures neural_patterns, edges, agents tables are never empty.
# ==========================================================================
if [ "$SECTION" = "all" ]; then

echo "--- SECTION 4: CONSOLIDATE (FIX-024) ---"
echo ""

echo "[9] Populating learning pipeline (FIX-024)..."

if [ -f "scripts/post-process.js" ]; then
  # Register a setup agent (ensures agents table is not empty)
  if node scripts/post-process.js --event session-start --agent-name setup-agent 2>/dev/null; then
    echo "  OK: Registered setup-agent"
  else
    echo "  INFO: Agent registration returned non-zero (non-fatal)"
  fi

  # Run full consolidation (neural_patterns, edges, semantic edges)
  if [ -f ".ruvector/intelligence.db" ]; then
    echo "  Running learning pipeline consolidation..."
    if node scripts/post-process.js --event consolidate 2>/dev/null; then
      echo "  OK: Learning pipeline consolidated"
    else
      echo "  INFO: Consolidation returned non-zero (may need more data)"
    fi

    # v0.9.8 FIX-027: Sync stats table
    echo "[9b] Syncing stats table (FIX-027)..."
    node -e '
    var Database = require("better-sqlite3");
    var db = new Database(".ruvector/intelligence.db");
    try {
      var memCount = db.prepare("SELECT COUNT(*) as c FROM memories").get().c;
      var trajCount = db.prepare("SELECT COUNT(*) as c FROM trajectories").get().c;
      var patCount = db.prepare("SELECT COUNT(*) as c FROM patterns").get().c;
      var npCount = db.prepare("SELECT COUNT(*) as c FROM neural_patterns").get().c;
      var edgeCount = db.prepare("SELECT COUNT(*) as c FROM edges").get().c;
      var agentCount = db.prepare("SELECT COUNT(*) as c FROM agents").get().c;

      // Ensure stats table exists
      db.exec("CREATE TABLE IF NOT EXISTS stats (key TEXT PRIMARY KEY, value TEXT)");

      // Update all stats
      var update = db.prepare("INSERT OR REPLACE INTO stats (key, value) VALUES (?, ?)");
      update.run("total_memories", String(memCount));
      update.run("total_trajectories", String(trajCount));
      update.run("total_patterns", String(patCount));
      update.run("total_neural_patterns", String(npCount));
      update.run("total_edges", String(edgeCount));
      update.run("total_agents", String(agentCount));
      update.run("last_consolidate", new Date().toISOString());
      update.run("setup_version", "v0.9.8");

      console.log("  OK: Stats synced (memories=" + memCount + " patterns=" + patCount + " edges=" + edgeCount + ")");
    } catch (e) {
      console.log("  INFO: Stats sync skipped:", e.message);
    }
    db.close();
    ' 2>/dev/null || echo "  INFO: Stats sync not available"

    # v0.9.9 FIX-030: Run SONA consolidate
    echo "[9b2] Running SONA consolidation (FIX-030)..."
    if [ -f "scripts/sona-consolidate.js" ]; then
      if node scripts/sona-consolidate.js 2>/dev/null; then
        echo "  OK: SONA consolidation complete"
      else
        echo "  INFO: SONA consolidation returned non-zero (may need more data)"
      fi
    else
      echo "  SKIP: scripts/sona-consolidate.js not found (copy from skill)"
    fi

    # v0.9.8 FIX-025: Verify embedding dimensions
    echo "[9c] Embedding dimension verification (FIX-025)..."
    EXPECTED_BYTES=$((EMBED_DIM * 4))
    node -e "
    var Database = require('better-sqlite3');
    var expected = $EXPECTED_BYTES;
    var db = new Database('.ruvector/intelligence.db', { readonly: true });
    var total = db.prepare('SELECT COUNT(*) as c FROM memories WHERE embedding IS NOT NULL').get().c;
    var wrong = db.prepare('SELECT COUNT(*) as c FROM memories WHERE embedding IS NOT NULL AND length(embedding) != ?').bind(expected).get().c;
    db.close();
    if (wrong > 0) {
      console.log('  WARNING: ' + wrong + '/' + total + ' memories have wrong dimension (expected ' + (expected/4) + 'd = ' + expected + ' bytes)');
      console.log('    Run: bash scripts/setup.sh --section reembed');
      process.exit(1);
    } else if (total > 0) {
      console.log('  OK: All ' + total + ' memories have correct ' + (expected/4) + 'd embeddings');
    } else {
      console.log('  INFO: No embeddings yet (run pretrain next)');
    }
    " 2>/dev/null || echo "  INFO: Dimension verification not available"

    # v0.9.9 FIX-031: Patch Stop hook to call consolidate + SONA
    echo "[9d] Patching Stop hook for SONA pipeline (FIX-031)..."
    node -e '
    var fs = require("fs");
    var SETTINGS_PATH = "'"$SETTINGS"'";
    var s = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
    var hooks = s.hooks || {};
    var stopHooks = hooks.Stop || [];
    var changed = false;

    // Check if consolidate call already exists in Stop hooks
    var hasConsolidate = stopHooks.some(function(entry) {
      var innerHooks = entry.hooks || [entry];
      return innerHooks.some(function(h) {
        return h.command && (h.command.indexOf("consolidate") !== -1 || h.command.indexOf("sona-consolidate") !== -1);
      });
    });

    if (!hasConsolidate && stopHooks.length > 0) {
      // Find the first Stop hook entry and add consolidate before session-end
      var firstEntry = stopHooks[0];
      var innerHooks = firstEntry.hooks || [];

      // Add consolidate hook with 2s timeout (before session-end)
      var consolidateHook = {
        type: "command",
        timeout: 2000,
        command: "node scripts/post-process.js --event consolidate 2>/dev/null && node scripts/sona-consolidate.js 2>/dev/null || true"
      };

      // Find session-end hook index and insert before it
      var sessionEndIdx = innerHooks.findIndex(function(h) { return h.command && h.command.indexOf("session-end") !== -1; });
      if (sessionEndIdx >= 0) {
        innerHooks.splice(sessionEndIdx, 0, consolidateHook);
      } else {
        // No session-end found, prepend
        innerHooks.unshift(consolidateHook);
      }

      firstEntry.hooks = innerHooks;
      changed = true;
    }

    if (changed) {
      fs.writeFileSync(SETTINGS_PATH, JSON.stringify(s, null, 2));
      console.log("  Fixed: Added consolidate + SONA to Stop hook");
    } else if (hasConsolidate) {
      console.log("  OK: Stop hook already has consolidate/SONA call");
    } else {
      console.log("  SKIP: No Stop hooks found to patch");
    }
    ' 2>/dev/null || echo "  INFO: Stop hook patching not available"

    # v0.9.9 FIX-035: Copy viz server utilities (db-paths.js, safe-number.js)
    echo "[9e] Installing viz server utilities (FIX-035, FIX-036)..."
    SKILL_TEMPLATES="${SKILL_PATH:-/mnt/data/dev/CFV3/howto_V3+RV_Skill/v0.9.9}/scripts/templates"

    if [ -d "viz/server" ]; then
      # Create config and utils directories
      mkdir -p viz/server/config viz/server/utils

      # Copy db-paths.js if template exists
      if [ -f "$SKILL_TEMPLATES/db-paths.js" ]; then
        cp "$SKILL_TEMPLATES/db-paths.js" viz/server/config/
        echo "  OK: Copied db-paths.js to viz/server/config/"
      elif [ -f "scripts/templates/db-paths.js" ]; then
        cp "scripts/templates/db-paths.js" viz/server/config/
        echo "  OK: Copied db-paths.js from local templates"
      else
        echo "  INFO: db-paths.js template not found (create manually if needed)"
      fi

      # Copy safe-number.js if template exists
      if [ -f "$SKILL_TEMPLATES/safe-number.js" ]; then
        cp "$SKILL_TEMPLATES/safe-number.js" viz/server/utils/
        echo "  OK: Copied safe-number.js to viz/server/utils/"
      elif [ -f "scripts/templates/safe-number.js" ]; then
        cp "scripts/templates/safe-number.js" viz/server/utils/
        echo "  OK: Copied safe-number.js from local templates"
      else
        echo "  INFO: safe-number.js template not found (create manually if needed)"
      fi
    else
      echo "  SKIP: viz/server directory not found (viz utilities not applicable)"
    fi

    # v0.9.9 FIX-037: Fix vector_indexes dimensions (768 -> 384)
    echo "[9f] Fixing vector_indexes dimensions (FIX-037)..."
    for MEMDB in ".swarm/memory.db" ".claude/memory.db"; do
      if [ -f "$MEMDB" ]; then
        node -e "
        var Database = require('better-sqlite3');
        var db = new Database('$MEMDB');
        try {
          var updated = db.prepare('UPDATE vector_indexes SET dimensions = 384 WHERE dimensions = 768').run();
          if (updated.changes > 0) {
            console.log('  Fixed: $MEMDB vector_indexes updated to 384d (' + updated.changes + ' rows)');
          } else {
            console.log('  OK: $MEMDB vector_indexes already 384d');
          }
        } catch(e) {
          console.log('  SKIP: $MEMDB - ' + e.message);
        }
        db.close();
        " 2>/dev/null || echo "  INFO: Could not update $MEMDB"
      fi
    done

  else
    echo "  SKIP: No intelligence.db yet (run pretrain to create)"
  fi
else
  echo "  WARNING: scripts/post-process.js not found"
  echo "  Learning pipeline will not be populated"
fi

echo ""

fi  # end SECTION 4: CONSOLIDATE

# ==========================================================================
# SUMMARY
# ==========================================================================
echo ""
echo "=========================================="
if [ $ERRORS -gt 0 ]; then
  echo " FAILED: $ERRORS error(s) -- fix and re-run"
  echo " bash scripts/setup.sh ${EMBED_MODEL} ${EMBED_DIM} --section ${SECTION}"
  echo "=========================================="
  exit 1
else
  case "$SECTION" in
    all)       echo " DONE: all steps passed (v0.9.9)" ;;
    configure) echo " DONE: configure passed" ;;
    patch)     echo " DONE: patch passed" ;;
    reembed)   echo " DONE: reembed passed" ;;
  esac
  echo ""
  echo " v0.9.9 Session & Agent Tracking Fixes:"
  echo "   - FIX-028: pre-command handler added to bridge"
  echo "   - FIX-029: session-end handler with consolidate + SONA"
  echo "   - FIX-030: sona-consolidate.js bridges neural→compressed"
  echo "   - FIX-031: Stop hook patched for SONA pipeline"
  echo "   - FIX-032: Session tracking (last_session, session_count++)"
  echo "   - FIX-033: Agent registration (dual-schema support)"
  echo "   - FIX-034: Agents table name index for lookups"
  echo "   - FIX-035: db-paths.js centralized DB config"
  echo "   - FIX-036: safe-number.js NaN/Infinity protection"
  echo "   - FIX-037: vector_indexes dimension alignment (768→384)"
  echo ""
  echo " v0.9.8 Improvements:"
  echo "   - FIX-024: Learning pipeline consolidation"
  echo "   - FIX-025: Embedding dimension verification"
  echo "   - FIX-027: Stats table sync"
  echo ""
  echo " Embedding dimension: All indexes use ${EMBED_DIM}d (384d default)"
  echo "=========================================="
fi
