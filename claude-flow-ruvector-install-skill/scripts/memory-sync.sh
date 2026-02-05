#!/usr/bin/env bash
# memory-sync.sh — Cross-package memory synchronization
#
# Bridges the 4 fragmented memory stores in the claude-flow + ruvector ecosystem.
# Run at session-end or periodically to keep knowledge bases aligned.
#
# The 4 stores (per Agent 4's ecosystem-integration-analysis.md):
#   1. .swarm/memory.db        — claude-flow SQLite (sql.js WASM)
#   2. .ruvector/intelligence.json — ruvector JSON (Q-tables, patterns, memories)
#   3. .agentic-qe/memory.db   — agentic-qe SQLite (better-sqlite3 native)
#   4. agentdb graph store      — graph DB with Cypher (via agentic-flow)
#
# Usage: ./memory-sync.sh [--dry-run] [--verbose] [--direction both|rv-to-cf|cf-to-rv]
#
# Version: v0.7 | Generated: 2026-01-31
set -euo pipefail

# --- Colors ---
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# --- Defaults ---
DRY_RUN=false
VERBOSE=false
DIRECTION="both"
SYNCED_RV_TO_CF=0
SYNCED_CF_TO_RV=0
SYNCED_QE_TO_CF=0
SKIPPED=0
ERRORS=0
BACKUP_DIR=".memory-sync-backups/$(date +%Y%m%d-%H%M%S)"

# --- Store paths ---
CF_MEMORY=".swarm/memory.db"
RV_INTELLIGENCE=".ruvector/intelligence.json"
QE_MEMORY=".agentic-qe/memory.db"

# --- Output helpers (match validate-setup.sh style) ---
info()  { echo -e "  ${CYAN}INFO${NC}  $1"; }
ok()    { echo -e "  ${GREEN}OK${NC}    $1"; }
warn()  { echo -e "  ${YELLOW}WARN${NC}  $1"; SKIPPED=$((SKIPPED+1)); }
fail()  { echo -e "  ${RED}FAIL${NC}  $1"; ERRORS=$((ERRORS+1)); }
vlog()  { [ "$VERBOSE" = true ] && echo -e "  ${CYAN}...${NC}   $1" || true; }
dry()   { echo -e "  ${YELLOW}DRY${NC}   $1"; }
section() { echo ""; echo -e "${BOLD}--- $1 ---${NC}"; }

# --- Parse arguments ---
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)   DRY_RUN=true; shift ;;
    --verbose)   VERBOSE=true; shift ;;
    --direction)
      shift
      case "${1:-}" in
        both|rv-to-cf|cf-to-rv) DIRECTION="$1" ;;
        *) echo -e "${RED}ERROR: --direction must be both|rv-to-cf|cf-to-rv${NC}"; exit 1 ;;
      esac
      shift ;;
    -h|--help)
      echo "Usage: $0 [--dry-run] [--verbose] [--direction both|rv-to-cf|cf-to-rv]"
      echo ""
      echo "Options:"
      echo "  --dry-run     Show what WOULD be synced without writing"
      echo "  --verbose     Show detailed output for each operation"
      echo "  --direction   Sync direction (default: both)"
      echo "                  both     - bidirectional sync"
      echo "                  rv-to-cf - ruvector -> claude-flow only"
      echo "                  cf-to-rv - claude-flow -> ruvector only"
      exit 0 ;;
    *) echo -e "${RED}Unknown option: $1${NC}"; exit 1 ;;
  esac
done

echo -e "${BOLD}=== Memory Sync ($(date)) ===${NC}"
echo -e "  Direction: ${CYAN}${DIRECTION}${NC} | Dry run: ${CYAN}${DRY_RUN}${NC} | Verbose: ${CYAN}${VERBOSE}${NC}"

# ─────────────────────────────────────────────────────────
# Phase 1: Check prerequisites — verify stores exist
# ─────────────────────────────────────────────────────────
section "Phase 1: Store Availability"

CF_AVAILABLE=false
RV_AVAILABLE=false
QE_AVAILABLE=false

