#!/usr/bin/env node
/**
 * Generate Visualization Edges
 *
 * Populates the `edges` table with:
 * - Type 1: Deterministic edges (file co-edits, pattern→memory, sequences)
 * - Type 2: Semantic edges (cosine similarity between embeddings)
 */

const Database = require('better-sqlite3');
const path = require('path');

// Configuration
const DB_PATH = process.env.RUVECTOR_DB || '/mnt/data/dev/Veracy_ODCS/.ruvector/intelligence.db';
const SEMANTIC_SAME_TYPE_THRESHOLD = 0.85;
const SEMANTIC_CROSS_TYPE_THRESHOLD = 0.75;
const PATTERN_MEMORY_THRESHOLD = 0.80;
const MAX_EDGES_PER_NODE = 10; // Limit edges per node to avoid explosion

console.log('='.repeat(60));
console.log('  EDGE GENERATION SCRIPT');
console.log('='.repeat(60));
console.log(`Database: ${DB_PATH}`);
console.log();

const db = new Database(DB_PATH);

// Helper: Cosine similarity between two Float32Arrays
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// Helper: Parse embedding blob to Float32Array
function parseEmbedding(blob) {
  if (!blob) return null;
  try {
    return new Float32Array(blob.buffer, blob.byteOffset, blob.length / 4);
  } catch (e) {
    return null;
  }
}

// Clear existing edges
console.log('Clearing existing edges...');
db.prepare('DELETE FROM edges').run();

let totalEdges = 0;

// ===========================================
// TYPE 1: DETERMINISTIC EDGES
// ===========================================
console.log('\n--- TYPE 1: DETERMINISTIC EDGES ---\n');

// 1.1 File Co-Edit Relations
console.log('1.1 Processing file co-edits...');
try {
  const fileSeqs = db.prepare('SELECT rowid, from_file, to_file, count FROM file_sequences').all();
  const insertCoedit = db.prepare(`
    INSERT OR IGNORE INTO edges (id, from_node, to_node, relation, weight, metadata)
    VALUES (?, ?, ?, 'co_edit', ?, ?)
  `);

  for (const seq of fileSeqs) {
    insertCoedit.run(
      `coedit_${seq.rowid}`,
      seq.from_file,
      seq.to_file,
      Math.min(seq.count / 10.0, 1.0),
      JSON.stringify({ count: seq.count, type: 'deterministic' })
    );
    totalEdges++;
  }
  console.log(`  Added ${fileSeqs.length} co-edit edges`);
} catch (e) {
  console.log(`  Skipped: ${e.message}`);
}

// 1.2 Pattern → Memory Links (using correct node IDs)
// Pattern nodes in visualization have ID format: "state:action"
// Memory nodes in visualization have ID format: actual memory ID from database
console.log('1.2 Processing pattern → memory links...');
try {
  const patterns = db.prepare('SELECT rowid, state, action, q_value, visits FROM patterns').all();
  const memories = db.prepare('SELECT id, memory_type, content FROM memories').all();

  const insertPatMem = db.prepare(`
    INSERT OR IGNORE INTO edges (id, from_node, to_node, relation, weight, metadata)
    VALUES (?, ?, ?, 'pattern_produces', ?, ?)
  `);

  let patMemCount = 0;
  for (const p of patterns) {
    // Pattern node ID format in visualization: "state:action"
    const patternNodeId = `${p.state}:${p.action}`;
    const stateLC = (p.state || '').toLowerCase();

    // Find memories that relate to this pattern's state
    for (const mem of memories) {
      const memTypeLC = (mem.memory_type || '').toLowerCase();
      const contentLC = (mem.content || '').toLowerCase();

      // Match if state relates to memory type or content
      const matchPatterns = {
        'command': ['cmd', 'shell', 'bash'],
        'edit': ['edit', 'file', 'write'],
        'adr': ['adr', 'decision', 'architecture'],
        'task': ['task', 'todo'],
      };

      let matches = stateLC.includes(memTypeLC) || contentLC.includes(stateLC);
      if (!matches && matchPatterns[memTypeLC]) {
        matches = matchPatterns[memTypeLC].some(pat => stateLC.includes(pat));
      }

      if (matches && patMemCount < 200) { // Limit to avoid explosion
        insertPatMem.run(
          `pat_mem_${p.rowid}_${mem.id}`,
          patternNodeId,  // Use full pattern node ID
          mem.id,         // Use actual memory ID
          p.q_value,
          JSON.stringify({ action: p.action, visits: p.visits, memory_type: mem.memory_type, type: 'deterministic' })
        );
        patMemCount++;
        totalEdges++;
      }
    }
  }
  console.log(`  Added ${patMemCount} pattern→memory edges`);
} catch (e) {
  console.log(`  Skipped: ${e.message}`);
}

