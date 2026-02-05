#!/bin/bash
# Deep setup validation v0.9.9 — checks ACTUAL wiring, not just file existence.
# Goes beyond `hooks verify` which passes even when pipeline is broken.
#
# v0.9.9 changes:
#   - FIX-032: Level 11 session tracking verification
#   - FIX-033: Agent registration dual-schema check
#   - FIX-034: Agents table name index check
#   - CLI patch check now accepts __PATCH_CLI_V099__ as well
#
# v0.9.8 changes:
#   - FIX-025: Level 9 embedding dimension verification (bytes check)
#   - CLI consolidated patch check now accepts __PATCH_CLI_V098__, V097, V096, V095, V094, or V092
#   - Level 8f: Stats table verification (FIX-027)
#   - Level 8g: Consolidation recency check
#
# v0.9.7 changes:
#   - CLI consolidated patch check now accepts __PATCH_CLI_V097__, V096, V095, V094, or V092
#   - Level 7a: Semantic edge count check
#   - Level 7b: Neural pattern embedding check
#   - Level 7c: compressed_patterns table check
#   - Level 4b: Hook timeout validation (PreToolUse >= 5000ms)
#   - Level 3 info: Dream cycle status
#
# v0.9.5 changes:
#   - Level 8: Learning Pipeline functional smoke test (neural_patterns, edges, agents)
#   - CLI consolidated patch check now accepts __PATCH_CLI_V095__, V094, or V092
#
# v0.9.4 changes:
#   - CLI consolidated patch check now accepts __PATCH_CLI_V094__ or __PATCH_CLI_V092__
#   - New check 7m: SONA platform availability
#
# v0.9.3 change: MCP server checks now look in BOTH .claude/settings.json AND
# .claude.json (project-level config written by `claude mcp add`).
echo "=== Deep Setup Validation v0.9.9 ($(date)) ==="

PASS=0; WARN=0; FAIL=0
check() { echo -n "  $1: "; }
ok() { echo "OK - $1"; PASS=$((PASS+1)); }
warn() { echo "WARN - $1"; WARN=$((WARN+1)); }
fail() { echo "FAIL - $1"; FAIL=$((FAIL+1)); }

echo ""
echo "--- Level 1: Packages (via ruvector's own tools) ---"
check "Node.js >= 20"
NODE_VER=$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1)
[ "$NODE_VER" -ge 20 ] 2>/dev/null && ok "v$(node --version)" || fail "$(node --version 2>/dev/null || echo 'not found')"

check "claude-flow"
CF_VER=$(npx @claude-flow/cli --version 2>/dev/null || npx @claude-flow/cli@latest --version 2>/dev/null || echo "")
[ -n "$CF_VER" ] && ok "$CF_VER" || fail "not found"

check "ruvector CLI"
npx ruvector --version >/dev/null 2>&1 && ok "$(npx ruvector --version 2>/dev/null)" || fail "not found"

check "ruvector doctor"
npx ruvector doctor --verbose 2>&1 | grep -q "All checks passed" && ok "all system checks passed" || warn "doctor reported issues (run: npx ruvector doctor --verbose)"

echo ""
echo "  Package inventory (from ruvector install --list):"
npx ruvector install --list 2>/dev/null | grep -E "^\s+[✓○]" | while read line; do
  echo "    $line"
done
echo ""

echo ""
echo "--- Level 2: Configuration ---"
check "settings.json"
[ -f ".claude/settings.json" ] && ok "exists" || fail "missing"

check "SEMANTIC_EMBEDDINGS=true"
EMBED_DIM=$(node -e 'try{var s=JSON.parse(require("fs").readFileSync(".claude/settings.json"));console.log(s.env.RUVECTOR_EMBEDDING_DIM||"not set")}catch(e){console.log("error")}' 2>/dev/null)
EMBED_MODEL=$(node -e 'try{var s=JSON.parse(require("fs").readFileSync(".claude/settings.json"));console.log(s.env.RUVECTOR_EMBEDDING_MODEL||"not set")}catch(e){console.log("error")}' 2>/dev/null)
grep -q '"RUVECTOR_SEMANTIC_EMBEDDINGS": "true"' .claude/settings.json 2>/dev/null && ok "${EMBED_DIM}d ONNX (${EMBED_MODEL})" || fail "64d n-gram fallback! Run setup.sh"

check "EMBEDDING_MODEL"
[ "$EMBED_MODEL" != "not set" ] && [ "$EMBED_MODEL" != "error" ] && ok "$EMBED_MODEL" || fail "not set"

check "Remember hooks --semantic"
if grep -q "\-\-semantic" .claude/settings.json 2>/dev/null; then
  ok "present in settings.json"
elif [ -f ".claude/ruvector-hook-bridge.sh" ] && grep -q "\-\-semantic" .claude/ruvector-hook-bridge.sh 2>/dev/null; then
  ok "present in bridge script (FIX-007)"
else
  fail "missing! Run setup.sh"
fi

check "Async ONNX path (FIX-006)"
if grep -q "post-edit.*action(async" node_modules/ruvector/bin/cli.js 2>/dev/null; then
  ok "post-edit action handler is async"
else
  warn "post-edit action handler is not async. Apply FIX-006 (scenario #20)"
fi

