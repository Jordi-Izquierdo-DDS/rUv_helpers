#!/usr/bin/env node
/**
 * sona-consolidate.js - SONA Dream Cycle Consolidation
 * v0.9.9 FIX-030: Bridge neural_patterns → compressed_patterns via SONA
 *
 * This script triggers SONA's dream cycle compression, which:
 * 1. Reads neural_patterns from intelligence.db
 * 2. Passes them through SONA's storePattern()
 * 3. Triggers forceLearn() to compress patterns
 * 4. Stores results in compressed_patterns table
 *
 * FIX-030 improvements:
 * - Schema-aware stats update (adds updated_at column if missing)
 * - Comprehensive stats: total_neural_patterns, total_edges, sona_patterns_compressed
 * - Uses correct timestamp types (Unix integer for updated_at, ISO string for values)
 * - Both SONA and direct compression paths now update stats consistently
 *
 * Usage:
 *   node scripts/sona-consolidate.js [--verbose]
 *
 * Called by:
 *   - session-end hook (ruvector-hook-bridge.sh)
 *   - Manual consolidation
 *   - Daemon consolidate worker
 */

const fs = require('fs');
const path = require('path');

const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');
const log = (msg) => VERBOSE && console.log(`[sona-consolidate] ${msg}`);
const info = (msg) => console.log(`[sona-consolidate] ${msg}`);

// Simple 384d hash embedding for neural patterns without embeddings
function hashEmbed384(text) {
  const dim = 384;
  const embedding = new Float32Array(dim);
  const str = String(text || '').toLowerCase();
  for (let pass = 0; pass < 5; pass++) {
    for (let i = 0; i < str.length; i++) {
      const idx = ((i * 31 + str.charCodeAt(i) * 127 + pass * 17) % dim + dim) % dim;
      embedding[idx] += (1.0 / (pass + 1)) * (str.charCodeAt(i) / 128.0 - 0.5);
    }
  }
  let norm = 0;
  for (let j = 0; j < dim; j++) norm += embedding[j] * embedding[j];
  norm = Math.sqrt(norm) || 1;
  for (let k = 0; k < dim; k++) embedding[k] /= norm;
  return Buffer.from(embedding.buffer);
}

// Find database path
const DB_PATHS = [
  '.ruvector/intelligence.db',
  'data/intelligence.db',
  '.swarm/memory.db'
];

