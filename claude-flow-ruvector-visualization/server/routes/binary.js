/**
 * Binary Data Routes
 *
 * Provides binary-format endpoints for efficient data transfer.
 * Returns TypedArrays instead of JSON for ~4x smaller payloads.
 */

import { existsSync } from 'fs';
import Database from 'better-sqlite3';

// FIX-002: Use environment variable or relative path instead of hardcoded absolute path
import path from 'path';
import { fileURLToPath } from 'url';
import { safeNumber, safeDivide } from '../utils/safe-number.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.INTELLIGENCE_DB || path.join(__dirname, '..', '..', '..', '.ruvector', 'intelligence.db');

/**
 * Handle binary position request
 * Returns Float32Array: [x1, y1, z1, x2, y2, z2, ...]
 */
export function handleBinaryPositions(req, res) {
  if (!existsSync(DB_PATH)) {
    res.writeHead(404);
    res.end('Database not found');
    return;
  }

  try {
    const db = new Database(DB_PATH, { readonly: true });

    // FIX-002: Check if table exists before querying, provide fallback data
    const tableExists = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='node_positions'
    `).get();

    if (!tableExists) {
      db.close();
      // Return empty buffer with informative status
      res.writeHead(501, { 'Content-Type': 'text/plain' });
      res.end('Pre-computed positions not available. Table node_positions does not exist.');
      return;
    }

    // Get all nodes with pre-computed positions
    const rows = db.prepare(`
      SELECT id, x, y, z FROM node_positions
      ORDER BY id
    `).all();

    db.close();

    // Create Float32Array buffer with sanitized values
    const buffer = new Float32Array(rows.length * 3);

    for (let i = 0; i < rows.length; i++) {
      buffer[i * 3] = safeNumber(rows[i].x, 0);
      buffer[i * 3 + 1] = safeNumber(rows[i].y, 0);
      buffer[i * 3 + 2] = safeNumber(rows[i].z, 0);
    }

    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': buffer.byteLength
    });
    res.end(Buffer.from(buffer.buffer));

  } catch (err) {
    // Fallback: compute positions from UMAP if not pre-computed
    res.writeHead(501);
    res.end('Pre-computed positions not available. Use /api/graph instead.');
  }
}

/**
 * Handle binary edge request
 * Returns Uint32Array: [source1, target1, source2, target2, ...]
 */
export function handleBinaryEdges(req, res) {
  if (!existsSync(DB_PATH)) {
    res.writeHead(404);
    res.end('Database not found');
    return;
  }

  try {
    const db = new Database(DB_PATH, { readonly: true });

    // FIX-002: Check if table exists before querying
    const tableExists = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='edge_indices'
    `).get();

    if (!tableExists) {
      db.close();
      res.writeHead(501, { 'Content-Type': 'text/plain' });
      res.end('Binary edge data not available. Table edge_indices does not exist.');
      return;
    }

    // Get edges
    const rows = db.prepare(`
      SELECT source_idx, target_idx FROM edge_indices
      ORDER BY rowid
    `).all();

    db.close();

    // Create Uint32Array buffer
    const buffer = new Uint32Array(rows.length * 2);

    for (let i = 0; i < rows.length; i++) {
      buffer[i * 2] = rows[i].source_idx;
      buffer[i * 2 + 1] = rows[i].target_idx;
    }

    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': buffer.byteLength
    });
    res.end(Buffer.from(buffer.buffer));

  } catch (err) {
    res.writeHead(501);
    res.end('Binary edge data not available');
  }
}

/**
 * Handle binary colors request
 * Returns Float32Array: [r1, g1, b1, r2, g2, b2, ...] normalized 0-1
 */
