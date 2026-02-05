# Claude Flow + RuVector Installation Skill

> **Version 0.9.9** | Claude Code Skill for installing and configuring the complete V3 learning stack

## What This Installs

| Component | Description |
|-----------|-------------|
| **Claude Flow v3** | Multi-agent orchestration CLI with 26 commands, 140+ subcommands |
| **RuVector** | Self-learning intelligence with SONA neural compression |
| **MCP Server** | Model Context Protocol integration for Claude Code |
| **5-Database Architecture** | Unified memory across SQLite + vector stores |
| **WebGL Visualization** | Real-time 3D memory graph dashboard |

## Quick Start

```bash
# 1. Run the setup script
./scripts/setup.sh

# 2. Add MCP server to Claude Code
claude mcp add claude-flow -- npx -y @claude-flow/cli@latest

# 3. Verify installation
npx @claude-flow/cli@latest doctor --fix
```

Or follow the detailed [INSTALL.md](./INSTALL.md) guide.

## Documentation

| File | Purpose |
|------|---------|
| [QUICKSTART.md](./QUICKSTART.md) | 5-minute setup guide |
| [INSTALL.md](./INSTALL.md) | Complete installation walkthrough |
| [SKILL.md](./SKILL.md) | Claude Code skill definition (copy to `.claude/skills/`) |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design and data flow |
| [MIGRATION.md](./MIGRATION.md) | Upgrading from V2 to V3 |
| [CHANGELOG.md](./CHANGELOG.md) | Version history |

## Directory Structure

```
claude-flow-ruvector-install-skill/
├── INSTALL.md              # Main installation guide
├── SKILL.md                # Claude Code skill file
├── QUICKSTART.md           # Fast setup
├── ARCHITECTURE.md         # System design
├── MIGRATION.md            # V2 → V3 upgrade
├── CHANGELOG.md            # Version history
├── scripts/
│   ├── setup.sh            # Main setup script
│   ├── validate-setup.sh   # Verify installation
│   ├── diagnose-db.sh      # Database diagnostics
│   ├── pre-upgrade.sh      # Pre-upgrade backup
│   └── templates/          # Config templates
├── packages/
│   ├── sona-shim/          # SONA compatibility layer
│   ├── sona-fallback/      # Fallback when SONA unavailable
│   └── ruvector-storage/   # Storage abstraction
├── fixes/
│   └── ruvector/           # Patches for RuVector CLI
└── reference/
    ├── troubleshooting.md  # Common issues & solutions
    ├── daily-workflow.md   # Day-to-day usage
    └── ...                 # Deep-dive documentation
```

## Key Features

### 🧠 Self-Learning Memory
- Persistent patterns across sessions
- Q-learning for optimal agent routing
- 384-dimensional embeddings (all-MiniLM-L6-v2)

### 🐝 Swarm Orchestration
- Hierarchical topology (anti-drift)
- Queen-led coordination
- Up to 15 concurrent agents

### ⚡ Performance
- HNSW vector search: 150x-12,500x faster
- Flash Attention: 2.49x-7.47x speedup
- <100ms MCP response times

### 📊 Visualization Dashboard
- WebGL 3D memory graph
- Real-time metrics
- Learning analytics

## Databases Created

| Database | Location | Purpose |
|----------|----------|---------|
| intelligence.db | `.ruvector/` | RuVector memory, Q-learning, SONA |
| memory.db | `.swarm/` | Claude Flow swarm coordination |
| memory.db | `.claude/` | Claude Code integration |
| patterns.db | `.claude-flow/learning/` | Pattern promotion pipeline |
| ruvector.db | project root | Native HNSW vector index |

## Requirements

- Node.js 20+
- Claude Code CLI
- ~500MB disk space

## Using the Skill

After installation, invoke in Claude Code:

```
/claude-flow-ruvector-install
```

Or copy `SKILL.md` to your `.claude/skills/` directory.

## Troubleshooting

See [reference/troubleshooting.md](./reference/troubleshooting.md) for common issues.

Quick diagnostics:
```bash
./scripts/diagnose-db.sh
npx @claude-flow/cli@latest doctor
```

## License

MIT

---

*Part of the [rUv Helpers](https://github.com/Jordi-Izquierdo-DDS/rUv_helpers) collection*
