# Wiring & Validation Reference

> **Version:** v0.9 | **Generated:** 2026-02-01 | **Ecosystem:** claude-flow v3.0.0-alpha.190 + ruvector 0.1.96

What each init step ACTUALLY creates, what the next step expects, where the
pipeline silently breaks, and how to detect and fix each break.

All findings verified by running `hooks init` in a clean directory and
inspecting every generated file.

## Contents
- Init Step-by-Step Wiring Map
- The Memory Pipeline Problem
- The Q-Learning Cold Start Problem
- The Silent Failure Pattern
- Hook Stdin JSON Protocol (v0.9)
- Deep Validation Commands
- Post-Fix Re-Pretrain Requirement

---

## Scripts Deployment

> **Important:** The `scripts/` directory shipped with this skill contains 4 shell
> scripts (`post-init-fix.sh`, `validate-setup.sh`, `pre-upgrade.sh`,
> `memory-sync.sh`). These scripts are NOT automatically deployed to your project
> by any install or init command. You must make them available yourself before
> any step that references `bash scripts/...`.

**Option A -- Copy scripts into your project (recommended):**

```bash
mkdir -p scripts
# Copy from wherever you installed the skill. Example paths:
cp /path/to/howto_V3+RV_Skill/v0.7/scripts/*.sh scripts/
chmod +x scripts/*.sh
```

**Option B -- Run directly from the skill path:**

```bash
bash /path/to/howto_V3+RV_Skill/v0.7/scripts/post-init-fix.sh [model] [dim]
bash /path/to/howto_V3+RV_Skill/v0.7/scripts/validate-setup.sh
```

**Option C -- Run the critical validations inline (no scripts needed):**

The two most important scripts are `post-init-fix.sh` (Step 4) and
`validate-setup.sh` (Step 7). Here are their core checks as inline commands:

```bash
# --- post-init-fix.sh essentials (Step 4) ---
# Set semantic embedding env vars in settings.json:
node -e '
var f=".claude/settings.json";
var s=JSON.parse(require("fs").readFileSync(f,"utf-8"));
s.env=s.env||{};
s.env.RUVECTOR_SEMANTIC_EMBEDDINGS="true";
s.env.RUVECTOR_EMBEDDING_MODEL=process.argv[1]||"all-MiniLM-L6-v2";
s.env.RUVECTOR_EMBEDDING_DIM=process.argv[2]||"384";
require("fs").writeFileSync(f,JSON.stringify(s,null,2));
console.log("Set semantic env vars in settings.json");
' "${MODEL:-all-MiniLM-L6-v2}" "${DIM:-384}"

# Increase remember hook timeouts to 5000ms and add --semantic:
node -e '
var f=".claude/settings.json";
var s=JSON.parse(require("fs").readFileSync(f,"utf-8"));
if(s.hooks){
  Object.keys(s.hooks).forEach(function(evt){
    s.hooks[evt].forEach(function(h){
      if(h.timeout && h.timeout < 5000) h.timeout = 5000;
      if(h.command && h.command.indexOf("hooks remember")!==-1 && h.command.indexOf("--semantic")===-1){
        h.command = h.command.replace(/hooks remember/g,"hooks remember --semantic");
      }
    });
  });
}
require("fs").writeFileSync(f,JSON.stringify(s,null,2));
console.log("Updated hook timeouts and --semantic flags");
'

# --- validate-setup.sh essentials (Step 7) ---
# Check that components are installed:
npx ruvector doctor --verbose
npx ruvector install --list

# Check config:
node -e '
var s=JSON.parse(require("fs").readFileSync(".claude/settings.json","utf-8"));
var ok=true;
if(s.env.RUVECTOR_SEMANTIC_EMBEDDINGS!=="true"){console.log("FAIL: RUVECTOR_SEMANTIC_EMBEDDINGS not set");ok=false;}
if(!s.env.RUVECTOR_EMBEDDING_MODEL){console.log("FAIL: RUVECTOR_EMBEDDING_MODEL not set");ok=false;}
if(!s.mcpServers||!s.mcpServers["claude-flow"]){console.log("WARN: claude-flow MCP not configured");ok=false;}
if(ok)console.log("PASS: core config validated");
'

# Check memories have real embeddings:
node -e '
var d=JSON.parse(require("fs").readFileSync(".ruvector/intelligence.json","utf-8"));
var n=d.memories?d.memories.filter(function(m){return m.embedding===null}).length:0;
if(n>0)console.log("WARN: "+n+" memories have NULL embeddings");
else console.log("PASS: all memories have embeddings");
'
```

