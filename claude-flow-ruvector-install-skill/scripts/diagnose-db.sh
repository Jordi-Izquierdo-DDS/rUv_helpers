#!/bin/bash
# diagnose-db.sh v0.9.9 — Read-only SQLite diagnostic for ruvector intelligence database.
# Produces a structured report matching the "DB Analysis Results" format.
# Works with both SQLite and JSON backends.
# v0.9.9: Added Section 14 for session tracking diagnostics
#
# Usage: bash scripts/diagnose-db.sh

set -euo pipefail

echo "=== RuVector Intelligence DB Diagnostic v0.9.9 ($(date)) ==="
echo ""

# Detect backend
INTEL_BACKEND="none"
if [ -f ".ruvector/intelligence.db" ]; then
  INTEL_BACKEND="sqlite"
elif [ -f ".ruvector/intelligence.json" ]; then
  INTEL_BACKEND="json"
fi

echo "Backend: $INTEL_BACKEND"
echo ""

if [ "$INTEL_BACKEND" = "none" ]; then
  echo "No intelligence store found."
  echo "Initialize with: npx ruvector hooks init --fast"
  exit 1
fi

# ============================================================
# Section 1: Row Counts Per Table
# ============================================================
echo "--- Section 1: Row Counts ---"

if [ "$INTEL_BACKEND" = "sqlite" ]; then
  node -e '
  const Database = require("better-sqlite3");
  const db = new Database(".ruvector/intelligence.db", { readonly: true });

  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type=" + "'"'"'"+ "table" + "'"'"'" + " ORDER BY name").all();
  const maxLen = Math.max(...tables.map(t => t.name.length));

  tables.forEach(t => {
    try {
      const row = db.prepare("SELECT COUNT(*) as c FROM " + t.name).get();
      const padded = t.name.padEnd(maxLen + 2);
      console.log("  " + padded + row.c + " rows");
    } catch(e) {
      console.log("  " + t.name.padEnd(maxLen + 2) + "ERROR: " + e.message);
    }
  });
  db.close();
  ' 2>/dev/null || echo "  ERROR: Could not read SQLite database (is better-sqlite3 installed?)"
else
  node -e '
  const d = JSON.parse(require("fs").readFileSync(".ruvector/intelligence.json", "utf-8"));
  const sections = {
    memories: (d.memories || []).length,
    patterns: Object.keys(d.patterns || {}).length,
    trajectories: (d.trajectories || []).length,
    errors: Object.keys(d.errors || {}).length,
    file_sequences: (d.file_sequences || []).length,
    agents: Object.keys(d.agents || {}).length,
    edges: (d.edges || []).length,
    learning_configs: d.learning ? Object.keys(d.learning.configs || {}).length : 0,
    learning_stats: d.learning ? Object.keys(d.learning.stats || {}).length : 0,
    dirPatterns: Object.keys(d.dirPatterns || {}).length,
    compressedPatterns: Object.keys((d.compressedPatterns || {}).tensors || {}).length,
  };
  const maxLen = Math.max(...Object.keys(sections).map(k => k.length));
  Object.keys(sections).forEach(k => {
    console.log("  " + k.padEnd(maxLen + 2) + sections[k] + " entries");
  });
  '
fi

echo ""

# ============================================================
# Section 2: Embedding Dimension Distribution
# ============================================================
echo "--- Section 2: Embedding Dimensions ---"

