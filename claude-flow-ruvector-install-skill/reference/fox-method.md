# FOX Method: Local Fix & Extension Protocol

> **Version:** v0.9.7 | **Updated:** 2026-02-03 | **Ecosystem:** claude-flow v3.0.0-alpha.120 + ruvector 0.1.96

**FOX = Fork + Overlay + eXtend**

Work around upstream bugs, missing features, and architectural limitations locally -- without losing update capability.

## Contents

- [When to Use](#when-to-use)
- [FOX at Two Scales](#fox-at-two-scales)
- [Scale 2b: Runtime Shim (Cleaner Option)](#scale-2b-runtime-shim-cleaner-option)
- [Setup](#setup)
- [Creating a Fix](#creating-a-fix)
- [Fix Registry](#fix-registry)
- [Checking if Fix Still Needed](#checking-if-fix-still-needed)
- [Scale 1: Surgical Fixes](#scale-1-surgical-fixes)
- [Scale 2: Architectural Extensions](#scale-2-architectural-extensions)
- [Post-Init Checklist](#post-init-checklist)
- [Upstream Research Protocol](#upstream-research-protocol)

---

## When to Use

| Condition | Use FOX |
|-----------|---------|
| Bug in upstream package blocking your work | Yes |
| Upstream slow to merge PRs | Yes |
| Missing feature you need now | Yes |
| Architectural limitation (e.g. storage, routing) | Yes |
| Standard usage, no issues | No -- use npm install |

## FOX at Two Scales

FOX isn't just for one-line bug fixes. The same Fork + Overlay + eXtend principle works at two scales:

### Scale 1: Surgical (patterns 1-4)

Small, targeted patches. One file, one function, one config value.

- **Fork**: Identify the exact line/value in upstream
- **Overlay**: A shell script or node one-liner that patches it
- **eXtend**: Nothing -- the fix is self-contained

Example: `hooks init` defaults to 64d n-gram embeddings. Fix: set 3 env vars in settings.json.

Revert: `npm install ruvector@latest` restores the original.

### Scale 2: Architectural (pattern 5+)

Structured extensions that add capabilities upstream doesn't have. Separate package + integration shim.

- **Fork**: Identify the architectural gap (e.g. no storage abstraction)
- **Overlay**: Create a separate package that implements the missing capability
- **eXtend**: Integrate via a small shim in the upstream code (factory pattern, constructor patch)

Example: Stock ruvector stores everything in flat JSON. The Veracy project created a `@veracy/ruvector-storage` package with `SqliteStorage`, integrated via a ~30-line factory shim prepended to `cli.js`. Then progressively enhanced with atomic operations (FIX-015) and 30+ features (FIX-016).

Revert: `npm install ruvector@latest` restores the original CLI. The storage package remains available but inert.

### When to use which scale

| Signal | Scale |
|--------|-------|
| Fix is a config value or env var | Surgical |
| Fix is a missing flag or wrong default | Surgical |
| Fix patches one function (<50 lines) | Surgical |
| Upstream has no abstraction for what you need | Architectural |
| You need a new data model or storage format | Architectural |
| Progressive enhancement is likely (phase 2, 3...) | Architectural |
| Multiple hooks/commands need the same capability | Architectural |
| Want zero node_modules footprint | Runtime Shim (2b) |
| Upstream bug can be detected at runtime | Runtime Shim (2b) |

---

## Scale 2b: Runtime Shim (Cleaner Option)

> **Added in v0.9.7** — Zero node_modules modifications

### The Problem with Classic Scale 2

Classic Scale 2 (architectural extension) requires an "apply script" that patches `node_modules/`. While this is FOX-compliant (documented, scripted, reversible), it has friction:

1. **Re-patch after `npm install`** — Must re-run setup.sh every time
2. **Fragile coupling** — Assumes specific file structure in upstream
3. **CI/CD complexity** — Build pipelines need patch step

### The Runtime Shim Alternative

Instead of patching `require()` statements in node_modules, create a **shim module** that:

1. **Tests upstream** at load time (does it work?)
2. **Auto-switches** to fallback if bug detected
3. **Zero node_modules changes** — survives `npm install`

### Architecture Comparison

```
Classic Scale 2:
  patch-engine.js modifies node_modules/ruvector/dist/...
  → Requires re-patch after npm install

Runtime Shim (2b):
  packages/my-shim/index.js tests native, routes to fallback
  → Survives npm install, zero node_modules footprint
```

### Example: SONA Fallback Shim (v0.9.7)

**Problem:** Native `@ruvector/sona` has a bug where `patterns_stored` always returns 0.

**Classic approach** (`patch-engine.js`):
```javascript
// Patches node_modules/ruvector/dist/core/intelligence-engine.js
// Replaces: const { SonaEngine } = require('@ruvector/sona');
// With:     const { SonaEngine } = require('../../packages/sona-fallback');
```

**Runtime shim approach** (`packages/sona-shim/index.js`):
```javascript
'use strict';

// Test native at load time
var nativeWorks = false, nativeSona = null;
try {
  nativeSona = require('@ruvector/sona');
  var test = new nativeSona.SonaEngine(384, 0.01, 100);
  var emb = new Float32Array(384).fill(0.1);
  test.storePattern('test', emb, {});
  test.storePattern('test', emb, {});
  test.storePattern('test', emb, {});
  var stats = test.getStats();
  nativeWorks = stats.patterns_stored > 0;
  if (test.close) test.close();
} catch (e) { /* native unavailable */ }

// Route to working implementation
if (nativeWorks) {
  module.exports = nativeSona;
} else {
  module.exports = require('../sona-fallback');
}
```

### Integration Methods

| Method | How | Pros | Cons |
|--------|-----|------|------|
| **Direct require** | `require('./packages/sona-shim')` | Explicit, no magic | Requires code change |
| **Env override** | `SONA_MODULE_PATH=./packages/sona-shim` | Config-driven | Shim must check env |
| **Node --require** | `node --require ./preload.js app.js` | Zero code change | CLI complexity |

### When to Use Runtime Shim vs Classic

| Scenario | Recommendation |
|----------|---------------|
| Bug detectable at runtime (test → fail → switch) | Runtime Shim |
| Need to intercept/modify behavior, not replace | Classic Scale 2 |
| CI/CD must be patch-free | Runtime Shim |
| Upstream structure changes frequently | Runtime Shim |
| Fix requires hooking into internal state | Classic Scale 2 |
| Progressive enhancement planned (phases 2, 3...) | Classic Scale 2 |

### File Structure

```
packages/
├── sona-fallback/        # Scale 2: Pure JS implementation
│   └── index.js          # Full replacement for @ruvector/sona
└── sona-shim/            # Scale 2b: Runtime router
    └── index.js          # Tests native, routes to fallback
```

### Revert Comparison

| Approach | Revert Method | Survives npm install |
|----------|---------------|---------------------|
| Scale 2 (classic) | `npm install ruvector@latest` | No — must re-patch |
| Scale 2b (shim) | Delete `packages/sona-shim/` | Yes — zero footprint |

### Best Practice: Provide Both

v0.9.7 provides both options:

1. `patch-engine.js` — Classic Fox for environments that prefer it
2. `sona-shim` — Runtime shim for cleaner deployments

Users choose based on their constraints. Both are Fox-compliant.

## Setup

```bash
mkdir -p fixes/claude-flow fixes/ruvector extensions packages
```

- `fixes/` -- surgical patches (Scale 1)
- `packages/` -- extension packages (Scale 2)
- `extensions/` -- shared utilities

## Creating a Fix

### Scale 1 (surgical)

1. Identify bug -- note file and line in upstream
2. Create fix script in `fixes/` (NEVER modify node_modules directly)
3. Document with upstream PR link and status

Example:

```bash
cat > fixes/ruvector/fix-001-embedding-dim.sh << 'FIXEOF'
#!/bin/bash
# FIX-001: hooks init sets 64d n-gram instead of 384d ONNX
# PR: https://github.com/ruvnet/ruvector/issues/XXX | Status: Pending
SETTINGS=".claude/settings.json"
[ -f "$SETTINGS" ] && node -e "
const fs=require('fs'), s=JSON.parse(fs.readFileSync('$SETTINGS','utf-8'));
s.env=s.env||{};
s.env.RUVECTOR_SEMANTIC_EMBEDDINGS='true';
s.env.RUVECTOR_EMBEDDING_MODEL='all-MiniLM-L6-v2';
s.env.RUVECTOR_EMBEDDING_DIM='384';
fs.writeFileSync('$SETTINGS',JSON.stringify(s,null,2));
" && echo 'FIX-001 applied: 384d embeddings'
FIXEOF
chmod +x fixes/ruvector/fix-001-embedding-dim.sh
```

### Scale 2 (architectural)

1. Identify the architectural gap
2. Create a package in `packages/` with the missing capability
3. Create an integration shim (apply script) in `fixes/` that patches the upstream CLI
4. Document the phases: initial wiring, atomic ops, progressive features

Example (storage backend):

```
packages/@myproject/ruvector-storage/   # SqliteStorage, JsonStorage, factory
fixes/ruvector/fix-005-storage-shim.js  # Patches cli.js with getStorageInstance()
```

The apply script modifies `node_modules/ruvector/bin/cli.js` in place. Revert with `npm install ruvector@latest`.

## Fix Registry

### v0.9.7 Consolidated Registry

v0.9.7 adds validation checkpoints, SONA fallback packages, and the runtime shim (Scale 2b) option:

```markdown
| Script | Contains | Target | Required |
|--------|----------|--------|----------|
| setup.sh | FIX-001-007 (config) + validation + sona-fallback + sona-shim | settings.json, .claude/, packages/ | Yes |
| patch-cli.js | FIX-005, FIX-006/006b+RC-C, FIX-008, SONA(013+015) | cli.js | Yes |
| patch-engine.js | FIX-014,016,SONA-FALLBACK | intelligence-engine.js | Optional* |
```

*`patch-engine.js` is optional if using the runtime shim (`sona-shim`). Choose one:
- **Classic**: Run `patch-engine.js` (patches node_modules, revert with npm install)
- **Cleaner**: Use `sona-shim` (zero node_modules changes, survives npm install)

**Idempotency:** `patch-cli.js` checks `__PATCH_CLI_V097__` marker. `patch-engine.js` checks `__PATCH_ENGINE_V097__`. Both skip if already applied.

**Revert:** `npm install ruvector@latest` removes all node_modules patches. Re-run `bash scripts/setup.sh` after.

### v0.9.7 New Fixes

```markdown
| ID | Location | Description | Remove After |
|----|----------|-------------|--------------|
| FIX-SONA-FALLBACK | patch-engine.js | Replaces @ruvector/sona require with JS fallback | When upstream fixes SONA storage bug |
| FIX-SONA-SHIM | packages/sona-shim | Runtime detection + auto-switch (Scale 2b) | When upstream fixes SONA storage bug |
| VAL-SQLITE | setup.sh | Validates better-sqlite3 installation | Permanent (validation) |
| VAL-SCHEMA | setup.sh | Validates all required tables exist | Permanent (validation) |
| VAL-PATCH | setup.sh | Validates patch markers after apply | Permanent (validation) |
```

### v0.9.4 Consolidated Registry (historical)

v0.9.4 consolidated patches into 2 patch scripts + 1 configuration script. `patch-cli.js` was reduced from 7 sections (v0.9.2) to 4 sections by merging SONA fixes and moving FIX-009B to the storage adapter:

```markdown
| Script | Contains | Target | Required |
|--------|----------|--------|----------|
| setup.sh | FIX-001,002,003,004,007 (config) + RC-A,RC-B (bridge enrichment) + ONNX warmup + re-embed | settings.json, .claude/ | Yes |
| patch-cli.js | FIX-005, FIX-006/006b+RC-C, FIX-008, SONA(013+015) | cli.js | Yes |
| patch-engine.js | FIX-014,016 | intelligence-engine.js | Optional |
```

**Idempotency:** `patch-cli.js` checks `__PATCH_CLI_V094__` marker (also accepts `__PATCH_CLI_V092__` for backwards compatibility). `patch-engine.js` checks `__PATCH_ENGINE_V092__`. Both skip if already applied.

**Revert:** `npm install ruvector@latest` removes all patches. Re-run `bash scripts/setup.sh` after.

### Individual Fix Reference (historical)

These are the original fixes that were consolidated. Useful for understanding what each patch does:

```markdown
| ID | Now In | Description | Remove After |
|----|--------|-------------|-------------|
| FIX-001 | setup.sh step 1 | 64d->384d embeddings (env vars) | When hooks init sets 384d |
| FIX-002 | setup.sh step 2 | Hook timeouts 300ms->5000-10000ms | When hooks init sets adequate timeouts |
| FIX-003 | setup.sh step 3 | Add --semantic to remember hooks | When hooks init adds --semantic |
| FIX-004 | setup.sh step 4 | Pre-download ONNX model | When hooks init pre-downloads |
| FIX-005 | patch-cli.js | SQLite storage backend (factory + load + save) | When upstream adds backend abstraction |
| FIX-006 | patch-cli.js | Make post-edit/post-command handlers async (merged in v0.9.4, includes RC-C enrichment) | When upstream uses async handlers |
| FIX-006b | patch-cli.js | Replace sync remember() with rememberAsync() (merged in v0.9.4, includes RC-C enrichment) | When upstream uses rememberAsync |
| FIX-007 | setup.sh step 6 | Stdin JSON bridge (replaces $TOOL_INPUT_*) | When upstream reads stdin JSON |
| FIX-008 | patch-cli.js | Persist lastEditedFile in kv_store | When upstream persists hook state |
| FIX-009 | storage adapter | Empty-array guard + atomic saveAll (moved to storage adapter in v0.9.4) | When upstream implements safe saveAll |
| FIX-010 | storage adapter | Complete schema (neural_patterns + saveAll) | Baked into packages/ruvector-storage |
| FIX-011 | storage adapter load() | JSON->DB reconciliation | Baked into packages/ruvector-storage |
| FIX-013 | patch-cli.js | SONA flush + trajectory warm-up replay (merged as SONA section in v0.9.4) | When upstream adds SONA persistence |
| FIX-014 | patch-engine.js | HNSW storagePath for persistent index | When upstream defaults to persistent HNSW |
| FIX-015 | patch-cli.js | Wire tick()/forceLearn() into hooks (merged as SONA section in v0.9.4) | When upstream hooks call tick/forceLearn |
| FIX-016 | patch-engine.js | TinyDancer neural router wiring | When upstream engine integrates TinyDancer |
| RC-A | setup.sh bridge | Bridge remember-read stores basename + parent dir | When upstream enriches read memories |
| RC-B | setup.sh bridge | Bridge remember-agent includes task description | When upstream enriches agent memories |
| RC-C | patch-cli.js FIX-006 | Post-edit rememberAsync includes filename | When upstream enriches edit memories |
| FIX-017 | packages/sona-fallback | Pure JS SONA implementation (Scale 2) | When upstream fixes SONA storage bug |
| FIX-018 | packages/sona-shim | Runtime shim for SONA (Scale 2b, cleaner) | When upstream fixes SONA storage bug |
| FIX-019 | setup.sh step 5c | Schema validation checkpoint | Permanent (defensive) |
| FIX-020 | setup.sh step 5e | SONA shim deployment | When upstream fixes SONA storage bug |
```

## Checking if Fix Still Needed

```bash
TEMP="/tmp/rv-check-$(date +%s)"
git clone --depth 5 https://github.com/ruvnet/ruvector.git "$TEMP"
grep -r "KEYWORD" "$TEMP/npm/packages/ruvector/bin/cli.js" | head -5
rm -rf "$TEMP"
```

If fix is merged upstream, delete it and update the registry.

## Scale 1: Surgical Fixes

Known patterns from the Veracy project's forensic investigation:

1. **64d vs 384d embeddings**: `hooks init --force` resets to 64d n-gram. Fix: set `RUVECTOR_SEMANTIC_EMBEDDINGS=true` and add `--semantic` to remember hooks.

2. **Timestamp seconds vs milliseconds**: Some code paths use seconds instead of ms. Fix: validate with `timestamp < 946684800000` check.

3. **Storage wrapper landmine**: `.claude/helpers/ruvector-storage-wrapper.js` uses wrong dims and timestamps. Fix: mark deprecated, never wire to hooks.

4. **Silent catch in rememberAsync**: Errors swallowed silently at `cli.js:2935-2937`. Fix: add explicit error logging.

## Scale 2: Architectural Extensions

### Pattern 5: Storage backend (proven)

**Problem:** Stock ruvector stores ALL intelligence in flat JSON (`.ruvector/intelligence.json`). 18 read/write sites, no abstraction, no transactions, no concurrent safety, destructive full-rewrite on every save.

**Solution:** Separate storage package + CLI integration shim. Proven by Veracy (`ruvector@0.1.96-veracy.2`).

**Phase 1 -- Initial wiring (FIX-001):**
- Create storage package with `SqliteStorage` class (better-sqlite3, WAL mode, 10+ tables)
- Create factory: `createStorageFromEnv()` dispatches by `RUVECTOR_STORAGE_TYPE` env var
- Prepend ~30-line shim to cli.js: `getStorageInstance()` singleton factory
- Patch `Intelligence` constructor/load/save to delegate to storage (~20 lines)
- Result: intelligence data in `.ruvector/intelligence.db` instead of JSON

**Phase 2 -- Atomic operations (FIX-015):**
- Replace destructive `saveAll()` (delete all rows, re-insert everything) with per-operation methods
- `addMemory()`, `updatePattern()`, `addTrajectory()`, `recordFileSequence()`, `addErrorFix()`, etc.
- Each is a single SQL INSERT/UPDATE instead of a full read-modify-write cycle
- Only 4 legacy `intel.save()` calls remain (import, force-learn, fallback paths)

**Phase 3 -- Progressive features (FIX-016):**
- Direct `intel.storage.db.prepare()` for advanced features
- Neural pattern consolidation, calibration tracking, trajectory replay
- Co-edit graph edges, session edit tracking, feedback loops
- 30+ features built naturally on the SQLite foundation

**Architecture:**
```
cli.js -> getStorageInstance() -> storage-package -> SqliteStorage(better-sqlite3) -> .ruvector/intelligence.db
```

**Result:** 7,065 -> 9,180 CLI lines (+2,115). 23 tables, WAL mode, atomic ops, crash recovery.

Full setup and migration details: [storage-backends.md](storage-backends.md).

## Post-Init Checklist

After ANY `hooks init --force`:
- `RUVECTOR_SEMANTIC_EMBEDDINGS=true` in env
- `RUVECTOR_EMBEDDING_MODEL=all-MiniLM-L6-v2` in env
- All `remember` hooks have `--semantic` flag
- Hook timeout >= 5000ms for embedding hooks

Run `bash scripts/setup.sh` to automate this.

## Upstream Research Protocol

```bash
TEMP="/tmp/ruv-research-$(date +%s)"
git clone --depth 10 https://github.com/ruvnet/ruvector.git "$TEMP/ruvector"
git clone --depth 10 https://github.com/ruvnet/claude-flow.git "$TEMP/claude-flow"

# Search for specific issue
grep -r "KEYWORD" "$TEMP/ruvector" --include="*.ts" --include="*.js" -l
cd "$TEMP/ruvector" && git log --oneline -10

# Check GitHub issues (requires gh CLI)
gh issue list --repo ruvnet/ruvector --label bug --limit 10

rm -rf "$TEMP"
```