---

## Init Step-by-Step Wiring Map

### Step 1: claude-flow init

**Creates:**
- `.claude/settings.json` (base structure)
- `.claude/` directory
- `.swarm/memory.db` (SQLite)
- `claude-flow.config.json`
- `.claude-flow/` and `.claude-flow/neural/`

**Next step expects:** `.claude/settings.json` to exist (hooks init MERGES into it).

### Step 2: ruvector doctor

**Creates:** Nothing. Read-only diagnostic.
**Checks:** Node version, native bindings (@ruvector/core, gnn, attention, graph-node), Rust toolchain, build tools.

### Step 3: ruvector hooks init

**Creates:**
- `.claude/settings.json` — MERGES: env (13 vars), hooks (7 events, 15 hook entries), workers (12 triggers), performance thresholds, agent presets, permissions (21 allow, 5 deny), statusLine, agentConfig
- `.claude/ruvector-fast.sh` — Fast wrapper bypassing npx
- `.claude/agentic-flow-fast.sh` — Wrapper for agentic-flow workers
- `.claude/statusline-command.sh` — Status display script
- `.claude/agents/` — Agent YAML configs (2 for "quality" focus)
- `.ruvector/intelligence.json` — Learning state: patterns, memories, trajectories, Q-tables, learning configs
- `CLAUDE.md` — Project instructions
- `.gitignore` — Adds `.ruvector/` entry

**What it writes to settings.json env:**
```
RUVECTOR_INTELLIGENCE_ENABLED=true    RUVECTOR_LEARNING_RATE=0.1
RUVECTOR_MEMORY_BACKEND=rvlite        INTELLIGENCE_MODE=treatment
RUVECTOR_AST_ENABLED=true             RUVECTOR_DIFF_EMBEDDINGS=true
RUVECTOR_COVERAGE_ROUTING=true        RUVECTOR_GRAPH_ALGORITHMS=true
RUVECTOR_SECURITY_SCAN=true           RUVECTOR_MULTI_ALGORITHM=true
RUVECTOR_DEFAULT_ALGORITHM=double-q   RUVECTOR_TENSOR_COMPRESS=true
RUVECTOR_AUTO_COMPRESS=true
```

**What it DOES NOT write (gaps):**
- `RUVECTOR_SEMANTIC_EMBEDDINGS` — NOT SET → defaults to 64d n-gram
- `RUVECTOR_EMBEDDING_MODEL` — NOT SET → no ONNX model configured
- `RUVECTOR_EMBEDDING_DIM` — NOT SET → dimension unknown
- `mcpServers` — EMPTY `{}` despite init saying "✓ MCP servers configured"
- remember hooks lack `--semantic` flag → memories stored without real embeddings
- remember hook timeouts are 300ms → too low for ONNX embedding operations

**What hooks it wires into settings.json:**

| Event | Matcher | Commands | Timeout |
|-------|---------|----------|---------|
| PreToolUse | Edit\|Write\|MultiEdit | pre-edit, coedit-suggest | 500ms |
| PreToolUse | Bash | pre-command | 500ms |
| PreToolUse | Read | remember (file access) | 300ms |
| PreToolUse | Glob\|Grep | remember (search pattern) | 300ms |
| PreToolUse | Task | remember (agent spawn) | 300ms |
| PostToolUse | Edit\|Write\|MultiEdit | post-edit | 500ms |
| PostToolUse | Bash | post-command | 500ms |
| SessionStart | — | session-start, trajectory-begin | 1000ms, 500ms |
| Stop | — | trajectory-end, session-end | 500ms, 500ms |
| UserPromptSubmit | — | suggest-context, workers dispatch-prompt, workers inject-context | 500ms, 2000ms, 1000ms |
| PreCompact | auto | pre-compact --auto, compress | 1000ms |
| PreCompact | manual | pre-compact | 1000ms |
| Notification | .* | track-notification | 300ms |

### Step 4: post-init-fix.sh

