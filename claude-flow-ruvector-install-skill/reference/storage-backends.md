# Storage Backends Reference

> **Version:** v0.9 | **Updated:** 2026-02-01 | **Ecosystem:** claude-flow v3.0.0-alpha.190 + ruvector 0.1.96

## Contents
- [Current reality: where data actually lives](#current-reality)
- [Backend landscape](#backend-landscape)
- [Stock ruvector: JSON only](#stock-ruvector-json-only)
- [SQLite backend: proven via Veracy](#sqlite-backend-proven-via-veracy)
- [RUVECTOR_MEMORY_BACKEND (dead config in stock)](#ruvector_memory_backend)
- [DatabasePersistence (exists, not wired)](#databasepersistence)
- [rvlite (edge vector DB, not intelligence storage)](#rvlite)
- [PostgreSQL options](#postgresql-options)
- [Bridging strategies (manual sync)](#bridging-strategies)
- [Setting up SQLite backend](#setting-up-sqlite-backend)

## Current Reality

**Where intelligence data lives depends on the ruvector build:**

| Build | File | Format | Concurrent safe | Size |
|-------|------|--------|-----------------|------|
| Stock ruvector 0.1.96 | `.ruvector/intelligence.json` | Flat JSON | No | 30-200KB |
| Custom build (e.g. Veracy) | `.ruvector/intelligence.db` | SQLite WAL | Yes | 1-10MB |

claude-flow memory always lives in `.swarm/memory.db` (SQLite via sql.js WASM). The two stores are independent.

Additionally, `ruvector.db` may exist at the project root. This is an optional native
VectorDB in **redb** format (Rust KV store), NOT SQLite. Created by `IntelligenceEngine`
for ANN acceleration. It is NOT the SSOT -- `intelligence.db` (SQLite) or
`intelligence.json` remains the SSOT. The MCP server may hold an exclusive write lock
on `ruvector.db` (see troubleshooting.md #24).

### intelligence.json schema (stock)

One flat JSON file with everything:
- `memories[]` -- stored facts with embeddings, types, timestamps
- `learning.qTables` / `learning.qTables2` -- 12+12 Q-learning tables
- `learning.configs` -- 6 algorithm configs
- `learning.rewardHistory` / `learning.stats` -- reward and update data
- `trajectories[]` -- action sequences with states and rewards
- `patterns{}`, `errors{}`, `engineStats` -- pattern/error/operational data

### intelligence.db schema (SQLite)

23 tables with proper types, indexes, and WAL mode:

| Table | Rows (typical) | Purpose |
|-------|---------------|---------|
| `memories` | 100-500 | Facts with BLOB embeddings |
| `patterns` | 50-200 | Q-values per (state, action) pair |
| `trajectories` | 50-200 | Action sequences with metadata |
| `agents` | 5-15 | Agent capabilities and scores |
| `edges` | 500-2000 | File co-edit graph |
| `neural_patterns` | 50-200 | Learned neural patterns |
| `learning_data` | 1 | Single row: algorithm config, Q-table, traces |
| `intelligence_data` | 3-10 | KV store: errors, sequences, feedback, calibration |
| `stats` | 8-12 | Counters: sessions, totals |
| `error_patterns` / `error_fixes` / `recent_errors` | varies | Error tracking |
| `calibration_buckets` / `calibration_predictions` | varies | Prediction calibration |
| `feedback_rates` / `feedback_suggestions` | varies | Feedback loop data |
| `session_edits` / `file_sequences` / `test_pairs` | varies | Session and testing data |
| `vector_memories` / `kv_store` | varies | Extended storage |

## Backend Landscape

| Backend | CLI integration | Atomic ops | Status |
|---------|-----------------|------------|--------|
| **JSON file** (stock) | Active -- only backend in stock 0.1.96 | No (full rewrite on every save) | Stable |
| **SQLite** (custom build) | Active in Veracy build | Yes (per-operation INSERT/UPDATE) | Proven |
| **SQLite** (sql.js WASM) | claude-flow only, not ruvector | N/A | Stable |
| **PostgreSQL** | Not integrated with CLI pipeline | N/A | Available as library |
| **@ruvector/rvlite** | Not integrated -- edge/WASM vector DB | N/A | POC |
| **DatabasePersistence** | Not exported, wrong data model | N/A | Built but unused |

## Stock Ruvector: JSON Only

Stock `ruvector@0.1.96` stores ALL intelligence in `.ruvector/intelligence.json` via 18 raw `readFileSync`/`writeFileSync` sites:

- **Intelligence class** (`load()` ~line 2721, `save()` ~line 2753) -- serves ~25 hooks commands
- **Inline learning subcommands** (10+ sites) -- hardcode `process.cwd()/.ruvector/intelligence.json`

The `save()` method reads everything into memory, mutates, then writes the entire file back. No transactions, no locking, no partial updates. If the process crashes mid-write, data is lost.

## SQLite Backend: Proven via Veracy

The Veracy project (`ruvector@0.1.96-veracy.2`) replaced JSON with SQLite using a clean 3-layer architecture:

```
cli.js (Intelligence class)
    ↓
getStorageInstance()  ← singleton factory (~30 lines prepended to cli.js)
    ↓
@veracy/ruvector-storage  ← separate package, SqliteStorage class
    ↓
.ruvector/intelligence.db  ← better-sqlite3, WAL mode
```

### Key differences from stock

| Aspect | Stock | Veracy |
|--------|-------|--------|
| CLI lines | 7,065 | 9,180 (+2,115) |
| Write pattern | Destructive `saveAll()` (delete all, re-insert) | Atomic per-operation |
| Backend dispatch | None (hardcoded JSON) | Factory pattern → SqliteStorage |
| Concurrent safety | None | SQLite WAL mode |
| Crash recovery | Data loss possible | WAL journal recovers |
| Embedding storage | JSON array of floats | Float32 BLOB (4x smaller) |

### Evolution: 3 phases

1. **FIX-001**: Initial wiring -- `Intelligence.load()`/`save()` delegate to SqliteStorage. Still uses destructive `saveAll()` internally.
2. **FIX-015**: Critical fix -- replaced `saveAll()` calls with atomic operations (`addMemory()`, `updatePattern()`, `addTrajectory()`, etc.). Only 4 legacy `intel.save()` calls remain (import, force-learn, fallback paths).
3. **FIX-016**: 30+ features built on direct `intel.storage.db.prepare()` calls: neural pattern consolidation, calibration tracking, trajectory replay, co-edit graph edges.

### What the storage package provides

`SqliteStorage` class with these atomic operations:

| Method | Replaces |
|--------|----------|
| `addMemory(memory)` | Read JSON → push to array → write JSON |
| `updatePattern(state, action, qValue)` | Read JSON → find pattern → update → write JSON |
| `addTrajectory(entry)` | Read JSON → push to array → write JSON |
| `recordFileSequence(from, to)` | Read JSON → update edges → write JSON |
| `addErrorFix(key, fix, file)` | Read JSON → update errors → write JSON |
| `incrementSessionCount()` | Read JSON → increment counter → write JSON |
| `updateStats()` + `saveLearningData()` | Read JSON → update stats → write JSON |
| `loadAll()` | `fs.readFileSync` + `JSON.parse` |

Each atomic operation is a single SQL statement. No read-modify-write cycle.

## RUVECTOR_MEMORY_BACKEND

In **stock** ruvector: dead config. Set by `hooks init` but never consumed. See [Stock Ruvector: JSON Only](#stock-ruvector-json-only).

In the **Veracy** build: also dead. The Veracy storage package reads `RUVECTOR_STORAGE_TYPE` instead (defaults to `'sqlite'`). The `RUVECTOR_MEMORY_BACKEND` env var is ignored by both builds.

## DatabasePersistence

`ruvector-extensions` ships a `DatabasePersistence` class in `dist/persistence.js` (25 methods). Not usable for intelligence storage:

1. **Not exported** from `index.js` -- hidden internal module
2. **Wrong data model** -- designed for VectorDB vector entries, not the intelligence schema
3. **SQLite format throws** -- `Error('SQLite format not yet implemented')`
4. **Async only** -- `fs.promises` APIs vs CLI's synchronous I/O

## rvlite

`@ruvector/rvlite` v0.2.4 -- WASM vector database for edge deployment.

**Not a replacement for intelligence storage.** Stores float vectors with metadata only. Q-learning tables, algorithm configs, reward histories, and trajectories are not vectors.

Also embedded inside `@ruvector/edge-full` at `rvlite/rvlite.js` + `rvlite_bg.wasm`.

SDK: see [edge-full-reference.md](edge-full-reference.md).

## PostgreSQL Options

### Option A: Docker (ruvector-postgres, 230+ SQL functions)

```bash
docker run -d --name ruvector -e POSTGRES_PASSWORD=secret -p 5432:5432 ruvnet/ruvector-postgres:latest
```

### Option B: @ruvector/postgres-cli (npm client)

```bash
npm install @ruvector/postgres-cli
export RUVECTOR_POSTGRES_URL=postgres://user:pass@localhost/mydb
```

> Options A-B provide vector storage for external use. Neither replaces `intelligence.json` as the CLI's backend. The Veracy storage package has a dormant `intelligence-bridge.ts` (502 lines) for PostgreSQL, but it is not active.

## Bridging Strategies

Manual sync between ruvector and claude-flow stores:

```bash
# Export ruvector intelligence → claude-flow
npx @claude-flow/cli@latest memory store --key "rv-$(date +%s)" \
  --value "$(npx ruvector hooks export --include-all 2>/dev/null)" --namespace ruvector-sync

# Search across both
npx @claude-flow/cli@latest memory search --query "auth patterns" --namespace ruvector-sync
npx ruvector hooks recall "auth patterns" -k 5 --semantic
```

Limitations: one-directional, JSON blob not vector-indexed, must be run manually.

## Setting Up SQLite Backend

### Requirements

- `better-sqlite3` npm package (native C++ SQLite binding)
- A storage adapter package implementing the `StorageBackend` interface
- A patched `cli.js` that delegates `Intelligence.load()`/`save()` to the adapter

### Architecture

The storage adapter package needs:

1. **Factory function** -- `createStorageFromEnv()` reads `RUVECTOR_STORAGE_TYPE` env var, returns a storage backend instance
2. **SqliteStorage class** -- constructor opens `.ruvector/intelligence.db`, creates schema (10+ tables), enables WAL mode
3. **Atomic operations** -- `addMemory()`, `updatePattern()`, `addTrajectory()`, etc.
4. **loadAll() / saveAll()** -- bulk read/write for init and legacy fallback

The cli.js patch is ~30 lines prepended to the file:

```javascript
// Storage backend integration
let StorageBackend = null, storageInstance = null;
function loadStorageBackend() {
  if (StorageBackend !== null) return StorageBackend;
  try {
    StorageBackend = require('<storage-package>').createStorageFromEnv;
    return StorageBackend;
  } catch (e) { StorageBackend = false; return false; }
}
function getStorageInstance() {
  if (storageInstance) return storageInstance;
  const create = loadStorageBackend();
  if (create) { storageInstance = create(); storageInstance.init(); return storageInstance; }
  return null;
}
```

Plus the `Intelligence` constructor/load/save patches (~20 lines changed).

### Migration path

1. Install `better-sqlite3` and the storage adapter
2. Apply the cli.js patch (FOX method: `fixes/ruvector/fix-005-storage-backend.js`)
3. If `.ruvector/intelligence.json` exists, the adapter auto-migrates on first load
4. After migration, the JSON file is backed up as `intelligence.json.backup-pre-sqlite`
5. All subsequent operations use `.ruvector/intelligence.db`

### JSON vs SQLite comparison

| Concern | JSON (stock) | SQLite (custom) |
|---------|-------------|-----------------|
| ACID transactions | No | Yes |
| Concurrent safety | No (race conditions) | Yes (WAL mode) |
| Crash recovery | Data loss possible | WAL journal |
| Query indexing | None (full scan) | B-tree + FTS potential |
| Embedding storage | JSON array (verbose) | Float32 BLOB (4x smaller) |
| Atomic updates | No (full rewrite) | Yes (per-row) |
| File size | 30-200KB | 1-10MB (with indexes) |
| Portability | Copy file | Copy file |
| npm dependency | None | `better-sqlite3` (native) |
| Build tools needed | None | C++ compiler for better-sqlite3 |

## Destructive saveAll() Problem (RC5)

The initial SQLite storage adapter's `saveAll()` method uses a destructive pattern:

```javascript
saveAll(data) {
  const tx = this.db.transaction(() => {
    this.db.prepare('DELETE FROM memories').run();      // ← Wipes ALL rows
    this.db.prepare('DELETE FROM patterns').run();
    this.db.prepare('DELETE FROM trajectories').run();
    // ... then INSERT all rows from data
  });
  tx();
}
```

### Why this is dangerous

1. **Partial loads wipe unloaded data**: If hook A loads only memories (not patterns),
   calling `saveAll()` deletes all patterns and replaces them with nothing.
2. **Concurrent hooks**: Two hooks running simultaneously both read, both modify their
   section, both saveAll(). The second save overwrites the first's changes.
3. **Crash during save**: If the process dies after DELETE but before INSERT, data is lost.

### The atomic alternative (FIX-009)

FIX-009 replaces `saveAll()` with:

```javascript
saveAll(data) {
  const tx = this.db.transaction(() => {
    // Skip tables where data is undefined (never loaded)
    if (data.memories === undefined) return; // ← Leave DB untouched

    // For loaded tables: upsert rows, delete stale ones
    const upsert = this.db.prepare('INSERT OR REPLACE INTO memories ...');
    for (const m of data.memories) upsert.run(...);

    // Remove rows not in current set
    // (only rows that were loaded but are no longer present)
  });
  tx();
}
```

Key changes:
- **Skip unloaded tables**: `undefined` means "never loaded" -- don't touch the DB
- **Upsert instead of DELETE+INSERT**: `INSERT OR REPLACE` updates existing rows
- **Stale cleanup**: Only deletes rows explicitly removed from the loaded data set
- **Transaction safety**: All operations in a single transaction

Apply: `node fixes/ruvector/fix-009-atomic-save.js`
