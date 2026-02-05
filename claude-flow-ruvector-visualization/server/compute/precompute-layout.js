/**
 * Pre-compute Layout
 *
 * Computes graph layout server-side using SFDP-like algorithm.
 * Stores positions in SQLite for fast loading.
 *
 * Usage:
 *   node server/compute/precompute-layout.js [--force] [--algorithm=sfdp|fa2|umap]
 */

import { existsSync } from 'fs';
import Database from 'better-sqlite3';

const DB_PATH = '/mnt/data/dev/Veracy_ODCS/.ruvector/intelligence.db';

// Configuration
const CONFIG = {
  algorithm: 'force', // 'force', 'umap', 'grid'
  iterations: 500,
  repulsion: -100,
  attraction: 0.01,
  damping: 0.95,
  minDistance: 20,
  clusterLevels: 5,
  clusterBaseCellSize: 100
};

/**
 * Load graph data from database
 */
function loadGraphData(db) {
  console.log('Loading graph data...');

  const nodes = [];
  const edges = [];
  const nodeIdToIndex = new Map();

  // Load memories
  const memories = db.prepare(`
    SELECT id, content, embedding FROM memories
  `).all();

  memories.forEach(row => {
    const index = nodes.length;
    nodeIdToIndex.set(row.id, index);
    nodes.push({
      id: row.id,
      index,
      source: 'memory',
      x: Math.random() * 2000 - 1000,
      y: Math.random() * 2000 - 1000,
      z: 0,
      vx: 0,
      vy: 0,
      embedding: row.embedding
    });
  });

  // Load neural patterns
  const neuralPatterns = db.prepare(`
    SELECT id, content, embedding FROM neural_patterns
  `).all();

  neuralPatterns.forEach(row => {
    const index = nodes.length;
    nodeIdToIndex.set(`np-${row.id}`, index);
    nodes.push({
      id: `np-${row.id}`,
      index,
      source: 'neural_pattern',
      x: Math.random() * 2000 - 1000,
      y: Math.random() * 2000 - 1000,
      z: 0,
      vx: 0,
      vy: 0,
      embedding: row.embedding
    });
  });

  // Load Q-patterns
  const qPatterns = db.prepare(`
    SELECT state, action, q_value FROM patterns
  `).all();

  qPatterns.forEach((row, i) => {
    const id = `${row.state}:${row.action}`;
    const index = nodes.length;
    nodeIdToIndex.set(id, index);
    nodes.push({
      id,
      index,
      source: 'q_pattern',
      x: Math.random() * 2000 - 1000,
      y: Math.random() * 2000 - 1000,
      z: 0,
      vx: 0,
      vy: 0,
      qValue: row.q_value
    });
  });

  // Load trajectories
  const trajectories = db.prepare(`
    SELECT id, context, agent FROM trajectories
  `).all();

  trajectories.forEach(row => {
    const id = `traj-${row.id}`;
    const index = nodes.length;
    nodeIdToIndex.set(id, index);
    nodes.push({
      id,
      index,
      source: 'trajectory',
      x: Math.random() * 2000 - 1000,
      y: Math.random() * 2000 - 1000,
      z: 0,
      vx: 0,
      vy: 0
    });
  });

  console.log(`  Loaded ${nodes.length} nodes`);

  // Compute edges based on similarity (simplified)
  // In production, use pre-computed similarity or load from edges table
  console.log('Computing edges...');

  // Try to load from edges table
  try {
    const dbEdges = db.prepare(`
      SELECT from_node, to_node, weight FROM edges
    `).all();

    dbEdges.forEach(e => {
      const sourceIdx = nodeIdToIndex.get(e.from_node);
      const targetIdx = nodeIdToIndex.get(e.to_node);

      if (sourceIdx !== undefined && targetIdx !== undefined) {
        edges.push({
          source: sourceIdx,
          target: targetIdx,
          weight: e.weight || 0.5
        });
      }
    });

    console.log(`  Loaded ${edges.length} edges from database`);
  } catch (err) {
    console.log('  No edges table found, creating structural edges...');

    // Create structural edges based on Node type
    const sourceGroups = new Map();
    nodes.forEach(node => {
      if (!sourceGroups.has(node.source)) {
        sourceGroups.set(node.source, []);
      }
      sourceGroups.get(node.source).push(node.index);
    });

    // Connect nodes within same source (limited)
    for (const [source, indices] of sourceGroups) {
      for (let i = 0; i < indices.length - 1 && i < 100; i++) {
        edges.push({
          source: indices[i],
          target: indices[i + 1],
          weight: 0.3
        });
      }
    }

    console.log(`  Created ${edges.length} structural edges`);
  }

  return { nodes, edges, nodeIdToIndex };
}

/**
 * Run force-directed layout
 */
function runForceLayout(nodes, edges, config) {
  console.log(`Running force layout (${config.iterations} iterations)...`);

  const startTime = Date.now();

  for (let iter = 0; iter < config.iterations; iter++) {
    // Apply repulsion (all pairs - simplified)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        let dx = nodes[j].x - nodes[i].x;
        let dy = nodes[j].y - nodes[i].y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;

        if (dist < config.minDistance) dist = config.minDistance;

        const force = config.repulsion / (dist * dist);
        dx *= force / dist;
        dy *= force / dist;

        nodes[i].vx -= dx;
        nodes[i].vy -= dy;
        nodes[j].vx += dx;
        nodes[j].vy += dy;
      }
    }

    // Apply attraction (edges)
    for (const edge of edges) {
      const source = nodes[edge.source];
      const target = nodes[edge.target];

      let dx = target.x - source.x;
      let dy = target.y - source.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;

      const force = dist * config.attraction * (edge.weight || 1);
      dx *= force / dist;
      dy *= force / dist;

      source.vx += dx;
      source.vy += dy;
      target.vx -= dx;
      target.vy -= dy;
    }

    // Update positions with damping
    for (const node of nodes) {
      node.vx *= config.damping;
      node.vy *= config.damping;
      node.x += node.vx;
      node.y += node.vy;
    }

    if (iter % 100 === 0) {
      console.log(`  Iteration ${iter}/${config.iterations}`);
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(`  Completed in ${elapsed}ms`);
}