export function handleBinaryColors(req, res) {
  if (!existsSync(DB_PATH)) {
    res.writeHead(404);
    res.end('Database not found');
    return;
  }

  try {
    const db = new Database(DB_PATH, { readonly: true });

    // FIX-002: Check if table exists before querying
    const tableExists = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='node_colors'
    `).get();

    if (!tableExists) {
      db.close();
      res.writeHead(501, { 'Content-Type': 'text/plain' });
      res.end('Binary color data not available. Table node_colors does not exist.');
      return;
    }

    const rows = db.prepare(`
      SELECT color FROM node_colors
      ORDER BY node_id
    `).all();

    db.close();

    const buffer = new Float32Array(rows.length * 3);

    for (let i = 0; i < rows.length; i++) {
      const hex = rows[i].color || 0x6B2FB5;
      buffer[i * 3] = ((hex >> 16) & 0xFF) / 255;
      buffer[i * 3 + 1] = ((hex >> 8) & 0xFF) / 255;
      buffer[i * 3 + 2] = (hex & 0xFF) / 255;
    }

    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': buffer.byteLength
    });
    res.end(Buffer.from(buffer.buffer));

  } catch (err) {
    res.writeHead(501);
    res.end('Binary color data not available');
  }
}

/**
 * Handle graph metadata request
 * Returns node/edge counts for chunked loading
 */
export function handleGraphMetadata(req, res) {
  if (!existsSync(DB_PATH)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Database not found' }));
    return;
  }

  try {
    const db = new Database(DB_PATH, { readonly: true });

    // Use safeNumber to prevent NaN/null propagation
    const memCount = safeNumber(db.prepare('SELECT COUNT(*) as c FROM memories').get()?.c, 0);

    // neural_patterns table may not exist - handle gracefully
    let neuralCount = 0;
    try {
      const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='neural_patterns'").get();
      if (tableCheck) {
        neuralCount = safeNumber(db.prepare('SELECT COUNT(*) as c FROM neural_patterns').get()?.c, 0);
      }
    } catch (e) { /* table may not exist */ }

    const qCount = safeNumber(db.prepare('SELECT COUNT(*) as c FROM patterns').get()?.c, 0);
    const trajCount = safeNumber(db.prepare('SELECT COUNT(*) as c FROM trajectories').get()?.c, 0);

    // Compute totalNodes with sanitized values
    const totalNodes = safeNumber(memCount + neuralCount + qCount + trajCount, 0);

    // Rough edge estimate based on typical density - use safeNumber for safety
    const estimatedEdges = safeNumber(Math.min(totalNodes * 15, 100000), 0);

    db.close();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      totalNodes,
      totalEdges: estimatedEdges,
      breakdown: {
        memories: memCount,
        neuralPatterns: neuralCount,
        qPatterns: qCount,
        trajectories: trajCount
      }
    }));

  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

/**
 * Handle cluster data request
 * Returns pre-computed clusters for a given level
 */
export function handleClusterData(req, res, level = 0) {
  if (!existsSync(DB_PATH)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Database not found' }));
    return;
  }

  try {
    const db = new Database(DB_PATH, { readonly: true });

    // FIX-002: Check if clusters table exists before querying
    const tableExists = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='clusters'
    `).get();

    if (!tableExists) {
      db.close();
      res.writeHead(501, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Pre-computed clusters not available',
        hint: 'Table clusters does not exist. Run server/compute/precompute-layout.js to generate.'
      }));
      return;
    }

    // Try to get pre-computed clusters
    const clusters = db.prepare(`
      SELECT
        id,
        x,
        y,
        z,
        node_count,
        radius,
        dominant_source,
        dominant_namespace
      FROM clusters
      WHERE level = ?
    `).all(level);

    db.close();

    if (clusters.length === 0) {
      res.writeHead(501, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Pre-computed clusters not available for this level',
        hint: 'Run server/compute/precompute-layout.js to generate'
      }));
      return;
    }

    // Sanitize cluster numeric values
    const sanitizedClusters = clusters.map(c => ({
      id: c.id,
      x: safeNumber(c.x, 0),
      y: safeNumber(c.y, 0),
      z: safeNumber(c.z, 0),
      node_count: safeNumber(c.node_count, 0),
      radius: safeNumber(c.radius, 0),
      dominant_source: c.dominant_source,
      dominant_namespace: c.dominant_namespace
    }));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ level: safeNumber(level, 0), clusters: sanitizedClusters }));

  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

export default {
  handleBinaryPositions,
  handleBinaryEdges,
  handleBinaryColors,
  handleGraphMetadata,
  handleClusterData
};
