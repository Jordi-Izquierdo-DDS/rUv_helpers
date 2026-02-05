# Migration Guide: v0.9.7 to v0.9.8

> **Version:** v0.9.8 | **Updated:** 2026-02-04 | **Audience:** Existing v0.9.7 users

---

## Overview

This guide covers upgrading from V3+RV Skill v0.9.7 to v0.9.8. The upgrade addresses
three root causes discovered during database forensics:

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| 64d embeddings instead of 384d | Pretrain ran before setup.sh | FIX-025 |
| Empty learning pipeline tables | Consolidate step missing | FIX-024 |
| Stats not synchronized | No stats sync in consolidate | FIX-027 |

---

## Pre-Migration Assessment

### Step 1: Check Current State

Run the v0.9.7 validation to understand your current state:

```bash
bash scripts/validate-setup.sh 2>&1 | tee migration-assessment.log
```

### Step 2: Assess Embedding Health

```bash
node -e '
var D = require("better-sqlite3");
var db = new D(".ruvector/intelligence.db", {readonly:true});

console.log("=== Embedding Analysis ===");
var byteGroups = db.prepare("SELECT length(embedding) as bytes, COUNT(*) as c FROM memories WHERE embedding IS NOT NULL GROUP BY bytes ORDER BY c DESC").all();
byteGroups.forEach(function(g) {
  var dim = g.bytes / 4;
  var status = (g.bytes === 1536) ? "OK (384d ONNX)" : (g.bytes === 256) ? "BAD (64d hash)" : "UNKNOWN";
  console.log("  " + g.bytes + " bytes (" + dim + "d): " + g.c + " memories - " + status);
});

console.log("\n=== Learning Pipeline Tables ===");
["neural_patterns", "edges", "agents", "trajectories", "compressed_patterns"].forEach(function(t) {
  try {
    var c = db.prepare("SELECT COUNT(*) as c FROM " + t).get().c;
    console.log("  " + t + ": " + c);
  } catch(e) { console.log("  " + t + ": ERROR"); }
});

console.log("\n=== Stats Table ===");
try {
  var stats = db.prepare("SELECT key, value FROM stats").all();
  if (stats.length === 0) { console.log("  Empty or missing"); }
  else { stats.forEach(function(s) { console.log("  " + s.key + ": " + s.value); }); }
} catch(e) { console.log("  Not found: " + e.message); }

db.close();
'
```

### Step 3: Determine Migration Path

Based on your assessment:

| Condition | Migration Path |
|-----------|---------------|
| All embeddings 384d + learning tables populated | Path A: Simple script update |
| Some/all embeddings 64d | Path B: Re-pretrain required |
| Learning tables empty | Path C: Consolidation needed |
| All issues present | Path D: Full reset recommended |

---

## Migration Path A: Simple Script Update

**Condition:** Embeddings are healthy (384d), learning tables populated.

### Step 1: Backup Current Installation

```bash
# Create backup directory
BACKUP_DIR=".v097-backup-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Backup databases
cp .ruvector/intelligence.db "$BACKUP_DIR/"
cp .swarm/memory.db "$BACKUP_DIR/" 2>/dev/null || true

# Backup scripts
cp -r scripts "$BACKUP_DIR/"

echo "Backup created at: $BACKUP_DIR"
```

### Step 2: Update Scripts

```bash
# Set skill path (adjust to your installation)
SKILL_PATH="/path/to/howto_V3+RV_Skill/v0.9.8"

# Update scripts
cp "$SKILL_PATH/scripts/setup.sh" scripts/
cp "$SKILL_PATH/scripts/post-process.js" scripts/
cp "$SKILL_PATH/scripts/validate-setup.sh" scripts/

# Verify version markers
grep "v0.9.8" scripts/setup.sh
grep "v0.9.8" scripts/post-process.js
grep "v0.9.8" scripts/validate-setup.sh
```

### Step 3: Run Consolidation to Sync Stats (FIX-027)

```bash
node scripts/post-process.js --event consolidate
```

### Step 4: Validate

```bash
bash scripts/validate-setup.sh
```

---

## Migration Path B: Re-Pretrain Required

**Condition:** Some or all embeddings are 64d hash instead of 384d ONNX.

### Step 1: Backup (Same as Path A Step 1)

### Step 2: Update Scripts (Same as Path A Step 2)

### Step 3: Verify ONNX Configuration

```bash
# Check that setup.sh has configured ONNX
grep "SEMANTIC_EMBEDDINGS" .claude/settings.json
# Should show: "RUVECTOR_SEMANTIC_EMBEDDINGS": "true"

# If not, re-run setup.sh
bash scripts/setup.sh
```

### Step 4: Clear Bad Embeddings and Re-Pretrain

```bash
# Option A: Clear only memories (preserves learning data)
node -e '
var D = require("better-sqlite3");
var db = new D(".ruvector/intelligence.db");
db.prepare("DELETE FROM memories").run();
console.log("Cleared memories table");
db.close();
'

# Re-pretrain with correct ONNX configuration
npx ruvector hooks pretrain --verbose
```

### Step 5: Run Consolidation

```bash
node scripts/post-process.js --event session-start --agent-name migration-agent
node scripts/post-process.js --event consolidate
```

### Step 6: Validate

```bash
bash scripts/validate-setup.sh
```

---

## Migration Path C: Consolidation Needed

**Condition:** Embeddings are healthy but learning pipeline tables are empty.

