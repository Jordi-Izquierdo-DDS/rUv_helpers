#!/usr/bin/env node
// post-process.js v0.9.9 — Learning pipeline post-processor.
// Called by hook bridge in background after events to populate:
//   - neural_patterns (file-type, directory, component patterns + embeddings)
//   - edges (temporal, file, trajectory, pattern, SEMANTIC links)
//   - agents (session registration with DB storage)
//   - stats (FIX-027: synchronized statistics table)
//
// v0.9.9 changes:
//   - FIX-030: STATS REFRESH - updateStats() now schema-aware, adds updated_at if missing
//   - FIX-030: Uses correct key names: total_neural_patterns, total_edges, sona_patterns_compressed
//   - FIX-030: Tracks compressed_patterns count for SONA stats
//   - FIX-030: Uses ON CONFLICT upsert instead of INSERT OR REPLACE
//   - SESSION TRACKING: session-start now updates last_session timestamp and session_count++ in stats
//   - SESSION-END HANDLER: New handleSessionEnd() triggers consolidation + stats sync
//   - AGENT REGISTRATION FIX: Handles both new and legacy agents table schemas gracefully
//   - PRE-COMMAND HANDLER: Added placeholder for future command prediction learning
//   - Stats table now tracks: last_session, last_session_timestamp, session_count, total_sessions
//
// v0.9.8 changes:
//   - FIX-027: STATS TABLE SYNC in consolidate handler
//   - Stats now tracks: total_memories, total_patterns, total_edges, total_trajectories,
//     total_agents, last_consolidation, embedding_dimension, consolidation_count
//   - Automatic stats update after every consolidation event
//   - updateStats() helper function for consistent stats management
//
// v0.9.7 changes (retained):
//   - CONFIGURABLE SEMANTIC_THRESHOLD via RUVECTOR_SEMANTIC_THRESHOLD env var
//   - SHARED parseEmbedding() utility for correct Node.js Buffer handling
//   - EXPLICIT ERROR LOGGING in addNeuralPattern (no more silent failures)
//   - compressed_patterns TABLE CHECK at startup
//   - VERBOSE LOGGING via RUVECTOR_VERBOSE env var
//   - EDGE WEIGHT FIX: Replace instead of accumulate weights
//
// v0.9.6 changes (retained):
//   - SEMANTIC EDGES: Uses embedding gateway for consistent 384d ONNX vectors
//   - NEURAL PATTERN EMBEDDINGS: Patterns now stored with embeddings for HNSW search
//   - AGENT REGISTRATION: Always registers to intelligence.db (SSOT)
//   - EMBEDDING GATEWAY: Single source for all embeddings (assets/embedding-gateway.js)
//
// Usage:
//   node scripts/post-process.js --event post-edit --file <path> --success true
//   node scripts/post-process.js --event post-command --command <cmd> --success true
//   node scripts/post-process.js --event session-start --agent-name <name> --session-id <id>
//   node scripts/post-process.js --event consolidate   # bulk backfill from existing data

'use strict';

var fs = require('fs');
var path = require('path');

// ============================================================================
// 0. Configuration from environment (v0.9.7)
// ============================================================================
var SEMANTIC_THRESHOLD = parseFloat(process.env.RUVECTOR_SEMANTIC_THRESHOLD) || 0.55;
var VERBOSE = process.env.RUVECTOR_VERBOSE === 'true' || process.env.RUVECTOR_VERBOSE === '1';

function verboseLog(msg) {
  if (VERBOSE) {
    console.log('[VERBOSE] ' + msg);
  }
}

// ============================================================================
// 1. Argument parsing
// ============================================================================
var args = {};
var argv = process.argv.slice(2);
for (var i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--') && i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
    args[argv[i].substring(2)] = argv[i + 1];
    i++;
  } else if (argv[i].startsWith('--')) {
    args[argv[i].substring(2)] = 'true';
  }
}

// Allow --verbose flag to enable verbose mode
if (args.verbose === 'true') {
  VERBOSE = true;
}

var event = args.event;
if (!event) {
  console.error('post-process.js: --event required (post-edit|post-command|session-start|consolidate)');
  process.exit(1);
}

verboseLog('Starting post-process.js v0.9.8');
verboseLog('Event: ' + event);
verboseLog('Semantic threshold: ' + SEMANTIC_THRESHOLD);

// ============================================================================
// 2. Shared parseEmbedding utility (v0.9.7 - handles Node.js Buffer correctly)
// ============================================================================
function parseEmbedding(blob) {
  if (!blob) return null;

  // Handle Node.js Buffer (most common case from SQLite)
  if (Buffer.isBuffer(blob)) {
    return new Float32Array(
      blob.buffer,
      blob.byteOffset,
      blob.length / 4  // 4 bytes per float32
    );
  }

  // Handle ArrayBufferView (Uint8Array, etc.)
  if (ArrayBuffer.isView(blob)) {
    return new Float32Array(blob.buffer, blob.byteOffset || 0, blob.byteLength / 4);
  }

  // Handle raw ArrayBuffer
  if (blob instanceof ArrayBuffer) {
    return new Float32Array(blob);
  }

  // Handle array-like (already float values)
  if (Array.isArray(blob) || (blob.length && typeof blob[0] === 'number')) {
    return new Float32Array(blob);
  }

  verboseLog('parseEmbedding: Unknown blob type: ' + typeof blob);
  return null;
}