if [ "$INTEL_BACKEND" = "sqlite" ]; then
  node -e '
  const Database = require("better-sqlite3");
  const db = new Database(".ruvector/intelligence.db", { readonly: true });
  const rows = db.prepare("SELECT length(embedding) as bytes, COUNT(*) as c FROM memories GROUP BY length(embedding) ORDER BY c DESC").all();
  if (rows.length === 0) {
    console.log("  No memories found.");
  } else {
    console.log("  Bytes     Dims    Count   Status");
    console.log("  -----     ----    -----   ------");
    rows.forEach(r => {
      const bytes = r.bytes === null ? "NULL" : String(r.bytes);
      const dims = r.bytes === null ? "N/A" : String(r.bytes / 4) + "d";
      let status = "";
      if (r.bytes === null) status = "BROKEN (never embedded)";
      else if (r.bytes === 256) status = "BROKEN (64d hash fallback)";
      else if (r.bytes === 1536) status = "OK (384d MiniLM)";
      else if (r.bytes === 3072) status = "OK (768d mpnet)";
      else if (r.bytes === 1024) status = "WARN (256d attention engine)";
      else status = "UNKNOWN";
      console.log("  " + bytes.padEnd(10) + dims.padEnd(8) + String(r.c).padEnd(8) + status);
    });
  }
  db.close();
  ' 2>/dev/null || echo "  ERROR: Could not query embeddings"
else
  node -e '
  const d = JSON.parse(require("fs").readFileSync(".ruvector/intelligence.json", "utf-8"));
  const dims = {};
  (d.memories || []).forEach(m => {
    const k = m.embedding === null ? "null" : String(m.embedding.length);
    dims[k] = (dims[k] || 0) + 1;
  });
  if (Object.keys(dims).length === 0) {
    console.log("  No memories found.");
  } else {
    console.log("  Dimension   Count   Status");
    console.log("  ---------   -----   ------");
    Object.keys(dims).sort().forEach(k => {
      let status = "";
      if (k === "null") status = "BROKEN (never embedded)";
      else if (k === "64") status = "BROKEN (64d hash fallback)";
      else if (k === "384") status = "OK (384d MiniLM)";
      else if (k === "768") status = "OK (768d mpnet)";
      else if (k === "256") status = "WARN (256d attention engine)";
      else status = "UNKNOWN";
      console.log("  " + (k + "d").padEnd(12) + String(dims[k]).padEnd(8) + status);
    });
  }
  '
fi

echo ""

# ============================================================
# Section 3: Content Quality Check
# ============================================================
echo "--- Section 3: Content Quality ---"

if [ "$INTEL_BACKEND" = "sqlite" ]; then
  node -e '
  const Database = require("better-sqlite3");
  const db = new Database(".ruvector/intelligence.db", { readonly: true });
  const total = db.prepare("SELECT COUNT(*) as c FROM memories").get().c;
  const empty = db.prepare("SELECT COUNT(*) as c FROM memories WHERE content IS NULL OR content = " + "'"'"'" + "'"'"'" + " OR content LIKE " + "'"'"'" + "Reading: " + "'"'"'" + " OR content LIKE " + "'"'"'" + "Search: " + "'"'"'" + " OR content LIKE " + "'"'"'" + "Agent: " + "'"'"'").get().c;
  const hasContent = total - empty;
  console.log("  Total memories:      " + total);
  console.log("  With real content:   " + hasContent);
  console.log("  Empty/stub content:  " + empty + (empty > 0 ? "  (RC1: stdin bridge not applied?)" : ""));

  // Check for patterns matching $TOOL_INPUT_ expansion failure
  const blankField = db.prepare("SELECT COUNT(*) as c FROM memories WHERE content LIKE " + "'"'"'" + "%: %" + "'"'"'" + " AND length(content) < 15").get().c;
  if (blankField > 0) {
    console.log("  Short stub memories: " + blankField + "  (likely empty $TOOL_INPUT_ expansions)");
  }
  db.close();
  ' 2>/dev/null || echo "  ERROR: Could not check content quality"
else
  node -e '
  const d = JSON.parse(require("fs").readFileSync(".ruvector/intelligence.json", "utf-8"));
  const mems = d.memories || [];
  const total = mems.length;
  const empty = mems.filter(m => !m.content || m.content.length < 10).length;
  console.log("  Total memories:      " + total);
  console.log("  With real content:   " + (total - empty));
  console.log("  Empty/stub content:  " + empty + (empty > 0 ? "  (RC1: stdin bridge not applied?)" : ""));
  '