function findDbPath() {
  for (const p of DB_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return '.ruvector/intelligence.db'; // Default
}

async function main() {
  const dbPath = findDbPath();
  log(`Using database: ${dbPath}`);

  // Load better-sqlite3
  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (e) {
    console.error('[sona-consolidate] ERROR: better-sqlite3 not installed');
    process.exit(1);
  }

  // Check if DB exists
  if (!fs.existsSync(dbPath)) {
    info('No database found, skipping SONA consolidation');
    process.exit(0);
  }

  const db = new Database(dbPath);

  // Ensure compressed_patterns table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS compressed_patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      layer TEXT NOT NULL,
      data BLOB,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(layer)
    )
  `);

  // Get neural patterns that haven't been compressed
  const existingLayers = db.prepare(`SELECT layer FROM compressed_patterns`).all().map(r => r.layer);

  // Check if pattern_type column exists (some schemas use category only)
  const columns = db.prepare('PRAGMA table_info(neural_patterns)').all().map(c => c.name);
  const hasPatternType = columns.includes('pattern_type');

  const patterns = db.prepare(`
    SELECT id, content, embedding, category${hasPatternType ? ', pattern_type' : ''}, confidence
    FROM neural_patterns
  `).all();

  if (patterns.length === 0) {
    log('No neural patterns to compress');
    db.close();
    process.exit(0);
  }

  // FIX: Generate embeddings for neural_patterns that don't have them
  const missingEmbeddings = patterns.filter(p => !p.embedding);
  if (missingEmbeddings.length > 0) {
    log(`Generating embeddings for ${missingEmbeddings.length} neural patterns...`);
    const update = db.prepare('UPDATE neural_patterns SET embedding = ? WHERE id = ?');
    for (const pat of missingEmbeddings) {
      const emb = hashEmbed384(pat.content + ' ' + (pat.category || ''));
      update.run(emb, pat.id);
    }
    log(`Generated ${missingEmbeddings.length} neural pattern embeddings`);
    // Re-fetch patterns with embeddings
    patterns.length = 0;
    const refetched = db.prepare(`
      SELECT id, content, embedding, category${hasPatternType ? ', pattern_type' : ''}, confidence
      FROM neural_patterns
    `).all();
    patterns.push(...refetched);
  }

  // Load SONA engine (try shim first, then fallback)
  let SonaEngine;
  const sonaShimPath = path.join(process.cwd(), 'packages/sona-shim/index.js');
  const sonaFallbackPath = path.join(process.cwd(), 'packages/sona-fallback/index.js');

  try {
    if (fs.existsSync(sonaShimPath)) {
      const shim = require(sonaShimPath);
      SonaEngine = shim.SonaEngine || shim.SonaFallback || shim.default;
      log('Loaded SONA via shim');
    } else if (fs.existsSync(sonaFallbackPath)) {
      const fallback = require(sonaFallbackPath);
      SonaEngine = fallback.SonaFallback || fallback.SonaEngine || fallback.default;
      log('Loaded SONA fallback');
    } else {
      // Try native @ruvector/sona
      try {
        const native = require('@ruvector/sona');
        SonaEngine = native.SonaEngine || native.default;
        log('Loaded native @ruvector/sona');
      } catch (e) {
        throw new Error('No SONA implementation found');
      }
    }
  } catch (e) {
    info(`SONA not available: ${e.message}`);
    info('Falling back to direct pattern compression...');

    // Direct compression without SONA
    directCompression(db, patterns, existingLayers);
    db.close();
    process.exit(0);
  }

  // Initialize SONA
  let sona;
  try {
    sona = new SonaEngine({
      dimensions: 384,
      learningRate: 0.01,
      maxPatterns: 1000,
      dbPath: dbPath
    });
    log('SONA engine initialized');
  } catch (e) {
    // Try alternative constructor signature
    try {
      sona = new SonaEngine(384, 0.01, 1000);
      log('SONA engine initialized (legacy signature)');
    } catch (e2) {
      info(`SONA init failed: ${e2.message}`);
      directCompression(db, patterns, existingLayers);
      db.close();
      process.exit(0);
    }
  }

  // Process patterns through SONA
  let stored = 0;
  for (const pat of patterns) {
    const layerId = `neural-${pat.id}`;

    // Skip if already compressed
    if (existingLayers.includes(layerId)) {
      log(`Skipping already compressed: ${layerId}`);
      continue;
    }

    // Parse embedding
    let embedding;
    if (pat.embedding) {
      if (Buffer.isBuffer(pat.embedding)) {
        embedding = new Float32Array(pat.embedding.buffer, pat.embedding.byteOffset, pat.embedding.length / 4);
      } else if (Array.isArray(pat.embedding)) {
        embedding = new Float32Array(pat.embedding);
      } else {
        // Try JSON parse
        try {
          const arr = JSON.parse(pat.embedding);
          embedding = new Float32Array(arr);
        } catch (e) {
          embedding = new Float32Array(384).fill(0.1);
        }
      }
    } else {
      embedding = new Float32Array(384).fill(0.1);
    }

    // Store in SONA
    try {
      sona.storePattern(layerId, embedding, {
        category: pat.category || pat.pattern_type || 'unknown',
        content: pat.content,
        confidence: pat.confidence,
        originalId: pat.id
      });
      stored++;
      log(`Stored pattern: ${layerId}`);
    } catch (e) {
      log(`Failed to store ${layerId}: ${e.message}`);
    }
  }

  // Trigger dream cycle compression
  if (stored > 0) {
    try {
      if (typeof sona.forceLearn === 'function') {
        sona.forceLearn();
        log('SONA forceLearn() completed');
      } else if (typeof sona.compress === 'function') {
        sona.compress();
        log('SONA compress() completed');
      } else if (typeof sona.dreamCycle === 'function') {
        sona.dreamCycle();
        log('SONA dreamCycle() completed');
      }
    } catch (e) {
      log(`Dream cycle error: ${e.message}`);
    }
  }

  // Get SONA stats
  let stats = { patterns_stored: stored };
  try {
    if (typeof sona.getStats === 'function') {
      stats = sona.getStats();
    }
  } catch (e) {}

  // Close SONA
  try {
    if (typeof sona.close === 'function') {
      sona.close();
    }
  } catch (e) {}

  // Update stats table (handle both old and new schema)
  // FIX-030: Use correct timestamp types and comprehensive stats update
  const nowIso = new Date().toISOString();
  const nowUnix = Math.floor(Date.now() / 1000);

  // Check if stats table has updated_at column and add if missing
  const statsColumns = db.prepare('PRAGMA table_info(stats)').all().map(c => c.name);
  let hasUpdatedAt = statsColumns.includes('updated_at');

  if (!hasUpdatedAt) {
    try {
      db.exec('ALTER TABLE stats ADD COLUMN updated_at INTEGER');
      hasUpdatedAt = true;
      log('Added updated_at column to stats table');
    } catch (e) { /* column may already exist */ }
  }

  try {
    // FIX-030: Gather comprehensive stats from tables
    const totalNeuralPatterns = db.prepare('SELECT COUNT(*) as c FROM neural_patterns').get().c || 0;
    const totalEdges = db.prepare('SELECT COUNT(*) as c FROM edges').get().c || 0;
    const totalCompressed = db.prepare('SELECT COUNT(*) as c FROM compressed_patterns').get().c || 0;

    const upsert = db.prepare(`
      INSERT INTO stats (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);

    // Update all relevant stats
    upsert.run('sona_last_dream_cycle', nowIso, nowUnix);
    upsert.run('sona_patterns_compressed', String(totalCompressed), nowUnix);
    upsert.run('last_consolidate', nowIso, nowUnix);
    upsert.run('total_neural_patterns', String(totalNeuralPatterns), nowUnix);
    upsert.run('total_edges', String(totalEdges), nowUnix);

    log(`Stats updated: neural_patterns=${totalNeuralPatterns} edges=${totalEdges} compressed=${totalCompressed}`);
  } catch (e) {
    log(`Stats update error: ${e.message}`);
  }

  db.close();

  info(`Dream cycle complete: ${stored} patterns processed`);
  if (stats.patterns_stored !== undefined) {
    info(`SONA stats: ${JSON.stringify(stats)}`);
  }
}