// ============================================================================
// 3. Embedding Gateway (v0.9.6: Single source of truth for all embeddings)
// ============================================================================
var embeddingGateway = null;

function getEmbeddingGateway() {
  if (embeddingGateway) return embeddingGateway;

  // Try to load the embedding gateway
  try {
    var gatewayPath = path.join(process.cwd(), 'assets', 'embedding-gateway.js');
    if (fs.existsSync(gatewayPath)) {
      embeddingGateway = require(gatewayPath);
      verboseLog('Loaded embedding gateway from: ' + gatewayPath);
      return embeddingGateway;
    }
  } catch (e) {
    verboseLog('Failed to load embedding gateway: ' + e.message);
  }

  // Fallback: create a simple gateway that uses ruvector's embed
  try {
    var ruvector = require(path.join(process.cwd(), 'node_modules', 'ruvector'));
    embeddingGateway = {
      dimension: 384,
      embed: function(text) {
        try {
          // Use ruvector's semantic embedding if available
          if (ruvector && ruvector.hooks && typeof ruvector.hooks.embed === 'function') {
            return ruvector.hooks.embed(text);
          }
          // Fallback to hash-based embedding
          return hashEmbed(text, 384);
        } catch (e) {
          return hashEmbed(text, 384);
        }
      },
      cosineSimilarity: function(a, b) {
        if (!a || !b || a.length !== b.length) return 0;
        var dot = 0, normA = 0, normB = 0;
        for (var i = 0; i < a.length; i++) {
          dot += a[i] * b[i];
          normA += a[i] * a[i];
          normB += b[i] * b[i];
        }
        var denom = Math.sqrt(normA) * Math.sqrt(normB);
        return denom > 0 ? dot / denom : 0;
      }
    };
    verboseLog('Using ruvector-based embedding gateway');
    return embeddingGateway;
  } catch (e) {
    // Last resort: pure hash-based gateway
    embeddingGateway = {
      dimension: 384,
      embed: function(text) { return hashEmbed(text, 384); },
      cosineSimilarity: function(a, b) {
        if (!a || !b || a.length !== b.length) return 0;
        var dot = 0, normA = 0, normB = 0;
        for (var i = 0; i < a.length; i++) {
          dot += a[i] * b[i];
          normA += a[i] * a[i];
          normB += b[i] * b[i];
        }
        var denom = Math.sqrt(normA) * Math.sqrt(normB);
        return denom > 0 ? dot / denom : 0;
      }
    };
    verboseLog('Using hash-based fallback embedding gateway');
    return embeddingGateway;
  }
}

// Hash-based embedding fallback (deterministic, 384d)
function hashEmbed(text, dim) {
  dim = dim || 384;
  var embedding = new Float32Array(dim);
  var str = String(text || '');

  // Use multiple hash passes for better distribution
  for (var pass = 0; pass < 3; pass++) {
    for (var i = 0; i < str.length; i++) {
      var idx = ((i * 31 + str.charCodeAt(i) * 17 + pass * 127) % dim + dim) % dim;
      embedding[idx] += (1.0 / (pass + 1)) * (str.charCodeAt(i) / 128.0);
    }
  }

  // L2 normalize
  var norm = 0;
  for (var j = 0; j < dim; j++) norm += embedding[j] * embedding[j];
  norm = Math.sqrt(norm) || 1;
  for (var k = 0; k < dim; k++) embedding[k] /= norm;

  return Array.from(embedding);
}

// ============================================================================
// 4. Database connection
// ============================================================================
var storage = null;
var dbDirect = null;

function generateEmbedding(content) {
  var gw = getEmbeddingGateway();
  try {
    var emb = gw.embed(content);
    if (emb && emb.length === 384) {
      return emb;
    }
    console.error('[POST-PROCESS] Embedding dimension mismatch: expected 384, got ' + (emb ? emb.length : 0));
    return null;
  } catch (e) {
    console.error('[POST-PROCESS] generateEmbedding error: ' + e.message);
    return null;
  }
}