fi

echo ""

# ============================================================
# Section 4: Q-Learning Store Comparison (RC6)
# ============================================================
echo "--- Section 4: Q-Learning Stores (RC6: dual store) ---"

if [ "$INTEL_BACKEND" = "sqlite" ]; then
  node -e '
  const Database = require("better-sqlite3");
  const db = new Database(".ruvector/intelligence.db", { readonly: true });

  // Store 1: patterns table (legacy)
  let patternsCount = 0;
  try {
    patternsCount = db.prepare("SELECT COUNT(*) as c FROM patterns").get().c;
  } catch(e) {}

  // Store 2: learning_data.qTables (new)
  let qTableEntries = 0;
  let algorithms = 0;
  try {
    const rows = db.prepare("SELECT algorithm, q_table FROM learning_data").all();
    algorithms = rows.length;
    rows.forEach(r => {
      try {
        const qt = JSON.parse(r.q_table);
        if (qt.qTables) {
          Object.keys(qt.qTables).forEach(k => {
            qTableEntries += Object.keys(qt.qTables[k]).length;
          });
        }
      } catch(e) {}
    });
  } catch(e) {}

  console.log("  patterns table (legacy):        " + patternsCount + " entries");
  console.log("  learning_data qTables (new):    " + qTableEntries + " entries across " + algorithms + " algorithm(s)");
  console.log("");
  if (patternsCount > 0 && qTableEntries > 0) {
    console.log("  NOTE: Both stores have data. hooks stats only reports patterns table.");
    console.log("  Total Q-learning state: " + (patternsCount + qTableEntries) + " entries (combined)");
  } else if (patternsCount === 0 && qTableEntries === 0) {
    console.log("  Both stores empty (cold start). Seed with batch-learn.");
  }
  db.close();
  ' 2>/dev/null || echo "  ERROR: Could not query Q-learning stores"
else
  node -e '
  const d = JSON.parse(require("fs").readFileSync(".ruvector/intelligence.json", "utf-8"));
  const patternsCount = Object.keys(d.patterns || {}).length;
  let qEntries = 0;
  if (d.learning && d.learning.qTables) {
    Object.keys(d.learning.qTables).forEach(k => {
      qEntries += Object.keys(d.learning.qTables[k]).length;
    });
  }
  console.log("  patterns (legacy):              " + patternsCount + " entries");
  console.log("  learning.qTables (new):         " + qEntries + " entries");
  if (patternsCount > 0 && qEntries > 0) {
    console.log("  NOTE: Both stores have data. hooks stats only reports patterns.");
  }
  '
fi

echo ""

# ============================================================
# Section 5: KV Store Entries
# ============================================================
echo "--- Section 5: KV Store ---"

if [ "$INTEL_BACKEND" = "sqlite" ]; then
  node -e '
  const Database = require("better-sqlite3");
  const db = new Database(".ruvector/intelligence.db", { readonly: true });
  try {
    const rows = db.prepare("SELECT key, value FROM kv_store ORDER BY key").all();
    if (rows.length === 0) {
      console.log("  (empty)");
    } else {
      rows.forEach(r => {
        const val = String(r.value || "").substring(0, 80);
        console.log("  " + r.key.padEnd(25) + val);
      });
    }
  } catch(e) {
    console.log("  kv_store table not found");
  }
  db.close();
  ' 2>/dev/null || echo "  ERROR: Could not read kv_store"
else
  echo "  (JSON backend has no kv_store — check .ruvector/kv.json)"
  if [ -f ".ruvector/kv.json" ]; then
    node -e 'const d=JSON.parse(require("fs").readFileSync(".ruvector/kv.json","utf-8"));Object.keys(d).forEach(k=>console.log("  "+k.padEnd(25)+String(d[k]).substring(0,80)))' 2>/dev/null
  fi