// 1.3 Trajectory → Action Sequences
console.log('1.3 Processing trajectory action sequences...');
try {
  const trajectories = db.prepare('SELECT id, steps FROM trajectories WHERE steps IS NOT NULL').all();

  const insertSeq = db.prepare(`
    INSERT OR IGNORE INTO edges (id, from_node, to_node, relation, weight, metadata)
    VALUES (?, ?, ?, 'sequence', ?, ?)
  `);

  let seqCount = 0;
  for (const t of trajectories) {
    try {
      const steps = JSON.parse(t.steps);
      if (!Array.isArray(steps)) continue;

      for (let i = 0; i < steps.length - 1; i++) {
        const step1 = steps[i];
        const step2 = steps[i + 1];

        if (!step1 || !step2) continue;

        const action1 = step1.action || step1.type || `step_${i}`;
        const action2 = step2.action || step2.type || `step_${i + 1}`;

        const reward1 = step1.reward || 0;
        const reward2 = step2.reward || 0;
        const avgReward = (reward1 + reward2) / 2;

        insertSeq.run(
          `seq_${t.id}_${i}`,
          action1,
          action2,
          Math.max(0.1, Math.min(avgReward, 1.0)),
          JSON.stringify({ trajectory: t.id, step: i, type: 'deterministic' })
        );
        seqCount++;
        totalEdges++;
      }
    } catch (e) {
      // Skip malformed JSON
    }
  }
  console.log(`  Added ${seqCount} sequence edges`);
} catch (e) {
  console.log(`  Skipped: ${e.message}`);
}

// ===========================================
// TYPE 2: SEMANTIC EDGES (Embedding-Based)
// ===========================================
console.log('\n--- TYPE 2: SEMANTIC EDGES ---\n');

// Load memories with embeddings
console.log('Loading memories with embeddings...');
const memories = db.prepare(`
  SELECT id, memory_type, embedding FROM memories
  WHERE embedding IS NOT NULL
`).all();

console.log(`  Found ${memories.length} memories with embeddings`);

// Parse embeddings
const memoryData = memories.map(m => ({
  id: m.id,
  type: m.memory_type,
  embedding: parseEmbedding(m.embedding)
})).filter(m => m.embedding !== null);

console.log(`  Parsed ${memoryData.length} embeddings successfully`);

// 2.1 & 2.2 Semantic Similar + Cross-Type Bridges
console.log('\n2.1/2.2 Computing semantic similarity edges...');

const insertSemantic = db.prepare(`
  INSERT OR IGNORE INTO edges (id, from_node, to_node, relation, weight, metadata)
  VALUES (?, ?, ?, ?, ?, ?)
`);

// Track edges per node to limit explosion
const edgesPerNode = new Map();
const getEdgeCount = (id) => edgesPerNode.get(id) || 0;
const incEdgeCount = (id) => edgesPerNode.set(id, getEdgeCount(id) + 1);

let sameTypeCount = 0;
let crossTypeCount = 0;

// For performance, we'll sample if too many memories
const sampleSize = Math.min(memoryData.length, 300);
const sampledMemories = memoryData.length > sampleSize
  ? memoryData.sort(() => Math.random() - 0.5).slice(0, sampleSize)
  : memoryData;

console.log(`  Processing ${sampledMemories.length} memories (sampled for performance)`);

