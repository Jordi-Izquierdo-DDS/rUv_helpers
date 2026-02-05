# ruvector hooks Reference (55 Commands)

> **Version:** v0.7 | **Generated:** 2026-01-31 | **Ecosystem:** claude-flow v3.0.0-alpha.190 + ruvector 0.1.96

All signatures from `npx ruvector hooks <command> --help`. Organized by use-case.

## Contents
- Setup & Verification (4)
- Session Lifecycle (3)
- Edit Intelligence (2)
- Command Intelligence (2)
- Memory (3)
- Task Routing (4)
- Learning Engine (6)
- Trajectory Tracking (3)
- Co-Edit Patterns (2)
- Error Learning (2)
- AST Analysis (2)
- Diff Analysis (3)
- Coverage (2)
- Graph Analysis (2)
- Security (1)
- Git Analysis (1)
- Compression (4)
- Streaming (2)
- Data Management (3)
- Intelligence Bootstrap (2)
- Agent & LSP (3)

---

## Setup & Verification

**init** `hooks init [options]`
Initialize hooks in current project.
`--force` Overwrite existing | `--minimal` Basic hooks only | `--fast` Local wrapper (20x faster) | `--no-claude-md` | `--no-permissions` | `--no-env` | `--no-gitignore` | `--no-mcp` | `--no-statusline` | `--pretrain` Run pretrain after | `--build-agents [focus]` Generate agents (quality|speed|security|testing|fullstack)

**verify** `hooks verify [options]`
Verify hooks are working correctly.
`--verbose` Detailed output

**doctor** `hooks doctor [options]`
Diagnose and fix setup issues.
`--fix` Automatically fix issues

**stats** `hooks stats`
Show intelligence statistics. No options.

---

## Session Lifecycle

**session-start** `hooks session-start [options]`
Session start hook.
`--resume` Resume previous session

**session-end** `hooks session-end [options]`
Session end hook.
`--export-metrics` Export metrics

**pre-compact** `hooks pre-compact [options]`
Pre-compact hook (before context window compression).
`--auto` Auto mode

---

## Edit Intelligence

**pre-edit** `hooks pre-edit <file>`
Pre-edit intelligence. Returns context about the file before editing.
Argument: `<file>` File path. No options.

**post-edit** `hooks post-edit [options] <file>`
Post-edit learning. Records edit outcome.
Argument: `<file>` File path
`--success` Edit succeeded | `--error <msg>` Error message

---

## Command Intelligence

**pre-command** `hooks pre-command <command...>`
Pre-command intelligence. Risk assessment before execution.
Argument: `<command...>` Command text. No options.

**post-command** `hooks post-command [options] <command...>`
Post-command learning. Records execution outcome.
Argument: `<command...>` Command text
`--success` Success | `--error <msg>` Error message

---

## Memory

**remember** `hooks remember [options] <content...>`
Store content in vector memory.
Argument: `<content...>` Content to store
`-t, --type <type>` Memory type | `--silent` Suppress output | `--semantic` Use ONNX semantic embeddings (at configured dimension: 384d or 768d, slower, better quality)

**recall** `hooks recall [options] <query...>`
Search vector memory.
Argument: `<query...>` Search query
`-k, --top-k <n>` Results (default: 5) | `--semantic` Use ONNX semantic search

**rag-context** `hooks rag-context [options] <query...>`
Get RAG-enhanced context for a query.
Argument: `<query...>` Query for context
`-k, --top-k <n>` Results (default: 5) | `--rerank` Rerank results by relevance

---

## Task Routing

**route** `hooks route [options] <task...>`
Route task to optimal agent.
Argument: `<task...>` Task description
`--file <file>` File context | `--crate <crate>` Crate context

**route-enhanced** `hooks route-enhanced [options] <task...>`
Enhanced routing using AST, coverage, and diff analysis.
Argument: `<task...>` Task description
`--file <file>` File context

**suggest-context** `hooks suggest-context`
Suggest relevant context for current state. No arguments or options.

**swarm-recommend** `hooks swarm-recommend <task-type>`
Recommend agent configuration for task type.
Argument: `<task-type>` Type of task. No options.

---

## Learning Engine

