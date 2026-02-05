#!/usr/bin/env node
// PATCH-ENGINE v0.9.7: Optional engine enhancements
// Replaces: FIX-014, FIX-016, adds SONA warmup
// NEW in v0.9.7:
//   - Version marker updated to __PATCH_ENGINE_V097__
//   - SONA pattern storage bug detection (upstream @ruvector/sona issue)
//   - Debug output wrapped in RUVECTOR_VERBOSE check
//
// Patches: node_modules/ruvector/dist/core/intelligence-engine.js
// OPTIONAL: System works without these (Q-learning fallback, in-memory HNSW)
// Idempotent: checks __PATCH_ENGINE_V097__ marker
// Revert: npm install ruvector@latest

'use strict';

var fs   = require('fs');
var path = require('path');

// v0.9.7: Helper for verbose debug output
function debugLog(msg) {
  if (process.env.RUVECTOR_VERBOSE === 'true') {
    console.log('  [DEBUG] ' + msg);
  }
}

var ENGINE_PATH = path.join(
  process.cwd(),
  'node_modules', 'ruvector', 'dist', 'core', 'intelligence-engine.js'
);

// --- Preflight ----------------------------------------------------------------

if (!fs.existsSync(ENGINE_PATH)) {
  console.error('PATCH-ENGINE: intelligence-engine.js not found at ' + ENGINE_PATH);
  process.exit(1);
}

var src = fs.readFileSync(ENGINE_PATH, 'utf-8');

if (src.indexOf('__PATCH_ENGINE_V097__') !== -1) {
  console.log('PATCH-ENGINE v0.9.7: Already applied (marker found)');
  process.exit(0);
}

