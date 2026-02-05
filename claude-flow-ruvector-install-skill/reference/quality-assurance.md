# Quality Assurance Reference

> **Version:** v0.7 | **Generated:** 2026-01-31 | **Ecosystem:** claude-flow v3.0.0-alpha.190 + ruvector 0.1.96

## Contents
- Why hooks verify Is Not Enough
- 5-Level Deep Validation
- Wiring Smoke Tests
- agentic-qe Integration
- Pretrain Phase Validation
- Ongoing Monitoring

---

## Why hooks verify Is Not Enough

`npx ruvector hooks verify --verbose` checks 8 things:
1. Settings file exists
2. Core hooks configured
3. Advanced hooks configured
4. Env vars present
5. Permissions set
6. Data directory exists
7. Intelligence file exists (size only)
8. Commands execute

It reports **8/8 passed** even when:
- All pretrain memories have NULL embeddings (invisible to search)
- mcpServers is empty `{}`
- ONNX model not downloaded
- agentic-flow not installed (workers silently fail)
- RUVECTOR_MEMORY_BACKEND points to uninstalled package
- Q-learning has zero experiences (routing returns defaults)

**`hooks verify` checks the skeleton. It does NOT check the pipeline works.**

---

## 5-Level Deep Validation

### Level 1: Packages Installed

Use ruvector's built-in tools instead of manual require checks:

```bash
npx @claude-flow/cli@latest --version       # claude-flow present
npx ruvector doctor --verbose                # system health, native bindings, toolchain
npx ruvector install --list                  # all packages: ✓ installed vs ○ available
npx ruvector info                            # version, platform, module availability
```

`ruvector doctor` checks bindings load correctly. `ruvector install --list` shows
the full ecosystem organized by category (Core, Tools & Extensions, Platform Bindings).

### Level 2: Configuration Correct

```bash
node -e '
var s=JSON.parse(require("fs").readFileSync(".claude/settings.json","utf-8"));
var ok=true;
function check(name,val){if(!val){console.log("FAIL:",name);ok=false}else{console.log("OK:",name)}}
check("SEMANTIC_EMBEDDINGS=true", s.env.RUVECTOR_SEMANTIC_EMBEDDINGS==="true");
check("EMBEDDING_MODEL set", !!s.env.RUVECTOR_EMBEDDING_MODEL);
check("EMBEDDING_DIM set", !!s.env.RUVECTOR_EMBEDDING_DIM);
check("hooks present", !!s.hooks && !!s.hooks.PreToolUse);
check("mcpServers.claude-flow", !!s.mcpServers && !!s.mcpServers["claude-flow"]);
check("mcpServers.ruvector", !!s.mcpServers && !!s.mcpServers.ruvector);
var hasSemanticHook=JSON.stringify(s.hooks).includes("--semantic");
check("remember hooks have --semantic", hasSemanticHook);
if(!ok) console.log("\nRun: bash scripts/post-init-fix.sh");
'
```

### Level 3: Memories Have Real Embeddings

```bash
node -e '
var s=JSON.parse(require("fs").readFileSync(".claude/settings.json","utf-8"));
var dim=parseInt(s.env.RUVECTOR_EMBEDDING_DIM)||384;
var d=JSON.parse(require("fs").readFileSync(".ruvector/intelligence.json","utf-8"));
var total=d.memories.length;
var eMatch=d.memories.filter(function(m){return m.embedding&&m.embedding.length===dim}).length;
var e64=d.memories.filter(function(m){return m.embedding&&m.embedding.length===64}).length;
var eNull=d.memories.filter(function(m){return m.embedding===null}).length;
console.log("Memories:",total,"| "+dim+"d:",eMatch,"| 64d:",e64,"| NULL:",eNull);
if(eNull>0)console.log("FAIL: "+eNull+" memories invisible to semantic search. Re-pretrain needed.");
if(eMatch===0&&total>0)console.log("FAIL: No "+dim+"d memories. Check RUVECTOR_SEMANTIC_EMBEDDINGS.");
if(eMatch>0)console.log("OK: "+eMatch+" memories with full "+dim+"d embeddings");
'
```

