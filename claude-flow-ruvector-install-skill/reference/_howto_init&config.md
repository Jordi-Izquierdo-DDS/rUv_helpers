# Initialization & Configuration Guide

**Version:** v0.9.7
**Last Updated:** 2026-02-03
**Status:** 🟡 Working with workarounds

> **See Also:** [`_hardcoded_audit_report.md`](./_hardcoded_audit_report.md) - Complete audit of 183+ hardcoded values across all systems

---

## Executive Summary

The RuVector + Claude-Flow stack has **THREE configuration systems** that must be properly coordinated:

| System | Config Location | Purpose | Status |
|--------|-----------------|---------|--------|
| **Claude Code** | `.claude/settings.json` | Hooks, env vars, permissions | ✅ Works |
| **Claude-Flow Runtime** | `.claude-flow/config.yaml` | Swarm, MCP settings | 🟡 Partial |
| **Claude-Flow Schema** | `claude-flow.config.json` | Zod-validated config | ❌ Loaded but ignored |

### Key Discovery (2026-02-03)

**The `env` section in `.claude/settings.json` is the PRIMARY way to configure paths:**

```json
{
  "env": {
    "RUVECTOR_SQLITE_PATH": ".ruvector/intelligence.db",
    "CLAUDE_FLOW_DATA_DIR": ".ruvector",
    "RUVECTOR_MEMORY_BACKEND": "sqlite"
  }
}
```

**Problem:** Some env vars were READ by code but never SET in the config!

---

## The Three Config Systems

### 1. `.claude/settings.json` (Claude Code - PRIMARY)

**Location:** `.claude/settings.json`
**Created by:** `claude-flow init` or skill `setup.sh`
**Read by:** Claude Code (passes env to hooks)

Contains:
- `hooks` - PreToolUse, PostToolUse, SessionStart, etc.
- `env` - Environment variables passed to hook commands
- `claudeFlow` - V3 settings (written but not read by CLI)
- `permissions` - Auto-allow patterns
- `statusLine` - Status bar config

**This is where RUVECTOR env vars MUST be defined!**

### 2. `.claude-flow/config.yaml` (Runtime Config)

**Location:** `.claude-flow/config.yaml`
**Created by:** `claude-flow init`
**Read by:** `start.js`, `status.js` (partially)

```yaml
version: "3.0.0"
swarm:
  topology: hierarchical-mesh
  maxAgents: 15
memory:
  backend: hybrid
  persistPath: .ruvector          # Used by some commands
  dbPath: .ruvector/intelligence.db
neural:
  enabled: true
  modelPath: .ruvector            # IGNORED by neural.js!
```

**Note:** `neural.modelPath` is ignored - neural.js uses hardcoded paths.

### 3. `claude-flow.config.json` (Schema Config - IGNORED)

**Location:** Project root
**Created by:** Manual
**Read by:** ConfigLoader → ctx.config → **IGNORED BY ALL COMMANDS**

```json
{
  "orchestrator": { ... },
  "memory": { "type": "hybrid", "path": ".ruvector" },
  "swarm": { "topology": "hierarchical-mesh" }
}
```

**This config is loaded and validated but NO command reads ctx.config!**

---

## Environment Variables

### Where to Set Env Vars

Env vars must be in `.claude/settings.json` under the `env` key:

```json
{
  "env": {
    "RUVECTOR_SQLITE_PATH": ".ruvector/intelligence.db",
    "RUVECTOR_DATA_DIR": ".ruvector",
    "CLAUDE_FLOW_DATA_DIR": ".ruvector",
    "CLAUDE_FLOW_MEMORY_PATH": ".ruvector",
    "RUVECTOR_MEMORY_BACKEND": "sqlite",
    "RUVECTOR_SEMANTIC_EMBEDDINGS": "true",
    "RUVECTOR_EMBEDDING_MODEL": "all-MiniLM-L6-v2",
    "RUVECTOR_EMBEDDING_DIM": "384",
    "RUVECTOR_LEARNING_ENABLED": "true",
    "RUVECTOR_SONA_ENABLED": "true",
    "RUVECTOR_HNSW_ENABLED": "true",
    "RUVECTOR_Q_LEARNING_ALGORITHM": "double-q",
    "RUVECTOR_SEMANTIC_THRESHOLD": "0.55"
  }
}
```

### Critical Missing Env Var (Fixed)

**`RUVECTOR_SQLITE_PATH`** was READ by `setup.sh` but never SET:

