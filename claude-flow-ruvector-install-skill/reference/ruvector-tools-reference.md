# ruvector Tools Reference (Non-Hooks)

> **Version:** v0.7 | **Generated:** 2026-01-31 | **Ecosystem:** claude-flow v3.0.0-alpha.190 + ruvector 0.1.96

All signatures from `npx ruvector <command> --help`. Covers top-level commands
and all subsystem commands (embed, workers, gnn, attention, native, mcp).

## Contents
- Top-Level Commands (24 total; 16 non-subsystem + 7 subsystem groupings + help)
- embed Subsystem (5)
- workers Subsystem (14)
- gnn Subsystem (4)
- attention Subsystem (5)
- native Subsystem (4)
- mcp Subsystem (2)

---

## Top-Level Commands (16 non-subsystem)

> **Note:** ruvector has 24 top-level commands total (including `help`). This section documents the 16 non-subsystem commands. The remaining 7 subsystem groupings (hooks, workers, embed, gnn, attention, native, mcp) are documented in their own sections below.

**create** `ruvector create [options] <path>`
Create a new vector database.
Argument: `<path>` Database path
`-d, --dimension <number>` Vector dimension (default: 384) | `-m, --metric <type>` Distance metric: cosine|euclidean|dot (default: cosine)

**insert** `ruvector insert [options] <database> <file>`
Insert vectors from JSON file.
Arguments: `<database>` DB path, `<file>` JSON file with vectors

**search** `ruvector search [options] <database>`
Search for similar vectors.
Argument: `<database>` DB path
`-v, --vector <json>` Query vector as JSON array | `-k, --top-k <number>` Results (default: 10) | `-t, --threshold <number>` Similarity threshold (default: 0.0) | `-f, --filter <json>` Metadata filter as JSON

**stats** `ruvector stats <database>`
Show database statistics.
Argument: `<database>` DB path. No options.

**benchmark** `ruvector benchmark [options]`
Run performance benchmarks. No required arguments.

**info** `ruvector info`
Show ruvector system information. No arguments or options.