**Usage:** `bash scripts/post-init-fix.sh [model] [dimension]`
- Defaults: `all-MiniLM-L6-v2` `384` (if args omitted)
- Example: `bash scripts/post-init-fix.sh all-mpnet-base-v2 768`

**Fixes in settings.json:**
1. Adds `RUVECTOR_SEMANTIC_EMBEDDINGS=true`
2. Adds `RUVECTOR_EMBEDDING_MODEL=<model arg>` (default: `all-MiniLM-L6-v2`)
3. Adds `RUVECTOR_EMBEDDING_DIM=<dim arg>` (default: `384`)
4. Increases remember hook timeouts to 5000ms
5. Adds `--semantic` flag to remember hook commands
6. Pre-downloads ONNX model (23MB from HuggingFace)
7. Checks rvlite backend availability
8. Verifies MCP server entries
9. Checks for missing base env vars (warns if `--no-env` was used in hooks init)

### Step 5: Pretrain (after fix)

**Updates:** `.ruvector/intelligence.json`
- Phase 1: File routing patterns in `patterns`
- Phase 2: Git co-edit patterns in `file_sequences`
- Phase 3: Key file memories in `memories` (should now have embeddings)
- Phase 4: Directory-agent mappings in `dirPatterns`
- Phase 5: AST complexity data
- Phase 6: Diff classification
- Phase 7: Coverage data (if exists)
- Phase 8: Neural capability flags in `neuralCapabilities`
- Phase 9: Graph data (Louvain + MinCut)
- Phase 10: Learning engine configs in `learning.configs`
- Phase 11: TensorCompress init in `compressedPatterns`

---

## The Memory Pipeline Problem

After default `hooks init --pretrain`, memories are stored like this:

```json
{
  "content": "[CLAUDE.md] # Claude Code Project...",
  "type": "project",
  "embedding": null    // ← NULL! Invisible to semantic search
}
```

The problem chain:
1. `hooks init` sets NO semantic embedding env vars
2. `--pretrain` runs immediately, BEFORE any fix
3. Pretrain Phase 3 stores memories WITHOUT --semantic
4. Memories get `embedding: null`
5. `recall --semantic` searches by cosine similarity on ONNX vectors (384d or 768d depending on model)
6. Null-embedding memories have no vector → completely invisible
7. System appears to have memories but semantic search returns nothing

**Without --semantic:** `remember` stores 64d n-gram hash embeddings.
These are also invisible to `--semantic` recall (different dimensions).

**With --semantic:** `remember --semantic` downloads ONNX model (23MB, first
time only), generates embeddings at the configured dimension (384d for MiniLM,
768d for mpnet), stores them. Only THESE are searchable by semantic recall.

### Fix

1. Run post-init-fix.sh BEFORE pretrain (adds env vars + --semantic flags)
2. Run pretrain AFTER the fix
3. Verify: `npx ruvector hooks recall "project" -k 1 --semantic` → should return results with score

### If pretrain already ran with NULL embeddings

```bash
# Reset intelligence and re-pretrain
cp .ruvector/intelligence.json .ruvector/intelligence.json.bak
echo '{}' > .ruvector/intelligence.json
npx ruvector hooks pretrain --verbose
# Verify
npx ruvector hooks recall "project" -k 1 --semantic
```

---

## Two Embedding Code Paths (sync vs async)

The ruvector CLI has two fundamentally different embedding code paths. Understanding
this is critical for diagnosing embedding dimension issues.

### Async path (correct for ONNX)

```
hooks remember --semantic "text"
  → rememberAsync('...', content, type)
    → embedAsync(content)
      → onnxEmbedder.embed(content)        // Returns Promise<Float32Array>
        → ONNX model inference (384d)       // all-MiniLM-L6-v2
  → 384d ONNX embedding stored ✓
```

Used by: `hooks remember --semantic`, `hooks recall --semantic`
Trigger: `--semantic` flag on CLI

### Broken path (non-async action handler)

```
post-edit handler / post-command handler
  .action((file, opts) => {              // ← NOT async!
    await intel.rememberAsync('edit', ...)   // ← await in non-async context
      → SyntaxError on parse (breaks entire CLI)
      → OR: await silently returns pending Promise (embedding never stored)
  })
```

Used by: `post-edit` handler (~line 4024), `post-command` handler (~line 4053)
These are the PostToolUse hooks that fire after every Edit/Write/Bash in Claude Code.