// v0.9.7: Also accept older markers as "already patched" (upgrade path)
if (src.indexOf('__PATCH_ENGINE_V096__') !== -1) {
  console.log('PATCH-ENGINE v0.9.7: V096 marker detected, upgrading to v0.9.7...');
  // Remove old marker to allow upgrade
  src = src.replace(/\/\*\s*__PATCH_ENGINE_V096__[^*]*\*\//g, '/* __PATCH_ENGINE_V097__ */');
}
if (src.indexOf('__PATCH_ENGINE_V095__') !== -1 || src.indexOf('__PATCH_ENGINE_V094__') !== -1 || src.indexOf('__PATCH_ENGINE_V092__') !== -1) {
  console.log('PATCH-ENGINE v0.9.7: Older patch version detected, re-applying with v0.9.7 enhancements...');
  // Continue to apply v0.9.7 specific patches
}

var applied  = [];
var skipped  = [];
var dirty    = false;

// ==============================================================================
// FIX-014: HNSW Persistent Storage
// ==============================================================================

(function applyFix014() {
  // If storagePath is already present, skip entirely
  if (src.indexOf('storagePath') !== -1) {
    skipped.push('FIX-014 (storagePath already present)');
    return;
  }

  // Strategy 1: regex patterns for common VectorDB instantiation forms
  var PATTERNS = [
    // new VectorDB({ dimensions: this.config.embeddingDim })
    /new\s+VectorDB\(\{\s*dimensions:\s*(this\.config\.embeddingDim|this\.config\.dimensions|\d+)\s*\}\)/,
    // new VectorDb({ dimensions: ... })
    /new\s+VectorDb\(\{\s*dimensions:\s*(this\.config\.embeddingDim|this\.config\.dimensions|\d+)\s*\}\)/,
    // broader: options object with dimensions but no storagePath
    /new\s+VectorD[bB]\(\{([^}]*dimensions[^}]*)(?!storagePath)\}\)/
  ];

  var matched = false;
  for (var p = 0; p < PATTERNS.length; p++) {
    var match = src.match(PATTERNS[p]);
    if (match) {
      var original = match[0];
      var dimRef   = match[1] || 'this.config.embeddingDim';

      var patched =
        '/* __PATCH_ENGINE_V097__ FIX-014: HNSW persistent storage */\n' +
        '                new VectorDB({\n' +
        '                    dimensions: ' + dimRef + ',\n' +
        '                    storagePath: (function() {\n' +
        '                        \'use strict\';\n' +
        '                        try {\n' +
        '                            var _hnswDir = require(\'path\').join(process.cwd(), \'.ruvector\');\n' +
        '                            if (!require(\'fs\').existsSync(_hnswDir)) require(\'fs\').mkdirSync(_hnswDir, { recursive: true });\n' +
        '                            return require(\'path\').join(_hnswDir, \'hnsw.db\');\n' +
        '                        } catch (_e) { return undefined; }\n' +
        '                    })()\n' +
        '                })';

      src = src.replace(original, patched);
      applied.push('FIX-014/A (regex match, pattern ' + p + ')');
      matched = true;
      dirty = true;
      break;
    }
  }

  // Strategy 2: broader string search with brace-depth tracking
  if (!matched) {
    var altIdx  = src.indexOf('new VectorDB(');
    var altIdx2 = src.indexOf('new VectorDb(');
    var idx     = altIdx > -1 ? altIdx : altIdx2;

    if (idx > -1) {
      var depth = 0;
      var end   = idx;
      for (var i = idx; i < src.length; i++) {
        if (src[i] === '(') depth++;
        if (src[i] === ')') {
          depth--;
          if (depth === 0) { end = i + 1; break; }
        }
      }
      var origBlock = src.substring(idx, end);
      if (origBlock.indexOf('storagePath') === -1) {
        var insertPoint = origBlock.lastIndexOf('}');
        if (insertPoint > -1) {
          var patchedBlock = origBlock.substring(0, insertPoint) +
            ', /* __PATCH_ENGINE_V097__ FIX-014 */ storagePath: (function() { \'use strict\'; try { var d = require(\'path\').join(process.cwd(), \'.ruvector\'); require(\'fs\').mkdirSync(d, { recursive: true }); return require(\'path\').join(d, \'hnsw.db\'); } catch(e) { return undefined; } })()' +
            origBlock.substring(insertPoint);
          src = src.replace(origBlock, patchedBlock);
          applied.push('FIX-014/A (alt brace-walk)');
          dirty = true;
          matched = true;
        }
      }
    }
  }

  if (!matched) {
    skipped.push('FIX-014 (VectorDb constructor not found)');
  }
})();

// ==============================================================================
// FIX-016: TinyDancer Neural Agent Routing
// ==============================================================================