```javascript
// setup.sh line 858 - READS this but it wasn't defined!
var dbPath = process.env.RUVECTOR_SQLITE_PATH || '.ruvector/intelligence.db';
```

**Fix:** Add to `.claude/settings.json` env section.

### Env Var Reference

| Variable | Purpose | Default | Status |
|----------|---------|---------|--------|
| `RUVECTOR_SQLITE_PATH` | Database path | `.ruvector/intelligence.db` | ✅ Must set |
| `RUVECTOR_DATA_DIR` | Data directory | `.ruvector` | ✅ Must set |
| `CLAUDE_FLOW_DATA_DIR` | Claude-flow data | `.ruvector` | ✅ Must set |
| `RUVECTOR_MEMORY_BACKEND` | Backend type | `sqlite` | ✅ Works |
| `RUVECTOR_EMBEDDING_MODEL` | ONNX model | `all-MiniLM-L6-v2` | ✅ Works |
| `RUVECTOR_EMBEDDING_DIM` | Vector dimension | `384` | ✅ Works |
| `RUVECTOR_SONA_ENABLED` | Enable SONA | `true` | ✅ Works |
| `RUVECTOR_HNSW_ENABLED` | Enable HNSW | `true` | ✅ Works |
| `RUVECTOR_DEBUG` | Debug logging | `false` | ✅ Works |

### Env Vars NOT Implemented

These appear in documentation but are NOT read by code:

```bash
CLAUDE_FLOW_CONFIG          # NOT READ - use --config flag instead
CLAUDE_FLOW_MEMORY_PATH     # NOT READ by commands
CLAUDE_FLOW_LOG_LEVEL       # NOT READ
```

---

## Database Unification Issue

### The Problem: Two Databases

Claude-flow and RuVector create SEPARATE databases by default:

| Database | Location | Created By | Size |
|----------|----------|------------|------|
| Claude-flow memory | `.swarm/memory.db` | `memory init` | ~150KB |
| RuVector SSOT | `.ruvector/intelligence.db` | skill setup | ~1.7MB |

### The Solution: Symlinks

Create symlinks so both systems use the same `.ruvector/` directory:

```bash
# Backup and symlink .swarm
mv .swarm .swarm.bak
ln -s .ruvector .swarm

# Symlink neural patterns
rm -rf .claude-flow/neural
ln -s ../.ruvector .claude-flow/neural

# Verify
ls -la .swarm .claude-flow/neural
# .swarm -> .ruvector
# .claude-flow/neural -> ../.ruvector
```

---

## Recommended Initialization Sequence

### Step 1: Run claude-flow init (creates base structure)

```bash
npx @claude-flow/cli@latest init --with-embeddings
```

**WARNING:** This overwrites `.claude/settings.json`! Run BEFORE customizing.

### Step 2: Add env vars to settings.json

Add or update the `env` section in `.claude/settings.json`:

```bash
# Use jq or edit manually
cat .claude/settings.json | jq '.env += {
  "RUVECTOR_SQLITE_PATH": ".ruvector/intelligence.db",
  "RUVECTOR_DATA_DIR": ".ruvector",
  "CLAUDE_FLOW_DATA_DIR": ".ruvector",
  "CLAUDE_FLOW_MEMORY_PATH": ".ruvector"
}' > tmp.json && mv tmp.json .claude/settings.json
```

### Step 3: Update .claude-flow/config.yaml

Edit `.claude-flow/config.yaml` to use `.ruvector` paths:

```yaml
memory:
  backend: hybrid
  enableHNSW: true
  persistPath: .ruvector
  dbPath: .ruvector/intelligence.db

neural:
  enabled: true
  modelPath: .ruvector
  dbPath: .ruvector/intelligence.db
```

### Step 4: Configure memory path

```bash
npx @claude-flow/cli@latest memory configure --path .ruvector
```

### Step 5: Create symlinks

```bash
# Symlink .swarm to .ruvector
[ -d .swarm ] && mv .swarm .swarm.bak
ln -s .ruvector .swarm

# Symlink neural to .ruvector
rm -rf .claude-flow/neural
ln -s ../.ruvector .claude-flow/neural
```

### Step 6: Run skill setup.sh (if using V3+RV skill)

```bash
bash howto_V3+RV_Skill/v0.9.7/scripts/setup.sh
```

### Step 7: Verify