for (let i = 0; i < sampledMemories.length; i++) {
  if (i % 50 === 0) {
    process.stdout.write(`\r  Progress: ${i}/${sampledMemories.length}`);
  }

  const memA = sampledMemories[i];
  if (getEdgeCount(memA.id) >= MAX_EDGES_PER_NODE) continue;

  for (let j = i + 1; j < sampledMemories.length; j++) {
    const memB = sampledMemories[j];
    if (getEdgeCount(memB.id) >= MAX_EDGES_PER_NODE) continue;

    const sim = cosineSimilarity(memA.embedding, memB.embedding);

    const sameType = memA.type === memB.type;
    const threshold = sameType ? SEMANTIC_SAME_TYPE_THRESHOLD : SEMANTIC_CROSS_TYPE_THRESHOLD;

    if (sim >= threshold) {
      const relation = sameType ? 'semantic_similar' : 'semantic_bridge';

      insertSemantic.run(
        `sem_${memA.id}_${memB.id}`,
        memA.id,
        memB.id,
        relation,
        sim,
        JSON.stringify({
          from_type: memA.type,
          to_type: memB.type,
          type: 'semantic'
        })
      );

      incEdgeCount(memA.id);
      incEdgeCount(memB.id);
      totalEdges++;

      if (sameType) sameTypeCount++;
      else crossTypeCount++;
    }
  }
}

console.log(`\n  Added ${sameTypeCount} same-type semantic edges`);
console.log(`  Added ${crossTypeCount} cross-type bridge edges`);

// 2.3 Pattern ↔ Memory Semantic Links
console.log('\n2.3 Computing pattern ↔ memory semantic links...');

const patterns = db.prepare(`
  SELECT state, action, embedding FROM patterns
  WHERE embedding IS NOT NULL
`).all();

const patternData = patterns.map(p => ({
  id: `pattern_${p.state}_${p.action}`,
  state: p.state,
  action: p.action,
  embedding: parseEmbedding(p.embedding)
})).filter(p => p.embedding !== null);

console.log(`  Found ${patternData.length} patterns with embeddings`);

let patMemSemanticCount = 0;

// Sample memories for pattern matching
const patternSampleSize = Math.min(memoryData.length, 200);
const sampledForPatterns = memoryData.length > patternSampleSize
  ? memoryData.sort(() => Math.random() - 0.5).slice(0, patternSampleSize)
  : memoryData;

for (const pat of patternData) {
  if (getEdgeCount(pat.id) >= MAX_EDGES_PER_NODE) continue;

  for (const mem of sampledForPatterns) {
    if (getEdgeCount(mem.id) >= MAX_EDGES_PER_NODE) continue;

    const sim = cosineSimilarity(pat.embedding, mem.embedding);

    if (sim >= PATTERN_MEMORY_THRESHOLD) {
      insertSemantic.run(
        `pat_sem_${pat.state}_${mem.id}`,
        pat.id,
        mem.id,
        'pattern_memory_semantic',
        sim,
        JSON.stringify({
          pattern_state: pat.state,
          pattern_action: pat.action,
          memory_type: mem.type,
          type: 'semantic'
        })
      );

      incEdgeCount(pat.id);
      incEdgeCount(mem.id);
      patMemSemanticCount++;
      totalEdges++;
    }
  }
}

console.log(`  Added ${patMemSemanticCount} pattern↔memory semantic edges`);

// ===========================================
// SUMMARY
// ===========================================
console.log('\n' + '='.repeat(60));
console.log('  SUMMARY');
console.log('='.repeat(60));

const edgeCounts = db.prepare(`
  SELECT relation, COUNT(*) as count
  FROM edges
  GROUP BY relation
  ORDER BY count DESC
`).all();

console.log('\nEdges by relation type:');
for (const row of edgeCounts) {
  console.log(`  ${row.relation}: ${row.count}`);
}

const finalCount = db.prepare('SELECT COUNT(*) as c FROM edges').get().c;
console.log(`\nTotal edges in database: ${finalCount}`);
console.log('='.repeat(60));

db.close();