fi

echo ""

# ============================================================
# Section 6: File Sequences (RC3)
# ============================================================
echo "--- Section 6: File Sequences (RC3) ---"

if [ "$INTEL_BACKEND" = "sqlite" ]; then
  node -e '
  const Database = require("better-sqlite3");
  const db = new Database(".ruvector/intelligence.db", { readonly: true });
  try {
    const count = db.prepare("SELECT COUNT(*) as c FROM file_sequences").get().c;
    console.log("  file_sequences: " + count + " entries" + (count === 0 ? "  (RC3: lastEditedFile not persisted?)" : ""));
    if (count > 0) {
      const sample = db.prepare("SELECT from_file, to_file, count FROM file_sequences ORDER BY count DESC LIMIT 5").all();
      sample.forEach(r => {
        console.log("    " + r.from_file + " -> " + r.to_file + " (" + r.count + "x)");
      });
    }
  } catch(e) {
    console.log("  file_sequences table not found");
  }
  db.close();
  ' 2>/dev/null || echo "  ERROR: Could not query file_sequences"
else
  node -e '
  const d = JSON.parse(require("fs").readFileSync(".ruvector/intelligence.json", "utf-8"));
  const seqs = d.file_sequences || [];
  console.log("  file_sequences: " + seqs.length + " entries" + (seqs.length === 0 ? "  (RC3: lastEditedFile not persisted?)" : ""));
  ' 2>/dev/null
fi

echo ""

# ============================================================
# Section 7: Agents & Edges Tables (RC4)
# ============================================================
echo "--- Section 7: Agents & Edges (RC4: no CLI write paths) ---"

if [ "$INTEL_BACKEND" = "sqlite" ]; then
  node -e '
  const Database = require("better-sqlite3");
  const db = new Database(".ruvector/intelligence.db", { readonly: true });
  try {
    const agents = db.prepare("SELECT COUNT(*) as c FROM agents").get().c;
    console.log("  agents:  " + agents + " rows" + (agents === 0 ? "  (known: no CLI write paths)" : ""));
  } catch(e) { console.log("  agents:  table not found"); }
  try {
    const edges = db.prepare("SELECT COUNT(*) as c FROM edges").get().c;
    console.log("  edges:   " + edges + " rows" + (edges === 0 ? "  (known: no CLI write paths)" : ""));
  } catch(e) { console.log("  edges:   table not found"); }
  db.close();
  ' 2>/dev/null || echo "  ERROR: Could not query agents/edges"
else
  node -e '
  const d = JSON.parse(require("fs").readFileSync(".ruvector/intelligence.json", "utf-8"));
  console.log("  agents: " + Object.keys(d.agents || {}).length + " entries");
  console.log("  edges:  " + (d.edges || []).length + " entries");
  '
fi

echo ""

# ============================================================
# Section 8: Hook Command Audit
# ============================================================
echo "--- Section 8: Hook Command Audit ---"

if [ -f ".claude/settings.json" ]; then
  TOOL_INPUT_COUNT=$(grep -c 'TOOL_INPUT_' .claude/settings.json 2>/dev/null || echo "0")
  BRIDGE_COUNT=$(grep -c 'ruvector-hook-bridge' .claude/settings.json 2>/dev/null || echo "0")
  SEMANTIC_SETTINGS=$(grep -c '\-\-semantic' .claude/settings.json 2>/dev/null || echo "0")
  SEMANTIC_BRIDGE=$(grep -c '\-\-semantic' .claude/ruvector-hook-bridge.sh 2>/dev/null || echo "0")
  SEMANTIC_TOTAL=$((SEMANTIC_SETTINGS + SEMANTIC_BRIDGE))

  echo "  \$TOOL_INPUT_* references:  $TOOL_INPUT_COUNT"
  [ "$TOOL_INPUT_COUNT" -gt 0 ] 2>/dev/null && echo "    RC1: Apply FIX-007 to replace with stdin bridge"
  echo "  Bridge script references:  $BRIDGE_COUNT"
  echo "  --semantic flags (settings): $SEMANTIC_SETTINGS"
  echo "  --semantic flags (bridge):   $SEMANTIC_BRIDGE"
  echo "  --semantic flags (total):    $SEMANTIC_TOTAL"
  [ "$SEMANTIC_TOTAL" -eq 0 ] 2>/dev/null && echo "    WARN: No --semantic flags in settings or bridge. Run setup.sh"