### Level 4: Learning Pipeline Live

```bash
# Store and retrieve
npx ruvector hooks remember "QA validation test" -t qa --semantic 2>&1 | grep -o '"semantic":true'
npx ruvector hooks recall "QA validation" -k 1 --semantic 2>&1 | grep -o '"score"'

# Learn and check
npx ruvector hooks learn -s "qa-test" -a "tester" -r 0.8 -t agent-routing 2>&1 | grep -o '"success":true'
npx ruvector hooks learning-stats 2>&1 | head -5
```

### Level 5: E2E Flow

```bash
npx ruvector hooks route "fix a bug" --file src/test.ts 2>&1
npx @claude-flow/cli@latest daemon status 2>&1
npx @claude-flow/cli@latest memory search --query "test" 2>&1
npx ruvector hooks session-start --resume 2>&1
npx ruvector hooks suggest-context 2>&1
```

---

## Wiring Smoke Tests

Quick commands to check each wire in the pipeline:

| Wire | Test | Expected |
|------|------|----------|
| ONNX model available | `npx ruvector hooks remember "test" --semantic --silent` | `{"success":true,"semantic":true}` |
| Semantic recall works | `npx ruvector hooks recall "test" -k 1 --semantic` | Results with `"score"` field |
| Q-learning records | `npx ruvector hooks learn -s x -a y -r 0.5` | `"success":true` |
| Route responds | `npx ruvector hooks route "task"` | JSON with recommended agent |
| Claude-flow daemon | `npx @claude-flow/cli@latest daemon status` | Shows "running" |
| MCP claude-flow | Check settings.json mcpServers | Has "claude-flow" key |
| MCP ruvector | Check settings.json mcpServers | Has "ruvector" key |
| Fast wrapper works | `.claude/ruvector-fast.sh hooks stats` | Shows stats |

---

## agentic-qe Integration

[agentic-qe](https://github.com/proffesor-for-testing/agentic-qe) (v3.3.5)
is a production QE platform built on claude-flow + ruvector with 51 agents,
99 skills, 82 MCP tools, and 6,664 tests.

### For Validation

```bash
npm install -g agentic-qe@latest
npx agentic-qe init
npx agentic-qe test --suite integration
```

Key integration test suites: tinydancer, consensus, mincut-queen,
reasoning-bank, coherence-wasm.

### For Learning

```bash
npx agentic-qe export --format ruvector-batch
npx ruvector hooks batch-learn -f agentic-qe-results.json -t error-avoidance
```

---

## Pretrain Phase Validation

After `npx ruvector hooks pretrain --verbose`, check each phase produced data:

| Phase | Check | Command |
|-------|-------|---------|
| 1 File structure | Patterns populated | `node -e 'var d=JSON.parse(require("fs").readFileSync(".ruvector/intelligence.json"));console.log("patterns:",Object.keys(d.patterns).length)'` |
| 2 Git history | Co-edits | `node -e 'var d=JSON.parse(require("fs").readFileSync(".ruvector/intelligence.json"));console.log("coedits:",d.file_sequences.length)'` |
| 3 Key files | Memories with embeddings | Level 3 check above |
| 4 Dir mappings | dirPatterns | `node -e 'var d=JSON.parse(require("fs").readFileSync(".ruvector/intelligence.json"));console.log("dirs:",Object.keys(d.dirPatterns).length)'` |
| 8 Neural caps | Detected | `npx ruvector hooks stats` shows attention/gnn |
| 10 Learning | Configs set | `npx ruvector hooks learning-config --show` |
| 11 TensorCompress | Initialized | `npx ruvector hooks compress-stats` |

---

## Ongoing Monitoring

### After Every Session
```bash
npx ruvector hooks stats    # should show growing numbers
```

### Weekly
```bash
bash scripts/validate-setup.sh
npx ruvector hooks learning-stats    # check convergence scores
npx ruvector hooks compress-stats    # check compression efficiency
```

### Before Any Upgrade
```bash
bash scripts/pre-upgrade.sh
```
