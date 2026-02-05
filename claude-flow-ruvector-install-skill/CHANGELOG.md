# Changelog

All notable changes to V3+RV Skill are documented in this file.

---

## [0.9.9] - 2026-02-04

### Session Tracking & Agent Registration Fixes

This release fixes critical issues with session tracking and agent registration that were causing empty session stats and inconsistent agent data.

### Added

- **FIX-032**: Session tracking in stats table
  - `session-start` now updates `last_session` timestamp and increments `session_count++`
  - `session-end` updates `total_sessions` and `last_session_end` timestamp
  - Stats keys: `last_session`, `last_session_timestamp`, `session_count`, `total_sessions`, `last_session_end`, `last_agent`
  - Location: `scripts/post-process.js` handleSessionStart(), handleSessionEnd()

- **FIX-033**: Agent registration dual-schema support
  - Handles both new schema (`id, name, type, status, created_at, last_seen, metadata`) and legacy schema (`name, data`)
  - Automatic schema detection at registration time
  - Fallback to simple name-based registration if both schemas fail
  - Session count tracked in `metadata.session_count` (new) or `data.session_count` (legacy)
  - Location: `scripts/post-process.js` registerAgent()

- **FIX-034**: Agents table name index
  - Added `idx_agents_name` index for efficient agent lookups by name
  - Setup.sh now creates index on new installations
  - Setup.sh adds index to existing agents tables
  - Location: `scripts/setup.sh` Step 5b

- **handleSessionEnd()**: New session-end handler
  - Triggers full consolidation pipeline
  - Updates session-end specific stats
  - Called by ruvector-hook-bridge.sh on session-end event
  - Location: `scripts/post-process.js`

- **validate-setup.sh Level 11**: Session tracking verification
  - 11a: Session stats tracking check
  - 11b: Agent session tracking check
  - 11c: Agents table name index check
  - Location: `scripts/validate-setup.sh`

- **diagnose-db.sh Section 14**: Session tracking diagnostics
  - Shows session stats from stats table
  - Lists agents with session counts
  - Shows agents table indexes
  - Location: `scripts/diagnose-db.sh`

### Previous v0.9.9 Additions (retained)

- **Phase 14: MCP Server Registration** - Now part of the official install sequence (was optional in post-installation)
- **Phase 15: Daemon Start & Final Validation** - Explicit phase for starting daemon and running comprehensive validation
- **Phase 7: Line Ending Fix** - Added cross-platform line ending fix for shell scripts (`sed -i 's/\r$//'`)
- **State Detection Section** - Commands to detect current system/project state before routing
- **Package Identity Section** - 11 npm gotchas to avoid common package confusion
- **Discovery Tools Table** - 6 diagnostic commands to use instead of hardcoding assumptions
- **Reference Routing Table** - 15+ links to reference documents organized by user need
- **Three Doctor Scopes Comparison** - Documents what each doctor command checks and misses
- **Complete Environment Variables Reference** - All 15+ variables with defaults and purposes
- **Hook Timeout Reference Table** - Recommended timeouts by hook type with reasons

### Restored from v0.9.7

- Detailed error recovery procedures with diagnosis steps
- Backup commands before all recovery operations
- Enhanced troubleshoot fixes with pre-fix diagnostics

### Kept from v0.9.8

- AI-optimized decision tree structure in SKILL.md
- Machine-verifiable success criteria
- YAML frontmatter with triggers

### Changed

- **scripts/post-process.js**: Version bumped to v0.9.9, added handleSessionStart() session stats, handleSessionEnd(), dual-schema registerAgent()
- **scripts/ruvector-hook-bridge.sh**: Version bumped to v0.9.9, session-end now calls post-process.js --event session-end
- **scripts/setup.sh**: Version bumped to v0.9.9, added agents name index, updated summary
- **scripts/validate-setup.sh**: Version bumped to v0.9.9, added Level 11 session tracking checks
- **scripts/diagnose-db.sh**: Version bumped to v0.9.9, added Section 14 session tracking
- **INSTALL.md**: Now 15 phases (was 13), version bumped to v0.9.9, added Appendix D session tracking docs
- **SKILL.md**: Added State Detection, Package Identity, Discovery Tools, Reference Routing sections
- **ARCHITECTURE.md**: Added Environment Variables Reference, Hook Timeout Reference
- **QUICKSTART.md**: Updated to reference 15-phase install

---

## [0.9.8] - 2026-02-04

### Root Cause Analysis

Database forensics on vanilla installations revealed three root causes of broken learning pipelines:

1. **Pretrain before setup.sh**: Vanilla guide ran pretrain BEFORE setup.sh configured ONNX, resulting in 64d hash embeddings instead of 384d ONNX vectors.

2. **Missing consolidation step**: No install guide called the consolidate event, leaving neural_patterns, edges, and agents tables empty.

3. **Stats table not synchronized**: The stats table was never populated, preventing learning metrics dashboards from functioning.

### Added

- **FIX-024**: Consolidation step in setup.sh SECTION 4
  - Calls `post-process.js --event session-start` to register setup agent
  - Calls `post-process.js --event consolidate` to populate learning pipeline
  - Location: `scripts/setup.sh` Step 9

- **FIX-025**: Embedding dimension verification
  - Validates embeddings are 384d ONNX (1536 bytes) not 64d hash (256 bytes)
  - Location: `scripts/setup.sh` Step 8b, `scripts/validate-setup.sh` Level 9