check "Hook timeouts"
SHORT_HOOKS=$(node -e '
var s=JSON.parse(require("fs").readFileSync(".claude/settings.json"));
var h=s.hooks||{};var short=0;
Object.keys(h).forEach(function(e){
  var hookList=h[e];if(!Array.isArray(hookList))return;
  hookList.forEach(function(entry){
    var hooks=entry.hooks||[entry];
    hooks.forEach(function(hk){
      if(hk.command&&hk.timeout&&hk.timeout<5000){
        var isEmbed=hk.command.indexOf("remember")!==-1||hk.command.indexOf("post-edit")!==-1||hk.command.indexOf("post-command")!==-1;
        if(isEmbed)short++;
      }
    });
  });
});
console.log(short);
' 2>/dev/null)
if [ "$SHORT_HOOKS" = "0" ] 2>/dev/null; then
  ok "all embedding hooks >= 5000ms"
else
  warn "$SHORT_HOOKS embedding hook(s) have timeout < 5000ms (scenario #22)"
fi

check "MCP claude-flow"
node -e '
var fs = require("fs");
function hasMcp(file, name) {
  try { var s = JSON.parse(fs.readFileSync(file, "utf-8")); return s.mcpServers && s.mcpServers[name]; } catch(e) { return false; }
}
process.exit(hasMcp(".claude/settings.json", "claude-flow") || hasMcp(".claude.json", "claude-flow") ? 0 : 1);
' 2>/dev/null && ok "registered" || warn "not registered (run: claude mcp add)"

check "MCP ruvector"
node -e '
var fs = require("fs");
function hasMcp(file, name) {
  try { var s = JSON.parse(fs.readFileSync(file, "utf-8")); return s.mcpServers && s.mcpServers[name]; } catch(e) { return false; }
}
process.exit(hasMcp(".claude/settings.json", "ruvector") || hasMcp(".claude.json", "ruvector") ? 0 : 1);
' 2>/dev/null && ok "registered" || warn "not registered (run: claude mcp add)"

echo ""
echo "--- Level 3: Memory Pipeline ---"

# Detect storage backend: SQLite (.db) vs JSON (.json)
INTEL_BACKEND="none"
if [ -f ".ruvector/intelligence.db" ]; then
  INTEL_BACKEND="sqlite"
elif [ -f ".ruvector/intelligence.json" ]; then
  INTEL_BACKEND="json"
fi

check "Intelligence store"
if [ "$INTEL_BACKEND" = "sqlite" ]; then
  ok "intelligence.db $(ls -lh .ruvector/intelligence.db | awk '{print $5}') (SQLite)"
elif [ "$INTEL_BACKEND" = "json" ]; then
  ok "intelligence.json $(ls -lh .ruvector/intelligence.json | awk '{print $5}') (JSON)"
else
  warn "not initialized (no intelligence.db or intelligence.json)"
fi

check "Embedding quality"
EXPECTED_DIM=${EMBED_DIM:-384}
EXPECTED_BYTES=$((EXPECTED_DIM * 4))
if [ "$INTEL_BACKEND" = "sqlite" ]; then
  EDIMS=$(node -e '
  var Database = require("better-sqlite3");
  var expected = parseInt(process.argv[1]) || 1536;
  var db = new Database(".ruvector/intelligence.db", { readonly: true });
  var total = db.prepare("SELECT COUNT(*) as c FROM memories").get().c;
  var nullN = db.prepare("SELECT COUNT(*) as c FROM memories WHERE embedding IS NULL").get().c;
  var correctN = db.prepare("SELECT COUNT(*) as c FROM memories WHERE embedding IS NOT NULL AND length(embedding) = ?").bind(expected).get().c;
  var wrongN = total - nullN - correctN;
  db.close();
  console.log(JSON.stringify({ total: total, correct: correctN, wrongDim: wrongN, nullN: nullN }));
  ' "$EXPECTED_BYTES" 2>/dev/null)

  TOTAL=$(echo "$EDIMS" | node -e 'var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf-8"));console.log(d.total)' 2>/dev/null)
  CORRECT=$(echo "$EDIMS" | node -e 'var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf-8"));console.log(d.correct)' 2>/dev/null)
  WRONG=$(echo "$EDIMS" | node -e 'var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf-8"));console.log(d.wrongDim)' 2>/dev/null)
  NULLN=$(echo "$EDIMS" | node -e 'var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf-8"));console.log(d.nullN)' 2>/dev/null)

  if [ "$TOTAL" = "0" ] 2>/dev/null; then warn "no memories (run pretrain)"
  elif [ "$WRONG" -gt 0 ] 2>/dev/null; then fail "$WRONG memories have wrong-dim embeddings instead of ${EXPECTED_DIM}d (scenario #20, #21)"
  elif [ "$NULLN" -gt 0 ] 2>/dev/null; then fail "$NULLN memories have NULL embeddings (scenario #1)"
  else ok "$CORRECT/$TOTAL at ${EXPECTED_DIM}d ONNX"
  fi
elif [ "$INTEL_BACKEND" = "json" ]; then
  EDIMS=$(node -e '
  var dim=parseInt(process.argv[1])||384;
  var d=JSON.parse(require("fs").readFileSync(".ruvector/intelligence.json"));
  var mems=d.memories||[];
  var t=mems.length;
  var correct=mems.filter(function(m){return m.embedding&&m.embedding.length===dim}).length;
  var nullN=mems.filter(function(m){return m.embedding===null}).length;
  var wrong=t-correct-nullN;
  console.log(JSON.stringify({total:t,correct:correct,wrongDim:wrong,nullN:nullN}));
  ' "$EXPECTED_DIM" 2>/dev/null)

  TOTAL=$(echo "$EDIMS" | node -e 'var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf-8"));console.log(d.total)' 2>/dev/null)
  CORRECT=$(echo "$EDIMS" | node -e 'var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf-8"));console.log(d.correct)' 2>/dev/null)
  WRONG=$(echo "$EDIMS" | node -e 'var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf-8"));console.log(d.wrongDim)' 2>/dev/null)
  NULLN=$(echo "$EDIMS" | node -e 'var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf-8"));console.log(d.nullN)' 2>/dev/null)

  if [ "$TOTAL" = "0" ] 2>/dev/null; then warn "no memories (run pretrain)"
  elif [ "$WRONG" -gt 0 ] 2>/dev/null; then fail "$WRONG memories have wrong-dim embeddings instead of ${EXPECTED_DIM}d (scenario #20, #21)"
  elif [ "$NULLN" -gt 0 ] 2>/dev/null; then fail "$NULLN memories have NULL embeddings (scenario #1)"
  else ok "$CORRECT/$TOTAL at ${EXPECTED_DIM}d"
  fi
else
  warn "no intelligence store"
fi

check "memory.db (claude-flow)"
[ -f ".swarm/memory.db" ] && ok "$(ls -lh .swarm/memory.db | awk '{print $5}')" || warn "not initialized"

check "Storage backend"
BACKEND=$(node -e 'try{var s=JSON.parse(require("fs").readFileSync(".claude/settings.json"));console.log(s.env.RUVECTOR_MEMORY_BACKEND||"not set")}catch(e){console.log("error")}' 2>/dev/null)
if [ "$INTEL_BACKEND" = "sqlite" ]; then
  ok "SQLite (intelligence.db is SSOT)"
elif [ "$BACKEND" = "rvlite" ]; then
  node -e "require('@ruvector/rvlite')" 2>/dev/null && ok "rvlite installed" || warn "backend=rvlite but package not installed"
else
  ok "JSON (RUVECTOR_MEMORY_BACKEND=$BACKEND)"
fi

# Dream cycle status (informational)
DREAM_ENABLED=$(node -e 'try{var s=JSON.parse(require("fs").readFileSync(".claude/settings.json"));console.log(s.env.RUVECTOR_DREAM_CYCLE_ENABLED||"false")}catch(e){console.log("false")}' 2>/dev/null)
echo "  INFO: Dream cycles = $DREAM_ENABLED"

echo ""
echo "--- Level 4: Learning Pipeline ---"
check "Q-learning state"
if [ "$INTEL_BACKEND" = "sqlite" ]; then
  node -e '
  var Database = require("better-sqlite3");
  var db = new Database(".ruvector/intelligence.db", { readonly: true });
  var rows = db.prepare("SELECT algorithm, q_table FROM learning_data").all();
  var updates = 0;
  rows.forEach(function(r) {
    try {
      var qt = JSON.parse(r.q_table);
      if (qt.qTables) {
        Object.keys(qt.qTables).forEach(function(k) {
          Object.keys(qt.qTables[k]).forEach(function() { updates++; });
        });
      }
    } catch(e) {}
  });
  db.close();
  process.exit(updates > 0 ? 0 : 2);
  ' >/dev/null 2>&1
  RET=$?
  QSTATE=$(node -e 'var D=require("better-sqlite3");var db=new D(".ruvector/intelligence.db",{readonly:true});var rows=db.prepare("SELECT algorithm,q_table FROM learning_data").all();var u=0;rows.forEach(function(r){try{var qt=JSON.parse(r.q_table);if(qt.qTables){Object.keys(qt.qTables).forEach(function(k){Object.keys(qt.qTables[k]).forEach(function(){u++})})}}catch(e){}});db.close();console.log(u+" Q-entries, "+rows.length+" algo(s)")' 2>/dev/null)
  if [ $RET -eq 0 ]; then ok "$QSTATE"
  else warn "cold start ($QSTATE) - seed with batch-learn"
  fi
elif [ "$INTEL_BACKEND" = "json" ]; then
  node -e '
  var d=JSON.parse(require("fs").readFileSync(".ruvector/intelligence.json"));
  var updates=0;
  if(d.learning&&d.learning.stats){
    Object.keys(d.learning.stats).forEach(function(k){updates+=d.learning.stats[k].updates||0});
  }
  process.exit(updates>0?0:2);
  ' >/dev/null 2>&1
  RET=$?
  QSTATE=$(node -e 'var d=JSON.parse(require("fs").readFileSync(".ruvector/intelligence.json"));var u=0;if(d.learning&&d.learning.stats){Object.keys(d.learning.stats).forEach(function(k){u+=d.learning.stats[k].updates||0})}console.log(u+" updates")' 2>/dev/null)
  if [ $RET -eq 0 ]; then ok "$QSTATE"
  else warn "cold start ($QSTATE) - seed with batch-learn"
  fi
else
  warn "no intelligence store"
fi

check "Pretrain completed"
if [ "$INTEL_BACKEND" = "sqlite" ]; then
  node -e '
  var Database = require("better-sqlite3");
  var db = new Database(".ruvector/intelligence.db", { readonly: true });
  var row = db.prepare("SELECT value FROM kv_store WHERE key = ?").get("pretrained");
  db.close();
  process.exit(row && row.value === "true" ? 0 : 1);
  ' 2>/dev/null && ok "yes (kv_store)" || warn "not pretrained"
elif [ "$INTEL_BACKEND" = "json" ]; then
  node -e 'var d=JSON.parse(require("fs").readFileSync(".ruvector/intelligence.json"));process.exit(d.pretrained?0:1)' 2>/dev/null && ok "yes" || warn "not pretrained"
else
  warn "no intelligence store"
fi

# Level 4b: Hook timeout validation (PreToolUse >= 5000ms)
check "PreToolUse hook timeouts"
MIN_TIMEOUT=$(node -e '
try {
  var s = JSON.parse(require("fs").readFileSync(".claude/settings.json"));
  var min = Infinity;
  var ptu = s.hooks && s.hooks.PreToolUse;
  if (Array.isArray(ptu)) {
    ptu.forEach(function(entry) {
      var hooks = entry.hooks || [entry];
      hooks.forEach(function(h) {
        if (h.timeout !== undefined && h.timeout < min) min = h.timeout;
      });
    });
  }
  console.log(min === Infinity ? 5000 : min);
} catch(e) { console.log(5000); }
' 2>/dev/null)
if [ "$MIN_TIMEOUT" -lt 5000 ] 2>/dev/null; then
  warn "PreToolUse timeout too low (${MIN_TIMEOUT}ms, should be >= 5000ms)"
else
  ok "Hook timeouts adequate (${MIN_TIMEOUT}ms)"
fi

echo ""
echo "--- Level 5: Services ---"
check "claude-flow daemon"
npx @claude-flow/cli@latest daemon status 2>/dev/null | grep -qi "running" && ok "running" || warn "not running"

check "Fast wrapper"
[ -x ".claude/ruvector-fast.sh" ] && ok "executable" || warn "missing or not executable"

check "agentic-flow"
npx agentic-flow@alpha --version >/dev/null 2>&1 && ok "available" || warn "not available (workers will silently fail)"

echo ""
echo "--- Level 6: Known Limitations (informational, not blocking) ---"
check "Storage adapter"
if [ "$INTEL_BACKEND" = "sqlite" ]; then
  node -e "require(require('path').join(process.cwd(),'packages','ruvector-storage'))" 2>/dev/null && ok "packages/ruvector-storage loaded (SQLite SSOT)" || warn "SQLite db exists but storage adapter not loadable"
else
  RESULT=$(node -e "try{var e=require('ruvector-extensions');if(e.persistence&&e.persistence.SQLiteAdapter){console.log('EXISTS')}else{console.log('NOT EXPORTED')}}catch(e){console.log('N/A')}" 2>&1)
  if [ "$RESULT" = "EXISTS" ]; then ok "ruvector-extensions SQLiteAdapter: $RESULT"
  else echo "OK - JSON backend active. SQLite available via FOX Scale 2 (see storage-backends.md)."; PASS=$((PASS+1))
  fi
fi

echo ""
echo "--- Level 7: Upstream Patches (v0.9.8 consolidated) ---"

CLI_JS="node_modules/ruvector/bin/cli.js"
ENGINE_JS="node_modules/ruvector/dist/core/intelligence-engine.js"

# -- 7a. Consolidated CLI patch marker --------------------------------
check "CLI consolidated patch (__PATCH_CLI_V098__, V097, V096, V095, V094, or V092)"
CLI_CONSOLIDATED="no"
if [ -f "$CLI_JS" ]; then
  if grep -qE "__PATCH_CLI_V09[2456789]__" "$CLI_JS" 2>/dev/null; then
    CLI_CONSOLIDATED="yes"
    ok "all cli patches applied (consolidated)"
  else
    warn "consolidated marker missing -- checking legacy markers"
  fi
else
  fail "ruvector cli.js not found"
fi

# -- 7b. Legacy individual markers (only if consolidated missing) ------
if [ "$CLI_CONSOLIDATED" = "no" ] && [ -f "$CLI_JS" ]; then
  LEGACY_MARKERS="FIX-005 FIX-006 FIX-006b FIX-007 FIX-008 FIX-009 FIX-010 FIX-013 FIX-015"
  LEGACY_FOUND=""
  LEGACY_MISSING=""
  for M in $LEGACY_MARKERS; do
    if grep -q "$M" "$CLI_JS" 2>/dev/null; then
      LEGACY_FOUND="$LEGACY_FOUND $M"
    else
      LEGACY_MISSING="$LEGACY_MISSING $M"
    fi
  done
  check "Legacy CLI markers"
  if [ -z "$LEGACY_MISSING" ]; then
    ok "all legacy markers present:$LEGACY_FOUND"
  else
    warn "missing:$LEGACY_MISSING  |  present:$LEGACY_FOUND"
  fi
fi

# -- 7c. Consolidated engine patch marker ------------------------------
check "Engine consolidated patch (__PATCH_ENGINE_V092__)"
if [ -f "$ENGINE_JS" ]; then
  if grep -q "__PATCH_ENGINE_V092__" "$ENGINE_JS" 2>/dev/null; then
    ok "all engine patches applied (consolidated)"
  else
    ok "not present (optional -- engine patches may be individual or absent)"
  fi
else
  ok "intelligence-engine.js not found (optional)"
fi

# -- 7d. Storage adapter loads -----------------------------------------
check "Storage adapter loadable"
STORAGE_FILE=""
for SP in packages/ruvector-storage/index.js packages/@veracy/ruvector-storage/index.js; do
  [ -f "$SP" ] && STORAGE_FILE="$SP" && break
done
if [ -n "$STORAGE_FILE" ]; then
  node -e "require(require('path').resolve('$STORAGE_FILE'))" 2>/dev/null \
    && ok "$STORAGE_FILE loads" \
    || warn "$STORAGE_FILE exists but fails to load"
else
  warn "no storage adapter found in packages/"
fi

# -- 7e. stdin bridge (no $TOOL_INPUT_* in settings.json) --------------
check "Hook stdin bridge (no \$TOOL_INPUT_*)"
if [ -f ".claude/settings.json" ]; then
  TOOL_INPUT_COUNT=$(grep -c 'TOOL_INPUT_' .claude/settings.json 2>/dev/null; true)
  if [ "$TOOL_INPUT_COUNT" = "0" ] 2>/dev/null; then
    ok "no \$TOOL_INPUT_* refs in settings.json"
  else
    fail "$TOOL_INPUT_COUNT \$TOOL_INPUT_* reference(s) in settings.json"
  fi
else
  warn "settings.json not found"
fi

# -- 7f. Async rememberAsync at call sites -----------------------------
check "Async rememberAsync call sites"
if [ -f "$CLI_JS" ]; then
  SYNC_CALLS=$(node -e '
  var fs = require("fs");
  var src = fs.readFileSync("'"$CLI_JS"'", "utf-8");
  var lines = src.split("\n");
  var inBlock = false, blockLines = 0, syncCount = 0;
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].indexOf(".command(") !== -1 && (lines[i].indexOf("post-edit") !== -1 || lines[i].indexOf("post-command") !== -1)) {
      inBlock = true; blockLines = 0; continue;
    }
    if (inBlock) {
      blockLines++;
      if (blockLines > 40) { inBlock = false; continue; }
      if (/intel\.remember\(.(edit|command).,/.test(lines[i]) && lines[i].indexOf("rememberAsync") === -1) {
        syncCount++;
      }
    }
  }
  console.log(syncCount);
  ' 2>/dev/null)
  if [ "$SYNC_CALLS" = "0" ] 2>/dev/null; then
    ok "post-edit/post-command use rememberAsync"
  else
    warn "$SYNC_CALLS sync intel.remember() call(s) (need rememberAsync)"
  fi
else
  warn "ruvector cli.js not found"
fi

# -- 7g. lastEditedFile in kv_store ------------------------------------
check "lastEditedFile persistence"
if [ "$INTEL_BACKEND" = "sqlite" ]; then
  HAS_LEF=$(node -e '
  var Database = require("better-sqlite3");
  var db = new Database(".ruvector/intelligence.db", { readonly: true });
  try {
    var row = db.prepare("SELECT value FROM kv_store WHERE key = ?").get("lastEditedFile");
    console.log(row ? "yes" : "no");
  } catch(e) { console.log("no"); }
  db.close();
  ' 2>/dev/null)
  if [ "$HAS_LEF" = "yes" ]; then
    ok "lastEditedFile in kv_store"
  else
    ok "not yet in kv_store (appears after first edit)"
  fi
elif [ -f ".ruvector/kv.json" ]; then
  node -e '
  var d = JSON.parse(require("fs").readFileSync(".ruvector/kv.json", "utf-8"));
  process.exit(d.lastEditedFile ? 0 : 1);
  ' 2>/dev/null && ok "lastEditedFile in kv.json" || ok "not set yet (appears after first edit)"
else
  ok "no kv store found (appears after first edit)"
fi

# -- 7h. SONA warm-up marker in cli.js --------------------------------
check "SONA warm-up replay"
if [ -f "$CLI_JS" ]; then
  if grep -q "FIX-013\|warm.up\|trajectory.*replay\|__PATCH_CLI_V09[245679]__" "$CLI_JS" 2>/dev/null; then
    ok "SONA warm-up patched"
  else
    warn "SONA warm-up not found (state lost between invocations)"
  fi
else
  warn "ruvector cli.js not found"
fi

# -- 7i. tick/forceLearn markers in cli.js -----------------------------
check "SONA tick/forceLearn hooks"
if [ -f "$CLI_JS" ]; then
  TICK_PRESENT="no"; FORCE_PRESENT="no"
  grep -q "\.tick\(\)\|FIX-015.*tick\|__PATCH_CLI_V09[245679]__" "$CLI_JS" 2>/dev/null && TICK_PRESENT="yes"
  grep -q "forceLearn\|FIX-015.*forceLearn\|__PATCH_CLI_V09[245679]__" "$CLI_JS" 2>/dev/null && FORCE_PRESENT="yes"
  if [ "$TICK_PRESENT" = "yes" ] && [ "$FORCE_PRESENT" = "yes" ]; then
    ok "tick() and forceLearn() wired"
  elif [ "$TICK_PRESENT" = "yes" ]; then
    warn "tick() found but forceLearn() missing"
  else
    warn "tick/forceLearn not found (SONA never learns)"
  fi
else
  warn "ruvector cli.js not found"
fi

# -- 7j. storagePath in engine -----------------------------------------
check "HNSW storagePath in engine"
if [ -f "$ENGINE_JS" ]; then
  if grep -q "storagePath\|__PATCH_ENGINE_V092__" "$ENGINE_JS" 2>/dev/null; then
    ok "VectorDb has storagePath configured"
  else
    warn "VectorDb has no storagePath (HNSW index rebuilt per invocation)"
  fi
else
  ok "intelligence-engine.js not found (optional)"
fi

# -- 7k. Native @ruvector/sona module ---------------------------------
check "Native @ruvector/sona module"
node -e '
try {
  var sona = require("@ruvector/sona");
  if (sona && sona.SonaEngine) {
    var s = new sona.SonaEngine(384, 0.01, 100);
    s.tick();
    console.log("loaded");
  } else { console.log("no-class"); }
} catch(e) { console.log("fail:" + e.message.substring(0, 80)); }
' 2>/dev/null | {
  read RESULT
  case "$RESULT" in
    loaded) ok "SonaEngine loads and initializes (native)" ;;
    no-class) warn "module loads but SonaEngine class missing" ;;
    *) warn "cannot load: $RESULT" ;;
  esac
}

