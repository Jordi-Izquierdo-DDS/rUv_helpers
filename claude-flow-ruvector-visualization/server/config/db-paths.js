/**
 * Centralized Database Path Configuration
 * V3+RV System - All database locations in one place
 *
 * Usage:
 *   import { INTELLIGENCE_DB, getAbsolutePath } from './config/db-paths.js';
 *   const dbPath = getAbsolutePath(INTELLIGENCE_DB);
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base project root (parent of viz directory)
export const PROJECT_ROOT = path.resolve(__dirname, '../../..');

/**
 * Database Paths (relative to project root)
 *
 * 1. INTELLIGENCE_DB - RuVector self-learning memory (SQLite, 384d embeddings)
 * 2. SWARM_MEMORY_DB - Claude-Flow swarm orchestration (SQLite, 384d vectors)
 * 3. CLAUDE_MEMORY_DB - Claude Code integration memory (SQLite, 384d vectors)
 * 4. LEARNING_PATTERNS_DB - Short/long-term pattern learning (SQLite)
 * 5. RUVECTOR_VECTOR_DB - Native HNSW vector index (redb format, 256d vectors)
 */
export const INTELLIGENCE_DB = '.ruvector/intelligence.db';
export const SWARM_MEMORY_DB = '.swarm/memory.db';
export const CLAUDE_MEMORY_DB = '.claude/memory.db';
export const LEARNING_PATTERNS_DB = '.claude-flow/learning/patterns.db';
export const RUVECTOR_VECTOR_DB = 'ruvector.db';

/**
 * Database Metadata
 * Format, embedding dimensions, and purpose for each database
 */
export const DB_METADATA = {
  intelligence: {
    path: INTELLIGENCE_DB,
    format: 'sqlite',
    dimensions: 384,
    model: 'all-MiniLM-L6-v2',
    purpose: 'RuVector self-learning memory, Q-learning, neural patterns, SONA',
    tables: ['memories', 'patterns', 'trajectories', 'neural_patterns', 'edges', 'agents', 'compressed_patterns', 'learning_data', 'stats', 'file_sequences', 'kv_store', 'errors']
  },
  swarm: {
    path: SWARM_MEMORY_DB,
    format: 'sqlite',
    dimensions: 384,
    model: 'all-MiniLM-L6-v2',
    purpose: 'Claude-Flow swarm orchestration, agent memory, vector indexes',
    tables: ['memory_entries', 'metadata', 'patterns', 'sessions', 'trajectories', 'trajectory_steps', 'vector_indexes', 'pattern_history', 'migration_state']
  },
  claude: {
    path: CLAUDE_MEMORY_DB,
    format: 'sqlite',
    dimensions: 384,
    model: 'all-MiniLM-L6-v2',
    purpose: 'Claude Code integration memory (same schema as swarm)',
    tables: ['memory_entries', 'metadata', 'patterns', 'sessions', 'trajectories', 'trajectory_steps', 'vector_indexes']
  },
  learning: {
    path: LEARNING_PATTERNS_DB,
    format: 'sqlite',
    dimensions: null,
    model: null,
    purpose: 'Short-term/long-term pattern learning with promotion pipeline',
    tables: ['short_term_patterns', 'long_term_patterns', 'trajectories', 'hnsw_index', 'learning_metrics', 'session_state']
  },
  ruvectorNative: {
    path: RUVECTOR_VECTOR_DB,
    format: 'redb',
    dimensions: 256,
    model: 'native-hnsw',
    purpose: 'Native HNSW vector index for fast similarity search',
    tables: ['vectors', 'metadata']
  }
};

/**
 * Get absolute path for a database
 * @param {string} relativePath - Relative path from DB constants
 * @param {string} [customRoot] - Optional custom root directory
 * @returns {string} Absolute path to database file
 */
export function getAbsolutePath(relativePath, customRoot = null) {
  const root = customRoot || PROJECT_ROOT;
  return path.resolve(root, relativePath);
}

/**
 * Get all database paths as absolute paths
 * @param {string} [customRoot] - Optional custom root directory
 * @returns {Object} Object with all absolute paths
 */
export function getAllAbsolutePaths(customRoot = null) {
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
 * @param {string} dbKey - Database key (intelligence, swarm, claude, learning, ruvectorNative)
 * @param {string} [customRoot] - Optional custom root directory
 * @returns {boolean} Whether database file exists
 */
export function dbExists(dbKey, customRoot = null) {
  const metadata = DB_METADATA[dbKey];
  if (!metadata) return false;
  const absPath = getAbsolutePath(metadata.path, customRoot);
  return fs.existsSync(absPath);
}

/**
 * Get database metadata
 * @param {string} dbKey - Database key
 * @returns {Object|null} Database metadata or null if not found
 */
export function getMetadata(dbKey) {
  return DB_METADATA[dbKey] || null;
}

/**
 * List all databases with their status
 * @param {string} [customRoot] - Optional custom root directory
 * @returns {Array} Array of database info objects
 */
export function listDatabases(customRoot = null) {
  return Object.entries(DB_METADATA).map(([key, meta]) => {
    const absPath = getAbsolutePath(meta.path, customRoot);
    let size = 0;
    let exists = false;
    try {
      const stats = fs.statSync(absPath);
      exists = true;
      size = stats.size;
    } catch (e) {
      // File doesn't exist
    }
    return {
      key,
      ...meta,
      absolutePath: absPath,
      exists,
      size,
      sizeHuman: exists ? formatBytes(size) : 'N/A'
    };
  });
}

/**
 * Format bytes to human-readable string
 * @param {number} bytes - Number of bytes
 * @returns {string} Human-readable size
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Default export for convenience
export default {
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
  getMetadata,
  listDatabases,
  formatBytes
};
