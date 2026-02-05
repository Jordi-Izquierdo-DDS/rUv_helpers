# Daily Workflow Reference

> **Version:** v0.7 | **Generated:** 2026-01-31 | **Ecosystem:** claude-flow v3.0.0-alpha.190 + ruvector 0.1.96
>
> This workflow covers CLI-based server-side development. For browser/edge deployment, see [edge-full-reference.md](edge-full-reference.md) (WASM initialization, P2P transports, CLI vs Edge decision guide).

Post-setup daily usage patterns for claude-flow v3alpha + ruvector. Assumes
the full init sequence from SKILL.md has been completed and validated.

## Contents

- [Session Start](#session-start)
- [Before Each Task](#before-each-task)
- [After Each Task](#after-each-task)
- [Session End (Critical -- Memory Sync)](#session-end-critical----memory-sync)
- [Weekly Maintenance](#weekly-maintenance)
- [Troubleshooting Quick Reference](#troubleshooting-quick-reference)

---

## Session Start

Restore previous state and verify system health before beginning work.

```bash
# Restore previous session state
npx @claude-flow/cli@latest session restore --latest
npx ruvector hooks session-start --session-id "$(date +%Y%m%d)"

# Check system health (both systems)
npx ruvector doctor -v
npx @claude-flow/cli@latest doctor

# Verify daemon is running
npx @claude-flow/cli@latest daemon status

# Quick intelligence check
npx ruvector hooks stats
```

If `daemon status` shows stopped, start it:
```bash
npx @claude-flow/cli@latest daemon start
```

If `hooks stats` shows 0 memories, pretrain may not have completed. See
[troubleshooting.md](troubleshooting.md) scenario 1.

---

## Before Each Task

Search memory for relevant patterns and get routing recommendations before
starting any non-trivial work.

```bash
# Search memory for relevant patterns (both stores)
npx @claude-flow/cli@latest memory search --query "[task keywords]"
npx ruvector hooks recall "[task keywords]" -k 3 --semantic

# Get routing recommendation (agent + model tier)
npx @claude-flow/cli@latest hooks pre-task --description "[task description]"

# Get ruvector routing recommendation
npx ruvector hooks route "[task description]"
```

### Routing interpretation

There are 4 independent routing systems. They give different answers because
they serve different purposes:

| Router | Use when | Command |
|--------|----------|---------|
| claude-flow `pre-task` | Spawning claude-flow agents (model tier selection) | `npx @claude-flow/cli@latest hooks pre-task --description "..."` |
| ruvector `hooks route` | General agent-type selection (keyword-based, Q-learning) | `npx ruvector hooks route "..."` |
| ruvector `hooks route-enhanced` | File-context-aware routing (AST + coverage signals) | `npx ruvector hooks route-enhanced "..." --file "path/to/file"` |
| agentic-qe `hooks route` | QE-specific tasks (test/coverage/quality/security) | `npx agentic-qe hooks route --task "..."` |

**Practical rule:** Use `claude-flow pre-task` for model-tier decisions. Use
`ruvector hooks route` for general agent selection. Use `agentic-qe hooks route`
when the task involves testing, coverage, quality, or security.

Q-learning confidence starts at 0 and improves over time. Until you have many
recorded experiences, routing returns hardcoded defaults. This is expected.

---

## After Each Task

Record what worked so the learning pipeline improves over time.

```bash
# Store successful patterns
npx @claude-flow/cli@latest memory store \
  --key "[pattern-name]" \
  --value "[what worked and why]" \
  --namespace patterns

npx ruvector hooks remember "[what worked]" -t pattern --semantic

# Record task completion
npx ruvector hooks post-task --task-id "[id]" --success true

# Train neural patterns if the task was significant (touched multiple files)
npx ruvector hooks post-edit --file "[main-file]" --train-neural true
```

### What counts as "significant" for neural training

- Bug fix touching 3+ files
- New feature implementation
- Refactoring across modules
- Performance optimization with measurable results
- Security fix

Single-line changes, config tweaks, and documentation updates do not need
neural training.

---

## Session End (Critical -- Memory Sync)

This is the most important daily step. Both systems maintain separate memory
stores that do not automatically synchronize. The manual bridge below is the
only cross-system sync mechanism until automated sync is implemented.

### The 4 memory stores

| System | Location | Format |
|--------|----------|--------|
| claude-flow | `.swarm/memory.db` | SQLite (sql.js WASM) |
| ruvector | `.ruvector/intelligence.json` | JSON file |
| agentic-qe | `.agentic-qe/memory.db` | SQLite (better-sqlite3 native) |
| agentdb | Configurable | Graph DB (Cypher) |

None of these sync automatically. Patterns learned in ruvector are invisible
to claude-flow, and vice versa.

### Session end sequence

```bash
# 1. Export ruvector session metrics
npx ruvector hooks session-end --export-metrics true

# 2. Export claude-flow state
npx @claude-flow/cli@latest hooks session-end \
  --generate-summary true \
  --persist-state true \
  --export-metrics true

# 3. Manual memory bridge (ruvector -> claude-flow)
# Copy key ruvector learnings to claude-flow memory:
# If `hooks intelligence stats --json` is not available, use `npx ruvector hooks stats --json` instead.
PATTERNS=$(npx ruvector hooks intelligence stats --json 2>/dev/null | jq -r '.patterns // empty')
if [ -n "$PATTERNS" ]; then
  npx @claude-flow/cli@latest memory store \
    --key "ruvector-sync-$(date +%Y%m%d)" \
    --value "$PATTERNS" \
    --namespace "cross-sync"
fi

# 4. Save session for next restore
npx @claude-flow/cli@latest session save --name "session-$(date +%Y%m%d)"
```

If `jq` is not installed, skip the inline bridge and use `bash scripts/memory-sync.sh` instead (requires only `node`).
The two systems will continue learning independently without the bridge.
The bridge ensures claude-flow agents can recall patterns discovered via ruvector hooks.

For comprehensive bidirectional sync with backups and dry-run, use `bash scripts/memory-sync.sh` instead. Run `bash scripts/memory-sync.sh --help` for options. Note: synced memories get NULL embeddings — run `npx ruvector hooks remember "re-embed" --semantic` afterward.

---

## Weekly Maintenance

Run these periodically (every 5-7 days or after major feature work).

### Learning consolidation

```bash
# Deep learning consolidation (SONA EWC++ to prevent forgetting)
# Use native command (worker dispatch --trigger consolidate is broken):
npx ruvector native run learning --path .
npx ruvector hooks worker dispatch --trigger optimize

# Force a SONA dream cycle
npx ruvector embed adaptive --consolidate
```

> **Known issue:** `hooks worker dispatch --trigger consolidate` may fail
> silently in current versions (prints agentic-flow help instead of running the
> task). Workaround: use `npx ruvector native run learning --path .` instead,
> which is shown above as the primary command. The original dispatch command is
> kept in this section for reference when the bug is fixed.

### Codebase mapping refresh

```bash
# Update the codebase map (after many file changes)
npx ruvector hooks worker dispatch --trigger map

# If dispatch fails, re-pretrain instead:
npx ruvector hooks pretrain --verbose --depth 50
```

### Security audit

```bash
# ruvector native security scan (no API key needed)
npx ruvector native run security --path .

# claude-flow security scan
npx @claude-flow/cli@latest security scan
```

### Performance benchmark

```bash
# Run full benchmark suite
npx @claude-flow/cli@latest performance benchmark --suite all

# Embedding performance check
npx ruvector embed benchmark --iterations 10
```

### Memory cleanup

```bash
# Check memory stats
npx @claude-flow/cli@latest memory stats
npx ruvector hooks stats

# Compress if memory is large
npx @claude-flow/cli@latest memory compress
```

---

## Troubleshooting Quick Reference

Common daily issues. For the full troubleshooting guide, see
[troubleshooting.md](troubleshooting.md).

### "Database not initialized" from claude-flow memory

```bash
npx @claude-flow/cli@latest memory init --force
```

This should have been done during init (Step 1 of INIT-SEQUENCE). If it
recurs, the `.swarm/memory.db` file may have been deleted.

### Semantic recall returns empty despite memories existing

**Cause:** Embeddings are NULL (pretrain ran before post-init-fix) or dimension
mismatch.

```bash
# Check for NULL embeddings
node -e '
  var d = JSON.parse(require("fs").readFileSync(".ruvector/intelligence.json"));
  var nulls = (d.memories || []).filter(function(m) { return m.embedding === null; }).length;
  console.log("NULL embeddings:", nulls, "of", (d.memories || []).length);
'
```

If NULL count > 0, re-pretrain:
```bash
bash scripts/post-init-fix.sh
cp .ruvector/intelligence.json .ruvector/intelligence.json.bak
echo '{}' > .ruvector/intelligence.json
npx ruvector hooks pretrain --verbose
```

### Routing always returns confidence 0

This is expected behavior when Q-learning has not accumulated enough
experiences. Keep recording task outcomes with `hooks post-task` and
`hooks post-edit`. Confidence will increase over time.

To seed Q-learning with initial data:
```bash
npx ruvector hooks batch-learn -d '[
  {"state":"ts-file","action":"coder","reward":0.9},
  {"state":"test-file","action":"tester","reward":0.9}
]' -t agent-routing
```

The `-d` flag takes an inline JSON array of experiences (not a directory path).
Use `-f <file>` to load from a file instead. See
[wiring-and-validation.md](wiring-and-validation.md) for the full seeding example.

### Daemon stopped unexpectedly

```bash
npx @claude-flow/cli@latest daemon status
npx @claude-flow/cli@latest daemon start
```

Check daemon logs if it keeps stopping:
```bash
npx @claude-flow/cli@latest daemon logs
```

### settings.json overwritten

If another tool overwrote settings.json, losing hooks or MCP config:
```bash
# Re-run init (preserves existing data if no --force)
npx @claude-flow/cli@latest init --full --start-all --with-embeddings
npx ruvector hooks init --fast
bash scripts/post-init-fix.sh
```

### Workers dispatch prints help instead of running

This is a known bug. The argument forwarding from `ruvector workers dispatch`
to agentic-flow is broken. Use native workers instead:
```bash
npx ruvector native run security --path .
npx ruvector native run analysis --path .
npx ruvector native run learning --path .
```

### Do NOT (daily reminders)

1. **Do not pretrain without post-init-fix.** Always ensure
   `RUVECTOR_SEMANTIC_EMBEDDINGS=true` is in settings.json before pretrain.
2. **Do not trust `hooks verify` alone.** It passes with 8/8 even when the
   pipeline is broken. Run `bash scripts/validate-setup.sh` periodically.
3. **Do not skip session-end.** Unsaved patterns are lost on restart.
4. **Do not modify `node_modules/`.** Use the FOX method
   (see [fox-method.md](fox-method.md)).
5. **Do not assume workers dispatch works.** Use `native run` as the
   reliable alternative.

---

> **Version:** v0.7 | **Generated:** 2026-01-31 | **Ecosystem:** claude-flow v3.0.0-alpha.190 + ruvector 0.1.96