else
  echo "  settings.json not found"
fi

echo ""

# ============================================================
# Section 9: Stats Summary
# ============================================================
echo "--- Section 9: Stats ---"

if [ "$INTEL_BACKEND" = "sqlite" ]; then
  node -e '
  const Database = require("better-sqlite3");
  const db = new Database(".ruvector/intelligence.db", { readonly: true });
  try {
    const rows = db.prepare("SELECT key, value FROM stats ORDER BY key").all();
    rows.forEach(r => console.log("  " + r.key.padEnd(25) + r.value));
  } catch(e) { console.log("  stats table not found"); }
  db.close();
  ' 2>/dev/null || echo "  ERROR: Could not read stats"
else
  node -e '
  const d = JSON.parse(require("fs").readFileSync(".ruvector/intelligence.json", "utf-8"));
  const s = d.stats || {};
  Object.keys(s).forEach(k => console.log("  " + k.padEnd(25) + s[k]));
  '
fi

echo ""

# ============================================================
# Section 10: Neural Patterns Table (FIX-010)
# ============================================================
echo "--- Section 10: Neural Patterns (FIX-010) ---"

if [ "$INTEL_BACKEND" = "sqlite" ]; then
  node -e '
  var Database = require("better-sqlite3");
  var db = new Database(".ruvector/intelligence.db", { readonly: true });
  var exists = db.prepare("SELECT name FROM sqlite_master WHERE type='"'"'table'"'"' AND name='"'"'neural_patterns'"'"'").get();
  if (!exists) {
    console.log("  neural_patterns table: MISSING (apply FIX-010)");
  } else {
    var count = db.prepare("SELECT COUNT(*) as c FROM neural_patterns").get().c;
    console.log("  neural_patterns table: " + count + " rows");
    if (count > 0) {
      var cats = db.prepare("SELECT category, COUNT(*) as c FROM neural_patterns GROUP BY category ORDER BY c DESC").all();
      cats.forEach(function(r) { console.log("    " + (r.category || "null").padEnd(20) + r.c + " entries"); });
      var withEmb = db.prepare("SELECT COUNT(*) as c FROM neural_patterns WHERE embedding IS NOT NULL").get().c;
      console.log("    With embeddings: " + withEmb + "/" + count);
    }
  }
  db.close();
  ' 2>/dev/null || echo "  ERROR: Could not check neural_patterns"
else
  echo "  (JSON backend — neural_patterns table N/A)"
fi

echo ""

# ============================================================
# Section 11: JSON vs DB Comparison (FIX-011)
# ============================================================
echo "--- Section 11: JSON vs DB Parity ---"

