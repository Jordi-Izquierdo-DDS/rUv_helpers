/**
 * Extract RuVector v3 data for cosmos.gl visualization
 *
 * Reads from metadata.db and creates:
 * 1. Nodes (memory entries with v3 features)
 * 2. Edges (similarity relationships)
 * 3. 2D positions via UMAP dimensionality reduction
 * 4. SONA and intelligence stats
 */

import Database from 'better-sqlite3';
import { UMAP } from 'umap-js';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import path from 'path';

// Safe number utilities to prevent NaN/null values in output
/**
 * Safely convert a value to a number, returning fallback if invalid
 * @param {*} value - The value to convert
 * @param {number} fallback - Fallback value if conversion fails (default: 0)
 * @returns {number} A valid finite number
 */
function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined) return fallback;
  const num = Number(value);
  return isNaN(num) || !isFinite(num) ? fallback : num;
}

/**
 * Safely divide two numbers, returning fallback if result would be invalid
 * @param {number} num - Numerator
 * @param {number} denom - Denominator
 * @param {number} fallback - Fallback value if division is invalid (default: 0)
 * @returns {number} A valid finite number
 */
function safeDivide(num, denom, fallback = 0) {
  const safeNum = safeNumber(num, fallback);
  const safeDenom = safeNumber(denom, 0);
  if (safeDenom === 0 || !isFinite(safeNum) || !isFinite(safeDenom)) return fallback;
  const result = safeNum / safeDenom;
  return isNaN(result) || !isFinite(result) ? fallback : result;
}

/**
 * Sanitize an object to replace NaN/Infinity with safe values before JSON serialization
 * @param {*} obj - Object to sanitize
 * @param {number} fallback - Fallback value for invalid numbers (default: 0)
 * @returns {*} Sanitized object
 */
function sanitizeForJSON(obj, fallback = 0) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'number') {
    return isNaN(obj) || !isFinite(obj) ? fallback : obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForJSON(item, fallback));
  }
  if (typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = sanitizeForJSON(value, fallback);
    }
    return result;
  }
  return obj;
}

// FIX-001: Use environment variable or relative path instead of hardcoded absolute path
const RUVECTOR_PATH = process.env.RUVECTOR_PATH || path.join(path.dirname(new URL(import.meta.url).pathname), '..', '.ruvector');
const INTELLIGENCE_DB = process.env.INTELLIGENCE_DB || path.join(RUVECTOR_PATH, 'intelligence.db');
const OUTPUT_FILE = './public/graph-data.json';
// FIX-010: intelligence.json is DELETED. All data now in intelligence.db
// const INTELLIGENCE_JSON = path.join(RUVECTOR_PATH, 'intelligence.json');
const SONA_STATE_JSON = path.join(RUVECTOR_PATH, 'sona-state.json');

// Cosine similarity between two vectors (returns 0 for zero vectors to avoid NaN)
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;

  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    const aVal = safeNumber(a[i], 0);
    const bVal = safeNumber(b[i], 0);
    dotProduct += aVal * bVal;
    normA += aVal * aVal;
    normB += bVal * bVal;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return safeDivide(dotProduct, denominator, 0);
}

// Namespace/source to color mapping
function namespaceToColor(namespace, source) {
  // Source-based colors for v3 patterns
  if (source === 'neural_pattern') {
    return '#E91E63';  // Pink for neural patterns (v3 imported)
  }

  const colors = {
    'action': '#4CAF50',        // Green
    'file_access': '#2196F3',   // Blue
    'search_pattern': '#9C27B0', // Purple
    'agent_spawn': '#FF9800',   // Orange
    'project': '#00BCD4',       // Cyan
    'error': '#F44336',         // Red
    'veracy': '#4CAF50',
    'veracy/maintenance': '#2196F3',
    'roo-cline': '#9C27B0',
    'architect': '#FF9800',
    'default': '#607D8B'
  };

  // Find matching namespace
  for (const [ns, color] of Object.entries(colors)) {
    if (namespace && namespace.startsWith(ns)) return color;
  }
  return '#888888';
}