**learn** `hooks learn [options]`
Record learning outcome and get best action recommendation.
`-s, --state <state>` Current state (e.g., file extension) | `-a, --action <action>` Action taken | `-r, --reward <reward>` Reward (-1 to 1) | `--actions <actions>` Available actions (comma-separated) | `-t, --task <type>` Task type (default: agent-routing)

**batch-learn** `hooks batch-learn [options]`
Record multiple learning experiences in batch.
`-f, --file <file>` JSON file with experiences array | `-d, --data <json>` Inline JSON array | `-t, --task <type>` Task type (default: agent-routing)

**force-learn** `hooks force-learn`
Force an immediate learning cycle. No arguments or options.

**learning-config** `hooks learning-config [options]`
Configure learning algorithms for different tasks.
`-t, --task <type>` Task type (agent-routing, error-avoidance, confidence-scoring, trajectory-learning, context-ranking, memory-recall) | `-a, --algorithm <alg>` Algorithm (q-learning, sarsa, double-q, actor-critic, ppo, decision-transformer, monte-carlo, td-lambda, dqn) | `-l, --learning-rate <rate>` Learning rate (0-1) | `-g, --gamma <gamma>` Discount factor (0-1) | `-e, --epsilon <epsilon>` Exploration rate (0-1) | `--lambda <lambda>` Lambda for TD(lambda) | `--list` List all algorithms | `--show` Show current config

**learning-stats** `hooks learning-stats [options]`
Show learning algorithm statistics and performance.
`--json` Output as JSON

**learning-update** `hooks learning-update [options]`
Manually record a learning experience.
`-t, --task <type>` Task type | `-s, --state <state>` Current state | `-a, --action <action>` Action taken | `-r, --reward <reward>` Reward received | `-n, --next-state <state>` Next state | `-d, --done` Episode is done

---

## Trajectory Tracking

**trajectory-begin** `hooks trajectory-begin [options]`
Begin tracking a new execution trajectory.
`-c, --context <context>` Task or operation context | `-a, --agent <agent>` Agent performing task (default: unknown)

**trajectory-step** `hooks trajectory-step [options]`
Add a step to the current trajectory.
`-a, --action <action>` Action taken | `-r, --result <result>` Result | `--reward <reward>` Reward signal 0-1 (default: 0.5)

**trajectory-end** `hooks trajectory-end [options]`
End trajectory with quality score.
`--success` Task succeeded | `--quality <quality>` Quality score 0-1 (default: 0.5)

---

## Co-Edit Patterns

**coedit-record** `hooks coedit-record [options]`
Record co-edit pattern (files edited together).
`-p, --primary <file>` Primary file | `-r, --related <files...>` Related files

**coedit-suggest** `hooks coedit-suggest [options]`
Get suggested related files based on co-edit patterns.
`-f, --file <file>` Current file | `-k, --top-k <n>` Number of suggestions (default: 5)

---

## Error Learning

**error-record** `hooks error-record [options]`
Record an error and its fix for learning.
`-e, --error <error>` Error message or code | `-x, --fix <fix>` Fix that resolved it | `-f, --file <file>` File where error occurred

**error-suggest** `hooks error-suggest [options]`
Get suggested fixes for an error.
`-e, --error <error>` Error message or code

---

## AST Analysis

**ast-analyze** `hooks ast-analyze [options] <file>`
Parse file AST and extract symbols, imports, complexity.
Argument: `<file>` File path
`--json` JSON output | `--symbols` Show only symbols | `--imports` Show only imports

**ast-complexity** `hooks ast-complexity [options] <files...>`
Get complexity metrics for files.
Argument: `<files...>` Files to analyze
`--threshold <n>` Warn if complexity exceeds threshold (default: 10)

---

## Diff Analysis

**diff-analyze** `hooks diff-analyze [options] [commit]`
Analyze git diff with semantic embeddings and risk scoring.
Argument: `[commit]` Commit hash (defaults to staged changes)
`--json` JSON output | `--risk-only` Show only risk score

**diff-classify** `hooks diff-classify [commit]`
Classify change type (feature, bugfix, refactor, etc.).
Argument: `[commit]` Commit hash. No options.