if [ "$INTEL_BACKEND" = "sqlite" ] && [ -f ".ruvector/intelligence.json" ]; then
  node -e '
  var Database = require("better-sqlite3");
  var db = new Database(".ruvector/intelligence.db", { readonly: true });
  var d = JSON.parse(require("fs").readFileSync(".ruvector/intelligence.json", "utf-8"));

  var comparisons = [
    { name: "memories", dbQ: "SELECT COUNT(*) as c FROM memories", jsonLen: (d.memories || []).length },
    { name: "trajectories", dbQ: "SELECT COUNT(*) as c FROM trajectories", jsonLen: (d.trajectories || []).length },
    { name: "patterns", dbQ: "SELECT COUNT(*) as c FROM patterns", jsonLen: Object.keys(d.patterns || {}).length },
    { name: "file_sequences", dbQ: "SELECT COUNT(*) as c FROM file_sequences", jsonLen: (d.file_sequences || []).length },
    { name: "agents", dbQ: "SELECT COUNT(*) as c FROM agents", jsonLen: Object.keys(d.agents || {}).length },
    { name: "edges", dbQ: "SELECT COUNT(*) as c FROM edges", jsonLen: (d.edges || []).length },
    { name: "errors", dbQ: "SELECT COUNT(*) as c FROM errors", jsonLen: Object.keys(d.errors || {}).length },
  ];

  console.log("  Table            DB      JSON    Status");
  console.log("  -----            --      ----    ------");
  comparisons.forEach(function(c) {
    var dbCount = 0;
    try { dbCount = db.prepare(c.dbQ).get().c; } catch(e) {}
    var status = "";
    if (dbCount === c.jsonLen) status = "MATCH";
    else if (c.jsonLen > dbCount) status = "JSON+" + (c.jsonLen - dbCount) + " (run FIX-011)";
    else status = "DB+" + (dbCount - c.jsonLen);
    console.log("  " + c.name.padEnd(19) + String(dbCount).padEnd(8) + String(c.jsonLen).padEnd(8) + status);
  });

  // Learning data comparison
  var dbLearning = null;
  try {
    var row = db.prepare("SELECT q_table FROM learning_data WHERE algorithm = '"'"'combined'"'"'").get();
    if (row) dbLearning = JSON.parse(row.q_table);
  } catch(e) {}
  var jsonLearning = d.learning || null;

  if (dbLearning && jsonLearning) {
    var dbQT = dbLearning.qTables ? Object.keys(dbLearning.qTables).length : 0;
    var jsonQT = jsonLearning.qTables ? Object.keys(jsonLearning.qTables).length : 0;
    var dbRH = (dbLearning.rewardHistory || []).length;
    var jsonRH = (jsonLearning.rewardHistory || []).length;
    console.log("  learning.qTables " + String(dbQT).padEnd(8) + String(jsonQT).padEnd(8) + (dbQT === jsonQT ? "MATCH" : "MISMATCH"));
    console.log("  learning.rewards " + String(dbRH).padEnd(8) + String(jsonRH).padEnd(8) + (dbRH === jsonRH ? "MATCH" : "MISMATCH"));
  }

  db.close();
  ' 2>/dev/null || echo "  ERROR: Could not compare JSON vs DB"
else
  if [ "$INTEL_BACKEND" = "sqlite" ]; then
    echo "  No JSON mirror found (single-source DB)"
  else
    echo "  JSON backend only (no DB to compare)"
  fi
fi

echo ""

# ============================================================
# Section 12: Advanced Learning Components (FIX-013 to FIX-016)
# ============================================================
echo "--- Section 12: Advanced Learning Components ---"