function getStorage() {
  if (storage) return storage;

  // Try storage adapter first
  try {
    var storagePkg = require(path.join(process.cwd(), 'packages', 'ruvector-storage'));
    storage = storagePkg.createStorageFromEnv();
    verboseLog('Using ruvector-storage package');
    return storage;
  } catch (e) {
    verboseLog('ruvector-storage not available: ' + e.message);
  }

  // Fall back to direct better-sqlite3
  try {
    var Database = require('better-sqlite3');
    var dbPath = path.join(process.cwd(), '.ruvector', 'intelligence.db');
    if (!fs.existsSync(dbPath)) {
      console.error('post-process.js: intelligence.db not found at ' + dbPath);
      process.exit(1);
    }
    dbDirect = new Database(dbPath);
    dbDirect.pragma('journal_mode = WAL');

    // v0.9.7: Ensure compressed_patterns table exists at startup
    try {
      dbDirect.exec(`CREATE TABLE IF NOT EXISTS compressed_patterns (
        id TEXT PRIMARY KEY,
        layer TEXT NOT NULL,
        data BLOB NOT NULL,
        compression_ratio REAL DEFAULT 1.0,
        created_at INTEGER NOT NULL,
        metadata TEXT DEFAULT '{}'
      )`);
      verboseLog('compressed_patterns table verified');
    } catch (e) {
      verboseLog('compressed_patterns table check: ' + e.message);
    }

    // v0.9.8 FIX-027: Ensure stats table exists at startup
    try {
      dbDirect.exec(`CREATE TABLE IF NOT EXISTS stats (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )`);
      verboseLog('stats table verified (FIX-027)');
    } catch (e) {
      verboseLog('stats table check: ' + e.message);
    }

    // Build a minimal storage-compatible wrapper
    storage = {
      db: dbDirect,

      // v0.9.7: Neural patterns with explicit error logging
      addNeuralPattern: function(pat) {
        var now = Math.floor(Date.now() / 1000);
        var id = pat.id || ('np-' + now + '-' + Math.random().toString(36).substring(2, 9));

        // v0.9.6-fix: Ensure embedding column exists
        try {
          dbDirect.exec('ALTER TABLE neural_patterns ADD COLUMN embedding BLOB');
        } catch (e) { /* column already exists */ }

        try {
          var existing = dbDirect.prepare('SELECT id, embedding FROM neural_patterns WHERE id = ?').get(id);

          // v0.9.7: Generate embedding with explicit error logging
          var embeddingBlob = null;
          if (pat.embedding) {
            embeddingBlob = Buffer.from(new Float32Array(pat.embedding).buffer);
          } else if (pat.content) {
            var emb = generateEmbedding(pat.content);
            if (!emb || emb.length !== 384) {
              console.error('[POST-PROCESS] Failed to generate embedding for pattern: ' + id);
            } else {
              embeddingBlob = Buffer.from(new Float32Array(emb).buffer);
            }
          }

          if (existing) {
            // v0.9.6-fix: Always update embedding if we have one and existing doesn't
            var existingEmb = parseEmbedding(existing.embedding);
            var needsEmbedding = embeddingBlob && (!existingEmb || existingEmb.length === 0);
            if (needsEmbedding) {
              dbDirect.prepare('UPDATE neural_patterns SET confidence = MIN(confidence + 0.1, 1.0), usage = usage + 1, updated_at = ?, embedding = ? WHERE id = ?').run(now, embeddingBlob, id);
              verboseLog('Updated pattern with embedding: ' + id);
            } else {
              dbDirect.prepare('UPDATE neural_patterns SET confidence = MIN(confidence + 0.1, 1.0), usage = usage + 1, updated_at = ? WHERE id = ?').run(now, id);
              verboseLog('Updated existing pattern: ' + id);
            }
          } else {
            dbDirect.prepare('INSERT INTO neural_patterns (id, content, category, confidence, usage, created_at, updated_at, metadata, embedding) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
              id, pat.content || '', pat.category || 'general', pat.confidence || 0.5, 1, now, now, JSON.stringify(pat.metadata || {}), embeddingBlob
            );
            verboseLog('Inserted new pattern: ' + id);
          }
          return id;
        } catch (e) {
          // v0.9.7: Explicit error logging (don't swallow errors silently)
          console.error('[POST-PROCESS] addNeuralPattern error for ' + id + ': ' + e.message);

          // Fallback: try without embedding
          try {
            var existing2 = dbDirect.prepare('SELECT id FROM neural_patterns WHERE id = ?').get(id);
            if (existing2) {
              dbDirect.prepare('UPDATE neural_patterns SET confidence = MIN(confidence + 0.1, 1.0), usage = usage + 1, updated_at = ? WHERE id = ?').run(now, id);
            } else {
              dbDirect.prepare('INSERT INTO neural_patterns (id, content, category, confidence, usage, created_at, updated_at, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
                id, pat.content || '', pat.category || 'general', pat.confidence || 0.5, 1, now, now, JSON.stringify(pat.metadata || {})
              );
            }
            verboseLog('Fallback insert/update succeeded for: ' + id);
          } catch (e2) {
            console.error('[POST-PROCESS] Fallback also failed for ' + id + ': ' + e2.message);
          }
          return id;
        }
      },

      // v0.9.7: Edges now REPLACE weight instead of accumulating
      addEdge: function(source, target, weight, data) {
        try {
          var existing = dbDirect.prepare('SELECT id, weight FROM edges WHERE source = ? AND target = ?').get(source, target);
          if (existing) {
            // v0.9.7-fix: REPLACE weight instead of accumulating
            // Old (buggy): weight = existing.weight + new_weight (accumulates unboundedly)
            // New (fixed): weight = new_weight (replace with current value)
            dbDirect.prepare('UPDATE edges SET weight = ?, data = ? WHERE id = ?').run(
              weight || 1.0,  // Replace, don't accumulate
              typeof data === 'object' ? JSON.stringify(data) : (data || '{}'),
              existing.id
            );
            verboseLog('Updated edge: ' + source + ' -> ' + target + ' (weight=' + weight + ')');
            return existing.id;
          } else {
            var result = dbDirect.prepare('INSERT INTO edges (source, target, weight, data) VALUES (?, ?, ?, ?)').run(
              source, target, weight || 1.0, typeof data === 'object' ? JSON.stringify(data) : (data || '{}')
            );
            verboseLog('Inserted edge: ' + source + ' -> ' + target + ' (weight=' + weight + ')');
            return result.lastInsertRowid;
          }
        } catch (e) {
          console.error('[POST-PROCESS] addEdge error: ' + e.message);
          return null;
        }
      },

      // v0.9.9: Agent registration always goes to DB (SSOT)
      // Handles both new schema (id, name, type, status, created_at, last_seen, metadata)
      // and legacy schema (name, data) gracefully
      registerAgent: function(name, sessionId) {
        var now = Math.floor(Date.now() / 1000);
        try {
          // Check schema to determine which format to use
          var columns = dbDirect.prepare('PRAGMA table_info(agents)').all();
          var columnNames = columns.map(function(c) { return c.name; });
          var hasNewSchema = columnNames.includes('type') && columnNames.includes('status');
          var hasLegacySchema = columnNames.includes('data');

          if (hasNewSchema) {
            // New schema: id, name, type, status, created_at, last_seen, metadata
            var existing = dbDirect.prepare('SELECT id, metadata FROM agents WHERE name = ?').get(name);
            if (existing) {
              var meta = {};
              try { meta = JSON.parse(existing.metadata || '{}'); } catch (e) {}
              meta.last_session = sessionId || ('session-' + now);
              meta.session_count = (meta.session_count || 0) + 1;
              dbDirect.prepare('UPDATE agents SET last_seen = ?, status = ?, metadata = ? WHERE id = ?').run(
                now, 'active', JSON.stringify(meta), existing.id
              );
              verboseLog('Updated agent (new schema): ' + name + ' session_count=' + meta.session_count);
            } else {
              var agentId = 'agent-' + name + '-' + now;
              var meta = { last_session: sessionId || ('session-' + now), session_count: 1, first_seen: now };
              dbDirect.prepare('INSERT INTO agents (id, name, type, status, created_at, last_seen, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
                agentId, name, 'claude-code', 'active', now, now, JSON.stringify(meta)
              );
              verboseLog('Registered new agent (new schema): ' + name);
            }
          } else if (hasLegacySchema) {
            // Legacy schema: name, data
            var existing = dbDirect.prepare('SELECT name, data FROM agents WHERE name = ?').get(name);
            if (existing) {
              var d = {};
              try { d = JSON.parse(existing.data); } catch (e) {}
              d.last_session = sessionId || ('session-' + now);
              d.last_seen = now;
              d.session_count = (d.session_count || 0) + 1;
              dbDirect.prepare('UPDATE agents SET data = ? WHERE name = ?').run(JSON.stringify(d), name);
              verboseLog('Updated agent registration (legacy): ' + name + ' session_count=' + d.session_count);
            } else {
              dbDirect.prepare('INSERT INTO agents (name, data) VALUES (?, ?)').run(name, JSON.stringify({
                first_seen: now, last_seen: now, last_session: sessionId || ('session-' + now), session_count: 1
              }));
              verboseLog('Registered new agent (legacy): ' + name);
            }
          } else {
            // Table exists but has unexpected schema - try to create with new schema
            dbDirect.exec('DROP TABLE IF EXISTS agents');
            dbDirect.exec('CREATE TABLE agents (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT DEFAULT "unknown", status TEXT DEFAULT "active", created_at INTEGER NOT NULL, last_seen INTEGER, metadata TEXT DEFAULT "{}")');
            dbDirect.exec('CREATE INDEX IF NOT EXISTS idx_agents_name ON agents(name)');
            var agentId = 'agent-' + name + '-' + now;
            var meta = { last_session: sessionId || ('session-' + now), session_count: 1, first_seen: now };
            dbDirect.prepare('INSERT INTO agents (id, name, type, status, created_at, last_seen, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
              agentId, name, 'claude-code', 'active', now, now, JSON.stringify(meta)
            );
            verboseLog('Recreated agents table and registered: ' + name);
          }
        } catch (e) {
          console.error('[POST-PROCESS] registerAgent error: ' + e.message);
          // Fallback: try simple insert with name only
          try {
            dbDirect.exec('CREATE TABLE IF NOT EXISTS agents (name TEXT PRIMARY KEY, data TEXT)');
            dbDirect.prepare('INSERT OR REPLACE INTO agents (name, data) VALUES (?, ?)').run(name, JSON.stringify({
              first_seen: now, last_seen: now, last_session: sessionId || ('session-' + now), session_count: 1
            }));
            verboseLog('Fallback agent registration: ' + name);
          } catch (e2) {
            console.error('[POST-PROCESS] Fallback registerAgent also failed: ' + e2.message);
          }
        }
      },

      getRecentMemories: function(limit) {
        try {
          return dbDirect.prepare('SELECT id, memory_type, content, metadata, timestamp, embedding FROM memories ORDER BY timestamp DESC LIMIT ?').all(limit || 50);
        } catch (e) {
          // Fallback without embedding column
          try {
            return dbDirect.prepare('SELECT id, memory_type, content, metadata, timestamp FROM memories ORDER BY timestamp DESC LIMIT ?').all(limit || 50);
          } catch (e2) {
            console.error('[POST-PROCESS] getRecentMemories error: ' + e2.message);
            return [];
          }
        }
      },

      getRecentTrajectories: function(limit) {
        try {
          return dbDirect.prepare('SELECT id, state, action, outcome, reward, timestamp FROM trajectories ORDER BY timestamp DESC LIMIT ?').all(limit || 50);
        } catch (e) {
          console.error('[POST-PROCESS] getRecentTrajectories error: ' + e.message);
          return [];
        }
      },

      close: function() { if (dbDirect) dbDirect.close(); },

      // v0.9.9 FIX-027+030: Stats table sync helper (schema-aware)
      updateStats: function() {
        var now = Math.floor(Date.now() / 1000);
        try {
          // v0.9.9: Check if stats table has updated_at column (schema migration)
          var statsColumns = dbDirect.prepare('PRAGMA table_info(stats)').all().map(function(c) { return c.name; });
          var hasUpdatedAt = statsColumns.indexOf('updated_at') >= 0;

          // Add updated_at column if missing
          if (!hasUpdatedAt) {
            try {
              dbDirect.exec('ALTER TABLE stats ADD COLUMN updated_at INTEGER');
              hasUpdatedAt = true;
              verboseLog('Added updated_at column to stats table');
            } catch (e) { /* column may already exist */ }
          }

          // Gather counts from all tables
          var totalMemories = dbDirect.prepare('SELECT COUNT(*) as c FROM memories').get().c || 0;
          var totalNeuralPatterns = dbDirect.prepare('SELECT COUNT(*) as c FROM neural_patterns').get().c || 0;
          var totalEdges = dbDirect.prepare('SELECT COUNT(*) as c FROM edges').get().c || 0;
          var totalTrajectories = dbDirect.prepare('SELECT COUNT(*) as c FROM trajectories').get().c || 0;
          var totalAgents = dbDirect.prepare('SELECT COUNT(*) as c FROM agents').get().c || 0;

          // v0.9.9: Count compressed patterns for SONA stats
          var compressedPatterns = 0;
          try {
            compressedPatterns = dbDirect.prepare('SELECT COUNT(*) as c FROM compressed_patterns').get().c || 0;
          } catch (e) { /* table may not exist */ }

          // Get embedding dimension from a sample memory
          var embeddingDim = 384; // default
          try {
            var sample = dbDirect.prepare('SELECT embedding FROM memories WHERE embedding IS NOT NULL LIMIT 1').get();
            if (sample && sample.embedding) {
              embeddingDim = sample.embedding.length / 4; // bytes to float32 count
            }
          } catch (e) { /* use default */ }

          // Get current consolidation count
          var prevCount = 0;
          try {
            var row = dbDirect.prepare('SELECT value FROM stats WHERE key = ?').get('consolidation_count');
            if (row) prevCount = parseInt(row.value) || 0;
          } catch (e) { /* ignore */ }

          // v0.9.9: Use ON CONFLICT upsert (schema now has updated_at)
          var upsert = dbDirect.prepare('INSERT INTO stats (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at');

          // v0.9.9: Update with correct key names matching expected schema
          upsert.run('total_memories', String(totalMemories), now);
          upsert.run('total_neural_patterns', String(totalNeuralPatterns), now);  // FIX: correct key name
          upsert.run('total_patterns', String(totalNeuralPatterns), now);         // Keep legacy key for compat
          upsert.run('total_edges', String(totalEdges), now);
          upsert.run('total_trajectories', String(totalTrajectories), now);
          upsert.run('total_agents', String(totalAgents), now);
          upsert.run('embedding_dimension', String(embeddingDim), now);
          upsert.run('last_consolidation', String(now), now);
          upsert.run('last_consolidate', new Date(now * 1000).toISOString(), now);  // FIX: add ISO timestamp
          upsert.run('consolidation_count', String(prevCount + 1), now);
          upsert.run('sona_patterns_compressed', String(compressedPatterns), now);  // FIX: track compressed patterns
          upsert.run('sona_last_dream_cycle', new Date(now * 1000).toISOString(), now);

          verboseLog('Stats updated: memories=' + totalMemories + ' neural_patterns=' + totalNeuralPatterns + ' edges=' + totalEdges + ' compressed=' + compressedPatterns);
          return {
            memories: totalMemories,
            neural_patterns: totalNeuralPatterns,
            edges: totalEdges,
            trajectories: totalTrajectories,
            agents: totalAgents,
            embedding_dimension: embeddingDim,
            compressed_patterns: compressedPatterns
          };
        } catch (e) {
          console.error('[POST-PROCESS] updateStats error: ' + e.message);
          return null;
        }
      }
    };

    return storage;
  } catch (e) {
    console.error('post-process.js: Cannot connect to database: ' + e.message);
    process.exit(1);
  }
}