# Check claude-flow memory
if [ -f "$CF_MEMORY" ]; then
  CF_SIZE=$(ls -lh "$CF_MEMORY" 2>/dev/null | awk '{print $5}')
  ok "claude-flow memory: $CF_MEMORY ($CF_SIZE)"
  CF_AVAILABLE=true
else
  # Try initializing if the CLI is available
  if npx @claude-flow/cli@latest --version >/dev/null 2>&1; then
    warn "claude-flow memory not initialized ($CF_MEMORY missing)"
    info "Attempting: npx @claude-flow/cli@latest memory init --force"
    if [ "$DRY_RUN" = false ]; then
      if npx @claude-flow/cli@latest memory init --force 2>/dev/null; then
        ok "claude-flow memory initialized"
        CF_AVAILABLE=true
      else
        fail "Could not initialize claude-flow memory"
      fi
    else
      dry "Would initialize claude-flow memory"
    fi
  else
    warn "claude-flow CLI not available — skipping claude-flow memory"
  fi
fi

# Check ruvector intelligence
if [ -f "$RV_INTELLIGENCE" ]; then
  RV_SIZE=$(ls -lh "$RV_INTELLIGENCE" 2>/dev/null | awk '{print $5}')
  RV_MEMORIES=$(node -e 'try{var d=JSON.parse(require("fs").readFileSync("'"$RV_INTELLIGENCE"'"));console.log((d.memories||[]).length)}catch(e){console.log(0)}' 2>/dev/null || echo "0")
  RV_PATTERNS=$(node -e 'try{var d=JSON.parse(require("fs").readFileSync("'"$RV_INTELLIGENCE"'"));console.log((d.patterns||[]).length)}catch(e){console.log(0)}' 2>/dev/null || echo "0")
  ok "ruvector intelligence: $RV_INTELLIGENCE ($RV_SIZE, ${RV_MEMORIES} memories, ${RV_PATTERNS} patterns)"
  RV_AVAILABLE=true
else
  warn "ruvector intelligence not found ($RV_INTELLIGENCE) — skipping ruvector store"
fi

# Check agentic-qe memory
if [ -f "$QE_MEMORY" ]; then
  QE_SIZE=$(ls -lh "$QE_MEMORY" 2>/dev/null | awk '{print $5}')
  ok "agentic-qe memory: $QE_MEMORY ($QE_SIZE)"
  QE_AVAILABLE=true
else
  warn "agentic-qe memory not found ($QE_MEMORY) — skipping QE store"
fi

# Check agentdb (best-effort — no standard file location)
if npx agentdb --version >/dev/null 2>&1; then
  ok "agentdb CLI available (graph store)"
  vlog "agentdb integration is read-only in this version"
else
  vlog "agentdb CLI not available — graph store not synced"
fi

# Guard: need at least 2 stores for sync
STORE_COUNT=0
[ "$CF_AVAILABLE" = true ] && STORE_COUNT=$((STORE_COUNT+1))
[ "$RV_AVAILABLE" = true ] && STORE_COUNT=$((STORE_COUNT+1))
[ "$QE_AVAILABLE" = true ] && STORE_COUNT=$((STORE_COUNT+1))

if [ "$STORE_COUNT" -lt 2 ]; then
  echo ""
  echo -e "${YELLOW}Only $STORE_COUNT store(s) available. Need at least 2 for sync. Nothing to do.${NC}"
  exit 0
fi

# ─────────────────────────────────────────────────────────
# Phase 2: Create backups
# ─────────────────────────────────────────────────────────
section "Phase 2: Backups"

if [ "$DRY_RUN" = false ]; then
  mkdir -p "$BACKUP_DIR"
  if [ "$RV_AVAILABLE" = true ]; then
    cp "$RV_INTELLIGENCE" "$BACKUP_DIR/intelligence.json"
    ok "Backed up $RV_INTELLIGENCE"
  fi
  if [ "$CF_AVAILABLE" = true ] && [ -f "$CF_MEMORY" ]; then
    cp "$CF_MEMORY" "$BACKUP_DIR/cf-memory.db"
    ok "Backed up $CF_MEMORY"
  fi
  if [ "$QE_AVAILABLE" = true ]; then
    cp "$QE_MEMORY" "$BACKUP_DIR/qe-memory.db"
    ok "Backed up $QE_MEMORY"
  fi
  info "Backups saved to $BACKUP_DIR"
