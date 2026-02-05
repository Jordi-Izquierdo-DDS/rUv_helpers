/**
 * migrate-embeddings.js - v0.9.7 Embedding Migration
 * Backfills NULL embeddings in neural_patterns table
 */

const Database = require('better-sqlite3');
const path = require('path');

function migrateEmbeddings(dbPath, dryRun = false) {
  const db = new Database(dbPath);

  // Find patterns without embeddings
  const missing = db.prepare(`
    SELECT id, content, category FROM neural_patterns
    WHERE embedding IS NULL OR LENGTH(embedding) = 0
  `).all();

  console.log(`Found ${missing.length} patterns without embeddings`);

  if (missing.length === 0) {
    db.close();
    return { migrated: 0, total: 0 };
  }

  if (dryRun) {
    console.log('Dry run - would migrate:');
    missing.forEach(p => console.log(`  - ${p.id}: ${p.category}`));
    db.close();
    return { migrated: 0, total: missing.length, dryRun: true };
  }

  // Generate hash-based embeddings (fallback)
  const update = db.prepare('UPDATE neural_patterns SET embedding = ? WHERE id = ?');

  let migrated = 0;
  for (const pattern of missing) {
    const content = pattern.content || pattern.category || pattern.id || 'default';
    const embedding = new Float32Array(384);
    for (let i = 0; i < 384; i++) {
      const charCode = content.charCodeAt(i % content.length);
      embedding[i] = Math.sin(charCode * (i + 1) * 0.001) * 0.5;
    }
    const buffer = Buffer.from(embedding.buffer);
    update.run(buffer, pattern.id);
    migrated++;
    console.log(`  Migrated: ${pattern.id}`);
  }

  db.close();
  return { migrated, total: missing.length };
}

if (require.main === module) {
  const dbPath = process.argv[2] || '.ruvector/intelligence.db';
  const dryRun = process.argv.includes('--dry-run');
  const result = migrateEmbeddings(dbPath, dryRun);
  console.log(`\nMigration complete: ${result.migrated}/${result.total} patterns`);
}

module.exports = { migrateEmbeddings };
