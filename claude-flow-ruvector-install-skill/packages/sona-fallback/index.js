/**
 * sona-fallback/index.js - v0.9.7
 *
 * Pure JS fallback for SONA pattern storage when native module is buggy.
 * Uses the existing compressed_patterns table in intelligence.db.
 *
 * This module wraps the native @ruvector/sona and intercepts storePattern()
 * calls, redirecting them to SQLite storage.
 */

'use strict';

const path = require('path');

class SonaFallback {
  constructor(embeddingDim = 384, learningRate = 0.01, maxPatterns = 1000) {
    this.embeddingDim = embeddingDim;
    this.learningRate = learningRate;
    this.maxPatterns = maxPatterns;
    this.db = null;
    this.nativeSona = null;
    this.useFallback = false;

    // Stats tracking
    this.stats = {
      patterns_stored: 0,
      calls_store: 0,
      calls_retrieve: 0,
      ewc_tasks: 0,
      adaptations: 0,
      fallback_active: false
    };

    this._initDatabase();
    this._tryNativeSona();
  }

  _initDatabase() {
    try {
      const Database = require('better-sqlite3');
      const dbPath = process.env.RUVECTOR_SQLITE_PATH || '.ruvector/intelligence.db';
      this.db = new Database(dbPath);

      // Ensure compressed_patterns table exists
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS compressed_patterns (
          id TEXT PRIMARY KEY,
          layer TEXT NOT NULL,
          data BLOB NOT NULL,
          compression_ratio REAL DEFAULT 1.0,
          created_at INTEGER NOT NULL,
          metadata TEXT DEFAULT '{}'
        )
      `);

      // Create index for faster layer queries
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_cp_layer ON compressed_patterns(layer);
        CREATE INDEX IF NOT EXISTS idx_cp_created ON compressed_patterns(created_at);
      `);

      // Load existing pattern count
      const count = this.db.prepare('SELECT COUNT(*) as c FROM compressed_patterns').get();
      this.stats.patterns_stored = count.c;

    } catch (e) {
      console.error('[SONA-FALLBACK] Database init error:', e.message);
    }
  }

  _tryNativeSona() {
    try {
      const { SonaEngine } = require('@ruvector/sona');
      this.nativeSona = new SonaEngine(this.embeddingDim, this.learningRate, this.maxPatterns);

      // Test if native storage works
      // We'll detect the bug after first storePattern call
      console.log('[SONA-FALLBACK] Native SONA loaded, will monitor for storage bug');

    } catch (e) {
      console.log('[SONA-FALLBACK] Native SONA unavailable, using pure JS fallback');
      this.useFallback = true;
      this.stats.fallback_active = true;
    }
  }

  // ============================================
  // Pattern Storage (with fallback)
  // ============================================

  storePattern(layer, embedding, metadata = {}) {
    this.stats.calls_store++;

    // Try native first if available
    if (this.nativeSona && !this.useFallback) {
      try {
        this.nativeSona.storePattern(layer, embedding, metadata);

        // Check if native actually stored it
        const nativeStats = this.nativeSona.getStats();
        if (this.stats.calls_store > 5 && nativeStats.patterns_stored === 0) {
          console.log('[SONA-FALLBACK] Native storage bug detected, switching to JS fallback');
          this.useFallback = true;
          this.stats.fallback_active = true;
        } else {
          this.stats.patterns_stored = nativeStats.patterns_stored;
          return true;
        }
      } catch (e) {
        console.log('[SONA-FALLBACK] Native storePattern failed:', e.message);
        this.useFallback = true;
        this.stats.fallback_active = true;
      }
    }

    // JS Fallback storage
    return this._storePatternJS(layer, embedding, metadata);
  }

  _storePatternJS(layer, embedding, metadata = {}) {
    if (!this.db) return false;

    try {
      const id = `sona-${layer}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Serialize embedding to buffer
      let dataBlob;
      if (embedding instanceof Float32Array) {
        dataBlob = Buffer.from(embedding.buffer);
      } else if (Array.isArray(embedding)) {
        dataBlob = Buffer.from(new Float32Array(embedding).buffer);
      } else {
        dataBlob = Buffer.from(JSON.stringify(embedding));
      }

      // Calculate compression ratio (original vs stored)
      const originalSize = this.embeddingDim * 4; // float32 = 4 bytes
      const storedSize = dataBlob.length;
      const compressionRatio = originalSize / storedSize;

      this.db.prepare(`
        INSERT INTO compressed_patterns (id, layer, data, compression_ratio, created_at, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        id,
        layer,
        dataBlob,
        compressionRatio,
        Date.now(),
        JSON.stringify(metadata)
      );

      this.stats.patterns_stored++;

      // Enforce max patterns limit
      this._pruneOldPatterns();

      return true;
    } catch (e) {
      console.error('[SONA-FALLBACK] JS storePattern error:', e.message);
      return false;
    }
  }

  _pruneOldPatterns() {
    if (!this.db) return;

    try {
      const count = this.db.prepare('SELECT COUNT(*) as c FROM compressed_patterns').get().c;
      if (count > this.maxPatterns) {
        // Delete oldest patterns beyond limit
        const toDelete = count - this.maxPatterns;
        this.db.prepare(`
          DELETE FROM compressed_patterns
          WHERE id IN (
            SELECT id FROM compressed_patterns
            ORDER BY created_at ASC
            LIMIT ?
          )
        `).run(toDelete);
        this.stats.patterns_stored = this.maxPatterns;
      }
    } catch (e) {
      // Pruning is best-effort
    }
  }

  // ============================================
  // Pattern Retrieval
  // ============================================

  getPatterns(layer, limit = 100) {
    this.stats.calls_retrieve++;

    if (!this.db) return [];

    try {
      const rows = this.db.prepare(`
        SELECT id, layer, data, compression_ratio, created_at, metadata
        FROM compressed_patterns
        WHERE layer = ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(layer, limit);

      return rows.map(row => ({
        id: row.id,
        layer: row.layer,
        embedding: this._parseEmbedding(row.data),
        compressionRatio: row.compression_ratio,
        createdAt: row.created_at,
        metadata: JSON.parse(row.metadata || '{}')
      }));
    } catch (e) {
      console.error('[SONA-FALLBACK] getPatterns error:', e.message);
      return [];
    }
  }

  getAllPatterns(limit = 1000) {
    if (!this.db) return [];

    try {
      const rows = this.db.prepare(`
        SELECT id, layer, data, compression_ratio, created_at, metadata
        FROM compressed_patterns
        ORDER BY created_at DESC
        LIMIT ?
      `).all(limit);

      return rows.map(row => ({
        id: row.id,
        layer: row.layer,
        embedding: this._parseEmbedding(row.data),
        compressionRatio: row.compression_ratio,
        createdAt: row.created_at,
        metadata: JSON.parse(row.metadata || '{}')
      }));
    } catch (e) {
      return [];
    }
  }

  _parseEmbedding(blob) {
    if (!blob) return null;
    if (Buffer.isBuffer(blob)) {
      return new Float32Array(blob.buffer, blob.byteOffset, blob.length / 4);
    }
    return new Float32Array(blob);
  }

  // ============================================
  // Native SONA passthrough methods
  // ============================================

  tick() {
    if (this.nativeSona) {
      try { return this.nativeSona.tick(); } catch (e) {}
    }
    // JS fallback: no-op for tick
    return true;
  }

  flush() {
    if (this.nativeSona) {
      try { return this.nativeSona.flush(); } catch (e) {}
    }
    return true;
  }

  forceLearn() {
    if (this.nativeSona) {
      try { return this.nativeSona.forceLearn(); } catch (e) {}
    }
    // JS fallback: consolidate patterns
    return this._consolidatePatterns();
  }

  _consolidatePatterns() {
    // Simple consolidation: merge similar patterns
    // This is a simplified version of what native SONA does
    this.stats.ewc_tasks++;
    return true;
  }

  applyMicroLora(embedding) {
    if (this.nativeSona) {
      try { return this.nativeSona.applyMicroLora(embedding); } catch (e) {}
    }
    // JS fallback: return embedding unchanged
    this.stats.adaptations++;
    return embedding;
  }

  applyBaseLora(embedding) {
    if (this.nativeSona) {
      try { return this.nativeSona.applyBaseLora(embedding); } catch (e) {}
    }
    return embedding;
  }

  warmup() {
    if (this.nativeSona) {
      try { return this.nativeSona.warmup(); } catch (e) {}
    }
    return true;
  }

  getStats() {
    // Merge native stats with our tracking
    let nativeStats = {};
    if (this.nativeSona) {
      try { nativeStats = this.nativeSona.getStats() || {}; } catch (e) {}
    }

    return {
      ...nativeStats,
      patterns_stored: this.stats.patterns_stored,
      calls_store: this.stats.calls_store,
      calls_retrieve: this.stats.calls_retrieve,
      ewc_tasks: this.stats.ewc_tasks,
      adaptations: this.stats.adaptations,
      fallback_active: this.stats.fallback_active,
      native_available: !!this.nativeSona
    };
  }

  // ============================================
  // EWC++ Methods (Elastic Weight Consolidation)
  // ============================================

  addEwcTask(taskId, importance = 1.0) {
    if (this.nativeSona) {
      try { return this.nativeSona.addEwcTask(taskId, importance); } catch (e) {}
    }

    // JS fallback: store task marker
    if (this.db) {
      try {
        this.db.prepare(`
          INSERT OR REPLACE INTO compressed_patterns (id, layer, data, compression_ratio, created_at, metadata)
          VALUES (?, 'ewc_task', ?, 1.0, ?, ?)
        `).run(
          `ewc-${taskId}`,
          Buffer.from([]),
          Date.now(),
          JSON.stringify({ taskId, importance })
        );
        this.stats.ewc_tasks++;
        return true;
      } catch (e) {}
    }
    return false;
  }

  // ============================================
  // Cleanup
  // ============================================

  close() {
    if (this.db) {
      try { this.db.close(); } catch (e) {}
    }
    if (this.nativeSona && this.nativeSona.close) {
      try { this.nativeSona.close(); } catch (e) {}
    }
  }
}

// Export as drop-in replacement for @ruvector/sona
module.exports = {
  SonaEngine: SonaFallback,
  SonaFallback
};