**install** `ruvector install [options] [packages...]`
Install optional @ruvector/* packages.
`-a, --all` Install all | `-l, --list` List available | `-i, --interactive` Interactive selection

**doctor** `ruvector doctor [options]`
Check system health and dependencies. **System-level** (not hooks).
`-v, --verbose` Detailed info

**setup** `ruvector setup [options]`
Show installation and setup instructions. **Documentation only, creates nothing.**
`--rust` Rust instructions | `--npm` npm instructions | `--all` All instructions

**export** `ruvector export [options] <database>`
Export database to file.
Argument: `<database>` DB path

**import** `ruvector import [options] <file>`
Import database from file.
Argument: `<file>` Import file path

**graph** `ruvector graph [options]`
Graph database operations (requires @ruvector/graph-node).
`-q, --query <cypher>` Cypher query | `-c, --create <label>` Create node | `-p, --properties <json>` Node properties | `-r, --relate <spec>` Create relationship (from:rel:to) | `--info` Show graph stats

**router** `ruvector router [options]`
AI semantic router operations (requires @ruvector/router).

**server** `ruvector server [options]`
Start RuVector HTTP/gRPC server.

**cluster** `ruvector cluster [options]`
Distributed cluster operations.

**demo** `ruvector demo [options]`
Run interactive demo and tutorials.
`--basic` Basic vector ops | `--gnn` GNN search | `--graph` Graph DB | `--benchmark` Performance | `-i, --interactive` Interactive mode

---

## embed Subsystem (5 commands)

`ruvector embed` — Generate embeddings from text (ONNX + Adaptive LoRA)

**text** `embed text [options] <text>`
Embed a text string.
Argument: `<text>` Text to embed
`--adaptive` Use adaptive embedder with LoRA | `--domain <domain>` Domain for prototype learning | `-o, --output <file>` Output file

**adaptive** `embed adaptive [options]`
Adaptive embedding with Micro-LoRA optimization.
`--stats` Show statistics | `--consolidate` Run EWC consolidation | `--reset` Reset adaptive weights | `--export <file>` Export weights | `--import <file>` Import weights

**benchmark** `embed benchmark [options]`
Benchmark base vs adaptive embeddings.
`--iterations <n>` Iterations (default: 10)

**optimized** `embed optimized [options] [text]`
Optimized ONNX embedder with LRU caching.
`--cache-size <n>` Cache size (default: 512) | `--stats` Cache stats | `--clear-cache` Clear caches | `--benchmark` Run cache benchmark

**neural** `embed neural [options]`
Neural embedding substrate (frontier AI concepts).
`--health` Neural substrate health | `--consolidate` Run memory consolidation (Dream Cycles) | `--calibrate` Calibrate coherence baseline | `--swarm-status` Swarm coordination status | `--drift-stats` Semantic drift stats | `--memory-stats` Memory physics stats | `--demo` Interactive neural demo | `--dimension <n>` Embedding dimension (default: 384)

---

## workers Subsystem (14 commands)

`ruvector workers` — Background analysis workers (delegates to agentic-flow@alpha via npx).

**dispatch** `workers dispatch <prompt...>`
Dispatch background worker. Prompt must contain a trigger keyword.
Argument: `<prompt...>` Prompt with trigger (ultralearn, optimize, audit, map, etc.)

**status** `workers status [workerId]`
Show worker status dashboard.
Argument: `[workerId]` Optional specific worker ID

**results** `workers results [options]`
Show worker analysis results.
`--json` JSON output

**triggers** `workers triggers`
List available trigger keywords. No arguments.

**stats** `workers stats`
Show worker statistics (24h). No arguments.

**cleanup** `workers cleanup [options]`
Cleanup old worker records.
`--keep <days>` Keep records for N days (default: 7)

**cancel** `workers cancel <workerId>`
Cancel a running worker.
Argument: `<workerId>` Worker ID

**presets** `workers presets`
List available presets: quick-scan, deep-analysis, security-scan, learning, api-docs, test-analysis.

**phases** `workers phases`
List available phase executors. 24 phases: file-discovery, security-analysis, etc.

**create** `workers create [options] <name>`
Create a custom worker from preset.
Argument: `<name>` Worker name
`--preset <preset>` Base preset | `--triggers <triggers>` Trigger keywords (comma-separated)

**run** `workers run [options] <name>`
Run a custom worker.
Argument: `<name>` Worker name
`--path <path>` Target path (default: .)

**custom** `workers custom`
List registered custom workers. No arguments.

**init-config** `workers init-config [options]`
Generate example workers.yaml config file.
`--force` Overwrite existing

**load-config** `workers load-config [options]`
Load custom workers from YAML config.
`--file <file>` Config file path (default: workers.yaml)

---

## gnn Subsystem (4 commands)

`ruvector gnn` — Graph Neural Network operations (requires @ruvector/gnn).

**layer** `gnn layer [options]`
Create and test a GNN layer.
`-i, --input-dim <n>` Input dimension | `-h, --hidden-dim <n>` Hidden dimension | `-a, --heads <n>` Attention heads (default: 4) | `-d, --dropout <n>` Dropout rate (default: 0.1) | `--test` Run test forward pass | `-o, --output <file>` Save config to JSON

**compress** `gnn compress [options]`
Compress embeddings using adaptive tensor compression.
`-f, --file <path>` Input JSON with embeddings | `-l, --level <type>` Level: none|half|pq8|pq4|binary (default: auto) | `-a, --access-freq <n>` Access frequency 0-1 (default: 0.5) | `-o, --output <file>` Output file

**search** `gnn search [options]`
Differentiable search with soft attention.
`-q, --query <json>` Query vector | `-c, --candidates <file>` Candidates JSON file | `-k, --top-k <n>` Results (default: 5) | `-t, --temperature <n>` Softmax temperature (default: 1.0)

**info** `gnn info`
Show GNN module information. No arguments.

---

## attention Subsystem (5 commands)

`ruvector attention` — High-performance attention mechanisms (requires @ruvector/attention).

**compute** `attention compute [options]`
Compute attention over input vectors.
`-q, --query <json>` Query vector | `-k, --keys <file>` Keys file | `-v, --values <file>` Values file | `-t, --type <type>` Type: dot|multi-head|flash|hyperbolic|linear (default: dot) | `-h, --heads <n>` Heads for multi-head (default: 4) | `-d, --head-dim <n>` Head dim (default: 64) | `--curvature <n>` Hyperbolic curvature (default: 1.0) | `-o, --output <file>` Output file

**benchmark** `attention benchmark [options]`
Benchmark attention mechanisms.
`-d, --dimension <n>` Vector dim (default: 256) | `-n, --num-vectors <n>` Vectors (default: 100) | `-i, --iterations <n>` Iterations (default: 100) | `-t, --types <list>` Types to benchmark (default: dot,flash,linear)

**hyperbolic** `attention hyperbolic [options]`
Hyperbolic geometry operations (Poincare ball model).
`-a, --action <type>` Action: exp-map|log-map|distance|project|mobius-add | `-v, --vector <json>` Input vector | `-b, --vector-b <json>` Second vector | `-c, --curvature <n>` Curvature (default: 1.0) | `-o, --origin <json>` Origin point

**info** `attention info`
Show attention module information. No arguments.

**list** `attention list [options]`
List all available attention mechanisms.
`-v, --verbose` Detailed info

---

## native Subsystem (4 commands)

`ruvector native` — Native workers with deep ONNX/VectorDB integration (no external deps).

**run** `native run [options] <type>`
Run a native worker.
Argument: `<type>` Worker type: security, analysis, learning
`--path <path>` Target path (default: .) | `--json` JSON output

**benchmark** `native benchmark [options]`
Run performance benchmark suite.
`--path <path>` Target path (default: .) | `--embeddings-only` Only embeddings | `--workers-only` Only workers

**list** `native list`
List available native worker types. No arguments.

**compare** `native compare [options]`
Compare native vs agentic-flow workers.
`--path <path>` Target path (default: .) | `--iterations <n>` Iterations (default: 5)

---

## mcp Subsystem (2 commands)

`ruvector mcp` — MCP (Model Context Protocol) server for Claude Code integration.

**start** `mcp start`
Start the RuVector MCP server. No arguments.

**info** `mcp info`
Show MCP server information and setup instructions. No arguments.

### MCP Tools (30+)

hooks_stats, hooks_route, hooks_route_enhanced, hooks_remember, hooks_recall,
hooks_init, hooks_pretrain, hooks_build_agents, hooks_verify, hooks_doctor,
hooks_export, hooks_ast_analyze, hooks_ast_complexity, hooks_diff_analyze,
hooks_diff_classify, hooks_coverage_route, hooks_coverage_suggest,
hooks_graph_mincut, hooks_graph_cluster, hooks_security_scan,
hooks_rag_context, hooks_git_churn, hooks_attention_info, hooks_gnn_info.

Resources: `ruvector://intelligence/stats`, `ruvector://intelligence/patterns`, `ruvector://intelligence/memories`

Register: `claude mcp add ruvector -- npx -y ruvector mcp start`