// ============================================================================
// 5. Agent registration (session-start event)
// v0.9.9: Also updates stats table with last_session timestamp and session_count++
// ============================================================================
function handleSessionStart() {
  var st = getStorage();
  var agentName = args['agent-name'] || args.agent || 'claude-code';
  var sessionId = args['session-id'] || args.session || ('session-' + Math.floor(Date.now() / 1000));
  st.registerAgent(agentName, sessionId);

  // v0.9.9: Update session stats in stats table
  if (st.db) {
    var now = Math.floor(Date.now() / 1000);
    try {
      // Ensure stats table exists
      st.db.exec('CREATE TABLE IF NOT EXISTS stats (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)');

      // Get current session count
      var countRow = st.db.prepare('SELECT value FROM stats WHERE key = ?').get('session_count');
      var sessionCount = countRow ? (parseInt(countRow.value) || 0) + 1 : 1;

      // Upsert session stats
      var upsert = st.db.prepare('INSERT OR REPLACE INTO stats (key, value, updated_at) VALUES (?, ?, ?)');
      upsert.run('last_session', sessionId, now);
      upsert.run('last_session_timestamp', String(now), now);
      upsert.run('session_count', String(sessionCount), now);
      upsert.run('last_agent', agentName, now);

      verboseLog('Session stats updated: session_count=' + sessionCount + ' last_session=' + sessionId);
    } catch (e) {
      console.error('[POST-PROCESS] Failed to update session stats: ' + e.message);
    }
  }

  return { agents: 1 };
}