```bash
# Check symlinks
ls -la .swarm .claude-flow/neural

# Check env vars
grep RUVECTOR_SQLITE_PATH .claude/settings.json

# Test neural train
npx @claude-flow/cli@latest neural train --sona

# Verify patterns saved to SSOT
ls -la .ruvector/patterns.json

# Sync to SQLite
node scripts/sync-neural-to-ssot.js
```

---

## Troubleshooting

### Issue: `init --force` wiped my settings

**Cause:** `init --force` overwrites `.claude/settings.json`

**Solution:** Don't use `--force` after customizing, or backup first:
```bash
cp .claude/settings.json .claude/settings.json.bak
npx @claude-flow/cli@latest init --force
# Then merge back your customizations
```

### Issue: Memory init uses wrong path

**Symptom:** `memory init` creates `.swarm/memory.db` instead of `.ruvector/`

**Cause:** Hardcoded path in memory command

**Solution:** Create symlink: `ln -s .ruvector .swarm`

### Issue: Neural patterns not in SSOT

**Symptom:** Patterns in JSON, not in SQLite

**Solution:**
```bash
node scripts/sync-neural-to-ssot.js
```

### Issue: Env vars not being used

**Symptom:** Code uses defaults despite env vars set

**Check:**
1. Env vars in `.claude/settings.json` `env` section?
2. Claude Code running (passes env to hooks)?
3. Variable name spelled correctly?

---

## Files Reference

| File | Purpose | Managed By |
|------|---------|------------|
| `.claude/settings.json` | Hooks, env vars, permissions | claude-flow init + manual |
| `.claude-flow/config.yaml` | Runtime config | claude-flow init + manual |
| `claude-flow.config.json` | Schema config (ignored) | Manual |
| `.ruvector/intelligence.db` | SSOT database | RuVector |
| `.ruvector/patterns.json` | Neural patterns | claude-flow (via symlink) |
| `.swarm` → `.ruvector` | Symlink | Manual |
| `.claude-flow/neural` → `.ruvector` | Symlink | Manual |

---

## Quick Reference: What Goes Where

| Setting | Location | Key |
|---------|----------|-----|
| Database path | `.claude/settings.json` | `env.RUVECTOR_SQLITE_PATH` |
| Swarm topology | `.claude-flow/config.yaml` | `swarm.topology` |
| Max agents | `.claude-flow/config.yaml` | `swarm.maxAgents` |
| Memory backend | `.claude/settings.json` | `env.RUVECTOR_MEMORY_BACKEND` |
| Embedding model | `.claude/settings.json` | `env.RUVECTOR_EMBEDDING_MODEL` |
| Hook timeouts | `.claude/settings.json` | `hooks.*.timeout` |
| Permissions | `.claude/settings.json` | `permissions.allow` |

---

## Appendix: Complete settings.json env Section

```json
{
  "env": {
    "RUVECTOR_SQLITE_PATH": ".ruvector/intelligence.db",
    "RUVECTOR_DATA_DIR": ".ruvector",
    "CLAUDE_FLOW_DATA_DIR": ".ruvector",
    "CLAUDE_FLOW_MEMORY_PATH": ".ruvector",
    "RUVECTOR_INTELLIGENCE_ENABLED": "true",
    "RUVECTOR_LEARNING_RATE": "0.1",
    "RUVECTOR_MEMORY_BACKEND": "sqlite",
    "RUVECTOR_SEMANTIC_EMBEDDINGS": "true",
    "RUVECTOR_EMBEDDING_MODEL": "all-MiniLM-L6-v2",
    "RUVECTOR_EMBEDDING_DIM": "384",
    "RUVECTOR_LEARNING_ENABLED": "true",
    "RUVECTOR_ONNX_ENABLED": "true",
    "RUVECTOR_HOOK_TIMEOUT": "10000",
    "RUVECTOR_PRETRAIN_DONE": "true",
    "RUVECTOR_SONA_ENABLED": "true",
    "RUVECTOR_HNSW_ENABLED": "true",
    "RUVECTOR_Q_LEARNING_ALGORITHM": "double-q",
    "RUVECTOR_SEMANTIC_THRESHOLD": "0.55"
  }
}
```

---

## Next Steps

1. ✅ Document proper init sequence - DONE
2. ✅ Identify missing env vars - DONE (RUVECTOR_SQLITE_PATH)
3. ✅ Create symlink workarounds - DONE
4. **TODO:** Submit PR to claude-flow for config reading
5. **TODO:** Add RUVECTOR_SQLITE_PATH to skill setup.sh
