# Reference Directory Manifest

> **Version:** v0.9.4 | **Updated:** 2026-02-02

## Directory Naming

Per [Anthropic skill best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices),
the recommended pattern is `SKILL.md overview → reference/*.md details (one level deep)`.
This skill already uses `reference/` -- **no rename is needed**. The convention is correct as-is.

---

## File Manifest (35 files)

### Core Reference Files (linked from SKILL.md routing table)

| File | Description |
|------|-------------|
| `wiring-and-validation.md` | Init sequence internals: what each step creates and expects |
| `ruvector-hooks-reference.md` | All 55 ruvector hooks commands with signatures |
| `ruvector-tools-reference.md` | Non-hook ruvector commands (embed, workers, gnn, etc.) |
| `ruvector-extensions-reference.md` | ruvector-extensions package: 31 exports, 5 feature areas |
| `claude-flow-reference.md` | claude-flow CLI: 31 commands, ~180+ subcommands, 200 MCP tools |
| `learning-and-consolidation.md` | SONA, HNSW, Q-Learning, TinyDancer, Dream Cycles, MinCut |
| `storage-backends.md` | All 8 storage systems with status and configuration |
| `edge-full-reference.md` | @ruvector/edge-full WASM: 6 modules, 35 classes |
| `edge-net-reference.md` | @ruvector/edge-net WASM: 65 classes + 2 enums |
| `fox-method.md` | FOX (Fork + Overlay + eXtend) local bug fix protocol |
| `upgrade-validation.md` | Pre-upgrade backup, version bump, post-upgrade validation |
| `generated-artifacts.md` | Files created by hooks init, their structure, purpose |
| `troubleshooting.md` | 30 error scenarios + 6 root cause patterns + 4 browser/WASM issues, with diagnosis and resolution |
| `init-sequence-details.md` | Extended init steps (5b-5e, 8, 9) and Q3/Q9 details |
| `feature-overlap.md` | Memory fragmentation, routing fragmentation, overlap resolution |
| `quality-assurance.md` | QA validation levels, agentic-qe integration |

### Supplemental Reference Files (v0.7 additions)

| File | Description |
|------|-------------|
| `daily-workflow.md` | Post-setup daily usage patterns: session start, learning, routing |
| `ecosystem-packages.md` | Package maturity, versions, relationships for all ecosystem packages |
| `package-selection.md` | Companion to SKILL.md Q2 for package selection guidance |
| `claude-flow-packages-deep-analysis.md` | Deep analysis of all 15 @claude-flow/* packages |
| `ruvector-packages-deep-analysis.md` | Deep analysis of all 18+ @ruvector/* packages |
| `ecosystem-integration-analysis.md` | agentic-flow + agentic-qe integration pipeline analysis |

### Internal Working Documents (historical reference)

| File | Description |
|------|-------------|
| `remaining-items-report.md` | v0.5 audit: remaining items (mostly addressed in v0.7) |
| `skill-audit-recommendations.md` | v0.5 audit: cross-reference analysis (mostly addressed in v0.7) |
| `DIRECTORY-NOTE.md` | This file: directory manifest and naming note |

### Fixes (v0.9.4 consolidated)

| File | Description |
|------|-------------|
| `../fixes/ruvector/patch-cli.js` | Consolidated CLI patches: FIX-005 (SQLite), FIX-006/006b (async ONNX + RC-C), FIX-008 (lastEditedFile), SONA (FIX-013/015) |
| `../fixes/ruvector/patch-engine.js` | Optional engine patches: FIX-014 (HNSW storagePath), FIX-016 (TinyDancer wiring) |

### Packages

| File | Description |
|------|-------------|
| `../packages/ruvector-storage/index.js` | SQLite storage adapter: SqliteStorage, JsonStorage, factory, 11 tables, WAL mode, FIX-009B guard |

### Scripts

| File | Description |
|------|-------------|
| `../scripts/setup.sh` | Post-init configuration + upstream patches (replaces post-init-fix.sh) |
| `../scripts/validate-setup.sh` | Deep setup validation (7 levels, 25+ checks) |
| `../scripts/diagnose-db.sh` | Read-only SQLite/JSON diagnostic: row counts, embeddings, Q-learning, content quality |
| `../scripts/memory-sync.sh` | SQLite-JSON memory synchronization utility |
| `../scripts/pre-upgrade.sh` | Pre-upgrade snapshot and safety checks |

### Investigation (historical)

| File | Description |
|------|-------------|
| `../sherlock/SH_07.1.md` | Deep forensic investigation of embedding and storage issues |
