/**
 * Centralized Database Path Configuration
 * V3+RV System - All database locations in one place
 *
 * Usage:
 *   const { INTELLIGENCE_DB, getAbsolutePath } = require('./config/db-paths');
 *   const dbPath = getAbsolutePath(INTELLIGENCE_DB);
 *
 * Installation:
 *   Copy this file to: viz/server/config/db-paths.js
 */

const path = require('path');

// Base project root (adjust based on file location)
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

/**
 * Database Paths (relative to project root)
 *
 * 1. INTELLIGENCE_DB - RuVector self-learning memory (SQLite, 384d embeddings)
 * 2. SWARM_MEMORY_DB - Claude-Flow swarm orchestration (SQLite, 384d vectors)
 * 3. CLAUDE_MEMORY_DB - Claude Code integration memory (SQLite, 384d vectors)
 * 4. LEARNING_PATTERNS_DB - Short/long-term pattern learning (SQLite)
 * 5. RUVECTOR_VECTOR_DB - Native HNSW vector index (redb format, 256d vectors)
 */
const INTELLIGENCE_DB = '.ruvector/intelligence.db';
const SWARM_MEMORY_DB = '.swarm/memory.db';
const CLAUDE_MEMORY_DB = '.claude/memory.db';
const LEARNING_PATTERNS_DB = '.claude-flow/learning/patterns.db';
const RUVECTOR_VECTOR_DB = 'ruvector.db';

/**
 * Database Metadata
 */
const DB_METADATA = {
  intelligence: {
    path: INTELLIGENCE_DB,
    format: 'sqlite',
    dimensions: 384,
    model: 'all-MiniLM-L6-v2',
    purpose: 'RuVector self-learning memory, Q-learning, neural patterns, SONA'
  },
  swarm: {
    path: SWARM_MEMORY_DB,
    format: 'sqlite',
    dimensions: 384,
    model: 'all-MiniLM-L6-v2',
    purpose: 'Claude-Flow swarm orchestration, agent memory, vector indexes'
  },
  claude: {
    path: CLAUDE_MEMORY_DB,
    format: 'sqlite',
    dimensions: 384,
    model: 'all-MiniLM-L6-v2',
    purpose: 'Claude Code integration memory (same schema as swarm)'
  },
  learning: {
    path: LEARNING_PATTERNS_DB,
    format: 'sqlite',
    dimensions: null,
    model: null,
    purpose: 'Short-term/long-term pattern learning with promotion pipeline'
  },
  ruvectorNative: {
    path: RUVECTOR_VECTOR_DB,
    format: 'redb',
    dimensions: 256,
    model: 'native-hnsw',
    purpose: 'Native HNSW vector index for fast similarity search'
  }
};

/**
 * Get absolute path for a database
 */
function getAbsolutePath(relativePath, customRoot = null) {
  return path.resolve(customRoot || PROJECT_ROOT, relativePath);
}

/**
 * Get all database paths as absolute paths
 */
function getAllAbsolutePaths(customRoot = null) {
  return {
    intelligence: getAbsolutePath(INTELLIGENCE_DB, customRoot),
    swarm: getAbsolutePath(SWARM_MEMORY_DB, customRoot),
    claude: getAbsolutePath(CLAUDE_MEMORY_DB, customRoot),
    learning: getAbsolutePath(LEARNING_PATTERNS_DB, customRoot),
    ruvectorNative: getAbsolutePath(RUVECTOR_VECTOR_DB, customRoot)
  };
}

/**
 * Check if a database file exists
 */
function dbExists(dbKey, customRoot = null) {
  const fs = require('fs');
  const metadata = DB_METADATA[dbKey];
  if (!metadata) return false;
  return fs.existsSync(getAbsolutePath(metadata.path, customRoot));
}

/**
 * List all databases with their status
 */
function listDatabases(customRoot = null) {
  const fs = require('fs');
  return Object.entries(DB_METADATA).map(([key, meta]) => {
    const absPath = getAbsolutePath(meta.path, customRoot);
    let exists = false, size = 0;
    try {
      const stats = fs.statSync(absPath);
      exists = true;
      size = stats.size;
    } catch (e) {}
    return { key, ...meta, absolutePath: absPath, exists, size };
  });
}

module.exports = {
  INTELLIGENCE_DB,
  SWARM_MEMORY_DB,
  CLAUDE_MEMORY_DB,
  LEARNING_PATTERNS_DB,
  RUVECTOR_VECTOR_DB,
  PROJECT_ROOT,
  DB_METADATA,
  getAbsolutePath,
  getAllAbsolutePaths,
  dbExists,
  listDatabases
};