else
  dry "Would create backups in $BACKUP_DIR"
fi

# ─────────────────────────────────────────────────────────
# Phase 3: ruvector -> claude-flow
# ─────────────────────────────────────────────────────────
if [ "$DIRECTION" = "both" ] || [ "$DIRECTION" = "rv-to-cf" ]; then
  section "Phase 3: ruvector -> claude-flow"

  if [ "$RV_AVAILABLE" = true ] && [ "$CF_AVAILABLE" = true ]; then

    # 3a: Extract Q-table summaries from intelligence.json
    vlog "Extracting Q-table entries from intelligence.json"
    QTABLE_DATA=$(node -e '
    try {
      var d = JSON.parse(require("fs").readFileSync("'"$RV_INTELLIGENCE"'"));
      var results = [];
      // Extract Q-table algorithm stats
      if (d.learning && d.learning.stats) {
        Object.keys(d.learning.stats).forEach(function(algo) {
          var s = d.learning.stats[algo];
          if (s.updates > 0) {
            results.push({ algo: algo, updates: s.updates, avgReward: s.avgReward || 0 });
          }
        });
      }
      // Extract recent routing decisions from memories tagged "route"
      if (d.memories && d.memories.length > 0) {
        var routeMems = d.memories.filter(function(m) {
          return m.tags && (m.tags.indexOf("route") !== -1 || m.tags.indexOf("routing") !== -1);
        }).slice(-10);
        results.push({ recentRoutes: routeMems.length });
      }
      console.log(JSON.stringify(results));
    } catch(e) {
      console.log("[]");
    }
    ' 2>/dev/null || echo "[]")

    if [ "$QTABLE_DATA" != "[]" ] && [ -n "$QTABLE_DATA" ]; then
      SYNC_KEY="rv-qtable-sync-$(date +%s)"
      if [ "$DRY_RUN" = false ]; then
        if npx @claude-flow/cli@latest memory store \
          --key "$SYNC_KEY" \
          --value "$QTABLE_DATA" \
          --namespace cross-sync 2>/dev/null; then
          ok "Q-table data synced to claude-flow (key: $SYNC_KEY)"
          SYNCED_RV_TO_CF=$((SYNCED_RV_TO_CF+1))
        else
          fail "Could not store Q-table data in claude-flow memory"
        fi
      else
        dry "Would store Q-table data as $SYNC_KEY in cross-sync namespace"
        vlog "Data: $QTABLE_DATA"
        SYNCED_RV_TO_CF=$((SYNCED_RV_TO_CF+1))
      fi
    else
      vlog "No Q-table data to sync (cold start or no updates)"
    fi

    # 3b: Extract successful pattern associations
    vlog "Extracting pattern associations from intelligence.json"
    PATTERN_DATA=$(node -e '
    try {
      var d = JSON.parse(require("fs").readFileSync("'"$RV_INTELLIGENCE"'"));
      var patterns = [];
      if (d.patterns && d.patterns.length > 0) {
        d.patterns.forEach(function(p) {
          patterns.push({
            name: p.name || p.id || "unnamed",
            type: p.type || "general",
            confidence: p.confidence || 0,
            count: p.count || 1
          });
        });
      }
      console.log(JSON.stringify(patterns));
    } catch(e) {
      console.log("[]");
    }
    ' 2>/dev/null || echo "[]")

    if [ "$PATTERN_DATA" != "[]" ] && [ -n "$PATTERN_DATA" ]; then
      SYNC_KEY="rv-patterns-sync-$(date +%s)"
      if [ "$DRY_RUN" = false ]; then
        if npx @claude-flow/cli@latest memory store \
          --key "$SYNC_KEY" \
          --value "$PATTERN_DATA" \
          --namespace cross-sync 2>/dev/null; then
          ok "Pattern data synced to claude-flow (key: $SYNC_KEY)"
          SYNCED_RV_TO_CF=$((SYNCED_RV_TO_CF+1))
        else
          fail "Could not store pattern data in claude-flow memory"
        fi
      else
        dry "Would store pattern data as $SYNC_KEY in cross-sync namespace"
        vlog "Patterns: $(echo "$PATTERN_DATA" | node -e 'var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf8"));console.log(d.length+" patterns")' 2>/dev/null || echo "$PATTERN_DATA")"
        SYNCED_RV_TO_CF=$((SYNCED_RV_TO_CF+1))
      fi
    else
      vlog "No pattern data to sync"
    fi

    # 3c: Extract recent memories (last 20 non-init memories)
    vlog "Extracting recent memories from intelligence.json"
    MEMORY_DATA=$(node -e '
    try {
      var d = JSON.parse(require("fs").readFileSync("'"$RV_INTELLIGENCE"'"));
      var mems = [];
      if (d.memories && d.memories.length > 0) {
        var recent = d.memories
          .filter(function(m) { return m.tags && m.tags.indexOf("init") === -1; })
          .slice(-20);
        recent.forEach(function(m) {
          mems.push({
            content: (m.content || "").substring(0, 200),
            tags: m.tags || [],
            timestamp: m.timestamp || null
          });
        });
      }
      console.log(JSON.stringify(mems));
    } catch(e) {
      console.log("[]");
    }
    ' 2>/dev/null || echo "[]")

    MEMORY_COUNT=$(echo "$MEMORY_DATA" | node -e 'try{var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf8"));console.log(d.length)}catch(e){console.log(0)}' 2>/dev/null || echo "0")

    if [ "$MEMORY_COUNT" -gt 0 ]; then
      SYNC_KEY="rv-memories-sync-$(date +%s)"
      if [ "$DRY_RUN" = false ]; then
        if npx @claude-flow/cli@latest memory store \
          --key "$SYNC_KEY" \
          --value "$MEMORY_DATA" \
          --namespace cross-sync 2>/dev/null; then
          ok "$MEMORY_COUNT memories synced to claude-flow (key: $SYNC_KEY)"
          SYNCED_RV_TO_CF=$((SYNCED_RV_TO_CF+1))
        else
          fail "Could not store memories in claude-flow memory"
        fi
      else
        dry "Would store $MEMORY_COUNT memories as $SYNC_KEY"
        SYNCED_RV_TO_CF=$((SYNCED_RV_TO_CF+1))
      fi
    else
      vlog "No non-init memories to sync"
    fi

  else
    if [ "$RV_AVAILABLE" = false ]; then warn "Skipping rv->cf: ruvector store unavailable"; fi
    if [ "$CF_AVAILABLE" = false ]; then warn "Skipping rv->cf: claude-flow store unavailable"; fi
  fi
fi

# ─────────────────────────────────────────────────────────
# Phase 4: claude-flow -> ruvector
# ─────────────────────────────────────────────────────────
if [ "$DIRECTION" = "both" ] || [ "$DIRECTION" = "cf-to-rv" ]; then
  section "Phase 4: claude-flow -> ruvector"

  if [ "$CF_AVAILABLE" = true ] && [ "$RV_AVAILABLE" = true ]; then

    # 4a: Search claude-flow for successful patterns
    vlog "Querying claude-flow memory for successful patterns"
    CF_PATTERNS=$(npx @claude-flow/cli@latest memory search \
      --query "successful pattern" \
      --namespace patterns \
      --limit 20 2>/dev/null || echo "")

    if [ -n "$CF_PATTERNS" ] && [ "$CF_PATTERNS" != "No results found" ] && [ "$CF_PATTERNS" != "[]" ]; then
      vlog "Found claude-flow patterns to sync"

      if [ "$DRY_RUN" = false ]; then
        # Append claude-flow patterns to intelligence.json memories
        node -e '
        var fs = require("fs");
        var cfData = process.argv[1];
        try {
          var d = JSON.parse(fs.readFileSync("'"$RV_INTELLIGENCE"'"));
          d.memories = d.memories || [];
          // Add a sync marker memory
          // WARNING: embedding is null here. After sync, run:
          //   npx ruvector hooks remember "re-embed synced" --semantic
          // to generate real ONNX embeddings. Without this, synced memories
          // are invisible to semantic search (the NULL-embedding problem).
          d.memories.push({
            content: "cf-sync: " + cfData.substring(0, 500),
            tags: ["cf-sync", "cross-sync", "needs-reembed"],
            timestamp: Date.now(),
            embedding: null
          });
          fs.writeFileSync("'"$RV_INTELLIGENCE"'", JSON.stringify(d, null, 2));
          console.log("Synced claude-flow patterns to ruvector intelligence");
          process.exit(0);
        } catch(e) {
          console.error("Error: " + e.message);
          process.exit(1);
        }
        ' "$CF_PATTERNS" 2>/dev/null && {
          ok "claude-flow patterns synced to ruvector"
          SYNCED_CF_TO_RV=$((SYNCED_CF_TO_RV+1))
        } || {
          fail "Could not write claude-flow patterns to ruvector intelligence"
        }
      else
        dry "Would append claude-flow patterns to intelligence.json"
        SYNCED_CF_TO_RV=$((SYNCED_CF_TO_RV+1))
      fi
    else
      vlog "No claude-flow patterns found (namespace 'patterns' may be empty)"
    fi

    # 4b: Search claude-flow for cross-sync entries (from previous syncs)
    vlog "Querying claude-flow memory for previous cross-sync data"
    CF_CROSS=$(npx @claude-flow/cli@latest memory search \
      --query "cross-sync" \
      --namespace cross-sync \
      --limit 5 2>/dev/null || echo "")

    if [ -n "$CF_CROSS" ] && [ "$CF_CROSS" != "No results found" ] && [ "$CF_CROSS" != "[]" ]; then
      vlog "Found existing cross-sync history ($CF_CROSS)"
    else
      vlog "No previous cross-sync entries"
    fi

  else
    if [ "$CF_AVAILABLE" = false ]; then warn "Skipping cf->rv: claude-flow store unavailable"; fi
    if [ "$RV_AVAILABLE" = false ]; then warn "Skipping cf->rv: ruvector store unavailable"; fi
  fi
