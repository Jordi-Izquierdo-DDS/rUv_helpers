# claude-flow CLI Reference

> **Version:** v0.7 | **Generated:** 2026-01-31 | **Ecosystem:** claude-flow v3.0.0-alpha.190 + ruvector 0.1.96

31 top-level commands, ~180+ subcommands, 200 MCP tools.
Package: `@claude-flow/cli` (also `claude-flow`). Current: v3.0.0-alpha.190.

## Contents
- Primary Commands (10)
- Advanced Commands (6)
- Utility Commands (6)
- Analysis Commands (3)
- Management Commands (7)
- MCP Tools (200, 23 categories)
- init Flags
- Key Differences from CLAUDE.md

---

## Primary Commands (10)

| Command | Key Subcommands |
|---------|----------------|
| `init` | wizard, check, skills, hooks, upgrade |
| `start` | stop, restart, quick |
| `status` | agents, tasks, memory |
| `agent` | spawn, list, status, stop, metrics, pool, health, logs |
| `swarm` | init, start, status, stop, scale, coordinate |
| `memory` | init, store, retrieve, search, list, delete, stats, configure, cleanup, compress, export, import |
| `task` | create, list, status, cancel, assign, retry |
| `session` | list, save, restore, delete, export, import, current |
| `mcp` | start, stop, status, health, restart, tools, toggle, exec, logs |
| `hooks` | 30 subcommands (pre-task, post-task, pre-edit, post-edit, session-start, session-end, route, model-route, pretrain, build-agents, metrics, worker, progress, statusline, coverage-route, coverage-suggest, coverage-gaps, etc.) |

## Advanced Commands (6)

| Command | Subcommands (count) |
|---------|--------------------|
| `neural` | train, status, patterns, predict, optimize, benchmark, list, export, import (9) |
| `security` | scan, cve, threats, audit, secrets, defend (6) |
| `performance` | benchmark, profile, metrics, optimize, bottleneck (5) |
| `embeddings` | init, generate, search, compare, collections, index, providers, chunk, normalize, hyperbolic, neural, models, cache, warmup, benchmark (15) |
| `hive-mind` | init, spawn, status, task, join, leave, consensus, broadcast, memory, optimize-memory, shutdown (11) |
| `ruvector` | init, setup, import, migrate, status, benchmark, optimize, backup (8) |

## Utility Commands (6)

| Command | Subcommands |
|---------|------------|
| `config` | init, get, set, providers, reset, export, import |
| `doctor` | (flags: --fix, --install, --component, --verbose) |
| `daemon` | start, stop, status, trigger, enable |
| `completions` | bash, zsh, fish, powershell |
| `migrate` | status, run, verify, rollback, breaking |
| `workflow` | run, validate, list, status, stop, template |

## Analysis Commands (3)

| Command | Subcommands |
|---------|------------|
| `analyze` | diff, code, deps, ast, complexity, symbols, imports, boundaries (mincut), modules (louvain), dependencies (graph), circular (11) |
| `route` | task, list-agents, stats, feedback, reset, export, import, coverage (8) |
| `progress` | check, sync, summary, watch |

## Management Commands (7)

| Command | Subcommands (count) |
|---------|--------------------|
| `providers` | list, configure, test, models, usage (5) |
| `plugins` | list, search, install, uninstall, upgrade, toggle, info, create, rate (9) |
| `deployment` | deploy, status, rollback, history, environments, logs (6) |
| `claims` | list, check, grant, revoke, roles, policies (6) |
| `issues` | list, claim, release, handoff, status, stealable, steal, load, rebalance, board (10) |
| `update` | check, all, history, rollback, clear-cache (5) |
| `process` | daemon, monitor, workers, signals, logs (5) |

---

## MCP Tools (200 tools, 23 categories)

Categories: Agent, Swarm, Memory, Config, Hooks, Progress, AIDefence, Task,
Session, Hive-mind, Workflow, Analyze, Embeddings, Claims, Transfer, System,
Terminal, Neural, Performance, Github, DAA, Coordination, Browser.

Register: `claude mcp add claude-flow -- npx -y @claude-flow/cli@latest`

---

## init Flags

| Flag | Description | Default |
|------|-------------|---------|
| `-f, --force` | Overwrite existing config | false |
| `-m, --minimal` | Minimal config | false |
| `--full` | All components | false |
| `--skip-claude` | Skip .claude/ directory | false |
| `--only-claude` | Only .claude/ directory | false |
| `--start-all` | Auto-start daemon, memory, swarm | false |
| `--start-daemon` | Auto-start daemon only | false |
| `--with-embeddings` | Init ONNX embeddings | false |
| `--embedding-model <model>` | ONNX model | all-MiniLM-L6-v2 |

---

## Key Memory Commands

```bash
# Store (--key and --value required, --namespace optional)
npx @claude-flow/cli@latest memory store --key "k" --value "v" --namespace patterns

# Search (semantic vector, --query required)
npx @claude-flow/cli@latest memory search --query "search terms" --limit 5

# Retrieve specific entry
npx @claude-flow/cli@latest memory retrieve --key "k" --namespace patterns

# List entries
npx @claude-flow/cli@latest memory list --namespace patterns --limit 10

# Init/reset
npx @claude-flow/cli@latest memory init --force --verbose
```

---

## Key Differences from CLAUDE.md

CLAUDE.md claims 26 commands / 140+ subcommands. Actual from `--help`:

| | CLAUDE.md | Actual |
|---|-----------|--------|
| Top-level commands | 26 | 31 |
| Total subcommands | 140+ | ~180+ |
| hive-mind subcmds | 6 | 11 |
| embeddings subcmds | 4 | 15 |
| neural subcmds | 5 | 9 |
| plugins subcmds | 5 | 9 |
| MCP tools | not specified | 200 |

**Always use `--help` output. Never trust CLAUDE.md counts.**