// ============================================================================
// 6. Edge creation (5 types including SEMANTIC - v0.9.6, v0.9.7 fixes)
// ============================================================================
function createEdgesFromEvent(eventType) {
  var st = getStorage();
  var gw = getEmbeddingGateway();
  var edgeCount = 0;

  var memories = st.getRecentMemories(20);
  if (memories.length < 2) return { edges: 0 };

  // Type 1: Temporal edges (memory → memory, sequential by time)
  for (var i = 0; i < memories.length - 1 && i < 10; i++) {
    var decay = 1.0 / (i + 1); // Stronger for more recent pairs
    st.addEdge(
      'mem:' + memories[i].id,
      'mem:' + memories[i + 1].id,
      decay,
      { type: 'temporal', event: eventType }
    );
    edgeCount++;
  }

  // Type 2: File edges (memory → file, based on content mentioning files)
  if (eventType === 'post-edit' && args.file) {
    var fileName = path.basename(args.file);
    var dirName = path.basename(path.dirname(args.file));
    // Link recent memories to the edited file
    for (var j = 0; j < Math.min(3, memories.length); j++) {
      st.addEdge(
        'mem:' + memories[j].id,
        'file:' + dirName + '/' + fileName,
        1.0,
        { type: 'file', event: eventType, path: args.file }
      );
      edgeCount++;
    }
  }

  // Type 3: Trajectory edges (trajectory → memory, link recent trajectories to memories)
  var trajectories = st.getRecentTrajectories(10);
  for (var t = 0; t < Math.min(5, trajectories.length); t++) {
    var traj = trajectories[t];
    // Find closest memory by timestamp
    var bestMem = null;
    var bestDelta = Infinity;
    for (var m = 0; m < memories.length; m++) {
      var delta = Math.abs((memories[m].timestamp || 0) - (traj.timestamp || 0));
      if (delta < bestDelta) { bestDelta = delta; bestMem = memories[m]; }
    }
    if (bestMem && bestDelta < 60) { // Within 60 seconds
      st.addEdge(
        'traj:' + traj.id,
        'mem:' + bestMem.id,
        traj.reward || 0.5,
        { type: 'trajectory', action: traj.action }
      );
      edgeCount++;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Type 5: SEMANTIC edges (v0.9.6 - uses configurable threshold in v0.9.7)
  // Link memories with high cosine similarity via embedding gateway
  // ═══════════════════════════════════════════════════════════════════════════
  var MAX_SEMANTIC_EDGES_PER_MEMORY = 5;

  // Build embeddings for memories that don't have them
  var memEmbeddings = [];
  var semanticDebug = { parsed: 0, generated: 0, failed: 0 };

  for (var se = 0; se < memories.length; se++) {
    var mem = memories[se];
    var emb = null;

    // v0.9.7: Use shared parseEmbedding utility
    if (mem.embedding && mem.embedding.length > 0) {
      emb = parseEmbedding(mem.embedding);
      if (emb) {
        semanticDebug.parsed++;
      } else {
        semanticDebug.failed++;
      }
    }

    // Generate from content if no embedding
    if (!emb && mem.content) {
      try {
        emb = new Float32Array(gw.embed(mem.content));
        semanticDebug.generated++;
      } catch (e) {
        semanticDebug.failed++;
        verboseLog('Failed to generate embedding for memory ' + mem.id + ': ' + e.message);
      }
    }

    memEmbeddings.push({ mem: mem, emb: emb });
  }

  // Debug output for semantic edge creation
  if (VERBOSE) {
    console.log('  [SEMANTIC] Embeddings: parsed=' + semanticDebug.parsed + ' generated=' + semanticDebug.generated + ' failed=' + semanticDebug.failed);
  }

  // Find similar pairs and create semantic edges
  var semanticEdgesCreated = 0;
  var maxSimilaritySeen = 0;
  var pairsChecked = 0;

  for (var si = 0; si < memEmbeddings.length; si++) {
    var srcMem = memEmbeddings[si];
    if (!srcMem.emb) continue;

    var semanticCount = 0;
    for (var sj = si + 1; sj < memEmbeddings.length && semanticCount < MAX_SEMANTIC_EDGES_PER_MEMORY; sj++) {
      var tgtMem = memEmbeddings[sj];
      if (!tgtMem.emb) continue;

      pairsChecked++;
      var similarity = gw.cosineSimilarity(Array.from(srcMem.emb), Array.from(tgtMem.emb));
      if (similarity > maxSimilaritySeen) maxSimilaritySeen = similarity;

      if (similarity >= SEMANTIC_THRESHOLD) {
        st.addEdge(
          'mem:' + srcMem.mem.id,
          'mem:' + tgtMem.mem.id,
          similarity, // Use similarity as weight (v0.9.7: replaces, doesn't accumulate)
          { type: 'semantic', similarity: similarity, event: eventType }
        );
        edgeCount++;
        semanticCount++;
        semanticEdgesCreated++;
      }
    }
  }

  // Always output semantic edge stats
  console.log('  [SEMANTIC] pairs=' + pairsChecked + ' maxSim=' + maxSimilaritySeen.toFixed(3) + ' threshold=' + SEMANTIC_THRESHOLD + ' edges=' + semanticEdgesCreated);

  return { edges: edgeCount };
}

// ============================================================================
// 7. Neural pattern extraction (v0.9.6: with embeddings, v0.9.7: better errors)
// ============================================================================
function extractNeuralPatterns(eventType) {
  var st = getStorage();
  var patternCount = 0;
  var memories = st.getRecentMemories(30);
  if (memories.length === 0) return { patterns: 0 };

  // Track what we've seen for dedup
  var seen = {};

  // Pattern type 1: File-type patterns (group by extension)
  var extCounts = {};
  for (var i = 0; i < memories.length; i++) {
    var content = memories[i].content || '';
    // Extract file references from content
    var extMatch = content.match(/\.([a-zA-Z]{1,8})\b/g);
    if (extMatch) {
      for (var e = 0; e < extMatch.length; e++) {
        var ext = extMatch[e].toLowerCase();
        extCounts[ext] = (extCounts[ext] || 0) + 1;
      }
    }
  }
  var extKeys = Object.keys(extCounts);
  for (var ei = 0; ei < extKeys.length; ei++) {
    if (extCounts[extKeys[ei]] >= 2) { // Appeared at least twice
      var patId = 'filetype:' + extKeys[ei];
      if (!seen[patId]) {
        seen[patId] = true;
        st.addNeuralPattern({
          id: patId,
          content: 'File type pattern: ' + extKeys[ei] + ' files edited ' + extCounts[extKeys[ei]] + ' times',
          category: 'filetype',
          confidence: Math.min(0.3 + extCounts[extKeys[ei]] * 0.1, 0.9),
          metadata: { count: extCounts[extKeys[ei]], ext: extKeys[ei] }
          // v0.9.6: embedding will be generated automatically by addNeuralPattern
        });
        patternCount++;
      }
    }
  }

  // Pattern type 2: Directory patterns (group by directory mentions)
  var dirCounts = {};
  for (var d = 0; d < memories.length; d++) {
    var memContent = memories[d].content || '';
    var dirMatch = memContent.match(/(?:in|from|at)\s+([a-zA-Z0-9_-]+)\//g);
    if (dirMatch) {
      for (var dm = 0; dm < dirMatch.length; dm++) {
        var dirName = dirMatch[dm].replace(/^(?:in|from|at)\s+/, '').replace('/', '');
        if (dirName.length > 1 && dirName.length < 50) {
          dirCounts[dirName] = (dirCounts[dirName] || 0) + 1;
        }
      }
    }
  }
  var dirKeys = Object.keys(dirCounts);
  for (var di = 0; di < dirKeys.length; di++) {
    if (dirCounts[dirKeys[di]] >= 2) {
      var dirPatId = 'directory:' + dirKeys[di];
      if (!seen[dirPatId]) {
        seen[dirPatId] = true;
        st.addNeuralPattern({
          id: dirPatId,
          content: 'Directory pattern: ' + dirKeys[di] + '/ accessed ' + dirCounts[dirKeys[di]] + ' times',
          category: 'directory',
          confidence: Math.min(0.3 + dirCounts[dirKeys[di]] * 0.1, 0.9),
          metadata: { count: dirCounts[dirKeys[di]], dir: dirKeys[di] }
        });
        patternCount++;
      }
    }
  }

  // Pattern type 3: Component patterns (detect repeated action types)
  var actionCounts = {};
  for (var a = 0; a < memories.length; a++) {
    var mType = memories[a].memory_type || 'general';
    actionCounts[mType] = (actionCounts[mType] || 0) + 1;
  }
  var actionKeys = Object.keys(actionCounts);
  for (var ai = 0; ai < actionKeys.length; ai++) {
    if (actionCounts[actionKeys[ai]] >= 3) {
      var actPatId = 'component:' + actionKeys[ai];
      if (!seen[actPatId]) {
        seen[actPatId] = true;
        st.addNeuralPattern({
          id: actPatId,
          content: 'Component pattern: ' + actionKeys[ai] + ' actions (' + actionCounts[actionKeys[ai]] + ' occurrences)',
          category: 'component',
          confidence: Math.min(0.4 + actionCounts[actionKeys[ai]] * 0.05, 0.95),
          metadata: { count: actionCounts[actionKeys[ai]], type: actionKeys[ai] }
        });
        patternCount++;
      }
    }
  }

  // Type 4: Pattern edges (pattern → memory, link patterns to the memories they came from)
  if (patternCount > 0 && memories.length > 0) {
    var seenPatterns = Object.keys(seen);
    for (var pi = 0; pi < Math.min(5, seenPatterns.length); pi++) {
      for (var mi = 0; mi < Math.min(3, memories.length); mi++) {
        st.addEdge(
          'pattern:' + seenPatterns[pi],
          'mem:' + memories[mi].id,
          0.5,
          { type: 'pattern', pattern_id: seenPatterns[pi] }
        );
      }
    }
  }

  return { patterns: patternCount };
}

// ============================================================================
// 8. Consolidation sweep (--event consolidate)
// v0.9.9: Also handles session-end consolidation with full stats sync
// ============================================================================
function handleConsolidate() {
  var st = getStorage();
  var results = { agents: 0, edges: 0, patterns: 0, stats_synced: false };

  // Register a consolidation agent
  st.registerAgent('consolidator', 'consolidate-' + Math.floor(Date.now() / 1000));
  results.agents++;

  // Create edges from all recent data
  var edgeResult = createEdgesFromEvent('consolidate');
  results.edges += edgeResult.edges;

  // Extract patterns from all recent data
  var patternResult = extractNeuralPatterns('consolidate');
  results.patterns += patternResult.patterns;

  // v0.9.8 FIX-027: Sync stats table after consolidation
  if (st.updateStats) {
    var statsResult = st.updateStats();
    if (statsResult) {
      results.stats_synced = true;
      console.log('  [STATS] FIX-027: Synced stats table');
      console.log('    memories=' + statsResult.memories + ' patterns=' + statsResult.patterns + ' edges=' + statsResult.edges);
      console.log('    embedding_dimension=' + statsResult.embedding_dimension + 'd');
    }
  }

  return results;
}

// ============================================================================
// 8b. Session end handler (--event session-end) - v0.9.9
// Triggers consolidation AND updates session stats
// ============================================================================
function handleSessionEnd() {
  var st = getStorage();
  var now = Math.floor(Date.now() / 1000);
  var results = { consolidated: false, stats_synced: false };

  // First run full consolidation
  var consolidateResults = handleConsolidate();
  results.consolidated = true;
  results.agents = consolidateResults.agents;
  results.edges = consolidateResults.edges;
  results.patterns = consolidateResults.patterns;

  // v0.9.9: Update session-end specific stats
  if (st.db) {
    try {
      var upsert = st.db.prepare('INSERT OR REPLACE INTO stats (key, value, updated_at) VALUES (?, ?, ?)');
      upsert.run('last_session_end', String(now), now);

      // Increment total_sessions counter
      var totalRow = st.db.prepare('SELECT value FROM stats WHERE key = ?').get('total_sessions');
      var totalSessions = totalRow ? (parseInt(totalRow.value) || 0) + 1 : 1;
      upsert.run('total_sessions', String(totalSessions), now);

      results.stats_synced = true;
      verboseLog('Session-end stats updated: total_sessions=' + totalSessions);
    } catch (e) {
      console.error('[POST-PROCESS] Failed to update session-end stats: ' + e.message);
    }
  }

  return results;
}

// ============================================================================
// 9. Event dispatch
// ============================================================================
var results = { agents: 0, edges: 0, patterns: 0, semantic_edges: 0 };

try {
  switch (event) {
    case 'session-start':
      var sessionResult = handleSessionStart();
      results.agents += sessionResult.agents;
      break;

    case 'session-end':
      // v0.9.9: Full session-end handling with consolidation + stats
      results = handleSessionEnd();
      break;

    case 'post-edit':
      var editEdges = createEdgesFromEvent('post-edit');
      results.edges += editEdges.edges;
      var editPatterns = extractNeuralPatterns('post-edit');
      results.patterns += editPatterns.patterns;
      break;

    case 'post-command':
      var cmdEdges = createEdgesFromEvent('post-command');
      results.edges += cmdEdges.edges;
      var cmdPatterns = extractNeuralPatterns('post-command');
      results.patterns += cmdPatterns.patterns;
      break;

    case 'pre-command':
      // v0.9.9: Pre-command handler (learning from command patterns)
      // Currently a no-op but allows for future command prediction
      verboseLog('Pre-command event received');
      break;

    case 'consolidate':
      results = handleConsolidate();
      break;

    default:
      console.error('post-process.js: Unknown event: ' + event);
      process.exit(1);
  }
} catch (e) {
  console.error('post-process.js: Error processing ' + event + ': ' + e.message);
  if (VERBOSE) {
    console.error(e.stack);
  }
  process.exit(1);
}

// ============================================================================
// 10. Summary output
// ============================================================================
var total = results.agents + results.edges + results.patterns;
console.log('post-process.js v0.9.8 [' + event + ']: ' + total + ' entities created');
console.log('  agents=' + results.agents + ' edges=' + results.edges + ' patterns=' + results.patterns);
if (results.stats_synced) {
  console.log('  stats_synced=true (FIX-027)');
}

// Close DB if using direct connection
if (storage && storage.close) {
  try { storage.close(); } catch (e) {}
}

process.exit(0);