/**
 * Direct compression fallback when SONA is unavailable
 */
function directCompression(db, patterns, existingLayers) {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO compressed_patterns (layer, data, metadata, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `);

  let stored = 0;
  for (const pat of patterns) {
    const layerId = `neural-${pat.id}`;
    if (existingLayers.includes(layerId)) continue;

    // Simple compression: store pattern data as JSON blob
    const metadata = JSON.stringify({
      category: pat.category || 'unknown',
      pattern_type: pat.pattern_type || pat.category || 'unknown',
      confidence: pat.confidence,
      compressed_at: new Date().toISOString(),
      method: 'direct'
    });

    // Store embedding as binary blob
    let data = null;
    if (pat.embedding) {
      if (Buffer.isBuffer(pat.embedding)) {
        data = pat.embedding;
      } else if (Array.isArray(pat.embedding)) {
        data = Buffer.from(new Float32Array(pat.embedding).buffer);
      }
    }

    try {
      insert.run(layerId, data, metadata);
      stored++;
    } catch (e) {
      // Ignore duplicates
    }
  }

  info(`Direct compression: ${stored} patterns stored`);

  // FIX-030: Update stats comprehensively after direct compression
  const nowIso = new Date().toISOString();
  const nowUnix = Math.floor(Date.now() / 1000);

  // Ensure updated_at column exists
  const statsColumns = db.prepare('PRAGMA table_info(stats)').all().map(c => c.name);
  if (!statsColumns.includes('updated_at')) {
    try {
      db.exec('ALTER TABLE stats ADD COLUMN updated_at INTEGER');
    } catch (e) { /* ignore */ }
  }

  try {
    // Gather actual counts
    const totalNeuralPatterns = db.prepare('SELECT COUNT(*) as c FROM neural_patterns').get().c || 0;
    const totalEdges = db.prepare('SELECT COUNT(*) as c FROM edges').get().c || 0;
    const totalCompressed = db.prepare('SELECT COUNT(*) as c FROM compressed_patterns').get().c || 0;

    const upsert = db.prepare(`
      INSERT INTO stats (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);

    upsert.run('last_consolidate', nowIso, nowUnix);
    upsert.run('sona_last_dream_cycle', nowIso, nowUnix);
    upsert.run('sona_patterns_compressed', String(totalCompressed), nowUnix);
    upsert.run('total_neural_patterns', String(totalNeuralPatterns), nowUnix);
    upsert.run('total_edges', String(totalEdges), nowUnix);
  } catch (e) { /* ignore stats errors */ }
}

main().catch(err => {
  console.error('[sona-consolidate] Error:', err.message);
  process.exit(1);
});
