/**
 * validate-schema.js - v0.9.7 Schema Validator
 * Ensures all required tables exist with correct structure
 */

const REQUIRED_TABLES = [
  'memories', 'edges', 'neural_patterns', 'compressed_patterns',
  'trajectories', 'agents', 'kv_store', 'learning_data', 'patterns',
  'stats', 'errors', 'file_sequences'
];

const REQUIRED_COLUMNS = {
  memories: ['id', 'memory_type', 'content', 'embedding', 'metadata', 'timestamp'],
  neural_patterns: ['id', 'content', 'category', 'embedding', 'confidence', 'usage'],
  compressed_patterns: ['id', 'layer', 'data', 'compression_ratio', 'created_at'],
  edges: ['id', 'source', 'target', 'weight', 'data']
};

function validateSchema(dbPath) {
  const Database = require('better-sqlite3');
  const db = new Database(dbPath, { readonly: true });

  const results = { passed: [], failed: [], warnings: [] };

  // Check tables exist
  const existing = db.prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all().map(t => t.name);

  for (const table of REQUIRED_TABLES) {
    if (existing.includes(table)) {
      results.passed.push(`Table ${table} exists`);
    } else {
      results.failed.push(`Table ${table} MISSING`);
    }
  }

  // Check columns for critical tables
  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    if (!existing.includes(table)) continue;

    const tableInfo = db.prepare(`PRAGMA table_info(${table})`).all();
    const existingCols = tableInfo.map(c => c.name);

    for (const col of columns) {
      if (existingCols.includes(col)) {
        results.passed.push(`${table}.${col} exists`);
      } else {
        results.warnings.push(`${table}.${col} MISSING`);
      }
    }
  }

  db.close();
  return results;
}

if (require.main === module) {
  const dbPath = process.argv[2] || '.ruvector/intelligence.db';
  const results = validateSchema(dbPath);
  console.log('=== Schema Validation ===');
  console.log('Passed:', results.passed.length);
  console.log('Failed:', results.failed.length);
  console.log('Warnings:', results.warnings.length);
  if (results.failed.length > 0) {
    console.log('\nFailed:');
    results.failed.forEach(f => console.log('  -', f));
    process.exit(1);
  }
}

module.exports = { validateSchema, REQUIRED_TABLES, REQUIRED_COLUMNS };