### Why stock post-edit/post-command fail

Stock ruvector v0.1.96 already uses `await intel.rememberAsync(...)` in these handlers,
but the enclosing `.action((file, opts) => {` is NOT marked `async`. In a CJS module:
- Node.js may throw `SyntaxError: await is only valid in async functions` on parse
- If Commander.js defers parsing, the `await` becomes a no-op (returns pending Promise)
- Either way, the ONNX embedding is never actually awaited and stored

### Fix

FIX-006 (`fixes/ruvector/fix-006-async-remember.js`) patches cli.js to make the
action handlers async: `.action(async (file, opts) => {`. This allows the existing
`await intel.rememberAsync(...)` to work correctly.
This is applied automatically by `post-init-fix.sh` FIX 6.

See troubleshooting.md #2, #20, Pattern A for the full root cause chain.

---

## The Q-Learning Cold Start Problem

After init, the Q-learning system has:
- 9 algorithms initialized with 0 updates each
- 6 task-type configs (agent-routing, error-avoidance, etc.)
- Empty Q-tables
- Route returns hardcoded defaults with `confidence: 0`

Example after 1 learn experience:
```
learn -s "ts-file" -a "coder" -r 0.9 → stored, double-q updates: 1
route "fix auth bug" --file src/auth.ts → "typescript-developer", confidence: 0, "default for ts files"
```

The Q-table recorded the experience, but routing still uses hardcoded defaults.
Q-learning needs MANY experiences before it accumulates enough confidence to
override defaults. This is expected behavior, not a bug.

### Seeding Q-learning

To accelerate learning, batch-seed from known good patterns:
```bash
npx ruvector hooks batch-learn -d '[
  {"state":"ts-file","action":"coder","reward":0.9},
  {"state":"test-file","action":"tester","reward":0.9},
  {"state":"config-file","action":"devops","reward":0.8},
  {"state":"security-issue","action":"security-analyst","reward":0.95}
]' -t agent-routing
```

---

## The Silent Failure Pattern

Every hook in settings.json uses this pattern:
```bash
.claude/ruvector-fast.sh hooks <command> ... 2>/dev/null || true
```

This means:
- stderr is discarded (`2>/dev/null`)
- Any non-zero exit is ignored (`|| true`)
- If ruvector is uninstalled, misconfigured, or crashes → hook silently does nothing
- Claude Code continues normally, unaware the learning pipeline is dead