- **FIX-026**: Unified INSTALL.md
  - Single authoritative 13-phase installation guide
  - Correct phase ordering: setup.sh (Phase 8) BEFORE pretrain (Phase 9)
  - Verification checkpoints after each phase
  - Deprecates `_clean_install_guide.md` and `_clean_vanilla&db_install_guide.md`

- **FIX-027**: Stats table sync in consolidate handler
  - Creates stats table if missing
  - Syncs total_memories, total_patterns, total_edges, total_trajectories, total_agents
  - Records embedding_dimension, last_consolidation, consolidation_count
  - Location: `scripts/post-process.js` handleConsolidate()

- **validate-setup.sh Level 9**: Embedding dimension verification
  - Checks configured dimension vs actual embedding bytes
  - Detects 64d hash vs 384d ONNX
  - Reports FIX-025 violations

- **validate-setup.sh Level 10**: Stats table verification
  - Checks stats table existence
  - Verifies essential stats populated
  - Reports consolidation recency

- **MIGRATION.md**: Upgrade guide from v0.9.7
  - Pre-migration assessment scripts
  - Four migration paths based on current state
  - Rollback procedures

- **QUICKSTART.md**: 5-10 minute setup guide
  - Condensed installation sequence
  - Quick verification commands

- **ARCHITECTURE.md**: System architecture documentation
  - Component diagrams
  - Data flow diagrams
  - Fix registry
  - Integration points

### Changed

- **scripts/setup.sh**: Added SECTION 4 for consolidation
- **scripts/post-process.js**: Added stats table initialization and updateStats() helper
- **scripts/validate-setup.sh**: Added Level 9 and Level 10 verification
- **reference/troubleshooting.md**: Added scenarios #39-#42 and Pattern H

### Deprecated

- `reference/_clean_install_guide.md` - Use INSTALL.md instead
- `reference/_clean_vanilla&db_install_guide.md` - Use INSTALL.md instead

---

## [0.9.7] - 2026-02-03

### Added

- **CONFIGURABLE SEMANTIC_THRESHOLD**: Via `RUVECTOR_SEMANTIC_THRESHOLD` env var (default 0.55)
- **SHARED parseEmbedding()**: Utility for correct Node.js Buffer handling
- **EXPLICIT ERROR LOGGING**: In addNeuralPattern (no more silent failures)
- **compressed_patterns TABLE CHECK**: At startup in post-process.js
- **VERBOSE LOGGING**: Via `RUVECTOR_VERBOSE` env var

### Fixed

- **EDGE WEIGHT FIX**: Replace instead of accumulate weights

### Changed

- validate-setup.sh Level 7a: Semantic edge count check
- validate-setup.sh Level 7b: Neural pattern embedding check
- validate-setup.sh Level 7c: compressed_patterns table check
- validate-setup.sh Level 4b: Hook timeout validation (PreToolUse >= 5000ms)
- validate-setup.sh Level 3 info: Dream cycle status

---

## [0.9.6] - 2026-02-02

### Added

- **SEMANTIC EDGES**: Uses embedding gateway for consistent 384d ONNX vectors
- **NEURAL PATTERN EMBEDDINGS**: Patterns stored with embeddings for HNSW search
- **AGENT REGISTRATION**: Always registers to intelligence.db (SSOT)
- **EMBEDDING GATEWAY**: Single source for all embeddings (assets/embedding-gateway.js)

---

## [0.9.5] - 2026-02-01

### Added

- **Level 8 Learning Pipeline**: Functional smoke test in validate-setup.sh
- **neural_patterns populated check**
- **edges populated check**
- **agents registered check**
- **trajectory reward variance check**
- **consolidation smoke test**

### Changed

- CLI consolidated patch check now accepts V095, V094, or V092

---

## [0.9.4] - 2026-01-31

### Added

- **Level 7m**: SONA platform availability check

### Changed

- CLI consolidated patch check now accepts V094 or V092

---

## [0.9.3] - 2026-01-30

### Changed

- MCP server checks now look in BOTH .claude/settings.json AND .claude.json

---

## [0.9.2] - 2026-01-29

### Added

- Consolidated CLI patch marker (__PATCH_CLI_V092__)
- Consolidated engine patch marker (__PATCH_ENGINE_V092__)

---

## [0.9.1] - 2026-01-28

### Added

- Troubleshooting scenarios #35-#38 (Advanced Learning)
- Pattern G: Stateless Native Modules
- FIX-013: SONA persistence
- FIX-014: HNSW storagePath
- FIX-015: tick/forceLearn wiring
- FIX-016: TinyDancer routing

---

## [0.9.0] - 2026-01-27

### Added

- Troubleshooting scenarios #29-#34 (Data Integrity)
- Pattern E: Stateless Hook Invocations
- Pattern F: Schema Without Write Paths
- FIX-007: stdin bridge
- FIX-008: lastEditedFile persistence
- FIX-009: atomic save

---

## [0.8.0] - 2026-01-26

### Initial Release

- V3+RV Skill with claude-flow + ruvector integration
- 28 original troubleshooting scenarios
- Patterns A-D
- FIX-005, FIX-006, FIX-006b, FIX-010
- validate-setup.sh Levels 1-7
- FOX method documentation