if [ "$INTEL_BACKEND" = "sqlite" ]; then
  node -e '
  var Database = require("better-sqlite3");
  var db = new Database(".ruvector/intelligence.db", { readonly: true });

  // SONA stats from kv_store (FIX-013)
  try {
    var sonaRow = db.prepare("SELECT value FROM kv_store WHERE key = ?").get("sona_stats");
    if (sonaRow) {
      var stats = JSON.parse(sonaRow.value);
      console.log("  SONA stats (from kv_store):");
      Object.entries(stats).forEach(function(e) {
        console.log("    " + e[0] + ": " + JSON.stringify(e[1]));
      });
    } else {
      console.log("  SONA stats: not yet stored (appears after first save with FIX-013)");
    }
  } catch(e) { console.log("  SONA stats: error reading - " + e.message); }

  // HNSW persistence check
  var fs = require("fs");
  var path = require("path");
  var hnswPath = path.join(process.cwd(), ".ruvector", "hnsw.db");
  if (fs.existsSync(hnswPath)) {
    var stat = fs.statSync(hnswPath);
    console.log("  HNSW index: " + hnswPath + " (" + stat.size + " bytes)");
  } else {
    console.log("  HNSW index: not persisted (no .ruvector/hnsw.db)");
  }

  // FIX marker check in cli.js
  try {
    var cliSrc = fs.readFileSync("node_modules/ruvector/bin/cli.js", "utf-8");
    var markers = ["FIX-013", "FIX-015"].map(function(m) {
      return m + ": " + (cliSrc.indexOf(m) !== -1 ? "applied" : "not applied");
    });
    console.log("  cli.js patches: " + markers.join(", "));
  } catch(e) { console.log("  cli.js patches: could not check"); }

  // FIX marker check in engine
  try {
    var engSrc = fs.readFileSync("node_modules/ruvector/dist/core/intelligence-engine.js", "utf-8");
    var engMarkers = ["FIX-014", "FIX-016", "_getTinyDancer", "storagePath"].map(function(m) {
      return m + ": " + (engSrc.indexOf(m) !== -1 ? "found" : "not found");
    });
    console.log("  engine patches: " + engMarkers.join(", "));
  } catch(e) { console.log("  engine patches: could not check"); }

  // Trajectory count for SONA warm-up estimate
  try {
    var trajCount = db.prepare("SELECT COUNT(*) as c FROM trajectories").get().c;
    var warmupCount = Math.min(trajCount, 50);
    console.log("  SONA warm-up: will replay " + warmupCount + " of " + trajCount + " trajectories on next load");
  } catch(e) {}

  db.close();
  ' 2>/dev/null || echo "  ERROR: Could not check advanced components"
else
  echo "  (JSON backend — advanced component checks limited)"
  echo "  FIX-013 to FIX-016 require SQLite backend"
fi

echo ""

# ============================================================
# Section 13: Embedding Buffer Validation (v0.9.7)
# ============================================================
echo "--- Section 13: Embedding Buffer Validation (v0.9.7) ---"

if [ "$INTEL_BACKEND" = "sqlite" ]; then
  node -e '
  const Database = require("better-sqlite3");
  const { parseEmbedding, validateEmbedding } = require("./scripts/parseEmbedding.js");
  const db = new Database(".ruvector/intelligence.db", { readonly: true });

  // Check neural_patterns embeddings
  try {
    const patterns = db.prepare("SELECT id, embedding FROM neural_patterns WHERE embedding IS NOT NULL LIMIT 5").all();
    console.log("  Neural pattern embedding validation:");
    let valid = 0, invalid = 0;
    patterns.forEach(p => {
      const parsed = parseEmbedding(p.embedding);
      const result = validateEmbedding(parsed);
      if (result.valid) {
        valid++;
      } else {
        invalid++;
        console.log("    " + p.id + ": INVALID - " + result.error);
      }
    });
    console.log("    Sampled: " + (valid + invalid) + " (valid: " + valid + ", invalid: " + invalid + ")");
  } catch(e) {
    console.log("  Could not validate neural_patterns: " + e.message);
    console.log("  (parseEmbedding.js may not be installed yet)");
  }

  // Check memories embeddings
  try {
    const memories = db.prepare("SELECT id, embedding FROM memories WHERE embedding IS NOT NULL LIMIT 5").all();
    console.log("  Memory embedding validation:");
    let valid = 0, invalid = 0;
    memories.forEach(m => {
      const parsed = parseEmbedding(m.embedding);
      const result = validateEmbedding(parsed);
      if (result.valid) {
        valid++;
      } else {
        invalid++;
        console.log("    " + m.id + ": INVALID - " + result.error);
      }
    });
    console.log("    Sampled: " + (valid + invalid) + " (valid: " + valid + ", invalid: " + invalid + ")");
  } catch(e) {
    console.log("  Could not validate memories: " + e.message);
  }

  db.close();
  ' 2>/dev/null || echo "  Skipping embedding validation (parseEmbedding.js not available)"
