'use strict';

/**
 * RuVector Storage Adapter v0.9.7
 *
 * Improvements over v0.9.6:
 * - Added compressed_patterns table for hierarchical pattern compression
 * - Added parseEmbedding utility for reading embeddings
 * - Added schema validation method
 * - Added getCompressedPatterns and saveCompressedPattern methods
 */

const path = require('path');
const fs = require('fs');

class SqliteStorage {
  constructor(dbPath) {
    const Database = require('better-sqlite3');
    this.dbPath = dbPath || path.join(process.cwd(), '.ruvector', 'intelligence.db');
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this._createSchema();
    this._jsonMirrorPath = path.join(path.dirname(this.dbPath), 'intelligence.json');
  }

  _createSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        memory_type TEXT NOT NULL DEFAULT 'general',
        content TEXT NOT NULL,
        embedding BLOB,
        metadata TEXT DEFAULT '{}',
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS patterns (
        key TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        action TEXT NOT NULL,
        q_value REAL NOT NULL DEFAULT 0,
        visits INTEGER NOT NULL DEFAULT 0,
        last_update INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS trajectories (
        id TEXT PRIMARY KEY,
        state TEXT,
        action TEXT,
        outcome TEXT,
        reward REAL,
        timestamp INTEGER
      );

      CREATE TABLE IF NOT EXISTS errors (
        key TEXT PRIMARY KEY,
        data TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS file_sequences (
        from_file TEXT NOT NULL,
        to_file TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (from_file, to_file)
      );

      CREATE TABLE IF NOT EXISTS agents (
        name TEXT PRIMARY KEY,
        data TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS edges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        target TEXT NOT NULL,
        weight REAL DEFAULT 1.0,
        data TEXT DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS stats (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS learning_data (
        algorithm TEXT PRIMARY KEY DEFAULT 'combined',
        q_table TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      -- v0.9.7: Added compressed_patterns table for hierarchical pattern compression
      CREATE TABLE IF NOT EXISTS compressed_patterns (
        id TEXT PRIMARY KEY,
        layer TEXT NOT NULL,
        data BLOB NOT NULL,
        compression_ratio REAL DEFAULT 1.0,
        created_at INTEGER NOT NULL,
        metadata TEXT DEFAULT '{}'
      );

      CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(memory_type);
      CREATE INDEX IF NOT EXISTS idx_memories_ts ON memories(timestamp);
      CREATE INDEX IF NOT EXISTS idx_patterns_state ON patterns(state);
      CREATE INDEX IF NOT EXISTS idx_trajectories_ts ON trajectories(timestamp);
      CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source);
      CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target);
      CREATE INDEX IF NOT EXISTS idx_compressed_layer ON compressed_patterns(layer);
      CREATE INDEX IF NOT EXISTS idx_compressed_created ON compressed_patterns(created_at);

      -- neural_patterns table for viz server and pattern learning
      CREATE TABLE IF NOT EXISTS neural_patterns (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL DEFAULT '',
        category TEXT DEFAULT 'general',
        embedding BLOB,
        confidence REAL DEFAULT 0.5,
        usage INTEGER DEFAULT 0,
        created_at INTEGER,
        updated_at INTEGER,
        metadata TEXT DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS idx_neural_category ON neural_patterns(category);
      CREATE INDEX IF NOT EXISTS idx_neural_confidence ON neural_patterns(confidence);
    `);
  }

  // --- v0.9.7: Schema validation ---

  validateSchema() {
    const required = ['memories', 'edges', 'neural_patterns', 'compressed_patterns',
                      'trajectories', 'agents', 'kv_store', 'learning_data'];
    const existing = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all().map(t => t.name);
    const missing = required.filter(t => !existing.includes(t));
    if (missing.length > 0) {
      console.error('[STORAGE] Missing tables:', missing);
      return false;
    }
    return true;
  }

  // --- v0.9.7: Parse embedding from BLOB ---

  _parseEmbedding(blob) {
    if (!blob) return null;
    if (Buffer.isBuffer(blob)) {
      return new Float32Array(blob.buffer, blob.byteOffset, blob.length / 4);
    }
    return new Float32Array(blob);
  }

  // --- v0.9.7: Compressed patterns operations ---

  saveCompressedPattern(pattern) {
    const now = Math.floor(Date.now() / 1000);
    const id = pattern.id || ('cp-' + now + '-' + Math.random().toString(36).substring(2, 9));

    this.db.prepare(
      'INSERT OR REPLACE INTO compressed_patterns (id, layer, data, compression_ratio, created_at, metadata) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      id,
      pattern.layer || 'default',
      pattern.data ? (Buffer.isBuffer(pattern.data) ? pattern.data : Buffer.from(pattern.data)) : Buffer.alloc(0),
      typeof pattern.compression_ratio === 'number' ? pattern.compression_ratio : 1.0,
      pattern.created_at || now,
      JSON.stringify(pattern.metadata || {})
    );

    return id;
  }

  getCompressedPatterns(layer, limit) {
    limit = limit || 100;
    let rows;

    if (layer) {
      rows = this.db.prepare(
        'SELECT id, layer, data, compression_ratio, created_at, metadata FROM compressed_patterns WHERE layer = ? ORDER BY created_at DESC LIMIT ?'
      ).all(layer, limit);
    } else {
      rows = this.db.prepare(
        'SELECT id, layer, data, compression_ratio, created_at, metadata FROM compressed_patterns ORDER BY created_at DESC LIMIT ?'
      ).all(limit);
    }

    return rows.map(row => ({
      id: row.id,
      layer: row.layer,
      data: row.data,
      compression_ratio: row.compression_ratio,
      created_at: row.created_at,
      metadata: this._parseJSON(row.metadata, {})
    }));
  }

  getCompressedPatternById(id) {
    const row = this.db.prepare(
      'SELECT id, layer, data, compression_ratio, created_at, metadata FROM compressed_patterns WHERE id = ?'
    ).get(id);

    if (!row) return null;

    return {
      id: row.id,
      layer: row.layer,
      data: row.data,
      compression_ratio: row.compression_ratio,
      created_at: row.created_at,
      metadata: this._parseJSON(row.metadata, {})
    };
  }

  deleteCompressedPattern(id) {
    this.db.prepare('DELETE FROM compressed_patterns WHERE id = ?').run(id);
  }

  getCompressedPatternStats() {
    const stats = this.db.prepare(`
      SELECT
        layer,
        COUNT(*) as count,
        AVG(compression_ratio) as avg_ratio,
        SUM(length(data)) as total_bytes
      FROM compressed_patterns
      GROUP BY layer
    `).all();

    return stats;
  }

  // --- Bulk operations ---

  loadAll() {
    const defaults = {
      patterns: {},
      memories: [],
      trajectories: [],
      errors: {},
      file_sequences: [],
      agents: {},
      edges: [],
      stats: {
        total_patterns: 0, total_memories: 0, total_trajectories: 0,
        total_errors: 0, session_count: 0, last_session: 0
      }
    };

    try {
      // Patterns
      const patternRows = this.db.prepare('SELECT * FROM patterns').all();
      for (const row of patternRows) {
        defaults.patterns[row.key] = {
          state: row.state, action: row.action,
          q_value: row.q_value, visits: row.visits, last_update: row.last_update
        };
      }

      // Memories
      const memRows = this.db.prepare('SELECT * FROM memories ORDER BY timestamp ASC').all();
      defaults.memories = memRows.map(row => ({
        id: row.id,
        memory_type: row.memory_type,
        content: row.content,
        embedding: row.embedding ? this._blobToArray(row.embedding) : null,
        metadata: this._parseJSON(row.metadata, {}),
        timestamp: row.timestamp
      }));

      // Trajectories
      const trajRows = this.db.prepare('SELECT * FROM trajectories ORDER BY timestamp ASC').all();
      defaults.trajectories = trajRows.map(row => ({
        id: row.id, state: row.state, action: row.action,
        outcome: row.outcome, reward: row.reward, timestamp: row.timestamp
      }));

      // Errors
      const errorRows = this.db.prepare('SELECT * FROM errors').all();
      for (const row of errorRows) {
        defaults.errors[row.key] = this._parseJSON(row.data, {});
      }

      // File sequences
      const seqRows = this.db.prepare('SELECT * FROM file_sequences').all();
      defaults.file_sequences = seqRows.map(row => ({
        from_file: row.from_file, to_file: row.to_file, count: row.count
      }));

      // Agents
      const agentRows = this.db.prepare('SELECT * FROM agents').all();
      for (const row of agentRows) {
        defaults.agents[row.name] = this._parseJSON(row.data, {});
      }

      // Edges
      const edgeRows = this.db.prepare('SELECT * FROM edges').all();
      defaults.edges = edgeRows.map(row => ({
        source: row.source, target: row.target,
        weight: row.weight, data: this._parseJSON(row.data, {})
      }));

      // Stats
      const statRows = this.db.prepare('SELECT * FROM stats').all();
      for (const row of statRows) {
        const val = this._parseJSON(row.value, row.value);
        if (typeof val === 'number' || typeof val === 'string') {
          defaults.stats[row.key] = Number(val) || 0;
        }
      }

      // Learning data
      const learningRow = this.db.prepare("SELECT q_table FROM learning_data WHERE algorithm = 'combined'").get();
      if (learningRow) {
        defaults.learning = this._parseJSON(learningRow.q_table, undefined);
      }

      return defaults;
    } catch (e) {
      return defaults;
    }
  }

  saveAll(data) {
    // FIX-010: Complete saveAll with correct column schemas for all 10 tables
    // v0.9.7: Added compressed_patterns table support
    const tx = this.db.transaction(() => {

      // Helper: upsert rows for a table, skipping if data was never loaded
      const upsertTable = (tableName, rows, columns, pkCol) => {
        if (rows === undefined || rows === null) return; // Never loaded: leave DB untouched
        if (!Array.isArray(rows)) return;

        // v0.9.4: Absorbs FIX-009B - don't wipe existing data with an empty save.
        // If caller passes [] but DB has existing rows, skip this table entirely.
        // This prevents the race condition where save() fires before load() completes.
        if (rows.length === 0) {
          try {
            var existCount = this.db.prepare('SELECT COUNT(*) as c FROM ' + tableName).get();
            if (existCount && existCount.c > 0) return; // DB has data, caller has none -> skip
          } catch(e) { /* table may not exist */ }
        }

        // Get existing PKs for stale-entry cleanup
        const existingIds = new Set();
        try {
          const existing = this.db.prepare('SELECT ' + pkCol + ' FROM ' + tableName).all();
          existing.forEach(r => existingIds.add(r[pkCol]));
        } catch(e) { /* table may not exist yet */ }

        const currentIds = new Set();

        const colList = columns.join(', ');
        const placeholders = columns.map(() => '?').join(', ');
        const upsert = this.db.prepare(
          'INSERT OR REPLACE INTO ' + tableName + ' (' + colList + ') VALUES (' + placeholders + ')'
        );

        for (const row of rows) {
          const values = columns.map(c => {
            const val = row[c];
            if (val === undefined || val === null) return null;
            if (Buffer.isBuffer(val) || (typeof Uint8Array !== 'undefined' && val instanceof Uint8Array)) return val;
            // Convert embedding arrays (Array of numbers) to Float32 BLOB
            if (c === 'embedding' && Array.isArray(val) && val.length > 0 && typeof val[0] === 'number') {
              const f32 = new Float32Array(val);
              return Buffer.from(f32.buffer);
            }
            if (typeof val === 'object') return JSON.stringify(val);
            return val;
          });
          try {
            upsert.run(...values);
            if (row[pkCol] !== undefined) currentIds.add(row[pkCol]);
          } catch(e) { /* skip malformed rows */ }
        }

        // Remove stale rows not in current data set
        for (const existId of existingIds) {
          if (!currentIds.has(existId)) {
            try {
              this.db.prepare('DELETE FROM ' + tableName + ' WHERE ' + pkCol + ' = ?').run(existId);
            } catch(e) { /* ignore cleanup errors */ }
          }
        }
      };

      // 1. memories: id, memory_type, content, embedding, metadata, timestamp
      //    Normalize upstream pretrain format: {content, type, created, embedding} -> standard schema
      if (data.memories !== undefined) {
        const normalizedMemories = (data.memories || []).map(m => {
          if (m.id && m.memory_type) return m; // Already normalized
          const ts = m.timestamp || m.created || Math.floor(Date.now() / 1000);
          return {
            id: m.id || ('mem-' + ts + '-' + Math.random().toString(36).substring(2, 11)),
            memory_type: m.memory_type || m.type || 'general',
            content: m.content || '',
            embedding: m.embedding || null,
            metadata: m.metadata || '{}',
            timestamp: typeof ts === 'number' ? ts : Math.floor(new Date(ts).getTime() / 1000) || Math.floor(Date.now() / 1000)
          };
        });
        upsertTable('memories', normalizedMemories,
          ['id', 'memory_type', 'content', 'embedding', 'metadata', 'timestamp'],
          'id');
      }

      // 2. patterns: key, state, action, q_value, visits, last_update
      //    Data can arrive as:
      //      (a) Object keyed by pattern key: { key: { state, action, q_value, visits, last_update } }
      //      (b) Old nested format: { state: { action: q_value } }
      //    We handle both and use the full column set with 'key' as PK.
      if (data.patterns !== undefined && data.patterns !== null) {
        const patRows = [];
        if (typeof data.patterns === 'object' && !Array.isArray(data.patterns)) {
          Object.keys(data.patterns).forEach(k => {
            const entry = data.patterns[k];
            if (entry && typeof entry === 'object' && ('state' in entry || 'action' in entry || 'q_value' in entry)) {
              // New format: { key: { state, action, q_value, visits, last_update } }
              patRows.push({
                key: k,
                state: entry.state || '',
                action: entry.action || '',
                q_value: typeof entry.q_value === 'number' ? entry.q_value : 0,
                visits: typeof entry.visits === 'number' ? entry.visits : 0,
                last_update: typeof entry.last_update === 'number' ? entry.last_update : 0
              });
            } else if (entry && typeof entry === 'object') {
              // Old nested format: { state: { action: q_value } }
              // Here k = state, entry = { action: q_value }
              Object.keys(entry).forEach(action => {
                const qval = entry[action];
                if (typeof qval === 'number') {
                  patRows.push({
                    key: k + ':' + action,
                    state: k,
                    action: action,
                    q_value: qval,
                    visits: 0,
                    last_update: 0
                  });
                }
              });
            }
          });
        }
        // Use upsertTable with the full column set
        upsertTable('patterns', patRows,
          ['key', 'state', 'action', 'q_value', 'visits', 'last_update'],
          'key');
      }

      // 3. trajectories: id, state, action, outcome, reward, timestamp
      if (data.trajectories !== undefined) {
        upsertTable('trajectories', data.trajectories,
          ['id', 'state', 'action', 'outcome', 'reward', 'timestamp'],
          'id');
      }

      // 4. learning_data: algorithm PK = 'combined', column = q_table (no traces column)
      if (data.learning !== undefined && data.learning !== null) {
        try {
          this.db.prepare("INSERT OR REPLACE INTO learning_data (algorithm, q_table) VALUES ('combined', ?)")
            .run(JSON.stringify(data.learning));
        } catch(e) { /* ignore learning_data errors */ }
      }

      // 5. stats: key/value KV pairs
      if (data.stats !== undefined && data.stats !== null) {
        const statUpsert = this.db.prepare('INSERT OR REPLACE INTO stats (key, value) VALUES (?, ?)');
        Object.keys(data.stats).forEach(key => {
          try {
            const val = data.stats[key];
            statUpsert.run(key, typeof val === 'object' ? JSON.stringify(val) : String(val));
          } catch(e) {}
        });
      }

      // 6. file_sequences: composite PK (from_file, to_file), count
      if (data.file_sequences !== undefined && data.file_sequences !== null && Array.isArray(data.file_sequences)) {
        // Build a set of current composite keys for cleanup
        const existingSeqs = new Set();
        try {
          const existing = this.db.prepare('SELECT from_file, to_file FROM file_sequences').all();
          existing.forEach(r => existingSeqs.add(r.from_file + '\0' + r.to_file));
        } catch(e) {}

        const currentSeqs = new Set();
        const seqUpsert = this.db.prepare(
          'INSERT OR REPLACE INTO file_sequences (from_file, to_file, count) VALUES (?, ?, ?)'
        );

        for (const row of data.file_sequences) {
          if (row.from_file && row.to_file) {
            try {
              seqUpsert.run(row.from_file, row.to_file, row.count || 1);
              currentSeqs.add(row.from_file + '\0' + row.to_file);
            } catch(e) {}
          }
        }

        // Remove stale sequences
        for (const existKey of existingSeqs) {
          if (!currentSeqs.has(existKey)) {
            const parts = existKey.split('\0');
            try {
              this.db.prepare('DELETE FROM file_sequences WHERE from_file = ? AND to_file = ?')
                .run(parts[0], parts[1]);
            } catch(e) {}
          }
        }
      }

      // 7. edges: auto-increment id, so clear + re-insert (cannot upsert by auto-id)
      if (data.edges !== undefined && data.edges !== null && Array.isArray(data.edges)) {
        try {
          this.db.prepare('DELETE FROM edges').run();
        } catch(e) {}
        const edgeIns = this.db.prepare(
          'INSERT INTO edges (source, target, weight, data) VALUES (?, ?, ?, ?)'
        );
        for (const row of data.edges) {
          try {
            edgeIns.run(
              row.source || '',
              row.target || '',
              typeof row.weight === 'number' ? row.weight : 1.0,
              typeof row.data === 'object' ? JSON.stringify(row.data) : (row.data || '{}')
            );
          } catch(e) {}
        }
      }

      // 8. agents: name PK, data TEXT
      if (data.agents !== undefined && data.agents !== null && typeof data.agents === 'object') {
        const existingAgents = new Set();
        try {
          const existing = this.db.prepare('SELECT name FROM agents').all();
          existing.forEach(r => existingAgents.add(r.name));
        } catch(e) {}

        const currentAgents = new Set();
        const agentUpsert = this.db.prepare('INSERT OR REPLACE INTO agents (name, data) VALUES (?, ?)');

        Object.keys(data.agents).forEach(name => {
          try {
            const val = data.agents[name];
            agentUpsert.run(name, typeof val === 'object' ? JSON.stringify(val) : String(val || '{}'));
            currentAgents.add(name);
          } catch(e) {}
        });

        // Remove stale agents
        for (const existName of existingAgents) {
          if (!currentAgents.has(existName)) {
            try {
              this.db.prepare('DELETE FROM agents WHERE name = ?').run(existName);
            } catch(e) {}
          }
        }
      }

      // 9. errors: key PK, data TEXT
      if (data.errors !== undefined && data.errors !== null && typeof data.errors === 'object') {
        const existingErrors = new Set();
        try {
          const existing = this.db.prepare('SELECT key FROM errors').all();
          existing.forEach(r => existingErrors.add(r.key));
        } catch(e) {}

        const currentErrors = new Set();
        const errorUpsert = this.db.prepare('INSERT OR REPLACE INTO errors (key, data) VALUES (?, ?)');

        Object.keys(data.errors).forEach(key => {
          try {
            const val = data.errors[key];
            errorUpsert.run(key, typeof val === 'object' ? JSON.stringify(val) : String(val || '{}'));
            currentErrors.add(key);
          } catch(e) {}
        });

        // Remove stale errors
        for (const existKey of existingErrors) {
          if (!currentErrors.has(existKey)) {
            try {
              this.db.prepare('DELETE FROM errors WHERE key = ?').run(existKey);
            } catch(e) {}
          }
        }
      }

      // 10. neural_patterns: id PK, content, category, embedding, confidence, usage, created_at, updated_at, metadata
      if (data.neural_patterns !== undefined && data.neural_patterns !== null) {
        upsertTable('neural_patterns', data.neural_patterns,
          ['id', 'content', 'category', 'embedding', 'confidence', 'usage', 'created_at', 'updated_at', 'metadata'],
          'id');
      }

      // 11. v0.9.7: compressed_patterns: id, layer, data, compression_ratio, created_at, metadata
      if (data.compressed_patterns !== undefined && data.compressed_patterns !== null) {
        upsertTable('compressed_patterns', data.compressed_patterns,
          ['id', 'layer', 'data', 'compression_ratio', 'created_at', 'metadata'],
          'id');
      }

    });

    tx();
  }

  // --- Atomic operations ---

  addMemory(memory) {
    this.db.prepare(
      'INSERT OR REPLACE INTO memories (id, memory_type, content, embedding, metadata, timestamp) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      memory.id, memory.memory_type || 'general', memory.content || '',
      memory.embedding ? this._arrayToBlob(memory.embedding) : null,
      JSON.stringify(memory.metadata || {}),
      memory.timestamp || Math.floor(Date.now() / 1000)
    );
  }

  updateMemoryEmbedding(id, embedding) {
    this.db.prepare('UPDATE memories SET embedding = ? WHERE id = ?').run(
      this._arrayToBlob(embedding), id
    );
  }

  getMemoryCount() {
    return this.db.prepare('SELECT COUNT(*) as c FROM memories').get().c;
  }

  getEmbeddingStats(expectedDim) {
    const expectedBytes = expectedDim * 4;
    const total = this.db.prepare('SELECT COUNT(*) as c FROM memories').get().c;
    const nullN = this.db.prepare('SELECT COUNT(*) as c FROM memories WHERE embedding IS NULL').get().c;
    const correct = this.db.prepare(
      'SELECT COUNT(*) as c FROM memories WHERE embedding IS NOT NULL AND length(embedding) = ?'
    ).get(expectedBytes).c;
    return { total, correct, wrongDim: total - nullN - correct, nullN };
  }

  updatePattern(key, pattern) {
    this.db.prepare(
      'INSERT OR REPLACE INTO patterns (key, state, action, q_value, visits, last_update) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(key, pattern.state, pattern.action, pattern.q_value, pattern.visits, pattern.last_update);
  }

  addTrajectory(trajectory) {
    this.db.prepare(
      'INSERT OR REPLACE INTO trajectories (id, state, action, outcome, reward, timestamp) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(trajectory.id, trajectory.state, trajectory.action, trajectory.outcome, trajectory.reward, trajectory.timestamp);
  }

  recordFileSequence(fromFile, toFile) {
    this.db.prepare(
      'INSERT INTO file_sequences (from_file, to_file, count) VALUES (?, ?, 1) ON CONFLICT(from_file, to_file) DO UPDATE SET count = count + 1'
    ).run(fromFile, toFile);
  }

  addError(key, data) {
    this.db.prepare('INSERT OR REPLACE INTO errors (key, data) VALUES (?, ?)').run(key, JSON.stringify(data));
  }

  incrementSessionCount() {
    const now = Math.floor(Date.now() / 1000);
    this.db.prepare("INSERT OR REPLACE INTO stats (key, value) VALUES ('session_count', CAST(COALESCE((SELECT CAST(value AS INTEGER) FROM stats WHERE key = 'session_count'), 0) + 1 AS TEXT))").run();
    this.db.prepare("INSERT OR REPLACE INTO stats (key, value) VALUES ('last_session', ?)").run(String(now));
  }

  setKV(key, value) {
    this.db.prepare('INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)').run(key, value);
  }

  getKV(key) {
    const row = this.db.prepare('SELECT value FROM kv_store WHERE key = ?').get(key);
    return row ? row.value : null;
  }

  saveLearningData(learning) {
    this.db.prepare("INSERT OR REPLACE INTO learning_data (algorithm, q_table) VALUES ('combined', ?)").run(
      JSON.stringify(learning)
    );
  }

  // --- v0.9.5: New atomic operations for learning pipeline ---

  addNeuralPattern(pattern) {
    const now = Math.floor(Date.now() / 1000);
    const id = pattern.id || ('np-' + now + '-' + Math.random().toString(36).substring(2, 9));
    // INSERT or UPDATE: if pattern id exists, increment confidence
    const existing = this.db.prepare('SELECT id, confidence, usage FROM neural_patterns WHERE id = ?').get(id);
    if (existing) {
      this.db.prepare(
        'UPDATE neural_patterns SET confidence = MIN(confidence + 0.1, 1.0), usage = usage + 1, updated_at = ?, content = COALESCE(?, content), metadata = COALESCE(?, metadata) WHERE id = ?'
      ).run(now, pattern.content || null, pattern.metadata ? JSON.stringify(pattern.metadata) : null, id);
    } else {
      this.db.prepare(
        'INSERT INTO neural_patterns (id, content, category, embedding, confidence, usage, created_at, updated_at, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        id,
        pattern.content || '',
        pattern.category || 'general',
        pattern.embedding ? this._arrayToBlob(pattern.embedding) : null,
        typeof pattern.confidence === 'number' ? pattern.confidence : 0.5,
        pattern.usage || 1,
        now,
        now,
        JSON.stringify(pattern.metadata || {})
      );
    }
    return id;
  }

  // v0.9.7: Get neural patterns with embeddings parsed
  getNeuralPatterns(category, limit) {
    limit = limit || 100;
    let rows;

    if (category) {
      rows = this.db.prepare(
        'SELECT * FROM neural_patterns WHERE category = ? ORDER BY confidence DESC, usage DESC LIMIT ?'
      ).all(category, limit);
    } else {
      rows = this.db.prepare(
        'SELECT * FROM neural_patterns ORDER BY confidence DESC, usage DESC LIMIT ?'
      ).all(limit);
    }

    return rows.map(row => ({
      id: row.id,
      content: row.content,
      category: row.category,
      embedding: this._parseEmbedding(row.embedding),
      confidence: row.confidence,
      usage: row.usage,
      created_at: row.created_at,
      updated_at: row.updated_at,
      metadata: this._parseJSON(row.metadata, {})
    }));
  }

  addEdge(source, target, weight, data) {
    // INSERT or UPDATE: if same source+target exists, strengthen weight
    const existing = this.db.prepare(
      'SELECT id, weight FROM edges WHERE source = ? AND target = ?'
    ).get(source, target);
    if (existing) {
      const newWeight = Math.min(existing.weight + (weight || 0.1), 10.0);
      this.db.prepare('UPDATE edges SET weight = ?, data = ? WHERE id = ?').run(
        newWeight,
        typeof data === 'object' ? JSON.stringify(data) : (data || '{}'),
        existing.id
      );
      return existing.id;
    } else {
      const result = this.db.prepare(
        'INSERT INTO edges (source, target, weight, data) VALUES (?, ?, ?, ?)'
      ).run(
        source || '',
        target || '',
        typeof weight === 'number' ? weight : 1.0,
        typeof data === 'object' ? JSON.stringify(data) : (data || '{}')
      );
      return result.lastInsertRowid;
    }
  }

  registerAgent(name, sessionId) {
    const now = Math.floor(Date.now() / 1000);
    const existing = this.db.prepare('SELECT name, data FROM agents WHERE name = ?').get(name);
    if (existing) {
      const agentData = this._parseJSON(existing.data, {});
      agentData.last_session = sessionId || ('session-' + now);
      agentData.last_seen = now;
      agentData.session_count = (agentData.session_count || 0) + 1;
      this.db.prepare('UPDATE agents SET data = ? WHERE name = ?').run(
        JSON.stringify(agentData), name
      );
    } else {
      const agentData = {
        first_seen: now,
        last_seen: now,
        last_session: sessionId || ('session-' + now),
        session_count: 1
      };
      this.db.prepare('INSERT INTO agents (name, data) VALUES (?, ?)').run(
        name, JSON.stringify(agentData)
      );
    }
  }

  getRecentMemories(limit) {
    limit = limit || 50;
    return this.db.prepare(
      'SELECT id, memory_type, content, metadata, timestamp FROM memories ORDER BY timestamp DESC LIMIT ?'
    ).all(limit).map(row => ({
      id: row.id,
      memory_type: row.memory_type,
      content: row.content,
      metadata: this._parseJSON(row.metadata, {}),
      timestamp: row.timestamp
    }));
  }

  getRecentTrajectories(limit) {
    limit = limit || 50;
    return this.db.prepare(
      'SELECT id, state, action, outcome, reward, timestamp FROM trajectories ORDER BY timestamp DESC LIMIT ?'
    ).all(limit).map(row => ({
      id: row.id,
      state: row.state,
      action: row.action,
      outcome: row.outcome,
      reward: row.reward,
      timestamp: row.timestamp
    }));
  }

  // --- JSON mirror: keep intelligence.json in sync for hardcoded subcommands ---

  writeJsonMirror(data) {
    try {
      fs.writeFileSync(this._jsonMirrorPath, JSON.stringify(data, null, 2));
    } catch (e) {
      // Non-fatal: JSON mirror is a convenience, not a requirement
    }
  }

  // Check if JSON was modified externally (by hardcoded learning subcommands)
  isJsonNewer() {
    try {
      if (!fs.existsSync(this._jsonMirrorPath)) return false;
      const jsonStat = fs.statSync(this._jsonMirrorPath);
      const dbStat = fs.statSync(this.dbPath);
      return jsonStat.mtimeMs > dbStat.mtimeMs + 1000; // 1s tolerance
    } catch {
      return false;
    }
  }

  importFromJson() {
    try {
      if (!fs.existsSync(this._jsonMirrorPath)) return null;
      const data = JSON.parse(fs.readFileSync(this._jsonMirrorPath, 'utf-8'));
      this.saveAll(data);
      return data;
    } catch {
      return null;
    }
  }

  // --- Helpers ---

  _arrayToBlob(arr) {
    if (!arr) return null;
    if (Buffer.isBuffer(arr)) return arr;
    if (arr instanceof Float32Array) return Buffer.from(arr.buffer);
    // Regular array of numbers -> Float32
    const f32 = new Float32Array(arr);
    return Buffer.from(f32.buffer);
  }

  _blobToArray(blob) {
    if (!blob) return null;
    const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
    const f32 = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    return Array.from(f32);
  }

  _parseJSON(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
  }

  close() {
    if (this.db) this.db.close();
  }
}

// Factory function
function createStorage(dbPath) {
  return new SqliteStorage(dbPath);
}

function createStorageFromEnv() {
  const customPath = process.env.RUVECTOR_SQLITE_PATH;
  return new SqliteStorage(customPath || undefined);
}

module.exports = { SqliteStorage, createStorage, createStorageFromEnv };