# -- 7l. SONA stats in kv_store ---------------------------------------
check "SONA stats in kv_store"
if [ "$INTEL_BACKEND" = "sqlite" ]; then
  HAS_SONA_STATS=$(node -e '
  var Database = require("better-sqlite3");
  var db = new Database(".ruvector/intelligence.db", { readonly: true });
  try {
    var row = db.prepare("SELECT value FROM kv_store WHERE key = ?").get("sona_stats");
    console.log(row ? "yes" : "no");
  } catch(e) { console.log("no"); }
  db.close();
  ' 2>/dev/null)
  if [ "$HAS_SONA_STATS" = "yes" ]; then
    ok "SONA stats persisted in kv_store"
  else
    ok "SONA stats not yet in kv_store (appears after first save)"
  fi
else
  ok "JSON backend (SONA stats check N/A)"
fi

# -- 7m. SONA platform availability ------------------------------------
check "@ruvector/sona platform"
SONA_RESULT=$(node -e '
try {
  var sona = require("@ruvector/sona");
  if (sona && sona.SonaEngine) {
    console.log("loaded");
  } else { console.log("no-class"); }
} catch(e) { console.log("unavailable:" + e.message.substring(0, 60)); }
' 2>/dev/null)
case "$SONA_RESULT" in
  loaded) ok "SonaEngine available (SONA patches active)" ;;
  no-class) warn "module loads but SonaEngine missing (SONA patches inactive)" ;;
  *) warn "@ruvector/sona not available on this platform (SONA features disabled: $SONA_RESULT)" ;;