This is by design (hooks shouldn't block Claude Code) but makes debugging hard.

### How to detect silent failures

```bash
# Remove || true temporarily and run a hook manually:
.claude/ruvector-fast.sh hooks remember "test" -t test --semantic
# Check exit code:
echo $?
# Check stderr:
.claude/ruvector-fast.sh hooks remember "test" -t test --semantic 2>&1
```

---

## Hook Stdin JSON Protocol (v0.9)

Claude Code does NOT set `$TOOL_INPUT_*` environment variables for hooks. Instead, it sends
a JSON object on stdin for each hook event. Understanding this protocol is essential for
debugging hooks that receive empty data.

### What Claude Code sends

For every hook event, Claude Code writes this JSON to the hook command's stdin:

```json
{
  "hook_event_name": "PostToolUse",
  "tool_name": "Write",
  "tool_input": {
    "file_path": "/path/to/file.txt",
    "content": "file contents..."
  },
  "tool_response": {
    "success": true
  }
}
```

Key fields:
- `hook_event_name`: PreToolUse, PostToolUse, SessionStart, Stop, UserPromptSubmit, etc.
- `tool_name`: Edit, Write, MultiEdit, Bash, Read, Glob, Grep, Task, etc.
- `tool_input`: The exact parameters passed to the tool (varies by tool)
- `tool_response`: The tool's response (only for PostToolUse)

### What hooks init generates (broken)

`hooks init` generates commands like:
```bash
.claude/ruvector-fast.sh hooks post-edit "$TOOL_INPUT_file_path" 2>/dev/null || true
```

`$TOOL_INPUT_file_path` is never set by Claude Code, so it expands to an empty string.
The hook runs but receives no file path, producing empty-content memories.

### What the stdin bridge does (FIX-007)

FIX-007 creates `.claude/ruvector-hook-bridge.sh` that:
1. Reads ALL of stdin into a variable
2. Extracts the relevant field using `node -e` (e.g., `j.tool_input?.file_path`)
3. Calls ruvector with the extracted value as a positional argument

```bash
# Before (broken):
.claude/ruvector-fast.sh hooks post-edit "$TOOL_INPUT_file_path" 2>/dev/null || true

# After (working):
.claude/ruvector-hook-bridge.sh post-edit 2>/dev/null || true
```

The bridge handles these hook types:
- `pre-edit` / `post-edit`: extracts `tool_input.file_path`
- `post-command`: extracts `tool_input.command`
- `remember-read`: extracts `tool_input.file_path` for Read tool
- `remember-search`: extracts `tool_input.pattern` for Glob/Grep tools
- `remember-agent`: extracts `tool_input.subagent_type` for Task tool
- `coedit-suggest`: extracts `tool_input.file_path`

### Verifying the protocol works

```bash
# Check no $TOOL_INPUT_ references remain:
grep 'TOOL_INPUT_' .claude/settings.json  # should return nothing

# Check bridge script exists and is executable:
test -x .claude/ruvector-hook-bridge.sh && echo OK

# Test the bridge manually (simulate Claude Code stdin):
echo '{"tool_input":{"file_path":"test.js"}}' | .claude/ruvector-hook-bridge.sh post-edit
```

---

## Deep Validation Commands

### Level 1: Components installed
Use ruvector's own tools — don't hardcode package checks:
```bash
npx ruvector doctor --verbose          # system health, bindings, toolchain
npx ruvector install --list            # installed (✓) vs available (○) packages
npx ruvector info                      # version, platform, module status
npx @claude-flow/cli@latest --version  # claude-flow present
```

### Level 2: Config correct
```bash
node -e '
var s=JSON.parse(require("fs").readFileSync(".claude/settings.json","utf-8"));
console.log("semantic:", s.env.RUVECTOR_SEMANTIC_EMBEDDINGS);
console.log("model:", s.env.RUVECTOR_EMBEDDING_MODEL);
console.log("dim:", s.env.RUVECTOR_EMBEDDING_DIM);
console.log("mcp cf:", !!s.mcpServers["claude-flow"]);
console.log("mcp rv:", !!s.mcpServers.ruvector);
console.log("hooks:", !!s.hooks);
'
```

### Level 3: Memories have real embeddings
```bash
node -e '
var s=JSON.parse(require("fs").readFileSync(".claude/settings.json","utf-8"));
var dim=parseInt(s.env.RUVECTOR_EMBEDDING_DIM)||384;
var d=JSON.parse(require("fs").readFileSync(".ruvector/intelligence.json","utf-8"));
var total=d.memories.length;
var withEmb=d.memories.filter(function(m){return m.embedding && Array.isArray(m.embedding) && m.embedding.length===dim}).length;
var nullEmb=d.memories.filter(function(m){return m.embedding===null}).length;
var dim64=d.memories.filter(function(m){return m.embedding && m.embedding.length===64}).length;
console.log("Total:",total,dim+"d:",withEmb,"64d:",dim64,"NULL:",nullEmb);
if(nullEmb>0) console.log("WARNING: "+nullEmb+" memories have NULL embeddings (invisible to semantic search)");
if(dim64>0) console.log("WARNING: "+dim64+" memories have 64d n-gram (invisible to semantic recall)");
'
```

### Level 4: Learning pipeline live
```bash
npx ruvector hooks remember "validation test" -t test --semantic
npx ruvector hooks recall "validation test" -k 1 --semantic
npx ruvector hooks learn -s "test-state" -a "test-action" -r 0.5 -t agent-routing
npx ruvector hooks learning-stats
```

### Level 5: E2E wiring
```bash
npx ruvector hooks route "test task" --file test.ts
npx @claude-flow/cli@latest daemon status
npx @claude-flow/cli@latest memory search --query "test"
```

---

### Edge/Browser Deployment

The edge stack (`@ruvector/edge-full`) does not use CLI init commands. It initializes via `initAll()` or `initModules()` in JavaScript. No hooks, no daemon, no settings.json. See [edge-full-reference.md](edge-full-reference.md) for initialization patterns. WASM and native runtimes do NOT share state.
