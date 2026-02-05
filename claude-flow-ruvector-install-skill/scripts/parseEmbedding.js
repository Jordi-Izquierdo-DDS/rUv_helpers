/**
 * parseEmbedding.js - v0.9.7 Shared Utility
 * Correctly handles Node.js Buffer to Float32Array conversion
 * for SQLite BLOB embeddings.
 */

function parseEmbedding(blob) {
  if (!blob) return null;

  // Handle Node.js Buffer (from SQLite BLOB)
  if (Buffer.isBuffer(blob)) {
    return new Float32Array(
      blob.buffer,
      blob.byteOffset,
      blob.length / 4  // 4 bytes per float32
    );
  }

  // Handle ArrayBufferView
  if (ArrayBuffer.isView(blob)) {
    return new Float32Array(blob.buffer);
  }

  // Handle raw ArrayBuffer or array
  return new Float32Array(blob);
}

function serializeEmbedding(float32Array) {
  if (!float32Array) return null;
  return Buffer.from(float32Array.buffer);
}

function validateEmbedding(embedding, expectedDim = 384) {
  if (!embedding) return { valid: false, error: 'null embedding' };
  if (embedding.length !== expectedDim) {
    return { valid: false, error: `wrong dimension: ${embedding.length} (expected ${expectedDim})` };
  }
  // Check for NaN values
  for (let i = 0; i < embedding.length; i++) {
    if (isNaN(embedding[i])) {
      return { valid: false, error: `NaN at index ${i}` };
    }
  }
  return { valid: true };
}

module.exports = { parseEmbedding, serializeEmbedding, validateEmbedding };