(function applyFix016() {
  // -- Part A1: Add _tinyDancer fields to constructor --------------------------
  var CONSTRUCTOR_END = 'this.initDefaultWorkerMappings();';
  var TINYDANCER_INIT =
    'this.initDefaultWorkerMappings();\n' +
    '        // __PATCH_ENGINE_V097__ FIX-016: Initialize TinyDancer neural router if available\n' +
    '        this._tinyDancer = null;\n' +
    '        this._tinyDancerLoaded = false;\n' +
    '        this._sonaWarm = false;';

  if (src.indexOf(CONSTRUCTOR_END) !== -1 && src.indexOf('_tinyDancer') === -1) {
    src = src.replace(CONSTRUCTOR_END, TINYDANCER_INIT);
    applied.push('FIX-016/A1 (constructor fields)');
    dirty = true;
  } else if (src.indexOf('_tinyDancer') !== -1) {
    skipped.push('FIX-016/A1 (_tinyDancer already present)');
  } else {
    skipped.push('FIX-016/A1 (constructor anchor not found)');
  }

  // -- Part A2: Add TinyDancer helper methods before route() -------------------
  var ROUTE_METHOD = 'async route(task, file)';
  var TINYDANCER_METHODS =
    '// __PATCH_ENGINE_V097__ FIX-016: Lazy TinyDancer initialization\n' +
    '    _getTinyDancer() {\n' +
    '        \'use strict\';\n' +
    '        if (this._tinyDancerLoaded) return this._tinyDancer;\n' +
    '        this._tinyDancerLoaded = true;\n' +
    '        try {\n' +
    '            var td = require(\'@ruvector/tiny-dancer\');\n' +
    '            if (td && td.Router) {\n' +
    '                this._tinyDancer = new td.Router({\n' +
    '                    modelPath: \'\',\n' +
    '                    confidenceThreshold: 0.6,\n' +
    '                    enableCircuitBreaker: true,\n' +
    '                    circuitBreakerThreshold: 5\n' +
    '                });\n' +
    '                this._registerTinyDancerAgents();\n' +
    '            }\n' +
    '        } catch (_e) { /* TinyDancer not available */ }\n' +
    '        return this._tinyDancer;\n' +
    '    }\n' +
    '\n' +
    '    _registerTinyDancerAgents() {\n' +
    '        \'use strict\';\n' +
    '        if (!this._tinyDancer) return;\n' +
    '        try {\n' +
    '            var agentsDir = require(\'path\').join(process.cwd(), \'.claude\', \'agents\');\n' +
    '            if (!require(\'fs\').existsSync(agentsDir)) return;\n' +
    '            var defaultAgents = {\n' +
    '                \'coder\': [\'code\', \'implement\', \'build\', \'fix\', \'develop\'],\n' +
    '                \'reviewer\': [\'review\', \'check\', \'audit\', \'quality\', \'inspect\'],\n' +
    '                \'tester\': [\'test\', \'verify\', \'validate\', \'assert\', \'spec\'],\n' +
    '                \'researcher\': [\'research\', \'find\', \'search\', \'explore\', \'investigate\'],\n' +
    '                \'architect\': [\'design\', \'architecture\', \'plan\', \'structure\', \'pattern\'],\n' +
    '                \'documentation-specialist\': [\'document\', \'readme\', \'guide\', \'explain\', \'describe\'],\n' +
    '                \'security-architect\': [\'security\', \'vulnerability\', \'auth\', \'encrypt\', \'permission\'],\n' +
    '                \'javascript-developer\': [\'javascript\', \'node\', \'react\', \'typescript\', \'frontend\'],\n' +
    '                \'database-specialist\': [\'database\', \'sql\', \'query\', \'schema\', \'migration\'],\n' +
    '                \'devops-engineer\': [\'deploy\', \'ci\', \'docker\', \'kubernetes\', \'pipeline\']\n' +
    '            };\n' +
    '            var dim = (this.config && this.config.embeddingDim) ? this.config.embeddingDim : 384;\n' +
    '            var keys = Object.keys(defaultAgents);\n' +
    '            for (var k = 0; k < keys.length; k++) {\n' +
    '                var agentId = keys[k];\n' +
    '                var keywords = defaultAgents[agentId];\n' +
    '                var embedding = new Float32Array(dim);\n' +
    '                for (var w = 0; w < keywords.length; w++) {\n' +
    '                    var kw = keywords[w];\n' +
    '                    for (var i = 0; i < kw.length; i++) {\n' +
    '                        embedding[(i * 31 + kw.charCodeAt(i)) % dim] += 0.1;\n' +
    '                    }\n' +
    '                }\n' +
    '                var norm = 0;\n' +
    '                for (var n = 0; n < dim; n++) norm += embedding[n] * embedding[n];\n' +
    '                norm = Math.sqrt(norm) || 1;\n' +
    '                for (var n2 = 0; n2 < dim; n2++) embedding[n2] /= norm;\n' +
    '                try {\n' +
    '                    this._tinyDancer.route({\n' +
    '                        queryEmbedding: embedding,\n' +
    '                        candidates: [{ id: agentId, embedding: embedding, successRate: 0.5 }]\n' +
    '                    }).catch(function() {});\n' +
    '                } catch (_e) { /* ignore registration errors */ }\n' +
    '            }\n' +
    '        } catch (_e) { /* agent registration optional */ }\n' +
    '    }\n' +
    '\n' +
    '    // __PATCH_ENGINE_V097__ FIX-016: Record routing outcome for TinyDancer learning\n' +
    '    recordTinyDancerOutcome(agentId, success) {\n' +
    '        \'use strict\';\n' +
    '        try {\n' +
    '            var td = this._getTinyDancer();\n' +
    '            if (td && td.circuitBreakerStatus) {\n' +
    '                if (typeof td.recordOutcome === \'function\') {\n' +
    '                    td.recordOutcome(agentId, success, success ? 1 : -1);\n' +
    '                }\n' +
    '            }\n' +
    '        } catch (_e) { /* optional */ }\n' +
    '    }\n' +
    '\n' +
    '    // __PATCH_ENGINE_V097__: SONA warmup helper\n' +
    '    async warmSona() {\n' +
    '        \'use strict\';\n' +
    '        if (this._sonaWarm) return true;\n' +
    '        try {\n' +
    '            if (this.sona && typeof this.sona.applyMicroLora === \'function\') {\n' +
    '                // Warm SONA with a dummy embedding\n' +
    '                var dim = (this.config && this.config.embeddingDim) ? this.config.embeddingDim : 384;\n' +
    '                var dummy = new Float32Array(dim);\n' +
    '                for (var i = 0; i < dim; i++) dummy[i] = Math.random() * 0.01;\n' +
    '                this.sona.applyMicroLora(dummy);\n' +
    '                this._sonaWarm = true;\n' +
    '                return true;\n' +
    '            }\n' +
    '        } catch (_e) { /* SONA warmup optional */ }\n' +
    '        return false;\n' +
    '    }\n' +
    '\n' +
    '    // __PATCH_ENGINE_V097__: SONA pattern storage bug detection\n' +
    '    _checkSonaStorageBug() {\n' +
    '        \'use strict\';\n' +
    '        // v0.9.7: Detect SONA pattern storage bug (upstream @ruvector/sona issue)\n' +
    '        if (typeof this.sona !== \'undefined\' && this.sona && this.sona.getStats) {\n' +
    '            try {\n' +
    '                var sonaStats = this.sona.getStats();\n' +
    '                if (sonaStats.calls_store > 0 && sonaStats.patterns_stored === 0) {\n' +
    '                    if (process.env.RUVECTOR_VERBOSE === \'true\') {\n' +
    '                        console.log(\'  [WARN] SONA pattern storage bug detected (upstream @ruvector/sona issue)\');\n' +
    '                    }\n' +
    '                    // Could add JS fallback here in future\n' +
    '                    return true;\n' +
    '                }\n' +
    '            } catch (_e) { /* stats check optional */ }\n' +
    '        }\n' +
    '        return false;\n' +
    '    }\n' +
    '\n' +
    '    async route(task, file)';

  if (src.indexOf(ROUTE_METHOD) !== -1 && src.indexOf('_getTinyDancer') === -1) {
    src = src.replace(ROUTE_METHOD, TINYDANCER_METHODS);
    applied.push('FIX-016/A2 (TinyDancer methods + SONA warmup + bug detection)');
    dirty = true;
  } else if (src.indexOf('_getTinyDancer') !== -1) {
    skipped.push('FIX-016/A2 (_getTinyDancer already present)');
  } else {
    skipped.push('FIX-016/A2 (route method anchor not found)');
  }

  // -- Part B: Enhance route() to try TinyDancer first -------------------------
  var ROUTE_BODY_START = 'const ext = file ? this.getExtension(file) : \'\';';
  var ROUTE_TINYDANCER_CHECK =
    '// __PATCH_ENGINE_V097__ FIX-016: Try TinyDancer neural routing first\n' +
    '        // Also warm SONA and check for storage bug\n' +
    '        this.warmSona().catch(function() {});\n' +
    '        this._checkSonaStorageBug();\n' +
    '        var _td = this._getTinyDancer();\n' +
    '        if (_td) {\n' +
    '            try {\n' +
    '                var taskEmbed016 = this.embed(task + \' \' + (file || \'\'));\n' +
    '                var adaptedEmbed016 = this.sona ? this.sona.applyMicroLora(taskEmbed016) : taskEmbed016;\n' +
    '                var tdResult = await _td.route({\n' +
    '                    queryEmbedding: new Float32Array(adaptedEmbed016),\n' +
    '                    candidates: Object.entries(this.agentMappings.size > 0 ? Object.fromEntries(this.agentMappings) : {})\n' +
    '                        .map(function(e) { return { id: e[0], embedding: new Float32Array(adaptedEmbed016), successRate: e[1] || 0.5 }; })\n' +
    '                });\n' +
    '                if (tdResult && tdResult.decisions && tdResult.decisions.length > 0 && tdResult.decisions[0].confidence > 0.6) {\n' +
    '                    var best = tdResult.decisions[0];\n' +
    '                    return {\n' +
    '                        agent: best.candidateId,\n' +
    '                        confidence: best.confidence,\n' +
    '                        reason: \'TinyDancer neural routing (__PATCH_ENGINE_V097__ FIX-016)\',\n' +
    '                        alternates: tdResult.decisions.slice(1, 4).map(function(d) { return d.candidateId; }),\n' +
    '                        patterns: []\n' +
    '                    };\n' +
    '                }\n' +
    '            } catch (_tdErr) { /* Fall through to Q-learning */ }\n' +
    '        }\n' +
    '        const ext = file ? this.getExtension(file) : \'\';';

  if (src.indexOf(ROUTE_BODY_START) !== -1 && src.indexOf('FIX-016: Try TinyDancer') === -1) {
    src = src.replace(ROUTE_BODY_START, ROUTE_TINYDANCER_CHECK);
    applied.push('FIX-016/B (route() TinyDancer-first + SONA warmup + bug check)');
    dirty = true;
  } else if (src.indexOf('FIX-016: Try TinyDancer') !== -1) {
    skipped.push('FIX-016/B (TinyDancer route check already present)');
  } else {
    skipped.push('FIX-016/B (route body anchor not found)');
  }
})();

