# ruvector-extensions Reference

> **Version:** v0.7 | **Generated:** 2026-01-31 | **Ecosystem:** claude-flow v3.0.0-alpha.190 + ruvector 0.1.96

Package: `ruvector-extensions` (npm). 31 exports across 5 feature areas.

## Contents
- Embedding Providers (4 + base class)
- Graph Export (9 functions)
- Temporal Tracking (25+ methods)
- UI Server
- Known Issues

---

## Embedding Providers

Bridge between ruvector's vector DB and external embedding APIs.

| Provider | Class | Requires |
|----------|-------|----------|
| OpenAI | `OpenAIEmbeddings` | `OPENAI_API_KEY` |
| Anthropic | `AnthropicEmbeddings` | `ANTHROPIC_API_KEY` |
| Cohere | `CohereEmbeddings` | `COHERE_API_KEY` |
| HuggingFace | `HuggingFaceEmbeddings` | `HF_TOKEN` |

Base class: `EmbeddingProvider` (extend for custom providers).

### Convenience Functions

**embedAndInsert** — Generate embedding and insert into VectorDB in one call.
```javascript
const { embedAndInsert } = require('ruvector-extensions');
await embedAndInsert(vectorDb, text, metadata, embeddingProvider);
```

**embedAndSearch** — Generate query embedding and search VectorDB.
```javascript
const { embedAndSearch } = require('ruvector-extensions');
const results = await embedAndSearch(vectorDb, queryText, topK, embeddingProvider);
```

These wire ruvector-extensions embedding providers directly into @ruvector/core VectorDB.

---

## Graph Export (9 functions)

Export vector DB or graph data to visualization/analysis tools.

| Function | Output Format | Use Case |
|----------|--------------|----------|
| `exportToNeo4j` | Neo4j Cypher | Graph database import |
| `exportToNeo4jJSON` | Neo4j JSON | Bulk import |
| `exportToD3` | D3.js JSON | Web visualization |
| `exportToD3Hierarchy` | D3 hierarchical | Tree visualization |
| `exportToGEXF` | GEXF XML | Gephi import |
| `exportToGraphML` | GraphML XML | Graph analysis tools |
| `exportToNetworkX` | NetworkX JSON | Python analysis |
| `exportToNetworkXAdjacencyList` | Adjacency list | Simple text format |
| `exportToNetworkXEdgeList` | Edge list | Simple text format |

Streaming variants: `D3StreamExporter`, `GraphMLStreamExporter`, `streamToGraphML`.

Helper functions: `buildGraphFromEntries`, `buildGraphFromVectorDB`, `validateGraph`, `exportGraph`.

---

## Temporal Tracking

`TemporalTracker` — Version control for data entries with full audit trail.

### Key Methods (25+)

| Method | Purpose |
|--------|---------|
| `initializeBaseline` | Set initial state |
| `trackChange(id, change)` | Record a change |
| `createVersion(id, data)` | Create versioned snapshot |
| `getCurrentVersion(id)` | Get latest version |
| `listVersions(id)` | List all versions |
| `getVersion(id, version)` | Get specific version |
| `compareVersions(id, v1, v2)` | Diff two versions |
| `generateDiff(id, v1, v2)` | Generate detailed diff |
| `revertToVersion(id, version)` | Revert to previous state |
| `reconstructStateAt(id, timestamp)` | Time-travel to past state |
| `queryAtTimestamp(timestamp)` | Query all data at a point in time |
| `filterByPath(path)` | Filter entries by path |
| `addTags(id, tags)` | Tag entries |
| `getAuditLog()` | Full audit trail |
| `pruneVersions(keepN)` | Cleanup old versions |
| `exportBackup()` | Export all data |
| `importBackup(data)` | Import backup |
| `getStorageStats()` | Storage statistics |
| `getVisualizationData()` | Data for UI rendering |

### Usage

```javascript
const { temporalTracker } = require('ruvector-extensions');
// or: const { TemporalTracker } = require('ruvector-extensions');
// const tracker = new TemporalTracker();

temporalTracker.createVersion('doc-1', { content: 'v1 text' });
temporalTracker.trackChange('doc-1', { content: 'v2 text' });
const diff = temporalTracker.compareVersions('doc-1', 1, 2);
temporalTracker.revertToVersion('doc-1', 1);
```

### Wiring to ruvector

TemporalTracker can wrap intelligence.json changes to provide version history
and rollback capability for the learning system's state.

---

## UI Server

`UIServer` / `startUIServer` — Web-based visualization server.

```javascript
const { startUIServer } = require('ruvector-extensions');
startUIServer({ port: 3001, vectorDb: db });
```

Provides browser UI for exploring vector DB contents, graph visualizations,
and temporal tracking data.

---

## Change Tracking

`ChangeType` enum: `ADDITION`, `DELETION`, `MODIFICATION`, `METADATA`

`isChange(obj)` — Check if object is a tracked change.
`isVersion(obj)` — Check if object is a version entry.

---

## Known Issues

1. **SQLite adapter stub** — The ruvector CLI internally references a
   `ruvector-extensions` SQLiteAdapter for persistence, but it throws
   "not yet implemented". Use claude-flow's sql.js SQLite or @ruvector/rvlite
   for persistence instead.

2. **Embedding providers need API keys** — Each provider requires its own API
   key as an environment variable. Without the key, embedAndInsert/embedAndSearch
   will fail. The built-in ONNX embedder (via `--semantic`) works offline and
   doesn't need an API key.

3. **UIServer port conflicts** — Default port may conflict with other services.
   Always specify a port explicitly.

4. **TemporalTracker is in-memory** — Data does not persist across process
   restarts unless explicitly exported via `exportBackup()`.
