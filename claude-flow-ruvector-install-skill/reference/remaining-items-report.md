# Remaining Items Report -- v0.5 Skill Completion

> **Version:** v0.7 | **Status:** Historical reference | **Original:** v0.5 audit
>
> **Note:** All items in this report have been addressed in v0.7. This file is retained for historical reference only.
>
> **Previously-open items -- all resolved in v0.7:**
> - ~~Q5 `--lambda` flag~~ -- Added to init-sequence-details.md Step 5b
> - ~~Q9 `watch --dry-run`~~ -- Added to init-sequence-details.md Step 9 + Q9 table
> - ~~No Q10 for claude-flow post-init~~ -- Q10 added to SKILL.md
> - ~~`hooks export/import` not in ACTION:UPGRADE~~ -- Added to SKILL.md + upgrade-validation.md
> - ~~Worker count three-way inconsistency~~ -- Reconciled across feature-overlap.md + package-selection.md
> - ~~DIRECTORY-NOTE rename deferral~~ -- Confirmed `reference/` is correct per Anthropic best practices

Generated: 2026-01-31
Agent: Research Agent 1 (Opus 4.5)

---

## Contents

- [Item 1: Q3 Multiselect Clarification](#item-1-q3-multiselect-clarification)
  - [Finding](#finding)
  - [Action Taken](#action-taken)
- [Item 2: Skill Delivery Format Verification](#item-2-skill-delivery-format-verification)
  - [Findings](#findings)
    - [2a. YAML Frontmatter Analysis](#2a-yaml-frontmatter-analysis)
    - [2b. Directory Structure Analysis](#2b-directory-structure-analysis)
    - [2c. Comparison with Existing Skills](#2c-comparison-with-existing-skills)
    - [2d. Summary](#2d-summary)
- [Item 3: Undiscovered Configuration Options](#item-3-undiscovered-configuration-options)
  - [Methodology](#methodology)
  - [claude-flow config subcommands](#claude-flow-config-subcommands)
  - [claude-flow init flags (Step 1)](#claude-flow-init-flags-step-1)
  - [claude-flow providers](#claude-flow-providers)
  - [claude-flow plugins](#claude-flow-plugins)
  - [claude-flow session](#claude-flow-session)
  - [claude-flow hive-mind](#claude-flow-hive-mind)
  - [claude-flow security](#claude-flow-security)
  - [claude-flow performance](#claude-flow-performance)
  - [ruvector hooks: Additional commands not in Q1-Q9](#ruvector-hooks-additional-commands-not-in-q1-q9)
  - [ruvector embed: Additional options](#ruvector-embed-additional-options)
  - [ruvector attention: Not in Q flow at all](#ruvector-attention-not-in-q-flow-at-all)
  - [Summary of Missing Options by Proposed Question Group](#summary-of-missing-options-by-proposed-question-group)
- [Item 4: End-to-End Test Plan](#item-4-end-to-end-test-plan)
  - [Purpose](#purpose)
  - [Prerequisites](#prerequisites)
  - [Test Configuration (example Q answers)](#test-configuration-example-q-answers)
  - [Step-by-Step Test Execution](#step-by-step-test-execution)
  - [Pass/Fail Criteria](#passfail-criteria)
  - [Known Acceptable Warnings](#known-acceptable-warnings)
- [Cross-Item Summary](#cross-item-summary)

---

## Item 1: Q3 Multiselect Clarification

### Finding

The Q3 table in SKILL.md (lines 228-249) lists 9 flags for `ruvector hooks init`:

| Flag | Effect |
|------|--------|
| (default) | Full init |
| `--minimal` | Basic hooks only |
| `--no-claude-md` | Skip CLAUDE.md |
| `--no-permissions` | Skip permissions |
| `--no-env` | Skip 13 env vars |
| `--no-mcp` | Skip MCP config |
| `--no-statusline` | Skip statusline |
| `--no-gitignore` | Skip .gitignore |
| `--fast` | 20x faster local bypass |

Confirmed via `npx ruvector hooks init --help` output:

```
Options:
  --force                 Force overwrite existing settings
  --minimal               Only basic hooks (no env, permissions, or advanced hooks)
  --fast                  Use fast local wrapper (20x faster, bypasses npx overhead)
  --no-claude-md          Skip CLAUDE.md creation
  --no-permissions        Skip permissions configuration
  --no-env                Skip environment variables
  --no-gitignore          Skip .gitignore update
  --no-mcp               Skip MCP server configuration
  --no-statusline         Skip statusLine configuration
  --pretrain              Run pretrain after init to bootstrap intelligence
  --build-agents [focus]  Generate optimized agents
```

**Key facts:**
1. These flags are standard CLI boolean options and combine freely. Nothing in the implementation makes them mutually exclusive.
2. `--minimal` is described as "Only basic hooks (no env, permissions, or advanced hooks)" -- meaning it implies the equivalent of `--no-env` + `--no-permissions` plus skipping advanced hooks. However `--minimal` does NOT skip CLAUDE.md, .gitignore, MCP, or statusline.
3. `--fast` is orthogonal to all other flags -- it changes HOW hooks execute (local wrapper vs npx), not WHAT gets initialized.

### Action Taken

Added a clarification note directly after the Q3 table and before the `--no-env` WARNING in SKILL.md. The note:
- States that flags combine freely with an example
- Explains that `--minimal` is a superset implying `--no-env` and `--no-permissions` plus skipping advanced hooks
- Notes that `--fast` is orthogonal and should almost always be included
- Mentions `--force` which was present in `--help` but missing from the Q3 table

Also added `--force` to the Q3 table since it appears in `--help` output and is relevant (overwrites existing settings.json).

---

## Item 2: Skill Delivery Format Verification

### Findings

#### 2a. YAML Frontmatter Analysis

The SKILL.md frontmatter (lines 1-30) is:

```yaml
---
name: setup-claude-flow-ruvector
description: |
  Installs, configures, validates, and maintains claude-flow v3alpha and ruvector
  together. Understands the wiring between components...
model: opus
triggers:
  - "install claude-flow"
  - "install ruvector"
  - "setup claude-flow"
  ... (16 triggers total)
---
```

**Compared to the official Claude Code skill specification** (from the skill-builder skill at `/mnt/data/dev/CFV3/v3-branch/claude-flow-3/.claude/skills/skill-builder/SKILL.md`):

The specification states:
- **REQUIRED fields**: `name` (max 64 chars) and `description` (max 1024 chars)
- **Extra fields are ignored**: "Only `name` and `description` are used by Claude. Additional fields are ignored."
- **`name` format**: "Human-friendly display name" with "Title Case" recommended
- **`description` format**: Must include both "what" and "when" trigger conditions

**Issues found:**

| Issue | Severity | Detail |
|-------|----------|--------|
| `model` field not in spec | Low | Will be ignored by Claude Code. No harm but adds noise. If it was intended for a custom skill loader, document that. |
| `triggers` field not in spec | Low | Will be ignored by Claude Code. Claude uses the `description` field for matching, not a separate triggers array. Including triggers in the description would be more effective. |
| `name` not Title Case | Minor | Spec recommends Title Case. `setup-claude-flow-ruvector` is kebab-case. Should be `"Setup Claude-Flow + RuVector"` or similar. |
| `name` not quoted | Minor | Spec examples show quoted strings. Works without quotes but less defensive. |
| `description` length | OK | The multiline description is ~485 chars, well within the 1024 limit. |
| `description` "when" clause | Weak | The description says what the skill does but does not explicitly say WHEN to use it (e.g., "Use when installing, configuring, upgrading, or troubleshooting claude-flow and ruvector"). |

**Recommendation**: The frontmatter should be simplified to only the two required fields, with trigger keywords embedded in the description. The `model` and `triggers` fields should be removed or documented as custom extensions.

Corrected frontmatter would be:

```yaml
---
name: "Setup Claude-Flow + RuVector"
description: "Installs, configures, validates, and maintains claude-flow v3alpha and ruvector together. Understands wiring between components, silent fallbacks, and the learning pipeline. Covers @ruvector/* ecosystem including extensions, 55 hooks, 14 workers, 5 embed subsystems. Use when installing claude-flow, installing ruvector, setting up hooks, configuring learning, upgrading, troubleshooting, or working with ruvector extensions and workers."
---
```

#### 2b. Directory Structure Analysis

Current structure:
```
v0.5/
  SKILL.md           # Main skill file
  reference/         # 12 reference markdown files
  scripts/           # 3 shell scripts
```

**Compared to the official spec:**

The skill-builder spec defines:
```
skill-dir/
  SKILL.md           # REQUIRED
  scripts/           # Optional: executable scripts
  resources/         # Optional: templates, examples, schemas
  docs/              # Optional: additional documentation
```

**Issues:**

| Issue | Severity | Detail |
|-------|----------|--------|
| `reference/` not standard | Low | The spec uses `docs/` for additional documentation and `resources/` for supporting files. `reference/` is non-standard but functionally fine since Claude navigates via markdown links. |
| Missing `README.md` | None | Optional per spec. Not needed. |
| Skill location | Important | For this to work as a Claude Code skill, it must be placed at `~/.claude/skills/setup-claude-flow-ruvector/` (personal) or `.claude/skills/setup-claude-flow-ruvector/` (project). The current path `howto_V3+RV_Skill/v0.5/` is a development location, not a deployment location. The skill needs a deployment/install step. |

**Key finding**: The `reference/` directory name is non-standard but does not break anything. The markdown links in SKILL.md already point to `reference/` so they will work when the skill is deployed. If renamed to `docs/`, all internal links would need updating for no functional benefit.

#### 2c. Comparison with Existing Skills

Examined 35+ existing skills in `/mnt/data/dev/CFV3/v3-branch/claude-flow-3/.claude/skills/`. All use only `name` and `description` in frontmatter. None use `model` or `triggers`. Examples:

- `pair-programming/SKILL.md`: `name: Pair Programming`, `description: "AI-assisted pair programming..."`
- `hooks-automation/SKILL.md`: `name: Hooks Automation`, `description: "Automated coordination..."`
- `swarm-orchestration/SKILL.md`: `name: "Swarm Orchestration"`, `description: "Orchestrate multi-agent swarms..."`
- `skill-builder/SKILL.md`: `name: "Skill Builder"`, `description: "Create new Claude Code Skills..."`

All follow the two-field pattern. No existing skill in the codebase uses `model` or `triggers`.

#### 2d. Summary

The v0.5 skill is structurally sound but has non-standard frontmatter fields (`model`, `triggers`) that will be silently ignored by Claude Code. The `name` should be human-friendly Title Case. The directory structure works but uses `reference/` instead of the conventional `docs/`. These are cosmetic issues, not blockers.

---

## Item 3: Undiscovered Configuration Options

### Methodology

Ran `--help` for every relevant command. Compared all discovered options against what Q1-Q9 currently covers.

### claude-flow config subcommands

```
config init      -- Initialize configuration
config get       -- Get configuration value
config set       -- Set configuration value
config providers -- Manage AI providers
config reset     -- Reset configuration to defaults
config export    -- Export configuration
config import    -- Import configuration
```

**Note**: The `config` subcommands don't expose detailed `--help` for individual subcommands (all return the top-level help). The available operations are `config get <key>`, `config set <key> <value>`, `config export`, `config import`.

### claude-flow init flags (Step 1)

From `npx @claude-flow/cli@latest init --help`:

| Flag | Currently in Skill? | Notes |
|------|-------------------|-------|
| `--full` | Yes (Step 1) | Used in `init --full --start-all` |
| `--start-all` | Yes (Step 1) | Used in Step 1 |
| `--embedding-model` | Yes (Q6) | |
| `--minimal` | Not explicitly | Could be offered as alternative to `--full` |
| `--force` | Not offered | Useful for re-init. Mentioned in "Do NOT" section but not offered as Q option |
| `--skip-claude` | No | "Skip .claude/ directory creation (runtime only)" -- useful for CI/Docker |
| `--only-claude` | No | "Only create .claude/ directory (skip runtime)" -- useful for editor-only setup |
| `--start-daemon` | No | Alternative to `--start-all` that only starts daemon |
| `--with-embeddings` | No | "Initialize ONNX embedding subsystem with hyperbolic support" |
| `init wizard` | No | Interactive setup wizard |
| `init skills --all` | No | Install all available Claude Code skills |
| `init hooks --minimal` | No | Create minimal hooks configuration |
| `init upgrade` | Partially | In ACTION:UPGRADE but not in Q flow |
| `init check` | No | Check if Claude Flow is initialized |

**Missing from skill, should be added:**

1. **`--with-embeddings`**: This flag initializes the ONNX embedding subsystem during claude-flow init. Currently the skill only passes `--embedding-model` in Step 1. The `--with-embeddings` flag should also be passed to ensure the embedding subsystem is initialized.
   - **Proposed location**: Step 1, modify command to: `npx @claude-flow/cli@latest init --full --start-all --with-embeddings {Q6:cf-model}`
   - **Impact**: High. Without this flag, the claude-flow ONNX subsystem may not be properly initialized.

2. **`--skip-claude` / `--only-claude`**: Useful for CI/Docker environments or editor-only setups.
   - **Proposed location**: Q1 or Q3, as advanced init scope options.
   - **Impact**: Low. Edge case for non-standard deployments.

3. **`init skills --all`**: Installs all available Claude Code skills.
   - **Proposed location**: Q2 or post-init step, optional.
   - **Impact**: Medium. Skills extend Claude Code capability.

### claude-flow providers

From `npx @claude-flow/cli@latest providers --help`:

```
providers list       -- List available AI providers and models
providers configure  -- Configure provider settings and API keys
providers test       -- Test provider connectivity and API access
providers models     -- List and manage available models
providers usage      -- View provider usage and costs
```

**Not covered by Q1-Q9.** Provider configuration (which LLM backend to use for agents) is never asked. The skill assumes ANTHROPIC_API_KEY in prerequisites but doesn't offer multi-provider setup.

- **Proposed location**: New Q9b or extend Q9.
- **Impact**: Medium. Multi-provider support (OpenAI, Google, Cohere, Ollama) is a real use case.

### claude-flow plugins

From `npx @claude-flow/cli@latest plugins --help`:

```
plugins list      -- List installed and available plugins from IPFS registry
plugins search    -- Search plugins in the IPFS registry
plugins install   -- Install a plugin from IPFS registry or local path
plugins uninstall -- Uninstall a plugin
plugins upgrade   -- Upgrade an installed plugin
plugins toggle    -- Enable or disable a plugin
plugins info      -- Show detailed plugin information
plugins create    -- Scaffold a new plugin project
plugins rate      -- Rate a plugin (1-5 stars)
```

**Not covered by Q1-Q9.** Plugin management is never offered. The IPFS-based registry is a significant feature.

- **Proposed location**: Q2 or Q9 (advanced).
- **Impact**: Low-Medium. Plugin ecosystem extends functionality but is optional.

### claude-flow session

From `npx @claude-flow/cli@latest session --help`:

```
session list     -- List all sessions
session save     -- Save current session state
session restore  -- Restore a saved session
session delete   -- Delete a saved session
session export   -- Export session to file
session import   -- Import session from file
session current  -- Show current active session
```

**Not covered by Q1-Q9.** Session management (persist/restore working context across Claude Code restarts) is never offered.

- **Proposed location**: Post-init configuration or Q9.
- **Impact**: Medium. Session persistence is valuable for long-running projects.

### claude-flow hive-mind

From `npx @claude-flow/cli@latest hive-mind --help`:

```
hive-mind init           -- Initialize a hive mind
hive-mind spawn          -- Spawn worker agents (--claude to launch Claude Code)
hive-mind status         -- Show status
hive-mind task           -- Submit tasks
hive-mind join           -- Join an agent
hive-mind leave          -- Remove an agent
hive-mind consensus      -- Manage consensus proposals and voting
hive-mind broadcast      -- Broadcast message to all workers
hive-mind memory         -- Access hive shared memory
hive-mind optimize-memory -- Optimize hive memory
hive-mind shutdown       -- Shutdown
```

**Not covered by Q1-Q9.** Hive-mind is the advanced multi-agent consensus system. Currently the skill focuses on hook-based learning, not multi-agent coordination.

- **Proposed location**: Q9 (advanced).
- **Impact**: Low for initial setup, High for production multi-agent use.

### claude-flow security

From `npx @claude-flow/cli@latest security --help`:

```
security scan    -- Run security scan
security cve     -- Check/manage CVE vulnerabilities
security threats -- Threat modeling
security audit   -- Security audit logging
security secrets -- Detect secrets in codebase
security defend  -- AI manipulation defense (prompt injection, jailbreaks, PII)
```

**Not covered by Q1-Q9.** Security scanning is mentioned in the env vars (`RUVECTOR_SECURITY_SCAN`) but the claude-flow security subsystem is never explicitly configured.

- **Proposed location**: Q9 or post-init step.
- **Impact**: Medium. Security is important but often deferred.

### claude-flow performance

From `npx @claude-flow/cli@latest performance --help`:

```
performance benchmark  -- Run benchmarks
performance profile    -- Profile application
performance metrics    -- View metrics
performance optimize   -- Optimization recommendations
performance bottleneck -- Identify bottlenecks
```

**Not covered by Q1-Q9.** Performance profiling is never offered.

- **Proposed location**: Post-init validation or Q9.
- **Impact**: Low. Useful for optimization but not setup.

### ruvector hooks: Additional commands not in Q1-Q9

The full hooks listing shows 55 commands. Many are operational (used during development, not setup). However several are configurable:

| Command | Options | Currently in Skill? |
|---------|---------|-------------------|
| `hooks verify` | `--verbose` | Yes (Step 7) |
| `hooks stats` | (none) | Yes (Step 7) |
| `hooks learning-config` | `-t, -a, -l, -g, -e, --lambda, --list, --show` | Yes (Q5) -- BUT `--lambda` is missing |
| `hooks remember` | `-t, --silent, --semantic` | Covered (post-init-fix adds --semantic) |
| `hooks recall` | `-k, --semantic` | Covered |
| `hooks pretrain` | `--depth, --workers, --skip-git, --skip-files, --verbose` | Yes (Q7) |
| `hooks build-agents` | `--focus, --output, --format, --include-prompts` | Partially (Q4 covers --focus, but --output, --format, --include-prompts are missing) |
| `hooks watch` | `--path, --ignore, --dry-run` | Yes (Q9) -- BUT `--dry-run` missing |
| `hooks subscribe` | `--events, --format, --poll` | Partially (Q9 covers --events but not --format or --poll) |
| `hooks batch-learn` | `-f, -d, -t` | No |
| `hooks force-learn` | (none) | No |
| `hooks rag-context` | `-k, --rerank` | No |
| `hooks route-enhanced` | `--file` | No |
| `hooks ast-analyze` | `--json, --symbols, --imports` | No |
| `hooks diff-analyze` | `--json, --risk-only` | No |
| `hooks git-churn` | `--days, --top` | No |
| `hooks graph-mincut` | `--partitions` | No (mentioned in Feature Overlap but not in Q flow) |
| `hooks graph-cluster` | `--method, --clusters` | No |
| `hooks security-scan` | `--json` | No |
| `hooks coedit-record` | `-p, -r` | No |
| `hooks error-record` | `-e, -x, -f` | No |
| `hooks trajectory-begin` | `-c, -a` | No |
| `hooks pre-compact` | `--auto` | No |

### ruvector embed: Additional options

| Command | Options | Currently in Skill? |
|---------|---------|-------------------|
| `embed text` | `--adaptive, --domain, -o` | No |
| `embed adaptive` | `--stats, --consolidate, --reset, --export, --import` | Partially (--stats in Step 7, but --consolidate, --export, --import missing) |
| `embed neural` | `--health, --consolidate, --calibrate, --swarm-status, --drift-stats, --memory-stats, --demo, --dimension` | No |
| `embed optimized` | `--cache-size, --stats, --clear-cache, --benchmark` | Partially (--cache-size in Q6b) |
| `embed benchmark` | `--iterations` | No |

### ruvector attention: Not in Q flow at all

| Command | Options |
|---------|---------|
| `attention list` | `--verbose` |
| `attention compute` | `-q, -k, -v, -t, -h, -d, --curvature, -o` |
| `attention benchmark` | `-d, -n, -i, -t` |
| `attention hyperbolic` | `-a, -v, -b, -c, -o` |

None of these are in Q1-Q9. Attention is a post-install operational tool, not setup, but benchmarking could be part of validation.

### Summary of Missing Options by Proposed Question Group

**Q3 (Init scope) -- add these flags:**
- `--force` (overwrite existing settings)
- Note about combining flags (DONE -- applied to SKILL.md)

**Q4 (Agent generation) -- add these options:**
- `--output <dir>` (default `.claude/agents`)
- `--format yaml|json|md` (default `yaml`)
- `--include-prompts` (include detailed system prompts)

**Q5 (Learning) -- add:**
- `--lambda <value>` for TD(lambda) algorithm
- `hooks batch-learn` as post-setup seeding option
- `hooks force-learn` as operational command

**Q6 (Embeddings) -- add:**
- `embed text --adaptive --domain <domain>` for domain-specific embedding
- `embed adaptive --consolidate` for EWC consolidation
- `embed adaptive --export/--import` for weight portability
- `embed neural --calibrate` for coherence baseline calibration
- `embed neural --dimension <n>` for custom neural substrate dimension

**Q7 (Pretrain) -- complete, no missing flags**

**Q8 (Workers) -- add:**
- `native benchmark` for performance benchmarking native workers
- `native compare` to compare native vs agentic-flow workers

**Q9 (Advanced) -- add:**
- `hooks watch --dry-run` to preview without saving
- `hooks subscribe --format text|json` and `--poll <ms>`
- `hooks graph-mincut --partitions <n>` for code boundary analysis
- `hooks graph-cluster --method spectral|louvain --clusters <n>`
- `hooks rag-context -k <n> --rerank` for RAG-enhanced context
- `hooks route-enhanced --file <file>` for enhanced routing
- `hooks git-churn --days <n> --top <n>` for hotspot analysis
- `hooks ast-analyze --json` for AST extraction
- `hooks diff-analyze --risk-only` for risk scoring

**New Q10 (claude-flow post-init) -- proposed:**
- `providers configure -p <provider>` for multi-LLM setup
- `plugins list` / `plugins install` for plugin ecosystem
- `session save/restore` for session persistence
- `security scan` for initial security baseline
- `performance benchmark` for baseline metrics
- `hive-mind init` for multi-agent consensus setup
- `init skills --all` to install Claude Code skills

**Step 1 fix needed:**
- Add `--with-embeddings` flag to `npx @claude-flow/cli@latest init --full --start-all --with-embeddings {Q6:cf-model}`

---

## Item 4: End-to-End Test Plan

### Purpose

Validate the complete skill works from clean directory to fully operational setup.

### Prerequisites

- Node.js >= 20
- npm >= 9
- Git installed
- `ANTHROPIC_API_KEY` set in environment
- Platform build tools installed (run `npx ruvector setup` for list)
- Internet access (for npm install and ONNX model download)

### Test Configuration (example Q answers)

```
Q1: Fresh install
Q2a: --all (install all via ruvector installer)
Q2b: @ruvector/sona @ruvector/attention (two npm packages)
Q2c: @claude-flow/memory @claude-flow/security (two npm packages)
Q2d: (skip)
Q3: --fast (full init with fast wrapper)
Q4: --build-agents quality
Q5: defaults (skip)
Q6a: all-MiniLM-L6-v2, 384d (default)
Q6b: (skip)
Q7: --verbose (full pretrain)
Q8: native run security --path .
Q9: (skip)
```

### Step-by-Step Test Execution

#### Phase 0: Clean Slate

```bash
# Create isolated test directory
TEST_DIR=$(mktemp -d)/cf-rv-test
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"
npm init -y
git init
git add package.json
git commit -m "init"
```

**Verify:**
- `[ -f package.json ] && echo PASS` --> PASS
- `[ -d .git ] && echo PASS` --> PASS
- No `.claude/` or `.ruvector/` directories exist

---

#### Phase 1: ACTION:CLEAN-INSTALL

```bash
# Step: Install core packages
npm install claude-flow@latest ruvector@latest

# Step: Install via ruvector installer
npx ruvector install --all

# Step: Install additional npm packages (Q2b, Q2c)
npm install @ruvector/sona @ruvector/attention @claude-flow/memory @claude-flow/security

# Step: Verify installed packages
npx ruvector install --list
npx ruvector doctor --verbose
```

**Verify after Phase 1:**

| Check | Command | Expected |
|-------|---------|----------|
| claude-flow binary | `npx @claude-flow/cli@latest --version` | Version string (e.g., `3.0.0-alpha.190`) |
| ruvector binary | `npx ruvector --version` | Version string (e.g., `0.1.96`) |
| install --list | `npx ruvector install --list` | Shows checkmarks for installed packages |
| doctor | `npx ruvector doctor --verbose` | "All checks passed" or specific warnings |
| Q2b packages | `node -e "require('@ruvector/sona')"` | No error |
| Q2c packages | `node -e "require('@claude-flow/memory')"` | No error |

---

#### Phase 2: ACTION:INIT-SEQUENCE Step 1 (claude-flow init)

```bash
npx @claude-flow/cli@latest init --full --start-all
```

**Verify:**

| Check | Command | Expected |
|-------|---------|----------|
| settings.json exists | `test -f .claude/settings.json && echo PASS` | PASS |
| memory.db exists | `test -f .swarm/memory.db && echo PASS` | PASS |
| .claude directory | `ls .claude/` | settings.json, possibly other files |

---

#### Phase 3: INIT-SEQUENCE Step 2 (ruvector system check)

```bash
npx ruvector doctor --verbose
npx ruvector install --list
```

**Verify:**
- Doctor passes or shows only non-critical warnings
- install --list shows expected checkmarks

---

#### Phase 4: INIT-SEQUENCE Step 3 (hooks init -- NO --pretrain)

```bash
npx ruvector hooks init --fast --build-agents quality
```

**Verify:**

| Check | Command | Expected |
|-------|---------|----------|
| hooks verify | `npx ruvector hooks verify --verbose` | 8/8 checks pass |
| hooks stats | `npx ruvector hooks stats` | Shows 0 memories (not yet pretrained) |
| Agent configs | `ls .claude/agents/` | YAML files for quality-focused agents |
| Fast wrapper | `test -x .claude/ruvector-fast.sh && echo PASS` | PASS (if --fast used) |
| No pretrain | Check intelligence.json has 0 memories or doesn't exist | 0 memories |

**Anti-check: Verify NO --pretrain was used:**
```bash
# If intelligence.json exists, memories should be 0
node -e '
  var fs = require("fs");
  try {
    var d = JSON.parse(fs.readFileSync(".ruvector/intelligence.json"));
    var count = (d.memories || []).length;
    console.log(count === 0 ? "PASS: 0 memories" : "FAIL: " + count + " memories (pretrain ran!)");
  } catch(e) {
    console.log("PASS: no intelligence.json yet");
  }
'
```

---

#### Phase 5: INIT-SEQUENCE Step 4 (post-init-fix -- MANDATORY)

```bash
bash scripts/post-init-fix.sh all-MiniLM-L6-v2 384
```

**Note:** The `scripts/` directory must be accessible. In a deployed skill, this would be at the skill's location. For testing, copy scripts from the skill directory or run from the skill path.

**Verify:**

| Check | Command | Expected |
|-------|---------|----------|
| SEMANTIC_EMBEDDINGS | `node -e 'var s=JSON.parse(require("fs").readFileSync(".claude/settings.json"));console.log(s.env.RUVECTOR_SEMANTIC_EMBEDDINGS)'` | `true` |
| EMBEDDING_MODEL | `node -e 'var s=JSON.parse(require("fs").readFileSync(".claude/settings.json"));console.log(s.env.RUVECTOR_EMBEDDING_MODEL)'` | `all-MiniLM-L6-v2` |
| EMBEDDING_DIM | `node -e 'var s=JSON.parse(require("fs").readFileSync(".claude/settings.json"));console.log(s.env.RUVECTOR_EMBEDDING_DIM)'` | `384` |
| --semantic on hooks | `grep -c "\-\-semantic" .claude/settings.json` | >= 1 |
| Timeouts increased | `node -e 'var s=JSON.parse(require("fs").readFileSync(".claude/settings.json"));var h=s.hooks||{};var found=false;Object.values(h).forEach(function(arr){if(!Array.isArray(arr))return;arr.forEach(function(e){(e.hooks||[]).forEach(function(hk){if(hk.command&&hk.command.indexOf("remember")!==-1&&hk.timeout>=5000)found=true})})});console.log(found?"PASS":"FAIL")'` | PASS |
| 13 base env vars | Script output shows "OK: All 13 base env vars present" | OK |

---

#### Phase 6: INIT-SEQUENCE Step 5 (pretrain)

```bash
npx ruvector hooks pretrain --verbose
```

**Verify:**

| Check | Command | Expected |
|-------|---------|----------|
| Memories created | `npx ruvector hooks stats` | Shows > 0 memories |
| Semantic recall works | `npx ruvector hooks recall "project" -k 1 --semantic` | Returns result with similarity score |
| No NULL embeddings | `node -e 'var d=JSON.parse(require("fs").readFileSync(".ruvector/intelligence.json"));var nulls=(d.memories||[]).filter(function(m){return m.embedding===null}).length;console.log(nulls===0?"PASS: no NULL embeddings":"FAIL: "+nulls+" NULL embeddings")'` | PASS: no NULL embeddings |
| Embedding dimension | `node -e 'var d=JSON.parse(require("fs").readFileSync(".ruvector/intelligence.json"));var m=d.memories||[];if(m.length>0&&m[0].embedding){console.log("dim="+m[0].embedding.length)}else{console.log("FAIL: no embeddings")}'` | `dim=384` |

---

#### Phase 7: INIT-SEQUENCE Step 5b (learning config -- skip if defaults)

For this test, we use defaults so this step is skipped.

**Verify defaults:**
```bash
npx ruvector hooks learning-config --show
```
Expected output should show default algorithms (double-q for agent-routing, sarsa for error-avoidance, etc.).

---

#### Phase 8: INIT-SEQUENCE Step 6 (MCP server registration)

```bash
claude mcp add claude-flow -- npx -y @claude-flow/cli@latest
claude mcp add ruvector -- npx -y ruvector mcp start
```

**Verify:**
```bash
npx ruvector mcp info
```
Expected: Shows MCP server information.

**Also verify in settings.json:**
```bash
node -e '
  var s = JSON.parse(require("fs").readFileSync(".claude/settings.json"));
  var mcp = s.mcpServers || {};
  console.log("claude-flow:", !!mcp["claude-flow"] ? "PASS" : "FAIL");
  console.log("ruvector:", !!mcp["ruvector"] ? "PASS" : "FAIL");
'
```

---

#### Phase 9: INIT-SEQUENCE Step 7 (daemon + deep validation)

```bash
npx @claude-flow/cli@latest daemon start
npx @claude-flow/cli@latest doctor --fix
npx ruvector hooks verify --verbose
npx ruvector hooks stats
npx ruvector hooks learning-config --show
npx ruvector embed adaptive --stats
npx ruvector doctor --verbose
```

**Then run the deep validation script:**
```bash
bash scripts/validate-setup.sh
```

**Verify:**

| Check | Expected |
|-------|----------|
| validate-setup.sh exit code | 0 (all pass) or 0 with warnings |
| validate-setup.sh FAIL count | 0 |
| daemon status | Running |
| hooks verify | 8/8 pass |
| memories present | > 0 with proper embeddings |

---

#### Phase 10: INIT-SEQUENCE Step 8 (workers -- optional)

```bash
npx ruvector native run security --path .
```

**Verify:**
- Command completes without error
- Security analysis output is displayed

---

#### Phase 11: Full Pipeline Smoke Test

After setup is complete, verify the learning pipeline works end-to-end:

```bash
# 1. Store a new memory via remember hook
npx ruvector hooks remember "test authentication pattern with JWT" -t pattern --semantic

# 2. Recall it via semantic search
npx ruvector hooks recall "JWT auth" -k 1 --semantic

# 3. Verify recall returns the memory with similarity score
# Expected: Result containing "authentication pattern" with score > 0

# 4. Route a task
npx ruvector hooks route "implement user login"

# 5. Check learning stats updated
npx ruvector hooks learning-stats

# 6. Force a learning cycle
npx ruvector hooks force-learn
```

**Verify:**

| Check | Expected |
|-------|----------|
| remember returns without error | Success |
| recall returns the stored memory | Match with similarity > 0 |
| route returns agent recommendation | Agent type recommendation |
| learning-stats shows updates | Total Updates >= 0 (may still be 0 on cold start) |

---

### Pass/Fail Criteria

**PASS:** All Phase checks pass. `validate-setup.sh` reports 0 failures. Semantic recall returns results with similarity scores. No NULL embeddings.

**FAIL:** Any of:
- `validate-setup.sh` reports failures (not just warnings)
- Semantic recall returns empty results
- NULL embeddings found after pretrain
- post-init-fix.sh reports errors
- settings.json missing RUVECTOR_SEMANTIC_EMBEDDINGS=true after fix

### Known Acceptable Warnings

- MCP servers may not register via `claude mcp add` in non-interactive environments
- Q-learning stats showing 0 updates (cold start is expected)
- agentic-flow not available (workers will silently fail -- this is documented)
- rvlite backend not installed (if RUVECTOR_MEMORY_BACKEND=rvlite)
- TinyDancer not loading (native-only, platform dependent)

---

## Cross-Item Summary

| Item | Status | Action |
|------|--------|--------|
| 1. Q3 Multiselect | COMPLETE | Note added to SKILL.md after Q3 table |
| 2. Frontmatter Format | DOCUMENTED | Non-standard fields found (`model`, `triggers`); `name` should be Title Case; `reference/` is non-standard but functional |
| 3. Missing Options | DOCUMENTED | 30+ undiscovered options across 8 command groups; Step 1 should add `--with-embeddings`; Q5 missing `--lambda`; Q4 missing `--output/--format/--include-prompts`; new Q10 proposed for claude-flow post-init features |
| 4. Test Plan | COMPLETE | 11-phase plan with exact commands, expected outputs, pass/fail criteria |

---

*Report generated by Research Agent 1, Opus 4.5. All --help outputs captured from live CLI execution on 2026-01-31.*