// Load v3 SONA and intelligence stats
function loadV3Stats() {
  const stats = {
    sona: null,
    intelligence: null,
    version: 'v3'
  };

  // Load SONA state if available
  if (existsSync(SONA_STATE_JSON)) {
    try {
      const sonaData = JSON.parse(readFileSync(SONA_STATE_JSON, 'utf8'));
      stats.sona = {
        trajectoriesRecorded: safeNumber(sonaData.trajectoriesRecorded, 0),
        microLoraUpdates: safeNumber(sonaData.microLoraUpdates, 0),
        baseLoraUpdates: safeNumber(sonaData.baseLoraUpdates, 0),
        ewcConsolidations: safeNumber(sonaData.ewcConsolidations, 0),
        patternsLearned: safeNumber(sonaData.patternsLearned, 0)
      };
      console.log('✓ SONA stats loaded');
    } catch (e) {
      console.warn('Failed to load SONA stats:', e.message);
    }
  }

  // FIX-010: intelligence.json is DELETED. All data now in intelligence.db (SQLite).
  // Stats are loaded from the database directly by server.js.

  return stats;
}

async function extractData() {
  console.log('Opening RuVector intelligence database...');

  if (!existsSync(INTELLIGENCE_DB)) {
    console.error(`Database not found: ${INTELLIGENCE_DB}`);
    process.exit(1);
  }

  const db = new Database(INTELLIGENCE_DB, { readonly: true });

  // Get neural_patterns (v3 imported patterns) and memories
  console.log('Reading neural_patterns and memories...');

  // FIX-014: Check if neural_patterns table exists and has expected columns
  let neuralPatterns = [];
  try {
    const tableCheck = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='neural_patterns'
    `).get();

    if (tableCheck) {
      // Check column names dynamically to handle schema variations
      const columnsInfo = db.prepare('PRAGMA table_info(neural_patterns)').all();
      const columnNames = columnsInfo.map(c => c.name);

      // Determine correct column mappings
      const contentCol = columnNames.includes('content') ? 'content' :
                         columnNames.includes('value') ? 'value' : 'id';
      const typeCol = columnNames.includes('type') ? 'type' :
                      columnNames.includes('namespace') ? 'namespace' : "'unknown'";

      neuralPatterns = db.prepare(`
        SELECT id, ${contentCol} as value, ${typeCol} as namespace, embedding
        FROM neural_patterns
        WHERE embedding IS NOT NULL
      `).all();
    } else {
      console.warn('neural_patterns table does not exist, skipping...');
    }
  } catch (e) {
    console.warn('Error reading neural_patterns:', e.message);
  }

  // Read memories
  const memories = db.prepare(`
    SELECT id, content as value, memory_type as namespace, embedding
    FROM memories
    WHERE embedding IS NOT NULL AND LENGTH(embedding) > 0
  `).all();

  // Combine both sources and deduplicate by content
  const seenContent = new Set();
  const allEntries = [
    ...neuralPatterns.map(p => ({ ...p, key: p.id, source: 'neural_pattern' })),
    ...memories.map(m => ({ ...m, key: m.id, source: 'memory' }))
  ];

  // Deduplicate by content to avoid UMAP issues
  const entries = allEntries.filter(e => {
    const content = (e.value || '').trim();
    if (!content || seenContent.has(content)) return false;
    seenContent.add(content);
    return true;
  });

  console.log(`  Neural patterns: ${neuralPatterns.length}`);
  console.log(`  Memories: ${memories.length}`);
  console.log(`  After deduplication: ${entries.length}`);

  console.log(`Found ${entries.length} entries`);

  // Parse embeddings and create nodes
  const nodes = [];
  const embeddings = [];
  const namespaces = new Set();

  for (const entry of entries) {
    try {
      const embedding = new Float32Array(entry.embedding.buffer);
      embeddings.push(Array.from(embedding));
      namespaces.add(entry.source || entry.namespace);

      nodes.push({
        id: entry.id,
        key: entry.key,
        namespace: entry.namespace || 'unknown',
        source: entry.source || 'memory',
        preview: (entry.value || '').substring(0, 200),
        color: namespaceToColor(entry.namespace, entry.source)
      });
    } catch (e) {
      console.warn(`Skipping entry ${entry.id}: ${e.message}`);
    }
  }

  console.log(`Namespaces: ${[...namespaces].join(', ')}`);

  // Project embeddings to 2D using UMAP (384-dim from MiniLM-L6-v2)
  console.log('Running UMAP dimensionality reduction (384 -> 2)...');
  const umap = new UMAP({
    nComponents: 2,
    nNeighbors: Math.min(15, Math.floor(entries.length / 2)),
    minDist: 0.1,
    spread: 1.0
  });

  const positions2D = umap.fit(embeddings);
  console.log('UMAP complete');

  // Normalize positions to [0, 4096] range for cosmos.gl
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (const [x, y] of positions2D) {
    const safeX = safeNumber(x, 0);
    const safeY = safeNumber(y, 0);
    minX = Math.min(minX, safeX);
    maxX = Math.max(maxX, safeX);
    minY = Math.min(minY, safeY);
    maxY = Math.max(maxY, safeY);
  }

  // Handle edge case where all positions are the same (would cause division by zero)
  const rangeX = maxX - minX;
  const rangeY = maxY - minY;
  const scaleX = rangeX > 0 ? safeDivide(3800, rangeX, 1) : 1;
  const scaleY = rangeY > 0 ? safeDivide(3800, rangeY, 1) : 1;
  const scale = safeNumber(Math.min(scaleX, scaleY), 1);

  for (let i = 0; i < nodes.length; i++) {
    const posX = safeNumber(positions2D[i]?.[0], 0);
    const posY = safeNumber(positions2D[i]?.[1], 0);
    nodes[i].x = safeNumber((posX - minX) * scale + 150, 150);
    nodes[i].y = safeNumber((posY - minY) * scale + 150, 150);
  }

  // Create edges based on cosine similarity (threshold: 0.75)
  console.log('Computing similarity edges...');
  const edges = [];
  const SIMILARITY_THRESHOLD = 0.75;
  const MAX_EDGES_PER_NODE = 5;

  for (let i = 0; i < entries.length; i++) {
    const similarities = [];

    for (let j = i + 1; j < entries.length; j++) {
      const sim = cosineSimilarity(embeddings[i], embeddings[j]);
      // Only include valid similarity scores above threshold
      const safeSim = safeNumber(sim, 0);
      if (safeSim >= SIMILARITY_THRESHOLD && safeSim <= 1.0) {
        similarities.push({ j, sim: safeSim });
      }
    }

    // Keep top N edges per node
    similarities.sort((a, b) => b.sim - a.sim);
    for (const { j, sim } of similarities.slice(0, MAX_EDGES_PER_NODE)) {
      edges.push({
        source: i,
        target: j,
        weight: safeNumber(sim, SIMILARITY_THRESHOLD) // Ensure weight is never NaN
      });
    }

    if (i % 100 === 0) {
      console.log(`  Processed ${i}/${entries.length} nodes...`);
    }
  }

  console.log(`Created ${edges.length} edges`);

  // Load v3 features
  console.log('Loading v3 stats...');
  const v3Stats = loadV3Stats();

  // Create output
  const graphData = {
    nodes,
    edges,
    meta: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      namespaces: [...namespaces],
      extractedAt: new Date().toISOString(),
      similarityThreshold: SIMILARITY_THRESHOLD,
      ruvectorVersion: 'v3 (0.1.96)',
      features: ['SONA', 'Attention', 'GNN', 'Q-Learning']
    },
    v3: v3Stats
  };

  // Ensure public directory exists
  const publicDir = './public';
  if (!existsSync(publicDir)) {
    const { mkdirSync } = await import('fs');
    mkdirSync(publicDir, { recursive: true });
  }

  // Sanitize all numeric values to prevent NaN/null in JSON output
  const sanitizedData = sanitizeForJSON(graphData, 0);

  writeFileSync(OUTPUT_FILE, JSON.stringify(sanitizedData, null, 2));
  console.log(`\nData saved to ${OUTPUT_FILE}`);
  console.log(`  Nodes: ${nodes.length}`);
  console.log(`  Edges: ${edges.length}`);

  db.close();
}

extractData().catch(console.error);