fi

# ─────────────────────────────────────────────────────────
# Phase 5: agentic-qe -> claude-flow (one-directional)
# ─────────────────────────────────────────────────────────
if [ "$QE_AVAILABLE" = true ] && [ "$CF_AVAILABLE" = true ]; then
  section "Phase 5: agentic-qe -> claude-flow"

  # Try agentic-qe's export mechanism
  vlog "Attempting agentic-qe memory export"
  QE_EXPORT=$(npx agentic-qe memory export --format json 2>/dev/null || echo "")

  if [ -n "$QE_EXPORT" ] && [ "$QE_EXPORT" != "[]" ] && [ "$QE_EXPORT" != "{}" ]; then
    SYNC_KEY="qe-sync-$(date +%s)"
    if [ "$DRY_RUN" = false ]; then
      if npx @claude-flow/cli@latest memory store \
        --key "$SYNC_KEY" \
        --value "$QE_EXPORT" \
        --namespace cross-sync 2>/dev/null; then
        ok "agentic-qe data synced to claude-flow (key: $SYNC_KEY)"
        SYNCED_QE_TO_CF=$((SYNCED_QE_TO_CF+1))
      else
        fail "Could not store QE data in claude-flow memory"
      fi
    else
      dry "Would store agentic-qe export as $SYNC_KEY"
      SYNCED_QE_TO_CF=$((SYNCED_QE_TO_CF+1))
    fi
  else
    # Fallback: try hooks search for QE patterns
    vlog "QE export unavailable, trying hooks search fallback"
    QE_PATTERNS=$(npx agentic-qe hooks search --query "learned pattern" --limit 10 2>/dev/null || echo "")

    if [ -n "$QE_PATTERNS" ] && [ "$QE_PATTERNS" != "[]" ]; then
      SYNC_KEY="qe-patterns-sync-$(date +%s)"
      if [ "$DRY_RUN" = false ]; then
        if npx @claude-flow/cli@latest memory store \
          --key "$SYNC_KEY" \
          --value "$QE_PATTERNS" \
          --namespace cross-sync 2>/dev/null; then
          ok "agentic-qe patterns synced to claude-flow (key: $SYNC_KEY)"
          SYNCED_QE_TO_CF=$((SYNCED_QE_TO_CF+1))
        else
          fail "Could not store QE patterns in claude-flow memory"
        fi
      else
        dry "Would store QE patterns as $SYNC_KEY"
        SYNCED_QE_TO_CF=$((SYNCED_QE_TO_CF+1))
      fi
    else
      vlog "No QE patterns to sync (ReasoningBank may only have foundational patterns)"
    fi
  fi