**diff-similar** `hooks diff-similar [options]`
Find similar past commits based on diff embeddings.
`-k, --top-k <n>` Results (default: 5) | `--commits <n>` Recent commits to search (default: 50)

---

## Coverage

**coverage-route** `hooks coverage-route <file>`
Get coverage-aware agent routing for a file.
Argument: `<file>` File to analyze. No options.

**coverage-suggest** `hooks coverage-suggest <files...>`
Suggest tests for files based on coverage data.
Argument: `<files...>` Files to analyze. No options.

---

## Graph Analysis

**graph-mincut** `hooks graph-mincut [options] <files...>`
Find optimal code boundaries using MinCut (Stoer-Wagner algorithm).
Argument: `<files...>` Files to analyze
`--partitions <n>` Number of partitions (default: 2)

**graph-cluster** `hooks graph-cluster [options] <files...>`
Detect code communities using spectral/Louvain clustering.
Argument: `<files...>` Files to analyze
`--method <type>` Method: spectral, louvain (default: louvain) | `--clusters <n>` Number of clusters, spectral only (default: 3)

---

## Security

**security-scan** `hooks security-scan [options] <files...>`
Parallel security vulnerability scan.
Argument: `<files...>` Files to scan
`--json` JSON output

---

## Git Analysis

**git-churn** `hooks git-churn [options]`
Analyze git churn to find hot spots.
`--days <n>` Days to analyze (default: 30) | `--top <n>` Top N files (default: 10)

---

## Compression (TensorCompress)

**compress** `hooks compress [options]`
Compress pattern storage.
`--force` Recompress all patterns | `--stats` Show stats only

**compress-stats** `hooks compress-stats [options]`
Show TensorCompress statistics.
`--json` JSON output

**compress-store** `hooks compress-store [options]`
Store embedding with adaptive compression.
`-k, --key <key>` Storage key | `-v, --vector <vector>` Vector as JSON array | `-l, --level <level>` Level: none, half, pq8, pq4, binary

**compress-get** `hooks compress-get [options]`
Retrieve a compressed embedding.
`-k, --key <key>` Storage key

---

## Streaming

**subscribe** `hooks subscribe [options]`
Subscribe to real-time learning updates.
`-e, --events <types>` Event types (default: learn,route) | `-f, --format <fmt>` Format: json, text (default: json) | `--poll <ms>` Poll interval (default: 1000)

**watch** `hooks watch [options]`
Watch for changes and auto-learn patterns.
`-p, --path <dir>` Directory (default: .) | `-i, --ignore <patterns>` Ignore patterns (default: node_modules,dist,.git) | `--dry-run` Show what would be learned

---

## Data Management

**export** `hooks export [options]`
Export intelligence data.
`-o, --output <file>` Output file (default: ruvector-export.json) | `--include-all` Include patterns, memories, trajectories

**import** `hooks import [options] <file>`
Import intelligence data.
Argument: `<file>` Import file path
`--merge` Merge with existing (default: replace) | `--dry-run` Preview without saving

---

## Intelligence Bootstrap

**pretrain** `hooks pretrain [options]`
Pretrain by analyzing repository (11 phases, uses agent swarm).
`--depth <n>` Git history depth (default: 100) | `--workers <n>` Parallel workers (default: 4) | `--skip-git` Skip git history | `--skip-files` Skip file structure | `--verbose` Detailed progress

**build-agents** `hooks build-agents [options]`
Generate optimized agent configurations.
`--focus <type>` Focus: quality, speed, security, testing, fullstack (default: quality) | `--output <dir>` Output directory (default: .claude/agents) | `--format <fmt>` Format: yaml, json, md (default: yaml) | `--include-prompts` Include detailed system prompts

---

## Agent & LSP Hooks

**async-agent** `hooks async-agent [options]`
Async agent hook.
`--action <action>` Action | `--agent-id <id>` Agent ID | `--task <task>` Task

**lsp-diagnostic** `hooks lsp-diagnostic [options]`
LSP diagnostic hook.
`--file <file>` File | `--severity <sev>` Severity | `--message <msg>` Message

**track-notification** `hooks track-notification`
Track notification. No arguments or options.
