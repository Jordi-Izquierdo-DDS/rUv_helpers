#!/usr/bin/env node
// PATCH-CLI v0.9.7: Consolidated upstream patches for ruvector cli.js
// Replaces: FIX-005, FIX-006/006b, FIX-008, FIX-013/015, FIX-023 (REWRITTEN)
// NEW in v0.9.7:
//   - Version marker updated to __PATCH_CLI_V097__
//   - Embedding column migration for neural_patterns table
//   - Debug output wrapped in RUVECTOR_VERBOSE check
//   - Inherits v0.9.6: FIX-023 regex fix, FIX-SONA-INIT, FIX-STORAGE-GETTER
//
// Patches: node_modules/ruvector/bin/cli.js
// Idempotent: checks __PATCH_CLI_V097__ (also accepts V096, V095, V094)
// Revert: npm install ruvector@latest
//
// v0.9.7 changes:
//   - Embedding column migration added for neural_patterns schema updates
//   - Debug output now respects RUVECTOR_VERBOSE environment variable
//   - Cleaner output for production use
//
// Dependency order (applied sequentially):
//   1. FIX-005      - SQLite storage shim (factory + load + save)
//   2. FIX-STORAGE  - Public storage getter (v0.9.6)
//   3. FIX-006      - Async ONNX embedding path (async handlers + rememberAsync + RC-C enrichment)
//   4. FIX-008      - Persist lastEditedFile in kv_store across invocations
//   5. FIX-SONA-INIT- Force engine initialization in handlers (v0.9.6)
//   6. FIX-EMBED-MIG- Embedding column migration for neural_patterns (NEW v0.9.7)
//   7. SONA         - Integration (flush + warmup + tick + forceLearn)
//   8. FIX-023      - Reward differentiation (REWRITTEN for v0.9.6)
//
// Usage: node fixes/ruvector/patch-cli.js
//        (Run from project root where node_modules/ lives)

'use strict';

var fs = require('fs');
var nodePath = require('path');

// v0.9.7: Helper for verbose debug output
function debugLog(msg) {
  if (process.env.RUVECTOR_VERBOSE === 'true') {
    console.log('  [DEBUG] ' + msg);
  }
}

var CLI_PATH = nodePath.join(process.cwd(), 'node_modules', 'ruvector', 'bin', 'cli.js');

if (!fs.existsSync(CLI_PATH)) {
  console.error('ERROR: ruvector cli.js not found at ' + CLI_PATH);
  console.error('Run from your project root (where node_modules/ is).');
  process.exit(1);
}

var src = fs.readFileSync(CLI_PATH, 'utf-8');

// -- Idempotency check --------------------------------------------------------
if (src.indexOf('__PATCH_CLI_V097__') !== -1) {
  console.log('PATCH-CLI v0.9.7: Already applied (__PATCH_CLI_V097__ marker found). Skipping.');
  process.exit(0);
}
if (src.indexOf('__PATCH_CLI_V096__') !== -1) {
  console.log('PATCH-CLI v0.9.7: V096 marker found. Upgrading to v0.9.7...');
  // Remove old marker to allow upgrade
  src = src.replace(/\/\/ __PATCH_CLI_V096__[^\n]*\n?/g, '');
}
if (src.indexOf('__PATCH_CLI_V095__') !== -1) {
  console.log('PATCH-CLI v0.9.7: V095 marker found. Upgrading to v0.9.7...');
  src = src.replace(/\/\/ __PATCH_CLI_V095__[^\n]*\n?/g, '');
}
if (src.indexOf('__PATCH_CLI_V094__') !== -1) {
  console.log('PATCH-CLI v0.9.7: V094 marker found. Upgrading to v0.9.7...');
  src = src.replace(/\/\/ __PATCH_CLI_V094__[^\n]*\n?/g, '');
}

var applied = [];
var skipped = [];
var lines; // lazily split when line-based patches need it

// Helper: split into lines (cached)
function getLines() {
  if (!lines) lines = src.split('\n');
  return lines;
}
// Helper: rejoin lines into src
function flushLines() {
  if (lines) { src = lines.join('\n'); lines = null; }
}

