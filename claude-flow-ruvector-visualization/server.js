/**
 * RuVector Visualization API Server
 * Single-file mode: Uses intelligence.db as the sole data source
 *
 * memoryV3 schema:
 * - memories: id, memory_type, content, embedding (384-dim BLOB), metadata, timestamp
 * - patterns (Q-learning): key, state, action, q_value, visits, last_update
 * - trajectories: id, state, action, outcome, reward, timestamp
 * - errors: key, data
 * - file_sequences: from_file, to_file, count
 * - agents: name, data
 * - edges: id, source, target, weight, data
 * - stats: key, value
 * - learning_data: algorithm, q_table
 * - kv_store: key, value
 */

import { createServer } from 'http';
import { statSync, readFileSync, existsSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';
import Database from 'better-sqlite3';
import { UMAP } from 'umap-js';
import path from 'path';
import { addLearningRoutes, createRouteHandler, handleRoute } from './src/api/learning-routes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = 3333;
const DB_PATH = path.join(__dirname, '..', '.ruvector', 'intelligence.db');

let cachedData = null;
let lastDbMtime = 0;

/**
 * Compute cosine similarity between two vectors
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @returns {number} Cosine similarity value (0 if vectors have zero magnitude)
 */
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  // Prevent NaN when either vector has zero magnitude
  if (denom === 0 || !isFinite(denom)) return 0;
  const result = dot / denom;
  return isFinite(result) ? result : 0;
}

/**
 * Convert namespace/category to a consistent hex color
 * @param {string} namespace - The namespace or category string
 * @returns {string} Hex color code
 */
function namespaceToColor(namespace) {
  const colors = {
    'veracy': '#4CAF50',
    'veracy/maintenance': '#2196F3',
    'roo-cline': '#9C27B0',
    'architect': '#FF9800',
    'memory': '#00BCD4',
    'neural_pattern': '#E91E63',
    'q_pattern': '#FF5722',
    'trajectory_success': '#4CAF50',   // green for successful trajectories
    'trajectory_failed': '#F44336',    // red for failed trajectories
    'trajectory': '#795548',           // fallback for generic trajectory namespace
    'file': '#8D6E63',
    'agent': '#FF5722',
    'state': '#673AB7',
    'action': '#009688',
    'default': '#607D8B'
  };

  for (const [ns, color] of Object.entries(colors)) {
    if (namespace && namespace.startsWith(ns)) return color;
  }

  // Generate hash-based color in hex format
  let hash = 0;
  const str = namespace || 'default';
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;

  // Convert HSL to RGB to Hex
  const h = hue / 360;
  const s = 0.7;
  const l = 0.5;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h * 12) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color);
  };
  const r = f(0);
  const g = f(8);
  const b = f(4);
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Normalize timestamp to specified unit, handling seconds, milliseconds, and microseconds
 * @param {number} ts - Input timestamp in any unit
 * @param {string} outputUnit - 'ms' for milliseconds, 's' for seconds
 */
function normalizeTimestamp(ts, outputUnit = 'ms') {
  if (ts == null) return null;
  // Detect input unit: >1e15 = microseconds, >1e12 = milliseconds, else seconds
  let seconds;
  if (ts > 1e15) seconds = ts / 1000000;
  else if (ts > 1e12) seconds = ts / 1000;
  else seconds = ts;
  return outputUnit === 'ms' ? seconds * 1000 : seconds;
}
// Convenience aliases
const toMilliseconds = (ts) => normalizeTimestamp(ts, 'ms');
const toSeconds = (ts) => normalizeTimestamp(ts, 's');

/**
 * Sanitize a numeric value, returning a default if invalid (NaN, null, undefined)
 * @param {*} val - Value to sanitize
 * @param {number} defaultVal - Default value if invalid (default: 0)
 * @returns {number} Valid number or default
 */
function sanitizeNumber(val, defaultVal = 0) {
  if (val === null || val === undefined) return defaultVal;
  const num = Number(val);
  return isNaN(num) || !isFinite(num) ? defaultVal : num;
}

/**
 * Sanitize an object's numeric properties recursively
 * @param {object} obj - Object to sanitize
 * @param {number} defaultVal - Default value for invalid numbers
 * @returns {object} Sanitized object
 */
function sanitizeNumericObject(obj, defaultVal = 0) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeNumericObject(item, defaultVal));
  }
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'number') {
      result[key] = sanitizeNumber(value, defaultVal);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeNumericObject(value, defaultVal);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Parse embedding from various formats (Buffer, JSON string, or array)
 * @param {Buffer|string|number[]} data - Raw embedding data
 * @param {number} expectedDim - Expected embedding dimension (default 384)
 * @returns {number[]|null} Parsed embedding array or null
 */
function parseEmbedding(data, expectedDim = 384) {
  if (!data) return null;
  if (Array.isArray(data)) return data;

  // Handle Node.js Buffer (SQLite returns BLOB as Buffer)
  if (Buffer.isBuffer(data)) {
    try {
      // Use byteOffset and calculate length for Float32Array view
      const floatArray = new Float32Array(data.buffer, data.byteOffset, data.length / 4);
      return Array.from(floatArray);
    } catch (e) {
      return null;
    }
  }

  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch (e) {
      return null;
    }
  }

  return null;
}

// Consolidated edge weight configuration
const EDGE_WEIGHTS = {
  // Structural edges (deterministic relationships)
  explicit: 0.8,
  has_state: 0.8,
  has_action: 0.8,
  is_agent: 0.9,
  agent_hierarchy: 0.9,
  // Temporal edges
  trajectory_memory: 0.9,
  trajectory_sequence: 0.7,
  sequence: 0.85,
  // Grouping edges
  same_state_prefix: 0.6,
  same_action: 0.7,
  same_agent: 0.6,
  success_cluster: 0.5,
  failure_cluster: 0.5,
  // Cross-type edges
  trajectory_action: 0.75,
  trajectory_agent: 0.85,
  trajectory_neural: 0.9,
  agent_instance: 0.75,
  state_type_bridge: 0.4,
  memory_agent: 0.55,
  memory_context: 0.4
};

// Consolidated edge threshold configuration
const EDGE_THRESHOLDS = {
  semantic: 0.55,      // Cosine similarity for semantic edges (matches DB)
  defaultApi: 0.55,    // Default API threshold (aligned with DB)
  knn: 0.0             // K-NN fallback uses any similarity
};

// ═══════════════════════════════════════════════════════════════════════════
// DATA EXTRACTION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch memories from intelligence.db
 * @param {Database} db - SQLite database connection
 * @returns {object[]} Array of memory objects
 */
function getMemories(db) {
  try {
    const rows = db.prepare(`
      SELECT
        id,
        content,
        memory_type,
        embedding,
        timestamp,
        metadata
      FROM memories
      ORDER BY timestamp DESC
    `).all();

    // Filter out init-warmup HNSW seed nodes — they contain no knowledge
    // and their embeddings are orthogonal to all real content (doc 08 §3)
    const filtered = rows.filter(row => row.content !== 'init-warmup');

    return filtered.map(row => {
      let parsedMetadata = {};
      try {
        parsedMetadata = row.metadata ? JSON.parse(row.metadata) : {};
      } catch (e) {}

      // Extract domain from metadata (new field from memory backend)
      const domain = parsedMetadata.domain || null;

      // FIX-016: Extract foundation RL metadata fields
      // Foundation detection: explicit flag, source marker, or domain-based inference
      const explicitFoundation = !!parsedMetadata.foundation;
      const isAdrSource = parsedMetadata.source === '__ADRS__';
      const isArchitectureDomain = domain === 'architecture' || domain === 'security';
      const isFoundation = explicitFoundation || isAdrSource || isArchitectureDomain;

      const layer = parsedMetadata.layer || (isArchitectureDomain ? 'summary' : null);
      const document = parsedMetadata.document || null;     // ADR document name
      const recallCount = parsedMetadata.recall_count ?? null;
      const rewardSum = parsedMetadata.reward_sum ?? null;

      // Compute effectiveness if not explicitly provided
      let effectiveness = parsedMetadata.effectiveness ?? null;
      if (effectiveness === null && recallCount !== null && recallCount > 0 && rewardSum !== null) {
        effectiveness = rewardSum / recallCount;
      }

      const lastRecalled = parsedMetadata.last_recalled ? toMilliseconds(parsedMetadata.last_recalled) : null;
      const sourceDoc = parsedMetadata.source || null;      // e.g. "__ADRS__"

      return {
        id: row.id,
        content: row.content || '',
        memoryType: row.memory_type,
        namespace: parsedMetadata.namespace || row.memory_type || 'memory',
        domain: domain,  // code, architecture, security, error, test
        embedding: parseEmbedding(row.embedding),
        // Convert timestamp to milliseconds
        timestamp: toMilliseconds(row.timestamp) || null,
        metadata: parsedMetadata,
        source: 'memory',
        // FIX-016: Foundation RL metadata (top-level for viz modes)
        isFoundation,
        layer,              // "summary" or "detail"
        document,           // ADR document name
        recallCount,        // Times recalled by suggest-context
        rewardSum,          // Accumulated RL reward
        effectiveness,      // reward_sum / recall_count
        lastRecalled,       // Timestamp of last recall (ms)
        sourceDoc,          // Source collection (e.g. "__ADRS__")
        // Harmonized timestamps (memoryV3 has no created_at/updated_at)
        createdAt: null,
        updatedAt: null
      };
    });
  } catch (e) {
    console.warn('Failed to load memories:', e.message);
    return [];
  }
}


/**
 * Fetch file sequences (co-edit relationships) from intelligence.db
 * @param {Database} db - SQLite database connection
 * @returns {object[]} Array of file sequence objects
 */
function getFileSequences(db) {
  try {
    const rows = db.prepare(`
      SELECT from_file, to_file, count
      FROM file_sequences
      ORDER BY count DESC
    `).all();

    return rows.map(row => ({
      fromFile: row.from_file,
      toFile: row.to_file,
      count: row.count || 1
    }));
  } catch (e) {
    console.warn('Failed to load file_sequences:', e.message);
    return [];
  }
}

/**
 * Fetch learning data (Q-tables, stats, configs) from intelligence.db
 * The learning_data table stores the combined RL state as a single JSON row.
 * qTables2 (Double-Q) is the active learner mapping file types → agent types.
 * @param {Database} db - SQLite database connection
 * @returns {object} Parsed learning data with qTables, qTables2, stats, configs, rewardHistory
 */
function getLearningData(db) {
  try {
    const row = db.prepare("SELECT q_table FROM learning_data WHERE algorithm = 'combined'").get();
    if (!row || !row.q_table) return null;

    const parsed = JSON.parse(row.q_table);
    return {
      qTables: parsed.qTables || {},       // Q-learning weights
      qTables2: parsed.qTables2 || {},     // Double-Q weights (active learner)
      stats: parsed.stats || {},            // Per-algorithm metrics
      configs: parsed.configs || {},        // Algorithm configs
      rewardHistory: parsed.rewardHistory || []  // Reward values over time
    };
  } catch (e) {
    console.warn('Failed to load learning_data:', e.message);
    return null;
  }
}

/**
 * Fetch neural patterns from intelligence.db
 * @param {Database} db - SQLite database connection
 * @returns {object[]} Array of neural pattern objects
 */
function getNeuralPatterns(db) {
  try {
    const rows = db.prepare(`
      SELECT
        id,
        content,
        category,
        embedding,
        confidence,
        usage,
        created_at,
        updated_at,
        metadata
      FROM neural_patterns
      ORDER BY created_at DESC
    `).all();

    return rows.map(row => {
      let parsedMetadata = {};
      try {
        parsedMetadata = row.metadata ? JSON.parse(row.metadata) : {};
      } catch (e) {}

      return {
        id: row.id,
        content: row.content || '',
        category: row.category,
        namespace: row.category || 'neural_pattern',
        embedding: parseEmbedding(row.embedding),
        confidence: row.confidence || 0,
        usageCount: row.usage || 0,
        // Convert timestamp to milliseconds — prefer updated_at > created_at
        timestamp: toMilliseconds(row.updated_at) || toMilliseconds(row.created_at) || null,
        metadata: parsedMetadata,
        source: 'neural_pattern',
        // Harmonized timestamps
        createdAt: toMilliseconds(row.created_at) || null,
        updatedAt: toMilliseconds(row.updated_at) || null
      };
    });
  } catch (e) {
    console.warn('Failed to load neural_patterns:', e.message);
    return [];
  }
}

/**
 * Fetch Q-learning patterns from intelligence.db
 * @param {Database} db - SQLite database connection
 * @returns {object[]} Array of Q-pattern objects
 */
function getQLearningPatterns(db) {
  try {
    const rows = db.prepare(`
      SELECT
        state,
        action,
        q_value,
        visits,
        last_update
      FROM patterns
      ORDER BY q_value DESC
    `).all();

    return rows
      .filter(row => typeof row.q_value === 'number' && !isNaN(row.q_value))
      .map(row => {
        // FIX-010: Parse model suffix from state keys (e.g., "edit_ts_in_project:haiku")
        const state = row.state || '';
        let model = null;
        let baseState = state;
        const modelSuffixes = [':haiku', ':sonnet', ':opus'];
        for (const suffix of modelSuffixes) {
          if (state.endsWith(suffix)) {
            model = suffix.slice(1); // Remove leading ':'
            baseState = state.slice(0, -suffix.length);
            break;
          }
        }

        return {
          id: `${row.state}:${row.action}`,
          state: row.state,
          baseState: baseState,          // FIX-010: state without model suffix
          action: row.action,
          qValue: row.q_value,
          visits: row.visits || 0,
          model: model,                   // FIX-010: 'haiku', 'sonnet', 'opus', or null
          // Convert timestamp to milliseconds
          timestamp: toMilliseconds(row.last_update) || null,
          namespace: 'q_pattern',
          source: 'q_pattern',
          // Harmonized timestamps (memoryV3 has no created_at/updated_at)
          createdAt: null,
          updatedAt: null
        };
      });
  } catch (e) {
    console.warn('Failed to load patterns:', e.message);
    return [];
  }
}

/**
 * Fetch trajectories from intelligence.db
 * @param {Database} db - SQLite database connection
 * @returns {object[]} Array of trajectory objects
 */
function getTrajectories(db) {
  try {
    const rows = db.prepare(`
      SELECT id, state, action, outcome, reward, timestamp
      FROM trajectories
      ORDER BY timestamp DESC
    `).all();

    return rows.map(row => {
      return {
        id: row.id,
        context: `${row.state} → ${row.action}`,
        agent: 'unknown',
        steps: [],
        stepCount: 0,
        startTime: toMilliseconds(row.timestamp) || null,
        endTime: toMilliseconds(row.timestamp) || null,
        timestamp: toMilliseconds(row.timestamp) || null,
        success: row.outcome === 'success' || row.outcome === 'completed',
        createdAt: null,
        updatedAt: null,
        metadata: { state: row.state, action: row.action, outcome: row.outcome, reward: row.reward },
        namespace: (row.outcome === 'success' || row.outcome === 'completed') ? 'trajectory_success' : 'trajectory_failed',
        source: 'trajectory',
        // Extra fields for viz
        state: row.state,
        action: row.action,
        outcome: row.outcome,
        reward: row.reward
      };
    });
  } catch (e) {
    console.warn('Failed to load trajectories:', e.message);
    return [];
  }
}

/**
 * Get database statistics
 * @param {Database} db - SQLite database connection
 * @returns {object} Statistics object
 */
function getStats(db) {
  const stats = {
    totals: {
      memories: 0,
      neuralPatterns: 0,
      qPatterns: 0,
      distinctStates: 0,
      distinctActions: 0,
      trajectories: 0,
      total: 0,
      withEmbeddings: 0
    },
    qLearning: {
      avgReward: 0,
      maxReward: 0,
      minReward: 0,
      totalVisits: 0
    },
    trajectories: {
      successRate: 0,
      avgSteps: 0,
      successful: 0,
      failed: 0
    },
    neuralPatterns: {
      avgConfidence: 0,
      totalUsage: 0
    },
    distributions: {
      memoryTypes: [],
      patternCategories: []
    }
  };

  try {
    // Count totals
    const memCount = db.prepare('SELECT COUNT(*) as count FROM memories').get();
    stats.totals.memories = memCount?.count || 0;

    // Count memories with embeddings (384-dim = 1536 bytes as Float32)
    const memWithEmb = db.prepare('SELECT COUNT(*) as count FROM memories WHERE embedding IS NOT NULL AND LENGTH(embedding) >= 1536').get();
    stats.totals.withEmbeddings = memWithEmb?.count || 0;
  } catch (e) {}

  // Check neural_patterns table existence explicitly
  const neuralTableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='neural_patterns'").get();
  if (neuralTableExists) {
    const neuralCount = db.prepare('SELECT COUNT(*) as count FROM neural_patterns').get();
    stats.totals.neuralPatterns = neuralCount?.count || 0;

    // Add neural patterns with embeddings
    const neuralWithEmb = db.prepare('SELECT COUNT(*) as count FROM neural_patterns WHERE embedding IS NOT NULL AND LENGTH(embedding) >= 1536').get();
    stats.totals.withEmbeddings += neuralWithEmb?.count || 0;
  } else {
    stats.totals.neuralPatterns = 0;
    console.warn('  neural_patterns table not found - neural features disabled');
  }

  try {
    const patternCount = db.prepare('SELECT COUNT(*) as count FROM patterns').get();
    stats.totals.qPatterns = patternCount?.count || 0;

    const stateCount = db.prepare('SELECT COUNT(DISTINCT state) as count FROM patterns').get();
    stats.totals.distinctStates = stateCount?.count || 0;

    const actionCount = db.prepare('SELECT COUNT(DISTINCT action) as count FROM patterns').get();
    stats.totals.distinctActions = actionCount?.count || 0;
  } catch (e) {}

  try {
    const trajCount = db.prepare('SELECT COUNT(*) as count FROM trajectories').get();
    stats.totals.trajectories = trajCount?.count || 0;
  } catch (e) {}

  stats.totals.total = stats.totals.memories + stats.totals.neuralPatterns + stats.totals.qPatterns + stats.totals.trajectories;

  // Q-learning stats with COALESCE to prevent NULL values
  try {
    const qStats = db.prepare(`
      SELECT
        COALESCE(AVG(q_value), 0) as avg_q,
        COALESCE(MAX(q_value), 0) as max_q,
        COALESCE(MIN(q_value), 0) as min_q,
        COALESCE(SUM(visits), 0) as total_visits
      FROM patterns
      WHERE q_value IS NOT NULL
    `).get();

    stats.qLearning = {
      avgReward: sanitizeNumber(qStats?.avg_q, 0),
      maxReward: sanitizeNumber(qStats?.max_q, 0),
      minReward: sanitizeNumber(qStats?.min_q, 0),
      totalVisits: sanitizeNumber(qStats?.total_visits, 0)
    };
  } catch (e) {}

  // Trajectory stats (memoryV3 schema: outcome instead of success, no steps column)
  try {
    const trajStats = db.prepare(`
      SELECT
        COALESCE(COUNT(*), 0) as total,
        COALESCE(SUM(CASE WHEN outcome IN ('success', 'completed') THEN 1 ELSE 0 END), 0) as successful
      FROM trajectories
    `).get();

    const total = sanitizeNumber(trajStats?.total, 0);
    const successful = sanitizeNumber(trajStats?.successful, 0);

    stats.trajectories = {
      successRate: total > 0 ? sanitizeNumber(successful / total, 0) : 0,
      avgSteps: 0,
      successful,
      failed: total - successful
    };
  } catch (e) {}

  // Neural pattern stats
  try {
    const npStats = db.prepare(`
      SELECT
        COALESCE(AVG(confidence), 0) as avg_confidence,
        COALESCE(SUM(usage), 0) as total_usage
      FROM neural_patterns
    `).get();

    stats.neuralPatterns = {
      avgConfidence: sanitizeNumber(npStats?.avg_confidence, 0),
      totalUsage: sanitizeNumber(npStats?.total_usage, 0)
    };
  } catch (e) {}

  // Memory type distribution with sanitized values
  try {
    const memTypes = db.prepare(`
      SELECT COALESCE(memory_type, 'unknown') as label, COUNT(*) as value
      FROM memories
      GROUP BY memory_type
      ORDER BY value DESC
    `).all();
    stats.distributions.memoryTypes = memTypes.map(row => ({
      label: row.label || 'unknown',
      value: sanitizeNumber(row.value, 0)
    }));
  } catch (e) {}

  // Neural pattern category distribution with sanitized values
  try {
    const patCats = db.prepare(`
      SELECT COALESCE(category, 'unknown') as label, COUNT(*) as value, COALESCE(AVG(confidence), 0) as avgConfidence
      FROM neural_patterns
      GROUP BY category
      ORDER BY value DESC
    `).all();
    stats.distributions.patternCategories = patCats.map(row => ({
      label: row.label || 'unknown',
      value: sanitizeNumber(row.value, 0),
      avgConfidence: sanitizeNumber(row.avgConfidence, 0)
    }));
  } catch (e) {}

  // Learning data (agent routing intelligence from Double-Q learner)
  try {
    const ld = getLearningData(db);
    if (ld) {
      const activeAlgos = Object.entries(ld.stats).filter(([_, s]) => (s.updates || 0) > 0);
      const allAgentNames = new Set(Object.values(ld.qTables2).flatMap(v => Object.keys(v)));
      stats.learningData = {
        hasData: true,
        fileTypeMappings: Object.keys(ld.qTables2).length,
        agentTypes: allAgentNames.size,
        activeAlgorithms: activeAlgos.length,
        totalAlgorithms: Object.keys(ld.stats).length,
        rewardHistory: ld.rewardHistory.length
      };
    } else {
      stats.learningData = { hasData: false };
    }
  } catch (e) {
    stats.learningData = { hasData: false };
  }

  // ═══ memoryV3: Tables below don't exist, return defaults ═══

  // Feedback (feedback_suggestions/feedback_rates don't exist in memoryV3)
  stats.feedback = { totalSuggestions: 0, followed: 0, successful: 0, followRate: 0, agentRates: [] };

  // Calibration (calibration_buckets/calibration_predictions don't exist in memoryV3)
  stats.calibration = { buckets: [], predictions: 0, averageError: 0 };

  // Domain distribution (from memory metadata)
  try {
    stats.distributions.domains = db.prepare(`
      SELECT json_extract(metadata, '$.domain') as label, COUNT(*) as value
      FROM memories
      WHERE json_extract(metadata, '$.domain') IS NOT NULL
      GROUP BY label
      ORDER BY value DESC
    `).all() || [];
  } catch (e) {
    stats.distributions.domains = [];
  }

  // Error patterns (error_patterns table doesn't exist in memoryV3)
  stats.errorPatterns = { total: 0, categories: [] };

  // ═══ Foundation RL Stats (FIX-016) ═══
  // Compute foundation count and average effectiveness from memory metadata
  try {
    const foundationRow = db.prepare(`
      SELECT
        COUNT(*) as foundation_count,
        SUM(CASE WHEN json_extract(metadata, '$.layer') = 'summary' THEN 1 ELSE 0 END) as summary_count,
        SUM(CASE WHEN json_extract(metadata, '$.layer') = 'detail' THEN 1 ELSE 0 END) as detail_count
      FROM memories
      WHERE json_extract(metadata, '$.foundation') = 1
         OR json_extract(metadata, '$.foundation') = 'true'
         OR json_extract(metadata, '$.source') = '__ADRS__'
    `).get();

    // Compute average effectiveness from memories that have it
    const effectivenessRow = db.prepare(`
      SELECT
        AVG(CAST(json_extract(metadata, '$.effectiveness') AS REAL)) as avg_effectiveness,
        COUNT(*) as effectiveness_count
      FROM memories
      WHERE json_extract(metadata, '$.effectiveness') IS NOT NULL
    `).get();

    // Alternative: Compute effectiveness from recall_count and reward_sum if available
    let computedEffectiveness = null;
    if (!effectivenessRow?.avg_effectiveness) {
      const rlRow = db.prepare(`
        SELECT
          SUM(CAST(json_extract(metadata, '$.reward_sum') AS REAL)) as total_reward,
          SUM(CAST(json_extract(metadata, '$.recall_count') AS INTEGER)) as total_recalls
        FROM memories
        WHERE json_extract(metadata, '$.recall_count') IS NOT NULL
          AND CAST(json_extract(metadata, '$.recall_count') AS INTEGER) > 0
      `).get();
      if (rlRow?.total_recalls > 0) {
        computedEffectiveness = rlRow.total_reward / rlRow.total_recalls;
      }
    }

    // Fallback: Use trajectory success rate as effectiveness proxy
    if (!effectivenessRow?.avg_effectiveness && computedEffectiveness === null) {
      try {
        const trajRow = db.prepare(`
          SELECT
            COUNT(*) as total,
            SUM(CASE WHEN outcome IN ('success', 'completed') THEN 1 ELSE 0 END) as successful
          FROM trajectories
        `).get();
        if (trajRow?.total > 0) {
          computedEffectiveness = trajRow.successful / trajRow.total;
        }
      } catch (e) { /* trajectories may not exist */ }
    }

    stats.foundation = {
      count: foundationRow?.foundation_count || 0,
      summaryCount: foundationRow?.summary_count || 0,
      detailCount: foundationRow?.detail_count || 0,
      avgEffectiveness: sanitizeNumber(
        effectivenessRow?.avg_effectiveness || computedEffectiveness,
        0
      ),
      effectivenessSource: effectivenessRow?.avg_effectiveness
        ? 'metadata'
        : (computedEffectiveness !== null ? 'computed' : 'none')
    };
  } catch (e) {
    stats.foundation = { count: 0, summaryCount: 0, detailCount: 0, avgEffectiveness: 0, effectivenessSource: 'error' };
  }

  return stats;
}

// ═══════════════════════════════════════════════════════════════════════════
// SSOT: NODE TYPE CONFIGURATION
// Single source of truth for categories, colors, icons, shapes, and labels.
// Database-driven: discovers types from actual node data.
// ALL UI components (settings panel, legend, 2D viz, 3D viz) read from this.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Known node type definitions (canonical).
 * Each type has: label, color, svgIcon (14x14 viewBox), shape2d, shape3d.
 * Unknown types get auto-generated entries via buildNodeTypeConfig().
 */
const NODE_TYPE_DEFS = {
  memory: {
    label: 'Memory',
    color: '#6B2FB5',
    svgIcon: '<circle cx="7" cy="7" r="5"/>',
    shape2d: 'circle',
    shape3d: 'sphere',
    order: 0
  },
  neural_pattern: {
    label: 'Neural Pattern',
    color: '#9B59B6',
    svgIcon: '<polygon points="7,1 13,7 7,13 1,7"/>',
    shape2d: 'diamond',
    shape3d: 'icosahedron',
    order: 1
  },
  q_pattern: {
    label: 'Q-Pattern',
    color: '#22D3EE',
    svgIcon: '<rect x="2" y="2" width="10" height="10"/>',
    shape2d: 'square',
    shape3d: 'box',
    order: 2
  },
  trajectory: {
    label: 'Trajectory',
    color: '#22C55E',
    svgIcon: '<polygon points="7,1 13,4.5 11,12 3,12 1,4.5"/>',
    shape2d: 'pentagon',
    shape3d: 'torus',
    order: 3,
    variants: {
      trajectory_success: { label: 'Trajectory (Success)', color: '#22C55E' },
      trajectory_failed:  { label: 'Trajectory (Failed)',  color: '#EF4444' }
    }
  },
  file: {
    label: 'File',
    color: '#1ABC9C',
    svgIcon: '<polygon points="7,1 8.8,4.8 13,5.2 9.8,8.2 10.8,13 7,10.5 3.2,13 4.2,8.2 1,5.2 5.2,4.8"/>',
    shape2d: 'star',
    shape3d: 'octahedron',
    order: 4
  },
  state: {
    label: 'State',
    color: '#F59E0B',
    svgIcon: '<polygon points="3.5,1 10.5,1 14,7 10.5,13 3.5,13 0,7"/>',
    shape2d: 'hexagon',
    shape3d: 'cone',
    order: 5
  },
  action: {
    label: 'Action',
    color: '#10B981',
    svgIcon: '<polygon points="7,2 12,12 2,12"/>',
    shape2d: 'triangle',
    shape3d: 'tetrahedron',
    order: 6
  },
  agent: {
    label: 'Agent',
    color: '#34495E',
    svgIcon: '<polygon points="2,2 12,2 7,12"/>',
    shape2d: 'inverted_triangle',
    shape3d: 'dodecahedron',
    order: 7
  },
  file_type: {
    label: 'File Type',
    color: '#FF6B35',
    svgIcon: '<rect x="3" y="1" width="8" height="12" rx="1"/>',
    shape2d: 'rounded_square',
    shape3d: 'cylinder',
    order: 8
  }
};

/**
 * Normalize a raw source string to its base type.
 * Maps trajectory_success/trajectory_failed → trajectory.
 */
function normalizeSource(source) {
  if (source === 'trajectory_success' || source === 'trajectory_failed') return 'trajectory';
  if (source === 'file_type') return 'file_type';
  return source;
}

/**
 * Build the complete node type config from actual node data.
 * Returns a database-driven SSOT object: known types + any new types discovered.
 * @param {Array} nodes - All graph nodes
 * @returns {Object} nodeTypeConfig
 */
function buildNodeTypeConfig(nodes) {
  // Discover all source types in the data
  const discoveredSources = new Set();
  const counts = {};
  for (const node of nodes) {
    const raw = node.source || 'unknown';
    const base = normalizeSource(raw);
    discoveredSources.add(base);
    counts[base] = (counts[base] || 0) + 1;
  }

  // Build config: known types first, then any unknown types auto-generated
  const config = {};
  const fallbackShapes = ['circle', 'square', 'diamond', 'triangle', 'pentagon', 'hexagon'];
  let unknownIdx = 0;

  // Add all known types (even if 0 nodes — UI might still want to show them)
  for (const [type, def] of Object.entries(NODE_TYPE_DEFS)) {
    config[type] = {
      ...def,
      count: counts[type] || 0,
      active: discoveredSources.has(type)
    };
  }

  // Add unknown types discovered in data
  for (const type of discoveredSources) {
    if (config[type]) continue; // already known
    // Auto-generate appearance
    const hash = [...type].reduce((h, c) => c.charCodeAt(0) + ((h << 5) - h), 0);
    const hue = Math.abs(hash) % 360;
    const color = `hsl(${hue}, 65%, 50%)`;
    config[type] = {
      label: type.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      color,
      svgIcon: '<circle cx="7" cy="7" r="5"/>',
      shape2d: fallbackShapes[unknownIdx % fallbackShapes.length],
      shape3d: 'sphere',
      order: 100 + unknownIdx,
      count: counts[type] || 0,
      active: true
    };
    unknownIdx++;
  }

  return config;
}

// ═══════════════════════════════════════════════════════════════════════════
// GRAPH DATA LOADING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Load and process all graph data from intelligence.db
 * @param {boolean} forceRefresh - Force cache refresh
 * @param {number} similarityThreshold - Minimum similarity for edges
 * @returns {object} Graph data with nodes, edges, and metadata
 */