// ==============================================================================
// FIX-SONA-ALWAYS-WARM (v0.9.6): Add SONA warmup to learn() method
// ==============================================================================

(function applyFixSonaWarm() {
  // Find async learn( method and add SONA warmup at start
  var LEARN_METHOD = 'async learn(trajectory';
  var LEARN_WARM =
    'async learn(trajectory) {\n' +
    '        // __PATCH_ENGINE_V097__: Ensure SONA is warm before learning\n' +
    '        await this.warmSona();';

  if (src.indexOf(LEARN_METHOD) !== -1 && src.indexOf('__PATCH_ENGINE_V097__: Ensure SONA') === -1 && src.indexOf('__PATCH_ENGINE_V096__: Ensure SONA') === -1) {
    // Find the opening brace after the method signature
    var learnIdx = src.indexOf(LEARN_METHOD);
    if (learnIdx > -1) {
      var braceIdx = src.indexOf('{', learnIdx);
      if (braceIdx > -1) {
        var before = src.substring(0, braceIdx + 1);
        var after = src.substring(braceIdx + 1);
        src = before + '\n        // __PATCH_ENGINE_V097__: Ensure SONA is warm before learning\n        await this.warmSona();\n        // v0.9.7: Check for SONA storage bug after learning\n        this._checkSonaStorageBug();' + after;
        applied.push('FIX-SONA-WARM (learn() SONA warmup + bug detection)');
        dirty = true;
      }
    }
  } else if (src.indexOf('__PATCH_ENGINE_V097__: Ensure SONA') !== -1 || src.indexOf('__PATCH_ENGINE_V096__: Ensure SONA') !== -1) {
    skipped.push('FIX-SONA-WARM (already present)');
  } else {
    skipped.push('FIX-SONA-WARM (learn method not found)');
  }
})();