else
  if [ "$QE_AVAILABLE" = true ] || [ "$CF_AVAILABLE" = true ]; then
    vlog "Skipping QE sync (need both agentic-qe and claude-flow available)"
  fi
fi

# ─────────────────────────────────────────────────────────
# Phase 6: Record sync event
# ─────────────────────────────────────────────────────────
section "Phase 6: Sync Record"

SYNC_SUMMARY=$(cat <<EOJSON
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "direction": "$DIRECTION",
  "dry_run": $DRY_RUN,
  "rv_to_cf": $SYNCED_RV_TO_CF,
  "cf_to_rv": $SYNCED_CF_TO_RV,
  "qe_to_cf": $SYNCED_QE_TO_CF,
  "skipped": $SKIPPED,
  "errors": $ERRORS,
  "stores_available": {
    "claude_flow": $CF_AVAILABLE,
    "ruvector": $RV_AVAILABLE,
    "agentic_qe": $QE_AVAILABLE
  }
}
EOJSON
)

if [ "$DRY_RUN" = false ]; then
  # Store sync record in claude-flow
  if [ "$CF_AVAILABLE" = true ]; then
    npx @claude-flow/cli@latest memory store \
      --key "sync-record-$(date +%s)" \
      --value "$SYNC_SUMMARY" \
      --namespace cross-sync 2>/dev/null && \
      vlog "Sync record stored in claude-flow memory" || \
      vlog "Could not store sync record (non-critical)"
  fi

  # Append to ruvector intelligence as a sync marker
  if [ "$RV_AVAILABLE" = true ]; then
    node -e '
    var fs = require("fs");
    try {
      var d = JSON.parse(fs.readFileSync("'"$RV_INTELLIGENCE"'"));
      d.lastSync = {
        timestamp: new Date().toISOString(),
        direction: "'"$DIRECTION"'",
        rvToCf: '"$SYNCED_RV_TO_CF"',
        cfToRv: '"$SYNCED_CF_TO_RV"',
        qeToCf: '"$SYNCED_QE_TO_CF"'
      };
      fs.writeFileSync("'"$RV_INTELLIGENCE"'", JSON.stringify(d, null, 2));
    } catch(e) {}
    ' 2>/dev/null
    vlog "Sync timestamp written to intelligence.json"
  fi