/**
 * Compute clusters
 */
function computeClusters(nodes, config) {
  console.log('Computing clusters...');

  const clusters = [];

  for (let level = 0; level < config.clusterLevels; level++) {
    const cellSize = config.clusterBaseCellSize * Math.pow(2, level);
    const grid = new Map();

    // Assign nodes to grid cells
    for (const node of nodes) {
      const cellX = Math.floor(node.x / cellSize);
      const cellY = Math.floor(node.y / cellSize);
      const key = `${cellX},${cellY}`;

      if (!grid.has(key)) {
        grid.set(key, []);
      }
      grid.get(key).push(node);
    }

    // Create clusters from grid cells
    for (const [key, cellNodes] of grid) {
      if (cellNodes.length < 3) continue;

      let sumX = 0, sumY = 0;
      const sourceCounts = {};

      for (const node of cellNodes) {
        sumX += node.x;
        sumY += node.y;
        sourceCounts[node.source] = (sourceCounts[node.source] || 0) + 1;
      }

      const centerX = sumX / cellNodes.length;
      const centerY = sumY / cellNodes.length;

      // Find dominant source
      let dominantSource = 'memory';
      let maxCount = 0;
      for (const [source, count] of Object.entries(sourceCounts)) {
        if (count > maxCount) {
          maxCount = count;
          dominantSource = source;
        }
      }

      // Compute radius
      let maxDist = 0;
      for (const node of cellNodes) {
        const dist = Math.sqrt((node.x - centerX) ** 2 + (node.y - centerY) ** 2);
        maxDist = Math.max(maxDist, dist);
      }

      clusters.push({
        level,
        x: centerX,
        y: centerY,
        z: 0,
        nodeCount: cellNodes.length,
        radius: Math.max(maxDist, cellSize * 0.3),
        dominantSource,
        nodeIndices: cellNodes.map(n => n.index)
      });
    }

    console.log(`  Level ${level}: ${grid.size} cells -> ${clusters.filter(c => c.level === level).length} clusters`);
  }

  return clusters;
}

/**
 * Save positions to database
 */
function savePositions(db, nodes) {
  console.log('Saving positions to database...');

  // Create table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS node_positions (
      node_id TEXT PRIMARY KEY,
      node_index INTEGER,
      x REAL,
      y REAL,
      z REAL,
      source TEXT
    )
  `);

  // Clear existing data
  db.exec('DELETE FROM node_positions');

  // Insert positions
  const stmt = db.prepare(`
    INSERT INTO node_positions (node_id, node_index, x, y, z, source)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insert = db.transaction(() => {
    for (const node of nodes) {
      stmt.run(node.id, node.index, node.x, node.y, node.z, node.source);
    }
  });

  insert();

  console.log(`  Saved ${nodes.length} positions`);
}

/**
 * Save clusters to database
 */
function saveClusters(db, clusters) {
  console.log('Saving clusters to database...');

  // Create table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS clusters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level INTEGER,
      x REAL,
      y REAL,
      z REAL,
      node_count INTEGER,
      radius REAL,
      dominant_source TEXT,
      node_indices TEXT
    )
  `);

  // Clear existing data
  db.exec('DELETE FROM clusters');

  // Insert clusters
  const stmt = db.prepare(`
    INSERT INTO clusters (level, x, y, z, node_count, radius, dominant_source, node_indices)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insert = db.transaction(() => {
    for (const cluster of clusters) {
      stmt.run(
        cluster.level,
        cluster.x,
        cluster.y,
        cluster.z,
        cluster.nodeCount,
        cluster.radius,
        cluster.dominantSource,
        JSON.stringify(cluster.nodeIndices)
      );
    }
  });

  insert();

  console.log(`  Saved ${clusters.length} clusters`);
}

/**
 * Main function
 */
async function main() {
  console.log('='.repeat(60));
  console.log('Pre-compute Layout for RuVector Visualization');
  console.log('='.repeat(60));

  if (!existsSync(DB_PATH)) {
    console.error(`Database not found: ${DB_PATH}`);
    process.exit(1);
  }

  const db = new Database(DB_PATH);

  try {
    // Load data
    const { nodes, edges } = loadGraphData(db);

    if (nodes.length === 0) {
      console.log('No nodes found in database');
      process.exit(0);
    }

    // Run layout
    runForceLayout(nodes, edges, CONFIG);

    // Compute clusters
    const clusters = computeClusters(nodes, CONFIG);

    // Save results
    savePositions(db, nodes);
    saveClusters(db, clusters);

    console.log('='.repeat(60));
    console.log('Pre-computation complete!');
    console.log(`  Nodes: ${nodes.length}`);
    console.log(`  Edges: ${edges.length}`);
    console.log(`  Clusters: ${clusters.length}`);
    console.log('='.repeat(60));

  } finally {
    db.close();
  }
}

// Run if called directly
main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

export { loadGraphData, runForceLayout, computeClusters };