// ==============================================================================
// Write patched file
// ==============================================================================

if (dirty) {
  // Ensure we have the v0.9.7 marker somewhere
  if (src.indexOf('__PATCH_ENGINE_V097__') === -1) {
    // Add marker at top if not already present from other patches
    var firstLine = src.indexOf('\n');
    if (firstLine > -1) {
      src = src.substring(0, firstLine + 1) + '/* __PATCH_ENGINE_V097__ */\n' + src.substring(firstLine + 1);
    }
  }
  fs.writeFileSync(ENGINE_PATH, src);
}

// ==============================================================================
// FIX-SONA-FALLBACK (v0.9.7 NEW): Replace native SONA with JS fallback
// ==============================================================================

(function applySonaFallback() {
  // Check if sona-fallback is available
  var fallbackPath = require('path').join(process.cwd(), 'packages', 'sona-fallback', 'index.js');
  if (!require('fs').existsSync(fallbackPath)) {
    skipped.push('FIX-SONA-FALLBACK (sona-fallback package not deployed)');
    return;
  }

  // Look for @ruvector/sona require
  var SONA_REQUIRE_PATTERNS = [
    /require\s*\(\s*['"]@ruvector\/sona['"]\s*\)/g,
    /from\s*['"]@ruvector\/sona['"]/g
  ];

  var sonaPatched = false;
  for (var i = 0; i < SONA_REQUIRE_PATTERNS.length; i++) {
    if (SONA_REQUIRE_PATTERNS[i].test(src)) {
      // Replace with fallback that tries native first, then JS
      var FALLBACK_REQUIRE =
        '/* __PATCH_ENGINE_V097__ FIX-SONA-FALLBACK */\n' +
        '(function() {\n' +
        '  try {\n' +
        '    // Try sona-fallback first (handles native + JS)\n' +
        '    var fallbackPath = require("path").join(process.cwd(), "packages", "sona-fallback", "index.js");\n' +
        '    if (require("fs").existsSync(fallbackPath)) {\n' +
        '      return require(fallbackPath);\n' +
        '    }\n' +
        '  } catch (e) {}\n' +
        '  // Fallback to native\n' +
        '  try { return require("@ruvector/sona"); } catch (e) { return { SonaEngine: function() { return { tick: function(){}, flush: function(){}, forceLearn: function(){}, getStats: function(){ return {}; } }; } }; }\n' +
        '})()';

      src = src.replace(/require\s*\(\s*['"]@ruvector\/sona['"]\s*\)/g, FALLBACK_REQUIRE);
      sonaPatched = true;
      dirty = true;
    }
  }

  if (sonaPatched) {
    applied.push('FIX-SONA-FALLBACK (SONA require replaced with JS fallback)');
  } else if (src.indexOf('FIX-SONA-FALLBACK') !== -1) {
    skipped.push('FIX-SONA-FALLBACK (already applied)');
  } else {
    skipped.push('FIX-SONA-FALLBACK (@ruvector/sona require not found)');
  }
})();

// --- Report -------------------------------------------------------------------

console.log('');
console.log('PATCH-ENGINE v0.9.7 Summary');
console.log('===========================');

if (applied.length > 0) {
  console.log('Applied (' + applied.length + '):');
  for (var a = 0; a < applied.length; a++) {
    console.log('  + ' + applied[a]);
  }
}

if (skipped.length > 0) {
  console.log('Skipped (' + skipped.length + '):');
  for (var s = 0; s < skipped.length; s++) {
    console.log('  - ' + skipped[s]);
  }
}

if (applied.length === 0) {
  console.log('No patches needed.');
}

console.log('');
console.log('v0.9.7 NEW: SONA pattern storage bug detection + JS fallback, verbose debug output control');
console.log('Verify: grep "__PATCH_ENGINE_V097__" node_modules/ruvector/dist/core/intelligence-engine.js');
console.log('Revert: npm install ruvector@latest');

// Always exit 0 - this script is optional
process.exit(0);