fi

# ─────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}=== Sync Summary ===${NC}"
echo ""
TOTAL=$((SYNCED_RV_TO_CF + SYNCED_CF_TO_RV + SYNCED_QE_TO_CF))
echo -e "  ruvector -> claude-flow:  ${GREEN}${SYNCED_RV_TO_CF}${NC} transfers"
echo -e "  claude-flow -> ruvector:  ${GREEN}${SYNCED_CF_TO_RV}${NC} transfers"
echo -e "  agentic-qe -> claude-flow: ${GREEN}${SYNCED_QE_TO_CF}${NC} transfers"
echo -e "  Skipped:                  ${YELLOW}${SKIPPED}${NC}"
echo -e "  Errors:                   ${RED}${ERRORS}${NC}"
echo ""

if [ "$DRY_RUN" = true ]; then
  echo -e "  ${YELLOW}DRY RUN — no changes were made.${NC}"
  echo -e "  Run without --dry-run to apply sync."
elif [ "$ERRORS" -gt 0 ]; then
  echo -e "  ${RED}Completed with $ERRORS error(s). Check output above.${NC}"
  echo -e "  Backups are at: $BACKUP_DIR"
  exit 1
elif [ "$TOTAL" -eq 0 ]; then
  echo -e "  ${YELLOW}No data to sync (stores may be empty or already aligned).${NC}"
else
  echo -e "  ${GREEN}$TOTAL total transfer(s) completed successfully.${NC}"
  echo -e "  Backups at: $BACKUP_DIR"
fi

exit 0
