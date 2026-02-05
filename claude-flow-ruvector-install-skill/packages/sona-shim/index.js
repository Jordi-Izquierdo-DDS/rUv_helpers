/**
 * sona-shim/index.js - v0.9.7
 *
 * Fox-Method compliant SONA shim.
 *
 * This module provides a clean entry point that routes to either:
 * 1. Native @ruvector/sona (if working)
 * 2. sona-fallback (pure JS implementation)
 *
 * USAGE: Instead of patching node_modules, consumers should:
 *   const { SonaEngine } = require('./packages/sona-shim');
 *
 * Or set in environment:
 *   SONA_MODULE_PATH=./packages/sona-fallback
 *
 * This follows Fox Method Scale 2 (Architectural Extension):
 * - No modification of node_modules
 * - Clean removal: delete this folder
 * - Upstream agnostic: works regardless of @ruvector/sona changes
 */

'use strict';

// Check environment override first
const customPath = process.env.SONA_MODULE_PATH;
if (customPath) {
  try {
    module.exports = require(customPath);
    console.log('[SONA-SHIM] Using custom module from:', customPath);
    return;
  } catch (e) {
    console.warn('[SONA-SHIM] Custom path failed, trying defaults:', e.message);
  }
}

// Try native first
let nativeWorks = false;
let nativeSona = null;

try {
  nativeSona = require('@ruvector/sona');

  // Quick health check - create instance and test storePattern
  const testEngine = new nativeSona.SonaEngine(384, 0.01, 100);

  // Store a test pattern
  const testEmbedding = new Float32Array(384).fill(0.1);
  testEngine.storePattern('test', testEmbedding, { test: true });
  testEngine.storePattern('test', testEmbedding, { test: true });
  testEngine.storePattern('test', testEmbedding, { test: true });

  // Check if it actually stored
  const stats = testEngine.getStats();
  if (stats.patterns_stored > 0) {
    nativeWorks = true;
    console.log('[SONA-SHIM] Native @ruvector/sona is functional');
  } else {
    console.log('[SONA-SHIM] Native @ruvector/sona has storage bug (patterns_stored=0)');
  }

  // Cleanup test engine
  if (testEngine.close) testEngine.close();

} catch (e) {
  console.log('[SONA-SHIM] Native @ruvector/sona unavailable:', e.message);
}

if (nativeWorks) {
  module.exports = nativeSona;
} else {
  // Use fallback
  try {
    const fallbackPath = require('path').resolve(__dirname, '../sona-fallback');
    module.exports = require(fallbackPath);
    console.log('[SONA-SHIM] Using sona-fallback (pure JS)');
  } catch (e) {
    console.error('[SONA-SHIM] CRITICAL: No SONA implementation available!');
    console.error('[SONA-SHIM] Install sona-fallback or fix @ruvector/sona');

    // Provide stub to prevent crashes
    module.exports = {
      SonaEngine: class StubEngine {
        constructor() {
          console.warn('[SONA-STUB] Using non-functional stub!');
          this.stats = { patterns_stored: 0, fallback_active: false, stub: true };
        }
        storePattern() { return false; }
        getPatterns() { return []; }
        tick() { return true; }
        flush() { return true; }
        forceLearn() { return false; }
        applyMicroLora(e) { return e; }
        applyBaseLora(e) { return e; }
        warmup() { return true; }
        getStats() { return this.stats; }
        addEwcTask() { return false; }
        close() {}
      }
    };
  }
}