// ============================================================================
// 1. FIX-005: SQLite Storage Backend factory + load() + save()
// ============================================================================
(function applyFix005() {
  // -- 1a. Factory shim (insert after loadIntelligenceEngine closing brace) --
  var factoryAnchor = 'return IntelligenceEngine;\n}';
  var factoryIdx = src.indexOf(factoryAnchor);
  if (factoryIdx === -1) {
    factoryAnchor = 'return IntelligenceEngine;\r\n}';
    factoryIdx = src.indexOf(factoryAnchor);
  }

  if (factoryIdx === -1) {
    skipped.push('FIX-005-factory (anchor not found)');
  } else if (src.indexOf('__STORAGE_BACKEND_PATCHED__') !== -1) {
    skipped.push('FIX-005-factory (already present)');
  } else {
    var insertAfter = factoryIdx + factoryAnchor.length;
    var factoryShim = [
      '',
      '// === FIX-005: SQLite Storage Backend (FOX Scale 2) ===',
      '// __STORAGE_BACKEND_PATCHED__',
      'var __storageBackend = null;',
      'var __storageLoadAttempted = false;',
      'function __getStorageInstance() {',
      '  if (__storageBackend) return __storageBackend;',
      '  if (__storageLoadAttempted) return null;',
      '  __storageLoadAttempted = true;',
      '  try {',
      '    var storagePkg = require(require("path").join(process.cwd(), "packages", "ruvector-storage"));',
      '    __storageBackend = storagePkg.createStorageFromEnv();',
      '    return __storageBackend;',
      '  } catch (e) {',
      '    return null;',
      '  }',
      '}',
      '// === END FIX-005 factory ===',
      ''
    ].join('\n');

    src = src.substring(0, insertAfter) + '\n' + factoryShim + src.substring(insertAfter);
    applied.push('FIX-005-factory');
  }

  // -- 1b. Patch load() to try SQLite backend first ---------------------------
  var loadMethodSig = 'load() {';
  var loadIdx = src.indexOf(loadMethodSig);
  if (loadIdx === -1) {
    skipped.push('FIX-005-load (load() not found)');
  } else if (src.indexOf('FIX-005: Try SQLite backend first') !== -1) {
    skipped.push('FIX-005-load (already present)');
  } else {
    var afterLoad = src.indexOf('try {', loadIdx + loadMethodSig.length);
    if (afterLoad === -1) {
      skipped.push('FIX-005-load (try block not found)');
    } else {
      var sqliteLoadBlock = [
        '    // FIX-005: Try SQLite backend first',
        '    var storage = __getStorageInstance();',
        '    if (storage) {',
        '      this._storage = storage;',
        '      try {',
        '        if (storage.isJsonNewer()) {',
        '          storage.importFromJson();',
        '        }',
        '        var data = storage.loadAll();',
        '        if (data && (data.memories.length > 0 || Object.keys(data.patterns).length > 0)) {',
        '          storage.writeJsonMirror(data);',
        '          return data;',
        '        }',
        '        if (fs.existsSync(this.intelPath)) {',
        '          var jsonData = JSON.parse(fs.readFileSync(this.intelPath, "utf-8"));',
        '          var merged = {',
        '            patterns: jsonData.patterns || defaults.patterns,',
        '            memories: jsonData.memories || defaults.memories,',
        '            trajectories: jsonData.trajectories || defaults.trajectories,',
        '            errors: jsonData.errors || defaults.errors,',
        '            file_sequences: jsonData.file_sequences || defaults.file_sequences,',
        '            agents: jsonData.agents || defaults.agents,',
        '            edges: jsonData.edges || defaults.edges,',
        '            stats: Object.assign({}, defaults.stats, jsonData.stats || {}),',
        '            learning: jsonData.learning || undefined',
        '          };',
        '          storage.saveAll(merged);',
        '          storage.writeJsonMirror(merged);',
        '          return merged;',
        '        }',
        '        return defaults;',
        '      } catch (e) {',
        '        // Fall through to JSON',
        '      }',
        '    }',
        '    // Original JSON fallback',
        ''
      ].join('\n');

      src = src.substring(0, afterLoad) + sqliteLoadBlock + src.substring(afterLoad);
      applied.push('FIX-005-load');
    }
  }

  // -- 1c. Patch save() to write to SQLite + JSON mirror ----------------------
  var saveFinalWrite = "fs.writeFileSync(this.intelPath, JSON.stringify(this.data, null, 2));\n  }";
  var saveFinalIdx = src.indexOf(saveFinalWrite);
  if (saveFinalIdx === -1) {
    saveFinalWrite = "fs.writeFileSync(this.intelPath, JSON.stringify(this.data, null, 2));";
    saveFinalIdx = src.indexOf(saveFinalWrite);
  }

  if (saveFinalIdx === -1) {
    skipped.push('FIX-005-save (writeFileSync anchor not found)');
  } else if (src.indexOf('FIX-005: Write to SQLite') !== -1) {
    skipped.push('FIX-005-save (already present)');
  } else {
    var sqliteSaveBlock = [
      '    // FIX-005: Write to SQLite (primary) + JSON mirror (for hardcoded subcommands)',
      '    var storage = this._storage || __getStorageInstance();',
      '    if (storage) {',
      '      try {',
      '        storage.saveAll(this.data);',
      '        storage.writeJsonMirror(this.data);',
      '        return;',
      '      } catch (e) {',
      '        // Fall through to JSON-only',
      '      }',
      '    }',
      '    // Original JSON fallback',
      '    '
    ].join('\n');

    src = src.substring(0, saveFinalIdx) + sqliteSaveBlock + src.substring(saveFinalIdx);
    applied.push('FIX-005-save');
  }
})();