else
  echo "  (JSON backend - buffer validation not needed)"
fi

echo ""

# ============================================================
# Section 14: Session Tracking (v0.9.9)
# ============================================================
echo "--- Section 14: Session Tracking (v0.9.9) ---"

if [ "$INTEL_BACKEND" = "sqlite" ]; then
  node -e '
  const Database = require("better-sqlite3");
  const db = new Database(".ruvector/intelligence.db", { readonly: true });

  // Session stats from stats table
  console.log("  Session stats:");
  try {
    const sessionKeys = ["session_count", "last_session", "last_session_timestamp", "total_sessions", "last_session_end", "last_agent"];
    sessionKeys.forEach(k => {
      const row = db.prepare("SELECT value, updated_at FROM stats WHERE key = ?").get(k);
      if (row) {
        const updated = row.updated_at ? new Date(row.updated_at * 1000).toISOString() : "unknown";
        console.log("    " + k.padEnd(25) + row.value.padEnd(30) + "(updated: " + updated + ")");
      } else {
        console.log("    " + k.padEnd(25) + "(not set)");
      }
    });
  } catch(e) {
    console.log("    Error reading session stats: " + e.message);
  }

  // Agent session tracking
  console.log("");
  console.log("  Agent session tracking:");
  try {
    // Check schema
    const columns = db.prepare("PRAGMA table_info(agents)").all().map(c => c.name);
    const hasMetadata = columns.includes("metadata");
    const hasData = columns.includes("data");

    if (hasMetadata) {
      console.log("    Schema: new (id, name, type, status, created_at, last_seen, metadata)");
      const rows = db.prepare("SELECT name, type, status, last_seen, metadata FROM agents ORDER BY last_seen DESC LIMIT 10").all();
      rows.forEach(r => {
        let meta = {};
        try { meta = JSON.parse(r.metadata || "{}"); } catch(e) {}
        const lastSeen = r.last_seen ? new Date(r.last_seen * 1000).toISOString() : "never";
        console.log("    " + r.name.padEnd(20) + "sessions=" + String(meta.session_count || 0).padEnd(5) + "type=" + (r.type || "unknown").padEnd(12) + "last_seen=" + lastSeen);
      });
    } else if (hasData) {
      console.log("    Schema: legacy (name, data)");
      const rows = db.prepare("SELECT name, data FROM agents").all();
      rows.forEach(r => {
        let d = {};
        try { d = JSON.parse(r.data || "{}"); } catch(e) {}
        const lastSeen = d.last_seen ? new Date(d.last_seen * 1000).toISOString() : "never";
        console.log("    " + r.name.padEnd(20) + "sessions=" + String(d.session_count || 0).padEnd(5) + "last_seen=" + lastSeen);
      });
    } else {
      console.log("    Unknown agents table schema");
    }
  } catch(e) {
    console.log("    Error reading agents: " + e.message);
  }

  // Index check
  console.log("");
  console.log("  Indexes:");
  try {
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type=\"index\" AND tbl_name=\"agents\"").all();
    if (indexes.length === 0) {
      console.log("    (no indexes on agents table)");
    } else {
      indexes.forEach(i => console.log("    " + i.name));
    }
  } catch(e) {}

  db.close();
  ' 2>/dev/null || echo "  ERROR: Could not read session tracking info"
else
  echo "  (JSON backend - session tracking limited)"
  if [ -f ".ruvector/intelligence.json" ]; then
    node -e '
    const d = JSON.parse(require("fs").readFileSync(".ruvector/intelligence.json", "utf-8"));
    console.log("  Agents:", Object.keys(d.agents || {}).length);
    if (d.stats && d.stats.session_count) {
      console.log("  Session count:", d.stats.session_count);
    }
    '
  fi
fi

echo ""

echo "=== Diagnostic Complete ==="
