# @claude-flow/* Packages -- Deep Analysis

> **Version:** v0.7 | **Generated:** 2026-01-31 | **Ecosystem:** claude-flow v3.0.0-alpha.190 + ruvector 0.1.96
>
> All data sourced from `npm view`, `npx @claude-flow/cli@latest --help`, and published metadata.

---

## Contents

- [Summary Table](#summary-table)
  - [CLI Dependency Graph](#cli-dependency-graph)
- [@claude-flow/shared](#1-claude-flowshared)
  - [Version & Status](#version--status)
  - [Dependencies](#dependencies)
  - [Exports / API Surface](#exports--api-surface)
  - [Configuration](#configuration)
  - [Integration Points](#integration-points)
  - [CLI Commands](#cli-commands)
  - [MCP Tools](#mcp-tools)
  - [Overlap with RuVector](#overlap-with-ruvector)
- [@claude-flow/memory](#2-claude-flowmemory)
- [@claude-flow/neural](#3-claude-flowneural)
- [@claude-flow/hooks](#4-claude-flowhooks)
- [@claude-flow/mcp](#5-claude-flowmcp)
- [@claude-flow/embeddings](#6-claude-flowembeddings)
- [@claude-flow/providers](#7-claude-flowproviders)
- [@claude-flow/plugins](#8-claude-flowplugins)
- [@claude-flow/security](#9-claude-flowsecurity)
- [@claude-flow/claims](#10-claude-flowclaims)
- [@claude-flow/browser](#11-claude-flowbrowser)
- [@claude-flow/aidefence](#12-claude-flowaidefence)
- [@claude-flow/testing](#13-claude-flowtesting)
- [@claude-flow/plugin-agentic-qe](#14-claude-flowplugin-agentic-qe)
- [@claude-flow/plugin-gastown-bridge](#15-claude-flowplugin-gastown-bridge)
- [Cross-Cutting Analysis](#cross-cutting-analysis)
  - [Dependency Layers](#dependency-layers)
  - [RuVector Integration Points](#ruvector-integration-points)
  - [Packages That Register MCP Tools](#packages-that-register-mcp-tools)
  - [Package Health Assessment](#package-health-assessment)
  - [Key Architectural Insight](#key-architectural-insight)
  - [Recommendations for Skill Authors](#recommendations-for-skill-authors)

---

## Summary Table

| # | Package | Latest Version | Versions | Unpacked Size | Status | Bundled in CLI? | Has MCP Tools? |
|---|---------|---------------|----------|---------------|--------|-----------------|----------------|
| 1 | `@claude-flow/shared` | 3.0.0-alpha.1 | 1 | 11.2 MB | Alpha (foundation) | **Direct dep** | No (provides infra) |
| 2 | `@claude-flow/memory` | 3.0.0-alpha.2 (v3alpha) | 2 | 5.9 MB | Alpha | NOT bundled | No (used by hooks/neural) |
| 3 | `@claude-flow/neural` | 3.0.0-alpha.7 | 3 | 1.7 MB | Alpha | NOT bundled | No (used by hooks) |
| 4 | `@claude-flow/hooks` | 3.0.0-alpha.7 (alpha) | 3 | 590 KB | Alpha | NOT bundled | Yes (via ./mcp export) |
| 5 | `@claude-flow/mcp` | 3.0.0-alpha.8 | 3 | 651 KB | Alpha | **Direct dep** | Yes (IS the MCP server) |
| 6 | `@claude-flow/embeddings` | 3.0.0-alpha.12 (v3alpha) | 7 | 319 KB (v12) | Alpha, active | **Optional dep** | No |
| 7 | `@claude-flow/providers` | 3.0.0-alpha.1 | 1 | 450 KB | Alpha (stale) | NOT bundled | No |
| 8 | `@claude-flow/plugins` | 3.0.0-alpha.2 (v3alpha) | 2 | 1.7 MB | Alpha | NOT bundled | No (SDK only) |
| 9 | `@claude-flow/security` | 3.0.0-alpha.1 | 1 | 2.3 MB | Alpha (stale) | NOT bundled | No |
| 10 | `@claude-flow/claims` | 3.0.0-alpha.8 | 3 | 793 KB | Alpha, active | NOT bundled | Yes (./api/mcp-tools) |
| 11 | `@claude-flow/browser` | 3.0.0-alpha.2 (alpha) | 2 | 574 KB | Alpha | NOT bundled | Yes (./mcp-tools) |
| 12 | `@claude-flow/aidefence` | 3.0.2 | 4 | 94 KB | Stable(ish) | **Direct dep** | No |
| 13 | `@claude-flow/testing` | 3.0.0-alpha.2 (v3alpha) | 2 | 1.6 MB | Alpha | NOT bundled | No |
| 14 | `@claude-flow/plugin-agentic-qe` | 3.0.0-alpha.4 | 4 | 289 KB | Alpha, active | NOT bundled | No |
| 15 | `@claude-flow/plugin-gastown-bridge` | 0.1.1 | 2 | 2.3 MB | Pre-alpha | **Optional dep** | Yes (20 tools) |

### CLI Dependency Graph

The main CLI (`@claude-flow/cli@3.0.0-alpha.190`) has this dependency structure:

```
@claude-flow/cli (direct dependencies)
  |- @claude-flow/shared        (direct dep)
  |- @claude-flow/mcp           (direct dep)
  |- @claude-flow/aidefence     (direct dep)
  |- @noble/ed25519             (direct dep)

@claude-flow/cli (optional dependencies)
  |- @claude-flow/embeddings    (optional)
  |- @claude-flow/plugin-gastown-bridge (optional)
  |- @ruvector/sona             (optional)
  |- @ruvector/attention        (optional)
  |- @ruvector/learning-wasm    (optional)
```

Packages NOT in CLI dependency tree (must be installed separately):
- `@claude-flow/memory`
- `@claude-flow/neural`
- `@claude-flow/hooks`
- `@claude-flow/providers`
- `@claude-flow/plugins`
- `@claude-flow/security`
- `@claude-flow/claims`
- `@claude-flow/browser`
- `@claude-flow/testing`
- `@claude-flow/plugin-agentic-qe`

**Key insight**: The CLI reimplements much of the functionality from these packages internally. The standalone packages exist for programmatic/library use, but the CLI does NOT import most of them. Instead, CLI commands like `memory`, `neural`, `hooks`, `security`, `claims`, `providers`, `plugins`, `embeddings` are all implemented within the CLI codebase itself.

---

## 1. @claude-flow/shared

**Description**: Shared utilities, types, and core infrastructure -- the foundation module used by all other @claude-flow packages.

### Version & Status
- **Latest**: 3.0.0-alpha.1 (v3alpha tag)
- **Versions**: 1 (no updates since initial publish)
- **Unpacked size**: 11.2 MB (541 files -- largest package, contains all type definitions)
- **Status**: Alpha. Foundation package. Stale (no updates in 25 days).

### Dependencies
```json
{
  "sql.js": "^1.10.3"
}
```
No @claude-flow or @ruvector dependencies. This is the leaf of the dependency tree.

### Exports / API Surface

```
.              -> dist/index.js          (main barrel export)
./types        -> dist/types/index.js    (AgentId, TaskDefinition, MemoryEntry, SwarmEvent, MCPTool, etc.)
./core         -> dist/core/index.js     (ConfigLoader, ConfigValidator, IAgent, ITask, IMemory, ICoordinator interfaces)
./events       -> dist/events/index.js   (EventBus, EventCoordinator -- event sourcing per ADR-007)
./hooks        -> dist/hooks/index.js    (hooks system base types)
./mcp          -> dist/mcp/index.js      (MCP server, transport, connection pool, tool registry infrastructure)
./security     -> dist/security/index.js (security utility types)
./resilience   -> dist/resilience/index.js (retry, circuit breaker, rate limiter patterns)
```

Key types exported: `AgentId`, `AgentState`, `AgentType`, `AgentStatus`, `AgentCapabilities`, `AgentMetrics`, `TaskId`, `TaskDefinition`, `TaskType`, `TaskStatus`, `TaskPriority`, `MemoryEntry`, `MemoryType`, `SearchResult`, `SwarmId`, `SwarmStatus`, `SwarmEvent`, `CoordinatorConfig`, `MCPTool`, `MCPRequest`, `MCPResponse`.

Key classes: `EventBus`, `EventCoordinator`, `ConfigLoader`, `ConfigValidator`.

Key interfaces: `IAgent`, `ITask`, `IMemory`, `ICoordinator`, `IEventHandler`.

### Configuration
- `ConfigLoader.load('./config.json')` -- loads from JSON file
- `ConfigLoader.loadFromEnv()` -- loads from environment variables
- `ConfigValidator.validate(config)` -- validates against schema
- `defaultConfig()` -- returns default configuration object

### Integration Points
- **Foundation package**: All other @claude-flow packages list it as a peer dependency
- The CLI bundles it as a direct dependency
- Provides the shared type system and interface contracts

### CLI Commands
None directly. Provides types consumed by all commands.

### MCP Tools
None directly. Provides MCP infrastructure (`./mcp` export) used by `@claude-flow/mcp`.

### Overlap with RuVector
None. This is pure TypeScript types/utilities. No ML/vector operations.

---

## 2. @claude-flow/memory

**Description**: AgentDB unification, HNSW indexing, vector search, hybrid SQLite+AgentDB backend (ADR-009).

### Version & Status
- **Latest (npm)**: 3.0.0-alpha.1
- **v3alpha tag**: 3.0.0-alpha.2
- **Versions**: 2
- **Unpacked size**: 5.9 MB (214 files)
- **Status**: Alpha. Not updated since initial publish day.

### Dependencies
```json
{
  "sql.js": "^1.10.3",
  "agentdb": "alpha",
  "better-sqlite3": "^11.0.0"
}
```
No @claude-flow peer deps. No @ruvector deps. Depends on `agentdb` (alpha) for the unified memory layer.

### Exports / API Surface
```
.     -> dist/index.js
./*   -> dist/*.js       (wildcard -- any submodule accessible)
```
Likely exports: `MemoryStore`, `HNSWIndex`, `VectorSearch`, `AgentDBAdapter`, `SQLiteBackend`, `HybridBackend`.

### Configuration
- Constructor likely accepts backend config (SQLite path, HNSW parameters, AgentDB connection)
- Env vars: `CLAUDE_FLOW_MEMORY_BACKEND` (hybrid), `CLAUDE_FLOW_MEMORY_PATH` (./data/memory)

### Integration Points
- Used by `@claude-flow/neural` (direct dependency)
- Used by `@claude-flow/hooks` (direct dependency)
- Used by `@claude-flow/plugins` (optional peer dependency)
- **NOT a dependency of the CLI** -- the CLI implements its own memory subsystem internally

### CLI Commands
The CLI has a full `memory` command with 12 subcommands:
```
init, store, retrieve, search, list, delete, stats, configure, cleanup, compress, export, import
```
But these are implemented in the CLI itself, not by importing this package.

### MCP Tools
None registered directly.

### Overlap with RuVector
**Significant overlap**. Both provide vector search with HNSW indexing. This package wraps AgentDB + sql.js; RuVector uses PostgreSQL with pgvector. The CLI's `ruvector` command provides a PostgreSQL bridge that complements this package's SQLite-based approach.

---

## 3. @claude-flow/neural

**Description**: SONA (Self-Optimizing Neural Architecture) learning integration, neural modes.

### Version & Status
- **Latest**: 3.0.0-alpha.7 (all tags point here)
- **Versions**: 3 (alpha.1, alpha.2, alpha.7)
- **Unpacked size**: 1.7 MB (232 files)
- **Status**: Alpha, actively maintained.

### Dependencies
```json
{
  "@ruvector/sona": "latest",
  "@claude-flow/memory": "^3.0.0-alpha.2"
}
```
**Key**: This is the bridge between @claude-flow and @ruvector. It directly depends on `@ruvector/sona` (the SONA learning engine).

### Exports / API Surface
```
.  -> dist/index.js
```
Single entry point. Likely exports: `NeuralEngine`, `SONAAdapter`, `MoERouter`, `FlashAttention`, `PatternTrainer`, `NeuralPredictor`.

### Configuration
- SONA configuration passed through constructor
- MoE (Mixture of Experts) routing parameters
- Flash Attention settings (speedup factors)
- Pattern learning epochs, model types

### Integration Points
- Consumed by `@claude-flow/hooks` (direct dependency)
- Depends on `@claude-flow/memory` for pattern storage
- Depends on `@ruvector/sona` for WASM-accelerated learning
- **NOT a dependency of the CLI** -- CLI implements neural commands internally

### CLI Commands
The CLI has a full `neural` command with 9 subcommands:
```
train, status, patterns, predict, optimize, benchmark, list, export, import
```
These are CLI-internal implementations, not wrappers around this package.

### MCP Tools
None registered directly.

### Overlap with RuVector
**This IS the RuVector bridge**. It wraps `@ruvector/sona` and integrates it with claude-flow's memory system. This is not overlap -- it is the integration point.

---

## 4. @claude-flow/hooks

**Description**: V3 Hooks System -- Event-driven lifecycle hooks with ReasoningBank learning integration.

### Version & Status
- **Latest (npm)**: 3.0.0-alpha.1
- **alpha tag**: 3.0.0-alpha.7 (most current)
- **v3alpha tag**: 3.0.0-alpha.2
- **Versions**: 3
- **Unpacked size**: 590 KB (72 files)
- **Status**: Alpha, moderately active.

### Dependencies
```json
{
  "@claude-flow/memory": "^3.0.0-alpha.2",
  "@claude-flow/neural": "^3.0.0-alpha.2",
  "@claude-flow/shared": "^3.0.0-alpha.1",
  "zod": "^3.23.0"
}
// optional:
{
  "better-sqlite3": "^11.0.0"
}
// peer:
{
  "@claude-flow/shared": "^3.0.0-alpha.1"
}
```
This is the highest-level library package -- it depends on memory, neural, and shared.

### Exports / API Surface
```
.               -> dist/index.js            (main barrel)
./registry      -> dist/registry/index.js   (HookRegistry -- register/unregister hooks)
./executor      -> dist/executor/index.js   (HookExecutor -- run hooks in lifecycle)
./daemons       -> dist/daemons/index.js    (DaemonManager -- 12 background workers)
./statusline    -> dist/statusline/index.js (StatusLine generator)
./mcp           -> dist/mcp/index.js        (MCP tool registration for hooks)
./reasoningbank -> dist/reasoningbank/index.js (ReasoningBank -- learning from hook outcomes)
./guidance      -> dist/reasoningbank/guidance-provider.js (GuidanceProvider)
```

### Binaries (CLI)
```
hooks-daemon    -> bin/hooks-daemon.js      (start/stop background daemon)
statusline      -> bin/statusline.js        (generate terminal statusline)
claude-flow-hooks -> dist/cli/guidance-cli.js (guidance CLI)
guidance        -> dist/cli/guidance-cli.js  (alias)
```

### Configuration
- Hook definitions via HookRegistry
- Daemon configuration for 12 background workers
- ReasoningBank persistence settings
- Statusline display options

### Integration Points
- Provides `./mcp` export for MCP tool registration
- Standalone binaries: `hooks-daemon`, `statusline`, `guidance`
- **NOT a dependency of the CLI** -- CLI reimplements hooks internally
- The 12 background workers (ultralearn, optimize, consolidate, predict, audit, map, preload, deepdive, document, refactor, benchmark, testgaps) are defined here

### CLI Commands
The CLI has a massive `hooks` command with 30+ subcommands:
```
pre-edit, post-edit, pre-command, post-command, pre-task, post-task,
session-end, session-restore, route, explain, pretrain, build-agents,
metrics, transfer, list, intelligence, worker, progress, statusline,
coverage-route, coverage-suggest, coverage-gaps, token-optimize,
model-route, model-outcome, model-stats, route-task, session-start,
pre-bash, post-bash
```
These are CLI-internal. The standalone package provides the programmatic API.

### MCP Tools
Yes, via the `./mcp` export. Registers hook-related MCP tools for agent interaction.

### Overlap with RuVector
Indirect. ReasoningBank uses neural patterns (via @claude-flow/neural which uses @ruvector/sona). The hooks themselves are claude-flow-specific with no RuVector equivalent.

---

## 5. @claude-flow/mcp

**Description**: Standalone MCP (Model Context Protocol) server -- stdio/http/websocket transports, connection pooling, tool registry.

### Version & Status
- **Latest**: 3.0.0-alpha.8 (all tags)
- **Versions**: 3
- **Unpacked size**: 651 KB (93 files)
- **Status**: Alpha, actively maintained. **Bundled in CLI**.

### Dependencies
```json
{
  "ws": "^8.14.2",
  "ajv": "^8.12.0",
  "cors": "^2.8.5",
  "helmet": "^7.1.0",
  "express": "^4.18.2"
}
```
No @claude-flow or @ruvector dependencies. Fully standalone MCP server implementation.

### Exports / API Surface
```
.     -> dist/index.js
./*   -> dist/*.js       (wildcard exports)
```
Likely exports: `MCPServer`, `StdioTransport`, `HttpTransport`, `WebSocketTransport`, `ToolRegistry`, `ConnectionPool`, `JsonRpcHandler`.

### Configuration
- Transport selection: stdio (default for Claude Code), HTTP, WebSocket
- Port configuration: `CLAUDE_FLOW_MCP_PORT` (default 3000)
- Host: `CLAUDE_FLOW_MCP_HOST` (default localhost)
- Transport: `CLAUDE_FLOW_MCP_TRANSPORT` (default stdio)
- Security: Helmet middleware, CORS configuration
- JSON Schema validation via AJV

### Integration Points
- **Direct dependency of the CLI** -- this is the actual MCP server
- Used when running `claude mcp add claude-flow -- npx -y @claude-flow/cli@latest`
- The CLI's `mcp start` command uses this package
- Other packages (hooks, claims, browser, gastown-bridge) register tools through this server

### CLI Commands
```
mcp start, stop, status, health, restart, tools, toggle, exec, logs
```

### MCP Tools
This IS the MCP server. It provides the tool registry where other packages register their tools. The CLI registers ~40+ tools through this server including:
- Memory operations (store, retrieve, search, list)
- Agent management (spawn, stop, status)
- Swarm coordination
- Task management
- Session management

### Overlap with RuVector
None. RuVector does not provide an MCP server. This is complementary infrastructure.

---

## 6. @claude-flow/embeddings

**Description**: V3 Embedding Service -- OpenAI, Transformers.js, Agentic-Flow (ONNX), Mock providers with hyperbolic embeddings, normalization, and chunking.

### Version & Status
- **Latest (npm)**: 3.0.0-alpha.1
- **v3alpha tag**: 3.0.0-alpha.12 (most current, 7 rapid iterations)
- **Versions**: 7 (most iterated package)
- **Unpacked size**: 319 KB at v12 (101 KB at v1)
- **Status**: Alpha, most actively developed package.

### Dependencies
```json
// v3alpha (alpha.12):
{
  "@xenova/transformers": "^2.17.0",
  "sql.js": "^1.13.0"
}
// peer (optional):
{
  "@claude-flow/shared": "^3.0.0-alpha.1",
  "agentic-flow": "^2.0.0"           // optional -- provides 75x ONNX acceleration
}
```

### Exports / API Surface
```
.  -> dist/index.js
```
Single entry point. Likely exports: `EmbeddingService`, `OpenAIProvider`, `TransformersProvider`, `AgenticFlowProvider`, `MockProvider`, `HyperbolicEmbeddings`, `PoincareBall`, `DocumentChunker`, `VectorNormalizer`, `EmbeddingCache`.

Normalization methods: L2, L1, min-max, z-score.
Hyperbolic: Poincare ball model for hierarchical data.

### Configuration
- Provider selection: OpenAI (API key), Transformers.js (local ONNX), Agentic-Flow (ONNX accelerated), Mock
- Model selection (e.g., `all-mpnet-base-v2`, `all-MiniLM-L6-v2`)
- Chunking: configurable overlap and size
- Cache: sql.js-backed persistent cache
- Normalization strategy

### Integration Points
- **Optional dependency of the CLI** -- used when available for semantic search
- Peer dependency of `@claude-flow/plugin-agentic-qe`
- No direct dependency on @ruvector packages

### CLI Commands
The CLI has a full `embeddings` command with 15 subcommands:
```
init, generate, search, compare, collections, index, providers,
chunk, normalize, hyperbolic, neural, models, cache, warmup, benchmark
```

### MCP Tools
None registered directly.

### Overlap with RuVector
**Moderate overlap**. RuVector provides WASM-accelerated embeddings via ONNX. This package provides the same via `agentic-flow` (optional peer dep) and `@xenova/transformers`. When `agentic-flow` is installed, this package claims 75x speedup. RuVector's native WASM may be faster still but requires the ruvector runtime.

---

## 7. @claude-flow/providers

**Description**: Multi-LLM Provider System for Claude Flow V3 -- unified interface for Anthropic, OpenAI, Google, Cohere, Ollama, and RuVector with intelligent load balancing.

### Version & Status
- **Latest**: 3.0.0-alpha.1 (only version)
- **Versions**: 1 (never updated)
- **Unpacked size**: 450 KB (58 files)
- **Status**: Alpha. **Stale** -- no updates in 25 days.

### Dependencies
```json
{
  "events": "^3.3.0"
}
// peer (optional):
{
  "@ruvector/ruvllm": "^0.2.3"
}
```
Minimal dependencies. Optional RuVector LLM integration.

### Exports / API Surface
```
.  -> dist/index.js
```
Exports (from README): `ProviderManager`, `createProviderManager`, `AnthropicProvider`, `OpenAIProvider`, `GoogleProvider`, `CohereProvider`, `OllamaProvider`, `RuVectorProvider`.

Key methods:
- `manager.complete(request, preferredProvider?)` -- completion
- `manager.streamComplete(request, preferredProvider?)` -- streaming
- `manager.healthCheck()` -- provider health
- `manager.estimateCost(request)` -- cost estimation
- `manager.getUsage('day')` -- usage tracking
- `manager.getMetrics()` -- latency, error rates
- `manager.listProviders()`, `manager.getProvider(name)`

Load balancing strategies: round-robin, least-loaded, latency-based, cost-based.
Automatic failover with configurable max attempts.
LRU request caching with TTL.

### Supported Models (from README)
- **Anthropic**: claude-3-5-sonnet, claude-3-opus, claude-3-haiku
- **OpenAI**: gpt-4o, gpt-4o-mini, gpt-4-turbo, o1-preview, o1-mini, o3-mini
- **Google**: gemini-2.0-flash, gemini-1.5-pro/flash
- **Cohere**: command-r-plus, command-r, command-light
- **Ollama**: llama3.x, mistral, mixtral, codellama, phi-4, deepseek-coder
- **RuVector**: custom models via @ruvector/ruvllm

### Configuration
```typescript
{
  providers: [{ provider: 'anthropic', apiKey: '...', model: '...' }],
  loadBalancing: { enabled: true, strategy: 'cost-based' },
  fallback: { enabled: true, maxAttempts: 2 },
  cache: { enabled: true, ttl: 300000, maxSize: 1000 }
}
```

### Integration Points
- **NOT a dependency of the CLI** -- CLI implements provider management internally
- Optional peer dep on `@ruvector/ruvllm`
- Standalone library for programmatic multi-LLM access

### CLI Commands
```
providers list, configure, test, models, usage
```
Implemented in CLI, not via this package.

### MCP Tools
None.

### Overlap with RuVector
**Complementary**. `@ruvector/ruvllm` is one of the supported providers. This package wraps it alongside other LLM providers under a unified interface.

---

## 8. @claude-flow/plugins

**Description**: Unified Plugin SDK for Claude Flow V3 -- Worker, Hook, and Provider Integration.

### Version & Status
- **Latest (npm)**: 3.0.0-alpha.1
- **v3alpha tag**: 3.0.0-alpha.2
- **Versions**: 2
- **Unpacked size**: 1.7 MB (111 files)
- **Status**: Alpha, minimal updates.

### Dependencies
```json
{
  "events": "^3.3.0"
}
// peer (all optional):
{
  "@ruvector/wasm": "^0.1.0",
  "@claude-flow/hooks": "^3.0.0-alpha.1",
  "@claude-flow/memory": "^3.0.0-alpha.1",
  "@ruvector/learning-wasm": "^0.1.0"
}
```

### Exports / API Surface
```
.                       -> dist/index.js           (main SDK)
./sdk                   -> dist/sdk/index.js       (PluginSDK base class)
./workers               -> dist/workers/index.js   (Worker plugin type)
./hooks                 -> dist/hooks/index.js     (Hook plugin type)
./providers             -> dist/providers/index.js  (Provider plugin type)
./examples/ruvector     -> dist/examples/ruvector-plugins/index.js
./examples/plugin-creator -> dist/examples/plugin-creator/index.js
```

Three plugin types: **Worker**, **Hook**, **Provider**.
Includes RuVector plugin examples and a plugin scaffolding tool.

### Configuration
- Plugin manifest (name, version, type, capabilities)
- Worker configuration (priority, schedule)
- Hook configuration (lifecycle events to listen to)
- Provider configuration (models, endpoints)

### Integration Points
- Peer dep on @ruvector/wasm and @ruvector/learning-wasm (optional)
- Peer dep on @claude-flow/hooks and @claude-flow/memory (optional)
- **NOT a dependency of the CLI**
- The CLI has its own plugin management with IPFS registry

### CLI Commands
```
plugins list, search, install, uninstall, upgrade, toggle, info, create, rate
```
CLI-internal implementation.

### MCP Tools
None (SDK for building plugins, not a plugin itself).

### Overlap with RuVector
The SDK provides hooks for RuVector integration (examples/ruvector export). Not overlap -- it is glue code.

---

## 9. @claude-flow/security

**Description**: Security module -- CVE fixes, input validation, path security.

### Version & Status
- **Latest**: 3.0.0-alpha.1 (only version)
- **Versions**: 1 (never updated)
- **Unpacked size**: 2.3 MB (133 files)
- **Status**: Alpha. **Stale**.

### Dependencies
```json
{
  "bcrypt": "^5.1.1",
  "zod": "^3.22.0"
}
```
No @claude-flow or @ruvector dependencies. Fully standalone.

### Exports / API Surface
```
.     -> dist/index.js
./*   -> dist/*.js
```
Key exports (from README):
- `createSecurityModule(config)` -- factory for complete security module
- `PasswordHasher`, `createPasswordHasher` -- bcrypt-based (CVE-2 fix)
- `CredentialGenerator`, `generateCredentials` -- secure key generation (CVE-3 fix)
- `SafeExecutor`, `createDevelopmentExecutor` -- allowlist command execution (HIGH-1 fix)
- `PathValidator`, `createProjectPathValidator` -- traversal prevention (HIGH-2 fix)
- `InputValidator`, `SafeStringSchema`, `EmailSchema`, `PasswordSchema`, `SpawnAgentSchema` -- Zod schemas
- `sanitizeHtml` -- XSS prevention
- `TokenGenerator`, `quickGenerate` -- HMAC-signed tokens
- `auditSecurityConfig` -- configuration auditing
- Security constants: `MIN_BCRYPT_ROUNDS` (12), `MAX_BCRYPT_ROUNDS` (14), etc.

### Configuration
```typescript
{
  projectRoot: '/path/to/project',
  hmacSecret: process.env.HMAC_SECRET,
  bcryptRounds: 12,
  allowedCommands: ['git', 'npm', 'npx', 'node']
}
```

### Integration Points
- **NOT a dependency of the CLI** (CLI bundles @claude-flow/aidefence instead for AI defense)
- Peer dep of @claude-flow/plugin-agentic-qe (optional)
- Standalone library for security operations

### CLI Commands
```
security scan, cve, threats, audit, secrets, defend
```
CLI-internal. The `defend` subcommand likely uses @claude-flow/aidefence (which IS a CLI dep).

### MCP Tools
None.

### Overlap with RuVector
None. RuVector does not provide security utilities. Complementary.

---

## 10. @claude-flow/claims

**Description**: Issue claiming and work coordination module for Claude Flow V3.

### Version & Status
- **Latest**: 3.0.0-alpha.8 (all tags)
- **Versions**: 3
- **Unpacked size**: 793 KB (87 files)
- **Status**: Alpha, actively maintained.

### Dependencies
```json
{
  "zod": "^3.22.4"
}
// peer (optional):
{
  "@claude-flow/shared": "^3.0.0-alpha.1"
}
```

### Exports / API Surface
```
.               -> dist/index.js          (main ClaimsManager)
./api           -> dist/api/index.js      (REST/programmatic API)
./api/mcp-tools -> dist/api/mcp-tools.js  (MCP tool definitions)
```

Key functionality: issue claiming, work coordination, handoff between agents, load balancing, steal mechanics.

### Configuration
- Claims persistence (in-memory or database-backed)
- Handoff policies
- Steal timeout configuration
- Load distribution settings

### Integration Points
- **NOT a dependency of the CLI** -- CLI reimplements claims/issues internally
- Exports MCP tools via `./api/mcp-tools`
- Can be used programmatically by other packages

### CLI Commands
Two related command groups:
```
claims: list, check, grant, revoke, roles, policies
issues: list, claim, release, handoff, status, stealable, steal, load, rebalance, board
```
Both CLI-internal.

### MCP Tools
**Yes** -- exports MCP tool definitions via `./api/mcp-tools`. Tools for claim CRUD, handoff, steal, load checking.

### Overlap with RuVector
None. RuVector does not handle work coordination.

---

## 11. @claude-flow/browser

**Description**: Browser automation for AI agents -- integrates agent-browser with claude-flow swarms.

### Version & Status
- **Latest (npm)**: 3.0.0-alpha.1
- **alpha tag**: 3.0.0-alpha.2
- **Versions**: 2
- **Unpacked size**: 574 KB (87 files)
- **Status**: Alpha, recent (11 days old).

### Dependencies
```json
{
  "agent-browser": "^0.6.0",
  "agentic-flow": "^2.0.3",
  "zod": "^3.22.4"
}
// peer:
{
  "@claude-flow/cli": "^3.0.0-alpha.140"
}
```
Depends on `agent-browser` (Playwright-based) and `agentic-flow`. Has a postinstall script that attempts to globally install `agent-browser`.

### Exports / API Surface
```
.            -> dist/index.js           (main BrowserAgent)
./agent      -> dist/agent/index.js     (BrowserAgent class)
./skill      -> dist/skill/index.js     (Browser skill definition)
./mcp-tools  -> dist/mcp-tools/index.js (MCP tool registration)
```

### Configuration
- Playwright browser options (headless, viewport, etc.)
- Navigation timeouts
- Screenshot settings
- Agent-browser integration config

### Integration Points
- Peer dependency on the CLI (not bundled IN the CLI)
- **NOT a dependency of the CLI**
- Exports MCP tools for browser operations
- Designed to be installed as an add-on

### CLI Commands
None directly added. Browser operations would be invoked through MCP tools.

### MCP Tools
**Yes** -- exports browser automation MCP tools via `./mcp-tools`. Likely: navigate, click, type, screenshot, extract, evaluate.

### Overlap with RuVector
None. RuVector does not do browser automation.

---

## 12. @claude-flow/aidefence

**Description**: AI Manipulation Defense System (AIMDS) with self-learning, prompt injection detection, and vector search integration.

### Version & Status
- **Latest**: 3.0.2 (past alpha, into patch releases)
- **Versions**: 4 (3.0.0-alpha.1 -> 3.0.0 -> 3.0.1 -> 3.0.2)
- **Unpacked size**: 94 KB (26 files -- smallest functional package)
- **Status**: Most mature package. Past alpha. **Bundled in CLI**.

### Dependencies
```json
{
  // none (zero runtime dependencies!)
}
// peer (optional):
{
  "agentdb": ">=2.0.0-alpha.1"
}
```
Zero runtime dependencies. Optionally uses AgentDB for vector-enhanced threat detection.

### Exports / API Surface
```
.            -> dist/index.js                                    (main AIMDS)
./learning   -> dist/domain/services/threat-learning-service.js  (ThreatLearningService)
./detection  -> dist/domain/services/threat-detection-service.js (ThreatDetectionService)
```

Key capabilities:
- Prompt injection detection
- Jailbreak detection
- PII detection and masking
- Self-learning from threats
- Vector search integration (via optional AgentDB)

### Configuration
- Threat sensitivity thresholds
- PII detection patterns
- Learning rate for self-improvement
- AgentDB connection (optional)

### Integration Points
- **Direct dependency of the CLI** -- used by `security defend` subcommand
- Clean DDD architecture (domain/services pattern)
- Optional AgentDB integration for vector-enhanced detection

### CLI Commands
Exposed through `security defend` subcommand:
```
claude-flow security defend  (AI manipulation defense - detect prompt injection, jailbreaks, and PII)
```

### MCP Tools
None registered directly (consumed by CLI's security tools).

### Overlap with RuVector
Minimal. Can optionally use AgentDB (which is built on RuVector patterns) for vector search, but the core detection logic is standalone. No direct RuVector dependency.

---

## 13. @claude-flow/testing

**Description**: Testing module -- TDD London School framework, test utilities, fixtures, and mock services for V3 Claude-Flow.

### Version & Status
- **Latest (npm)**: 3.0.0-alpha.1
- **v3alpha tag**: 3.0.0-alpha.2
- **Versions**: 2
- **Unpacked size**: 1.6 MB (187 files)
- **Status**: Alpha. Stale.

### Dependencies
```json
{
  // none (runtime deps are all dev/peer)
}
// peer:
{
  "vitest": ">=1.0.0",
  "@claude-flow/swarm": "^3.0.0-alpha.1",
  "@claude-flow/memory": "^3.0.0-alpha.1",
  "@claude-flow/shared": "^3.0.0-alpha.1"
}
// dev (workspace):
{
  "@claude-flow/swarm": "workspace:*",
  "@claude-flow/memory": "workspace:*",
  "@claude-flow/shared": "workspace:*"
}
```
Note: References `@claude-flow/swarm` which is NOT published as a standalone package. This suggests the testing package was extracted from the monorepo and may have incomplete peer dep resolution.

### Exports / API Surface
```
.          -> dist/index.js           (main test utilities)
./mocks    -> dist/mocks/index.js     (mock implementations)
./setup    -> dist/setup.js           (test setup/teardown)
./helpers  -> dist/helpers/index.js   (test helper functions)
./fixtures -> dist/fixtures/index.js  (test data fixtures)
```

Provides mocks for: memory stores, agents, swarms, coordinators, MCP servers.
Provides fixtures for: agent states, task definitions, memory entries.
Provides helpers for: async testing, event waiting, timeout utilities.

### Configuration
- Vitest integration
- Mock configuration
- Fixture data customization

### Integration Points
- **NOT a dependency of the CLI**
- Development-only package for testing claude-flow applications
- Peer dep on unpublished `@claude-flow/swarm` (potential issue)

### CLI Commands
None.

### MCP Tools
None.

### Overlap with RuVector
None. Testing utilities only.

---

## 14. @claude-flow/plugin-agentic-qe

**Description**: Quality Engineering plugin for Claude Flow V3 with 51 specialized agents across 12 DDD bounded contexts.

### Version & Status
- **Latest**: 3.0.0-alpha.4
- **Versions**: 4 (rapid iteration on publish day)
- **Unpacked size**: 289 KB (28 files)
- **Status**: Alpha, actively developed.

### Dependencies
```json
{
  "zod": "^3.23.0"
}
// peer (all optional):
{
  "@claude-flow/memory": ">=3.0.0",
  "@claude-flow/plugins": ">=3.0.0",
  "@claude-flow/security": ">=3.0.0",
  "@claude-flow/embeddings": ">=3.0.0",
  "@ruvector/gnn": "optional",
  "@ruvector/sona": "optional",
  "@ruvector/attention": "optional",
  "@claude-flow/browser": "optional"
}
```

### Exports / API Surface
```
.  -> dist/index.js
```
Single entry. Provides 51 specialized QE agents organized in 12 bounded contexts:
- Test coverage analysis
- Security testing
- Chaos engineering
- Accessibility testing
- Performance testing
- TDD framework
- And more

### Configuration
- Agent selection and activation
- Context-specific settings
- Integration with ruvector (optional GNN, SONA, attention)
- Browser automation via @claude-flow/browser (optional)

### Integration Points
- Plugin for the @claude-flow/plugins SDK
- Optional RuVector integration (GNN for graph analysis, SONA for learning, attention for focus)
- Optional browser integration for UI testing
- **NOT a dependency of the CLI**

### CLI Commands
None directly. Installed as a plugin via `claude-flow plugins install`.

### MCP Tools
None directly (agents are spawned through the swarm system).

### Overlap with RuVector
**Uses RuVector as acceleration layer** (optional). GNN for test dependency graphs, SONA for learning test patterns, Attention for focusing test effort. Not overlap -- extension.

---

## 15. @claude-flow/plugin-gastown-bridge

**Description**: Gas Town orchestrator integration for Claude Flow V3 with WASM-accelerated formula parsing and graph analysis.

### Version & Status
- **Latest**: 0.1.1 (NOT on 3.x versioning -- independent)
- **Versions**: 2
- **Unpacked size**: 2.3 MB (20 files -- large due to WASM binaries)
- **Status**: Pre-alpha. New. **Optional dep of CLI**.

### Dependencies
```json
{
  "@iarna/toml": "^2.2.5",
  "uuid": "^9.0.0",
  "zod": "^3.22.0"
}
// peer (optional):
{
  "@claude-flow/memory": ">=3.0.0"
}
// optional:
{
  "gastown-formula-wasm": "^0.1.0",
  "ruvector-gnn-wasm": "^0.1.0"
}
```

### Exports / API Surface
```
.          -> dist/index.mjs / dist/index.cjs  (dual ESM/CJS!)
./bridges  -> dist/bridges.mjs                 (SyncBridge -- Beads <-> AgentDB)
./formula  -> dist/formula.mjs                 (formula parsing/cooking)
./convoy   -> dist/convoy.mjs                  (convoy/work-order tracking)
./wasm     -> dist/wasm-loader.mjs             (WASM module loader)
```
Built with `tsup` (not tsc) -- provides both ESM and CJS builds.

Key class: `GasTownBridgePlugin`.

20 MCP Tools organized in categories:
- **Beads (5)**: create, ready, show, dep, sync
- **Convoy (3)**: create, status, track
- **Formula (4)**: list, cook (WASM), execute, create
- **Orchestration (3)**: sling, agents, mail
- **WASM (5)**: parse, resolve, cook_batch, match, optimize

### Performance Claims
- Formula parsing: 352x faster (53ms JS -> 0.15ms WASM)
- DAG topological sort: 150x faster
- Pattern search: 1000x-12500x faster (HNSW via WASM)

### Configuration
```typescript
{
  gtPath: '/usr/local/bin/gt',   // Gas Town CLI path
  bdPath: '/usr/local/bin/bd',   // Beads CLI path
  wasmEnabled: true              // Enable WASM acceleration
}
```

### Integration Points
- **Optional dependency of the CLI**
- Bridges Steve Yegge's Gas Town (Go) with Claude Flow (TypeScript)
- Bidirectional sync between Beads (JSONL/Git) and AgentDB (SQLite)
- WASM acceleration for compute-heavy operations
- CLI bridge wraps `gt` and `bd` Go binaries

### CLI Commands
None added to CLI directly. Tools exposed via MCP.

### MCP Tools
**Yes -- 20 MCP tools** (most of any package). All prefixed with `gt_`:
```
gt_beads_create, gt_beads_ready, gt_beads_show, gt_beads_dep, gt_beads_sync,
gt_convoy_create, gt_convoy_status, gt_convoy_track,
gt_formula_list, gt_formula_cook, gt_formula_execute, gt_formula_create,
gt_sling, gt_agents, gt_mail,
gt_wasm_parse_formula, gt_wasm_resolve_deps, gt_wasm_cook_batch, gt_wasm_match_pattern, gt_wasm_optimize
```

### Overlap with RuVector
**Uses RuVector WASM** (optional `ruvector-gnn-wasm` for graph operations). The HNSW pattern search likely delegates to RuVector's WASM implementation when available. This is integration, not duplication.

---

## Cross-Cutting Analysis

### Dependency Layers

```
Layer 0 (Foundation):   @claude-flow/shared
Layer 1 (Core):         @claude-flow/memory, @claude-flow/mcp, @claude-flow/security, @claude-flow/aidefence
Layer 2 (Intelligence): @claude-flow/neural, @claude-flow/embeddings, @claude-flow/providers
Layer 3 (Automation):   @claude-flow/hooks, @claude-flow/claims, @claude-flow/browser
Layer 4 (Plugins):      @claude-flow/plugins (SDK), @claude-flow/testing
Layer 5 (Extensions):   @claude-flow/plugin-agentic-qe, @claude-flow/plugin-gastown-bridge
```

### RuVector Integration Points

| Package | RuVector Dependency | Integration Type |
|---------|-------------------|------------------|
| neural | @ruvector/sona (direct) | Bridge -- wraps SONA for claude-flow |
| plugins | @ruvector/wasm, @ruvector/learning-wasm (optional peer) | SDK support |
| providers | @ruvector/ruvllm (optional peer) | LLM provider option |
| plugin-agentic-qe | @ruvector/gnn, /sona, /attention (optional) | Acceleration layer |
| plugin-gastown-bridge | ruvector-gnn-wasm (optional) | WASM graph ops |
| CLI | @ruvector/sona, /attention, /learning-wasm (optional) | Direct integration |

### Packages That Register MCP Tools

| Package | Tool Count | Tool Prefix |
|---------|-----------|-------------|
| @claude-flow/mcp | N/A (IS the server) | - |
| @claude-flow/hooks | Variable | hooks_* |
| @claude-flow/claims | ~6 | claims_* |
| @claude-flow/browser | ~6 | browser_* |
| @claude-flow/plugin-gastown-bridge | 20 | gt_* |

### Package Health Assessment

| Package | Verdict | Notes |
|---------|---------|-------|
| shared | Stable foundation | Large (11MB), comprehensive types. Single version -- may need updates. |
| memory | Functional but orphaned | Not used by CLI directly. AgentDB dep is alpha. |
| neural | Active bridge | Key ruvector integration point. Actively maintained. |
| hooks | Rich but complex | 8 submodule exports, 3 binaries. CLI reimplements most of it. |
| mcp | Critical infrastructure | Bundled in CLI. Express-based. Actively maintained. |
| embeddings | Most active | 7 versions in one month. Key for semantic search. |
| providers | Feature-rich but stale | Comprehensive multi-LLM support. Never updated. |
| plugins | SDK-only | Provides framework, not functionality. |
| security | Comprehensive but stale | Detailed CVE fixes. Never updated. |
| claims | Active | MCP tools. Work coordination. Recently updated. |
| browser | New | Playwright integration. Just published. |
| aidefence | Most mature | Past alpha (3.0.2). Zero deps. Clean DDD. Bundled in CLI. |
| testing | Incomplete | References unpublished @claude-flow/swarm package. |
| plugin-agentic-qe | Ambitious | 51 agents, 12 contexts. All optional deps. |
| plugin-gastown-bridge | Innovative | Bridges Go ecosystem. WASM acceleration. 20 MCP tools. |

### Key Architectural Insight

**The CLI reimplements most package functionality internally.** Only 3 packages are direct CLI dependencies (shared, mcp, aidefence) plus 2 optional (embeddings, gastown-bridge). The standalone packages exist for:

1. **Programmatic library use** -- importing into TypeScript projects
2. **Plugin development** -- using the SDK to build extensions
3. **Standalone deployment** -- running hooks daemon, MCP server independently
4. **Testing** -- mock services for development

The CLI at v3.0.0-alpha.190 is the primary consumer and has evolved independently of most packages. Some packages (providers, security) have not been updated since initial publish and may diverge from CLI internals.

### Recommendations for Skill Authors

1. **Use CLI commands** (`npx @claude-flow/cli@latest ...`) as the primary interface. The CLI is the most complete and up-to-date.
2. **For programmatic integration**, import packages directly but be aware of alpha stability.
3. **@claude-flow/neural** is the key ruvector bridge -- understand its API for intelligence features.
4. **@claude-flow/embeddings** is critical for semantic search -- use v3alpha tag for latest features.
5. **@claude-flow/plugin-gastown-bridge** is the most MCP-tool-rich extension (20 tools).
6. **@claude-flow/aidefence** is the most stable package -- safe to depend on.
7. **Avoid depending on @claude-flow/testing** until the @claude-flow/swarm peer dep is resolved.