// ============================================================================
// 1b. FIX-STORAGE-GETTER: Add public storage getter to Intelligence class
// (v0.9.6 - fixes intel.storage being undefined in FIX-008)
// ============================================================================
(function applyStorageGetter() {
  if (src.indexOf('FIX-STORAGE-GETTER') !== -1 || src.indexOf('get storage()') !== -1) {
    skipped.push('FIX-STORAGE-GETTER (already present)');
    return;
  }

  // Find the Intelligence class opening
  var classMatch = /class\s+Intelligence\s*\{/.exec(src);
  if (!classMatch) {
    skipped.push('FIX-STORAGE-GETTER (Intelligence class not found)');
    return;
  }

  var insertPoint = classMatch.index + classMatch[0].length;
  var getter = [
    '',
    '  // FIX-STORAGE-GETTER (v0.9.6): Public accessor for storage adapter',
    '  get storage() {',
    '    return this._storage;',
    '  }',
    ''
  ].join('\n');

  src = src.slice(0, insertPoint) + getter + src.slice(insertPoint);
  applied.push('FIX-STORAGE-GETTER');
})();

// ============================================================================
// 2. FIX-006: Async ONNX Embedding Path (async handlers + rememberAsync + RC-C)
// ============================================================================
(function applyFix006() {
  var patchCount = 0;

  // -- Step A: Make post-edit and post-command action handlers async ----------
  var postEditPattern = /\.command\('post-edit'\)[^]*?\.action\(\((file,\s*opts)\)\s*=>\s*\{/;
  var postEditMatch = src.match(postEditPattern);

  if (postEditMatch) {
    var original = postEditMatch[0];
    if (original.indexOf('async (file') !== -1) {
      // Already async
    } else {
      var patched = original.replace(
        /\.action\(\((file,\s*opts)\)\s*=>\s*\{/,
        '.action(async ($1) => {'
      );
      src = src.replace(original, patched);
      patchCount++;
    }
  }

  var postCmdPattern = /\.command\('post-command'\)[^]*?\.action\(\((command,\s*opts)\)\s*=>\s*\{/;
  var postCmdMatch = src.match(postCmdPattern);

  if (postCmdMatch) {
    var original2 = postCmdMatch[0];
    if (original2.indexOf('async (command') !== -1) {
      // Already async
    } else {
      var patched2 = original2.replace(
        /\.action\(\((command,\s*opts)\)\s*=>\s*\{/,
        '.action(async ($1) => {'
      );
      src = src.replace(original2, patched2);
      patchCount++;
    }
  }

  if (patchCount > 0) {
    applied.push('FIX-006-stepA (' + patchCount + ' handler(s) made async)');
  } else {
    var hasAsyncEdit = /\.command\('post-edit'\)[^]*?\.action\(async\s/.test(src);
    var hasAsyncCmd = /\.command\('post-command'\)[^]*?\.action\(async\s/.test(src);
    if (hasAsyncEdit && hasAsyncCmd) {
      skipped.push('FIX-006-stepA (already async)');
    } else {
      skipped.push('FIX-006-stepA (patterns not matched)');
    }
  }

  // -- Step B: Replace sync intel.remember() with await intel.rememberAsync() --
  var ll = getLines();
  var stepBCount = 0;

  function patchBlock(commandName, memoryType) {
    var inBlock = false;
    var linesInBlock = 0;
    var BLOCK_SCOPE = 40;

    for (var i = 0; i < ll.length; i++) {
      if (ll[i].indexOf(".command('" + commandName + "')") !== -1) {
        inBlock = true;
        linesInBlock = 0;
        continue;
      }

      if (inBlock) {
        linesInBlock++;
        if (linesInBlock > BLOCK_SCOPE) {
          inBlock = false;
          continue;
        }

        var syncPattern = new RegExp("intel\\.remember\\('" + memoryType + "',");
        var asyncPattern = new RegExp("intel\\.rememberAsync\\('" + memoryType + "',");

        if (syncPattern.test(ll[i]) && !asyncPattern.test(ll[i])) {
          var hasAwait = ll[i].indexOf('await') !== -1;
          if (!hasAwait) {
            ll[i] = ll[i].replace(
              "intel.remember('" + memoryType + "',",
              "await intel.rememberAsync('" + memoryType + "',"
            );
            stepBCount++;
          } else {
            ll[i] = ll[i].replace(
              "intel.remember('" + memoryType + "',",
              "intel.rememberAsync('" + memoryType + "',"
            );
            stepBCount++;
          }
          inBlock = false;
        }
      }
    }
  }

  patchBlock('post-edit', 'edit');
  patchBlock('post-command', 'command');
  flushLines();

  if (stepBCount > 0) {
    applied.push('FIX-006-stepB (' + stepBCount + ' call site(s) -> rememberAsync)');
  } else {
    var alreadyPatched = 0;
    var tempLines = src.split('\n');
    var inEditBlock = false, inCmdBlock = false;
    var editLines = 0, cmdLines = 0;

    for (var i = 0; i < tempLines.length; i++) {
      if (tempLines[i].indexOf(".command('post-edit')") !== -1) { inEditBlock = true; editLines = 0; }
      if (tempLines[i].indexOf(".command('post-command')") !== -1) { inCmdBlock = true; cmdLines = 0; }

      if (inEditBlock) {
        editLines++;
        if (editLines > 40) inEditBlock = false;
        if (/intel\.rememberAsync\('edit',/.test(tempLines[i])) { alreadyPatched++; inEditBlock = false; }
      }
      if (inCmdBlock) {
        cmdLines++;
        if (cmdLines > 40) inCmdBlock = false;
        if (/intel\.rememberAsync\('command',/.test(tempLines[i])) { alreadyPatched++; inCmdBlock = false; }
      }
    }

    if (alreadyPatched >= 2) {
      skipped.push('FIX-006-stepB (already uses rememberAsync)');
    } else {
      skipped.push('FIX-006-stepB (patterns not matched)');
    }
  }

  // -- Step C (RC-C): Enrich post-edit remember content with basename ----------
  var ll2 = getLines();
  var stepCPatched = false;

  var inPostEditC = false;
  var linesInBlockC = 0;
  var BLOCK_SCOPE_C = 60;

  for (var ci = 0; ci < ll2.length; ci++) {
    if (ll2[ci].indexOf(".command('post-edit')") !== -1) {
      inPostEditC = true;
      linesInBlockC = 0;
      continue;
    }

    if (inPostEditC) {
      linesInBlockC++;
      if (linesInBlockC > BLOCK_SCOPE_C) {
        inPostEditC = false;
        continue;
      }

      if (/remember(?:Async)?\('edit',/.test(ll2[ci])) {
        if (ll2[ci].indexOf('basename') !== -1) {
          skipped.push('FIX-006-stepC (already contains basename)');
          inPostEditC = false;
          continue;
        }

        var oldFragment = 'edit of ${ext} in ${crate}';
        var newFragment = 'edit of ${require("path").basename(file)} (${ext} in ${crate})';

        if (ll2[ci].indexOf(oldFragment) !== -1) {
          ll2[ci] = ll2[ci].replace(oldFragment, newFragment);
          stepCPatched = true;
        } else if (/edit of \$\{ext\}\s+in\s+\$\{crate\}/.test(ll2[ci])) {
          ll2[ci] = ll2[ci].replace(
            /edit of \$\{ext\}\s+in\s+\$\{crate\}/,
            newFragment
          );
          stepCPatched = true;
        }

        inPostEditC = false;
      }
    }
  }

  flushLines();

  if (stepCPatched) {
    applied.push('FIX-006-stepC (RC-C basename enrichment in post-edit)');
  } else {
    if (src.indexOf("remember('edit',") !== -1 || src.indexOf("rememberAsync('edit',") !== -1) {
      if (src.indexOf('basename') !== -1 && /remember(?:Async)?\('edit',[^)]*basename/.test(src)) {
        skipped.push('FIX-006-stepC (already contains basename)');
      } else {
        skipped.push('FIX-006-stepC (remember edit line found but template not matched)');
      }
    } else {
      skipped.push('FIX-006-stepC (remember edit call not found)');
    }
  }
})();

// ============================================================================
// 3. FIX-008: Persist lastEditedFile in kv_store across hook invocations
// ============================================================================
(function applyFix008() {
  if (src.indexOf('FIX-008') !== -1 || src.indexOf('__fix008_prevFile') !== -1) {
    skipped.push('FIX-008 (already present)');
    return;
  }

  var ll = getLines();
  var postEditActionLine = -1;
  var inPostEdit = false;

  for (var i = 0; i < ll.length; i++) {
    if (ll[i].indexOf(".command('post-edit')") !== -1) {
      if (/\.action\(/.test(ll[i])) {
        postEditActionLine = i;
        break;
      }
      inPostEdit = true;
      continue;
    }
    if (inPostEdit && /\.action\(/.test(ll[i])) {
      postEditActionLine = i;
      break;
    }
    if (inPostEdit && i > 50 && postEditActionLine === -1) {
      inPostEdit = false;
    }
  }

  if (postEditActionLine === -1) {
    skipped.push('FIX-008 (post-edit action not found)');
    flushLines();
    return;
  }

  var intelCtorLine = -1;
  for (var j = postEditActionLine; j < Math.min(postEditActionLine + 10, ll.length); j++) {
    if (/new Intelligence\(/.test(ll[j])) {
      intelCtorLine = j;
      break;
    }
  }

  if (intelCtorLine === -1) {
    skipped.push('FIX-008 (new Intelligence() not found near post-edit)');
    flushLines();
    return;
  }

  var loadBlock = [
    '  // FIX-008: Load lastEditedFile from kv_store (persists across hook invocations)',
    '  try {',
    '    var kvPath = require("path").join(process.cwd(), ".ruvector", "kv.json");',
    '    if (require("fs").existsSync(kvPath)) {',
    '      var kv = JSON.parse(require("fs").readFileSync(kvPath, "utf-8"));',
    '      if (kv.lastEditedFile) intel.lastEditedFile = kv.lastEditedFile;',
    '    }',
    '    // v0.9.6: Now uses public storage getter',
    '    if (intel.storage && intel.storage.getKV) {',
    '      var stored = intel.storage.getKV("lastEditedFile");',
    '      if (stored) intel.lastEditedFile = stored;',
    '    }',
    '  } catch(e) { /* ignore load errors */ }'
  ];

  var spliceArgs = [intelCtorLine + 1, 0].concat(loadBlock);
  Array.prototype.splice.apply(ll, spliceArgs);

  var searchStart = intelCtorLine + loadBlock.length + 1;
  var saveInsertLine = -1;

  for (var k = searchStart; k < Math.min(searchStart + 60, ll.length); k++) {
    if (ll[k].indexOf('intel.save()') !== -1) {
      saveInsertLine = k;
      break;
    }
    if (/^\s*\.\s*command\(/.test(ll[k]) || /^hooksCmd\.command\(/.test(ll[k])) {
      saveInsertLine = k - 1;
      break;
    }
  }

  if (saveInsertLine === -1) {
    saveInsertLine = intelCtorLine + loadBlock.length + 45;
    if (saveInsertLine >= ll.length) saveInsertLine = ll.length - 1;
  }

  var saveBlock = [
    '  // FIX-008: Save lastEditedFile to kv_store before intel.save()',
    '  try {',
    '    intel.lastEditedFile = file;',
    '    var kvDir = require("path").join(process.cwd(), ".ruvector");',
    '    var kvPath008 = require("path").join(kvDir, "kv.json");',
    '    var kv008 = {};',
    '    try { kv008 = JSON.parse(require("fs").readFileSync(kvPath008, "utf-8")); } catch(e) {}',
    '    kv008.lastEditedFile = file;',
    '    if (!require("fs").existsSync(kvDir)) require("fs").mkdirSync(kvDir, { recursive: true });',
    '    require("fs").writeFileSync(kvPath008, JSON.stringify(kv008, null, 2));',
    '    // v0.9.6: Uses public storage getter',
    '    if (intel.storage && intel.storage.setKV) intel.storage.setKV("lastEditedFile", file);',
    '    var lastFile008 = intel.getLastEditedFile ? intel.getLastEditedFile() : null;',
    '    if (lastFile008 && lastFile008 !== file && intel.storage && intel.storage.recordFileSequence) {',
    '      intel.storage.recordFileSequence(lastFile008, file);',
    '    }',
    '  } catch(e) { /* ignore save errors */ }'
  ];

  var spliceArgs2 = [saveInsertLine, 0].concat(saveBlock);
  Array.prototype.splice.apply(ll, spliceArgs2);

  flushLines();
  applied.push('FIX-008');
})();

// ============================================================================
// 3b. FIX-SONA-INIT: Force engine initialization in hook handlers
// (v0.9.6 - ensures SONA is warm before learning)
// ============================================================================
(function applySonaInit() {
  if (src.indexOf('FIX-SONA-INIT') !== -1) {
    skipped.push('FIX-SONA-INIT (already present)');
    return;
  }

  var ll = getLines();
  var patchCount = 0;

  // Find post-edit handler and inject engine init after Intelligence constructor
  var inPostEdit = false;
  var foundIntelCtor = false;

  for (var i = 0; i < ll.length; i++) {
    if (ll[i].indexOf(".command('post-edit')") !== -1) {
      inPostEdit = true;
      foundIntelCtor = false;
      continue;
    }

    if (inPostEdit && /new Intelligence\(/.test(ll[i]) && !foundIntelCtor) {
      foundIntelCtor = true;
      // Insert SONA init after next few lines (after intel constructor completes)
      for (var j = i + 1; j < Math.min(i + 10, ll.length); j++) {
        if (ll[j].indexOf('intel.load()') !== -1 || ll[j].indexOf('FIX-008') !== -1) {
          // Insert after load or after FIX-008 block
          var insertIdx = j + 1;
          // Skip past any existing FIX-008 block
          while (insertIdx < ll.length && (ll[insertIdx].trim().startsWith('//') || ll[insertIdx].trim().startsWith('try') || ll[insertIdx].indexOf('FIX-008') !== -1)) {
            if (ll[insertIdx].indexOf('} catch') !== -1) {
              insertIdx++;
              break;
            }
            insertIdx++;
          }

          var sonaInitBlock = [
            '  // FIX-SONA-INIT (v0.9.6): Force engine initialization for SONA learning',
            '  try {',
            '    var _sonaEngine = await intel.getEngine();',
            '    if (_sonaEngine && _sonaEngine.sona) {',
            '      // Engine initialized, SONA is now warm',
            '    }',
            '  } catch (_sonaInitErr) { /* SONA init optional */ }'
          ];

          var spliceArgs = [insertIdx, 0].concat(sonaInitBlock);
          Array.prototype.splice.apply(ll, spliceArgs);
          patchCount++;
          inPostEdit = false;
          break;
        }
      }
    }

    // Exit post-edit block after some lines
    if (inPostEdit && i > 100) inPostEdit = false;
  }

  // Same for post-command
  var inPostCmd = false;
  foundIntelCtor = false;

  for (var k = 0; k < ll.length; k++) {
    if (ll[k].indexOf(".command('post-command')") !== -1) {
      inPostCmd = true;
      foundIntelCtor = false;
      continue;
    }

    if (inPostCmd && /new Intelligence\(/.test(ll[k]) && !foundIntelCtor) {
      foundIntelCtor = true;
      for (var m = k + 1; m < Math.min(k + 10, ll.length); m++) {
        if (ll[m].indexOf('intel.load()') !== -1) {
          var insertIdx2 = m + 1;

          var sonaInitBlock2 = [
            '  // FIX-SONA-INIT (v0.9.6): Force engine initialization for SONA learning',
            '  try {',
            '    var _sonaEngine2 = await intel.getEngine();',
            '    if (_sonaEngine2 && _sonaEngine2.sona) {',
            '      // Engine initialized, SONA is now warm',
            '    }',
            '  } catch (_sonaInitErr2) { /* SONA init optional */ }'
          ];

          var spliceArgs2 = [insertIdx2, 0].concat(sonaInitBlock2);
          Array.prototype.splice.apply(ll, spliceArgs2);
          patchCount++;
          inPostCmd = false;
          break;
        }
      }
    }

    if (inPostCmd && k > 200) inPostCmd = false;
  }

  flushLines();

  if (patchCount > 0) {
    applied.push('FIX-SONA-INIT (' + patchCount + '/2 handlers patched)');
  } else {
    skipped.push('FIX-SONA-INIT (could not locate insertion points)');
  }
})();

// ============================================================================
// 3c. FIX-EMBED-MIGRATION: Embedding column migration for neural_patterns
// (NEW in v0.9.7 - handles schema updates for neural_patterns table)
// ============================================================================
(function applyEmbedMigration() {
  if (src.indexOf('FIX-EMBED-MIGRATION') !== -1) {
    skipped.push('FIX-EMBED-MIGRATION (already present)');
    return;
  }

  // Find the storage factory function and add migration logic
  var factoryEnd = src.indexOf('// === END FIX-005 factory ===');
  if (factoryEnd === -1) {
    skipped.push('FIX-EMBED-MIGRATION (storage factory not found)');
    return;
  }

  var migrationBlock = [
    '',
    '// FIX-EMBED-MIGRATION (v0.9.7): Ensure embedding column exists in neural_patterns',
    'function __migrateEmbeddingColumn(storage) {',
    '  if (!storage || !storage.db) return;',
    '  try {',
    '    var db = storage.db;',
    '    // Check if neural_patterns table exists',
    '    var tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type=\'table\' AND name=\'neural_patterns\'").get();',
    '    if (!tableCheck) return;',
    '    // Check if embedding column exists',
    '    var columns = db.prepare("PRAGMA table_info(neural_patterns)").all();',
    '    var hasEmbedding = columns.some(function(c) { return c.name === "embedding"; });',
    '    if (!hasEmbedding) {',
    '      db.exec("ALTER TABLE neural_patterns ADD COLUMN embedding BLOB");',
    '      if (process.env.RUVECTOR_VERBOSE === \'true\') {',
    '        console.log("  [DEBUG] FIX-EMBED-MIGRATION: Added embedding column to neural_patterns");',
    '      }',
    '    }',
    '  } catch (e) {',
    '    if (process.env.RUVECTOR_VERBOSE === \'true\') {',
    '      console.log("  [DEBUG] FIX-EMBED-MIGRATION: Migration skipped -", e.message);',
    '    }',
    '  }',
    '}',
    ''
  ].join('\n');

  src = src.substring(0, factoryEnd) + migrationBlock + src.substring(factoryEnd);

  // Now inject call to migration after storage is created in load()
  var storageLoadPoint = src.indexOf('this._storage = storage;');
  if (storageLoadPoint !== -1) {
    var afterStorageAssign = storageLoadPoint + 'this._storage = storage;'.length;
    var migrationCall = '\n      __migrateEmbeddingColumn(storage); // FIX-EMBED-MIGRATION';
    src = src.substring(0, afterStorageAssign) + migrationCall + src.substring(afterStorageAssign);
    applied.push('FIX-EMBED-MIGRATION');
  } else {
    skipped.push('FIX-EMBED-MIGRATION (storage assignment not found)');
  }
})();

// ============================================================================
// 4. SONA Integration (FIX-013 flush/warmup + FIX-015 tick/forceLearn)
// ============================================================================
(function applySONAIntegration() {
  if (src.indexOf('FIX-013') !== -1 && src.indexOf('FIX-015') !== -1) {
    skipped.push('SONA (already present)');
    return;
  }

  var patchCount = 0;

  // -- Part A: Flush SONA before eng.export() in save() ----------------------
  var SAVE_ENGINE_EXPORT = 'const engineData = eng.export();';
  if (src.indexOf(SAVE_ENGINE_EXPORT) !== -1) {
    if (src.indexOf('FIX-013 Part A') !== -1) {
      skipped.push('SONA-partA (already present)');
    } else {
      var replacementA = [
        '// FIX-013 Part A: Flush SONA learning before export',
        '        try {',
        '          if (eng.sona) {',
        '            eng.sona.flush();',
        '            eng.sona.tick();',
        '            eng.sona.forceLearn();',
        '          } else if (eng.flush) {',
        '            eng.flush && eng.flush();',
        '            eng.tick && eng.tick();',
        '            eng.forceLearn && eng.forceLearn();',
        '          }',
        '        } catch (_sonaFlushErr) { /* SONA flush optional */ }',
        '        const engineData = eng.export();',
        '        // FIX-013: Store SONA stats in kv for diagnostics',
        '        try {',
        '          var _sonaStats = eng.sona ? eng.sona.getStats() : (eng.getStats ? eng.getStats() : null);',
        '          if (_sonaStats) {',
        '            var _st013 = this._storage || (typeof __getStorageInstance === "function" ? __getStorageInstance() : null);',
        '            if (_st013 && _st013.setKV) _st013.setKV("sona_stats", JSON.stringify(_sonaStats));',
        '          }',
        '        } catch (_sonaStatsErr) { /* optional */ }'
      ].join('\n');

      src = src.replace(SAVE_ENGINE_EXPORT, replacementA);
      patchCount++;
    }
  } else {
    skipped.push('SONA-partA (eng.export anchor not found)');
  }

  // -- Part B: Replay trajectories into SONA after import --------------------
  var ENGINE_IMPORT = 'this._engine.import(this.convertLegacyData(this.data), true);';
  if (src.indexOf(ENGINE_IMPORT) !== -1) {
    if (src.indexOf('FIX-013 Part B') !== -1) {
      skipped.push('SONA-partB (already present)');
    } else {
      var warmup = [
        'this._engine.import(this.convertLegacyData(this.data), true);',
        '          // FIX-013 Part B: Warm up SONA by replaying recent trajectories',
        '          try {',
        '            if (this._engine.sona && this.data.trajectories && this.data.trajectories.length > 0) {',
        '              var recentTrajs = this.data.trajectories.slice(-50);',
        '              for (var _rt = 0; _rt < recentTrajs.length; _rt++) {',
        '                var traj = recentTrajs[_rt];',
        '                var reward = typeof traj.reward === "number" ? traj.reward : 0.5;',
        '                var stateStr = traj.state || traj.action || "";',
        '                var synthEmbed = new Array((this._engine.config && this._engine.config.embeddingDim) || 384).fill(0);',
        '                for (var _si = 0; _si < stateStr.length; _si++) {',
        '                  synthEmbed[_si % synthEmbed.length] += stateStr.charCodeAt(_si) / 128 - 0.5;',
        '                }',
        '                try {',
        '                  var tid = this._engine.sona.beginTrajectory(synthEmbed);',
        '                  this._engine.sona.addTrajectoryStep(tid, synthEmbed, synthEmbed, reward);',
        '                  this._engine.sona.endTrajectory(tid, reward);',
        '                } catch (_replayErr) { break; }',
        '              }',
        '              try { this._engine.sona.tick(); } catch (_tickErr) {}',
        '            }',
        '          } catch (_warmupErr) { /* SONA warm-up optional */ }'
      ].join('\n');

      src = src.replace(ENGINE_IMPORT, warmup);
      patchCount++;
    }
  } else {
    skipped.push('SONA-partB (engine import anchor not found)');
  }

  // -- Tick snippet for Parts C/D/E ------------------------------------------
  var TICK_SNIPPET = [
    '',
    '  // FIX-015: Tick SONA engine to process buffered trajectories',
    '  try {',
    '    var _eng015 = intel.getEngineIfReady ? intel.getEngineIfReady() : null;',
    '    if (_eng015) {',
    '      if (_eng015.sona && _eng015.sona.tick) _eng015.sona.tick();',
    '      else if (_eng015.tick) _eng015.tick();',
    '    }',
    '  } catch (_tickErr) { /* tick is optional */ }'
  ].join('\n');

  // Parts C, D, E - Insert tick before intel.save() in various handlers
  var postEditIdx = src.indexOf("'post-edit'");
  if (postEditIdx > -1) {
    var actionBlockC = src.substring(postEditIdx, postEditIdx + 3000);
    var saveIdxC = actionBlockC.lastIndexOf('intel.save()');
    if (saveIdxC > -1) {
      var absIdxC = postEditIdx + saveIdxC;
      if (src.substring(absIdxC - 300, absIdxC).indexOf('FIX-015') === -1) {
        src = src.substring(0, absIdxC) + TICK_SNIPPET + '\n  ' + src.substring(absIdxC);
        patchCount++;
      }
    }
  }

  var postCmdLearnPattern = /intel\.learn\(`cmd_\$\{classification\.category\}/;
  var postCmdLearnMatch = src.match(postCmdLearnPattern);
  if (postCmdLearnMatch) {
    var matchIdx = src.indexOf(postCmdLearnMatch[0]);
    var afterLearn = src.substring(matchIdx, matchIdx + 600);
    var saveInCmd = afterLearn.indexOf('intel.save()');
    if (saveInCmd > -1) {
      var absIdxD = matchIdx + saveInCmd;
      if (src.substring(absIdxD - 200, absIdxD).indexOf('FIX-015') === -1) {
        src = src.substring(0, absIdxD) + TICK_SNIPPET + '\n  ' + src.substring(absIdxD);
        patchCount++;
      }
    }
  }

  var FORCELEARN_SNIPPET = [
    '',
    '  // FIX-015: Force full SONA learning cycle on session end',
    '  try {',
    '    var _eng015end = intel.getEngineIfReady ? intel.getEngineIfReady() : null;',
    '    if (_eng015end) {',
    '      if (_eng015end.sona && _eng015end.sona.forceLearn) _eng015end.sona.forceLearn();',
    '      else if (_eng015end.forceLearn) _eng015end.forceLearn();',
    '      if (_eng015end.sona && _eng015end.sona.flush) _eng015end.sona.flush();',
    '      else if (_eng015end.flush) _eng015end.flush();',
    '    }',
    '  } catch (_learnErr) { /* forceLearn is optional */ }'
  ].join('\n');

  var sessionEndIdx = src.indexOf("'session-end'");
  if (sessionEndIdx > -1) {
    var sessionBlock = src.substring(sessionEndIdx, sessionEndIdx + 2000);
    var saveInSession = sessionBlock.indexOf('intel.save()');
    if (saveInSession > -1) {
      var absIdxE = sessionEndIdx + saveInSession;
      if (src.substring(absIdxE - 300, absIdxE).indexOf('FIX-015') === -1) {
        src = src.substring(0, absIdxE) + FORCELEARN_SNIPPET + '\n  ' + src.substring(absIdxE);
        patchCount++;
      }
    }
  }

  if (patchCount > 0) {
    applied.push('SONA (' + patchCount + '/5 parts: flush+warmup+tick+forceLearn)');
  } else {
    skipped.push('SONA (no anchors matched)');
  }
})();

// ============================================================================
// 5. FIX-023: Reward Differentiation (REWRITTEN for v0.9.6)
// The v0.9.5 regex was broken - it looked for `, 1.0)` but actual code has
// `success ? 1.0 : -0.5)` (ternary expression). Now uses string matching.
// ============================================================================
(function applyFix023() {
  if (src.indexOf('FIX-023') !== -1) {
    skipped.push('FIX-023 (already present)');
    return;
  }

  var patchCount = 0;
  var ll = getLines();

  // -- Part A: Post-edit reward differentiation ------------------------------
  // v0.9.6: Use string matching for ternary pattern instead of broken regex
  var inPostEditBlock = false;
  var postEditBlockLines = 0;
  var POST_EDIT_SCOPE = 80;

  for (var i = 0; i < ll.length; i++) {
    if (ll[i].indexOf(".command('post-edit')") !== -1) {
      inPostEditBlock = true;
      postEditBlockLines = 0;
      continue;
    }

    if (inPostEditBlock) {
      postEditBlockLines++;
      if (postEditBlockLines > POST_EDIT_SCOPE) {
        inPostEditBlock = false;
        continue;
      }

      // v0.9.6: Match the ACTUAL pattern in ruvector: success ? 1.0 : -0.5
      if (ll[i].indexOf('intel.learn(') !== -1 && ll[i].indexOf('success ?') !== -1) {
        // Check for the edit reward pattern (1.0 for success)
        if (ll[i].indexOf('success ? 1.0 :') !== -1 || ll[i].indexOf('success ? 1 :') !== -1) {
          var indent = ll[i].match(/^(\s*)/)[1];
          var rewardBlock = [
            indent + '// FIX-023 (v0.9.6): Complexity-weighted edit reward (replaces flat 1.0)',
            indent + 'var _editReward023 = (function() {',
            indent + '  var reward = 0.7; // base reward for any successful edit',
            indent + '  try {',
            indent + '    var kvPath023 = require("path").join(process.cwd(), ".ruvector", "kv.json");',
            indent + '    var kv023 = {};',
            indent + '    try { kv023 = JSON.parse(require("fs").readFileSync(kvPath023, "utf-8")); } catch(e) {}',
            indent + '    var lastTs = parseInt(kv023.lastEditTimestamp) || 0;',
            indent + '    var now023 = Date.now();',
            indent + '    var elapsed = now023 - lastTs;',
            indent + '    if (elapsed < 30000 && kv023.lastEditedFile === file) {',
            indent + '      reward = 0.4; // retry on same file = lower reward',
            indent + '    } else if (elapsed < 5000) {',
            indent + '      reward = 0.5; // rapid successive edit',
            indent + '    } else {',
            indent + '      reward = 0.9; // deliberate edit with time gap',
            indent + '    }',
            indent + '    var ext023 = require("path").extname(file || "").toLowerCase();',
            indent + '    if ([".ts",".tsx",".rs",".go",".java"].indexOf(ext023) !== -1) reward = Math.min(reward + 0.1, 1.0);',
            indent + '    kv023.lastEditTimestamp = String(now023);',
            indent + '    require("fs").writeFileSync(kvPath023, JSON.stringify(kv023, null, 2));',
            indent + '  } catch(e) { /* use base reward on error */ }',
            indent + '  return reward;',
            indent + '})();'
          ].join('\n');

          // Replace the ternary reward with our computed value
          ll[i] = rewardBlock + '\n' + ll[i]
            .replace(/success\s*\?\s*1(\.0)?\s*:\s*-?[\d.]+/, 'success ? _editReward023 : -0.5');
          patchCount++;
          inPostEditBlock = false;
        }
      }
    }
  }

  // -- Part B: Post-command reward differentiation ---------------------------
  var inPostCmdBlock = false;
  var postCmdBlockLines = 0;
  var POST_CMD_SCOPE = 80;

  for (var j = 0; j < ll.length; j++) {
    if (ll[j].indexOf(".command('post-command')") !== -1) {
      inPostCmdBlock = true;
      postCmdBlockLines = 0;
      continue;
    }

    if (inPostCmdBlock) {
      postCmdBlockLines++;
      if (postCmdBlockLines > POST_CMD_SCOPE) {
        inPostCmdBlock = false;
        continue;
      }

      // v0.9.6: Match the ACTUAL pattern: success ? 0.8 : -0.3
      if (ll[j].indexOf('intel.learn(') !== -1 && ll[j].indexOf('success ?') !== -1) {
        if (ll[j].indexOf('success ? 0.8 :') !== -1 || ll[j].indexOf('success ? 0.8:') !== -1) {
          var indent2 = ll[j].match(/^(\s*)/)[1];
          var cmdRewardBlock = [
            indent2 + '// FIX-023 (v0.9.6): Command-complexity weighted reward (replaces flat 0.8)',
            indent2 + 'var _cmdReward023 = (function() {',
            indent2 + '  try {',
            indent2 + '    var cmd023 = command || "";',
            indent2 + '    if (/^\\s*(ls|cd|pwd|echo|cat|head|tail|wc|date|whoami)\\b/.test(cmd023)) return 0.3;',
            indent2 + '    if (/^\\s*(git|npm|npx|node|python|cargo|make)\\b/.test(cmd023)) return 0.6;',
            indent2 + '    if (/\\|/.test(cmd023)) return 0.85;',
            indent2 + '    if (/&&/.test(cmd023)) return 0.8;',
            indent2 + '    if (/\\$\\(/.test(cmd023)) return 0.9;',
            indent2 + '    return 0.6;',
            indent2 + '  } catch(e) { return 0.6; }',
            indent2 + '})();'
          ].join('\n');

          ll[j] = cmdRewardBlock + '\n' + ll[j]
            .replace(/success\s*\?\s*0\.8\s*:\s*-?[\d.]+/, 'success ? _cmdReward023 : -0.3');
          patchCount++;
          inPostCmdBlock = false;
        }
      }
    }
  }

  flushLines();

  if (patchCount > 0) {
    applied.push('FIX-023 (' + patchCount + '/2 parts: edit+command reward differentiation)');
  } else {
    // v0.9.7: Wrap debug output in verbose check
    var hasEditLearn = src.indexOf("intel.learn(") !== -1 && src.indexOf("'post-edit'") !== -1;
    var hasCmdLearn = src.indexOf("intel.learn(") !== -1 && src.indexOf("'post-command'") !== -1;
    if (hasEditLearn || hasCmdLearn) {
      if (process.env.RUVECTOR_VERBOSE === 'true') {
        console.log('  [DEBUG] FIX-023: intel.learn found but ternary pattern not matched');
        console.log('  [DEBUG] FIX-023: Searching for: "success ? 1.0 :" or "success ? 0.8 :"');
        // Try to find what's actually there
        var learnLines = src.split('\n').filter(function(l) { return l.indexOf('intel.learn(') !== -1; });
        if (learnLines.length > 0) {
          console.log('  [DEBUG] FIX-023: Found intel.learn lines:');
          learnLines.slice(0, 3).forEach(function(l) {
            console.log('    ' + l.trim().substring(0, 100));
          });
        }
      }
    }
    skipped.push('FIX-023 (ternary reward patterns not matched - check upstream changes)');
  }
})();

// ============================================================================
// Write patched file with master marker
// ============================================================================
if (applied.length === 0) {
  console.log('PATCH-CLI v0.9.7: No patches applied (all skipped or patterns not found).');
  if (skipped.length > 0) {
    console.log('  Skipped: ' + skipped.join(', '));
  }
  process.exit(1);
}

// Insert master idempotency marker near the top
var markerComment = '// __PATCH_CLI_V097__ -- Consolidated patches applied by patch-cli.js v0.9.7\n';
var firstNewline = src.indexOf('\n');
if (firstNewline > -1) {
  src = src.substring(0, firstNewline + 1) + markerComment + src.substring(firstNewline + 1);
} else {
  src = markerComment + src;
}

fs.writeFileSync(CLI_PATH, src);

console.log('PATCH-CLI v0.9.7: Successfully patched ' + CLI_PATH);
console.log('');
console.log('  Applied (' + applied.length + '):');
for (var a = 0; a < applied.length; a++) {
  console.log('    [OK] ' + applied[a]);
}
if (skipped.length > 0) {
  console.log('');
  console.log('  Skipped (' + skipped.length + '):');
  for (var s = 0; s < skipped.length; s++) {
    console.log('    [--] ' + skipped[s]);
  }
}
console.log('');
console.log('  v0.9.7 NEW: FIX-EMBED-MIGRATION (embedding column), verbose debug output control');
console.log('  Verify: grep "__PATCH_CLI_V097__" node_modules/ruvector/bin/cli.js');
console.log('  Revert: npm install ruvector@latest');
