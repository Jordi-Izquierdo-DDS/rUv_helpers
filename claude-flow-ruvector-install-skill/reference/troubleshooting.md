# Troubleshooting Reference

> **Version:** v0.9.8 | **Updated:** 2026-02-04 | **Ecosystem:** claude-flow v3.0.0-alpha.190 + ruvector 0.1.96

## Contents
- Quick Diagnostics
- Diagnostic Methodology
- Error Scenarios (42: #1-#28 original + #29-#34 data integrity + #35-#38 advanced learning + #39-#42 v0.9.8 install)
- Root Cause Patterns (A-H)
- Platform-Specific Issues
- Browser/WASM Issues
- When to Use FOX Method

---

## Quick Diagnostics

Run in order to narrow the problem:

```bash
npx ruvector doctor --verbose                  # 1. System health
npx @claude-flow/cli@latest doctor --fix       # 2. claude-flow health
npx ruvector hooks doctor --fix                # 3. Hooks config
npx ruvector hooks verify --verbose            # 4. Hooks runtime (shallow!)
npx ruvector hooks stats                       # 5. Intelligence state
npx @claude-flow/cli@latest memory stats       # 6. Memory state
npx @claude-flow/cli@latest daemon status      # 7. Daemon
bash scripts/validate-setup.sh                 # 8. Deep validation
```

---

## Diagnostic Methodology

When something isn't working, DON'T jump to the Error Scenarios list.
Instead, follow this investigation protocol to discover the root cause yourself.

### Step 1: Identify the symptom precisely
- What EXACTLY fails? (error message, wrong output, missing data)
- When does it fail? (init, runtime, after reboot)
- What is the EXPECTED behavior vs ACTUAL behavior?

### Step 2: Trace the data flow

For memory/embedding issues:
1. Check the database: what's actually stored?
   SQLite: `node -e 'var D=require("better-sqlite3");var db=new D(".ruvector/intelligence.db",{readonly:true});var rows=db.prepare("SELECT id,memory_type,length(embedding) as bytes FROM memories LIMIT 10").all();console.log(JSON.stringify(rows,null,2));db.close()'`
   JSON: `node -e 'var d=JSON.parse(require("fs").readFileSync(".ruvector/intelligence.json"));(d.memories||[]).slice(0,5).forEach(function(m){console.log({type:m.type,embLen:m.embedding?m.embedding.length:null})})'`
2. Check embedding dimensions: are they consistent?
   SQLite: `SELECT length(embedding), COUNT(*) FROM memories GROUP BY length(embedding)`
   JSON: `node -e 'var d=JSON.parse(require("fs").readFileSync(".ruvector/intelligence.json"));var dims={};(d.memories||[]).forEach(function(m){var k=m.embedding?m.embedding.length:"null";dims[k]=(dims[k]||0)+1});console.log(dims)'`
3. Trace which code path WROTE the data:
   - 1536 bytes = 384d ONNX (async path, correct for MiniLM)
   - 3072 bytes = 768d ONNX (async path, correct for mpnet)
   - 1024 bytes = 256d attention (engine sync path)
   - 256 bytes = 64d hash (fallback, broken)
   - NULL = never embedded (pretrain bug)

For hook issues:
1. Run the hook WITHOUT error suppression:
   `npx ruvector hooks post-edit test.js --success` (no `2>/dev/null || true`)
2. Time the hook: `time npx ruvector hooks post-edit test.js --success`
3. Check if the hook timeout allows completion:
   `node -e 'var s=JSON.parse(require("fs").readFileSync(".claude/settings.json"));var h=s.hooks||{};Object.keys(h).forEach(function(e){(h[e]||[]).forEach(function(entry){var hooks=entry.hooks||[entry];hooks.forEach(function(hk){if(hk.timeout)console.log(e,hk.command&&hk.command.substring(0,60),hk.timeout+"ms")})})})'`

### Step 3: 5-Why analysis
Ask WHY 5 times, tracing through actual source code each time:
1. Why does this fail? -> Which function produces the wrong result?
2. Why does that function do this? -> What does it call? Read the source.
3. Why does THAT work this way? -> What constraint or assumption drives it?
4. Why is that assumption wrong? -> What changed or was misconfigured?
5. Why wasn't it configured correctly? -> What step was missed or what default is wrong?

### Step 4: Verify the root cause
Before fixing, PROVE the root cause by:
- Changing ONE variable that the root cause predicts should fix the issue
- If the prediction is correct, you found the root cause
- If not, go back to Step 3

### Step 5: Fix at the right level
- Fix the ROOT CAUSE, not the symptom
- If the root cause is in upstream code (node_modules): use FOX method
- If the root cause is in configuration: fix in post-init-fix.sh
- If the root cause is in process/ordering: fix in the init sequence docs
- RE-EMBED or RE-PROCESS existing data after fixing the pipeline
- NEVER delete data to "fix" an issue -- fix the pipeline and reprocess

### Key diagnostic commands

| What to check | Command |
|---------------|---------|
| Memory store contents | See Step 2 examples above |
| Embedding dimensions | SQLite: `SELECT length(embedding), COUNT(*) FROM memories GROUP BY length(embedding)` |
| Hook configuration | `node -e 'var s=JSON.parse(require("fs").readFileSync(".claude/settings.json"));console.log(JSON.stringify(s.hooks,null,2))'` |
| Hook timeout values | Same as above, look for `timeout` fields |
| cli.js code path | `grep -n "intel.remember" node_modules/ruvector/bin/cli.js` |
| Engine initialization | `grep -n "getEngineIfReady\|getEngine()" node_modules/ruvector/bin/cli.js` |
| ONNX availability | `node -e 'try{require("ruvector/dist/core/onnx-embedder");console.log("OK")}catch(e){console.log("MISSING")}'` |
| Silent failures | Run any hook without `2>/dev/null \|\| true` |
| Visualize memory graph | `cd ruvector-viz && npm run dev` (NOT `node server.js`) |

---

## Error Scenarios

### 1. Pretrain memories have NULL embeddings

**Symptom:** `recall --semantic` returns empty despite memories existing.
**Cause:** Pretrain ran before post-init-fix.sh added SEMANTIC_EMBEDDINGS env var.
**Detect:**
```bash
node -e 'var d=JSON.parse(require("fs").readFileSync(".ruvector/intelligence.json"));var n=d.memories.filter(function(m){return m.embedding===null}).length;console.log("NULL embeddings:",n)'
```
**Fix:**
```bash
bash scripts/post-init-fix.sh
cp .ruvector/intelligence.json .ruvector/intelligence.json.bak
echo '{}' > .ruvector/intelligence.json
npx ruvector hooks pretrain --verbose
```

### 2. Memories have 64d hash instead of 384d ONNX embeddings

**Symptom:** Memories exist but semantic search returns nothing or poor results.
`validate-setup.sh` reports wrong embedding dimensions.

**How to investigate this yourself:**
1. Query embedding dimensions:
   SQLite: `SELECT length(embedding), COUNT(*) FROM memories GROUP BY length(embedding)`
   JSON: `node -e 'var d=JSON.parse(require("fs").readFileSync(".ruvector/intelligence.json"));var dims={};(d.memories||[]).forEach(function(m){var k=m.embedding?m.embedding.length:"null";dims[k]=(dims[k]||0)+1});console.log(dims)'`
   Expected: all entries at 384 (MiniLM) or 768 (mpnet). If you see 64: sync path was used.
2. Find which code writes memories:
   `grep -n "intel.remember\|intel.rememberAsync" node_modules/ruvector/bin/cli.js`
3. Trace the sync `remember()` method to `embed()` to `getEngineIfReady()`:
   - `embed()` (cli.js ~line 2831) calls `getEngineIfReady()` -- returns null if not init'd
   - Even IF ready, engine's sync `embed()` (intelligence-engine.js ~line 190) returns `hashEmbed()` -- comment: "Fallback for sync context"
4. Confirm ONNX can't work synchronously:
   `grep -A5 "embedAsync" node_modules/ruvector/dist/core/intelligence-engine.js`
   -> `onnxEmbedder.embed()` returns a Promise. No sync wrapper exists.

**Root cause chain (5-Why):**
1. `post-edit` (cli.js ~line 4034) and `post-command` (cli.js ~line 4059) call `intel.remember()` (sync)
2. Sync `remember()` calls `embed()` which uses `getEngineIfReady()` -> 64d hash fallback
3. Engine's sync `embed()` CANNOT use ONNX (inherently async: model load + inference)
4. `rememberAsync()` (async, ONNX-capable) is only used with `--semantic` flag
5. `hooks init` treats `--semantic` as opt-in; `post-edit`/`post-command` bypass it entirely

**Two code paths:**
- ASYNC (correct): `hooks remember --semantic` -> `rememberAsync()` -> ONNX 384d
- SYNC (broken): `post-edit`/`post-command` -> `remember()` -> `embed()` -> 64d hash

**Detect:**
SQLite: `SELECT COUNT(*) FROM memories WHERE length(embedding) != 1536;`
JSON: `node -e 'var d=JSON.parse(require("fs").readFileSync(".ruvector/intelligence.json"));var bad=(d.memories||[]).filter(function(m){return !m.embedding||m.embedding.length!==384});console.log("Wrong-dim memories:",bad.length)'`

**Resolution:** Apply FIX-006 (`fixes/ruvector/fix-006-async-remember.js`) to route
post-edit/post-command through `rememberAsync()`. Then run FIX 8 (re-embed) via
`post-init-fix.sh` to fix existing memories in place.

### 3. settings.json overwritten / MCP missing

**Symptom:** One package's hooks or MCP config disappeared.
**Cause:** `hooks init --force` or running claude-flow init after ruvector init.
**Fix:**
```bash
cp .claude/settings.json .claude/settings.json.bak
npx @claude-flow/cli@latest init --full --start-all --with-embeddings
npx ruvector hooks init --fast --build-agents quality
bash scripts/post-init-fix.sh
claude mcp add claude-flow -- npx -y @claude-flow/cli@latest
claude mcp add ruvector -- npx -y ruvector mcp start
```

### 4. mcpServers empty after hooks init

**Symptom:** MCP tool calls fail. settings.json shows `"mcpServers": {}`.
**Cause:** hooks init says "MCP configured" but only sets `enabledMcpjsonServers`, NOT mcpServers.
**Fix:**
```bash
claude mcp add claude-flow -- npx -y @claude-flow/cli@latest
claude mcp add ruvector -- npx -y ruvector mcp start
```

### 5. ONNX model download on first --semantic use

**Symptom:** First `remember --semantic` or `recall --semantic` takes 10+ seconds, shows "Downloading".
**Cause:** ONNX model (23MB) not pre-downloaded during init.
**Fix:** Already handled by updated post-init-fix.sh. Or manually:
```bash
npx ruvector hooks remember "warmup" -t init --semantic --silent
```

### 6. Native binding load failure

**Symptom:** `Error: Cannot find module '@ruvector/core'`
**Fix:**
```bash
node -e 'console.log(process.platform+"-"+process.arch)'
npm rebuild @ruvector/core @ruvector/sona @ruvector/gnn @ruvector/attention @ruvector/router
npx ruvector doctor --verbose
```
TinyDancer failure on unsupported platforms is EXPECTED (native-only, no WASM).

### 7. claude-flow daemon not starting

**Symptom:** Background workers not running, memory ops slow.
**Fix:**
```bash
npx @claude-flow/cli@latest daemon stop 2>/dev/null
npx @claude-flow/cli@latest daemon start
npx @claude-flow/cli@latest daemon status
```

### 8. Memory database corrupted

**Symptom:** SQLite errors from claude-flow memory commands.
**Fix:**
```bash
cp .swarm/memory.db .swarm/memory.db.bak
npx @claude-flow/cli@latest memory init --force --verbose
```

### 9. intelligence.json corrupted

**Symptom:** JSON parse errors from ruvector hooks.
**Fix:**
```bash
cp .ruvector/intelligence.json .ruvector/intelligence.json.bak
echo '{}' > .ruvector/intelligence.json
npx ruvector hooks pretrain --verbose
```

### 10. agentic-flow workers fail silently

**Symptom:** UserPromptSubmit workers do nothing. No errors visible.
**Cause:** `agentic-flow` not installed. All worker hooks use `|| true`.
**Detect:** `npx agentic-flow --version 2>&1`
**Fix:** Install with `npm i agentic-flow@latest` (NOT `@alpha` — the alpha tag has stale `peerDep: claude-flow@^2.7.0`). Or use native workers as alternative:
```bash
npx ruvector native list
npx ruvector native run security --path .
npx claude-flow daemon start
```

### 11. RUVECTOR_MEMORY_BACKEND=rvlite but rvlite not installed

**Symptom:** Memory operations may silently degrade.
**Detect:** `node -e 'try{require("@ruvector/rvlite");console.log("OK")}catch(e){console.log("MISSING")}'`
**Fix:** Install it (`npm install @ruvector/rvlite`) or change backend in settings.json.

### 12. Hook timeout errors

**Symptom:** Hooks timing out, especially remember/recall with --semantic.
**Cause:** Default 300ms timeout too low for ONNX operations.
**Fix:** `bash scripts/post-init-fix.sh` (sets timeout >= 5000ms).

### 13. Q-learning not influencing routing

**Symptom:** `route` always returns default agents with confidence:0.
**Cause:** Q-learning needs many experiences. Cold start is expected.
**Fix:** Seed with batch-learn:
```bash
npx ruvector hooks batch-learn -d '[{"state":"ts-file","action":"coder","reward":0.9}]' -t agent-routing
```

### 14. MCP server not responding

**Symptom:** MCP tool calls fail or timeout.
**Fix:**
```bash
claude mcp remove claude-flow 2>/dev/null
claude mcp add claude-flow -- npx -y @claude-flow/cli@latest
claude mcp remove ruvector 2>/dev/null
claude mcp add ruvector -- npx -y ruvector mcp start
```

### 15. Node.js version mismatch

**Symptom:** Unexpected errors, native binding failures.
**Fix:** claude-flow requires Node.js >= 20. Check: `node --version`

### 16. npm EACCES permission errors

**Symptom:** `EACCES: permission denied` during global install.
**Fix:**
```bash
mkdir -p ~/.npm-global && npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH
```

### 17. Pretrain fails or incomplete

**Symptom:** Pretrain exits early or phases show errors.
**Fix:**
```bash
npx ruvector hooks pretrain --verbose --skip-git --workers 2
```

### 18. ruvector-extensions SQLite "not yet implemented"

**Symptom:** SQLiteAdapter methods throw stub error.
**Cause:** Known unimplemented feature.
**Fix:** Use claude-flow SQLite (sql.js) or @ruvector/rvlite instead.

### 19. Silent hook failures (system appears to work but learns nothing)

**Symptom:** `hooks verify` passes, Q-learning returns defaults, no new memories appear
after editing files. System appears functional but the learning pipeline is dead.

**How to investigate:**
1. Run a hook WITHOUT suppression:
   `npx ruvector hooks post-edit test.js --success`
   - If it errors -> missing dependency. Which one? Check the error message.
   - If it succeeds -> check intelligence store timestamps. Are new entries being created?
2. Check intelligence store for recent entries:
   SQLite: `SELECT MAX(timestamp) FROM memories;`
   JSON: `node -e 'var d=JSON.parse(require("fs").readFileSync(".ruvector/intelligence.json"));var ts=(d.memories||[]).map(function(m){return m.timestamp||0});console.log("Latest:",new Date(Math.max.apply(null,ts)))'`
3. If timestamps are stale -> hook runs but output is discarded by `|| true`

**Root cause:** `2>/dev/null || true` on every hook command suppresses ALL errors.
A single missing dependency or timeout kills the entire pipeline silently. (Pattern B)

**Resolution:** Identify which specific hook fails by running each one manually without
suppression. Fix the underlying dependency, increase timeout if needed, verify with
manual test. See also #22 (timeout) and #10 (agentic-flow).

### 20. Post-edit/post-command produce wrong-dimension embeddings

**Symptom:** New memories created during editing have 64d (256 bytes in SQLite) instead
of 384d (1536 bytes). Existing memories from pretrain may be correct but new ones are not.

**How to investigate:**
1. Check the action handler for post-edit:
   `grep -A1 "command('post-edit')" node_modules/ruvector/bin/cli.js`
   -> `.action((file, opts) => {` -- NOT async!
2. The handler uses `await intel.rememberAsync(...)` but the enclosing function is not async
3. In CJS, `await` in a non-async function either throws SyntaxError on parse (breaking
   the entire CLI) or silently returns a pending Promise (embedding never completes)
4. Result: `rememberAsync` is called but never awaited -> embedding not stored or 64d fallback

**Root cause:** Action handlers for post-edit and post-command are not async, but use
`await`. (Pattern A)

**Resolution:** FIX-006 makes the action handlers async: `(file, opts) => {` becomes
`async (file, opts) => {`. Verify: `grep "post-edit.*action(async" node_modules/ruvector/bin/cli.js`

### 21. Mixed embedding dimensions prevent semantic search

**Symptom:** `recall --semantic` finds some memories but misses others that should match.

**How to investigate:**
1. Query distinct dimensions:
   SQLite: `SELECT length(embedding), COUNT(*) FROM memories GROUP BY length(embedding)`
   JSON: see Step 2 in Diagnostic Methodology
2. If only ONE dimension -> not this issue
3. If MULTIPLE dimensions -> cosine similarity between different dimensions returns 0, causing silent misses

**Root cause:** Different code paths produce different dimensions. (Pattern D)
- PreToolUse remember hooks with `--semantic` -> 384d ONNX (correct)
- PostToolUse post-edit/post-command -> 64d hash (broken, see #20)
- Pretrain without `--semantic` -> NULL (broken, see #1)

**Resolution:** Apply FIX-006 (fix the pipeline), then run FIX 8 via `post-init-fix.sh`
to re-embed ALL memories to the target dimension via ONNX. Verify: dimension query
above should show ONE group after re-embed.

### 22. Hook timeouts too short for ONNX cold-start

**Symptom:** Hooks produce no output and no errors. Especially on first run after init.

**How to investigate:**
1. Time the hook: `time npx ruvector hooks post-edit test.js --success`
   Note the wall-clock time.
2. Check configured timeout:
   `node -e 'var s=JSON.parse(require("fs").readFileSync(".claude/settings.json"));var h=s.hooks||{};Object.keys(h).forEach(function(e){(h[e]||[]).forEach(function(entry){var hooks=entry.hooks||[entry];hooks.forEach(function(hk){if(hk.timeout&&hk.timeout<5000)console.log("SHORT:",e,hk.timeout+"ms",hk.command&&hk.command.substring(0,50))})})})'`
3. If wall-clock > timeout -> hook is killed before completing

**Root cause:** `--fast` sets 300ms/500ms timeouts. ONNX cold-start needs ~1-1.5s.
Even warm ONNX inference takes 200-400ms. (Pattern B)

**Resolution:** `post-init-fix.sh` FIX 2 bumps to 5000-10000ms. Run it, or manually
increase timeouts in `.claude/settings.json`.

### 23. ruvector-viz MIME type error

**Symptom:** `Failed to load module script: Expected JavaScript but got application/typescript`
in browser console when opening ruvector-viz.

**How to investigate:**
1. Check `package.json` scripts:
   - `npm run dev` -> `concurrently "node server.js" "vite --port 5173"` (Vite compiles .ts)
   - `npm start` -> `node server.js` only (NO TypeScript compilation)
2. The `index.html` `<script>` tag points to a `.ts` file which needs Vite to compile
3. `server.js` serves `.ts` files with MIME `application/typescript`; browser rejects them as ES modules

**Root cause:** `server.js` alone cannot serve TypeScript for browser module loading.
Browsers require `application/javascript` for `<script type="module">` -- TypeScript
must be compiled to JavaScript first, which Vite handles.

**Resolution:** Always use `npm run dev` (starts both Vite + server), never `node server.js`
alone for development. The server now returns a clear error for `.ts` requests explaining this.

### 24. ruvector.db lock contention

**Symptom:** `Database already open. Cannot acquire lock` or similar lock error from
ruvector native VectorDB.

**How to investigate:**
1. Check who holds the lock: `lsof ruvector.db 2>/dev/null || fuser ruvector.db 2>/dev/null`
2. Identify the process (usually ruvector MCP server)
3. Note: `ruvector.db` is **redb** format (Rust KV store), NOT SQLite -- you cannot
   query it with `better-sqlite3` or `sqlite3` CLI
4. `intelligence.db` (SQLite) or `intelligence.json` is the SSOT; `ruvector.db` is an
   optional ANN accelerator created by `IntelligenceEngine`

**Root cause:** MCP server or another process holds exclusive write lock on native VectorDB.

**Resolution:** Stop the MCP server (`claude mcp remove ruvector`), or read from
`intelligence.db`/`intelligence.json` instead (which supports concurrent readers).
Restart MCP after the operation: `claude mcp add ruvector -- npx -y ruvector mcp start`.

---

## Root Cause Patterns

Cross-cutting patterns that appear across multiple scenarios. When investigating
a novel issue, check if it matches one of these patterns.

### Pattern A: Sync vs Async Embedding

**Signal:** Embedding dimensions are wrong (64d or 256d instead of 384d).
**Investigation:** Trace which function wrote the embedding. Check if it uses
`embed()` (sync -> always hash) or `embedAsync()` (async -> ONNX).
**Key insight:** ONNX is inherently async. The sync `embed()` method can NEVER
produce ONNX embeddings, even when the engine is fully initialized.
Affected: #2, #20, #21. Fix: route through async path (FIX-006).

### Pattern B: Silent Failure Masking

**Signal:** System appears functional but produces no output or wrong output.
**Investigation:** Run the suspected hook/command WITHOUT `2>/dev/null || true`.
Check stderr. Time the execution vs the configured timeout.
**Key insight:** Error suppression makes debugging impossible. Always test
hooks individually with full output first.
Affected: #10, #13, #19, #22. Fix: test without suppression, increase timeouts.

### Pattern C: Init Order Dependencies

**Signal:** Files exist but are missing expected configuration entries.
**Investigation:** Check timestamps of settings.json, intelligence.db/json, and
.swarm/memory.db. Was settings.json created BEFORE hooks were added?
**Key insight:** Several packages overwrite each other's config. Init order matters.
Affected: #1, #3, #4. Fix: follow init-sequence-details.md exactly.

### Pattern D: Dimension Mismatch Isolation

**Signal:** Some memories are found by search, others are invisible.
**Investigation:** Query distinct embedding dimensions in the store.
SQLite: `SELECT length(embedding), COUNT(*) FROM memories GROUP BY length(embedding)`
JSON: see Step 2 in Diagnostic Methodology.
**Key insight:** Cosine similarity between different dimensions returns 0.
Mixed dimensions = silent search failure for mismatched entries.
Affected: #1, #2, #7, #20, #21. Fix: re-embed ALL to same dimension (FIX 8).

---

## Platform-Specific Issues

### linux-x64-musl (Alpine, Docker)
Only `@ruvector/sona` has musl support. Use glibc images (debian/ubuntu).

### Windows ARM64
Only `@ruvector/sona` has win32-arm64 binaries. Use x64 emulation.

### macOS Gatekeeper
**Fix:** `xattr -cr node_modules/@ruvector/`

### Docker/CI: No git history
**Fix:** `git clone --depth=100` (not `--depth=1`), or `pretrain --skip-git`.

### Linux: Missing build tools
**Fix:** `sudo apt-get install build-essential pkg-config libssl-dev`

---

## When to Use FOX Method

See [fox-method.md](fox-method.md) when:
- Upstream bug blocks your work
- Upstream is slow to merge fix
- Custom extension needed temporarily

**Never** modify `node_modules/` directly.

---

## Browser/WASM Issues

These scenarios apply to the edge stack (`@ruvector/edge-full`) running in browsers or WASM runtimes.

**25. WASM module fails to load**

**Symptom:** `CompileError` or fetch failure when initializing WASM modules.
**Fix:** Verify that the server serves `.wasm` files with MIME type `application/wasm`. Ensure CORS headers allow the requesting origin. Check that the fetch path is correct relative to `import.meta.url` (not relative to the HTML page).

**26. ONNX inference slow in browser**

**Symptom:** Embedding generation takes seconds instead of milliseconds.
**Fix:** Check that `simd_available()` returns `true`. If it returns `false`, the WASM binary was compiled without SIMD128 support. SIMD requires Chrome 91+, Firefox 89+, or Safari 16.4+. Without SIMD, inference falls back to scalar operations at 4-8x slower speed.

**27. Workers fail to initialize**

**Symptom:** Web Worker creation throws `SecurityError` or the worker cannot load WASM.
**Fix:** The Worker script URL must be same-origin (no cross-origin workers without specific headers). Inside the worker, the WASM URL must be absolute or relative to the worker script location, not relative to the main page. Use `new URL('module.wasm', import.meta.url)` in the worker.

**28. Safari-specific WASM decode failure**

**Symptom:** `RangeError` or `CompileError` only in Safari when loading large WASM modules.
**Fix:** Safari has a synchronous decode size limit for WASM modules. Use the async `init()` function (the default export), not `initSync()`. The async path uses `WebAssembly.instantiateStreaming` which avoids the synchronous size limit.

---

## Data Integrity Scenarios (v0.9)

These scenarios were discovered via deep SQLite forensics after v0.8 install + swarm operations.

### 29. Hook memories have empty content

**Symptom:** Memories exist in the database but their content is empty or just a prefix
like "Reading: " or "Search: " without any actual file path or search pattern.

**How to investigate:**
1. Check content quality:
   SQLite: `SELECT id, content, length(content) FROM memories WHERE length(content) < 15 LIMIT 10`
   Or run `bash scripts/diagnose-db.sh` (Section 3: Content Quality).
2. Check settings.json for `$TOOL_INPUT_*` references:
   `grep 'TOOL_INPUT_' .claude/settings.json`
3. If found: those env vars are never set by Claude Code.

**Root cause:** `hooks init` generates hook commands using `$TOOL_INPUT_file_path`,
`$TOOL_INPUT_command`, `$TOOL_INPUT_pattern`, `$TOOL_INPUT_subagent_type`. Claude Code
does NOT set these environment variables. Instead, it sends a JSON object on stdin
containing `hook_event_name`, `tool_name`, `tool_input`, and `tool_response`. The
`$TOOL_INPUT_*` variables expand to empty strings, so hooks receive empty data. (Pattern E)

**Resolution:** Apply FIX-007 (`fixes/ruvector/fix-007-stdin-bridge.js`). This creates
`.claude/ruvector-hook-bridge.sh` that reads stdin JSON and extracts the relevant fields,
then replaces all `$TOOL_INPUT_*` references in settings.json with bridge calls.
Verify: `grep 'TOOL_INPUT_' .claude/settings.json` should return nothing.

### 30. post-edit/post-command still sync despite FIX-006

**Symptom:** After applying FIX-006 (which makes action handlers async), memories from
post-edit/post-command still have 64d embeddings instead of 384d. The handlers are async
but the actual `intel.remember()` call inside them is still synchronous.

**How to investigate:**
1. Verify FIX-006 is applied: `grep "post-edit.*action(async" node_modules/ruvector/bin/cli.js`
2. Check the actual call site: search within 30 lines after `.command('post-edit')` for
   `intel.remember('edit',` vs `intel.rememberAsync('edit',`
3. If you find `intel.remember(` (not `rememberAsync`): the sync path is still being used

**Root cause:** FIX-006 correctly makes the action handler async, but the call site inside
the handler may still use `intel.remember()` (sync) instead of `await intel.rememberAsync()`
(async). The sync remember path always produces 64d hash embeddings. (Pattern A)

**Resolution:** Apply FIX-006b (`fixes/ruvector/fix-006b-actual-callsites.js`). This
patches the actual `intel.remember('edit',` and `intel.remember('command',` calls to
`await intel.rememberAsync(...)` within the post-edit and post-command handler blocks.
FIX-006 must be applied first (dependency).

### 31. file_sequences table always empty

**Symptom:** `SELECT COUNT(*) FROM file_sequences` returns 0 even after editing many files.
Co-edit patterns are never recorded. `diagnose-db.sh` Section 6 shows 0 entries.

**How to investigate:**
1. Check if the post-edit handler records file sequences:
   `grep -A5 "recordFileSequence" node_modules/ruvector/bin/cli.js`
2. `recordFileSequence(prevFile, currentFile)` requires `prevFile` to be non-null
3. `prevFile` comes from `lastEditedFile` on the Intelligence instance
4. Each hook invocation creates `new Intelligence()` -- `lastEditedFile` is always null

**Root cause:** Each hook invocation creates a fresh `Intelligence()` instance. There is
no mechanism to carry `lastEditedFile` from one invocation to the next. Without a previous
file, `recordFileSequence()` is never called with two different files. (Pattern E)

**Resolution:** Apply FIX-008 (`fixes/ruvector/fix-008-persist-last-edited.js`). This
persists `lastEditedFile` in kv_store (SQLite) or `.ruvector/kv.json` (JSON backend)
and loads it at the start of each post-edit invocation. After two different file edits,
`file_sequences` will start populating.

### 32. Data loss from partial saveAll()

**Symptom:** Intelligence data (memories, patterns, trajectories) disappears intermittently.
Particularly when multiple hooks run concurrently or when a hook only loads partial data.

**How to investigate:**
1. Check storage adapter saveAll() for the DELETE pattern:
   `grep "DELETE FROM" packages/ruvector-storage/index.js`
2. If you see `DELETE FROM memories` followed by INSERT: this is the destructive pattern
3. If hook A loads only memories and hook B loads only patterns, both calling saveAll()
   will wipe each other's data

**Root cause:** `saveAll()` does `DELETE FROM <table>` for ALL tables, then re-inserts only
the rows it has in memory. If a hook only loaded memories (not patterns), `saveAll()` still
deletes all patterns and re-inserts an empty array. This is a classic read-modify-write race.

**Resolution:** Apply FIX-009 (`fixes/ruvector/fix-009-atomic-save.js`). This replaces
`saveAll()` with a version that: (A) skips tables where data is undefined/null (never
loaded), and (B) uses INSERT OR REPLACE instead of DELETE-all + INSERT. For stock JSON
backend, a guard prevents writing empty arrays for unloaded data.

### 33. hooks stats shows 2 patterns but 20+ exist

**Symptom:** `npx ruvector hooks stats` reports a small number of patterns (e.g. 2), but
querying the database directly shows 20+ Q-learning entries across two stores.

**How to investigate:**
1. Run `bash scripts/diagnose-db.sh` Section 4 to see both Q-learning stores
2. Check patterns table: `SELECT COUNT(*) FROM patterns` (legacy store)
3. Check learning_data: inspect `q_table` column for `qTables` JSON (new store)
4. `hooks stats` only reads the patterns table, missing all learning_data entries

**Root cause:** There are two disconnected Q-learning stores:
- **patterns table** (legacy): written by `updatePattern()`, read by `hooks stats`
- **learning_data.qTables** (new): written by the multi-algorithm RL system, NOT read by `hooks stats`

The `hooks stats` command only reports from the patterns table. (Pattern F)

**Resolution:** No code fix -- this is documented behavior. When assessing Q-learning
state, always check BOTH stores. Use `diagnose-db.sh` or `validate-setup.sh` Level 7
(RC6 check) to see the combined picture.

### 34. agents/edges tables always empty

**Symptom:** `SELECT COUNT(*) FROM agents` and `SELECT COUNT(*) FROM edges` both return 0
regardless of how many agents have been spawned or how much coordination has occurred.

**How to investigate:**
1. Search cli.js for INSERT INTO agents: `grep "INSERT.*agents" node_modules/ruvector/bin/cli.js`
2. Search cli.js for INSERT INTO edges: `grep "INSERT.*edges" node_modules/ruvector/bin/cli.js`
3. Both searches return nothing -- the CLI never writes to these tables

**Root cause:** The DDL creates `agents` and `edges` tables, but no CLI command writes
to them. Agent data lives in the claude-flow swarm layer (`.swarm/memory.db`), not in
ruvector's intelligence store. The tables are schema placeholders for a future integration
that has not been built. (Pattern F)

**Resolution:** No code fix needed. This is a known limitation. Agent coordination data
lives in claude-flow's `.swarm/memory.db`, not in ruvector's intelligence.db.

---

### Pattern E: Stateless Hook Invocations

**Signal:** Per-session state (lastEditedFile, session context) is always null or empty.
**Investigation:** Check if the hook handler creates `new Intelligence()` on each call.
If so, all instance state (lastEditedFile, counters, cached objects) resets every time.
**Key insight:** CLI hooks are stateless by design -- each invocation is a fresh process.
Any state that needs to persist across invocations must be stored externally (kv_store,
file system, environment variables). Instance properties on Intelligence are per-invocation only.
Affected: #29, #31. Fix: persist critical state in kv_store (FIX-008) and read stdin (FIX-007).

### Pattern F: Schema Without Write Paths

**Signal:** Table exists with correct DDL but always has 0 rows.
**Investigation:** Search the CLI source for `INSERT INTO <table>`. If no matches:
the schema was created but no code path writes to it.
**Key insight:** DDL creation != data population. Some tables are forward-looking
placeholders. Others have their data in a different system (e.g. claude-flow for agents).
Don't assume empty means broken -- verify whether write paths exist first.
Affected: #33, #34. Fix: document, validate both stores, don't rely on single-store reporting.

### Pattern G: Stateless Native Modules

**Signal:** Native Rust modules (SONA, VectorDB) work correctly during a single invocation
but lose all learned state between invocations.
**Investigation:** Check if the native module has serialize/deserialize methods. SONA does not.
VectorDB has `storagePath` but it may not be configured. TinyDancer Router has in-memory state only.
**Key insight:** Node.js native addons have no automatic state persistence. Each `require()`
in a new process creates a fresh instance. State must be explicitly exported/imported or
the module must support filesystem-backed storage (like VectorDB's `storagePath`).
Affected: #35, #36, #37, #38. Fix: FIX-013 (SONA warm-up), FIX-014 (HNSW storagePath),
FIX-015 (tick/forceLearn), FIX-016 (TinyDancer wiring).

---

## Advanced Learning Scenarios (v0.9.1)

These scenarios address the native @ruvector/* modules (SONA, HNSW, TinyDancer) that
are installed but not properly wired into the CLI hook lifecycle.

### 35. SONA LoRA weights always zero

**Symptom:** `engine.sona.getStats()` always shows `microLoraUpdates: 0`,
`baseLoraUpdates: 0`, `ewcConsolidations: 0` even after many edits and commands.
`applyMicroLora()` returns the input unchanged. Pattern clustering finds no patterns.

**How to investigate:**
1. Check SONA stats: `npx ruvector hooks intelligence stats` (look for zero counters)
2. Check if FIX-013 is applied: `grep "FIX-013" node_modules/ruvector/bin/cli.js`
3. Without FIX-013: SONA creates a fresh instance per invocation, processes zero
   trajectories, and is discarded. LoRA weights never accumulate.
4. With FIX-013: the save() path flushes SONA before export, and getEngine() replays
   the last 50 trajectories on load. LoRA weights warm up each invocation.

**Root cause:** `@ruvector/sona` SonaEngine has no serialize/deserialize API. Each CLI
hook invocation creates a fresh SonaEngine via `SonaEngine.withConfig()`. Without
trajectory replay, SONA has nothing to learn from. (Pattern G)

**Resolution:** Apply FIX-013 (`fixes/ruvector/fix-013-sona-persistence.js`).
Part A patches save() to call `sona.flush()`, `sona.tick()`, `sona.forceLearn()` before
`engine.export()` and stores SONA stats in kv_store. Part B patches getEngine() to replay
the last 50 trajectories from `this.data.trajectories` into SONA on each load.
Verify: `validate-setup.sh` Level 8 RC10 check.

### 36. HNSW index rebuilt every hook call

**Symptom:** Vector similarity search (`hooks recall --semantic`) is slow on large
memory stores. Each invocation does a full linear scan rather than an indexed lookup.
`diagnose-db.sh` Section 12 shows "HNSW index: not persisted".

**How to investigate:**
1. Check for `.ruvector/hnsw.db`: `ls -la .ruvector/hnsw.db`
2. Check engine VectorDB config: `grep storagePath node_modules/ruvector/dist/core/intelligence-engine.js`
3. Without storagePath: VectorDB creates an in-memory HNSW index per invocation
4. With storagePath: VectorDB auto-persists/loads the index

**Root cause:** The `@ruvector/core` VectorDB constructor accepts an optional `storagePath`
parameter that enables automatic HNSW index persistence. Without it, the index is rebuilt
from scratch on every hook invocation. (Pattern G)

**Resolution:** Apply FIX-014 (`fixes/ruvector/fix-014-hnsw-persistence.js`).
Patches the VectorDB constructor to include `storagePath: '.ruvector/hnsw.db'`.
Note: In many engine versions, storagePath is already configured — FIX-014 detects this
and skips if unnecessary. Verify: `validate-setup.sh` Level 8 RC11 check.

### 37. SONA tick/forceLearn never called

**Symptom:** SONA's background learning (micro-LoRA weight updates, EWC++ consolidation,
pattern clustering) never runs even though trajectories are recorded. `sona.getStats()`
shows `totalEpisodes: 0` despite trajectory data existing in the database.

**How to investigate:**
1. Check FIX-015 markers: `grep -c "FIX-015" node_modules/ruvector/bin/cli.js`
   (should be 3 or more)
2. Without FIX-015: no hook handler calls `sona.tick()` or `sona.forceLearn()`
3. SONA buffers trajectories in memory but never processes them into LoRA weights
4. The `tick()` method triggers background consolidation; `forceLearn()` forces a full cycle

**Root cause:** The IntelligenceEngine has `tick()` and `forceLearn()` methods that drive
SONA's background learning. These are never called by any hook handler in stock cli.js.
Without these calls, SONA buffers trajectories but never processes them, so LoRA weights
stay at zero and EWC++ never consolidates. (Pattern G)

**Resolution:** Apply FIX-015 (`fixes/ruvector/fix-015-tick-forcelearn.js`).
Part A: calls `tick()` in post-edit handler before `intel.save()`.
Part B: calls `tick()` in post-command handler before `intel.save()`.
Part C: calls `forceLearn()` + `flush()` in session-end handler before `intel.save()`.
Verify: `validate-setup.sh` Level 8 RC12 check (expects 3 markers).

### 38. TinyDancer neural routing not used

**Symptom:** The `route()` method always uses Q-learning (hardcoded agentMap + suggest()),
never the TinyDancer neural router. `@ruvector/tiny-dancer` is installed but has no effect
on routing decisions. Agent recommendations are based solely on file extension matching.

**How to investigate:**
1. Check if FIX-016 is applied: `grep "_getTinyDancer" node_modules/ruvector/dist/core/intelligence-engine.js`
2. Without FIX-016: `route()` does extension → agent type lookup from `agentMap`, then
   Q-learning via `suggest()` and `getQ()`. TinyDancer is never instantiated.
3. With FIX-016: `route()` tries TinyDancer first (neural routing with uncertainty
   estimation), falls back to Q-learning if TinyDancer is unavailable or confidence < 0.6.

**Root cause:** `@ruvector/tiny-dancer` provides a FastGRNN neural router with uncertainty
estimation and circuit breaker for fault tolerance. It is installed as a dependency but
never instantiated or called by the IntelligenceEngine's `route()` method. (Pattern G)

**Resolution:** Apply FIX-016 (`fixes/ruvector/fix-016-tinydancer-wiring.js`).
Adds `_getTinyDancer()` (lazy init), `_registerTinyDancerAgents()` (agent registration
from default catalog), and `recordTinyDancerOutcome()` (learning from routing outcomes).
Enhances `route()` to try TinyDancer first with confidence threshold 0.6, falling back to
Q-learning. This fix is OPTIONAL — the system works without it (Q-learning fallback).
Verify: `validate-setup.sh` Level 8 RC13 check.

---

## v0.9.8 Install Scenarios

These scenarios address install-order issues discovered via database forensics on vanilla
installs that followed the _clean_vanilla&db_install_guide.md (now deprecated).

### Pattern H: Install Sequence Violation

**Signal:** Embeddings have wrong dimension (64d instead of 384d), learning pipeline tables
are empty, or stats table not synchronized.
**Investigation:** Check the install order: did setup.sh run BEFORE pretrain? Did consolidate
ever run? Check embedding byte sizes in the database.
**Key insight:** The vanilla install guide had pretrain BEFORE setup.sh, which configured
ONNX embeddings. This meant pretrain ran with 64d hash fallback. The consolidate step was
never explicitly documented, leaving learning_data, neural_patterns, and edges empty.
Affected: #39, #40, #41, #42. Fix: Follow unified INSTALL.md Phase 8 (setup.sh) BEFORE Phase 9 (pretrain).

### 39. Pretrain embeddings are 64d hash instead of 384d ONNX (FIX-025)

**Symptom:** After fresh install, `validate-setup.sh` Level 9 shows embeddings at 256 bytes
(64d) instead of 1536 bytes (384d). Semantic search returns poor results.

**How to investigate:**
1. Check embedding byte sizes:
   ```bash
   node -e '
   var D = require("better-sqlite3");
   var db = new D(".ruvector/intelligence.db", {readonly:true});
   var rows = db.prepare("SELECT length(embedding) as bytes, COUNT(*) as c FROM memories WHERE embedding IS NOT NULL GROUP BY bytes").all();
   console.log(rows);
   db.close();
   '
   ```
2. Expected: `[ { bytes: 1536, c: N } ]` (384d * 4 bytes = 1536)
3. If you see `bytes: 256`: 64d hash fallback was used

**Root cause:** The deprecated vanilla install guide ran `pretrain --verbose` BEFORE
`setup.sh`, which configures ONNX embeddings. Without ONNX configured, ruvector fell back
to 64d hash embeddings. (Pattern H)

**Resolution:**
1. Follow the unified INSTALL.md: Phase 8 (setup.sh) BEFORE Phase 9 (pretrain)
2. If already broken, re-run pretrain after setup.sh:
   ```bash
   # Backup existing data
   cp .ruvector/intelligence.db .ruvector/intelligence.db.bak-64d

   # Clear and re-pretrain with correct dimensions
   node -e 'var D=require("better-sqlite3");var db=new D(".ruvector/intelligence.db");db.prepare("DELETE FROM memories").run();db.close()'
   npx ruvector hooks pretrain --verbose
   ```
3. Verify: `validate-setup.sh` Level 9 should show all embeddings at 1536 bytes

### 40. Learning pipeline tables empty (FIX-024)

**Symptom:** After install, `neural_patterns`, `edges`, and `agents` tables have 0 rows.
`validate-setup.sh` Level 8 shows warnings for all learning pipeline tables.

**How to investigate:**
1. Check learning pipeline table counts:
   ```bash
   node -e '
   var D = require("better-sqlite3");
   var db = new D(".ruvector/intelligence.db", {readonly:true});
   var tables = ["neural_patterns", "edges", "agents", "trajectories", "compressed_patterns"];
   tables.forEach(function(t) {
     try {
       var c = db.prepare("SELECT COUNT(*) as c FROM " + t).get().c;
       console.log(t + ": " + c);
     } catch(e) { console.log(t + ": ERROR - " + e.message); }
   });
   db.close();
   '
   ```
2. If all zeros: consolidation never ran

**Root cause:** The install guides never explicitly called `node scripts/post-process.js --event consolidate`.
The consolidation step extracts neural patterns from memories, creates semantic edges between
related memories, and registers session agents. Without this step, the learning pipeline
remains dormant. (Pattern H)

**Resolution:** Run the consolidation step:
```bash
# Register the setup agent
node scripts/post-process.js --event session-start --agent-name setup-agent

# Run consolidation to populate learning pipeline
node scripts/post-process.js --event consolidate
```

Verify: Re-run `validate-setup.sh` Level 8; neural_patterns, edges, and agents should now
have entries.

### 41. Stats table missing or empty (FIX-027)

**Symptom:** `validate-setup.sh` Level 10 shows stats table missing or essential stats not
populated. Dashboard tools cannot display learning metrics.

**How to investigate:**
1. Check if stats table exists:
   ```bash
   node -e '
   var D = require("better-sqlite3");
   var db = new D(".ruvector/intelligence.db", {readonly:true});
   var exists = db.prepare("SELECT COUNT(*) as c FROM sqlite_master WHERE type=\x27table\x27 AND name=\x27stats\x27").get().c;
   console.log("stats table exists:", exists > 0);
   if (exists) {
     var rows = db.prepare("SELECT key, value FROM stats").all();
     console.log("stats entries:", rows);
   }
   db.close();
   '
   ```
2. Essential keys: `total_memories`, `total_patterns`, `total_edges`, `last_consolidation`

**Root cause:** The stats table was added in v0.9.8 (FIX-027) to track learning pipeline
metrics. Older installs or those that never ran consolidation will have an empty or missing
stats table. (Pattern H)

**Resolution:** Ensure you're using v0.9.8 scripts, then run consolidation:
```bash
# Re-run consolidation with v0.9.8 post-process.js (includes FIX-027)
node scripts/post-process.js --event consolidate
```

The v0.9.8 consolidate handler automatically syncs the stats table with current counts.
Verify: `validate-setup.sh` Level 10 should show synced stats.

### 42. Two conflicting install guides causing confusion (FIX-026)

**Symptom:** User follows one install guide but gets unexpected results. References to
"vanilla guide" vs "clean install guide" cause confusion about correct install sequence.

**How to investigate:**
1. Check which guide was followed by examining the database state:
   - 64d embeddings + empty learning tables = vanilla guide (pretrain before setup.sh)
   - 384d embeddings + populated learning tables = unified guide (correct sequence)
2. Check for symlinks: `ls -la .swarm .ruvector` - vanilla guide uses no symlinks

**Root cause:** Two install guides existed:
- `_clean_install_guide.md`: Uses symlinks, single unified directory
- `_clean_vanilla&db_install_guide.md`: No symlinks, separate directories, BUT ran pretrain
  before setup.sh (wrong order)

**Resolution:** Both legacy guides are deprecated. Use the unified `INSTALL.md` which:
1. Documents the correct 13-phase sequence
2. Runs Phase 8 (setup.sh) BEFORE Phase 9 (pretrain)
3. Includes Phase 10 (consolidation) explicitly
4. Has verification checkpoints after each phase

If migrating from a broken install:
```bash
# Full reset with correct sequence
rm -rf .ruvector/intelligence.db .swarm/memory.db
bash scripts/setup.sh
npx ruvector hooks pretrain --verbose
node scripts/post-process.js --event session-start --agent-name setup-agent
node scripts/post-process.js --event consolidate
bash scripts/validate-setup.sh
```