### Step 1: Backup (Same as Path A Step 1)

### Step 2: Update Scripts (Same as Path A Step 2)

### Step 3: Run Full Consolidation

```bash
# Register a session agent first
node scripts/post-process.js --event session-start --agent-name migration-agent

# Run consolidation (populates neural_patterns, edges, agents, stats)
node scripts/post-process.js --event consolidate --verbose
```

### Step 4: Validate

```bash
bash scripts/validate-setup.sh
```

---

## Migration Path D: Full Reset

**Condition:** Multiple issues present or uncertain state. Start fresh.

### Step 1: Backup Everything

```bash
BACKUP_DIR=".v097-backup-full-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

cp -r .ruvector "$BACKUP_DIR/"
cp -r .swarm "$BACKUP_DIR/" 2>/dev/null || true
cp -r .claude "$BACKUP_DIR/"
cp -r scripts "$BACKUP_DIR/"
cp -r packages "$BACKUP_DIR/" 2>/dev/null || true

echo "Full backup created at: $BACKUP_DIR"
```

### Step 2: Update to v0.9.8 Scripts

```bash
SKILL_PATH="/path/to/howto_V3+RV_Skill/v0.9.8"

# Update scripts
cp "$SKILL_PATH/scripts/setup.sh" scripts/
cp "$SKILL_PATH/scripts/post-process.js" scripts/
cp "$SKILL_PATH/scripts/validate-setup.sh" scripts/

# Update packages if needed
cp -r "$SKILL_PATH/packages/ruvector-storage" packages/ 2>/dev/null || true
cp -r "$SKILL_PATH/packages/sona-fallback" packages/ 2>/dev/null || true
```

### Step 3: Reset and Rebuild

```bash
# Remove old databases
rm -f .ruvector/intelligence.db
rm -f .swarm/memory.db

# Re-run full setup sequence (correct order!)
bash scripts/setup.sh

# Pretrain AFTER setup.sh (critical!)
npx ruvector hooks pretrain --verbose

# Populate learning pipeline
node scripts/post-process.js --event session-start --agent-name setup-agent
node scripts/post-process.js --event consolidate
```

### Step 4: Validate

```bash
bash scripts/validate-setup.sh
```

---

## Post-Migration Verification Checklist

After migration, verify all these pass:

```bash
# Level 9: Embedding dimension verification (FIX-025)
# Should show: all embeddings at 1536 bytes (384d)

# Level 8: Learning pipeline tables
# Should show: neural_patterns, edges, agents with entries

# Level 10: Stats table sync (FIX-027)
# Should show: essential stats populated

bash scripts/validate-setup.sh 2>&1 | grep -E "Level (8|9|10)|FAIL|OK"
```

Expected output:
```
--- Level 8: Learning Pipeline (v0.9.5 functional smoke test) ---
  neural_patterns populated: OK - N neural patterns
  edges populated: OK - N edges
  agents registered: OK - N agent(s)
--- Level 9: Embedding Dimension Verification (v0.9.8 FIX-025) ---
  Embedding bytes validation (FIX-025): OK - All N/N embeddings are 384d ONNX (1536 bytes)
--- Level 10: Stats Table Verification (v0.9.8 FIX-027) ---
  Stats table: OK - stats table exists
  Stats content synchronized (FIX-027): OK - 4/4 essential stats, N total entries
```

---

## Rollback Procedure

If migration fails and you need to rollback:

```bash
# Find your backup
ls -la .v097-backup-*

# Restore from backup
BACKUP_DIR=".v097-backup-YYYYMMDD_HHMMSS"  # Use your actual backup name

# Restore databases
cp "$BACKUP_DIR/intelligence.db" .ruvector/
cp "$BACKUP_DIR/memory.db" .swarm/ 2>/dev/null || true

# Restore scripts
cp -r "$BACKUP_DIR/scripts" ./

echo "Rollback complete"
```

---

## Breaking Changes

### v0.9.8 Changes

1. **setup.sh**: Added SECTION 4 (FIX-024) for consolidation step
2. **setup.sh**: Added FIX-025 embedding dimension verification
3. **setup.sh**: Added FIX-027 stats table sync
4. **post-process.js**: Added stats table sync in consolidate handler (FIX-027)
5. **validate-setup.sh**: Added Level 9 (embedding bytes) and Level 10 (stats sync)

### New Dependencies

None. v0.9.8 uses the same dependencies as v0.9.7.

### Configuration Changes

None. v0.9.8 uses the same configuration format as v0.9.7.

---

## Troubleshooting Migration Issues

### Issue: "stats table missing" after migration

**Cause:** Using old post-process.js that doesn't create stats table.
**Fix:** Ensure you copied the v0.9.8 post-process.js, then re-run consolidate.

### Issue: "64d embeddings" persist after re-pretrain

**Cause:** setup.sh didn't run or ONNX not configured.
**Fix:**
1. Verify ONNX config: `grep SEMANTIC_EMBEDDINGS .claude/settings.json`
2. Re-run setup.sh
3. Delete memories and re-pretrain

### Issue: Consolidate produces 0 entities

**Cause:** No memories exist to consolidate.
**Fix:** Run pretrain first to create memories, then consolidate.

---

## Support

For issues not covered here, see:
- `reference/troubleshooting.md` - Comprehensive error scenarios
- `reference/fox-method.md` - For upstream code modifications
- `SKILL.md` - Complete skill documentation
