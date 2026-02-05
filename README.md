# rUv Helpers

Collection of utilities, skills, and helpers for AI-assisted development workflows.

## Contents

### [claude-flow-ruvector-install-skill](./claude-flow-ruvector-install-skill/)

Comprehensive installation guide and Claude Code skill for integrating:

- **Claude Flow v3** - Multi-agent orchestration CLI with MCP server
- **RuVector** - Self-learning intelligence system with SONA neural compression
- **5-Database Architecture** - Unified memory across SQLite and vector stores

#### Quick Links

| Document | Description |
|----------|-------------|
| [QUICKSTART.md](./claude-flow-ruvector-install-skill/QUICKSTART.md) | Get running in 5 minutes |
| [INSTALL.md](./claude-flow-ruvector-install-skill/INSTALL.md) | Full installation guide |
| [SKILL.md](./claude-flow-ruvector-install-skill/SKILL.md) | Claude Code skill definition |
| [ARCHITECTURE.md](./claude-flow-ruvector-install-skill/ARCHITECTURE.md) | System architecture overview |
| [MIGRATION.md](./claude-flow-ruvector-install-skill/MIGRATION.md) | Upgrade from v2 to v3 |

#### Features

- 🧠 **Self-Learning Memory** - Persistent patterns across sessions
- 🐝 **Swarm Orchestration** - Multi-agent coordination with hierarchical topology
- ⚡ **HNSW Vector Search** - 150x-12,500x faster similarity search
- 🔄 **SONA Compression** - Neural pattern consolidation
- 📊 **WebGL Visualization** - Real-time 3D memory graph dashboard

#### Installation

```bash
# Quick install
npx @claude-flow/cli@latest init --wizard

# Add MCP server to Claude Code
claude mcp add claude-flow -- npx -y @claude-flow/cli@latest

# Verify
npx @claude-flow/cli@latest doctor
```

See [INSTALL.md](./claude-flow-ruvector-install-skill/INSTALL.md) for detailed instructions.

## Version

- **Skill Version**: 0.9.9
- **Claude Flow**: v3.x (latest)
- **RuVector**: v0.7.x

## License

MIT

---

*Built with Claude Code + Claude Flow + RuVector*