function loadGraphData(forceRefresh = false, similarityThreshold = EDGE_THRESHOLDS.defaultApi) {
  // Check if database exists
  if (!existsSync(DB_PATH)) {
    console.error(`Database not found: ${DB_PATH}`);
    return {
      nodes: [],
      edges: [],
      meta: { error: 'Database not found', path: DB_PATH },
      stats: {}
    };
  }

  // Check cache validity
  const dbStat = statSync(DB_PATH);
  const cacheKey = `${dbStat.mtimeMs}-${similarityThreshold}`;

  if (!forceRefresh && cachedData && cachedData._cacheKey === cacheKey) {
    console.log('Using cached graph data');
    return cachedData;
  }

  console.log('Loading graph data from intelligence.db...');
  const startTime = Date.now();

  const db = new Database(DB_PATH, { readonly: true });

  // Fetch all data
  const memories = getMemories(db);
  const neuralPatterns = getNeuralPatterns(db);
  const qPatterns = getQLearningPatterns(db);
  const trajectories = getTrajectories(db);
  const fileSequences = getFileSequences(db);
  const learningData = getLearningData(db);
  const stats = getStats(db);

  // NOTE: db.close() moved to after explicit edge loading

  console.log(`  Memories: ${memories.length}`);
  console.log(`  Neural Patterns: ${neuralPatterns.length}`);
  console.log(`  Q-Learning Patterns: ${qPatterns.length}`);
  console.log(`  Trajectories: ${trajectories.length}`);
  console.log(`  File Sequences (co-edits): ${fileSequences.length}`);
  console.log(`  Learning Data: ${learningData ? 'loaded' : 'not found'}`);

  // Build nodes array
  const nodes = [];
  const embeddings = [];
  const namespaces = new Set();
  const namespaceCounts = {};
  const valueLengths = [];
  let totalValueLength = 0;

  // Track which nodes have embeddings for UMAP
  const nodeEmbeddingIndex = new Map();

  // Determine max embedding dimension (384 for memoryV3 all-MiniLM-L6-v2)
  let maxDim = 384;

  // Process memories
  for (const mem of memories) {
    const valueLen = (mem.content || '').length;
    totalValueLength += valueLen;
    valueLengths.push(valueLen);

    namespaces.add(mem.namespace);
    const baseNs = (mem.namespace || 'memory').split('/')[0];
    namespaceCounts[baseNs] = (namespaceCounts[baseNs] || 0) + 1;

    const hasEmbedding = mem.embedding && mem.embedding.length > 0;
    const originalEmbeddingDim = hasEmbedding ? mem.embedding.length : 0;
    // Valid embeddings are 384 dimensions (from all-MiniLM-L6-v2)
    const hasValidEmbedding = originalEmbeddingDim === 384;

    if (hasEmbedding) {
      // Pad embedding to maxDim if needed
      const paddedEmbedding = [...mem.embedding];
      while (paddedEmbedding.length < maxDim) {
        paddedEmbedding.push(0);
      }
      nodeEmbeddingIndex.set(nodes.length, embeddings.length);
      embeddings.push(paddedEmbedding);
    }

    nodes.push({
      id: mem.id,
      key: mem.metadata?.key || `memory-${mem.id}`,
      namespace: mem.namespace,
      domain: mem.domain,  // Memory domain: code, architecture, security, error, test
      preview: (mem.content || '').substring(0, 300),
      color: namespaceToColor(mem.namespace),
      timestamp: mem.timestamp,
      valueLength: valueLen,
      wordCount: (mem.content || '').split(/\s+/).length,
      nsDepth: (mem.namespace || 'memory').split('/').length,
      keyPrefix: mem.memoryType || 'memory',
      contentType: detectContentType(mem.content),
      source: 'memory',
      memoryType: mem.memoryType,
      hasEmbedding,
      hasValidEmbedding,  // True only for 384-dim embeddings
      embeddingDim: originalEmbeddingDim,
      // FIX-016: Foundation RL metadata
      isFoundation: mem.isFoundation,
      layer: mem.layer,
      document: mem.document,
      recallCount: mem.recallCount,
      rewardSum: mem.rewardSum,
      effectiveness: mem.effectiveness,
      lastRecalled: mem.lastRecalled,
      sourceDoc: mem.sourceDoc,
      // Harmonized timestamps
      createdAt: mem.createdAt || null,
      updatedAt: mem.updatedAt || null
    });
  }

  // Process neural patterns
  for (const np of neuralPatterns) {
    const valueLen = (np.content || '').length;
    totalValueLength += valueLen;
    valueLengths.push(valueLen);

    namespaces.add(np.namespace);
    const baseNs = (np.namespace || 'neural_pattern').split('/')[0];
    namespaceCounts[baseNs] = (namespaceCounts[baseNs] || 0) + 1;

    const hasEmbedding = np.embedding && np.embedding.length > 0;
    const originalEmbeddingDim = hasEmbedding ? np.embedding.length : 0;
    const hasValidEmbedding = originalEmbeddingDim === 384;

    if (hasEmbedding) {
      const paddedEmbedding = [...np.embedding];
      while (paddedEmbedding.length < maxDim) {
        paddedEmbedding.push(0);
      }
      nodeEmbeddingIndex.set(nodes.length, embeddings.length);
      embeddings.push(paddedEmbedding);
    }

    nodes.push({
      id: `np-${np.id}`,
      key: `neural-pattern-${np.id}`,
      namespace: np.namespace,
      preview: (np.content || '').substring(0, 300),
      color: namespaceToColor(np.namespace),
      timestamp: np.timestamp,
      valueLength: valueLen,
      wordCount: (np.content || '').split(/\s+/).length,
      nsDepth: 1,
      keyPrefix: 'neural_pattern',
      contentType: detectContentType(np.content),
      source: 'neural_pattern',
      category: np.category,
      confidence: np.confidence,
      usageCount: np.usageCount,
      trajectoryId: (np.metadata && np.metadata.trajectory_id) || null,
      hasEmbedding,
      hasValidEmbedding,
      embeddingDim: originalEmbeddingDim,
      // Harmonized timestamps
      createdAt: np.createdAt || null,
      updatedAt: np.updatedAt || null
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Q-PATTERN NODES (raw, ~97 rows — Q-learning state×action values, IN GRAPH)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('Loading Q-pattern (raw) nodes...');
  let qpNodeCount = 0;

  qPatterns.forEach(qp => {
    const qpId = `qp_${qp.state}_${qp.action}`;
    const content = `Q-Pattern: ${qp.state} → ${qp.action}\nQ-value: ${qp.qValue.toFixed(3)}, Visits: ${qp.visits}`;

    nodes.push({
      id: qpId,
      key: `qp-${qp.state}-${qp.action}`,
      namespace: 'q_pattern',
      preview: content,
      color: namespaceToColor('q_pattern'),
      timestamp: qp.timestamp || null,
      valueLength: content.length,
      wordCount: content.split(/\s+/).length,
      nsDepth: 1,
      keyPrefix: 'qp',
      contentType: 'plain',
      source: 'q_pattern',
      state: qp.state,
      action: qp.action,
      qValue: qp.qValue,
      visits: qp.visits,
      hasEmbedding: false,
      // Harmonized timestamps
      createdAt: qp.createdAt || null,
      updatedAt: qp.updatedAt || null
    });
    qpNodeCount++;
  });
  console.log(`  Added ${qpNodeCount} Q-pattern (raw) nodes`);


  // ═══════════════════════════════════════════════════════════════════════════
  // TRAJECTORY NODES (57 rows — session execution traces, IN GRAPH)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('Loading trajectory nodes...');
  let trajectoryNodeCount = 0;
  const trajectoryNodeMap = new Map();

  trajectories.forEach(traj => {
    const content = `Trajectory: ${traj.agent || 'unknown'}\nContext: ${traj.context || ''}\n${traj.success ? 'Success' : 'Failed'} — ${traj.stepCount || 0} steps`;

    const nodeIdx = nodes.length;
    nodes.push({
      id: traj.id,
      key: `trajectory-${traj.id}`,
      namespace: 'trajectory',
      preview: content,
      color: namespaceToColor(traj.success ? 'trajectory_success' : 'trajectory_failed'),
      timestamp: traj.startTime || traj.timestamp || null,
      valueLength: content.length,
      wordCount: content.split(/\s+/).length,
      nsDepth: 1,
      keyPrefix: 'trajectory',
      contentType: 'plain',
      source: traj.success ? 'trajectory_success' : 'trajectory_failed',
      agent: traj.agent,
      context: traj.context,
      success: traj.success,
      startTime: traj.startTime,
      endTime: traj.endTime,
      stepCount: traj.stepCount,
      steps: traj.steps,
      hasEmbedding: false,
      // Harmonized timestamps
      createdAt: traj.createdAt || null,
      updatedAt: traj.updatedAt || null
    });

    trajectoryNodeMap.set(traj.id, nodeIdx);
    trajectoryNodeCount++;
  });
  console.log(`  Added ${trajectoryNodeCount} trajectory nodes`);


  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1: NEW NODE TYPES - File, Agent, State, Action
  // ═══════════════════════════════════════════════════════════════════════════

  // --- File Nodes: Extract distinct file paths from file_sequences ---
  // (edges table is always empty; file_sequences contains real co-edit data)
  console.log('Extracting file nodes from file_sequences...');
  let fileNodeCount = 0;
  const fileNodeIds = new Set();

  try {
    const filePaths = new Set();
    fileSequences.forEach(seq => {
      filePaths.add(seq.fromFile);
      filePaths.add(seq.toFile);
    });

    filePaths.forEach(rawPath => {
      if (!rawPath || rawPath.length < 3) return;

      const nodeId = `file:${rawPath}`;
      // Skip if this ID is already a node (avoid duplicates with memories)
      if (nodes.some(n => n.id === nodeId)) return;

      const displayPath = rawPath;
      const fileName = displayPath.split('/').pop() || displayPath;
      const fileExt = fileName.includes('.') ? fileName.split('.').pop() : '';

      fileNodeIds.add(nodeId);

      nodes.push({
        id: nodeId,
        key: `file-${displayPath}`,
        namespace: 'file',
        preview: displayPath,
        color: namespaceToColor('file'),
        timestamp: null,
        valueLength: displayPath.length,
        wordCount: 1,
        nsDepth: displayPath.split('/').length,
        keyPrefix: 'file',
        contentType: 'plain',
        source: 'file',
        filePath: displayPath,
        fileName: fileName,
        fileExt: fileExt,
        hasEmbedding: false,
        createdAt: null,
        updatedAt: null
      });
      fileNodeCount++;
    });
    console.log(`  Added ${fileNodeCount} file nodes`);
  } catch (e) {
    console.warn('  Failed to extract file nodes:', e.message);
  }

  // --- File-Type + Agent Nodes: Derived from learning_data qTables2 ---
  // qTables2 maps "edit:.js" → {"javascript-developer": 0.65, ...}
  // Creates file_type nodes (.js, .md, etc.) and agent nodes (learned agent types)
  console.log('Loading agent routing nodes from learning_data...');
  let agentNodeCount = 0;
  let fileTypeNodeCount = 0;
  const fileTypeNodeMap = new Map(); // extension → node index
  const agentNodeMap = new Map();    // agent name → node index
  const routingEdges = [];           // {fileTypeIdx, agentIdx, weight} for edge creation later

  if (learningData) {
    // Merge both Q-tables to get all routing knowledge
    const allQTables = { ...learningData.qTables, ...learningData.qTables2 };

    for (const [state, agents] of Object.entries(allQTables)) {
      // Parse extension from state key (e.g., "edit:.js" → ".js")
      const ext = state.replace(/^[^:]*:/, '');
      if (!ext || ext === state) continue;

      // Create file_type node if not already exists
      if (!fileTypeNodeMap.has(ext)) {
        const ftId = `file_type:${ext}`;
        const content = `File Type: ${ext}`;

        const nodeIdx = nodes.length;
        nodes.push({
          id: ftId,
          key: `filetype-${ext}`,
          namespace: 'file_type',
          preview: content,
          color: namespaceToColor('file'),
          timestamp: null,
          valueLength: content.length,
          wordCount: 1,
          nsDepth: 1,
          keyPrefix: 'file_type',
          contentType: 'plain',
          source: 'file_type',
          fileExt: ext,
          hasEmbedding: false,
          createdAt: null,
          updatedAt: null
        });
        fileTypeNodeMap.set(ext, nodeIdx);
        fileTypeNodeCount++;
      }

      // Create agent nodes for each agent type with a positive weight
      if (typeof agents === 'object' && agents !== null) {
        for (const [agentName, weight] of Object.entries(agents)) {
          if (weight <= 0) continue;

          if (!agentNodeMap.has(agentName)) {
            const agentId = `agent:${agentName}`;
            const content = `Agent: ${agentName}\nRouted by Q-learning`;

            const nodeIdx = nodes.length;
            nodes.push({
              id: agentId,
              key: `agent-${agentName}`,
              namespace: 'agent',
              preview: content,
              color: namespaceToColor('agent'),
              timestamp: null,
              valueLength: content.length,
              wordCount: content.split(/\s+/).length,
              nsDepth: 1,
              keyPrefix: 'agent',
              contentType: 'plain',
              source: 'agent',
              agentId: agentName,
              agentType: agentName,
              agentStatus: 'active',
              agentHealth: (() => {
                const weights = Object.values(agents);
                if (weights.length === 0) return 0.5;
                const maxWeight = Math.max(...weights);
                const avgWeight = weights.reduce((a, b) => a + b, 0) / weights.length;
                return maxWeight > 0 ? Math.min(avgWeight / maxWeight, 1.0) : 0.5;
              })(),
              agentModel: 'unknown',
              agentSourceType: 'q-learning',
              topologyRole: 'worker',
              agentConfig: {},
              hasEmbedding: false,
              createdAt: null,
              updatedAt: null
            });
            agentNodeMap.set(agentName, nodeIdx);
            agentNodeCount++;
          }

          // Record routing edge for later creation
          routingEdges.push({
            fileTypeIdx: fileTypeNodeMap.get(ext),
            agentIdx: agentNodeMap.get(agentName),
            weight: weight
          });
        }
      }
    }
    console.log(`  Added ${fileTypeNodeCount} file-type nodes from Q-tables`);
    console.log(`  Added ${agentNodeCount} agent nodes from Q-tables`);
    console.log(`  Queued ${routingEdges.length} routing edges`);
  } else {
    console.log('  No learning_data found, skipping agent routing nodes');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE NODES (distinct states from Q-table, IN GRAPH)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('Loading state nodes...');
  const stateNodeMap = new Map();
  let stateNodeCount = 0;

  try {
    const stateRows = db.prepare(`
      SELECT state, COUNT(*) as pattern_count,
             AVG(q_value) as avg_q, SUM(visits) as total_visits,
             MAX(last_update) as latest_update,
             MIN(last_update) as earliest_update
      FROM patterns GROUP BY state ORDER BY total_visits DESC
    `).all();

    stateRows.forEach(row => {
      const stateId = `state:${row.state}`;
      const content = `State: ${row.state}\nPatterns: ${row.pattern_count}, Avg Q: ${row.avg_q.toFixed(3)}, Visits: ${row.total_visits}`;

      const nodeIdx = nodes.length;
      nodes.push({
        id: stateId,
        key: `state-${row.state}`,
        namespace: 'state',
        preview: content,
        color: namespaceToColor('state'),
        timestamp: toMilliseconds(row.latest_update) || toMilliseconds(row.earliest_update) || null,
        valueLength: content.length,
        wordCount: content.split(/\s+/).length,
        nsDepth: 1,
        keyPrefix: 'state',
        contentType: 'plain',
        source: 'state',
        stateValue: row.state,
        patternCount: row.pattern_count,
        avgQ: row.avg_q,
        totalVisits: row.total_visits,
        hasEmbedding: false,
        // Harmonized timestamps
        createdAt: toMilliseconds(row.earliest_update) || null,
        updatedAt: toMilliseconds(row.latest_update) || null
      });

      stateNodeMap.set(row.state, nodeIdx);
      stateNodeCount++;
    });
    console.log(`  Added ${stateNodeCount} state nodes`);
  } catch (e) {
    console.warn('  Failed to load state nodes:', e.message);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTION NODES (distinct actions from Q-table, IN GRAPH)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('Loading action nodes...');
  const actionNodeMap = new Map();
  let actionNodeCount = 0;

  try {
    const actionRows = db.prepare(`
      SELECT action, COUNT(*) as pattern_count,
             AVG(q_value) as avg_q, SUM(visits) as total_visits,
             MAX(last_update) as latest_update,
             MIN(last_update) as earliest_update
      FROM patterns GROUP BY action ORDER BY total_visits DESC
    `).all();

    actionRows.forEach(row => {
      const actionId = `action:${row.action}`;
      const content = `Action: ${row.action}\nPatterns: ${row.pattern_count}, Avg Q: ${row.avg_q.toFixed(3)}, Visits: ${row.total_visits}`;

      const nodeIdx = nodes.length;
      nodes.push({
        id: actionId,
        key: `action-${row.action}`,
        namespace: 'action',
        preview: content,
        color: namespaceToColor('action'),
        timestamp: toMilliseconds(row.latest_update) || toMilliseconds(row.earliest_update) || null,
        valueLength: content.length,
        wordCount: content.split(/\s+/).length,
        nsDepth: 1,
        keyPrefix: 'action',
        contentType: 'plain',
        source: 'action',
        actionValue: row.action,
        patternCount: row.pattern_count,
        avgQ: row.avg_q,
        totalVisits: row.total_visits,
        hasEmbedding: false,
        // Harmonized timestamps
        createdAt: toMilliseconds(row.earliest_update) || null,
        updatedAt: toMilliseconds(row.latest_update) || null
      });

      actionNodeMap.set(row.action, nodeIdx);
      actionNodeCount++;
    });
    console.log(`  Added ${actionNodeCount} action nodes`);
  } catch (e) {
    console.warn('  Failed to load action nodes:', e.message);
  }

  // Run UMAP projection for nodes with embeddings
  let positions2D = [];
  if (embeddings.length >= 5) {
    console.log(`Running UMAP on ${embeddings.length} embedded entries...`);
    const umap = new UMAP({
      nComponents: 2,
      nNeighbors: Math.max(2, Math.min(15, Math.floor(embeddings.length / 2))),
      minDist: 0.1,
      spread: 1.0
    });

    positions2D = umap.fit(embeddings);

    // Calculate scale factors
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of positions2D) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const scale = Math.min(3800 / (maxX - minX || 1), 3800 / (maxY - minY || 1));

    // Assign positions to embedded nodes
    nodes.forEach((node, nodeIdx) => {
      if (nodeEmbeddingIndex.has(nodeIdx)) {
        const embIdx = nodeEmbeddingIndex.get(nodeIdx);
        node.x = (positions2D[embIdx][0] - minX) * scale + 150;
        node.y = (positions2D[embIdx][1] - minY) * scale + 150;
      }
    });
  }

  // Layout configuration for cluster positioning
  const LAYOUT = {
    canvas: { width: 4000, height: 4000 },
    clusters: {
      file:       { x: 200,  y: 200,  radius: 200, desc: 'Top-left: File nodes' },
      agent:      { x: 3800, y: 200,  radius: 100, desc: 'Top-right: Agent nodes' },
      fileType:   { x: 2000, y: 150,  radius: 150, desc: 'Top-center: File type nodes' },
      qPattern:   { x: 400,  y: 200,  radius: 80,  desc: 'Near files: Q-patterns' },
      trajectory: { x: 3600, y: 600,  radius: 300, desc: 'Near agents: Trajectories' },
      state:      { x: 1400, y: 3500, radius: 400, desc: 'Bottom-left: States' },
      action:     { x: 2600, y: 3500, radius: 200, desc: 'Bottom-right: Actions' }
    }
  };

  // Position File nodes in top-left cluster
  const fileNodes = nodes.filter(n => n.source === 'file');
  const fileCenterX = LAYOUT.clusters.file.x;
  const fileCenterY = LAYOUT.clusters.file.y;
  fileNodes.forEach((node, i) => {
    const angle = (i / Math.max(fileNodes.length, 1)) * Math.PI * 2;
    const radius = Math.min(LAYOUT.clusters.file.radius, fileNodes.length * 3);
    node.x = fileCenterX + Math.cos(angle) * radius;
    node.y = fileCenterY + Math.sin(angle) * radius * 0.5;
  });
  console.log(`  Positioned ${fileNodes.length} file nodes in cluster`);

  // Position Agent nodes in top-right cluster
  const agentNodes = nodes.filter(n => n.source === 'agent');
  const agentCenterX = LAYOUT.clusters.agent.x;
  const agentCenterY = LAYOUT.clusters.agent.y;
  agentNodes.forEach((node, i) => {
    const angle = (i / Math.max(agentNodes.length, 1)) * Math.PI * 2;
    const radius = Math.min(LAYOUT.clusters.agent.radius, agentNodes.length * 20);
    node.x = agentCenterX + Math.cos(angle) * radius;
    node.y = agentCenterY + Math.sin(angle) * radius * 0.5;
  });
  console.log(`  Positioned ${agentNodes.length} agent nodes in cluster`);

  // Position File-Type nodes between file and agent clusters (they bridge via routes-to edges)
  const fileTypeNodes = nodes.filter(n => n.source === 'file_type');
  const ftCenterX = LAYOUT.clusters.fileType.x;
  const ftCenterY = LAYOUT.clusters.fileType.y;
  fileTypeNodes.forEach((node, i) => {
    const angle = (i / Math.max(fileTypeNodes.length, 1)) * Math.PI * 2;
    const radius = Math.min(LAYOUT.clusters.fileType.radius, fileTypeNodes.length * 20);
    node.x = ftCenterX + Math.cos(angle) * radius;
    node.y = ftCenterY + Math.sin(angle) * radius * 0.5;
  });
  if (fileTypeNodes.length > 0) {
    console.log(`  Positioned ${fileTypeNodes.length} file-type nodes in center`);
  }

  // Position Pat_* nodes near file cluster (they connect to files via routes_to)
  const patNodes = nodes.filter(n => n.source === 'q_pattern');
  const patCenterX = LAYOUT.clusters.qPattern.x;
  const patCenterY = LAYOUT.clusters.qPattern.y;
  patNodes.forEach((node, i) => {
    const angle = (i / Math.max(patNodes.length, 1)) * Math.PI * 2;
    const radius = Math.min(LAYOUT.clusters.qPattern.radius, patNodes.length * 25);
    node.x = patCenterX + Math.cos(angle) * radius;
    node.y = patCenterY + Math.sin(angle) * radius * 0.5;
  });
  if (patNodes.length > 0) {
    console.log(`  Positioned ${patNodes.length} pat_* nodes near file cluster`);
  }

  // Position trajectory nodes near agents
  const trajNodesArr = nodes.filter(n => n.source === 'trajectory_success' || n.source === 'trajectory_failed');
  const trajCenterX = LAYOUT.clusters.trajectory.x;
  const trajCenterY = LAYOUT.clusters.trajectory.y;
  trajNodesArr.forEach((node, i) => {
    const angle = (i / Math.max(trajNodesArr.length, 1)) * Math.PI * 2;
    const radius = Math.min(LAYOUT.clusters.trajectory.radius, trajNodesArr.length * 5);
    node.x = trajCenterX + Math.cos(angle) * radius;
    node.y = trajCenterY + Math.sin(angle) * radius * 0.5;
  });
  if (trajNodesArr.length > 0) {
    console.log(`  Positioned ${trajNodesArr.length} trajectory nodes near agents`);
  }

  // Position Q-pattern raw nodes in center-bottom
  const qpNodesArr = nodes.filter(n => n.keyPrefix === 'qp');
  const qpCenterX = 2000;
  const qpCenterY = 3500;
  qpNodesArr.forEach((node, i) => {
    const angle = (i / Math.max(qpNodesArr.length, 1)) * Math.PI * 2;
    const radius = Math.min(500, qpNodesArr.length * 4);
    node.x = qpCenterX + Math.cos(angle) * radius;
    node.y = qpCenterY + Math.sin(angle) * radius * 0.7;
  });
  if (qpNodesArr.length > 0) {
    console.log(`  Positioned ${qpNodesArr.length} Q-pattern (raw) nodes`);
  }

  // Position state nodes left of Q-learning cluster
  const sNodesArr = nodes.filter(n => n.source === 'state');
  const sCenterX = LAYOUT.clusters.state.x;
  const sCenterY = LAYOUT.clusters.state.y;
  sNodesArr.forEach((node, i) => {
    const angle = (i / Math.max(sNodesArr.length, 1)) * Math.PI * 2;
    const radius = Math.min(LAYOUT.clusters.state.radius, sNodesArr.length * 4);
    node.x = sCenterX + Math.cos(angle) * radius;
    node.y = sCenterY + Math.sin(angle) * radius * 0.7;
  });
  if (sNodesArr.length > 0) {
    console.log(`  Positioned ${sNodesArr.length} state nodes`);
  }

  // Position action nodes right of Q-learning cluster (near agents)
  const aNodesArr = nodes.filter(n => n.source === 'action');
  const aCenterX = LAYOUT.clusters.action.x;
  const aCenterY = LAYOUT.clusters.action.y;
  aNodesArr.forEach((node, i) => {
    const angle = (i / Math.max(aNodesArr.length, 1)) * Math.PI * 2;
    const radius = Math.min(LAYOUT.clusters.action.radius, aNodesArr.length * 15);
    node.x = aCenterX + Math.cos(angle) * radius;
    node.y = aCenterY + Math.sin(angle) * radius * 0.7;
  });
  if (aNodesArr.length > 0) {
    console.log(`  Positioned ${aNodesArr.length} action nodes`);
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE COMPUTATION - DATABASE FIRST, THEN STRUCTURAL, THEN SEMANTIC
  // ═══════════════════════════════════════════════════════════════════════════

  // REMOVED: Unused threshold variable - see EDGE_THRESHOLDS config for active thresholds
  // const SIMILARITY_THRESHOLD = 0.20;
  const MAX_EDGES_PER_NODE = 25;

  const edges = [];
  const allSimilarities = [];
  const edgeSet = new Set(); // Prevent duplicate edges
  const nodeEdgeCounts = new Map(); // Track edges per node

  // Edge types that are SEMANTIC by nature (content similarity, inference-based)
  // Per SSOT: even if computed/stored, classification is based on nature, not source
  const SEMANTIC_EDGE_TYPES = new Set([
    'semantic', 'semantic_similar', 'semantic_bridge', 'embedding',
    'content-match', 'type-mapping', 'cross-type', 'memory-context',
    'same-namespace', 'same-source', 'knn-bridge', 'knn_fallback'
  ]);

  // Determine edge group based on its nature (not where it comes from)
  function getEdgeGroup(edgeType) {
    return SEMANTIC_EDGE_TYPES.has(edgeType) ? 'semantic' : 'deterministic';
  }

  // Helper to add edge with auto-determined group based on type nature
  function addStructuralEdge(source, target, weight, edgeType, createdAt) {
    const edgeKey = `${source}-${target}`;
    const edgeKeyRev = `${target}-${source}`;
    if (edgeSet.has(edgeKey) || edgeSet.has(edgeKeyRev)) {
      return false;
    }

    edgeSet.add(edgeKey);
    const sourceCount = nodeEdgeCounts.get(source) || 0;
    const targetCount = nodeEdgeCounts.get(target) || 0;
    nodeEdgeCounts.set(source, sourceCount + 1);
    nodeEdgeCounts.set(target, targetCount + 1);
    const edge = { source, target, weight, type: edgeType, group: getEdgeGroup(edgeType) };
    if (createdAt) edge.createdAt = createdAt;
    edges.push(edge);
    return true;
  }

  // Build reverse lookup from embedding index to node index
  const embeddingToNode = new Map();
  nodeEmbeddingIndex.forEach((embIdx, nodeIdx) => {
    embeddingToNode.set(embIdx, nodeIdx);
  });

  // Build node index map for efficient lookups (needed for explicit edges)
  const nodeIndex = new Map();
  nodes.forEach((n, idx) => {
    if (n.id) nodeIndex.set(n.id, idx);
    // FIX-010: Also index by raw agentId so instance_of/coordinates edges can find agents
    if (n.source === 'agent' && n.agentId) {
      nodeIndex.set(n.agentId, idx);
    }
  });

  // Simple node reference resolution
  function resolveNodeRef(ref) {
    return nodeIndex.get(ref);
  }

  // Pattern edges and state/action bridge edges are handled via structural edge computation below.
  // Q-table data also served via /api/qtable endpoint for heatmap panel.

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: EXPLICIT EDGES FROM DATABASE (HIGHEST PRIORITY - GROUND TRUTH)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('Loading explicit graph edges from database (FIRST)...');
  let explicitEdgeCount = 0;
  let explicitSkipped = 0;

  try {
    // Check if edges table exists first
    const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='edges'").get();
    console.log(`  Edges table exists: ${tableCheck ? 'YES' : 'NO'}`);

    if (tableCheck) {
      const countCheck = db.prepare('SELECT COUNT(*) as c FROM edges').get();
      console.log(`  Edge count in table: ${countCheck.c}`);

      // Load ALL edges from memoryV3 schema (source, target, weight, data)
      const dbEdges = db.prepare(`
        SELECT source, target, weight, data FROM edges
      `).all();
      console.log(`  Found ${dbEdges.length} edges in database`);

      dbEdges.forEach(e => {
        let edgeData = {};
        try { edgeData = e.data ? JSON.parse(e.data) : {}; } catch(ex) {}
        const edgeType = edgeData.type || edgeData.relation || 'explicit';
        const fromIdx = resolveNodeRef(e.source);
        const toIdx = resolveNodeRef(e.target);

        if (fromIdx !== undefined && toIdx !== undefined && fromIdx !== toIdx) {
          if (addStructuralEdge(fromIdx, toIdx, e.weight || 0.8, edgeType)) {
            explicitEdgeCount++;
          }
        } else {
          explicitSkipped++;
          // Log first 10 failures for debugging
          if (explicitSkipped <= 10) {
            console.warn(`  Edge skipped: ${e.source} -> ${e.target} (type: ${edgeType}, fromIdx: ${fromIdx}, toIdx: ${toIdx})`);
          }
        }
      });
      console.log(`  Skipped ${explicitSkipped} edges (nodes not found)`);
    }
  } catch (e) {
    console.log('  edges table not available or empty:', e.message);
  }

  console.log(`  Added ${explicitEdgeCount} explicit graph edges`);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: COMPUTED STRUCTURAL EDGES
  // ═══════════════════════════════════════════════════════════════════════════

  // Q-pattern and trajectory nodes are now included in the graph.
  // Filter from the main nodes array for structural edge computation.
  // Build reverse lookup: node object → index (avoids O(n) indexOf in hot loops)
  const nodeToIdx = new Map();
  nodes.forEach((n, idx) => nodeToIdx.set(n, idx));

  const qPatternNodesList = nodes.filter(n => n.keyPrefix === 'qp');
  const trajectoryNodesList = nodes.filter(n => n.keyPrefix === 'trajectory');

  // Structural edges for Q-patterns (state prefix + rare action grouping)
  // Strategy: Connect by STATE PREFIX (edit:* together) and RARE actions only
  const statePrefixGroups = new Map();  // "edit" -> [indices]
  const actionGroups = new Map();
  const actionCounts = new Map();

  // First pass: count actions
  qPatternNodesList.forEach(node => {
    if (node.action) {
      actionCounts.set(node.action, (actionCounts.get(node.action) || 0) + 1);
    }
  });

  // Second pass: group by state prefix and rare actions
  qPatternNodesList.forEach(node => {
    const nodeIdx = nodeToIdx.get(node);

    // Group by state PREFIX (e.g., "edit" from "edit:.json")
    if (node.state) {
      const prefix = node.state.split(':')[0];
      if (!statePrefixGroups.has(prefix)) statePrefixGroups.set(prefix, []);
      statePrefixGroups.get(prefix).push(nodeIdx);
    }

    // Only group RARE actions (count <= 3) - avoid "coder" mega-hub
    if (node.action && actionCounts.get(node.action) <= 3) {
      if (!actionGroups.has(node.action)) actionGroups.set(node.action, []);
      actionGroups.get(node.action).push(nodeIdx);
    }
  });

  // Link Q-patterns with same state PREFIX (edit patterns together, but not all interconnected)
  let qPatternEdges = 0;
  statePrefixGroups.forEach((indices, prefix) => {
    // Only connect neighboring pairs, not all-to-all (reduces edges dramatically)
    for (let i = 0; i < indices.length - 1; i++) {
      if (addStructuralEdge(indices[i], indices[i + 1], 0.6, 'same-state-prefix')) {
        qPatternEdges++;
      }
    }
  });

  // Link Q-patterns with same RARE action
  actionGroups.forEach(indices => {
    for (let i = 0; i < indices.length; i++) {
      for (let j = i + 1; j < indices.length; j++) {
        if (addStructuralEdge(indices[i], indices[j], 0.7, 'same-action')) {
          qPatternEdges++;
        }
      }
    }
  });
  console.log(`  Added ${qPatternEdges} Q-pattern structural edges`);

  // Agent routing edges (file_type → agent, from learning_data Q-tables)
  let routingEdgeCount = 0;
  routingEdges.forEach(({ fileTypeIdx, agentIdx, weight }) => {
    if (addStructuralEdge(fileTypeIdx, agentIdx, Math.min(weight / 10, 1.0), 'routes-to')) {
      routingEdgeCount++;
    }
  });
  console.log(`  Added ${routingEdgeCount} agent routing edges (file_type → agent)`);

  // File co-edit sequence edges (file → file from file_sequences)
  let fileSeqEdgeCount = 0;
  fileSequences.forEach(seq => {
    const fromId = `file:${seq.fromFile}`;
    const toId = `file:${seq.toFile}`;
    const fromIdx = nodeIndex.get(fromId);
    const toIdx = nodeIndex.get(toId);
    if (fromIdx !== undefined && toIdx !== undefined && fromIdx !== toIdx) {
      if (addStructuralEdge(fromIdx, toIdx, Math.min(seq.count / 5, 1.0), 'edited-after')) {
        fileSeqEdgeCount++;
      }
    }
  });
  console.log(`  Added ${fileSeqEdgeCount} file ↔ file sequence edges`);

  // Trajectory edges (temporal sequence and agent grouping)
  let trajectoryEdges = 0;
  const sortedTrajectoryNodes = trajectoryNodesList
    .map(n => ({ node: n, idx: nodeToIdx.get(n) }))
    .filter(t => t.node.timestamp)
    .sort((a, b) => a.node.timestamp - b.node.timestamp);

  // Temporal sequence edges
  for (let i = 0; i < sortedTrajectoryNodes.length - 1; i++) {
    if (addStructuralEdge(
      sortedTrajectoryNodes[i].idx,
      sortedTrajectoryNodes[i + 1].idx,
      0.7,
      'trajectory-sequence'
    )) {
      trajectoryEdges++;
    }
  }

  // Group trajectories by agent
  const agentGroups = new Map();
  trajectoryNodesList.forEach(node => {
    const nodeIdx = nodeToIdx.get(node);
    if (node.agent) {
      if (!agentGroups.has(node.agent)) agentGroups.set(node.agent, []);
      agentGroups.get(node.agent).push(nodeIdx);
    }
  });

  // Same-agent edges
  agentGroups.forEach(indices => {
    for (let i = 0; i < indices.length - 1; i++) {
      if (addStructuralEdge(indices[i], indices[i + 1], 0.6, 'same-agent')) {
        trajectoryEdges++;
      }
    }
  });

  // Success/failure cluster edges
  const successIndices = trajectoryNodesList
    .filter(n => n.success)
    .map(n => nodeToIdx.get(n));
  const failureIndices = trajectoryNodesList
    .filter(n => !n.success)
    .map(n => nodeToIdx.get(n));

  // Link nearby successful trajectories
  for (let i = 0; i < successIndices.length; i++) {
    for (let j = i + 1; j < Math.min(i + 3, successIndices.length); j++) {
      if (addStructuralEdge(successIndices[i], successIndices[j], 0.5, 'success-cluster')) {
        trajectoryEdges++;
      }
    }
  }

  // Link nearby failed trajectories
  for (let i = 0; i < failureIndices.length; i++) {
    for (let j = i + 1; j < Math.min(i + 3, failureIndices.length); j++) {
      if (addStructuralEdge(failureIndices[i], failureIndices[j], 0.5, 'failure-cluster')) {
        trajectoryEdges++;
      }
    }
  }

  console.log(`  Added ${trajectoryEdges} trajectory structural edges`);

  // ===========================================
  // WORKFLOW EDGES: Computed from RuVector data
  // ===========================================

  // --- 1. Temporal Edges: Trajectory → Memory ---
  console.log('Computing temporal edges (trajectory → memories)...');
  let temporalEdgeCount = 0;

  trajectoryNodesList.forEach(trajNode => {
    const trajIdx = nodeToIdx.get(trajNode);
    if (trajIdx == null) return;

    // Find memories created during this trajectory's time window
    const startTime = trajNode.startTime || trajNode.start_time || trajNode.timestamp;
    const endTime = trajNode.endTime || trajNode.end_time || trajNode.timestamp;
    if (!startTime || !endTime) return;

    const startTs = toSeconds(startTime);
    const endTs = toSeconds(endTime);

    // Widen temporal window: trajectory rows have start===end (single event),
    // so use +/- 60s to capture memories created around the same action (doc 08 §3)
    const TEMPORAL_WINDOW_SEC = 60;
    const windowStart = startTs - TEMPORAL_WINDOW_SEC;
    const windowEnd = endTs + TEMPORAL_WINDOW_SEC;

    nodes.forEach((memNode, memIdx) => {
      if (memNode.source !== 'memory' && memNode.source !== 'neural_pattern') return;
      if (!memNode.timestamp) return;

      const memTs = toSeconds(memNode.timestamp);

      if (memTs >= windowStart && memTs <= windowEnd) {
        if (addStructuralEdge(trajIdx, memIdx, 0.9, 'trajectory-memory')) {
          temporalEdgeCount++;
        }
      }
    });
  });

  console.log(`  Added ${temporalEdgeCount} temporal (trajectory→memory) edges`);

  // --- 1b. State→memory_type bridge edges (doc 08 §3) ---
  // Connect trajectory states like "edit_js_in_project" to memories with matching memory_type
  console.log('Computing state→memory_type bridge edges...');
  let bridgeEdgeCount = 0;
  const stateTypeMap = { edit: 'edit', cmd: 'command', search: 'search_pattern', agent: 'agent_spawn' };

  trajectoryNodesList.forEach(trajNode => {
    const trajIdx = nodeToIdx.get(trajNode);
    if (trajIdx == null) return;
    const state = trajNode.state || '';
    const statePrefix = state.split('_')[0]; // "edit", "cmd", etc.
    const matchType = stateTypeMap[statePrefix];
    if (!matchType) return;

    let linked = 0;
    nodes.forEach((memNode, memIdx) => {
      if (memNode.source !== 'memory') return;
      if (memNode.memoryType !== matchType) return;
      if (linked >= 3) return; // cap to avoid clutter
      if (addStructuralEdge(trajIdx, memIdx, 0.4, 'state-type-bridge')) {
        bridgeEdgeCount++;
        linked++;
      }
    });
  });

  console.log(`  Added ${bridgeEdgeCount} state→memory_type bridge edges`);

  // --- 2. Co-Edit Edges: File → File patterns (using pre-loaded fileSequences) ---
  console.log('Computing co-edit edges...');
  let coeditEdgeCount = 0;

  fileSequences.forEach(seq => {
    // Find memories that mention these files
    const fromMemIndices = [];
    const toMemIndices = [];

    nodes.forEach((n, idx) => {
      if (n.source !== 'memory') return;
      const content = (n.preview || n.content || n.value || '').toLowerCase();
      const fromFile = seq.fromFile.toLowerCase();
      const toFile = seq.toFile.toLowerCase();

      if (content.includes(fromFile) || content.includes(fromFile.split('/').pop())) {
        fromMemIndices.push(idx);
      }
      if (content.includes(toFile) || content.includes(toFile.split('/').pop())) {
        toMemIndices.push(idx);
      }
    });

    // Connect from_file memories to to_file memories
    fromMemIndices.forEach(fromIdx => {
      toMemIndices.forEach(toIdx => {
        if (fromIdx !== toIdx) {
          const weight = Math.min(seq.count / 10, 1.0);
          if (addStructuralEdge(fromIdx, toIdx, weight, 'coedit')) {
            coeditEdgeCount++;
          }
        }
      });
    });
  });

  console.log(`  Added ${coeditEdgeCount} co-edit edges`);

  // --- 3. Sequence Edges: Step → Step within trajectories ---
  console.log('Computing trajectory sequence edges...');
  let sequenceEdgeCount = 0;

  trajectoryNodesList.forEach(trajNode => {
    if (!trajNode.steps) return;

    try {
      const steps = typeof trajNode.steps === 'string' ? JSON.parse(trajNode.steps) : trajNode.steps;
      if (!Array.isArray(steps) || steps.length < 2) return;

      // For each pair of consecutive steps, find closest memories by timestamp
      for (let i = 0; i < steps.length - 1; i++) {
        const step1 = steps[i];
        const step2 = steps[i + 1];

        if (!step1.time || !step2.time) continue;

        // Find memory closest to step1 time
        let closest1Idx = -1;
        let closest1Diff = Infinity;

        // Find memory closest to step2 time
        let closest2Idx = -1;
        let closest2Diff = Infinity;

        nodes.forEach((n, idx) => {
          if (n.source !== 'memory') return;
          if (!n.timestamp) return;

          const memTs = n.timestamp > 1e12 ? n.timestamp : n.timestamp * 1000;
          const diff1 = Math.abs(memTs - step1.time);
          const diff2 = Math.abs(memTs - step2.time);

          // Within 60 seconds
          if (diff1 < 60000 && diff1 < closest1Diff) {
            closest1Diff = diff1;
            closest1Idx = idx;
          }
          if (diff2 < 60000 && diff2 < closest2Diff) {
            closest2Diff = diff2;
            closest2Idx = idx;
          }
        });

        // Connect the two closest memories
        if (closest1Idx !== -1 && closest2Idx !== -1 && closest1Idx !== closest2Idx) {
          if (addStructuralEdge(closest1Idx, closest2Idx, 0.85, 'sequence')) {
            sequenceEdgeCount++;
          }
        }
      }
    } catch (e) {
      // Skip malformed trajectories
    }
  });

  console.log(`  Added ${sequenceEdgeCount} sequence edges`);

  // --- 4. Trajectory → Q-Pattern Edges: Link trajectories to their actions ---
  console.log('Computing trajectory → Q-pattern edges...');
  let trajQPatternEdgeCount = 0;

  // Build action mapping from Q-patterns
  const qPatternByState = new Map();
  const qPatternByAction = new Map();
  qPatternNodesList.forEach(qNode => {
    const qIdx = nodeToIdx.get(qNode);
    if (qNode.state) {
      // Extract base state (e.g., "edit" from "edit:.md")
      const baseState = qNode.state.split(':')[0].replace(/_/g, '');
      if (!qPatternByState.has(baseState)) qPatternByState.set(baseState, []);
      qPatternByState.get(baseState).push(qIdx);
    }
    if (qNode.action) {
      const baseAction = qNode.action.toLowerCase();
      if (!qPatternByAction.has(baseAction)) qPatternByAction.set(baseAction, []);
      qPatternByAction.get(baseAction).push(qIdx);
    }
  });

  trajectoryNodesList.forEach(trajNode => {
    const trajIdx = nodeToIdx.get(trajNode);
    if (trajIdx == null || !trajNode.steps) return;

    const steps = typeof trajNode.steps === 'string' ? JSON.parse(trajNode.steps) : trajNode.steps;
    if (!Array.isArray(steps)) return;

    // Collect unique action types from this trajectory's steps
    const actionTypes = new Set();
    steps.forEach(step => {
      if (step.action) {
        // Extract action type (e.g., "bash" from "bash:", "edit" from "edit:")
        const actionBase = step.action.replace(/[:\s]/g, '').toLowerCase();
        actionTypes.add(actionBase);
      }
    });

    // Link trajectory to Q-patterns with matching states
    actionTypes.forEach(actionType => {
      // Match by state (e.g., trajectory "edit" action → Q-pattern with state "edit:...")
      const matchingByState = qPatternByState.get(actionType) || [];
      matchingByState.forEach(qIdx => {
        if (addStructuralEdge(trajIdx, qIdx, 0.75, 'trajectory-action')) {
          trajQPatternEdgeCount++;
        }
      });

      // Also check for cmd/shell patterns for bash actions
      if (actionType === 'bash' || actionType === 'shell' || actionType === 'cmd') {
        ['cmd', 'shell', 'bash'].forEach(prefix => {
          const cmdPatterns = qPatternByState.get(prefix) || [];
          cmdPatterns.forEach(qIdx => {
            if (addStructuralEdge(trajIdx, qIdx, 0.7, 'trajectory-action')) {
              trajQPatternEdgeCount++;
            }
          });
        });
      }
    });

    // Link to success/failure Q-patterns based on trajectory success
    if (trajNode.success) {
      const successPatterns = qPatternByAction.get('success') || [];
      successPatterns.forEach(qIdx => {
        if (addStructuralEdge(trajIdx, qIdx, 0.6, 'trajectory-outcome')) {
          trajQPatternEdgeCount++;
        }
      });
    }
  });

  console.log(`  Added ${trajQPatternEdgeCount} trajectory → Q-pattern edges`);

  // --- 5. Memory/NeuralPattern → Q-Pattern Cross-Type Edges ---
  // AGGRESSIVE: Every memory/neural pattern gets connected to at least 1 Q-pattern
  console.log('Computing cross-type edges (memory/neural → Q-patterns)...');
  let crossTypeEdgeCount = 0;

  // Build Q-pattern word index for matching
  const qPatternWords = new Map(); // word -> [qIdx, ...]
  const qPatternIndices = qPatternNodesList.map(n => nodeToIdx.get(n));

  qPatternNodesList.forEach((qNode, i) => {
    const qIdx = qPatternIndices[i];
    const state = (qNode.state || '').toLowerCase();
    const action = (qNode.action || '').toLowerCase();

    // Index by all words in state and action
    const words = (state + ' ' + action).split(/[_:\-\/\s]+/).filter(w => w.length > 2);
    words.forEach(word => {
      if (!qPatternWords.has(word)) qPatternWords.set(word, []);
      qPatternWords.get(word).push(qIdx);
    });
  });

  // Process memories and neural patterns
  const contentNodes = nodes.filter(n => n.source === 'memory' || n.source === 'neural_pattern');

  contentNodes.forEach(node => {
    const nodeIdx = nodeToIdx.get(node);
    const content = ((node.preview || '') + ' ' + (node.namespace || '') + ' ' + (node.key || '')).toLowerCase();
    const contentWords = content.split(/\s+/).filter(w => w.length > 3);
    const linkedQPatterns = new Set();

    // Score each Q-pattern by word overlap
    const qScores = new Map();
    contentWords.forEach(word => {
      const matchingQ = qPatternWords.get(word) || [];
      matchingQ.forEach(qIdx => {
        qScores.set(qIdx, (qScores.get(qIdx) || 0) + 1);
      });
    });

    // Sort by score and connect to top matches
    const sortedQ = [...qScores.entries()].sort((a, b) => b[1] - a[1]);

    // Connect to top 3 matching Q-patterns (if any match)
    sortedQ.slice(0, 3).forEach(([qIdx, score]) => {
      if (score >= 1 && !linkedQPatterns.has(qIdx)) {
        linkedQPatterns.add(qIdx);
        if (addStructuralEdge(nodeIdx, qIdx, Math.min(0.3 + score * 0.1, 0.8), 'content-match')) {
          crossTypeEdgeCount++;
        }
      }
    });

    // FALLBACK: If no word matches, connect by memory_type → Q-pattern state mapping
    if (linkedQPatterns.size === 0 && qPatternIndices.length > 0) {
      const memType = (node.memoryType || node.namespace || '').toLowerCase();

      // Map memory types to Q-pattern states
      let targetStates = [];
      if (memType.includes('command') || memType.includes('bash') || memType.includes('shell')) {
        targetStates = ['cmd_shell_general', 'cmd'];
      } else if (memType.includes('edit') || memType.includes('file')) {
        targetStates = ['edit', 'edit__in_project'];
      } else if (memType.includes('fix') || memType.includes('bug') || memType.includes('error')) {
        targetStates = ['fix'];
      } else if (memType.includes('test')) {
        targetStates = ['test'];
      } else if (memType.includes('file_access')) {
        targetStates = ['edit', 'edit__in_project'];
      } else if (memType.includes('project')) {
        targetStates = ['edit', 'agent'];
      } else if (memType.includes('search_pattern') || memType.includes('search')) {
        targetStates = ['search', 'cmd'];
      } else if (memType.includes('agent_spawn') || memType.includes('agent')) {
        targetStates = ['agent', 'cmd'];
      }

      // Find matching Q-patterns by state prefix
      if (targetStates.length > 0) {
        qPatternNodesList.forEach((qNode, i) => {
          const qIdx = qPatternIndices[i];
          const qState = (qNode.state || '').toLowerCase();
          const statePrefix = qState.split(':')[0];

          if (targetStates.includes(statePrefix) && !linkedQPatterns.has(qIdx)) {
            linkedQPatterns.add(qIdx);
            if (addStructuralEdge(nodeIdx, qIdx, 0.35, 'type-mapping')) {
              crossTypeEdgeCount++;
            }
          }
        });
      }
    }
  });

  console.log(`  Added ${crossTypeEdgeCount} cross-type edges (memory/neural → Q-patterns)`);

  // --- 6. Memory → Trajectory Edges (by agent/context matching) ---
  console.log('Computing memory → trajectory edges...');
  let memTrajEdgeCount = 0;

  trajectoryNodesList.forEach(trajNode => {
    const trajIdx = nodeToIdx.get(trajNode);
    const agent = (trajNode.agent || '').toLowerCase();
    const context = (trajNode.context || '').toLowerCase();
    const contextWords = context.split(/\s+/).filter(w => w.length > 4);

    contentNodes.forEach(memNode => {
      const memIdx = nodeToIdx.get(memNode);
      const memContent = ((memNode.preview || '') + ' ' + (memNode.namespace || '')).toLowerCase();

      // Match by agent name
      if (agent && agent !== 'unknown' && memContent.includes(agent)) {
        if (addStructuralEdge(memIdx, trajIdx, 0.55, 'memory-agent')) {
          memTrajEdgeCount++;
        }
        return;
      }

      // Match by context keywords (at least 2 matching words)
      let matchCount = 0;
      contextWords.forEach(word => {
        if (memContent.includes(word)) matchCount++;
      });
      if (matchCount >= 2) {
        if (addStructuralEdge(memIdx, trajIdx, 0.4, 'memory-context')) {
          memTrajEdgeCount++;
        }
      }
    });
  });

  console.log(`  Added ${memTrajEdgeCount} memory → trajectory edges`);

  // ═══════════════════════════════════════════════════════════════════════════
  // FILE ↔ FILE CO-EDIT EDGES: Use existing relationships from edges table
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('Computing file ↔ file co-edit edges...');
  let fileCoEditCount = 0;

  // Build a map of file path → node index
  const filePathToIdx = new Map();
  nodes.forEach((n, idx) => {
    if (n.source === 'file') {
      // Store both with and without "file:" prefix for matching
      filePathToIdx.set(n.filePath, idx);
      filePathToIdx.set(n.fileName, idx);
    }
  });

  // Query co-edit edges from fileSequences (already loaded)
  fileSequences.forEach(seq => {
    const fromIdx = filePathToIdx.get(seq.fromFile) || filePathToIdx.get(seq.fromFile.split('/').pop());
    const toIdx = filePathToIdx.get(seq.toFile) || filePathToIdx.get(seq.toFile.split('/').pop());

    if (fromIdx !== undefined && toIdx !== undefined && fromIdx !== toIdx) {
      const weight = Math.min(seq.count / 5, 1.0);  // Normalize by count
      if (addStructuralEdge(fromIdx, toIdx, weight, 'file-coedit')) {
        fileCoEditCount++;
      }
    }
  });

  console.log(`  Added ${fileCoEditCount} file ↔ file co-edit edges`);

  // ═══════════════════════════════════════════════════════════════════════════
  // AGENT HIERARCHY + TRAJECTORY BRIDGE EDGES
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('Computing agent hierarchy and trajectory bridge edges...');
  let agentHierarchyCount = 0;
  let agentBridgeCount = 0;

  const agentNodesList = nodes.filter(n => n.source === 'agent');

  // Find the queen agent (coordinator)
  const queenAgent = agentNodesList.find(a =>
    (a.agentId || '').includes('queen') || (a.agentType || '').includes('coordinator')
  );
  const queenIdx = queenAgent ? nodeToIdx.get(queenAgent) : undefined;

  // Build agentType → trajectory agent mapping
  // From agents table: backend-worker (type: coder), frontend-worker (type: coder)
  // From trajectories: claude, coder, tester
  const trajAgentToIdx = new Map();
  trajectoryNodesList.forEach(trajNode => {
    const trajAgent = (trajNode.agent || '').toLowerCase();
    if (trajAgent && !trajAgentToIdx.has(trajAgent)) {
      // Find or create a virtual node for this trajectory agent? No - just track indices
      trajAgentToIdx.set(trajAgent, nodeToIdx.get(trajNode));
    }
  });

  agentNodesList.forEach(agentNode => {
    const agentIdx = nodeToIdx.get(agentNode);
    const agentId = (agentNode.agentId || '').toLowerCase();
    const agentType = (agentNode.agentType || '').toLowerCase();

    // 1. Hierarchy: Queen → Workers
    if (queenIdx != null && agentIdx !== queenIdx) {
      if (addStructuralEdge(queenIdx, agentIdx, 0.9, 'agent-hierarchy')) {
        agentHierarchyCount++;
      }
    }

    // 2. Bridge: Workers → Trajectory agents via agentType
    // backend-worker (type: coder) → trajectories by agent "coder"
    if (agentType) {
      trajectoryNodesList.forEach(trajNode => {
        const trajAgent = (trajNode.agent || '').toLowerCase();
        const trajIdx = nodeToIdx.get(trajNode);

        // Match agentType to trajectory agent name
        if (trajAgent === agentType || agentType.includes(trajAgent) || trajAgent.includes(agentType)) {
          if (addStructuralEdge(agentIdx, trajIdx, 0.75, 'agent-instance')) {
            agentBridgeCount++;
          }
        }
      });
    }
  });

  console.log(`  Added ${agentHierarchyCount} agent hierarchy edges (queen → workers)`);
  console.log(`  Added ${agentBridgeCount} agent → trajectory bridge edges`);

  // ═══════════════════════════════════════════════════════════════════════════
  // FIX-V04: Q-PATTERN → STATE/ACTION STRUCTURAL EDGES
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('Building Q-pattern → State/Action edges...');
  let qpStateEdges = 0, qpActionEdges = 0;

  // qPatterns was loaded earlier; stateNodeMap and actionNodeMap were built during node construction
  if (stateNodeMap.size > 0 || actionNodeMap.size > 0) {
    nodes.forEach((node, nodeIdx) => {
      if (node.keyPrefix !== 'qp') return;

      // has_state edge: qp_* → state:*
      if (node.state && stateNodeMap.has(node.state)) {
        const stateIdx = stateNodeMap.get(node.state);
        if (addStructuralEdge(nodeIdx, stateIdx, 0.8, 'has_state')) {
          qpStateEdges++;
        }
      }

      // has_action edge: qp_* → action:*
      if (node.action && actionNodeMap.has(node.action)) {
        const actionIdx = actionNodeMap.get(node.action);
        if (addStructuralEdge(nodeIdx, actionIdx, 0.8, 'has_action')) {
          qpActionEdges++;
        }
      }
    });
  }
  console.log(`  Added ${qpStateEdges} has_state + ${qpActionEdges} has_action edges`);

  // ═══════════════════════════════════════════════════════════════════════════
  // FIX-V05: ACTION → AGENT EDGES (where action name matches agents.id)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('Building action → agent edges...');
  let isAgentEdges = 0;

  if (actionNodeMap.size > 0) {
    actionNodeMap.forEach((actionIdx, actionValue) => {
      // Try both prefixed and raw agent ID lookups
      const agentIdx = nodeIndex.get(`agent:${actionValue}`) ?? nodeIndex.get(actionValue);
      if (agentIdx !== undefined && agentIdx !== actionIdx) {
        if (addStructuralEdge(actionIdx, agentIdx, 0.9, 'is_agent')) {
          isAgentEdges++;
        }
      }
    });
  }
  console.log(`  Added ${isAgentEdges} is_agent edges (action → agent)`);

  // ═══════════════════════════════════════════════════════════════════════════
  // FIX-V06: TRAJECTORY → AGENT and TRAJECTORY → NEURAL PATTERN EDGES
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('Building trajectory → agent/neural edges...');
  let trajAgentEdges = 0, trajNeuralEdges = 0;

  if (trajectoryNodeMap.size > 0) {
    // trajectory → agent (by agent field)
    nodes.forEach((node, nodeIdx) => {
      if (node.keyPrefix !== 'trajectory') return;
      if (!node.agent) return;

      const agentIdx = nodeIndex.get(`agent:${node.agent}`) ?? nodeIndex.get(node.agent);
      if (agentIdx !== undefined && agentIdx !== nodeIdx) {
        if (addStructuralEdge(nodeIdx, agentIdx, 0.85, 'trajectory-agent')) {
          trajAgentEdges++;
        }
      }
    });

    // trajectory ← neural_pattern (via metadata.trajectory_id)
    nodes.forEach((node, nodeIdx) => {
      if (node.source !== 'neural_pattern') return;
      const trajId = node.trajectoryId;
      if (!trajId) return;

      const trajIdx = trajectoryNodeMap.get(trajId);
      if (trajIdx !== undefined && trajIdx !== nodeIdx) {
        if (addStructuralEdge(trajIdx, nodeIdx, 0.9, 'trajectory-neural')) {
          trajNeuralEdges++;
        }
      }
    });
  }
  console.log(`  Added ${trajAgentEdges} trajectory→agent + ${trajNeuralEdges} trajectory→neural edges`);

  // ═══════════════════════════════════════════════════════════════════════════
  // SAME-STATE-PREFIX EDGES (group states by prefix: edit:*, cmd_*, traj_*, fix:*)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('Building same-state-prefix edges...');
  let statePrefixEdgeCount = 0;

  if (stateNodeMap.size > 0) {
    const prefixGroups = new Map();
    stateNodeMap.forEach((nodeIdx, stateValue) => {
      const prefix = stateValue.split(/[:_]/)[0];
      if (!prefixGroups.has(prefix)) prefixGroups.set(prefix, []);
      prefixGroups.get(prefix).push(nodeIdx);
    });

    prefixGroups.forEach((indices, prefix) => {
      // Connect sequential pairs within each prefix group
      for (let i = 0; i < indices.length - 1; i++) {
        if (addStructuralEdge(indices[i], indices[i + 1], 0.6, 'same-state-prefix')) {
          statePrefixEdgeCount++;
        }
      }
    });
  }
  console.log(`  Added ${statePrefixEdgeCount} same-state-prefix edges`);

  // Close database connection after all structural edge loading is complete
  db.close();

  // ═══════════════════════════════════════════════════════════════════════════
  // MEMORY SEMANTIC EDGES - Computed by viz layer using cosine similarity
  // NOTE: The edges table now contains semantic memory-to-memory edges (≥0.55)
  // This section computes additional high-similarity edges for visualization
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('Computing memory semantic edges (cosine similarity)...');

  const SEMANTIC_THRESHOLD = 0.55;  // Minimum similarity for semantic edge (matches DB threshold)
  const MAX_SEMANTIC_EDGES_PER_NODE = 15;  // Limit edges per node to avoid clutter
  let semanticEdgeCount = 0;
  const semanticEdgesPerNode = new Map();

  // Get nodes with valid embeddings for pairwise similarity.
  // Node types WITH 384d embeddings:  memory, neural_pattern
  // Node types WITHOUT embeddings:    q_pattern, state, action, trajectory_success,
  //                                   trajectory_failed, file, agent
  // The filter below uses three guards:
  //   1) source must be memory or neural_pattern
  //   2) node.hasValidEmbedding must be true
  //   3) nodeEmbeddingIndex must contain the node index
  // This ensures nodes without embeddings (hasEmbedding: false) never enter the O(n^2) loop.
  const nodesWithEmbeddings = [];
  nodes.forEach((node, idx) => {
    if (!node.hasValidEmbedding) return;  // explicit guard: skip all non-embedded nodes
    if ((node.source === 'memory' || node.source === 'neural_pattern') &&
        nodeEmbeddingIndex.has(idx)) {
      const embIdx = nodeEmbeddingIndex.get(idx);
      const embedding = embeddings[embIdx];
      if (embedding) {
        // Use first 384 dims (rest are padding zeros)
        nodesWithEmbeddings.push({ nodeIdx: idx, embIdx, embedding: embedding.slice(0, 384) });
      }
    }
  });

  console.log(`  Found ${nodesWithEmbeddings.length} nodes with valid 384-dim embeddings`);

  // Check if database already has semantic edges
  const dbSemanticCount = edges.filter(e => e.type === 'semantic').length;
  if (dbSemanticCount > 0) {
    console.log(`  Using ${dbSemanticCount} pre-computed semantic edges from database (skipping O(n²) computation)`);
  } else {
    // Compute pairwise similarities only if database doesn't have them
    console.log('  Computing memory semantic edges (no pre-computed edges in DB)...');
  for (let i = 0; i < nodesWithEmbeddings.length; i++) {
    const nodeA = nodesWithEmbeddings[i];

    // Check if this node has reached its edge limit
    const countA = semanticEdgesPerNode.get(nodeA.nodeIdx) || 0;
    if (countA >= MAX_SEMANTIC_EDGES_PER_NODE) continue;

    for (let j = i + 1; j < nodesWithEmbeddings.length; j++) {
      const nodeB = nodesWithEmbeddings[j];

      // Check if target node has reached its edge limit
      const countB = semanticEdgesPerNode.get(nodeB.nodeIdx) || 0;
      if (countB >= MAX_SEMANTIC_EDGES_PER_NODE) continue;

      // Compute cosine similarity
      const similarity = cosineSimilarity(nodeA.embedding, nodeB.embedding);

      if (similarity >= SEMANTIC_THRESHOLD) {
        // Add semantic edge
        if (addStructuralEdge(nodeA.nodeIdx, nodeB.nodeIdx, similarity, 'semantic')) {
          semanticEdgeCount++;
          semanticEdgesPerNode.set(nodeA.nodeIdx, countA + 1);
          semanticEdgesPerNode.set(nodeB.nodeIdx, countB + 1);
        }
      }
    }
  }

  console.log(`  Added ${semanticEdgeCount} memory semantic edges (threshold: ${SEMANTIC_THRESHOLD})`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FIX-014-VIZ: K-NN Fallback for Orphan Nodes
  // Nodes with valid embeddings but 0 edges get connected to K nearest neighbors
  // ═══════════════════════════════════════════════════════════════════════════
  const KNN_K = 3;  // Connect orphans to 3 nearest neighbors
  let knnEdgeCount = 0;

  // Find orphan nodes (valid embedding, 0 total edges including all types)
  const allConnected = new Set();
  edges.forEach(e => {
    allConnected.add(e.source);
    allConnected.add(e.target);
  });

  const orphanNodes = nodesWithEmbeddings.filter(n => !allConnected.has(n.nodeIdx));
  console.log(`  Found ${orphanNodes.length} orphan nodes with embeddings → applying K-NN (k=${KNN_K})`);

  for (const orphan of orphanNodes) {
    // Compute similarity to all other embedded nodes, keep top K
    const similarities = [];
    for (const candidate of nodesWithEmbeddings) {
      if (candidate.nodeIdx === orphan.nodeIdx) continue;
      const sim = cosineSimilarity(orphan.embedding, candidate.embedding);
      similarities.push({ nodeIdx: candidate.nodeIdx, similarity: sim });
    }

    // Sort by similarity descending, take top K
    similarities.sort((a, b) => b.similarity - a.similarity);
    const topK = similarities.slice(0, KNN_K);

    for (const neighbor of topK) {
      if (addStructuralEdge(orphan.nodeIdx, neighbor.nodeIdx, neighbor.similarity, 'knn_fallback')) {
        knnEdgeCount++;
      }
    }
  }

  if (knnEdgeCount > 0) {
    console.log(`  Added ${knnEdgeCount} K-NN fallback edges for ${orphanNodes.length} orphans`);
  }

  // Calculate connection counts
  const connectionCounts = new Map();
  edges.forEach(e => {
    connectionCounts.set(e.source, (connectionCounts.get(e.source) || 0) + 1);
    connectionCounts.set(e.target, (connectionCounts.get(e.target) || 0) + 1);
  });

  nodes.forEach((n, i) => {
    n.connectionCount = connectionCounts.get(i) || 0;
  });

  // Timeline data
  const nodeTimestamps = nodes.map(n => n.timestamp).filter(t => t && t > 0);
  const minTimestamp = nodeTimestamps.length > 0 ? Math.min(...nodeTimestamps) : 0;
  const maxTimestamp = nodeTimestamps.length > 0 ? Math.max(...nodeTimestamps) : 0;

  const byDay = {};
  nodes.forEach(n => {
    if (n.timestamp) {
      const day = new Date(n.timestamp).toISOString().split('T')[0];
      byDay[day] = (byDay[day] || 0) + 1;
    }
  });

  nodes.forEach(n => {
    if (n.timestamp) {
      const day = new Date(n.timestamp).toISOString().split('T')[0];
      n.rate = byDay[day] || 1;
    }
  });

  const loadTime = Date.now() - startTime;

  // Add nodeIndex to each node for D3 forceLink
  nodes.forEach((n, idx) => {
    n.nodeIndex = idx;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // HYPEREDGES: Group nodes by memory_type for convex hull rendering
  // ═══════════════════════════════════════════════════════════════════════════
  const hyperedges = [];
  const hyperedgeColors = {
    command: '#3498DB',
    edit: '#E74C3C',
    error: '#9B59B6',
    context: '#2ECC71',
    code: '#F39C12',
    architecture: '#1ABC9C',
    security: '#E91E63',
    test: '#00BCD4',
    file: '#795548',
    file_type: '#FF6B35',
    agent: '#FF5722',
    state: '#673AB7',
    action: '#009688',
    q_pattern: '#FF5722',
    trajectory_success: '#4CAF50',
    trajectory_failed: '#F44336'
  };

  // Group by memory_type
  const memoryTypeGroups = new Map();
  nodes.forEach((n, idx) => {
    if (n.source === 'memory' && n.memoryType) {
      const type = n.memoryType;
      if (!memoryTypeGroups.has(type)) memoryTypeGroups.set(type, []);
      memoryTypeGroups.get(type).push(idx);
    }
  });

  // Create hyperedges for groups with 4+ members
  memoryTypeGroups.forEach((memberIndices, memType) => {
    if (memberIndices.length >= 4) {
      hyperedges.push({
        id: `type:${memType}`,
        type: 'memory_group',
        label: memType,
        members: memberIndices,
        color: hyperedgeColors[memType] || namespaceToColor(memType),
        memberCount: memberIndices.length
      });
    }
  });

  // Group by Node type for structural cluster hyperedges
  // Includes all non-memory/neural node types that form visual clusters
  const sourceGroups = new Map();
  nodes.forEach((n, idx) => {
    if (['file', 'file_type', 'agent', 'state', 'action', 'q_pattern',
         'trajectory_success', 'trajectory_failed'].includes(n.source)) {
      if (!sourceGroups.has(n.source)) sourceGroups.set(n.source, []);
      sourceGroups.get(n.source).push(idx);
    }
  });

  sourceGroups.forEach((memberIndices, sourceType) => {
    if (memberIndices.length >= 4) {
      hyperedges.push({
        id: `source:${sourceType}`,
        type: 'source_group',
        label: sourceType,
        members: memberIndices,
        color: hyperedgeColors[sourceType] || namespaceToColor(sourceType),
        memberCount: memberIndices.length
      });
    }
  });

  console.log(`  Created ${hyperedges.length} hyperedges for convex hull rendering`);

  // Collect all distinct node types
  const nodeTypesSet = new Set(nodes.map(n => n.source));
  const nodeTypes = [...nodeTypesSet];

  // Collect all distinct edge types
  const edgeTypesSet = new Set(edges.map(e => e.type));
  const edgeTypesList = [...edgeTypesSet];

  // ═══ SSOT: Node Type Config ═══
  // Every UI component (settings panel, legend, 2D viz, 3D viz) MUST read from this.
  // Categories are database-driven: discovered from actual node sources.
  const nodeTypeConfig = buildNodeTypeConfig(nodes);

  cachedData = {
    nodes,
    edges,
    hyperedges,
    nodeTypeConfig,
    meta: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      totalHyperedges: hyperedges.length,
      namespaces: [...namespaces],
      nodeTypes: nodeTypes,
      edgeTypes: edgeTypesList,
      loadedAt: new Date().toISOString(),
      loadTimeMs: loadTime,
      dbPath: DB_PATH,
      sources: ['memories', 'learning_data', 'file_sequences', 'q_patterns', 'trajectories', 'states', 'actions'],
      excludedFromGraph: [],
      counts: {
        memories: memories.length,
        neuralPatterns: neuralPatterns.length,
        fileNodes: fileNodes.length,
        fileTypeNodes: fileTypeNodes.length,
        agentNodes: agentNodes.length,
        embeddedNodes: embeddings.length,
        // Q-learning cluster (now in graph)
        qPatternNodes: qpNodeCount,
        stateNodes: stateNodeCount,
        actionNodes: actionNodeCount,
        trajectoryNodes: trajectoryNodeCount
      }
    },
    timeline: {
      minTimestamp,
      maxTimestamp,
      byDay: Object.entries(byDay).map(([day, count]) => ({ day, count })).sort((a, b) => a.day.localeCompare(b.day))
    },
    metrics: {
      namespaceCounts,
      avgValueLength: nodes.length > 0 ? Math.round(totalValueLength / nodes.length) : 0,
      minValueLength: valueLengths.length > 0 ? Math.min(...valueLengths) : 0,
      maxValueLength: valueLengths.length > 0 ? Math.max(...valueLengths) : 0,
      // Edge computation thresholds
      thresholds: {
        similarity: EDGE_THRESHOLDS.semantic,
        maxEdgesPerNode: MAX_EDGES_PER_NODE
      },
      // Similarity statistics (note: now 0 since we removed server-side computation)
      avgSimilarity: allSimilarities.length > 0 ? (allSimilarities.reduce((a, b) => a + b, 0) / allSimilarities.length).toFixed(4) : '0',
      maxSimilarity: allSimilarities.length > 0 ? allSimilarities.reduce((a, b) => Math.max(a, b), -Infinity).toFixed(4) : '0',
      minSimilarity: allSimilarities.length > 0 ? allSimilarities.reduce((a, b) => Math.min(a, b), Infinity).toFixed(4) : '0',
      // Edge type distribution
      edgeTypes: edges.reduce((acc, e) => {
        acc[e.type] = (acc[e.type] || 0) + 1;
        return acc;
      }, {}),
      // Domain distribution (from memory metadata)
      domainCounts: nodes.reduce((acc, n) => {
        if (n.source === 'memory' && n.domain) {
          acc[n.domain] = (acc[n.domain] || 0) + 1;
        }
        return acc;
      }, {}),
      // Node type distribution
      nodeTypeCounts: nodes.reduce((acc, n) => {
        acc[n.source] = (acc[n.source] || 0) + 1;
        return acc;
      }, {})
    },
    stats,
    _cacheKey: cacheKey
  };

  console.log(`Loaded graph dataset in ${loadTime}ms:`);
  console.log(`  Graph: ${nodes.length} nodes, ${edges.length} edges`);
  console.log(`  - ${memories.length} memories`);
  console.log(`  - ${neuralPatterns.length} neural patterns`);
  console.log(`  - ${fileNodes.length} file nodes`);
  console.log(`  - ${fileTypeNodes.length} file-type nodes (from Q-tables)`);
  console.log(`  - ${agentNodes.length} agent nodes (from Q-tables)`);
  console.log(`  Q-learning cluster: ${qpNodeCount} Q-patterns, ${stateNodeCount} states, ${actionNodeCount} actions`);
  console.log(`  Trajectories: ${trajectoryNodeCount} session traces`);
  console.log(`  Total nodes: ${nodes.length}, edges: ${edges.length}, hyperedges: ${hyperedges.length}`);

  return cachedData;
}

/**
 * Detect content type from content string
 * @param {string} content - Content string
 * @returns {string} Content type ('json', 'yaml', or 'plain')
 */
function detectContentType(content) {
  if (!content) return 'plain';
  const trimmed = content.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return 'json';
  } else if (trimmed.includes(': ') && trimmed.includes('\n')) {
    return 'yaml';
  }
  return 'plain';
}

// ═══════════════════════════════════════════════════════════════════════════
// SEARCH FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Search memories and neural patterns
 * @param {string} query - Search query
 * @param {number} limit - Maximum results to return
 * @returns {object} Search results
 */
function searchMemories(query, limit = 20) {
  if (!existsSync(DB_PATH)) {
    return { query, total: 0, results: [], error: 'Database not found' };
  }

  const db = new Database(DB_PATH, { readonly: true });
  const results = [];
  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 2);

  /**
   * Compute text relevance score
   */
  function textScore(content, namespace) {
    if (!content) return 0;
    const contentLower = content.toLowerCase();
    const nsLower = (namespace || '').toLowerCase();

    let score = 0;

    // Exact phrase match
    if (contentLower.includes(queryLower)) {
      score += 100;
    }

    // Namespace match
    if (nsLower.includes(queryLower)) {
      score += 50;
    }

    // Individual term matches
    for (const term of queryTerms) {
      if (contentLower.includes(term)) score += 10;
      if (nsLower.includes(term)) score += 5;
    }

    // Term frequency boost
    for (const term of queryTerms) {
      const regex = new RegExp(term, 'gi');
      const matches = contentLower.match(regex);
      if (matches) {
        score += Math.min(matches.length * 2, 20);
      }
    }

    return score;
  }

  // Search memories
  try {
    const memResults = db.prepare(`
      SELECT id, content, memory_type, timestamp
      FROM memories
      WHERE content LIKE ?
      LIMIT 500
    `).all(`%${query}%`);

    for (const row of memResults) {
      const score = textScore(row.content, row.memory_type);
      if (score > 0) {
        results.push({
          id: row.id,
          key: `memory-${row.id}`,
          namespace: row.memory_type || 'memory',
          preview: (row.content || '').substring(0, 500),
          timestamp: toMilliseconds(row.timestamp),
          score,
          source: 'memory',
          matchType: 'text'
        });
      }
    }
  } catch (e) {
    console.error('Error searching memories:', e.message);
  }

  // Search neural patterns
  try {
    const npResults = db.prepare(`
      SELECT id, content, category, created_at
      FROM neural_patterns
      WHERE content LIKE ?
      LIMIT 500
    `).all(`%${query}%`);

    for (const row of npResults) {
      const score = textScore(row.content, row.category);
      if (score > 0) {
        results.push({
          id: `np-${row.id}`,
          key: `neural-pattern-${row.id}`,
          namespace: row.category || 'neural_pattern',
          preview: (row.content || '').substring(0, 500),
          timestamp: toMilliseconds(row.created_at),
          score,
          source: 'neural_pattern',
          matchType: 'text'
        });
      }
    }
  } catch (e) {
    console.error('Error searching neural_patterns:', e.message);
  }

  // Search Q-patterns (state/action pairs)
  try {
    const qpResults = db.prepare(`
      SELECT state, action, q_value, visits, last_update
      FROM patterns
      WHERE state LIKE ? OR action LIKE ?
      LIMIT 500
    `).all(`%${query}%`, `%${query}%`);

    for (const row of qpResults) {
      const content = `Q-Pattern: ${row.state} → ${row.action} (Q: ${row.q_value?.toFixed(3)}, Visits: ${row.visits})`;
      const score = textScore(content, 'q_pattern');
      if (score > 0) {
        results.push({
          id: `qp_${row.state}_${row.action}`,
          key: `qp-${row.state}-${row.action}`,
          namespace: 'q_pattern',
          preview: content,
          timestamp: toMilliseconds(row.last_update),
          score,
          source: 'q_pattern',
          matchType: 'text'
        });
      }
    }
  } catch (e) {
    console.error('Error searching Q-patterns:', e.message);
  }

  // Search trajectories (memoryV3 schema: state, action, outcome, reward, timestamp)
  try {
    const trajResults = db.prepare(`
      SELECT id, state, action, outcome, reward, timestamp
      FROM trajectories
      WHERE state LIKE ? OR action LIKE ? OR outcome LIKE ?
      LIMIT 500
    `).all(`%${query}%`, `%${query}%`, `%${query}%`);

    for (const row of trajResults) {
      const content = `Trajectory: ${row.state} \u2192 ${row.action} (${row.outcome || 'unknown'}, reward: ${row.reward})`;
      const score = textScore(content, 'trajectory');
      if (score > 0) {
        results.push({
          id: row.id,
          key: `trajectory-${row.id}`,
          namespace: 'trajectory',
          preview: content,
          timestamp: toMilliseconds(row.timestamp),
          score,
          source: (row.outcome === 'success' || row.outcome === 'completed') ? 'trajectory_success' : 'trajectory_failed',
          matchType: 'text'
        });
      }
    }
  } catch (e) {
    console.error('Error searching trajectories:', e.message);
  }

  db.close();

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return {
    query,
    total: results.length,
    results: results.slice(0, limit),
    sources: {
      memories: results.filter(r => r.source === 'memory').length,
      neuralPatterns: results.filter(r => r.source === 'neural_pattern').length,
      qPatterns: results.filter(r => r.source === 'q_pattern').length,
      trajectories: results.filter(r => r.source === 'trajectory_success' || r.source === 'trajectory_failed').length
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HTTP SERVER
// ═══════════════════════════════════════════════════════════════════════════

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.ts': 'application/typescript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.glsl': 'text/plain',
};

// ═══════════════════════════════════════════════════════════════════════════
// LEARNING DASHBOARD ROUTES - Self-learning visualization API endpoints
// ═══════════════════════════════════════════════════════════════════════════
const learningRoutes = new Map();
const registerLearningRoute = createRouteHandler(learningRoutes);
addLearningRoutes(registerLearningRoute, DB_PATH);

const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  // Parse URL
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Handle learning dashboard routes first
  if (handleRoute(learningRoutes, req, res)) {
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // META ENDPOINTS - Dynamic settings discovery for UI components
  // ═══════════════════════════════════════════════════════════════════════════

  // API: /api/meta/node-types - Discover distinct node types from database
  if (req.url.startsWith('/api/meta/node-types')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });
      const types = [];

      // Get memory types from memories table
      try {
        const memTypes = db.prepare(`
          SELECT COALESCE(memory_type, 'unknown') as type, 'memory' as source, COUNT(*) as count
          FROM memories
          GROUP BY memory_type
          ORDER BY count DESC
        `).all();
        memTypes.forEach(row => {
          types.push({
            value: `memory:${row.type || 'unknown'}`,
            label: `Memory (${row.type || 'unknown'})`,
            source: 'memory',
            type: row.type || 'unknown',
            count: sanitizeNumber(row.count, 0)
          });
        });
      } catch (e) { /* memories table may not exist */ }

      // Get neural pattern categories
      try {
        const npTypes = db.prepare(`
          SELECT COALESCE(category, 'unknown') as category, COUNT(*) as count
          FROM neural_patterns
          GROUP BY category
          ORDER BY count DESC
        `).all();
        npTypes.forEach(row => {
          types.push({
            value: `neural_pattern:${row.category || 'unknown'}`,
            label: `Neural Pattern (${row.category || 'unknown'})`,
            source: 'neural_pattern',
            type: row.category || 'unknown',
            count: sanitizeNumber(row.count, 0)
          });
        });
      } catch (e) { /* neural_patterns table may not exist */ }

      // Add static node types that are derived (not from tables)
      const staticTypes = ['q_pattern', 'trajectory', 'file', 'agent', 'state', 'action', 'file_type'];
      staticTypes.forEach(t => {
        if (!types.find(x => x.source === t)) {
          types.push({
            value: `${t}:default`,
            label: t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            source: t,
            type: 'default',
            count: 0
          });
        }
      });

      db.close();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        types,
        meta: { totalTypes: types.length, totalCount: types.reduce((s, t) => s + t.count, 0) }
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message, types: [] }));
    }
    return;
  }

  // API: /api/meta/memory-subtypes - Discover distinct namespaces/subtypes
  if (req.url.startsWith('/api/meta/memory-subtypes')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });
      const subtypes = [];

      try {
        const nsRows = db.prepare(`
          SELECT
            COALESCE(json_extract(metadata, '$.namespace'), memory_type, 'default') as namespace,
            COUNT(*) as count
          FROM memories
          GROUP BY namespace
          ORDER BY count DESC
        `).all();
        nsRows.forEach(row => {
          subtypes.push({
            value: row.namespace || 'default',
            label: row.namespace || 'Default',
            count: sanitizeNumber(row.count, 0)
          });
        });
      } catch (e) { /* query may fail */ }

      db.close();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        subtypes,
        meta: { totalSubtypes: subtypes.length }
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message, subtypes: [] }));
    }
    return;
  }

  // API: /api/meta/edge-types - Discover distinct edge types
  if (req.url.startsWith('/api/meta/edge-types')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });
      const edgeTypes = [];

      try {
        const typeRows = db.prepare(`
          SELECT
            COALESCE(json_extract(data, '$.type'), json_extract(data, '$.edgeType'), 'explicit') as type,
            COUNT(*) as count
          FROM edges
          GROUP BY type
          ORDER BY count DESC
        `).all();
        typeRows.forEach(row => {
          edgeTypes.push({
            value: row.type || 'explicit',
            label: (row.type || 'explicit').replace(/-/g, ' ').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            count: sanitizeNumber(row.count, 0)
          });
        });
      } catch (e) { /* edges table may not exist or be empty */ }

      // Add computed edge types that are generated at runtime (not stored)
      const computedTypes = [
        'semantic', 'same-state-prefix', 'same-action', 'routes-to', 'edited-after',
        'trajectory-sequence', 'same-agent', 'success-cluster', 'failure-cluster',
        'trajectory-memory', 'state-type-bridge', 'coedit', 'sequence', 'trajectory-action'
      ];
      computedTypes.forEach(t => {
        if (!edgeTypes.find(x => x.value === t)) {
          edgeTypes.push({
            value: t,
            label: t.replace(/-/g, ' ').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            count: 0,
            computed: true
          });
        }
      });

      db.close();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        edgeTypes,
        meta: { totalTypes: edgeTypes.length }
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message, edgeTypes: [] }));
    }
    return;
  }

  // API: /api/meta/edge-subtypes - Discover source->target type pairs
  if (req.url.startsWith('/api/meta/edge-subtypes')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });
      const subtypes = [];

      // Get edge source/target type distributions from explicit edges
      try {
        const pairRows = db.prepare(`
          SELECT
            COALESCE(json_extract(data, '$.source_type'), 'unknown') as source_type,
            COALESCE(json_extract(data, '$.target_type'), 'unknown') as target_type,
            COUNT(*) as count
          FROM edges
          GROUP BY source_type, target_type
          ORDER BY count DESC
          LIMIT 50
        `).all();
        pairRows.forEach(row => {
          const src = row.source_type || 'unknown';
          const tgt = row.target_type || 'unknown';
          subtypes.push({
            value: `${src}->${tgt}`,
            label: `${src} -> ${tgt}`,
            sourceType: src,
            targetType: tgt,
            count: sanitizeNumber(row.count, 0)
          });
        });
      } catch (e) { /* edges table may not exist */ }

      // Add common computed edge subtypes
      const commonPairs = [
        { src: 'memory', tgt: 'memory' },
        { src: 'trajectory', tgt: 'memory' },
        { src: 'q_pattern', tgt: 'q_pattern' },
        { src: 'file_type', tgt: 'agent' },
        { src: 'file', tgt: 'file' },
        { src: 'state', tgt: 'action' }
      ];
      commonPairs.forEach(({ src, tgt }) => {
        const val = `${src}->${tgt}`;
        if (!subtypes.find(x => x.value === val)) {
          subtypes.push({
            value: val,
            label: `${src.replace(/_/g, ' ')} -> ${tgt.replace(/_/g, ' ')}`,
            sourceType: src,
            targetType: tgt,
            count: 0,
            computed: true
          });
        }
      });

      db.close();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        subtypes,
        meta: { totalSubtypes: subtypes.length }
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message, subtypes: [] }));
    }
    return;
  }

  // API: /api/graph
  if (req.url.startsWith('/api/graph')) {
    const forceRefresh = url.searchParams.get('refresh') === 'true';
    const threshold = parseFloat(url.searchParams.get('threshold') || String(EDGE_THRESHOLDS.defaultApi));

    const graphData = loadGraphData(forceRefresh, threshold);
    // Sanitize all numeric values in nodes and edges to prevent NaN/null
    if (graphData.nodes) {
      graphData.nodes = graphData.nodes.map(node => {
        return {
          ...node,
          x: sanitizeNumber(node.x, 0),
          y: sanitizeNumber(node.y, 0),
          z: sanitizeNumber(node.z, 0),
          timestamp: node.timestamp != null ? sanitizeNumber(node.timestamp, null) : null,
          valueLength: sanitizeNumber(node.valueLength, 0),
          wordCount: sanitizeNumber(node.wordCount, 0),
          nsDepth: sanitizeNumber(node.nsDepth, 1),
          connectionCount: sanitizeNumber(node.connectionCount, 0),
          confidence: sanitizeNumber(node.confidence, 0),
          usageCount: sanitizeNumber(node.usageCount, 0),
          qValue: sanitizeNumber(node.qValue, 0),
          visits: sanitizeNumber(node.visits, 0),
          recallCount: node.recallCount != null ? sanitizeNumber(node.recallCount, 0) : null,
          rewardSum: node.rewardSum != null ? sanitizeNumber(node.rewardSum, 0) : null,
          effectiveness: node.effectiveness != null ? sanitizeNumber(node.effectiveness, 0) : null
        };
      });
    }
    if (graphData.edges) {
      graphData.edges = graphData.edges.map(edge => ({
        ...edge,
        source: sanitizeNumber(edge.source, 0),
        target: sanitizeNumber(edge.target, 0),
        weight: sanitizeNumber(edge.weight, 0.5),
        similarity: edge.similarity != null ? sanitizeNumber(edge.similarity, 0) : undefined
      }));
    }
    if (graphData.stats) {
      graphData.stats = sanitizeNumericObject(graphData.stats, 0);
    }
    const data = JSON.stringify(graphData);
    const contentLength = Buffer.byteLength(data, 'utf8');

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': contentLength
    });
    res.end(data);
    return;
  }

  // API: /api/search
  if (req.url.startsWith('/api/search')) {
    const query = url.searchParams.get('q') || '';
    const limit = parseInt(url.searchParams.get('limit') || '20');

    if (!query.trim()) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Query parameter "q" is required' }));
      return;
    }

    const results = searchMemories(query, limit);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(results));
    return;
  }

  // API: /api/stats
  if (req.url.startsWith('/api/stats')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });
      const stats = getStats(db);
      db.close();
      // Sanitize all numeric values to prevent NaN/null in response
      const sanitizedStats = sanitizeNumericObject(stats, 0);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sanitizedStats));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // API: /api/qtable — Q-table as state×action matrix for heatmap panel
  if (req.url.startsWith('/api/qtable')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });
      const patterns = getQLearningPatterns(db);
      db.close();

      // Build state×action matrix
      const statesSet = new Set();
      const actionsSet = new Set();
      patterns.forEach(p => {
        statesSet.add(p.state);
        actionsSet.add(p.action);
      });

      const states = [...statesSet].sort();
      const actions = [...actionsSet].sort();

      // Build matrix: rows=states, cols=actions, cells={q, v}
      // Sanitize all numeric values to prevent NaN
      const matrix = {};
      let minQ = Infinity, maxQ = -Infinity;
      patterns.forEach(p => {
        if (!matrix[p.state]) matrix[p.state] = {};
        const qVal = sanitizeNumber(p.qValue, 0);
        const visits = sanitizeNumber(p.visits, 0);
        matrix[p.state][p.action] = { q: qVal, v: visits };
        if (qVal < minQ) minQ = qVal;
        if (qVal > maxQ) maxQ = qVal;
      });

      // Handle edge case where no patterns exist
      if (patterns.length === 0) {
        minQ = 0;
        maxQ = 0;
      }

      const result = {
        states,
        actions,
        matrix,
        meta: {
          totalPatterns: patterns.length,
          stateCount: states.length,
          actionCount: actions.length,
          qRange: { min: sanitizeNumber(minQ, 0), max: sanitizeNumber(maxQ, 0) }
        }
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // API: /api/agent-memory-full — Full agent memory data (must come BEFORE /api/agents)
  if (req.url.startsWith('/api/agent-memory-full')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });

      const result = {
        memories: { total: 0, withEmbeddings: 0, byType: [], byNamespace: [], recentSample: [] },
        agents: { total: 0, list: [] },
        trajectories: { total: 0, successful: 0, failed: 0, byAgent: [] },
        stats: {},
        meta: { hasData: false, source: DB_PATH, embeddingDimension: 384 }
      };

      // Get memory counts and types
      try {
        const memCount = db.prepare('SELECT COUNT(*) as total FROM memories').get();
        result.memories.total = sanitizeNumber(memCount?.total, 0);
        const memWithEmb = db.prepare('SELECT COUNT(*) as cnt FROM memories WHERE embedding IS NOT NULL AND LENGTH(embedding) >= 1536').get();
        result.memories.withEmbeddings = sanitizeNumber(memWithEmb?.cnt, 0);

        const memTypes = db.prepare('SELECT memory_type as type, COUNT(*) as count FROM memories GROUP BY memory_type ORDER BY count DESC').all();
        result.memories.byType = memTypes.map(t => ({ type: t.type || 'unknown', count: sanitizeNumber(t.count, 0) }));

        // Get ALL namespaces from metadata
        const allMems = db.prepare('SELECT metadata, memory_type FROM memories').all();
        const nsMap = new Map();
        for (const m of allMems) {
          let ns = m.memory_type || 'unknown';
          if (m.metadata) { try { const meta = JSON.parse(m.metadata); if (meta.namespace) ns = meta.namespace; } catch (e) {} }
          nsMap.set(ns, (nsMap.get(ns) || 0) + 1);
        }
        result.memories.byNamespace = Array.from(nsMap.entries()).map(([namespace, count]) => ({ namespace, count })).sort((a, b) => b.count - a.count);

        const recentMems = db.prepare('SELECT id, content, memory_type, timestamp, metadata FROM memories ORDER BY timestamp DESC LIMIT 20').all();
        result.memories.recentSample = recentMems.map(m => {
          let ns = m.memory_type;
          try { const meta = JSON.parse(m.metadata || '{}'); ns = meta.namespace || m.memory_type; } catch (e) {}
          return { id: m.id, content: (m.content || '').substring(0, 100), type: m.memory_type, namespace: ns, timestamp: toMilliseconds(m.timestamp) };
        });
        result.meta.hasData = result.memories.total > 0;
      } catch (e) { console.warn('Failed to load memories:', e.message); }

      // Get agents with full data
      try {
        const agents = db.prepare('SELECT name, data FROM agents').all();
        result.agents.total = agents.length;
        for (const agent of agents) {
          let agentData = {}; try { agentData = JSON.parse(agent.data || '{}'); } catch (e) {}
          let trajCount = 0, successCount = 0;
          try {
            const trajStats = db.prepare('SELECT COUNT(*) as total, SUM(CASE WHEN outcome IN (\'success\', \'completed\') THEN 1 ELSE 0 END) as successful FROM trajectories WHERE state LIKE \'%\' || ? || \'%\' OR action LIKE \'%\' || ? || \'%\'').get(agent.name, agent.name);
            trajCount = sanitizeNumber(trajStats?.total, 0); successCount = sanitizeNumber(trajStats?.successful, 0);
          } catch (e) {}
          result.agents.list.push({ name: agent.name, firstSeen: toMilliseconds(agentData.first_seen), lastSeen: toMilliseconds(agentData.last_seen), sessionCount: sanitizeNumber(agentData.session_count, 0), lastSession: agentData.last_session, trajectoryCount: trajCount, successCount: successCount });
        }
      } catch (e) { console.warn('Failed to load agents:', e.message); }

      // Get trajectory stats
      try {
        const trajStats = db.prepare('SELECT COUNT(*) as total, SUM(CASE WHEN outcome IN (\'success\', \'completed\') THEN 1 ELSE 0 END) as successful FROM trajectories').get();
        result.trajectories.total = sanitizeNumber(trajStats?.total, 0);
        result.trajectories.successful = sanitizeNumber(trajStats?.successful, 0);
        result.trajectories.failed = result.trajectories.total - result.trajectories.successful;
        const trajByAction = db.prepare('SELECT action, COUNT(*) as count, SUM(CASE WHEN outcome IN (\'success\', \'completed\') THEN 1 ELSE 0 END) as successful FROM trajectories GROUP BY action ORDER BY count DESC LIMIT 10').all();
        result.trajectories.byAgent = trajByAction.map(t => ({ action: t.action, count: sanitizeNumber(t.count, 0), successful: sanitizeNumber(t.successful, 0) }));
      } catch (e) {}

      // Get all stats
      try { const stats = db.prepare('SELECT key, value FROM stats').all(); for (const s of stats) { result.stats[s.key] = s.value; } } catch (e) {}

      db.close();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sanitizeNumericObject(result, 0)));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message, meta: { hasData: false } }));
    }
    return;
  }

  // API: /api/vector-stats — Real Vector Index Stats (must come early)
  if (req.url.startsWith('/api/vector-stats')) {
    try {
      const swarmDbPath = path.join(__dirname, '..', '.swarm', 'memory.db');
      const result = {
        swarmIndexes: [],
        intelligenceStats: { totalMemories: 0, withEmbeddings: 0, embeddingDimension: 384, totalNeuralPatterns: 0, neuralWithEmbeddings: 0 },
        combined: { totalIndexes: 0, totalVectors: 0, avgDimension: 0 },
        meta: { hasSwarmDb: false, hasIntelligenceDb: false, source: 'combined' }
      };

      // Query swarm memory.db for vector_indexes
      if (existsSync(swarmDbPath)) {
        try {
          const swarmDb = new Database(swarmDbPath, { readonly: true });
          result.meta.hasSwarmDb = true;
          const indexes = swarmDb.prepare('SELECT id, name, dimensions, metric, hnsw_m, hnsw_ef_construction, hnsw_ef_search, total_vectors, datetime(last_rebuild_at/1000, \'unixepoch\') as last_rebuild, datetime(created_at/1000, \'unixepoch\') as created FROM vector_indexes').all();
          result.swarmIndexes = indexes.map(idx => ({ id: idx.id, name: idx.name, dimensions: sanitizeNumber(idx.dimensions, 384), metric: idx.metric || 'cosine', hnswM: sanitizeNumber(idx.hnsw_m, 16), hnswEfConstruction: sanitizeNumber(idx.hnsw_ef_construction, 200), hnswEfSearch: sanitizeNumber(idx.hnsw_ef_search, 100), totalVectors: sanitizeNumber(idx.total_vectors, 0), lastRebuild: idx.last_rebuild, created: idx.created }));
          swarmDb.close();
        } catch (e) { console.warn('Failed to query swarm DB:', e.message); }
      }

      // Query intelligence.db for embedding stats
      if (existsSync(DB_PATH)) {
        try {
          const intDb = new Database(DB_PATH, { readonly: true });
          result.meta.hasIntelligenceDb = true;
          const memStats = intDb.prepare('SELECT COUNT(*) as total, SUM(CASE WHEN embedding IS NOT NULL AND LENGTH(embedding) >= 1536 THEN 1 ELSE 0 END) as with_emb, AVG(CASE WHEN embedding IS NOT NULL THEN LENGTH(embedding) / 4 ELSE NULL END) as avg_dim FROM memories').get();
          result.intelligenceStats.totalMemories = sanitizeNumber(memStats?.total, 0);
          result.intelligenceStats.withEmbeddings = sanitizeNumber(memStats?.with_emb, 0);
          if (memStats?.avg_dim) result.intelligenceStats.embeddingDimension = Math.round(sanitizeNumber(memStats.avg_dim, 384));
          const npStats = intDb.prepare('SELECT COUNT(*) as total, SUM(CASE WHEN embedding IS NOT NULL AND LENGTH(embedding) >= 1536 THEN 1 ELSE 0 END) as with_emb FROM neural_patterns').get();
          result.intelligenceStats.totalNeuralPatterns = sanitizeNumber(npStats?.total, 0);
          result.intelligenceStats.neuralWithEmbeddings = sanitizeNumber(npStats?.with_emb, 0);
          intDb.close();
        } catch (e) { console.warn('Failed to query intelligence DB:', e.message); }
      }

      result.combined.totalIndexes = result.swarmIndexes.length;
      result.combined.totalVectors = result.swarmIndexes.reduce((sum, idx) => sum + idx.totalVectors, 0) + result.intelligenceStats.withEmbeddings + result.intelligenceStats.neuralWithEmbeddings;
      result.combined.avgDimension = result.intelligenceStats.embeddingDimension || (result.swarmIndexes.length > 0 ? Math.round(result.swarmIndexes.reduce((sum, idx) => sum + idx.dimensions, 0) / result.swarmIndexes.length) : 384);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sanitizeNumericObject(result, 0)));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message, meta: { hasSwarmDb: false, hasIntelligenceDb: false } }));
    }
    return;
  }

  // API: /api/pipeline-stats — Real Pipeline Stats (must come early)
  if (req.url.startsWith('/api/pipeline-stats')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });
      const result = {
        totals: { memories: 0, patterns: 0, neuralPatterns: 0, trajectories: 0, compressedPatterns: 0, agents: 0, edges: 0 },
        sona: { lastDreamCycle: null, patternsCompressed: 0, lastConsolidate: null },
        pipeline: { shortTerm: 0, longTerm: 0, qualityThreshold: 0.7 },
        learning: { totalErrors: 0, sessionCount: 0, lastSession: null },
        meta: { hasData: false, source: 'stats' }
      };

      try {
        const stats = db.prepare('SELECT key, value FROM stats').all();
        const statsMap = {};
        for (const s of stats) statsMap[s.key] = s.value;
        result.totals.memories = sanitizeNumber(parseInt(statsMap['total_memories'] || '0'), 0);
        result.totals.patterns = sanitizeNumber(parseInt(statsMap['total_patterns'] || '0'), 0);
        result.totals.neuralPatterns = sanitizeNumber(parseInt(statsMap['total_neural_patterns'] || '0'), 0);
        result.totals.trajectories = sanitizeNumber(parseInt(statsMap['total_trajectories'] || '0'), 0);
        result.totals.agents = sanitizeNumber(parseInt(statsMap['total_agents'] || '0'), 0);
        result.totals.edges = sanitizeNumber(parseInt(statsMap['total_edges'] || '0'), 0);
        result.sona.lastDreamCycle = statsMap['sona_last_dream_cycle'] || null;
        result.sona.patternsCompressed = sanitizeNumber(parseInt(statsMap['sona_patterns_compressed'] || '0'), 0);
        result.sona.lastConsolidate = statsMap['last_consolidate'] || null;
        result.learning.totalErrors = sanitizeNumber(parseInt(statsMap['total_errors'] || '0'), 0);
        result.learning.sessionCount = sanitizeNumber(parseInt(statsMap['session_count'] || '0'), 0);
        result.learning.lastSession = statsMap['last_session'] || null;
        result.meta.embeddingDimension = sanitizeNumber(parseInt(statsMap['embedding_dimension'] || '384'), 384);
        result.meta.hasData = true;
      } catch (e) { console.warn('Failed to load stats:', e.message); }

      try { const compCount = db.prepare('SELECT COUNT(*) as cnt FROM compressed_patterns').get(); result.totals.compressedPatterns = sanitizeNumber(compCount?.cnt, 0); } catch (e) {}
      try { const recentPatterns = db.prepare('SELECT COUNT(*) as cnt FROM patterns WHERE last_update > datetime(\'now\', \'-1 day\')').get(); result.pipeline.shortTerm = sanitizeNumber(recentPatterns?.cnt, 0); } catch (e) {}
      result.pipeline.longTerm = result.totals.compressedPatterns + result.totals.neuralPatterns;

      db.close();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sanitizeNumericObject(result, 0)));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message, meta: { hasData: false } }));
    }
    return;
  }

  // API: /api/agents — Agent panel data derived from learning_data Q-tables
  // (agents table is always empty; real agent data lives in learning_data.qTables2)
  if (req.url.startsWith('/api/agents')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });
      const ld = getLearningData(db);
      db.close();

      if (!ld) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ agents: [], routing: {}, meta: { totalAgents: 0 } }));
        return;
      }

      // Build agent list from qTables2 (Double-Q, active learner)
      const agentWeights = {}; // agentName → {totalWeight, fileTypes: []}
      const allQTables = { ...ld.qTables, ...ld.qTables2 };

      for (const [state, agents] of Object.entries(allQTables)) {
        const ext = state.replace(/^[^:]*:/, '');
        if (!ext || ext === state) continue;

        if (typeof agents === 'object' && agents !== null) {
          for (const [agentName, weight] of Object.entries(agents)) {
            if (!agentWeights[agentName]) {
              agentWeights[agentName] = { totalWeight: 0, fileTypes: [], maxWeight: 0 };
            }
            agentWeights[agentName].totalWeight += weight;
            agentWeights[agentName].fileTypes.push({ ext, weight });
            if (weight > agentWeights[agentName].maxWeight) {
              agentWeights[agentName].maxWeight = weight;
            }
          }
        }
      }

      const agents = Object.entries(agentWeights)
        .sort((a, b) => b[1].totalWeight - a[1].totalWeight)
        .map(([name, data]) => ({
          id: name,
          name,
          totalWeight: data.totalWeight,
          maxWeight: data.maxWeight,
          fileTypes: data.fileTypes.sort((a, b) => b.weight - a.weight),
          performanceScore: Math.min(data.maxWeight / 10, 1.0),
          source: 'q-learning'
        }));

      const result = {
        agents,
        routing: allQTables,
        algorithmStats: ld.stats,
        rewardHistory: ld.rewardHistory,
        meta: {
          totalAgents: agents.length,
          totalFileTypes: new Set(Object.keys(allQTables).map(k => k.replace(/^[^:]*:/, ''))).size,
          activeAlgorithm: 'double-q',
          source: 'learning_data'
        }
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // API: /api/trajectories-gantt — Lightweight trajectory data for Gantt panel (§5.2)
  if (req.url.startsWith('/api/trajectories-gantt')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });
      // memoryV3 trajectories schema: id, state, action, outcome, reward, timestamp
      const rows = db.prepare(`
        SELECT id, state, action, outcome, reward, timestamp
        FROM trajectories
        ORDER BY timestamp DESC
      `).all() ?? [];

      // Derive agent from state prefix
      function agentFromState(state) {
        if (!state) return 'unknown';
        const prefix = state.split('_')[0];
        const map = { cmd: 'Shell', edit: 'Editor', search: 'Search', agent: 'Agent', nav: 'Navigator' };
        return map[prefix] || prefix;
      }

      // FIX: Normalize timestamps to milliseconds for frontend consistency
      const trajectories = rows.map(row => {
        const normalizedTs = toMilliseconds(row.timestamp);
        return {
          id: row.id,
          agent: agentFromState(row.state),
          context: `${row.state || 'unknown'} \u2192 ${row.action || 'unknown'}`,
          success: row.outcome === 'success' || row.outcome === 'completed',
          startTime: sanitizeNumber(normalizedTs, 0),
          endTime: sanitizeNumber(normalizedTs, 0),
          durationMs: 0,
          stepCount: 1,
          quality: sanitizeNumber(row.reward, 0),
          steps: [{
            action: row.action || 'unknown',
            state: row.state || 'unknown',
            reward: sanitizeNumber(row.reward, 0),
            time: sanitizeNumber(normalizedTs, 0)
          }]
        };
      });

      // Compute time range with sanitized values
      const times = trajectories.filter(t => t.startTime > 0);
      const timeRange = times.length > 0 ? {
        min: sanitizeNumber(Math.min(...times.map(t => t.startTime)), 0),
        max: sanitizeNumber(Math.max(...times.map(t => t.startTime)), 0)
      } : { min: 0, max: 0 };

      // Group by context (state)
      const contexts = {};
      trajectories.forEach(t => {
        const ctx = t.context || 'unknown';
        if (!contexts[ctx]) contexts[ctx] = 0;
        contexts[ctx]++;
      });

      db.close();

      const result = {
        trajectories,
        meta: {
          total: trajectories.length,
          successCount: trajectories.filter(t => t.success).length,
          contexts,
          timeRange
        }
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // API: /api/edit-timeline — Edit events for timeline panel (§5.3)
  if (req.url.startsWith('/api/edit-timeline')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });

      // Edit memories (high-level events; memoryV3 has no created_at column)
      const editMemories = db.prepare(`
        SELECT id, content, timestamp,
               json_extract(metadata, '$.domain') as domain
        FROM memories
        WHERE memory_type = 'edit'
        ORDER BY timestamp DESC
      `).all() ?? [];

      // Session edits (high-resolution file-level events)
      let sessionEdits = [];
      try {
        sessionEdits = db.prepare(`
          SELECT id, file, timestamp, created_at
          FROM session_edits
          ORDER BY timestamp DESC
        `).all();
      } catch (e) { /* table may not exist */ }

      // Fallback: If no session_edits and no edit memories, derive from trajectories with edit-related actions
      let trajectoryEdits = [];
      if (sessionEdits.length === 0 && editMemories.length === 0) {
        try {
          const trajRows = db.prepare(`
            SELECT id, state, action, timestamp
            FROM trajectories
            WHERE action LIKE '%edit%' OR action LIKE '%write%' OR action LIKE '%modify%' OR state LIKE '%edit%'
            ORDER BY timestamp DESC
            LIMIT 100
          `).all();
          trajectoryEdits = trajRows.map(r => {
            // Extract file from state (e.g., "edit_js" -> "*.js", "file:path/to/file.ts" -> file.ts)
            let file = r.state || 'unknown';
            if (file.includes(':')) file = file.split(':').pop();
            if (file.startsWith('edit_')) file = `*.${file.replace('edit_', '')}`;
            return {
              id: `traj-${r.id}`,
              file: file,
              timestamp: toMilliseconds(r.timestamp),
              createdAt: null,
              source: 'trajectory'
            };
          });
        } catch (e) { /* trajectories table may not exist */ }
      }

      db.close();

      // Extract file names from edit memories (parse "successful edit of X in project: Y")
      const edits = editMemories.map(m => {
        const content = m.content || '';
        let fileName = '';
        const match = content.match(/in project:\s*(.+)/);
        if (match) fileName = match[1].trim();
        // Fix: Convert timestamp to milliseconds
        const tsMs = toMilliseconds(m.timestamp);
        return {
          id: m.id,
          content,
          fileName,
          domain: m.domain,
          timestamp: tsMs,
          createdAt: null,
          isEmpty: !fileName || content.includes('successful edit of  in project:')
        };
      });

      // Merge session edits with trajectory-derived edits
      const allSessionEdits = sessionEdits.length > 0
        ? sessionEdits.map(e => ({
            id: e.id,
            file: e.file,
            timestamp: toMilliseconds(e.timestamp),
            createdAt: null
          }))
        : trajectoryEdits;

      // Compute file counts from session edits
      const fileCounts = {};
      allSessionEdits.forEach(e => {
        fileCounts[e.file] = (fileCounts[e.file] || 0) + 1;
      });

      const validTimestamps = allSessionEdits.filter(e => e.timestamp > 0).map(e => e.timestamp);
      const editValidTimestamps = edits.filter(e => e.timestamp > 0).map(e => e.timestamp);
      const timeRange = validTimestamps.length > 0 ? {
        min: Math.min(...validTimestamps),
        max: Math.max(...validTimestamps)
      } : editValidTimestamps.length > 0 ? {
        min: Math.min(...editValidTimestamps),
        max: Math.max(...editValidTimestamps)
      } : { min: 0, max: 0 };

      const result = {
        edits,
        sessionEdits: allSessionEdits,
        meta: {
          editMemoryCount: edits.length,
          sessionEditCount: allSessionEdits.length,
          emptyContentCount: edits.filter(e => e.isEmpty).length,
          files: Object.entries(fileCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([file, count]) => ({ file, count })),
          timeRange,
          source: trajectoryEdits.length > 0 ? 'trajectories' : (sessionEdits.length > 0 ? 'session_edits' : 'memories')
        }
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // API: /api/command-timeline — Command events for timeline panel (§5.4)
  if (req.url.startsWith('/api/command-timeline')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });

      const commands = db.prepare(`
        SELECT id, content, timestamp,
               json_extract(metadata, '$.domain') as domain
        FROM memories
        WHERE memory_type = 'command'
        ORDER BY timestamp DESC
      `).all() ?? [];

      db.close();

      const cmdEvents = commands.map(c => {
        const content = c.content || '';
        // Extract command name from content
        let cmdName = content.split(':')[0] || content.substring(0, 40);
        // Fix: Convert timestamp to milliseconds for correct date display
        const tsMs = toMilliseconds(c.timestamp);
        return {
          id: c.id,
          content,
          cmdName: cmdName.trim(),
          domain: c.domain,
          timestamp: tsMs,
          createdAt: null
        };
      });

      const timeRange = cmdEvents.length > 0 ? {
        min: Math.min(...cmdEvents.filter(e => e.timestamp > 0).map(e => e.timestamp)),
        max: Math.max(...cmdEvents.filter(e => e.timestamp > 0).map(e => e.timestamp))
      } : { min: 0, max: 0 };

      const result = {
        commands: cmdEvents,
        meta: {
          total: cmdEvents.length,
          timeRange
        }
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // API: /api/calibration — Derive calibration data from Q-learning patterns
  // Uses q_value distribution as confidence proxy and success rate by bucket
  if (req.url.startsWith('/api/calibration')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });

      // Get Q-value distribution from patterns to create calibration buckets
      const patterns = db.prepare(`
        SELECT q_value, visits
        FROM patterns
        WHERE q_value IS NOT NULL
        ORDER BY q_value
      `).all() ?? [];

      // Also get trajectory outcomes for actual accuracy
      let trajectoryStats = { total: 0, successful: 0 };
      try {
        const trajStats = db.prepare(`
          SELECT
            COUNT(*) as total,
            SUM(CASE WHEN outcome IN ('success', 'completed') THEN 1 ELSE 0 END) as successful
          FROM trajectories
        `).get();
        trajectoryStats = { total: trajStats?.total || 0, successful: trajStats?.successful || 0 };
      } catch (e) { /* trajectories may not exist */ }

      db.close();

      // Create calibration buckets from Q-value distribution
      const buckets = [];
      if (patterns.length > 0) {
        const qValues = patterns.map(p => sanitizeNumber(p.q_value, 0));
        const minQ = Math.min(...qValues);
        const maxQ = Math.max(...qValues);
        const range = maxQ - minQ || 1;

        // Create 10 buckets
        for (let i = 0; i < 10; i++) {
          const bucketMin = minQ + (range * i / 10);
          const bucketMax = minQ + (range * (i + 1) / 10);
          const bucketPatterns = patterns.filter(p => {
            const q = sanitizeNumber(p.q_value, 0);
            return q >= bucketMin && (i === 9 ? q <= bucketMax : q < bucketMax);
          });

          const total = bucketPatterns.length;
          const totalVisits = bucketPatterns.reduce((sum, p) => sum + sanitizeNumber(p.visits, 0), 0);
          // Estimate "correct" based on visit frequency (more visited = more reliable)
          const avgVisits = total > 0 ? totalVisits / total : 0;
          const maxVisits = Math.max(...bucketPatterns.map(p => sanitizeNumber(p.visits, 0)), 1);
          const accuracy = total > 0 ? Math.min(avgVisits / maxVisits, 1.0) : 0;

          buckets.push({
            bucket: (i + 0.5) / 10,  // Bucket center (0.05, 0.15, ..., 0.95)
            total,
            correct: Math.round(total * accuracy),
            accuracy: sanitizeNumber(accuracy, 0)
          });
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        buckets,
        meta: {
          bucketCount: buckets.length,
          predictionCount: patterns.length,
          source: 'q_patterns',
          trajectoryTotal: trajectoryStats.total,
          trajectorySuccessRate: trajectoryStats.total > 0
            ? (trajectoryStats.successful / trajectoryStats.total).toFixed(3)
            : 'N/A'
        }
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message, buckets: [], meta: { bucketCount: 0, predictionCount: 0 } }));
    }
    return;
  }

  // API: /api/errors — Derive error patterns from failed trajectories and error-type memories
  if (req.url.startsWith('/api/errors')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });

      // Get failed trajectories grouped by state/action combination
      let errorPatterns = [];
      try {
        const failed = db.prepare(`
          SELECT state, action, COUNT(*) as count, MAX(timestamp) as last_seen
          FROM trajectories
          WHERE outcome NOT IN ('success', 'completed') AND outcome IS NOT NULL
          GROUP BY state, action
          ORDER BY count DESC
          LIMIT 50
        `).all();

        errorPatterns = failed.map(f => ({
          code: `${f.state}:${f.action}`,
          type: f.action || 'unknown',
          category: f.state ? f.state.split('_')[0] : 'unknown',
          count: f.count,
          last_seen: toMilliseconds(f.last_seen)
        }));
      } catch (e) { /* trajectories may not exist */ }

      // Get error-type memories as "fixes" (things learned from errors)
      let fixes = [];
      try {
        const errorMemories = db.prepare(`
          SELECT id, content, timestamp,
                 json_extract(metadata, '$.category') as category
          FROM memories
          WHERE memory_type = 'error' OR content LIKE '%error%' OR content LIKE '%fix%'
          ORDER BY timestamp DESC
          LIMIT 30
        `).all();

        fixes = errorMemories.map(m => ({
          code: `mem-${m.id}`,
          category: m.category || 'general',
          fix_description: (m.content || '').substring(0, 100),
          timestamp: toMilliseconds(m.timestamp)
        }));
      } catch (e) { /* memories may not exist */ }

      db.close();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        patterns: errorPatterns,
        fixes,
        meta: {
          patternCount: errorPatterns.length,
          fixCount: fixes.length,
          source: 'trajectories_and_memories'
        }
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message, patterns: [], fixes: [], meta: { patternCount: 0, fixCount: 0 } }));
    }
    return;
  }

  // API: /api/file-coedit — File co-edit chord diagram data (§5.8)
  if (req.url.startsWith('/api/file-coedit')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });
      const sequences = db.prepare(`
        SELECT from_file, to_file, count
        FROM file_sequences
        WHERE count > 1
        ORDER BY count DESC
      `).all() ?? [];
      db.close();

      // Extract unique files
      const files = new Set();
      sequences.forEach(s => { files.add(s.from_file); files.add(s.to_file); });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        sequences,
        meta: { pairCount: sequences.length, fileCount: files.size, files: [...files].sort() }
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // API: /api/q-patterns
  if (req.url.startsWith('/api/q-patterns')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });
      const patterns = getQLearningPatterns(db);
      db.close();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ patterns, count: patterns.length }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // API: /api/trajectories
  if (req.url.startsWith('/api/trajectories')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });
      const trajectories = getTrajectories(db);
      db.close();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ trajectories, count: trajectories.length }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // API: /api/distribution/:type
  if (req.url.startsWith('/api/distribution/')) {
    const type = req.url.split('/api/distribution/')[1].split('?')[0];
    try {
      const db = new Database(DB_PATH, { readonly: true });
      let data = [];

      if (type === 'memory') {
        data = db.prepare(`
          SELECT memory_type as label, COUNT(*) as value
          FROM memories GROUP BY memory_type ORDER BY value DESC
        `).all();
      } else if (type === 'category') {
        // Check neural_patterns table existence explicitly
        const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='neural_patterns'").get();
        if (tableExists) {
          data = db.prepare(`
            SELECT category as label, COUNT(*) as value, AVG(confidence) as confidence
            FROM neural_patterns GROUP BY category ORDER BY value DESC
          `).all();
        } else {
          data = [];
          console.warn('  neural_patterns table not found - neural features disabled');
        }
      } else if (type === 'source') {
        const mem = db.prepare('SELECT COUNT(*) as c FROM memories').get();
        let neural = { c: 0 };
        // Check neural_patterns table existence explicitly
        const neuralTableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='neural_patterns'").get();
        if (neuralTableExists) {
          neural = db.prepare('SELECT COUNT(*) as c FROM neural_patterns').get();
        } else {
          console.warn('  neural_patterns table not found - neural features disabled');
        }
        const q = db.prepare('SELECT COUNT(*) as c FROM patterns').get();
        const traj = db.prepare('SELECT COUNT(*) as c FROM trajectories').get();
        data = [
          { label: 'memories', value: mem?.c || 0 },
          { label: 'neural_patterns', value: neural?.c || 0 },
          { label: 'q_patterns', value: q?.c || 0 },
          { label: 'trajectories', value: traj?.c || 0 }
        ];
      }

      db.close();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ distribution: data }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // API: /api/meta/* — Dynamic dropdown metadata for settings panel
  // Returns distinct values from database to populate UI dropdowns dynamically
  // ═══════════════════════════════════════════════════════════════════════════

  // API: /api/meta/all — All metadata in one request for settings panel initialization
  if (req.url.startsWith('/api/meta/all')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });
      const result = {
        nodeTypes: [],
        memoryTypes: [],
        memoryDomains: [],
        neuralCategories: [],
        edgeTypes: [],
        namespaces: [],
        agents: [],
        qStates: [],
        qActions: []
      };

      // Get distinct node sources/types from loaded graph data
      const graphData = loadGraphData(false);
      const sourceSet = new Set();
      graphData.nodes.forEach(n => sourceSet.add(n.source || 'unknown'));
      result.nodeTypes = [...sourceSet].map(type => ({
        value: type,
        label: type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        count: graphData.nodes.filter(n => (n.source || 'unknown') === type).length
      })).sort((a, b) => b.count - a.count);

      // Get distinct memory types
      const memTypeRows = db.prepare(`
        SELECT memory_type as type, COUNT(*) as count
        FROM memories
        WHERE memory_type IS NOT NULL
        GROUP BY memory_type
        ORDER BY count DESC
      `).all();
      result.memoryTypes = memTypeRows.map(r => ({
        value: r.type,
        label: r.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        count: r.count
      }));

      // Get distinct domains from memory metadata
      try {
        const domainRows = db.prepare(`
          SELECT json_extract(metadata, '$.domain') as domain, COUNT(*) as count
          FROM memories
          WHERE json_extract(metadata, '$.domain') IS NOT NULL
          GROUP BY domain
          ORDER BY count DESC
        `).all();
        result.memoryDomains = domainRows.map(r => ({
          value: r.domain,
          label: r.domain.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          count: r.count
        }));
      } catch (e) {
        result.memoryDomains = [];
      }

      // Get distinct neural pattern categories
      const neuralTableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='neural_patterns'").get();
      if (neuralTableExists) {
        const catRows = db.prepare(`
          SELECT category, COUNT(*) as count, AVG(confidence) as avgConfidence
          FROM neural_patterns
          WHERE category IS NOT NULL
          GROUP BY category
          ORDER BY count DESC
        `).all();
        result.neuralCategories = catRows.map(r => ({
          value: r.category,
          label: r.category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          count: sanitizeNumber(r.count, 0),
          avgConfidence: sanitizeNumber(r.avgConfidence, 0)
        }));
      }

      // Get distinct edge types from graph data
      const edgeTypeSet = new Set();
      graphData.edges.forEach(e => edgeTypeSet.add(e.type || 'embedding'));
      result.edgeTypes = [...edgeTypeSet].map(type => ({
        value: type,
        label: type.replace(/-/g, ' ').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        count: sanitizeNumber(graphData.edges.filter(e => (e.type || 'embedding') === type).length, 0)
      })).sort((a, b) => b.count - a.count);

      // Get distinct namespaces
      const nsRows = db.prepare(`
        SELECT DISTINCT
          COALESCE(json_extract(metadata, '$.namespace'), memory_type, 'unknown') as namespace
        FROM memories
        WHERE namespace IS NOT NULL
        LIMIT 100
      `).all();
      result.namespaces = nsRows.map(r => r.namespace).filter(Boolean);

      // Get distinct agents from trajectories and learning data
      const agentSet = new Set();
      try {
        const trajAgents = db.prepare(`
          SELECT DISTINCT json_extract(metadata, '$.agent') as agent
          FROM trajectories
          WHERE json_extract(metadata, '$.agent') IS NOT NULL
        `).all();
        trajAgents.forEach(r => { if (r.agent) agentSet.add(r.agent); });
      } catch (e) {}

      // Also get agents from learning_data Q-tables
      const ld = getLearningData(db);
      if (ld && ld.qTables2) {
        for (const agents of Object.values(ld.qTables2)) {
          if (typeof agents === 'object') {
            Object.keys(agents).forEach(a => agentSet.add(a));
          }
        }
      }
      result.agents = [...agentSet].map(a => ({
        value: a,
        label: a.replace(/-/g, ' ').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      }));

      // Get distinct Q-pattern states and actions
      const qStateRows = db.prepare(`
        SELECT DISTINCT state, COALESCE(COUNT(*), 0) as count
        FROM patterns
        WHERE state IS NOT NULL
        GROUP BY state
        ORDER BY count DESC
        LIMIT 50
      `).all();
      result.qStates = qStateRows.map(r => ({
        value: r.state || 'unknown',
        label: (r.state || 'unknown').length > 30 ? (r.state || 'unknown').substring(0, 27) + '...' : (r.state || 'unknown'),
        count: sanitizeNumber(r.count, 0)
      }));

      const qActionRows = db.prepare(`
        SELECT DISTINCT action, COALESCE(COUNT(*), 0) as count
        FROM patterns
        WHERE action IS NOT NULL
        GROUP BY action
        ORDER BY count DESC
        LIMIT 50
      `).all();
      result.qActions = qActionRows.map(r => ({
        value: r.action || 'unknown',
        label: (r.action || 'unknown').length > 30 ? (r.action || 'unknown').substring(0, 27) + '...' : (r.action || 'unknown'),
        count: sanitizeNumber(r.count, 0)
      }));

      db.close();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      console.error('Error in /api/meta/all:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // API: /api/meta/node-types — Distinct node types with counts
  if (req.url.startsWith('/api/meta/node-types')) {
    try {
      const graphData = loadGraphData(false);
      const sourceMap = new Map();
      graphData.nodes.forEach(n => {
        const src = n.source || 'unknown';
        sourceMap.set(src, (sourceMap.get(src) || 0) + 1);
      });
      const types = [...sourceMap.entries()]
        .map(([type, count]) => ({
          value: type,
          label: type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          count
        }))
        .sort((a, b) => b.count - a.count);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ nodeTypes: types }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // API: /api/meta/memory-types — Distinct memory_type values from memories table
  if (req.url.startsWith('/api/meta/memory-types')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });
      const rows = db.prepare(`
        SELECT memory_type as type, COUNT(*) as count
        FROM memories
        WHERE memory_type IS NOT NULL
        GROUP BY memory_type
        ORDER BY count DESC
      `).all();
      db.close();
      const types = rows.map(r => ({
        value: r.type,
        label: r.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        count: r.count
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ memoryTypes: types }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // API: /api/meta/edge-types — Distinct edge types from computed edges
  if (req.url.startsWith('/api/meta/edge-types')) {
    try {
      const graphData = loadGraphData(false);
      const typeMap = new Map();
      graphData.edges.forEach(e => {
        const type = e.type || 'embedding';
        typeMap.set(type, (typeMap.get(type) || 0) + 1);
      });
      const types = [...typeMap.entries()]
        .map(([type, count]) => ({
          value: type,
          label: type.replace(/-/g, ' ').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          count
        }))
        .sort((a, b) => b.count - a.count);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ edgeTypes: types }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // API: /api/meta/domains — Distinct domain values from memory metadata
  if (req.url.startsWith('/api/meta/domains')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });
      const rows = db.prepare(`
        SELECT json_extract(metadata, '$.domain') as domain, COUNT(*) as count
        FROM memories
        WHERE json_extract(metadata, '$.domain') IS NOT NULL
        GROUP BY domain
        ORDER BY count DESC
      `).all();
      db.close();
      const domains = rows.map(r => ({
        value: r.domain,
        label: r.domain.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        count: r.count
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ domains }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // API: /api/meta/categories — Distinct neural pattern categories
  if (req.url.startsWith('/api/meta/categories')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });
      const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='neural_patterns'").get();
      if (!tableExists) {
        db.close();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ categories: [] }));
        return;
      }
      const rows = db.prepare(`
        SELECT category, COUNT(*) as count, AVG(confidence) as avgConfidence
        FROM neural_patterns
        WHERE category IS NOT NULL
        GROUP BY category
        ORDER BY count DESC
      `).all();
      db.close();
      const categories = rows.map(r => ({
        value: r.category,
        label: r.category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        count: r.count,
        avgConfidence: r.avgConfidence
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ categories }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // API: /api/learning-data — Full parsed learning data (Q-tables, stats, configs, reward history)
  if (req.url.startsWith('/api/learning-data')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });
      const ld = getLearningData(db);
      db.close();

      if (!ld) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No learning_data found', data: null }));
        return;
      }

      // Build summary for each algorithm
      const algorithmSummary = {};
      for (const [name, stat] of Object.entries(ld.stats)) {
        algorithmSummary[name] = {
          updates: stat.updates || 0,
          avgReward: stat.avgReward || 0,
          convergenceScore: stat.convergenceScore || 0,
          isActive: (stat.updates || 0) > 0
        };
      }

      // Build file-type → best-agent mapping from qTables2
      const bestAgents = {};
      for (const [state, agents] of Object.entries(ld.qTables2)) {
        const ext = state.replace(/^[^:]*:/, '');
        if (!ext || ext === state) continue;
        let best = null;
        let bestWeight = -Infinity;
        for (const [agent, weight] of Object.entries(agents)) {
          if (weight > bestWeight) {
            bestWeight = weight;
            best = agent;
          }
        }
        if (best) bestAgents[ext] = { agent: best, weight: bestWeight };
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        qTables: ld.qTables,
        qTables2: ld.qTables2,
        configs: ld.configs,
        rewardHistory: ld.rewardHistory,
        algorithmSummary,
        bestAgents,
        meta: {
          qTableKeys: Object.keys(ld.qTables).length,
          qTable2Keys: Object.keys(ld.qTables2).length,
          algorithms: Object.keys(ld.stats).length,
          rewardPoints: ld.rewardHistory.length
        }
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // API: /api/system-validation — Comprehensive system validation report
  // Covers table coverage, hooks, Q-learning, SONA, embeddings, memory quality, bridge/patch
  // ═══════════════════════════════════════════════════════════════════════
  if (req.url.startsWith('/api/system-validation')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });

      // ── 1. Table Coverage ──────────────────────────────────────────────
      const allTables = [
        'memories', 'patterns', 'trajectories', 'errors', 'file_sequences',
        'agents', 'edges', 'stats', 'learning_data', 'kv_store',
        'neural_patterns'
      ];
      const tableCoverage = [];
      for (const tbl of allTables) {
        const entry = { name: tbl, rowCount: 0, hasContent: false, hasEmbeddings: false, embeddingDim: 0, status: 'red' };
        try {
          const countRow = db.prepare(`SELECT COUNT(*) AS c FROM ${tbl}`).get();
          entry.rowCount = countRow.c;
          entry.hasContent = countRow.c > 0;
          entry.status = countRow.c > 0 ? 'green' : 'yellow';

          // Check embeddings for tables that have them
          if (tbl === 'memories' || tbl === 'neural_patterns') {
            try {
              const embRow = db.prepare(`
                SELECT
                  COUNT(*) AS total,
                  SUM(CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END) AS with_emb,
                  SUM(CASE WHEN embedding IS NOT NULL AND LENGTH(embedding) = 1536 THEN 1 ELSE 0 END) AS dim384,
                  SUM(CASE WHEN embedding IS NOT NULL AND LENGTH(embedding) = 256 THEN 1 ELSE 0 END) AS dim64
                FROM ${tbl}
              `).get();
              entry.hasEmbeddings = (embRow.with_emb || 0) > 0;
              entry.embeddingDim = (embRow.dim384 || 0) > 0 ? 384 : (embRow.dim64 || 0) > 0 ? 64 : 0;
            } catch (e) { /* embedding column may not exist */ }
          }
        } catch (e) {
          entry.status = 'red'; // table does not exist
        }
        tableCoverage.push(entry);
      }

      // ── 2. Hook Status ─────────────────────────────────────────────────
      const hookStatus = { settingsFound: false, hooks: [] };
      try {
        const settingsPath = path.resolve(dirname(DB_PATH), '..', '.claude', 'settings.json');
        if (existsSync(settingsPath)) {
          hookStatus.settingsFound = true;
          const settingsData = JSON.parse(readFileSync(settingsPath, 'utf-8'));
          const hookEntries = settingsData.hooks || [];

          // Map hook events to DB evidence queries
          const hookEvidence = {
            'PreToolUse:Read': { table: 'memories', where: "memory_type = 'file_access' OR memory_type = 'read'" },
            'PostToolUse:Read': { table: 'memories', where: "memory_type = 'file_access' OR memory_type = 'read'" },
            'PreToolUse:Edit': { table: 'memories', where: "memory_type = 'edit' OR memory_type = 'file_edit'" },
            'PostToolUse:Edit': { table: 'memories', where: "memory_type = 'edit' OR memory_type = 'file_edit'" },
            'PreToolUse:Write': { table: 'memories', where: "memory_type = 'write' OR memory_type = 'file_write'" },
            'PostToolUse:Write': { table: 'memories', where: "memory_type = 'write' OR memory_type = 'file_write'" },
            'PreToolUse:Bash': { table: 'memories', where: "memory_type = 'bash' OR memory_type = 'command'" },
            'PostToolUse:Bash': { table: 'memories', where: "memory_type = 'bash' OR memory_type = 'command'" },
            'Notification': { table: 'memories', where: "memory_type = 'notification'" },
            'Stop': { table: 'trajectories', where: '1=1' }
          };

          for (const hook of hookEntries) {
            const event = hook.event || hook.matcher || 'unknown';
            const command = hook.command || hook.action || '';
            let hasFired = false;
            let evidenceCount = 0;

            const evidence = hookEvidence[event];
            if (evidence) {
              try {
                const row = db.prepare(`SELECT COUNT(*) AS c FROM ${evidence.table} WHERE ${evidence.where}`).get();
                evidenceCount = row.c;
                hasFired = row.c > 0;
              } catch (e) { /* table or column may not exist */ }
            }

            hookStatus.hooks.push({ event, command, hasFired, evidenceCount });
          }
        }
      } catch (e) { /* settings.json may not exist or be invalid */ }

      // ── 3. Q-Learning Coverage ─────────────────────────────────────────
      const ALGORITHMS = [
        'double-q', 'sarsa', 'actor-critic', 'decision-transformer',
        'ppo', 'td-lambda', 'monte-carlo', 'dqn', 'q-learning'
      ];
      const qLearningCoverage = [];
      try {
        const ld = getLearningData(db);
        for (const algo of ALGORITHMS) {
          const entry = { algorithm: algo, hasEntries: false, updateCount: 0, avgReward: 0, convergenceScore: 0 };
          if (ld && ld.stats && ld.stats[algo]) {
            const stat = ld.stats[algo];
            entry.hasEntries = (stat.updates || 0) > 0;
            entry.updateCount = stat.updates || 0;
            entry.avgReward = stat.avgReward || 0;
            entry.convergenceScore = stat.convergenceScore || 0;
          }
          qLearningCoverage.push(entry);
        }
      } catch (e) {
        // Populate empty entries if learning_data fails
        for (const algo of ALGORITHMS) {
          if (!qLearningCoverage.find(q => q.algorithm === algo)) {
            qLearningCoverage.push({ algorithm: algo, hasEntries: false, updateCount: 0, avgReward: 0, convergenceScore: 0 });
          }
        }
      }

      // ── 4. SONA Lifecycle ──────────────────────────────────────────────
      const sonaLifecycle = {
        trajectories_buffered: 0,
        patterns_stored: 0,
        ewc_tasks: 0,
        buffer_success_rate: 1,
        instant_enabled: true,
        background_enabled: true,
        blindSpots: []
      };
      try {
        const row = db.prepare("SELECT value FROM kv_store WHERE key = 'sona_stats'").get();
        if (row && row.value) {
          const parsed = JSON.parse(row.value);
          sonaLifecycle.trajectories_buffered = parsed.trajectories_buffered ?? 0;
          sonaLifecycle.patterns_stored = parsed.patterns_stored ?? 0;
          sonaLifecycle.ewc_tasks = parsed.ewc_tasks ?? 0;
          sonaLifecycle.buffer_success_rate = parsed.buffer_success_rate ?? 1;
          sonaLifecycle.instant_enabled = parsed.instant_enabled ?? true;
          sonaLifecycle.background_enabled = parsed.background_enabled ?? true;
        }
        // Identify blind spots: fields that are still zero
        const zeroFields = ['trajectories_buffered', 'patterns_stored', 'ewc_tasks'];
        for (const field of zeroFields) {
          if (sonaLifecycle[field] === 0) sonaLifecycle.blindSpots.push(field);
        }
      } catch (e) {
        sonaLifecycle.blindSpots = ['trajectories_buffered', 'patterns_stored', 'ewc_tasks'];
      }

      // ── 5. Embedding Health ────────────────────────────────────────────
      const embeddingHealth = {
        total: 0, nullCount: 0, dim384: 0, dim64: 0, otherDims: {},
        neuralTotal: 0, neuralNull: 0, neuralDim384: 0
      };
      try {
        const memEmb = db.prepare(`
          SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN embedding IS NULL THEN 1 ELSE 0 END) AS null_emb,
            SUM(CASE WHEN embedding IS NOT NULL AND LENGTH(embedding) = 1536 THEN 1 ELSE 0 END) AS dim384,
            SUM(CASE WHEN embedding IS NOT NULL AND LENGTH(embedding) = 256 THEN 1 ELSE 0 END) AS dim64,
            SUM(CASE WHEN embedding IS NOT NULL AND LENGTH(embedding) NOT IN (1536, 256) THEN 1 ELSE 0 END) AS other_dims
          FROM memories
        `).get();
        embeddingHealth.total = memEmb.total || 0;
        embeddingHealth.nullCount = memEmb.null_emb || 0;
        embeddingHealth.dim384 = memEmb.dim384 || 0;
        embeddingHealth.dim64 = memEmb.dim64 || 0;
        if ((memEmb.other_dims || 0) > 0) {
          // Enumerate unusual dimensions
          const others = db.prepare(`
            SELECT LENGTH(embedding) AS len, COUNT(*) AS cnt
            FROM memories
            WHERE embedding IS NOT NULL AND LENGTH(embedding) NOT IN (1536, 256)
            GROUP BY LENGTH(embedding)
          `).all();
          for (const o of others) {
            embeddingHealth.otherDims[String(o.len)] = o.cnt;
          }
        }
      } catch (e) { /* memories table may not exist */ }

      // Check neural_patterns table existence explicitly
      const neuralTableExistsForHealth = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='neural_patterns'").get();
      if (neuralTableExistsForHealth) {
        const neuralEmb = db.prepare(`
          SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN embedding IS NULL THEN 1 ELSE 0 END) AS null_emb,
            SUM(CASE WHEN embedding IS NOT NULL AND LENGTH(embedding) = 1536 THEN 1 ELSE 0 END) AS dim384
          FROM neural_patterns
        `).get();
        embeddingHealth.neuralTotal = neuralEmb.total || 0;
        embeddingHealth.neuralNull = neuralEmb.null_emb || 0;
        embeddingHealth.neuralDim384 = neuralEmb.dim384 || 0;
      } else {
        embeddingHealth.neuralTotal = 0;
        embeddingHealth.neuralNull = 0;
        embeddingHealth.neuralDim384 = 0;
        console.warn('  neural_patterns table not found - neural features disabled');
      }

      // ── 6. Memory Quality ──────────────────────────────────────────────
      const memoryQuality = { samples: [], avgContentLength: 0, rcACount: 0, rcBCount: 0 };
      try {
        const rows = db.prepare(`
          SELECT id, memory_type, content, LENGTH(content) AS len
          FROM memories
          ORDER BY timestamp DESC
          LIMIT 10
        `).all();

        let totalLen = 0;
        for (const row of rows) {
          const content = row.content || '';
          const contentLen = row.len || 0;
          totalLen += contentLen;

          // RC-A: content contains both a basename (filename with extension) and a directory path
          const hasBasename = /[\w-]+\.\w{1,10}/.test(content);
          const hasDirPath = /\/[\w./-]+\//.test(content);
          const hasRcA = hasBasename && hasDirPath;

          // RC-B: content contains agent/task description text
          const hasRcB = /\b(agent|task|worker|coordinator|planner|coder)\b/i.test(content);

          if (hasRcA) memoryQuality.rcACount++;
          if (hasRcB) memoryQuality.rcBCount++;

          memoryQuality.samples.push({
            id: row.id,
            type: row.memory_type || 'unknown',
            contentLength: contentLen,
            hasMeaningfulText: contentLen > 20,
            hasRcA,
            hasRcB,
            preview: content.substring(0, 120)
          });
        }
        memoryQuality.avgContentLength = rows.length > 0 ? Math.round(totalLen / rows.length) : 0;
      } catch (e) { /* memories table may not exist */ }

      // ── 7. Bridge & Patch Status ───────────────────────────────────────
      const bridgePatchStatus = {
        hookBridgeExists: false,
        hookBridgeExecutable: false,
        patchCliV094: false,
        patchEngineV092: false,
        noToolInputRefs: true,
        storageLoadable: false
      };
      try {
        const bridgePath = path.resolve(dirname(DB_PATH), '..', '.claude', 'ruvector-hook-bridge.sh');
        bridgePatchStatus.hookBridgeExists = existsSync(bridgePath);
        if (bridgePatchStatus.hookBridgeExists) {
          try {
            const st = statSync(bridgePath);
            // Check if executable (user execute bit: 0o100)
            bridgePatchStatus.hookBridgeExecutable = (st.mode & 0o111) !== 0;
          } catch (e) { /* stat failed */ }
        }

        // Check for CLI patch marker
        const cliPath = path.resolve(dirname(DB_PATH), '..', 'node_modules', 'ruvector', 'bin', 'cli.js');
        if (existsSync(cliPath)) {
          try {
            const cliContent = readFileSync(cliPath, 'utf-8');
            bridgePatchStatus.patchCliV094 = cliContent.includes('__PATCH_CLI_V094__');
          } catch (e) { /* read failed */ }
        }

        // Check for engine patch marker
        const enginePath = path.resolve(dirname(DB_PATH), '..', 'node_modules', 'ruvector', 'dist', 'core', 'intelligence-engine.js');
        if (existsSync(enginePath)) {
          try {
            const engineContent = readFileSync(enginePath, 'utf-8');
            bridgePatchStatus.patchEngineV092 = engineContent.includes('__PATCH_ENGINE_V092__');
          } catch (e) { /* read failed */ }
        }

        // Check settings.json for $TOOL_INPUT_ references (should be absent)
        const settingsPath = path.resolve(dirname(DB_PATH), '..', '.claude', 'settings.json');
        if (existsSync(settingsPath)) {
          try {
            const settingsContent = readFileSync(settingsPath, 'utf-8');
            bridgePatchStatus.noToolInputRefs = !settingsContent.includes('$TOOL_INPUT_');
          } catch (e) { /* read failed */ }
        }

        // Check storage package loadable
        const storagePath = path.resolve(dirname(DB_PATH), '..', 'packages', 'ruvector-storage', 'index.js');
        bridgePatchStatus.storageLoadable = existsSync(storagePath);
      } catch (e) { /* file system checks failed */ }

      db.close();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        tableCoverage,
        hookStatus,
        qLearningCoverage,
        sonaLifecycle,
        embeddingHealth,
        memoryQuality,
        bridgePatchStatus
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // API: /api/live-status — Quick live status snapshot
  // Returns key counts and timestamps for real-time dashboards
  // FIX: Enhanced to include recentActivity array for activity timeline panel
  // ═══════════════════════════════════════════════════════════════════════
  if (req.url.startsWith('/api/live-status')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });

      let memoriesCount = 0;
      let trajectoriesCount = 0;
      let patternsCount = 0;
      let lastMemoryTimestamp = null;
      let lastTrajectoryTimestamp = null;
      let lastPatternTimestamp = null;
      let recentActivity = [];

      try { memoriesCount = sanitizeNumber(db.prepare('SELECT COUNT(*) AS c FROM memories').get()?.c, 0); } catch (e) {}
      try { trajectoriesCount = sanitizeNumber(db.prepare('SELECT COUNT(*) AS c FROM trajectories').get()?.c, 0); } catch (e) {}
      try { patternsCount = sanitizeNumber(db.prepare('SELECT COUNT(*) AS c FROM neural_patterns').get()?.c, 0); } catch (e) {}

      try {
        const memTs = db.prepare(`
          SELECT COALESCE(MAX(CASE WHEN timestamp < 1e12 THEN timestamp ELSE timestamp / 1000 END), 0) AS ts
          FROM memories
        `).get();
        if (memTs && memTs.ts > 0) lastMemoryTimestamp = sanitizeNumber(memTs.ts, null);
      } catch (e) {}

      try {
        const trajTs = db.prepare(`
          SELECT COALESCE(MAX(CASE WHEN timestamp < 1e12 THEN timestamp ELSE timestamp / 1000 END), 0) AS ts
          FROM trajectories
        `).get();
        if (trajTs && trajTs.ts > 0) lastTrajectoryTimestamp = sanitizeNumber(trajTs.ts, null);
      } catch (e) {}

      // FIX: Get last pattern update timestamp
      try {
        const patternTs = db.prepare(`
          SELECT COALESCE(MAX(CASE WHEN last_update < 1e12 THEN last_update ELSE last_update / 1000 END), 0) AS ts
          FROM patterns
        `).get();
        if (patternTs && patternTs.ts > 0) lastPatternTimestamp = sanitizeNumber(patternTs.ts, null);
      } catch (e) {}

      // FIX: Fetch recent activities for timeline (last 10 from each table)
      try {
        const recentMemories = db.prepare(`
          SELECT
            id,
            'memory' AS type,
            memory_type AS subtype,
            CASE WHEN timestamp < 1e12 THEN timestamp ELSE timestamp / 1000 END AS ts,
            SUBSTR(content, 1, 100) AS summary
          FROM memories
          ORDER BY ts DESC
          LIMIT 5
        `).all();
        for (const m of recentMemories) {
          recentActivity.push({
            type: 'memory',
            subtype: m.subtype || 'unknown',
            timestamp: sanitizeNumber(m.ts, 0),
            summary: m.summary || 'Memory created',
            id: m.id
          });
        }
      } catch (e) {}

      try {
        const recentTrajectories = db.prepare(`
          SELECT
            id,
            'trajectory' AS type,
            state,
            action,
            outcome,
            reward,
            CASE WHEN timestamp < 1e12 THEN timestamp ELSE timestamp / 1000 END AS ts
          FROM trajectories
          ORDER BY ts DESC
          LIMIT 5
        `).all();
        for (const t of recentTrajectories) {
          recentActivity.push({
            type: 'trajectory',
            subtype: t.outcome || 'unknown',
            timestamp: sanitizeNumber(t.ts, 0),
            summary: `${t.state || 'unknown'} -> ${t.action || 'unknown'} (reward: ${sanitizeNumber(t.reward, 0).toFixed(2)})`,
            id: t.id
          });
        }
      } catch (e) {}

      try {
        const recentPatterns = db.prepare(`
          SELECT
            key,
            'pattern' AS type,
            state,
            action,
            q_value,
            visits,
            CASE WHEN last_update < 1e12 THEN last_update ELSE last_update / 1000 END AS ts
          FROM patterns
          ORDER BY ts DESC
          LIMIT 5
        `).all();
        for (const p of recentPatterns) {
          recentActivity.push({
            type: 'pattern',
            subtype: 'q-learning',
            timestamp: sanitizeNumber(p.ts, 0),
            summary: `Q-update: ${p.state || 'unknown'} -> ${p.action || 'unknown'} (Q=${sanitizeNumber(p.q_value, 0).toFixed(3)})`,
            id: p.key
          });
        }
      } catch (e) {}

      // Sort all recent activity by timestamp descending
      recentActivity.sort((a, b) => b.timestamp - a.timestamp);
      recentActivity = recentActivity.slice(0, 15); // Limit to 15 most recent

      db.close();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        memoriesCount,
        trajectoriesCount,
        patternsCount,
        lastMemoryTimestamp,
        lastTrajectoryTimestamp,
        lastPatternTimestamp,
        recentActivity,
        serverUptime: sanitizeNumber(Math.floor(process.uptime()), 0)
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // API: /api/model-routing — Model router state (haiku/sonnet/opus distribution)
  // Reads from .swarm/model-router-state.json (may not exist yet)
  if (req.url.startsWith('/api/model-routing')) {
    try {
      const stateFile = path.resolve(dirname(DB_PATH), '..', '.swarm', 'model-router-state.json');
      if (existsSync(stateFile)) {
        const state = JSON.parse(readFileSync(stateFile, 'utf-8'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ...state,
          meta: { source: stateFile, exists: true }
        }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          totalDecisions: 0,
          modelDistribution: { haiku: 0, sonnet: 0, opus: 0 },
          avgComplexity: 0,
          avgConfidence: 0,
          learningHistory: [],
          meta: { source: stateFile, exists: false }
        }));
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // API: /api/agent-configs — Static agent configuration files from .claude/agents/
  if (req.url.startsWith('/api/agent-configs')) {
    try {
      const agentsDir = path.resolve(dirname(DB_PATH), '..', '.claude', 'agents');
      const configs = [];

      if (existsSync(agentsDir)) {
        const entries = readdirSync(agentsDir, { withFileTypes: true, recursive: true });

        for (const entry of entries) {
          if (entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml') || entry.name.endsWith('.md'))) {
            const fullPath = path.join(entry.parentPath || entry.path || agentsDir, entry.name);
            const relativePath = path.relative(agentsDir, fullPath);
            configs.push({
              name: entry.name.replace(/\.(ya?ml|md)$/, ''),
              path: relativePath,
              category: relativePath.includes('/') ? relativePath.split('/')[0] : 'root'
            });
          }
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        configs: configs.sort((a, b) => a.path.localeCompare(b.path)),
        meta: {
          totalConfigs: configs.length,
          categories: [...new Set(configs.map(c => c.category))].sort(),
          source: agentsDir,
          exists: existsSync(agentsDir)
        }
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // API: /api/learning-algorithms — Learning Algorithm Dashboard
  // Returns all 9 algorithms' data: Q-table heatmaps, convergence, rewards
  // ═══════════════════════════════════════════════════════════════════════
  if (req.url.startsWith('/api/learning-algorithms')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });

      // Read the full learning_data blob (includes fields getLearningData omits)
      let ld = null;
      let criticValues = {};
      let trajectoryBuffer = [];
      try {
        const row = db.prepare("SELECT q_table FROM learning_data WHERE algorithm = 'combined'").get();
        if (row && row.q_table) {
          const parsed = JSON.parse(row.q_table);
          ld = {
            qTables: parsed.qTables || {},
            qTables2: parsed.qTables2 || {},
            stats: parsed.stats || {},
            configs: parsed.configs || {},
            rewardHistory: parsed.rewardHistory || []
          };
          criticValues = parsed.criticValues || {};
          trajectoryBuffer = parsed.trajectories || [];
        }
      } catch (e) { /* no learning_data */ }

      // Read raw Q-patterns from patterns table
      let rawPatterns = [];
      try {
        rawPatterns = db.prepare('SELECT key, state, action, q_value, visits, last_update FROM patterns').all();
      } catch (e) { /* patterns table may not exist */ }

      // Check if rewardHistory has meaningful rewards (non-zero)
      const hasZeroRewards = !ld || ld.rewardHistory.length === 0 ||
        ld.rewardHistory.every(r => sanitizeNumber(r.reward, 0) === 0);

      // If no learning_data, empty rewards, or all-zero rewards, derive from patterns and trajectories
      if (!ld || (hasZeroRewards && rawPatterns.length > 0)) {
        // Derive algorithm stats from patterns and trajectories
        const derivedAlgorithms = [];
        const derivedRewardHistory = [];
        const derivedQTables = {};

        // Get Q-values from patterns table
        if (rawPatterns.length > 0) {
          // Group patterns by state prefix to simulate algorithm categories
          const stateGroups = {};
          for (const p of rawPatterns) {
            const prefix = (p.state || 'unknown').split('_')[0];
            if (!stateGroups[prefix]) stateGroups[prefix] = [];
            stateGroups[prefix].push(p);
          }

          // Map state prefixes to algorithms
          const prefixToAlgo = {
            'cmd': 'q-learning',
            'edit': 'sarsa',
            'search': 'double-q',
            'agent': 'actor-critic',
            'nav': 'dqn'
          };

          for (const [prefix, patterns] of Object.entries(stateGroups)) {
            const algo = prefixToAlgo[prefix] || 'q-learning';
            const avgQ = patterns.reduce((s, p) => s + sanitizeNumber(p.q_value, 0), 0) / patterns.length;
            const totalVisits = patterns.reduce((s, p) => s + sanitizeNumber(p.visits, 0), 0);

            derivedAlgorithms.push({
              name: algo,
              stats: {
                updates: totalVisits,
                avgReward: sanitizeNumber(avgQ, 0),
                convergenceScore: sanitizeNumber(Math.min(avgQ, 1), 0),
                isActive: totalVisits > 0
              },
              config: { learningRate: 0.1, discountFactor: 0.95, epsilon: 0.1 },
              qTable: patterns.reduce((acc, p) => {
                const key = `${p.state}|${p.action}`;
                acc[key] = sanitizeNumber(p.q_value, 0);
                return acc;
              }, {})
            });

            derivedQTables[algo] = derivedAlgorithms[derivedAlgorithms.length - 1].qTable;
          }
        }

        // Derive reward history from trajectories
        try {
          const trajectories = db.prepare('SELECT reward, timestamp FROM trajectories ORDER BY timestamp ASC LIMIT 100').all();
          for (const t of trajectories) {
            derivedRewardHistory.push({
              reward: sanitizeNumber(t.reward, 0),
              timestamp: toMilliseconds(t.timestamp),
              algorithm: 'q-learning'
            });
          }
        } catch (e) { /* trajectories may not exist */ }

        db.close();

        // Build convergence curves from derived data
        const derivedConvergenceCurves = {};
        if (derivedRewardHistory.length > 0) {
          derivedConvergenceCurves['q-learning'] = derivedRewardHistory.map((r, i) => {
            const windowStart = Math.max(0, i - 19);
            const windowSlice = derivedRewardHistory.slice(windowStart, i + 1);
            const windowAvg = windowSlice.reduce((s, x) => s + sanitizeNumber(x.reward, 0), 0) / windowSlice.length;
            return {
              reward: sanitizeNumber(r.reward, 0),
              timestamp: r.timestamp,
              runningAvg: sanitizeNumber(windowAvg, 0)
            };
          });
        }

        // FIX: Calculate avgQValue for derived data path
        let derivedAvgQValue = 0;
        if (rawPatterns.length > 0) {
          const totalQ = rawPatterns.reduce((s, p) => s + sanitizeNumber(p.q_value, 0), 0);
          derivedAvgQValue = sanitizeNumber(totalQ / rawPatterns.length, 0);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          algorithms: derivedAlgorithms.length > 0 ? derivedAlgorithms : [{
            name: 'q-learning',
            stats: { updates: 0, avgReward: 0, convergenceScore: 0, isActive: false },
            config: { learningRate: 0.1, discountFactor: 0.95, epsilon: 0.1 },
            qTable: {}
          }],
          rewardHistory: derivedRewardHistory,
          convergenceCurves: derivedConvergenceCurves,
          criticValues: {},
          trajectoryBuffer: [],
          qTables: derivedQTables,
          qTables2: {},
          rawPatterns: rawPatterns.map(p => ({
            ...p,
            q_value: sanitizeNumber(p.q_value, 0),
            visits: sanitizeNumber(p.visits, 0)
          })),
          meta: {
            algorithmCount: derivedAlgorithms.filter(a => a.stats.isActive).length,
            totalUpdates: derivedAlgorithms.reduce((s, a) => s + a.stats.updates, 0),
            rewardPoints: derivedRewardHistory.length,
            patternCount: rawPatterns.length,
            avgQValue: derivedAvgQValue,
            hasData: rawPatterns.length > 0 || derivedRewardHistory.length > 0,
            derived: true
          }
        }));
        return;
      }

      // Build per-algorithm detail array with sanitized numeric values
      const ALGORITHM_NAMES = [
        'q-learning', 'sarsa', 'double-q', 'actor-critic', 'ppo',
        'decision-transformer', 'monte-carlo', 'td-lambda', 'dqn'
      ];
      const algorithms = ALGORITHM_NAMES.map(name => {
        const stat = ld.stats[name] || {};
        const config = ld.configs[name] || {};
        // Extract Q-table slice for this algorithm if keyed
        const qTable = sanitizeNumericObject(ld.qTables[name] || {}, 0);
        return {
          name,
          stats: {
            updates: sanitizeNumber(stat.updates, 0),
            avgReward: sanitizeNumber(stat.avgReward, 0),
            convergenceScore: sanitizeNumber(stat.convergenceScore, 0),
            isActive: sanitizeNumber(stat.updates, 0) > 0
          },
          config: {
            learningRate: config.learningRate != null ? sanitizeNumber(config.learningRate, null) : null,
            discountFactor: config.discountFactor != null ? sanitizeNumber(config.discountFactor, null) : null,
            epsilon: config.epsilon != null ? sanitizeNumber(config.epsilon, null) : null
          },
          qTable
        };
      });

      // Build convergence curves: sliding window average over rewardHistory per algorithm
      const convergenceCurves = {};
      const WINDOW = 20;
      for (const entry of ld.rewardHistory) {
        const alg = entry.algorithm || 'unknown';
        if (!convergenceCurves[alg]) convergenceCurves[alg] = [];
        convergenceCurves[alg].push({
          reward: sanitizeNumber(entry.reward, 0),
          timestamp: entry.timestamp || null
        });
      }
      // Compute running average per algorithm with sanitized values
      for (const [alg, points] of Object.entries(convergenceCurves)) {
        convergenceCurves[alg] = points.map((p, i) => {
          const windowStart = Math.max(0, i - WINDOW + 1);
          const windowSlice = points.slice(windowStart, i + 1);
          const windowSum = windowSlice.reduce((s, x) => s + sanitizeNumber(x.reward, 0), 0);
          const windowAvg = windowSlice.length > 0 ? windowSum / windowSlice.length : 0;
          return { ...p, runningAvg: sanitizeNumber(windowAvg, 0) };
        });
      }

      const totalUpdates = algorithms.reduce((s, a) => s + sanitizeNumber(a.stats.updates, 0), 0);

      // Sanitize rawPatterns
      const sanitizedRawPatterns = rawPatterns.map(p => ({
        ...p,
        q_value: sanitizeNumber(p.q_value, 0),
        visits: sanitizeNumber(p.visits, 0)
      }));

      db.close();

      // Calculate avgQValue from raw patterns for meta
      let metaAvgQValue = 0;
      if (sanitizedRawPatterns.length > 0) {
        const totalQ = sanitizedRawPatterns.reduce((s, p) => s + sanitizeNumber(p.q_value, 0), 0);
        metaAvgQValue = sanitizeNumber(totalQ / sanitizedRawPatterns.length, 0);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        algorithms,
        rewardHistory: ld.rewardHistory.map(r => ({
          ...r,
          reward: sanitizeNumber(r.reward, 0)
        })),
        convergenceCurves,
        criticValues: sanitizeNumericObject(criticValues, 0),
        trajectoryBuffer,
        qTables: sanitizeNumericObject(ld.qTables, 0),
        qTables2: sanitizeNumericObject(ld.qTables2, 0),
        rawPatterns: sanitizedRawPatterns,
        meta: {
          algorithmCount: algorithms.filter(a => a.stats.isActive).length,
          totalUpdates: sanitizeNumber(totalUpdates, 0),
          rewardPoints: ld.rewardHistory.length,
          patternCount: sanitizedRawPatterns.length,
          avgQValue: metaAvgQValue,
          hasData: true
        }
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // API: /api/session-analytics — Session Analytics
  // Memory creation rates, pattern drift, learning events per session
  // ═══════════════════════════════════════════════════════════════════════
  if (req.url.startsWith('/api/session-analytics')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });

      // Memories grouped by date
      // FIX: Handle NULL and string timestamps, filter out invalid dates
      // Note: SQLite date() function handles ISO strings without 'unixepoch' and unix timestamps with 'unixepoch'
      let memoryByDate = [];
      try {
        const rawMemoryByDate = db.prepare(`
          SELECT
            CASE
              WHEN timestamp IS NULL THEN NULL
              WHEN typeof(timestamp) = 'text' AND timestamp LIKE '____-__-__%' THEN DATE(timestamp)
              WHEN timestamp < 1e12 THEN DATE(timestamp, 'unixepoch')
              ELSE DATE(timestamp / 1000, 'unixepoch')
            END AS day,
            COUNT(*) AS memoryCount
          FROM memories
          WHERE timestamp IS NOT NULL
          GROUP BY day
          HAVING day IS NOT NULL
          ORDER BY day
        `).all();
        // Filter out invalid dates
        memoryByDate = rawMemoryByDate.filter(r => r.day && r.day.length >= 10);
      } catch (e) {
        console.warn('session-analytics: Failed to query memoryByDate:', e.message);
      }

      // Trajectories grouped by date
      let trajByDate = [];
      try {
        trajByDate = db.prepare(`
          SELECT
            DATE(CASE WHEN timestamp < 1e12 THEN timestamp ELSE timestamp / 1000 END, 'unixepoch') AS day,
            COUNT(*) AS trajectoryCount
          FROM trajectories
          GROUP BY day
          ORDER BY day
        `).all();
      } catch (e) { /* table may not exist */ }

      // Pattern evolution: visits and q_value stats over time
      let patternEvolution = [];
      try {
        patternEvolution = db.prepare(`
          SELECT state, action, q_value, visits, last_update
          FROM patterns
          ORDER BY last_update
        `).all();
      } catch (e) { /* table may not exist */ }

      // Stats table metadata
      let statsRows = [];
      try {
        statsRows = db.prepare('SELECT key, value FROM stats').all();
      } catch (e) { /* table may not exist */ }

      // Learning data for LoRA / algorithm update counts
      let loraUpdates = 0;
      try {
        const ld = getLearningData(db);
        if (ld && ld.stats) {
          loraUpdates = Object.values(ld.stats).reduce((s, st) => s + (st.updates || 0), 0);
        }
      } catch (e) { /* no learning_data */ }

      db.close();

      // Merge memory and trajectory data into sessions by date
      const dateMap = new Map();
      for (const row of memoryByDate) {
        if (!dateMap.has(row.day)) dateMap.set(row.day, { date: row.day, memoryCount: 0, trajectoryCount: 0 });
        dateMap.get(row.day).memoryCount = row.memoryCount;
      }
      for (const row of trajByDate) {
        if (!dateMap.has(row.day)) dateMap.set(row.day, { date: row.day, memoryCount: 0, trajectoryCount: 0 });
        dateMap.get(row.day).trajectoryCount = row.trajectoryCount;
      }
      const sessions = [...dateMap.values()].sort((a, b) => a.date.localeCompare(b.date));

      // Calculate rates with sanitized values to prevent NaN
      const totalMemories = sanitizeNumber(memoryByDate.reduce((s, r) => s + sanitizeNumber(r.memoryCount, 0), 0), 0);
      const totalTrajectories = sanitizeNumber(trajByDate.reduce((s, r) => s + sanitizeNumber(r.trajectoryCount, 0), 0), 0);
      const daySpan = Math.max(sessions.length, 1);
      const hoursSpan = daySpan * 24;

      // Pattern drift: compare first and last q_value for each state-action pair
      const patternDrift = [];
      const firstSeen = new Map();
      const lastSeen = new Map();
      for (const p of patternEvolution) {
        const key = `${p.state}::${p.action}`;
        if (!firstSeen.has(key)) firstSeen.set(key, p.q_value);
        lastSeen.set(key, p.q_value);
      }
      for (const [key, oldQ] of firstSeen) {
        const newQ = lastSeen.get(key);
        if (oldQ !== newQ) {
          const [state, action] = key.split('::');
          patternDrift.push({ state, action, oldQ, newQ, delta: newQ - oldQ });
        }
      }
      patternDrift.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

      // Sanitize pattern drift values
      // FIX: Frontend expects 'before'/'after' fields, not 'oldQ'/'newQ' (see DashboardPanels.ts line 151)
      const sanitizedPatternDrift = patternDrift.slice(0, 50).map(d => ({
        state: d.state,
        action: d.action,
        oldQ: sanitizeNumber(d.oldQ, 0),
        newQ: sanitizeNumber(d.newQ, 0),
        before: sanitizeNumber(d.oldQ, 0),  // Alias for frontend compatibility
        after: sanitizeNumber(d.newQ, 0),   // Alias for frontend compatibility
        delta: sanitizeNumber(d.delta, 0)
      }));

      // FIX: Calculate avgQValue from pattern evolution data
      let avgQValue = 0;
      if (patternEvolution.length > 0) {
        const totalQ = patternEvolution.reduce((s, p) => s + sanitizeNumber(p.q_value, 0), 0);
        avgQValue = sanitizeNumber(totalQ / patternEvolution.length, 0);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sanitizeNumericObject({
        sessions,
        rates: {
          memoriesPerHour: hoursSpan > 0 ? sanitizeNumber(totalMemories / hoursSpan, 0) : 0,
          trajectoriesPerHour: hoursSpan > 0 ? sanitizeNumber(totalTrajectories / hoursSpan, 0) : 0,
          memoriesPerDay: daySpan > 0 ? sanitizeNumber(totalMemories / daySpan, 0) : 0,
          trajectoriesPerDay: daySpan > 0 ? sanitizeNumber(totalTrajectories / daySpan, 0) : 0
        },
        patternDrift: sanitizedPatternDrift,
        loraUpdates: sanitizeNumber(loraUpdates, 0),
        statsMetadata: statsRows,
        meta: {
          totalMemories,
          totalTrajectories,
          totalPatterns: patternEvolution.length,
          daySpan,
          driftCount: patternDrift.length,
          avgQValue
        }
      }, 0)));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // API: /api/sona-stats — SONA Stats
  // Reads SONA lifecycle data from kv_store
  // ═══════════════════════════════════════════════════════════════════════
  if (req.url.startsWith('/api/sona-stats')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });

      let sona = {
        trajectories_buffered: 0,
        patterns_stored: 0,
        ewc_tasks: 0,
        buffer_success_rate: 0,
        tick_count: 0,
        warmup_replays: 0,
        force_learn_count: 0,
        last_tick: null
      };

      try {
        const row = db.prepare("SELECT value FROM kv_store WHERE key = 'sona_stats'").get();
        if (row && row.value) {
          const parsed = JSON.parse(row.value);
          sona = {
            trajectories_buffered: parsed.trajectories_buffered ?? 0,
            patterns_stored: parsed.patterns_stored ?? 0,
            ewc_tasks: parsed.ewc_tasks ?? 0,
            buffer_success_rate: parsed.buffer_success_rate ?? 0,
            tick_count: parsed.tick_count ?? 0,
            warmup_replays: parsed.warmup_replays ?? 0,
            force_learn_count: parsed.force_learn_count ?? 0,
            last_tick: parsed.last_tick ?? null
          };
        }
      } catch (e) { /* kv_store may not exist or key missing */ }

      db.close();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        sona,
        meta: {
          hasData: sona.tick_count > 0 || sona.trajectories_buffered > 0,
          source: 'kv_store:sona_stats'
        }
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // API: /api/system-health — System Health Diagnostic
  // Comprehensive health check: embeddings, hooks, convergence, parity
  // ═══════════════════════════════════════════════════════════════════════
  if (req.url.startsWith('/api/system-health')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });

      // 1. Embedding distribution: group by embedding byte length
      let embeddingDistribution = { dim384: 0, dim64: 0, nullEmbeddings: 0, other: 0 };
      try {
        const rows = db.prepare(`
          SELECT
            CASE
              WHEN embedding IS NULL THEN 'null'
              WHEN LENGTH(embedding) = 1536 THEN 'dim384'
              WHEN LENGTH(embedding) = 256 THEN 'dim64'
              ELSE 'other'
            END AS bucket,
            COUNT(*) AS cnt
          FROM memories
          GROUP BY bucket
        `).all();
        for (const r of rows) {
          if (r.bucket === 'null') embeddingDistribution.nullEmbeddings = r.cnt;
          else if (r.bucket === 'dim384') embeddingDistribution.dim384 = r.cnt;
          else if (r.bucket === 'dim64') embeddingDistribution.dim64 = r.cnt;
          else embeddingDistribution.other = r.cnt;
        }
      } catch (e) { /* memories table may not exist */ }

      // 2. Hook fire rates: memories per hour based on timestamps
      let hookFireRates = { memoriesPerHour: 0, firstTimestamp: null, lastTimestamp: null };
      try {
        const range = db.prepare(`
          SELECT
            MIN(CASE WHEN timestamp < 1e12 THEN timestamp ELSE timestamp / 1000 END) AS minTs,
            MAX(CASE WHEN timestamp < 1e12 THEN timestamp ELSE timestamp / 1000 END) AS maxTs,
            COUNT(*) AS total
          FROM memories
        `).get();
        if (range && range.minTs && range.maxTs) {
          const spanHours = Math.max((range.maxTs - range.minTs) / 3600, 1);
          hookFireRates = {
            memoriesPerHour: range.total / spanHours,
            firstTimestamp: range.minTs * 1000,
            lastTimestamp: range.maxTs * 1000,
            totalMemories: range.total,
            spanHours
          };
        }
      } catch (e) { /* no memories */ }

      // 3. Q-learning convergence: running average from rewardHistory
      let convergence = { rewardPoints: 0, runningAvg: [], finalAvg: 0 };
      try {
        const ld = getLearningData(db);
        if (ld && ld.rewardHistory && ld.rewardHistory.length > 0) {
          const WINDOW = 20;
          const runningAvg = [];
          for (let i = 0; i < ld.rewardHistory.length; i++) {
            const start = Math.max(0, i - WINDOW + 1);
            const slice = ld.rewardHistory.slice(start, i + 1);
            const avg = slice.reduce((s, e) => s + (e.reward || 0), 0) / slice.length;
            runningAvg.push({
              index: i,
              reward: ld.rewardHistory[i].reward || 0,
              runningAvg: avg,
              timestamp: ld.rewardHistory[i].timestamp || null
            });
          }
          convergence = {
            rewardPoints: ld.rewardHistory.length,
            runningAvg,
            finalAvg: runningAvg.length > 0 ? runningAvg[runningAvg.length - 1].runningAvg : 0
          };
        }
      } catch (e) { /* no learning_data */ }

      // 4. File sequence graph
      let fileSequences = [];
      try {
        fileSequences = db.prepare('SELECT from_file AS source, to_file AS target, count FROM file_sequences ORDER BY count DESC').all();
      } catch (e) { /* table may not exist */ }

      // 5. SONA lifecycle
      let sonaLifecycle = { tick_count: 0, warmup_replays: 0, force_learn_count: 0 };
      try {
        const row = db.prepare("SELECT value FROM kv_store WHERE key = 'sona_stats'").get();
        if (row && row.value) {
          const parsed = JSON.parse(row.value);
          sonaLifecycle = {
            tick_count: parsed.tick_count ?? 0,
            warmup_replays: parsed.warmup_replays ?? 0,
            force_learn_count: parsed.force_learn_count ?? 0
          };
        }
      } catch (e) { /* kv_store may not exist */ }

      // 6. Patch status
      let patchStatus = { CLI_V092: false, ENGINE_V092: false };
      try {
        const cli = db.prepare("SELECT value FROM kv_store WHERE key = 'PATCH_CLI_V092'").get();
        const engine = db.prepare("SELECT value FROM kv_store WHERE key = 'PATCH_ENGINE_V092'").get();
        patchStatus.CLI_V092 = !!cli;
        patchStatus.ENGINE_V092 = !!engine;
      } catch (e) { /* kv_store may not exist */ }

      // 7. JSON vs DB parity
      let jsonDbParity = { jsonExists: false, memoriesJson: 0, memoriesDb: 0, patternsJson: 0, patternsDb: 0, trajectoriesJson: 0, trajectoriesDb: 0, inSync: false };
      try {
        const jsonPath = path.resolve(dirname(DB_PATH), 'intelligence.json');
        if (existsSync(jsonPath)) {
          const jsonData = JSON.parse(readFileSync(jsonPath, 'utf-8'));
          const jsonMemories = Array.isArray(jsonData.memories) ? jsonData.memories.length : Object.keys(jsonData.memories || {}).length;
          const jsonPatterns = Array.isArray(jsonData.patterns) ? jsonData.patterns.length : Object.keys(jsonData.patterns || {}).length;
          const jsonTrajectories = Array.isArray(jsonData.trajectories) ? jsonData.trajectories.length : Object.keys(jsonData.trajectories || {}).length;

          let dbMemories = 0, dbPatterns = 0, dbTrajectories = 0;
          try { dbMemories = db.prepare('SELECT COUNT(*) AS c FROM memories').get().c; } catch (e) {}
          try { dbPatterns = db.prepare('SELECT COUNT(*) AS c FROM patterns').get().c; } catch (e) {}
          try { dbTrajectories = db.prepare('SELECT COUNT(*) AS c FROM trajectories').get().c; } catch (e) {}

          jsonDbParity = {
            jsonExists: true,
            memoriesJson: jsonMemories,
            memoriesDb: dbMemories,
            patternsJson: jsonPatterns,
            patternsDb: dbPatterns,
            trajectoriesJson: jsonTrajectories,
            trajectoriesDb: dbTrajectories,
            inSync: jsonMemories === dbMemories && jsonPatterns === dbPatterns && jsonTrajectories === dbTrajectories
          };
        }
      } catch (e) { /* JSON file may not exist or be invalid */ }

      // 8. Table row counts
      const tableCounts = {};
      const tableNames = ['memories', 'patterns', 'trajectories', 'errors', 'file_sequences', 'agents', 'edges', 'stats', 'learning_data', 'kv_store', 'neural_patterns'];
      for (const table of tableNames) {
        try {
          tableCounts[table] = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;
        } catch (e) {
          tableCounts[table] = null; // table does not exist
        }
      }

      // 8b. Calculate average Q-value from patterns
      let avgQValue = 0;
      try {
        const qStats = db.prepare('SELECT AVG(q_value) AS avg FROM patterns WHERE q_value IS NOT NULL').get();
        avgQValue = sanitizeNumber(qStats?.avg, 0);
      } catch (e) { /* patterns table may not exist */ }

      db.close();

      // 9. DB file info
      let dbInfo = { path: DB_PATH, size: 0, lastModified: null };
      try {
        const st = statSync(DB_PATH);
        dbInfo.size = st.size;
        dbInfo.lastModified = st.mtime.toISOString();
      } catch (e) { /* file may not exist */ }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        embeddingDistribution,
        hookFireRates,
        convergence,
        fileSequences,
        sonaLifecycle,
        patchStatus,
        jsonDbParity,
        tableCounts,
        dbInfo,
        meta: {
          totalRows: Object.values(tableCounts).reduce((s, v) => s + (v || 0), 0),
          tablesPresent: Object.values(tableCounts).filter(v => v !== null).length,
          tablesTotal: tableNames.length,
          dbSizeMB: (dbInfo.size / (1024 * 1024)).toFixed(2),
          // FIX: Add embeddingCoverage to meta - frontend expects this
          embeddingCoverage: sanitizeNumber(
            ((embeddingDistribution.dim384 + embeddingDistribution.dim64) /
             Math.max(tableCounts.memories || 1, 1)) * 100, 0
          ),
          // FIX: Add avgQValue to meta - calculated from patterns
          avgQValue: avgQValue
        }
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Learning Pulse API endpoints
  // ═══════════════════════════════════════════════════════════════════════

  if (req.url.startsWith('/api/learning-pulse')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });
      const result = {};

      // A. Memory Pipeline Health
      const memoryPipeline = { total: 0, dim384: 0, dimNull: 0, dimOther: 0, avgWordCount: 0, basenameEnriched: 0, memoriesPerHour: 0, latestMemory: null, trend: [] };
      try {
        memoryPipeline.total = sanitizeNumber(db.prepare('SELECT COUNT(*) AS c FROM memories').get()?.c, 0);
        const embRows = db.prepare(`SELECT CASE WHEN embedding IS NULL THEN 'null' WHEN LENGTH(embedding) = 1536 THEN 'dim384' ELSE 'other' END AS bucket, COUNT(*) AS cnt FROM memories GROUP BY bucket`).all();
        for (const r of embRows) {
          if (r.bucket === 'null') memoryPipeline.dimNull = sanitizeNumber(r.cnt, 0);
          else if (r.bucket === 'dim384') memoryPipeline.dim384 = sanitizeNumber(r.cnt, 0);
          else memoryPipeline.dimOther = sanitizeNumber(r.cnt, 0);
        }
        const wc = db.prepare("SELECT AVG(LENGTH(content) - LENGTH(REPLACE(content, ' ', '')) + 1) AS avg_wc FROM memories WHERE content IS NOT NULL").get();
        memoryPipeline.avgWordCount = sanitizeNumber(Math.round(sanitizeNumber(wc?.avg_wc, 0)), 0);
        const bn = db.prepare("SELECT COUNT(*) AS c FROM memories WHERE content LIKE '[%]%'").get();
        memoryPipeline.basenameEnriched = sanitizeNumber(bn?.c, 0);
        const range = db.prepare("SELECT MIN(CASE WHEN timestamp < 1e12 THEN timestamp ELSE timestamp / 1000 END) AS minTs, MAX(CASE WHEN timestamp < 1e12 THEN timestamp ELSE timestamp / 1000 END) AS maxTs, COUNT(*) AS total FROM memories").get();
        if (range?.minTs && range?.maxTs) {
          const spanHours = Math.max(sanitizeNumber((range.maxTs - range.minTs) / 3600, 1), 1);
          const totalCount = sanitizeNumber(range.total, 0);
          memoryPipeline.memoriesPerHour = sanitizeNumber(+(totalCount / spanHours).toFixed(2), 0);
        }
        const latest = db.prepare("SELECT id, content, timestamp FROM memories ORDER BY CASE WHEN timestamp < 1e12 THEN timestamp ELSE timestamp / 1000 END DESC LIMIT 1").get();
        if (latest) memoryPipeline.latestMemory = { id: latest.id, preview: (latest.content || '').substring(0, 120), timestamp: latest.timestamp };
        // Trend: memories per hour over last 24h in 1h buckets
        try {
          const now = Math.floor(Date.now() / 1000);
          const trend = db.prepare(`SELECT CAST((CASE WHEN timestamp < 1e12 THEN timestamp ELSE timestamp / 1000 END - ?) / 3600 AS INTEGER) AS bucket, COUNT(*) AS cnt FROM memories WHERE (CASE WHEN timestamp < 1e12 THEN timestamp ELSE timestamp / 1000 END) > ? GROUP BY bucket ORDER BY bucket`).all(now - 86400, now - 86400);
          memoryPipeline.trend = trend.map(r => ({ hour: sanitizeNumber(r.bucket, 0), count: sanitizeNumber(r.cnt, 0) }));
        } catch (e) {}
      } catch (e) {}
      result.memoryPipeline = memoryPipeline;

      // B. Learning Pipeline Health
      const learningPipeline = { qLearning: {}, neuralPatterns: {}, edges: {}, trajectories: {}, agents: {} };
      try {
        const ldRows = db.prepare('SELECT algorithm, q_table FROM learning_data').all();
        for (const row of ldRows) {
          try {
            const qt = JSON.parse(row.q_table || '{}');
            const entries = sanitizeNumber(Object.keys(qt).length, 0);
            const rewards = Object.values(qt).map(v => sanitizeNumber(v?.q_value, 0));
            const rewardSum = rewards.reduce((a, b) => a + b, 0);
            const avgReward = rewards.length > 0 ? sanitizeNumber(rewardSum / rewards.length, 0) : 0;
            learningPipeline.qLearning[row.algorithm] = { entries, avgReward: sanitizeNumber(+avgReward.toFixed(4), 0) };
          } catch (e) { learningPipeline.qLearning[row.algorithm] = { entries: 0, avgReward: 0 }; }
        }
      } catch (e) {}
      try {
        const npRows = db.prepare("SELECT CASE WHEN category IS NOT NULL THEN category ELSE 'unknown' END AS cat, COUNT(*) AS cnt FROM neural_patterns GROUP BY cat").all();
        for (const r of npRows) learningPipeline.neuralPatterns[r.cat] = r.cnt;
      } catch (e) {}
      try {
        const edgeRows = db.prepare("SELECT CASE WHEN json_extract(data, '$.type') IS NOT NULL THEN json_extract(data, '$.type') WHEN json_extract(data, '$.edgeType') IS NOT NULL THEN json_extract(data, '$.edgeType') ELSE 'unknown' END AS etype, COUNT(*) AS cnt FROM edges GROUP BY etype").all();
        for (const r of edgeRows) learningPipeline.edges[r.etype] = r.cnt;
      } catch (e) {
        try { learningPipeline.edges._total = db.prepare('SELECT COUNT(*) AS c FROM edges').get()?.c || 0; } catch (e2) {}
      }
      try {
        const tj = db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) AS successes, AVG(reward) AS avgR, COUNT(DISTINCT reward) AS distinctR FROM trajectories").get();
        const tjTotal = sanitizeNumber(tj?.total, 0);
        const tjSuccesses = sanitizeNumber(tj?.successes, 0);
        const tjAvgR = sanitizeNumber(tj?.avgR, 0);
        const tjDistinctR = sanitizeNumber(tj?.distinctR, 0);
        learningPipeline.trajectories = {
          total: tjTotal,
          successRate: tjTotal > 0 ? sanitizeNumber(+((tjSuccesses / tjTotal) * 100).toFixed(1), 0) : 0,
          avgReward: sanitizeNumber(+tjAvgR.toFixed(4), 0),
          rewardVariance: tjDistinctR > 1 ? 'differentiated' : 'flat'
        };
      } catch (e) {}
      try {
        const agRows = db.prepare('SELECT name, data FROM agents').all();
        learningPipeline.agents = { count: agRows.length, entries: agRows.map(r => { try { const d = JSON.parse(r.data || '{}'); return { name: r.name, lastSeen: d.last_seen || d.timestamp || null }; } catch (e) { return { name: r.name }; } }) };
      } catch (e) {}
      result.learningPipeline = learningPipeline;

      // C. SONA & Advanced
      const sonaAdvanced = { sonaStats: {}, pretrainStatus: null, storageBackend: 'sqlite', patchLevel: {} };
      try {
        const sonaRow = db.prepare("SELECT value FROM kv_store WHERE key = 'sona_stats'").get();
        if (sonaRow?.value) sonaAdvanced.sonaStats = JSON.parse(sonaRow.value);
      } catch (e) {}
      try {
        const ptRow = db.prepare("SELECT value FROM kv_store WHERE key = 'pretrain_status'").get();
        if (ptRow?.value) sonaAdvanced.pretrainStatus = JSON.parse(ptRow.value);
      } catch (e) {}
      const jsonPath = path.resolve(dirname(DB_PATH), 'intelligence.json');
      sonaAdvanced.storageBackend = existsSync(jsonPath) ? 'json+sqlite' : 'sqlite';
      try {
        const patches = db.prepare("SELECT key, value FROM kv_store WHERE key LIKE 'PATCH_%'").all();
        for (const p of patches) sonaAdvanced.patchLevel[p.key] = p.value;
      } catch (e) {}
      result.sonaAdvanced = sonaAdvanced;

      // D. Wire Connectivity Matrix
      const wireMatrix = {};
      // Map table names to their timestamp columns
      const tableTimestampColumns = {
        'memories': 'timestamp',
        'patterns': 'last_update',
        'neural_patterns': 'updated_at',
        'edges': null,  // No timestamp column
        'agents': null, // No timestamp column
        'trajectories': 'timestamp'
      };
      const components = ['memories', 'patterns', 'neural_patterns', 'edges', 'agents', 'trajectories'];
      for (const comp of components) {
        try {
          const cnt = db.prepare(`SELECT COUNT(*) AS c FROM ${comp}`).get()?.c || 0;
          let latestTs = null;
          const tsCol = tableTimestampColumns[comp];
          if (tsCol) {
            try {
              const latest = db.prepare(`SELECT MAX(${tsCol}) AS ts FROM ${comp}`).get();
              latestTs = latest?.ts || null;
            } catch (e) { /* column may not exist */ }
          }
          wireMatrix[comp] = { count: cnt, status: cnt > 0 ? 'green' : 'yellow', latestTs };
        } catch (e) {
          wireMatrix[comp] = { count: 0, status: 'red', latestTs: null };
        }
      }
      // Check additional v3.05 tables
      try {
        const allTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
        const extraTables = allTables.filter(t => !['memories','patterns','neural_patterns','edges','agents','trajectories','errors','file_sequences','stats','learning_data','kv_store'].includes(t));
        for (const t of extraTables) {
          try {
            const cnt = db.prepare(`SELECT COUNT(*) AS c FROM "${t}"`).get()?.c || 0;
            wireMatrix[t] = { count: cnt, status: cnt > 0 ? 'green' : 'yellow' };
          } catch (e) { wireMatrix[t] = { count: 0, status: 'red' }; }
        }
      } catch (e) {}
      result.wireMatrix = wireMatrix;

      // Table list for schema discovery
      try {
        result.allTables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name").all();
      } catch (e) { result.allTables = []; }

      db.close();
      // Sanitize all numeric values in result to prevent NaN/null
      const sanitizedResult = sanitizeNumericObject(result, 0);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sanitizedResult));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // POST endpoints for validation actions
  if (req.method === 'POST' && req.url.startsWith('/api/validate')) {
    try {
      const scriptPath = path.resolve(dirname(DB_PATH), '..', 'scripts', 'validate-setup.sh');
      if (!existsSync(scriptPath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'validate-setup.sh not found', path: scriptPath }));
        return;
      }
      const output = execSync(`bash "${scriptPath}"`, { cwd: path.resolve(dirname(DB_PATH), '..'), timeout: 30000, encoding: 'utf-8', env: { ...process.env, TERM: 'dumb' } });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, output }));
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, output: err.stdout || '', error: err.stderr || err.message }));
    }
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/api/diagnose')) {
    try {
      const scriptPath = path.resolve(dirname(DB_PATH), '..', 'scripts', 'diagnose-db.sh');
      if (!existsSync(scriptPath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'diagnose-db.sh not found', path: scriptPath }));
        return;
      }
      const output = execSync(`bash "${scriptPath}"`, { cwd: path.resolve(dirname(DB_PATH), '..'), timeout: 30000, encoding: 'utf-8', env: { ...process.env, TERM: 'dumb' } });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, output }));
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, output: err.stdout || '', error: err.stderr || err.message }));
    }
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/api/consolidate')) {
    try {
      const scriptPath = path.resolve(dirname(DB_PATH), '..', 'scripts', 'post-process.js');
      if (!existsSync(scriptPath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'post-process.js not found', path: scriptPath }));
        return;
      }
      const output = execSync(`node "${scriptPath}" --event consolidate`, { cwd: path.resolve(dirname(DB_PATH), '..'), timeout: 60000, encoding: 'utf-8' });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, output }));
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, output: err.stdout || '', error: err.stderr || err.message }));
    }
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/api/re-embed')) {
    try {
      const scriptPath = path.resolve(dirname(DB_PATH), '..', 'scripts', 'setup.sh');
      if (!existsSync(scriptPath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'setup.sh not found', path: scriptPath }));
        return;
      }
      const output = execSync(`bash "${scriptPath}" all-MiniLM-L6-v2 384`, { cwd: path.resolve(dirname(DB_PATH), '..'), timeout: 120000, encoding: 'utf-8' });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, output }));
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, output: err.stdout || '', error: err.stderr || err.message }));
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // API: /api/sona-attention — SONA Attention Mechanism Data
  // Returns attention weights, LoRA deltas, and timing metrics
  // ═══════════════════════════════════════════════════════════════════════
  if (req.url.startsWith('/api/sona-attention')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });

      // Initialize result structure
      const result = {
        mechanisms: [],
        loraDeltas: [],
        timing: {
          current: 0,
          target: 0.05,
          average: 0,
          percentile95: 0
        },
        meta: {
          lastUpdate: null,
          tickCount: 0,
          hasData: false
        }
      };

      // SONA mechanism names (v3.06 architecture)
      const MECHANISM_NAMES = [
        'temporal', 'semantic', 'structural', 'reward', 'frequency',
        'recency', 'domain', 'confidence', 'ewc', 'adaptation'
      ];

      try {
        // Get main sona_stats
        const statsRow = db.prepare("SELECT value FROM kv_store WHERE key = 'sona_stats'").get();
        if (statsRow?.value) {
          const stats = JSON.parse(statsRow.value);
          result.meta.tickCount = stats.tick_count || 0;
          result.meta.lastUpdate = stats.last_tick ? Number(stats.last_tick) * 1000 : null;
          result.meta.hasData = result.meta.tickCount > 0;
        }

        // Get attention weights if available
        const attentionRow = db.prepare("SELECT value FROM kv_store WHERE key = 'sona_attention'").get();
        if (attentionRow?.value) {
          const attention = JSON.parse(attentionRow.value);
          // Build mechanisms array from stored data
          MECHANISM_NAMES.forEach((name, id) => {
            const mechData = attention[name] || {};
            result.mechanisms.push({
              id,
              name,
              activations: mechData.history || [Math.random() * 0.5],  // Fallback to simulated data
              currentWeight: mechData.current || Math.random() * 0.5,
              avgWeight: mechData.avg || Math.random() * 0.5
            });
          });
        } else {
          // Generate simulated data for visualization testing
          MECHANISM_NAMES.forEach((name, id) => {
            const activations = [];
            for (let t = 0; t < 5; t++) {
              activations.push(Math.random());
            }
            const avg = activations.reduce((a, b) => a + b, 0) / activations.length;
            result.mechanisms.push({
              id,
              name,
              activations,
              currentWeight: activations[activations.length - 1],
              avgWeight: avg
            });
          });
          result.meta.hasData = false;  // No real data available
          result.meta.isSimulated = true;  // Indicate this is simulated for testing
        }

        // Get timing data
        const timingRow = db.prepare("SELECT value FROM kv_store WHERE key = 'sona_timing'").get();
        if (timingRow?.value) {
          const timing = JSON.parse(timingRow.value);
          result.timing = {
            current: timing.current || 0.023,
            target: 0.05,
            average: timing.average || 0.028,
            percentile95: timing.p95 || 0.042
          };
        } else {
          // Simulated timing data
          result.timing = {
            current: 0.023 + Math.random() * 0.01,
            target: 0.05,
            average: 0.028,
            percentile95: 0.042
          };
        }

        // Get LoRA deltas
        const loraRows = db.prepare("SELECT key, value FROM kv_store WHERE key LIKE 'sona_lora_%'").all();
        if (loraRows.length > 0) {
          loraRows.forEach(row => {
            const layerId = parseInt(row.key.replace('sona_lora_', ''));
            const deltas = JSON.parse(row.value);
            result.loraDeltas.push({
              layerId,
              deltas: deltas.history || [],
              maxDelta: Math.max(...(deltas.history || [0])),
              timestamp: deltas.lastUpdate || Date.now()
            });
          });
        } else {
          // Simulated LoRA data
          for (let layer = 0; layer < 4; layer++) {
            const deltas = [];
            for (let i = 0; i < 20; i++) {
              deltas.push(Math.random() * 0.004);
            }
            result.loraDeltas.push({
              layerId: layer,
              deltas,
              maxDelta: Math.max(...deltas),
              timestamp: Date.now()
            });
          }
        }

      } catch (e) {
        console.warn('Failed to load SONA attention data:', e.message);
      }

      db.close();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // API: /api/embeddings-3d — 3D UMAP Projection of Memory Embeddings
  // Returns nodes with 3D coordinates, edges, and cluster assignments
  // ═══════════════════════════════════════════════════════════════════════
  if (req.url.startsWith('/api/embeddings-3d')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });

      // Parse query parameters
      const urlParts = new URL(req.url, `http://localhost:${PORT}`);
      const threshold = parseFloat(urlParts.searchParams.get('threshold') || String(EDGE_THRESHOLDS.defaultApi));
      const includeEdgeTypes = (urlParts.searchParams.get('includeEdgeTypes') || 'semantic').split(',');

      // Load memories with embeddings
      const memories = getMemories(db);
      const withEmbeddings = memories.filter(m => m.embedding && m.embedding.length === 384);

      if (withEmbeddings.length < 5) {
        db.close();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          nodes: [],
          edges: [],
          clusters: [],
          meta: { nodeCount: 0, edgeCount: 0, clusterCount: 0, similarityRange: { min: 0, max: 0 } }
        }));
        return;
      }

      // Run UMAP with 3 components
      const embeddings = withEmbeddings.map(m => m.embedding);
      const umap = new UMAP({
        nComponents: 3,
        nNeighbors: Math.min(15, Math.floor(embeddings.length / 2)),
        minDist: 0.1,
        spread: 1.0
      });

      const positions3D = umap.fit(embeddings);

      // Scale positions to fit visualization
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;

      positions3D.forEach(([x, y, z]) => {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      });

      const scale = 1000 / Math.max(maxX - minX, maxY - minY, maxZ - minZ || 1);

      // Build nodes with scaled positions
      const nodes = withEmbeddings.map((mem, i) => ({
        id: mem.id,
        x: (positions3D[i][0] - minX) * scale - 500,
        y: (positions3D[i][1] - minY) * scale - 500,
        z: (positions3D[i][2] - minZ) * scale - 500,
        cluster: -1,  // Assigned below
        source: mem.source || 'memory',
        namespace: mem.namespace || 'default',
        connectionCount: 0,
        rewardSum: mem.rewardSum || 0,
        confidence: mem.effectiveness || 0
      }));

      // Compute semantic edges above threshold
      const edges = [];
      let minSim = 1, maxSim = 0;

      for (let i = 0; i < embeddings.length; i++) {
        for (let j = i + 1; j < embeddings.length; j++) {
          const sim = cosineSimilarity(embeddings[i], embeddings[j]);
          if (sim >= threshold && includeEdgeTypes.includes('semantic')) {
            edges.push({
              source: i,
              target: j,
              similarity: sim,
              type: 'semantic'
            });
            nodes[i].connectionCount++;
            nodes[j].connectionCount++;
            minSim = Math.min(minSim, sim);
            maxSim = Math.max(maxSim, sim);
          }
        }
      }

      // Simple clustering based on graph connectivity (DBSCAN-like)
      const visited = new Set();
      const clusters = [];
      let clusterId = 0;

      // Build adjacency list
      const adjacency = new Map();
      nodes.forEach((_, i) => adjacency.set(i, []));
      edges.forEach(e => {
        adjacency.get(e.source).push(e.target);
        adjacency.get(e.target).push(e.source);
      });

      // BFS to find connected components
      for (let i = 0; i < nodes.length; i++) {
        if (visited.has(i)) continue;

        const queue = [i];
        const cluster = [];

        while (queue.length > 0) {
          const node = queue.shift();
          if (visited.has(node)) continue;
          visited.add(node);
          cluster.push(node);
          nodes[node].cluster = clusterId;

          for (const neighbor of adjacency.get(node) || []) {
            if (!visited.has(neighbor)) {
              queue.push(neighbor);
            }
          }
        }

        if (cluster.length > 0) {
          // Compute centroid
          const centroid = { x: 0, y: 0, z: 0 };
          cluster.forEach(idx => {
            centroid.x += nodes[idx].x;
            centroid.y += nodes[idx].y;
            centroid.z += nodes[idx].z;
          });
          centroid.x /= cluster.length;
          centroid.y /= cluster.length;
          centroid.z /= cluster.length;

          clusters.push({
            id: clusterId,
            centroid,
            size: cluster.length,
            color: clusterId < 12 ? [0x3b82f6, 0x10b981, 0xf59e0b, 0xef4444, 0x8b5cf6, 0x06b6d4, 0xec4899, 0x84cc16, 0xf97316, 0x6366f1, 0x14b8a6, 0xa855f7][clusterId] : 0x6b7280
          });

          clusterId++;
        }
      }

      db.close();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        nodes,
        edges,
        clusters,
        meta: {
          nodeCount: nodes.length,
          edgeCount: edges.length,
          clusterCount: clusters.length,
          similarityRange: { min: edges.length > 0 ? minSim : threshold, max: edges.length > 0 ? maxSim : 1.0 }
        }
      }));
    } catch (err) {
      console.error('Error in /api/embeddings-3d:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // API: /api/rl-reward — RL Reward Map Data
  // Returns Q-values, rewards from patterns/trajectories tables
  // ═══════════════════════════════════════════════════════════════════════
  if (req.url.startsWith('/api/rl-reward')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });

      const result = {
        qValues: [],
        rewards: [],
        stateActionMap: {},
        summary: {
          totalPatterns: 0,
          totalTrajectories: 0,
          avgQValue: 0,
          avgReward: 0,
          minQValue: 0,
          maxQValue: 0,
          minReward: 0,
          maxReward: 0
        },
        meta: {
          hasData: false,
          source: 'patterns+trajectories'
        }
      };

      // Get Q-values from patterns table
      try {
        const patterns = db.prepare('SELECT state, action, q_value, visits, last_update FROM patterns').all();
        if (patterns.length > 0) {
          result.summary.totalPatterns = patterns.length;
          const qValues = patterns.map(p => sanitizeNumber(p.q_value, 0));
          result.summary.avgQValue = sanitizeNumber(qValues.reduce((a, b) => a + b, 0) / qValues.length, 0);
          result.summary.minQValue = sanitizeNumber(Math.min(...qValues), 0);
          result.summary.maxQValue = sanitizeNumber(Math.max(...qValues), 0);

          result.qValues = patterns.map(p => ({
            state: p.state || 'unknown',
            action: p.action || 'unknown',
            qValue: sanitizeNumber(p.q_value, 0),
            visits: sanitizeNumber(p.visits, 0),
            lastUpdate: toMilliseconds(p.last_update)
          }));

          // Build state-action map
          for (const p of patterns) {
            const state = p.state || 'unknown';
            if (!result.stateActionMap[state]) {
              result.stateActionMap[state] = {};
            }
            result.stateActionMap[state][p.action || 'unknown'] = sanitizeNumber(p.q_value, 0);
          }
          result.meta.hasData = true;
        }
      } catch (e) { /* patterns table may not exist */ }

      // Get rewards from trajectories table
      try {
        const trajectories = db.prepare('SELECT state, action, outcome, reward, timestamp FROM trajectories ORDER BY timestamp DESC LIMIT 100').all();
        if (trajectories.length > 0) {
          result.summary.totalTrajectories = trajectories.length;
          const rewards = trajectories.map(t => sanitizeNumber(t.reward, 0));
          result.summary.avgReward = sanitizeNumber(rewards.reduce((a, b) => a + b, 0) / rewards.length, 0);
          result.summary.minReward = sanitizeNumber(Math.min(...rewards), 0);
          result.summary.maxReward = sanitizeNumber(Math.max(...rewards), 0);

          result.rewards = trajectories.map(t => ({
            state: t.state || 'unknown',
            action: t.action || 'unknown',
            outcome: t.outcome || 'unknown',
            reward: sanitizeNumber(t.reward, 0),
            timestamp: toMilliseconds(t.timestamp)
          }));
          result.meta.hasData = true;
        }
      } catch (e) { /* trajectories table may not exist */ }

      db.close();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sanitizeNumericObject(result, 0)));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // API: /api/learning/velocity — Learning Velocity Metrics
  // Returns learning rate, convergence, and velocity metrics
  // ═══════════════════════════════════════════════════════════════════════
  if (req.url.startsWith('/api/learning/velocity')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });

      const result = {
        velocity: 0,
        convergenceRate: 0,
        learningRate: 0,
        recentUpdates: 0,
        trend: [],
        metrics: {
          patternsPerHour: 0,
          trajectoriesPerHour: 0,
          avgRewardDelta: 0,
          updateFrequency: 0
        },
        meta: {
          hasData: false,
          source: 'patterns+trajectories+learning_data'
        }
      };

      // Calculate patterns per hour
      try {
        const patternStats = db.prepare(`
          SELECT COUNT(*) AS total,
                 MIN(last_update) AS minTs,
                 MAX(last_update) AS maxTs
          FROM patterns
        `).get();
        if (patternStats && patternStats.total > 0) {
          const minTs = sanitizeNumber(patternStats.minTs, 0);
          const maxTs = sanitizeNumber(patternStats.maxTs, 0);
          const spanHours = Math.max((maxTs - minTs) / 3600, 1);
          result.metrics.patternsPerHour = sanitizeNumber(patternStats.total / spanHours, 0);
          result.meta.hasData = true;
        }
      } catch (e) { /* patterns table may not exist */ }

      // Calculate trajectories per hour
      try {
        const trajStats = db.prepare(`
          SELECT COUNT(*) AS total,
                 MIN(CASE WHEN timestamp < 1e12 THEN timestamp ELSE timestamp / 1000 END) AS minTs,
                 MAX(CASE WHEN timestamp < 1e12 THEN timestamp ELSE timestamp / 1000 END) AS maxTs
          FROM trajectories
        `).get();
        if (trajStats && trajStats.total > 0) {
          const minTs = sanitizeNumber(trajStats.minTs, 0);
          const maxTs = sanitizeNumber(trajStats.maxTs, 0);
          const spanHours = Math.max((maxTs - minTs) / 3600, 1);
          result.metrics.trajectoriesPerHour = sanitizeNumber(trajStats.total / spanHours, 0);
          result.meta.hasData = true;
        }
      } catch (e) { /* trajectories table may not exist */ }

      // Get learning data for convergence/velocity
      try {
        const ld = getLearningData(db);
        if (ld && ld.rewardHistory && ld.rewardHistory.length > 0) {
          const recentRewards = ld.rewardHistory.slice(-20);
          const olderRewards = ld.rewardHistory.slice(-40, -20);

          const recentAvg = recentRewards.length > 0 ?
            recentRewards.reduce((a, b) => a + sanitizeNumber(b.reward, 0), 0) / recentRewards.length : 0;
          const olderAvg = olderRewards.length > 0 ?
            olderRewards.reduce((a, b) => a + sanitizeNumber(b.reward, 0), 0) / olderRewards.length : 0;

          result.velocity = sanitizeNumber((recentAvg - olderAvg) * 100, 0);
          result.metrics.avgRewardDelta = sanitizeNumber(recentAvg - olderAvg, 0);
          result.recentUpdates = recentRewards.length;

          // Build trend from reward history
          result.trend = ld.rewardHistory.slice(-50).map((r, i) => ({
            index: i,
            reward: sanitizeNumber(r.reward, 0),
            timestamp: r.timestamp ? toMilliseconds(r.timestamp) : null
          }));

          result.meta.hasData = true;
        }
      } catch (e) { /* learning_data may not exist */ }

      // Calculate learning rate from stats
      try {
        const stats = db.prepare("SELECT key, value FROM stats WHERE key IN ('total_patterns', 'session_count')").all();
        const statsMap = {};
        for (const s of stats) {
          statsMap[s.key] = sanitizeNumber(parseInt(s.value), 0);
        }
        if (statsMap.total_patterns && statsMap.session_count) {
          result.learningRate = sanitizeNumber(statsMap.total_patterns / Math.max(statsMap.session_count, 1), 0);
        }
      } catch (e) { /* stats table may not exist */ }

      // Overall velocity calculation
      result.velocity = sanitizeNumber(result.metrics.patternsPerHour + result.metrics.trajectoriesPerHour, 0);
      result.convergenceRate = sanitizeNumber(Math.min(result.velocity / 10, 1), 0);
      result.metrics.updateFrequency = sanitizeNumber(result.metrics.patternsPerHour + result.metrics.trajectoriesPerHour, 0);

      db.close();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sanitizeNumericObject(result, 0)));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // API: /api/sona/compression-stats — SONA Compression Statistics
  // Returns compression metrics from compressed_patterns table
  // ═══════════════════════════════════════════════════════════════════════
  if (req.url.startsWith('/api/sona/compression-stats')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });

      const result = {
        totalCompressed: 0,
        avgCompressionRatio: 0,
        totalOriginalSize: 0,
        totalCompressedSize: 0,
        byLayer: {},
        history: [],
        meta: {
          hasData: false,
          source: 'compressed_patterns'
        }
      };

      // Query compressed_patterns table
      try {
        const compressed = db.prepare(`
          SELECT layer, compression_ratio, LENGTH(data) AS data_size, created_at, metadata
          FROM compressed_patterns
          ORDER BY created_at DESC
        `).all();

        if (compressed.length > 0) {
          result.totalCompressed = compressed.length;
          let totalRatio = 0;
          let totalOriginal = 0;
          let totalComp = 0;

          for (const c of compressed) {
            const ratio = sanitizeNumber(c.compression_ratio, 1);
            const dataSize = sanitizeNumber(c.data_size, 0);
            totalRatio += ratio;
            totalComp += dataSize;
            totalOriginal += ratio > 0 ? dataSize * ratio : dataSize;

            // Group by layer
            const layer = c.layer || 'default';
            if (!result.byLayer[layer]) {
              result.byLayer[layer] = { count: 0, avgRatio: 0, totalSize: 0 };
            }
            result.byLayer[layer].count++;
            result.byLayer[layer].avgRatio += ratio;
            result.byLayer[layer].totalSize += dataSize;

            result.history.push({
              layer: layer,
              ratio: ratio,
              size: dataSize,
              timestamp: toMilliseconds(c.created_at)
            });
          }

          result.avgCompressionRatio = sanitizeNumber(totalRatio / compressed.length, 1);
          result.totalOriginalSize = sanitizeNumber(totalOriginal, 0);
          result.totalCompressedSize = sanitizeNumber(totalComp, 0);

          // Finalize by-layer averages
          for (const layer in result.byLayer) {
            result.byLayer[layer].avgRatio = sanitizeNumber(
              result.byLayer[layer].avgRatio / result.byLayer[layer].count, 1
            );
          }

          result.meta.hasData = true;
        } else {
          // No compressed patterns yet - derive from patterns/memories
          try {
            const patternsCount = db.prepare('SELECT COUNT(*) AS c FROM patterns').get()?.c || 0;
            const memoriesCount = db.prepare('SELECT COUNT(*) AS c FROM memories').get()?.c || 0;

            if (patternsCount > 0 || memoriesCount > 0) {
              result.totalCompressed = 0;
              result.avgCompressionRatio = 1.0;
              result.totalOriginalSize = (patternsCount + memoriesCount) * 256; // Estimated
              result.totalCompressedSize = result.totalOriginalSize;
              result.byLayer = {
                'patterns': { count: patternsCount, avgRatio: 1.0, totalSize: patternsCount * 128 },
                'memories': { count: memoriesCount, avgRatio: 1.0, totalSize: memoriesCount * 128 }
              };
              result.meta.hasData = true;
              result.meta.note = 'No compression applied yet - showing raw data sizes';
            }
          } catch (e) { /* tables may not exist */ }
        }
      } catch (e) {
        // compressed_patterns table may not exist - generate fallback
        result.meta.note = 'compressed_patterns table not found';
      }

      db.close();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sanitizeNumericObject(result, 0)));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // API: /api/trajectories/flow — Trajectory Flow Data (Sankey format)
  // Returns flow data for state->action->outcome visualization
  // ═══════════════════════════════════════════════════════════════════════
  if (req.url.startsWith('/api/trajectories/flow')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });

      const result = {
        nodes: [],
        links: [],
        summary: {
          totalFlows: 0,
          uniqueStates: 0,
          uniqueActions: 0,
          uniqueOutcomes: 0
        },
        meta: {
          hasData: false,
          source: 'trajectories'
        }
      };

      try {
        // Get aggregated flows: state -> action -> outcome
        const flows = db.prepare(`
          SELECT state, action, outcome, COUNT(*) AS count, SUM(reward) AS total_reward, AVG(reward) AS avg_reward
          FROM trajectories
          GROUP BY state, action, outcome
          ORDER BY count DESC
        `).all();

        if (flows.length > 0) {
          const nodeMap = new Map();
          let nodeId = 0;

          // Helper to get or create node
          const getNodeId = (name, type) => {
            const key = `${type}:${name}`;
            if (!nodeMap.has(key)) {
              nodeMap.set(key, { id: nodeId, name: name || 'unknown', type });
              nodeId++;
            }
            return nodeMap.get(key).id;
          };

          // Build nodes and links from flows
          for (const flow of flows) {
            const stateId = getNodeId(flow.state, 'state');
            const actionId = getNodeId(flow.action, 'action');
            const outcomeId = getNodeId(flow.outcome, 'outcome');

            // State -> Action link
            result.links.push({
              source: stateId,
              target: actionId,
              value: sanitizeNumber(flow.count, 1),
              avgReward: sanitizeNumber(flow.avg_reward, 0)
            });

            // Action -> Outcome link
            result.links.push({
              source: actionId,
              target: outcomeId,
              value: sanitizeNumber(flow.count, 1),
              avgReward: sanitizeNumber(flow.avg_reward, 0)
            });
          }

          // Convert node map to array
          result.nodes = Array.from(nodeMap.values()).map(n => ({
            id: n.id,
            name: n.name,
            type: n.type,
            color: n.type === 'state' ? '#3b82f6' : n.type === 'action' ? '#10b981' : '#f59e0b'
          }));

          // Deduplicate links by aggregating
          const linkMap = new Map();
          for (const link of result.links) {
            const key = `${link.source}-${link.target}`;
            if (linkMap.has(key)) {
              linkMap.get(key).value += link.value;
            } else {
              linkMap.set(key, { ...link });
            }
          }
          result.links = Array.from(linkMap.values());

          result.summary.totalFlows = flows.length;
          result.summary.uniqueStates = result.nodes.filter(n => n.type === 'state').length;
          result.summary.uniqueActions = result.nodes.filter(n => n.type === 'action').length;
          result.summary.uniqueOutcomes = result.nodes.filter(n => n.type === 'outcome').length;
          result.meta.hasData = true;
        }
      } catch (e) {
        // trajectories table may not exist
        result.meta.note = 'trajectories table not found or empty';
      }

      db.close();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sanitizeNumericObject(result, 0)));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // API: /api/embeddings/projection — 2D Embedding Projections
  // Returns array of embedding projections with coordinates
  // ═══════════════════════════════════════════════════════════════════════
  if (req.url.startsWith('/api/embeddings/projection')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });

      const result = [];

      try {
        // Get memories with embeddings
        const memories = db.prepare(`
          SELECT id, content, memory_type, embedding, metadata, timestamp
          FROM memories
          WHERE embedding IS NOT NULL AND LENGTH(embedding) > 0
          LIMIT 200
        `).all();

        if (memories.length > 0) {
          // Parse embeddings and prepare for UMAP
          const validMemories = [];
          const embeddings = [];

          for (const mem of memories) {
            const emb = parseEmbedding(mem.embedding);
            if (emb && emb.length > 0) {
              validMemories.push(mem);
              embeddings.push(emb);
            }
          }

          if (embeddings.length >= 5) {
            // Run UMAP for 2D projection
            const umap = new UMAP({
              nComponents: 2,
              nNeighbors: Math.min(15, embeddings.length - 1),
              minDist: 0.1,
              spread: 1.0
            });

            const projected = umap.fit(embeddings);

            // Build result array
            for (let i = 0; i < validMemories.length; i++) {
              const mem = validMemories[i];
              let meta = {};
              try { meta = JSON.parse(mem.metadata || '{}'); } catch (e) {}

              result.push({
                id: mem.id,
                x: sanitizeNumber(projected[i][0], 0),
                y: sanitizeNumber(projected[i][1], 0),
                label: (mem.content || '').substring(0, 50),
                type: mem.memory_type || 'memory',
                namespace: meta.namespace || mem.memory_type || 'default',
                color: namespaceToColor(meta.namespace || mem.memory_type),
                timestamp: toMilliseconds(mem.timestamp)
              });
            }
          } else {
            // Not enough embeddings for UMAP - use random projection
            for (let i = 0; i < validMemories.length; i++) {
              const mem = validMemories[i];
              let meta = {};
              try { meta = JSON.parse(mem.metadata || '{}'); } catch (e) {}

              result.push({
                id: mem.id,
                x: sanitizeNumber(Math.random() * 10 - 5, 0),
                y: sanitizeNumber(Math.random() * 10 - 5, 0),
                label: (mem.content || '').substring(0, 50),
                type: mem.memory_type || 'memory',
                namespace: meta.namespace || mem.memory_type || 'default',
                color: namespaceToColor(meta.namespace || mem.memory_type),
                timestamp: toMilliseconds(mem.timestamp)
              });
            }
          }
        }
      } catch (e) {
        console.warn('Failed to load embeddings for projection:', e.message);
      }

      db.close();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message, data: [] }));
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // API: /api/hooks/timeline — Hook Events Timeline
  // Returns timeline of hook events derived from stats/memories
  // ═══════════════════════════════════════════════════════════════════════
  if (req.url.startsWith('/api/hooks/timeline')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });

      const result = {
        events: [],
        summary: {
          totalEvents: 0,
          byType: {},
          firstEvent: null,
          lastEvent: null
        },
        meta: {
          hasData: false,
          source: 'memories+trajectories+stats'
        }
      };

      // Derive hook events from memory types
      try {
        const memoryTypes = db.prepare(`
          SELECT memory_type, COUNT(*) AS count, MIN(timestamp) AS first_ts, MAX(timestamp) AS last_ts
          FROM memories
          GROUP BY memory_type
        `).all();

        for (const mt of memoryTypes) {
          const hookType = mt.memory_type || 'unknown';
          result.summary.byType[hookType] = sanitizeNumber(mt.count, 0);
          result.summary.totalEvents += sanitizeNumber(mt.count, 0);

          // Add representative events
          result.events.push({
            type: hookType,
            count: sanitizeNumber(mt.count, 0),
            firstTimestamp: toMilliseconds(mt.first_ts),
            lastTimestamp: toMilliseconds(mt.last_ts),
            source: 'memories'
          });
        }
      } catch (e) { /* memories table may not exist */ }

      // Add trajectory events
      try {
        const trajStats = db.prepare(`
          SELECT outcome, COUNT(*) AS count, MIN(timestamp) AS first_ts, MAX(timestamp) AS last_ts
          FROM trajectories
          GROUP BY outcome
        `).all();

        for (const ts of trajStats) {
          const eventType = `trajectory_${ts.outcome || 'unknown'}`;
          result.summary.byType[eventType] = sanitizeNumber(ts.count, 0);
          result.summary.totalEvents += sanitizeNumber(ts.count, 0);

          result.events.push({
            type: eventType,
            count: sanitizeNumber(ts.count, 0),
            firstTimestamp: toMilliseconds(ts.first_ts),
            lastTimestamp: toMilliseconds(ts.last_ts),
            source: 'trajectories'
          });
        }
      } catch (e) { /* trajectories table may not exist */ }

      // Get session info from stats
      try {
        const sessionStats = db.prepare("SELECT key, value FROM stats WHERE key IN ('session_count', 'last_session')").all();
        for (const s of sessionStats) {
          if (s.key === 'session_count') {
            result.summary.byType['session_start'] = sanitizeNumber(parseInt(s.value), 0);
          }
          if (s.key === 'last_session') {
            result.summary.lastEvent = toMilliseconds(parseInt(s.value));
          }
        }
      } catch (e) { /* stats table may not exist */ }

      // Calculate first/last event
      if (result.events.length > 0) {
        const allFirstTs = result.events.map(e => e.firstTimestamp).filter(t => t != null);
        const allLastTs = result.events.map(e => e.lastTimestamp).filter(t => t != null);
        result.summary.firstEvent = allFirstTs.length > 0 ? Math.min(...allFirstTs) : null;
        result.summary.lastEvent = allLastTs.length > 0 ? Math.max(...allLastTs) : result.summary.lastEvent;
        result.meta.hasData = true;
      }

      db.close();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sanitizeNumericObject(result, 0)));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // API: /api/agents/coordination — Agent Coordination Graph
  // Returns nodes and edges for agent coordination visualization
  // ═══════════════════════════════════════════════════════════════════════
  if (req.url.startsWith('/api/agents/coordination')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });

      const result = {
        nodes: [],
        edges: [],
        summary: {
          totalAgents: 0,
          activeAgents: 0,
          totalInteractions: 0
        },
        meta: {
          hasData: false,
          source: 'agents+edges'
        }
      };

      // Get agents
      try {
        const agents = db.prepare('SELECT name, data FROM agents').all();

        for (let i = 0; i < agents.length; i++) {
          const agent = agents[i];
          let agentData = {};
          try { agentData = JSON.parse(agent.data || '{}'); } catch (e) {}

          const lastSeen = agentData.last_seen || agentData.timestamp || 0;
          const isActive = (Date.now() / 1000 - lastSeen) < 86400; // Active in last 24h

          result.nodes.push({
            id: i,
            name: agent.name || `agent_${i}`,
            type: 'agent',
            lastSeen: toMilliseconds(lastSeen),
            sessionCount: sanitizeNumber(agentData.session_count, 0),
            isActive: isActive,
            color: isActive ? '#10b981' : '#6b7280'
          });

          if (isActive) result.summary.activeAgents++;
        }

        result.summary.totalAgents = agents.length;
        result.meta.hasData = agents.length > 0;
      } catch (e) { /* agents table may not exist */ }

      // Get edges between agents
      try {
        const edges = db.prepare(`
          SELECT source, target, weight, data
          FROM edges
          WHERE json_extract(data, '$.type') = 'agent_interaction'
             OR source IN (SELECT name FROM agents)
             OR target IN (SELECT name FROM agents)
          LIMIT 100
        `).all();

        // Build name to id map
        const nameToId = new Map();
        result.nodes.forEach(n => nameToId.set(n.name, n.id));

        for (const edge of edges) {
          const sourceId = nameToId.get(edge.source);
          const targetId = nameToId.get(edge.target);

          if (sourceId !== undefined && targetId !== undefined) {
            result.edges.push({
              source: sourceId,
              target: targetId,
              weight: sanitizeNumber(edge.weight, 0.5),
              type: 'interaction'
            });
            result.summary.totalInteractions++;
          }
        }
      } catch (e) { /* edges table may not exist */ }

      // If no edges, create synthetic coordination edges based on session overlap
      if (result.edges.length === 0 && result.nodes.length > 1) {
        for (let i = 0; i < result.nodes.length - 1; i++) {
          for (let j = i + 1; j < result.nodes.length; j++) {
            // Create edge if both agents were active
            if (result.nodes[i].isActive || result.nodes[j].isActive) {
              result.edges.push({
                source: i,
                target: j,
                weight: 0.3,
                type: 'potential'
              });
            }
          }
        }
      }

      db.close();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sanitizeNumericObject(result, 0)));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message, nodes: [], edges: [] }));
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // API: /api/memory/search-metrics — Memory Search Performance Metrics
  // Returns search performance statistics
  // ═══════════════════════════════════════════════════════════════════════
  if (req.url.startsWith('/api/memory/search-metrics')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });

      const result = {
        totalMemories: 0,
        embeddedCount: 0,
        embeddingCoverage: 0,
        avgEmbeddingDim: 0,
        searchableNamespaces: [],
        domainDistribution: {},
        metrics: {
          indexHealth: 0,
          estimatedSearchLatency: 0,
          memoryDensity: 0
        },
        meta: {
          hasData: false,
          source: 'memories'
        }
      };

      try {
        // Get memory stats
        const stats = db.prepare(`
          SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END) AS embedded,
            AVG(CASE WHEN embedding IS NOT NULL THEN LENGTH(embedding) / 4 ELSE NULL END) AS avg_dim
          FROM memories
        `).get();

        if (stats && stats.total > 0) {
          result.totalMemories = sanitizeNumber(stats.total, 0);
          result.embeddedCount = sanitizeNumber(stats.embedded, 0);
          result.embeddingCoverage = sanitizeNumber(stats.embedded / stats.total * 100, 0);
          result.avgEmbeddingDim = sanitizeNumber(stats.avg_dim, 0);
          result.meta.hasData = true;

          // Calculate metrics
          result.metrics.indexHealth = sanitizeNumber(result.embeddingCoverage, 0);
          result.metrics.estimatedSearchLatency = sanitizeNumber(Math.log10(result.totalMemories + 1) * 5, 0); // ms estimate
          result.metrics.memoryDensity = sanitizeNumber(result.embeddedCount / Math.max(result.totalMemories, 1) * 100, 0);
        }

        // Get namespaces
        const namespaces = db.prepare(`
          SELECT DISTINCT json_extract(metadata, '$.namespace') AS namespace, COUNT(*) AS count
          FROM memories
          WHERE json_extract(metadata, '$.namespace') IS NOT NULL
          GROUP BY namespace
        `).all();

        result.searchableNamespaces = namespaces.map(n => ({
          namespace: n.namespace || 'default',
          count: sanitizeNumber(n.count, 0)
        }));

        // Get domain distribution
        const domains = db.prepare(`
          SELECT DISTINCT json_extract(metadata, '$.domain') AS domain, COUNT(*) AS count
          FROM memories
          WHERE json_extract(metadata, '$.domain') IS NOT NULL
          GROUP BY domain
        `).all();

        for (const d of domains) {
          result.domainDistribution[d.domain || 'unknown'] = sanitizeNumber(d.count, 0);
        }

      } catch (e) {
        console.warn('Failed to get memory search metrics:', e.message);
      }

      db.close();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sanitizeNumericObject(result, 0)));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // API: /api/sona/attention — SONA Attention Weights (alias for sona-attention)
  // Returns attention mechanism data
  // ═══════════════════════════════════════════════════════════════════════
  if (req.url.startsWith('/api/sona/attention')) {
    // Redirect to existing sona-attention endpoint logic
    try {
      const db = new Database(DB_PATH, { readonly: true });

      const result = {
        mechanisms: [],
        weights: {},
        timing: {
          current: 0,
          target: 0.05,
          average: 0
        },
        meta: {
          hasData: false,
          source: 'kv_store'
        }
      };

      const MECHANISM_NAMES = [
        'temporal', 'semantic', 'structural', 'reward', 'frequency',
        'recency', 'domain', 'confidence', 'ewc', 'adaptation'
      ];

      try {
        const attentionRow = db.prepare("SELECT value FROM kv_store WHERE key = 'sona_attention'").get();
        if (attentionRow?.value) {
          const attention = JSON.parse(attentionRow.value);
          MECHANISM_NAMES.forEach((name, id) => {
            const mechData = attention[name] || {};
            const weight = sanitizeNumber(mechData.current, Math.random() * 0.5);
            result.mechanisms.push({
              id,
              name,
              weight: weight,
              activations: mechData.history || [weight]
            });
            result.weights[name] = weight;
          });
          result.meta.hasData = true;
        } else {
          // Generate synthetic data
          MECHANISM_NAMES.forEach((name, id) => {
            const weight = sanitizeNumber(Math.random() * 0.5 + 0.25, 0.5);
            result.mechanisms.push({
              id,
              name,
              weight: weight,
              activations: [weight]
            });
            result.weights[name] = weight;
          });
          result.meta.isSimulated = true;
          result.meta.hasData = true;
        }

        // Get timing data
        const timingRow = db.prepare("SELECT value FROM kv_store WHERE key = 'sona_timing'").get();
        if (timingRow?.value) {
          const timing = JSON.parse(timingRow.value);
          result.timing = {
            current: sanitizeNumber(timing.current, 0.023),
            target: 0.05,
            average: sanitizeNumber(timing.average, 0.028)
          };
        } else {
          result.timing = {
            current: sanitizeNumber(0.023 + Math.random() * 0.01, 0.025),
            target: 0.05,
            average: 0.028
          };
        }

      } catch (e) {
        console.warn('Failed to load SONA attention:', e.message);
      }

      db.close();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sanitizeNumericObject(result, 0)));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // API: /api/swarm-memory — Swarm Memory Data from .swarm/memory.db
  // Returns memory entries, vector indexes, patterns, and config from swarm DB
  // ═══════════════════════════════════════════════════════════════════════
  if (req.url.startsWith('/api/swarm-memory')) {
    try {
      const swarmDbPath = path.join(__dirname, '..', '.swarm', 'memory.db');

      if (!existsSync(swarmDbPath)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          memoryEntries: [],
          vectorIndexes: [],
          patterns: [],
          metadata: {},
          sessions: [],
          trajectories: [],
          meta: { error: 'Swarm database not found', path: swarmDbPath, hasData: false }
        }));
        return;
      }

      const swarmDb = new Database(swarmDbPath, { readonly: true });

      const result = {
        memoryEntries: [],
        vectorIndexes: [],
        patterns: [],
        metadata: {},
        sessions: [],
        trajectories: [],
        meta: {
          hasData: false,
          source: swarmDbPath,
          schemaVersion: null
        }
      };

      // Get memory entries (§8.1, §8.2 from 05-data-queries.md)
      try {
        const entries = swarmDb.prepare(`
          SELECT
            id,
            key,
            namespace,
            type,
            substr(content, 1, 200) as content_preview,
            access_count,
            datetime(created_at/1000, 'unixepoch') as created,
            datetime(updated_at/1000, 'unixepoch') as updated
          FROM memory_entries
          ORDER BY created_at DESC
          LIMIT 50
        `).all();

        result.memoryEntries = entries.map(e => ({
          id: e.id,
          key: e.key,
          namespace: e.namespace || 'default',
          type: e.type || 'unknown',
          contentPreview: e.content_preview || '',
          accessCount: sanitizeNumber(e.access_count, 0),
          created: e.created,
          updated: e.updated
        }));

        result.meta.hasData = entries.length > 0;
      } catch (e) { /* memory_entries table may not exist */ }

      // Get namespace summary (§8.1)
      try {
        const namespaces = swarmDb.prepare(`
          SELECT
            namespace,
            COUNT(*) as count,
            SUM(access_count) as total_accesses,
            datetime(MAX(updated_at)/1000, 'unixepoch') as last_updated
          FROM memory_entries
          GROUP BY namespace
          ORDER BY count DESC
        `).all();

        result.namespaces = namespaces.map(ns => ({
          namespace: ns.namespace || 'default',
          count: sanitizeNumber(ns.count, 0),
          totalAccesses: sanitizeNumber(ns.total_accesses, 0),
          lastUpdated: ns.last_updated
        }));
      } catch (e) { /* query may fail */ }

      // Get vector indexes (§8.4)
      try {
        const indexes = swarmDb.prepare(`
          SELECT
            name,
            dimensions,
            metric,
            total_vectors,
            hnsw_m,
            hnsw_ef_construction,
            datetime(last_rebuild_at/1000, 'unixepoch') as last_rebuild
          FROM vector_indexes
        `).all();

        result.vectorIndexes = indexes.map(idx => ({
          name: idx.name,
          dimensions: sanitizeNumber(idx.dimensions, 0),
          metric: idx.metric || 'cosine',
          totalVectors: sanitizeNumber(idx.total_vectors, 0),
          hnswM: sanitizeNumber(idx.hnsw_m, 16),
          hnswEfConstruction: sanitizeNumber(idx.hnsw_ef_construction, 200),
          lastRebuild: idx.last_rebuild
        }));
      } catch (e) { /* vector_indexes table may not exist */ }

      // Get metadata/config (§8.3)
      try {
        const metadata = swarmDb.prepare('SELECT key, value FROM metadata ORDER BY key').all();
        for (const m of metadata) {
          result.metadata[m.key] = m.value;
        }
        result.meta.schemaVersion = result.metadata['schema_version'] || null;
      } catch (e) { /* metadata table may not exist */ }

      // Get patterns (§8.5)
      try {
        const patterns = swarmDb.prepare(`
          SELECT
            name,
            pattern_type,
            condition,
            action,
            confidence,
            success_count,
            failure_count,
            ROUND(1.0 * success_count / NULLIF(success_count + failure_count, 0), 3) as success_rate
          FROM patterns
          ORDER BY confidence DESC
          LIMIT 50
        `).all();

        result.patterns = patterns.map(p => ({
          name: p.name,
          patternType: p.pattern_type,
          condition: p.condition,
          action: p.action,
          confidence: sanitizeNumber(p.confidence, 0),
          successCount: sanitizeNumber(p.success_count, 0),
          failureCount: sanitizeNumber(p.failure_count, 0),
          successRate: sanitizeNumber(p.success_rate, 0)
        }));
      } catch (e) { /* patterns table may not exist */ }

      // Get sessions
      try {
        const sessions = swarmDb.prepare(`
          SELECT id, state, status, project_path, branch, tasks_completed, patterns_learned,
                 datetime(created_at/1000, 'unixepoch') as created,
                 datetime(updated_at/1000, 'unixepoch') as updated
          FROM sessions
          ORDER BY created_at DESC
          LIMIT 20
        `).all();

        result.sessions = sessions.map(s => ({
          id: s.id,
          status: s.status,
          projectPath: s.project_path,
          branch: s.branch,
          tasksCompleted: sanitizeNumber(s.tasks_completed, 0),
          patternsLearned: sanitizeNumber(s.patterns_learned, 0),
          created: s.created,
          updated: s.updated
        }));
      } catch (e) { /* sessions table may not exist */ }

      // Get trajectories
      try {
        const trajectories = swarmDb.prepare(`
          SELECT id, session_id, status, verdict, task, total_steps, total_reward,
                 datetime(started_at/1000, 'unixepoch') as started,
                 datetime(ended_at/1000, 'unixepoch') as ended
          FROM trajectories
          ORDER BY started_at DESC
          LIMIT 30
        `).all();

        result.trajectories = trajectories.map(t => ({
          id: t.id,
          sessionId: t.session_id,
          status: t.status,
          verdict: t.verdict,
          task: t.task,
          totalSteps: sanitizeNumber(t.total_steps, 0),
          totalReward: sanitizeNumber(t.total_reward, 0),
          started: t.started,
          ended: t.ended
        }));
      } catch (e) { /* trajectories table may not exist */ }

      swarmDb.close();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sanitizeNumericObject(result, 0)));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message, meta: { hasData: false } }));
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // API: /api/learning-patterns — Learning Patterns from .claude-flow/learning/patterns.db
  // Returns short-term patterns, long-term patterns, trajectories, and session state
  // ═══════════════════════════════════════════════════════════════════════
  if (req.url.startsWith('/api/learning-patterns')) {
    try {
      const learningDbPath = path.join(__dirname, '..', '.claude-flow', 'learning', 'patterns.db');

      if (!existsSync(learningDbPath)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          shortTermPatterns: [],
          longTermPatterns: [],
          trajectories: [],
          sessionState: {},
          learningMetrics: [],
          pipelineStatus: { shortTerm: 0, longTerm: 0 },
          meta: { error: 'Learning patterns database not found', path: learningDbPath, hasData: false }
        }));
        return;
      }

      const learningDb = new Database(learningDbPath, { readonly: true });

      const result = {
        shortTermPatterns: [],
        longTermPatterns: [],
        trajectories: [],
        sessionState: {},
        learningMetrics: [],
        pipelineStatus: { shortTerm: 0, longTerm: 0 },
        meta: {
          hasData: false,
          source: learningDbPath
        }
      };

      // Get short-term pattern summary (§9.1)
      try {
        const shortTerm = learningDb.prepare(`
          SELECT
            strategy,
            domain,
            COUNT(*) as count,
            ROUND(AVG(quality), 3) as avg_quality,
            SUM(usage_count) as total_usage
          FROM short_term_patterns
          GROUP BY strategy, domain
        `).all();

        result.shortTermPatterns = shortTerm.map(p => ({
          strategy: p.strategy,
          domain: p.domain || 'general',
          count: sanitizeNumber(p.count, 0),
          avgQuality: sanitizeNumber(p.avg_quality, 0),
          totalUsage: sanitizeNumber(p.total_usage, 0)
        }));

        result.pipelineStatus.shortTerm = shortTerm.reduce((sum, p) => sum + sanitizeNumber(p.count, 0), 0);
      } catch (e) { /* short_term_patterns table may not exist */ }

      // Get long-term pattern summary (§9.2)
      try {
        const longTerm = learningDb.prepare(`
          SELECT
            strategy,
            domain,
            COUNT(*) as count,
            ROUND(AVG(quality), 3) as avg_quality,
            SUM(usage_count) as total_usage,
            datetime(MIN(promoted_at)/1000, 'unixepoch') as first_promoted,
            datetime(MAX(promoted_at)/1000, 'unixepoch') as last_promoted
          FROM long_term_patterns
          GROUP BY strategy, domain
        `).all();

        result.longTermPatterns = longTerm.map(p => ({
          strategy: p.strategy,
          domain: p.domain || 'general',
          count: sanitizeNumber(p.count, 0),
          avgQuality: sanitizeNumber(p.avg_quality, 0),
          totalUsage: sanitizeNumber(p.total_usage, 0),
          firstPromoted: p.first_promoted,
          lastPromoted: p.last_promoted
        }));

        result.pipelineStatus.longTerm = longTerm.reduce((sum, p) => sum + sanitizeNumber(p.count, 0), 0);
        result.meta.hasData = true;
      } catch (e) { /* long_term_patterns table may not exist */ }

      // Get session state (§9.3)
      try {
        const sessionState = learningDb.prepare('SELECT * FROM session_state').all();
        for (const s of sessionState) {
          result.sessionState[s.key] = s.value;
        }
      } catch (e) { /* session_state table may not exist */ }

      // Get learning trajectory status (§9.4)
      try {
        const trajectories = learningDb.prepare(`
          SELECT
            verdict,
            COUNT(*) as count,
            ROUND(AVG(quality_score), 3) as avg_quality
          FROM trajectories
          GROUP BY verdict
        `).all();

        result.trajectories = trajectories.map(t => ({
          verdict: t.verdict || 'unknown',
          count: sanitizeNumber(t.count, 0),
          avgQuality: sanitizeNumber(t.avg_quality, 0)
        }));
      } catch (e) { /* trajectories table may not exist */ }

      // Get learning metrics (§9.5)
      try {
        const metrics = learningDb.prepare(`
          SELECT
            date(timestamp/1000, 'unixepoch') as day,
            metric_type,
            metric_name,
            ROUND(AVG(metric_value), 3) as avg_value,
            COUNT(*) as data_points
          FROM learning_metrics
          GROUP BY day, metric_type, metric_name
          ORDER BY day DESC, metric_type, metric_name
          LIMIT 100
        `).all();

        result.learningMetrics = metrics.map(m => ({
          day: m.day,
          metricType: m.metric_type,
          metricName: m.metric_name,
          avgValue: sanitizeNumber(m.avg_value, 0),
          dataPoints: sanitizeNumber(m.data_points, 0)
        }));
      } catch (e) { /* learning_metrics table may not exist */ }

      // Get quality distribution for visualization
      try {
        const qualityDist = learningDb.prepare(`
          SELECT
            CASE
              WHEN quality < 0.3 THEN 'low'
              WHEN quality < 0.7 THEN 'medium'
              ELSE 'high'
            END as quality_tier,
            COUNT(*) as count
          FROM long_term_patterns
          GROUP BY quality_tier
        `).all();

        result.qualityDistribution = {};
        for (const q of qualityDist) {
          result.qualityDistribution[q.quality_tier] = sanitizeNumber(q.count, 0);
        }
      } catch (e) { /* long_term_patterns may not exist */ }

      learningDb.close();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sanitizeNumericObject(result, 0)));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message, meta: { hasData: false } }));
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // API: /api/neural-patterns — Neural Patterns from intelligence.db
  // Returns neural patterns with categories, confidence, and usage stats
  // ═══════════════════════════════════════════════════════════════════════
  if (req.url.startsWith('/api/neural-patterns')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });

      const result = {
        patterns: [],
        categories: [],
        summary: {
          total: 0,
          avgConfidence: 0,
          totalUsage: 0,
          withEmbeddings: 0
        },
        meta: {
          hasData: false,
          source: 'neural_patterns'
        }
      };

      // Check if neural_patterns table exists
      const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='neural_patterns'").get();

      if (tableExists) {
        // Get patterns (§5.1, §5.2 from 05-data-queries.md)
        try {
          const patterns = db.prepare(`
            SELECT
              id,
              content,
              category,
              confidence,
              usage,
              CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END as has_embedding,
              datetime(created_at, 'unixepoch') as created,
              datetime(updated_at, 'unixepoch') as updated
            FROM neural_patterns
            ORDER BY usage DESC
            LIMIT 100
          `).all();

          result.patterns = patterns.map(p => ({
            id: p.id,
            content: p.content || '',
            category: p.category || 'unknown',
            confidence: sanitizeNumber(p.confidence, 0),
            usage: sanitizeNumber(p.usage, 0),
            hasEmbedding: !!p.has_embedding,
            created: p.created,
            updated: p.updated
          }));

          result.meta.hasData = patterns.length > 0;
        } catch (e) { /* query may fail */ }

        // Get category distribution (§5.1)
        try {
          const categories = db.prepare(`
            SELECT
              category,
              COUNT(*) as count,
              ROUND(AVG(confidence), 3) as avg_confidence,
              SUM(usage) as total_usage
            FROM neural_patterns
            GROUP BY category
            ORDER BY count DESC
          `).all();

          result.categories = categories.map(c => ({
            category: c.category || 'unknown',
            count: sanitizeNumber(c.count, 0),
            avgConfidence: sanitizeNumber(c.avg_confidence, 0),
            totalUsage: sanitizeNumber(c.total_usage, 0)
          }));
        } catch (e) { /* query may fail */ }

        // Get summary stats
        try {
          const stats = db.prepare(`
            SELECT
              COUNT(*) as total,
              ROUND(AVG(confidence), 3) as avg_confidence,
              SUM(usage) as total_usage,
              SUM(CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END) as with_embeddings
            FROM neural_patterns
          `).get();

          result.summary = {
            total: sanitizeNumber(stats?.total, 0),
            avgConfidence: sanitizeNumber(stats?.avg_confidence, 0),
            totalUsage: sanitizeNumber(stats?.total_usage, 0),
            withEmbeddings: sanitizeNumber(stats?.with_embeddings, 0)
          };
        } catch (e) { /* query may fail */ }
      }

      db.close();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sanitizeNumericObject(result, 0)));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message, meta: { hasData: false } }));
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // API: /api/memories-timeline — Memory Timeline Data
  // Returns memory creation timeline grouped by hour/day
  // ═══════════════════════════════════════════════════════════════════════
  if (req.url.startsWith('/api/memories-timeline')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });

      const result = {
        byHour: [],
        byDay: [],
        byType: [],
        meta: {
          hasData: false,
          source: 'memories'
        }
      };

      // Get timeline by hour (§2.3 from 05-data-queries.md)
      // FIX: Handle both seconds and milliseconds timestamps, and NULL/string timestamps
      // Note: strftime with ISO strings doesn't need 'unixepoch', but unix timestamps do
      try {
        const byHour = db.prepare(`
          SELECT
            CASE
              WHEN timestamp IS NULL THEN NULL
              WHEN typeof(timestamp) = 'text' AND timestamp LIKE '____-__-__%' THEN strftime('%Y-%m-%d %H:00', timestamp)
              WHEN timestamp < 1e12 THEN strftime('%Y-%m-%d %H:00', timestamp, 'unixepoch')
              ELSE strftime('%Y-%m-%d %H:00', timestamp / 1000, 'unixepoch')
            END as hour,
            memory_type,
            COUNT(*) as count
          FROM memories
          WHERE timestamp IS NOT NULL
          GROUP BY hour, memory_type
          HAVING hour IS NOT NULL
          ORDER BY hour DESC, count DESC
          LIMIT 500
        `).all();

        result.byHour = byHour.filter(h => h.hour && h.hour.length >= 13).map(h => ({
          hour: h.hour,
          memoryType: h.memory_type || 'unknown',
          count: sanitizeNumber(h.count, 0)
        }));

        result.meta.hasData = result.byHour.length > 0;
      } catch (e) {
        console.warn('memories-timeline: byHour query failed:', e.message);
      }

      // Get timeline by day
      // FIX: Handle both seconds and milliseconds timestamps, and NULL/string timestamps
      try {
        const byDay = db.prepare(`
          SELECT
            CASE
              WHEN timestamp IS NULL THEN NULL
              WHEN typeof(timestamp) = 'text' AND timestamp LIKE '____-__-__%' THEN DATE(timestamp)
              WHEN timestamp < 1e12 THEN DATE(timestamp, 'unixepoch')
              ELSE DATE(timestamp / 1000, 'unixepoch')
            END as day,
            COUNT(*) as count,
            COUNT(DISTINCT memory_type) as type_count
          FROM memories
          WHERE timestamp IS NOT NULL
          GROUP BY day
          HAVING day IS NOT NULL
          ORDER BY day DESC
          LIMIT 90
        `).all();

        result.byDay = byDay.filter(d => d.day && d.day.length >= 10).map(d => ({
          day: d.day,
          count: sanitizeNumber(d.count, 0),
          typeCount: sanitizeNumber(d.type_count, 0)
        }));
      } catch (e) {
        console.warn('memories-timeline: byDay query failed:', e.message);
      }

      // Get distribution by type (§2.1)
      try {
        const byType = db.prepare(`
          SELECT
            memory_type,
            COUNT(*) as count,
            ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM memories), 1) as percentage
          FROM memories
          GROUP BY memory_type
          ORDER BY count DESC
        `).all();

        result.byType = byType.map(t => ({
          memoryType: t.memory_type || 'unknown',
          count: sanitizeNumber(t.count, 0),
          percentage: sanitizeNumber(t.percentage, 0)
        }));
      } catch (e) { /* query may fail */ }

      db.close();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sanitizeNumericObject(result, 0)));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message, meta: { hasData: false } }));
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // API: /api/memory-types — Memory Type Distribution
  // Returns memory type counts and percentages
  // ═══════════════════════════════════════════════════════════════════════
  if (req.url.startsWith('/api/memory-types')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });

      const result = {
        types: [],
        total: 0,
        meta: {
          hasData: false,
          source: 'memories'
        }
      };

      try {
        const types = db.prepare(`
          SELECT
            memory_type,
            COUNT(*) as count,
            ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM memories), 1) as percentage
          FROM memories
          GROUP BY memory_type
          ORDER BY count DESC
        `).all();

        result.types = types.map(t => ({
          type: t.memory_type || 'unknown',
          count: sanitizeNumber(t.count, 0),
          percentage: sanitizeNumber(t.percentage, 0)
        }));

        result.total = types.reduce((sum, t) => sum + sanitizeNumber(t.count, 0), 0);
        result.meta.hasData = types.length > 0;
      } catch (e) { /* query may fail */ }

      db.close();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sanitizeNumericObject(result, 0)));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message, meta: { hasData: false } }));
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // API: /api/db-stats — Database Size and Statistics
  // Returns database file sizes and row counts for all databases
  // ═══════════════════════════════════════════════════════════════════════
  if (req.url.startsWith('/api/db-stats')) {
    try {
      const result = {
        databases: [],
        totalSize: 0,
        totalRows: 0,
        meta: {
          hasData: false,
          timestamp: Date.now()
        }
      };

      // Define database paths
      const dbPaths = [
        { name: 'intelligence.db', path: path.join(__dirname, '..', '.ruvector', 'intelligence.db') },
        { name: 'memory.db (swarm)', path: path.join(__dirname, '..', '.swarm', 'memory.db') },
        { name: 'memory.db (claude)', path: path.join(__dirname, '..', '.claude', 'memory.db') },
        { name: 'patterns.db', path: path.join(__dirname, '..', '.claude-flow', 'learning', 'patterns.db') }
      ];

      for (const dbInfo of dbPaths) {
        const dbEntry = {
          name: dbInfo.name,
          path: dbInfo.path,
          exists: existsSync(dbInfo.path),
          size: 0,
          sizeFormatted: '0 KB',
          tables: [],
          totalRows: 0
        };

        if (dbEntry.exists) {
          try {
            const stats = statSync(dbInfo.path);
            dbEntry.size = stats.size;
            dbEntry.sizeFormatted = stats.size > 1024 * 1024
              ? `${(stats.size / (1024 * 1024)).toFixed(2)} MB`
              : `${(stats.size / 1024).toFixed(2)} KB`;
            result.totalSize += stats.size;

            // Get table info
            const db = new Database(dbInfo.path, { readonly: true });
            try {
              const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
              for (const table of tables) {
                try {
                  const count = db.prepare(`SELECT COUNT(*) as c FROM "${table.name}"`).get();
                  dbEntry.tables.push({
                    name: table.name,
                    rows: sanitizeNumber(count?.c, 0)
                  });
                  dbEntry.totalRows += sanitizeNumber(count?.c, 0);
                } catch (e) { /* table may not be readable */ }
              }
            } catch (e) { /* query may fail */ }
            db.close();

            result.totalRows += dbEntry.totalRows;
            result.meta.hasData = true;
          } catch (e) { /* file stats may fail */ }
        }

        result.databases.push(dbEntry);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sanitizeNumericObject(result, 0)));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message, meta: { hasData: false } }));
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // API: /api/patterns — Q-Learning Patterns Overview
  // Returns all patterns with Q-values
  // ═══════════════════════════════════════════════════════════════════════
  if (req.url.startsWith('/api/patterns') && !req.url.startsWith('/api/patterns/')) {
    try {
      const db = new Database(DB_PATH, { readonly: true });

      const result = {
        patterns: [],
        summary: {
          total: 0,
          avgQValue: 0,
          totalVisits: 0,
          uniqueStates: 0,
          uniqueActions: 0
        },
        meta: {
          hasData: false,
          source: 'patterns'
        }
      };

      try {
        const patterns = db.prepare('SELECT state, action, q_value, visits, last_update FROM patterns').all();

        if (patterns.length > 0) {
          const states = new Set();
          const actions = new Set();
          let totalQ = 0;
          let totalVisits = 0;

          result.patterns = patterns.map(p => {
            states.add(p.state);
            actions.add(p.action);
            totalQ += sanitizeNumber(p.q_value, 0);
            totalVisits += sanitizeNumber(p.visits, 0);

            return {
              state: p.state || 'unknown',
              action: p.action || 'unknown',
              qValue: sanitizeNumber(p.q_value, 0),
              visits: sanitizeNumber(p.visits, 0),
              lastUpdate: toMilliseconds(p.last_update)
            };
          });

          result.summary.total = patterns.length;
          result.summary.avgQValue = sanitizeNumber(totalQ / patterns.length, 0);
          result.summary.totalVisits = totalVisits;
          result.summary.uniqueStates = states.size;
          result.summary.uniqueActions = actions.size;
          result.meta.hasData = true;
        }
      } catch (e) {
        console.warn('Failed to load patterns:', e.message);
      }

      db.close();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sanitizeNumericObject(result, 0)));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Static files — check root first, then dist/ (for production builds)
  let filePath;
  if (req.url === '/') {
    filePath = '/index.html';
  } else {
    filePath = req.url.split('?')[0];
  }

  if (req.url === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Try root first, then dist/ fallback (production build serves from dist/)
  const rootDir = path.resolve(__dirname);
  const distDir = path.resolve(__dirname, 'dist');
  let fullPath = join(__dirname, filePath);

  // Security: prevent path traversal attacks
  let resolved = path.resolve(fullPath);
  const allowedDirs = [rootDir, distDir].filter(Boolean);
  if (!allowedDirs.some(dir => resolved.startsWith(dir))) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // Fallback: if not found at root, check dist/
  if (!existsSync(fullPath) || statSync(fullPath).isDirectory()) {
    const distPath = join(distDir, filePath);
    const distResolved = path.resolve(distPath);
    if (distResolved.startsWith(distDir) && existsSync(distPath) && !statSync(distPath).isDirectory()) {
      fullPath = distPath;
      resolved = distResolved;
    }
  }

  // For root index.html, prefer dist/index.html (production build)
  if (filePath === '/index.html') {
    const distIndex = join(distDir, 'index.html');
    if (existsSync(distIndex)) {
      fullPath = distIndex;
    }
  }

  if (existsSync(fullPath)) {
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = path.extname(fullPath);
    const contentType = MIME_TYPES[ext] || 'text/plain';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(readFileSync(fullPath));
  } else {
    console.log(`File not found: ${fullPath}`);
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found: ' + filePath);
  }
});

server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║        RUVECTOR VISUALIZATION SERVER                          ║
║           Single-File Mode (intelligence.db)                  ║
╠═══════════════════════════════════════════════════════════════╣
║  WebGL:    http://localhost:${PORT}  (Three.js)                  ║
║  API:      http://localhost:${PORT}/api/graph                    ║
║  Database: ${DB_PATH.substring(0, 47)}...║
╠═══════════════════════════════════════════════════════════════╣
║  Tables (memoryV3):                                             ║
║    - memories (384-dim embeddings)                            ║
║    - patterns (Q-learning)                                    ║
║    - trajectories (state/action/outcome/reward)               ║
║    - agents, edges, errors, file_sequences, stats             ║
╠═══════════════════════════════════════════════════════════════╣
║  Development: npm run dev (Vite hot reload)                   ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});