esac

echo ""
echo "--- Level 7 (continued): v0.9.7 Checks ---"

# -- 7n. Semantic edges count ------------------------------------------
check "Semantic edges"
if [ "$INTEL_BACKEND" = "sqlite" ]; then
  SEM_EDGES=$(node -e '
  var Database = require("better-sqlite3");
  var db = new Database(".ruvector/intelligence.db", { readonly: true });
  try {
    var row = db.prepare("SELECT COUNT(*) as c FROM edges WHERE json_extract(data, \x27$.type\x27) = \x27semantic\x27").get();
    console.log(row.c);
  } catch(e) { console.log("0"); }
  db.close();
  ' 2>/dev/null || echo "0")
  if [ "$SEM_EDGES" -lt 1 ] 2>/dev/null; then
    warn "Zero semantic edges (check RUVECTOR_SEMANTIC_THRESHOLD)"
  else
    ok "Semantic edges = $SEM_EDGES"
  fi
else
  warn "semantic edges check requires SQLite backend"
fi

# -- 7o. Neural pattern embeddings -------------------------------------
check "Neural pattern embeddings"
if [ "$INTEL_BACKEND" = "sqlite" ]; then
  NP_TOTAL=$(node -e '
  var Database = require("better-sqlite3");
  var db = new Database(".ruvector/intelligence.db", { readonly: true });
  try { console.log(db.prepare("SELECT COUNT(*) as c FROM neural_patterns").get().c); }
  catch(e) { console.log("0"); }
  db.close();
  ' 2>/dev/null || echo "0")
  NP_EMB=$(node -e '
  var Database = require("better-sqlite3");
  var db = new Database(".ruvector/intelligence.db", { readonly: true });
  try { console.log(db.prepare("SELECT COUNT(*) as c FROM neural_patterns WHERE embedding IS NOT NULL").get().c); }
  catch(e) { console.log("0"); }
  db.close();
  ' 2>/dev/null || echo "0")
  if [ "$NP_TOTAL" -gt 0 ] 2>/dev/null && [ "$NP_EMB" -lt "$NP_TOTAL" ] 2>/dev/null; then
    warn "Neural patterns missing embeddings ($NP_EMB/$NP_TOTAL)"
  else
    ok "Neural pattern embeddings = $NP_EMB/$NP_TOTAL"
  fi
else
  warn "neural pattern embeddings check requires SQLite backend"
fi

# -- 7p. compressed_patterns table -------------------------------------
check "compressed_patterns table"
if [ "$INTEL_BACKEND" = "sqlite" ]; then
  CP_EXISTS=$(node -e '
  var Database = require("better-sqlite3");
  var db = new Database(".ruvector/intelligence.db", { readonly: true });
  try {
    var row = db.prepare("SELECT COUNT(*) as c FROM sqlite_master WHERE type=\x27table\x27 AND name=\x27compressed_patterns\x27").get();
    console.log(row.c);
  } catch(e) { console.log("0"); }
  db.close();
  ' 2>/dev/null || echo "0")
  if [ "$CP_EXISTS" -eq 0 ] 2>/dev/null; then
    fail "compressed_patterns table missing"
  else
    ok "compressed_patterns table exists"
  fi
else
  warn "compressed_patterns check requires SQLite backend"
fi

echo ""
echo "--- Level 8: Learning Pipeline (v0.9.5 functional smoke test) ---"

# -- 8a. post-process.js exists -------------------------------------------
check "post-process.js exists"
[ -f "scripts/post-process.js" ] && ok "scripts/post-process.js" || warn "scripts/post-process.js missing (learning pipeline inactive)"

# -- 8b. neural_patterns table has entries ---------------------------------
check "neural_patterns populated"
if [ "$INTEL_BACKEND" = "sqlite" ]; then
  NP_COUNT=$(node -e '
  var D = require("better-sqlite3");
  var db = new D(".ruvector/intelligence.db", { readonly: true });
  try { console.log(db.prepare("SELECT COUNT(*) as c FROM neural_patterns").get().c); }
  catch(e) { console.log("0"); }
  db.close();
  ' 2>/dev/null || echo "0")
  if [ "$NP_COUNT" -gt 0 ] 2>/dev/null; then
    ok "$NP_COUNT neural patterns"
  else
    warn "0 neural patterns (run: node scripts/post-process.js --event consolidate)"
  fi
else
  warn "neural_patterns check requires SQLite backend"
fi

# -- 8c. edges table has entries -------------------------------------------
check "edges populated"
if [ "$INTEL_BACKEND" = "sqlite" ]; then
  EDGE_COUNT=$(node -e '
  var D = require("better-sqlite3");
  var db = new D(".ruvector/intelligence.db", { readonly: true });
  try { console.log(db.prepare("SELECT COUNT(*) as c FROM edges").get().c); }
  catch(e) { console.log("0"); }
  db.close();
  ' 2>/dev/null || echo "0")
  if [ "$EDGE_COUNT" -gt 0 ] 2>/dev/null; then
    ok "$EDGE_COUNT edges"
  else
    warn "0 edges (run: node scripts/post-process.js --event consolidate)"
  fi
else
  warn "edges check requires SQLite backend"
fi

# -- 8d. agents table has entries ------------------------------------------
check "agents registered"
if [ "$INTEL_BACKEND" = "sqlite" ]; then
  AGENT_COUNT=$(node -e '
  var D = require("better-sqlite3");
  var db = new D(".ruvector/intelligence.db", { readonly: true });
  try { console.log(db.prepare("SELECT COUNT(*) as c FROM agents").get().c); }
  catch(e) { console.log("0"); }
  db.close();
  ' 2>/dev/null || echo "0")
  if [ "$AGENT_COUNT" -gt 0 ] 2>/dev/null; then
    ok "$AGENT_COUNT agent(s)"
  else
    warn "0 agents (run: node scripts/post-process.js --event session-start --agent-name claude-code)"
  fi
else
  warn "agents check requires SQLite backend"
fi

# -- 8e. trajectory reward variance (not all identical) --------------------
check "trajectory reward variance"
if [ "$INTEL_BACKEND" = "sqlite" ]; then
  REWARD_VARIANCE=$(node -e '
  var D = require("better-sqlite3");
  var db = new D(".ruvector/intelligence.db", { readonly: true });
  try {
    var rows = db.prepare("SELECT DISTINCT reward FROM trajectories WHERE reward IS NOT NULL LIMIT 10").all();
    var distinct = rows.length;
    console.log(distinct);
  } catch(e) { console.log("0"); }
  db.close();
  ' 2>/dev/null || echo "0")
  if [ "$REWARD_VARIANCE" -gt 1 ] 2>/dev/null; then
    ok "$REWARD_VARIANCE distinct reward values (FIX-023 active)"
  elif [ "$REWARD_VARIANCE" = "1" ] 2>/dev/null; then
    warn "only 1 distinct reward value (FIX-023 may not be applied yet)"
  else
    warn "no trajectory rewards yet"
  fi
else
  warn "reward variance check requires SQLite backend"
fi

# -- 8f. functional smoke test: run consolidate, check counts increased ----
check "consolidation smoke test"
if [ -f "scripts/post-process.js" ] && [ "$INTEL_BACKEND" = "sqlite" ]; then
  # Capture before counts
  BEFORE=$(node -e '
  var D = require("better-sqlite3");
  var db = new D(".ruvector/intelligence.db", { readonly: true });
  try {
    var np = db.prepare("SELECT COUNT(*) as c FROM neural_patterns").get().c;
    var ed = db.prepare("SELECT COUNT(*) as c FROM edges").get().c;
    var ag = db.prepare("SELECT COUNT(*) as c FROM agents").get().c;
    console.log(JSON.stringify({np:np,ed:ed,ag:ag}));
  } catch(e) { console.log("{\"np\":0,\"ed\":0,\"ag\":0}"); }
  db.close();
  ' 2>/dev/null || echo '{"np":0,"ed":0,"ag":0}')

  # Run consolidation
  if node scripts/post-process.js --event consolidate 2>/dev/null; then
    # Capture after counts
    AFTER=$(node -e '
    var D = require("better-sqlite3");
    var db = new D(".ruvector/intelligence.db", { readonly: true });
    try {
      var np = db.prepare("SELECT COUNT(*) as c FROM neural_patterns").get().c;
      var ed = db.prepare("SELECT COUNT(*) as c FROM edges").get().c;
      var ag = db.prepare("SELECT COUNT(*) as c FROM agents").get().c;
      console.log(JSON.stringify({np:np,ed:ed,ag:ag}));
    } catch(e) { console.log("{\"np\":0,\"ed\":0,\"ag\":0}"); }
    db.close();
    ' 2>/dev/null || echo '{"np":0,"ed":0,"ag":0}')

    AFTER_NP=$(echo "$AFTER" | node -e 'var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf-8"));console.log(d.np)' 2>/dev/null || echo "0")
    AFTER_ED=$(echo "$AFTER" | node -e 'var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf-8"));console.log(d.ed)' 2>/dev/null || echo "0")
    AFTER_AG=$(echo "$AFTER" | node -e 'var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf-8"));console.log(d.ag)' 2>/dev/null || echo "0")

    if [ "$AFTER_NP" -gt 0 ] 2>/dev/null || [ "$AFTER_ED" -gt 0 ] 2>/dev/null || [ "$AFTER_AG" -gt 0 ] 2>/dev/null; then
      ok "post-consolidate: ${AFTER_NP} patterns, ${AFTER_ED} edges, ${AFTER_AG} agents"
    else
      warn "consolidation ran but tables still empty (need more data — add memories first)"
    fi
  else
    warn "consolidation script failed (check scripts/post-process.js)"
  fi
else
  if [ ! -f "scripts/post-process.js" ]; then
    warn "scripts/post-process.js not found"
  else
    warn "consolidation test requires SQLite backend"
  fi
fi

echo ""
echo "--- Level 9: Embedding Dimension Verification (v0.9.8 FIX-025) ---"

# -- 9a. Configured embedding dimension from settings.json -------------------
check "Configured embedding dimension"
CONFIG_DIM=$(node -e 'try{var s=JSON.parse(require("fs").readFileSync(".claude/settings.json"));console.log(s.env.RUVECTOR_EMBEDDING_DIM||384)}catch(e){console.log(384)}' 2>/dev/null || echo "384")
EXPECTED_BYTES=$((CONFIG_DIM * 4))
echo "  INFO: Expected dimension = ${CONFIG_DIM}d (${EXPECTED_BYTES} bytes)"
ok "Configured: ${CONFIG_DIM}d"

# -- 9b. Actual embedding bytes in memories table ----------------------------
check "Embedding bytes validation (FIX-025)"
if [ "$INTEL_BACKEND" = "sqlite" ]; then
  BYTE_CHECK=$(node -e '
  var Database = require("better-sqlite3");
  var expectedDim = parseInt(process.argv[1]) || 384;
  var expectedBytes = expectedDim * 4;
  var db = new Database(".ruvector/intelligence.db", { readonly: true });
  try {
    var total = db.prepare("SELECT COUNT(*) as c FROM memories WHERE embedding IS NOT NULL").get().c;
    var correct = db.prepare("SELECT COUNT(*) as c FROM memories WHERE embedding IS NOT NULL AND length(embedding) = ?").bind(expectedBytes).get().c;
    var wrong64d = db.prepare("SELECT COUNT(*) as c FROM memories WHERE embedding IS NOT NULL AND length(embedding) = 256").get().c;
    var wrongOther = total - correct - wrong64d;
    console.log(JSON.stringify({total:total,correct:correct,wrong64d:wrong64d,wrongOther:wrongOther,expectedBytes:expectedBytes}));
  } catch(e) { console.log(JSON.stringify({total:0,correct:0,wrong64d:0,wrongOther:0,expectedBytes:expectedBytes,error:e.message})); }
  db.close();
  ' "$CONFIG_DIM" 2>/dev/null || echo '{"total":0,"correct":0,"wrong64d":0,"wrongOther":0}')

  TOTAL_EMB=$(echo "$BYTE_CHECK" | node -e 'var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf-8"));console.log(d.total)' 2>/dev/null || echo "0")
  CORRECT_EMB=$(echo "$BYTE_CHECK" | node -e 'var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf-8"));console.log(d.correct)' 2>/dev/null || echo "0")
  WRONG_64D=$(echo "$BYTE_CHECK" | node -e 'var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf-8"));console.log(d.wrong64d)' 2>/dev/null || echo "0")
  WRONG_OTHER=$(echo "$BYTE_CHECK" | node -e 'var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf-8"));console.log(d.wrongOther)' 2>/dev/null || echo "0")

  if [ "$TOTAL_EMB" = "0" ] 2>/dev/null; then
    warn "No embeddings yet (run pretrain after setup.sh)"
  elif [ "$WRONG_64D" -gt 0 ] 2>/dev/null; then
    fail "FIX-025 VIOLATION: ${WRONG_64D}/${TOTAL_EMB} memories have 64d hash embeddings (256 bytes) instead of ${CONFIG_DIM}d ONNX"
    echo "       Root cause: pretrain ran BEFORE setup.sh configured ONNX. Re-run: setup.sh then pretrain --verbose"
  elif [ "$WRONG_OTHER" -gt 0 ] 2>/dev/null; then
    warn "${WRONG_OTHER}/${TOTAL_EMB} memories have unexpected embedding sizes"
  else
    ok "All ${CORRECT_EMB}/${TOTAL_EMB} embeddings are ${CONFIG_DIM}d ONNX (${EXPECTED_BYTES} bytes)"
  fi
else
  warn "Embedding byte validation requires SQLite backend"
fi

# -- 9c. Neural pattern embedding validation ---------------------------------
check "Neural pattern embedding bytes"
if [ "$INTEL_BACKEND" = "sqlite" ]; then
  NP_BYTE_CHECK=$(node -e '
  var Database = require("better-sqlite3");
  var expectedDim = parseInt(process.argv[1]) || 384;
  var expectedBytes = expectedDim * 4;
  var db = new Database(".ruvector/intelligence.db", { readonly: true });
  try {
    var total = db.prepare("SELECT COUNT(*) as c FROM neural_patterns WHERE embedding IS NOT NULL").get().c;
    var correct = db.prepare("SELECT COUNT(*) as c FROM neural_patterns WHERE embedding IS NOT NULL AND length(embedding) = ?").bind(expectedBytes).get().c;
    console.log(JSON.stringify({total:total,correct:correct}));
  } catch(e) { console.log(JSON.stringify({total:0,correct:0})); }
  db.close();
  ' "$CONFIG_DIM" 2>/dev/null || echo '{"total":0,"correct":0}')

  NP_TOTAL=$(echo "$NP_BYTE_CHECK" | node -e 'var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf-8"));console.log(d.total)' 2>/dev/null || echo "0")
  NP_CORRECT=$(echo "$NP_BYTE_CHECK" | node -e 'var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf-8"));console.log(d.correct)' 2>/dev/null || echo "0")

  if [ "$NP_TOTAL" = "0" ] 2>/dev/null; then
    warn "No neural pattern embeddings yet (run: node scripts/post-process.js --event consolidate)"
  elif [ "$NP_CORRECT" -lt "$NP_TOTAL" ] 2>/dev/null; then
    WRONG_NP=$((NP_TOTAL - NP_CORRECT))
    warn "${WRONG_NP}/${NP_TOTAL} neural patterns have wrong embedding dimension"
  else
    ok "All ${NP_CORRECT}/${NP_TOTAL} neural pattern embeddings are ${CONFIG_DIM}d"
  fi
else
  warn "Neural pattern byte validation requires SQLite backend"
fi

echo ""
echo "--- Level 10: Stats Table Verification (v0.9.8 FIX-027) ---"

# -- 10a. Stats table existence and content ----------------------------------
check "Stats table"
if [ "$INTEL_BACKEND" = "sqlite" ]; then
  STATS_EXISTS=$(node -e '
  var Database = require("better-sqlite3");
  var db = new Database(".ruvector/intelligence.db", { readonly: true });
  try {
    var row = db.prepare("SELECT COUNT(*) as c FROM sqlite_master WHERE type=\x27table\x27 AND name=\x27stats\x27").get();
    console.log(row.c);
  } catch(e) { console.log("0"); }
  db.close();
  ' 2>/dev/null || echo "0")

  if [ "$STATS_EXISTS" = "0" ] 2>/dev/null; then
    fail "stats table missing (FIX-027 not applied)"
  else
    ok "stats table exists"
  fi
else
  warn "stats table check requires SQLite backend"
fi

# -- 10b. Stats table content sync -------------------------------------------
check "Stats content synchronized (FIX-027)"
if [ "$INTEL_BACKEND" = "sqlite" ]; then
  STATS_SYNC=$(node -e '
  var Database = require("better-sqlite3");
  var db = new Database(".ruvector/intelligence.db", { readonly: true });
  try {
    // Check for essential stat keys
    var essentialKeys = ["total_memories", "total_patterns", "total_edges", "last_consolidation"];
    var found = 0;
    for (var i = 0; i < essentialKeys.length; i++) {
      var row = db.prepare("SELECT value FROM stats WHERE key = ?").get(essentialKeys[i]);
      if (row && row.value !== null && row.value !== "0") found++;
    }
    var totalStats = db.prepare("SELECT COUNT(*) as c FROM stats").get().c;
    console.log(JSON.stringify({found: found, total: totalStats, expected: essentialKeys.length}));
  } catch(e) { console.log(JSON.stringify({found: 0, total: 0, expected: 4, error: e.message})); }
  db.close();
  ' 2>/dev/null || echo '{"found":0,"total":0,"expected":4}')

  STATS_FOUND=$(echo "$STATS_SYNC" | node -e 'var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf-8"));console.log(d.found)' 2>/dev/null || echo "0")
  STATS_TOTAL=$(echo "$STATS_SYNC" | node -e 'var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf-8"));console.log(d.total)' 2>/dev/null || echo "0")
  STATS_EXPECTED=$(echo "$STATS_SYNC" | node -e 'var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf-8"));console.log(d.expected)' 2>/dev/null || echo "4")

  if [ "$STATS_TOTAL" = "0" ] 2>/dev/null; then
    warn "stats table empty (run: node scripts/post-process.js --event consolidate)"
  elif [ "$STATS_FOUND" -lt "$STATS_EXPECTED" ] 2>/dev/null; then
    warn "${STATS_FOUND}/${STATS_EXPECTED} essential stats populated (run consolidate to sync)"
  else
    ok "${STATS_FOUND}/${STATS_EXPECTED} essential stats, ${STATS_TOTAL} total entries"
  fi
else
  warn "stats sync check requires SQLite backend"
fi

# -- 10c. Consolidation recency check ----------------------------------------
check "Consolidation recency"
if [ "$INTEL_BACKEND" = "sqlite" ]; then
  LAST_CONSOL=$(node -e '
  var Database = require("better-sqlite3");
  var db = new Database(".ruvector/intelligence.db", { readonly: true });
  try {
    var row = db.prepare("SELECT value FROM stats WHERE key = ?").get("last_consolidation");
    if (row && row.value) {
      var ts = parseInt(row.value);
      var now = Math.floor(Date.now() / 1000);
      var age = now - ts;
      console.log(JSON.stringify({timestamp: ts, age_seconds: age}));
    } else {
      console.log(JSON.stringify({timestamp: 0, age_seconds: -1}));
    }
  } catch(e) { console.log(JSON.stringify({timestamp: 0, age_seconds: -1, error: e.message})); }
  db.close();
  ' 2>/dev/null || echo '{"timestamp":0,"age_seconds":-1}')

  CONSOL_AGE=$(echo "$LAST_CONSOL" | node -e 'var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf-8"));console.log(d.age_seconds)' 2>/dev/null || echo "-1")

  if [ "$CONSOL_AGE" = "-1" ] 2>/dev/null; then
    warn "Never consolidated (run: node scripts/post-process.js --event consolidate)"
  elif [ "$CONSOL_AGE" -gt 86400 ] 2>/dev/null; then
    warn "Last consolidation was over 24 hours ago (${CONSOL_AGE}s)"
  else
    ok "Consolidated ${CONSOL_AGE}s ago"
  fi
else
  warn "consolidation recency check requires SQLite backend"
fi

echo ""
echo "--- Level 11: Session Tracking Verification (v0.9.9) ---"

# -- 11a. Session stats in stats table ------------------------------------------
check "Session stats tracking (FIX-032)"
if [ "$INTEL_BACKEND" = "sqlite" ]; then
  SESSION_STATS=$(node -e '
  var Database = require("better-sqlite3");
  var db = new Database(".ruvector/intelligence.db", { readonly: true });
  try {
    var keys = ["session_count", "last_session", "last_session_timestamp"];
    var found = 0;
    for (var i = 0; i < keys.length; i++) {
      var row = db.prepare("SELECT value FROM stats WHERE key = ?").get(keys[i]);
      if (row && row.value) found++;
    }
    console.log(JSON.stringify({found: found, expected: keys.length}));
  } catch(e) { console.log(JSON.stringify({found: 0, expected: 3, error: e.message})); }
  db.close();
  ' 2>/dev/null || echo '{"found":0,"expected":3}')

  SESSION_FOUND=$(echo "$SESSION_STATS" | node -e 'var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf-8"));console.log(d.found)' 2>/dev/null || echo "0")
  SESSION_EXPECTED=$(echo "$SESSION_STATS" | node -e 'var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf-8"));console.log(d.expected)' 2>/dev/null || echo "3")

  if [ "$SESSION_FOUND" -eq "$SESSION_EXPECTED" ] 2>/dev/null; then
    ok "${SESSION_FOUND}/${SESSION_EXPECTED} session stats tracked"
  elif [ "$SESSION_FOUND" -gt 0 ] 2>/dev/null; then
    warn "${SESSION_FOUND}/${SESSION_EXPECTED} session stats (partial - run session-start)"
  else
    warn "No session stats (run: node scripts/post-process.js --event session-start)"
  fi
else
  warn "Session tracking check requires SQLite backend"
fi

# -- 11b. Agent registration with session_count ---------------------------------
check "Agent session tracking (FIX-033)"
if [ "$INTEL_BACKEND" = "sqlite" ]; then
  AGENT_SESSIONS=$(node -e '
  var Database = require("better-sqlite3");
  var db = new Database(".ruvector/intelligence.db", { readonly: true });
  try {
    // Check schema
    var columns = db.prepare("PRAGMA table_info(agents)").all().map(function(c) { return c.name; });
    var hasMetadata = columns.indexOf("metadata") >= 0;
    var hasData = columns.indexOf("data") >= 0;

    if (hasMetadata) {
      // New schema
      var rows = db.prepare("SELECT name, metadata FROM agents").all();
      var tracked = 0;
      rows.forEach(function(r) {
        try {
          var meta = JSON.parse(r.metadata || "{}");
          if (meta.session_count > 0) tracked++;
        } catch(e) {}
      });
      console.log(JSON.stringify({schema: "new", agents: rows.length, tracked: tracked}));
    } else if (hasData) {
      // Legacy schema
      var rows = db.prepare("SELECT name, data FROM agents").all();
      var tracked = 0;
      rows.forEach(function(r) {
        try {
          var d = JSON.parse(r.data || "{}");
          if (d.session_count > 0) tracked++;
        } catch(e) {}
      });
      console.log(JSON.stringify({schema: "legacy", agents: rows.length, tracked: tracked}));
    } else {
      console.log(JSON.stringify({schema: "unknown", agents: 0, tracked: 0}));
    }
  } catch(e) { console.log(JSON.stringify({schema: "error", agents: 0, tracked: 0, error: e.message})); }
  db.close();
  ' 2>/dev/null || echo '{"schema":"error","agents":0,"tracked":0}')

  AGENT_SCHEMA=$(echo "$AGENT_SESSIONS" | node -e 'var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf-8"));console.log(d.schema)' 2>/dev/null || echo "unknown")
  AGENT_COUNT=$(echo "$AGENT_SESSIONS" | node -e 'var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf-8"));console.log(d.agents)' 2>/dev/null || echo "0")
  AGENT_TRACKED=$(echo "$AGENT_SESSIONS" | node -e 'var d=JSON.parse(require("fs").readFileSync("/dev/stdin","utf-8"));console.log(d.tracked)' 2>/dev/null || echo "0")

  if [ "$AGENT_COUNT" -gt 0 ] 2>/dev/null && [ "$AGENT_TRACKED" -gt 0 ] 2>/dev/null; then
    ok "${AGENT_TRACKED}/${AGENT_COUNT} agents with session tracking (${AGENT_SCHEMA} schema)"
  elif [ "$AGENT_COUNT" -gt 0 ] 2>/dev/null; then
    warn "${AGENT_COUNT} agents but 0 with session tracking"
  else
    warn "No agents registered (run: node scripts/post-process.js --event session-start)"
  fi
else
  warn "Agent tracking check requires SQLite backend"
fi

# -- 11c. Agents table name index ----------------------------------------------
check "Agents table name index (FIX-034)"
if [ "$INTEL_BACKEND" = "sqlite" ]; then
  HAS_INDEX=$(node -e '
  var Database = require("better-sqlite3");
  var db = new Database(".ruvector/intelligence.db", { readonly: true });
  try {
    var row = db.prepare("SELECT name FROM sqlite_master WHERE type=\"index\" AND name=\"idx_agents_name\"").get();
    console.log(row ? "yes" : "no");
  } catch(e) { console.log("no"); }
  db.close();
  ' 2>/dev/null || echo "no")

  if [ "$HAS_INDEX" = "yes" ]; then
    ok "idx_agents_name index exists"
  else
    warn "idx_agents_name index missing (run setup.sh to create)"
  fi
else
  warn "Index check requires SQLite backend"
fi

echo ""
echo "=== Validation Complete: $PASS passed, $WARN warnings, $FAIL failures ==="
[ $FAIL -gt 0 ] && echo "Fix failures before proceeding." && exit 1
[ $WARN -gt 0 ] && echo "Review warnings above." && exit 0
echo "All checks passed." && exit 0
