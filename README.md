# rUv Helpers

Collection of utilities, skills, and helpers for AI-assisted development workflows.

## Contents

### [claude-flow-ruvector-install-skill](./claude-flow-ruvector-install-skill/)

Comprehensive installation guide and Claude Code skill for integrating:

- **Claude Flow v3** - Multi-agent orchestration CLI with MCP server
- **RuVector** - Self-learning intelligence system with SONA neural compression
- **5-Database Architecture** - Unified memory across SQLite and vector stores

| Document | Description |
|----------|-------------|
| [QUICKSTART.md](./claude-flow-ruvector-install-skill/QUICKSTART.md) | Get running in 5 minutes |
| [INSTALL.md](./claude-flow-ruvector-install-skill/INSTALL.md) | Full installation guide |
| [SKILL.md](./claude-flow-ruvector-install-skill/SKILL.md) | Claude Code skill definition |

---

### [claude-flow-ruvector-visualization](./claude-flow-ruvector-visualization/)

WebGL 3D visualization dashboard for RuVector memory and Claude Flow agents:

- **Three.js Force Graph** - Interactive 3D memory visualization
- **5 Dashboard Panels** - System Health, Memory, Learning, SONA, Agent Swarm
- **Real-Time Metrics** - Live data from intelligence.db
- **20+ API Endpoints** - Full REST API for all metrics

| Document | Description |
|----------|-------------|
| [README.md](./claude-flow-ruvector-visualization/README.md) | Setup and architecture |
| [QUICK_START.md](./claude-flow-ruvector-visualization/QUICK_START.md) | Fast setup guide |

```bash
# Quick start
cd claude-flow-ruvector-visualization
npm install
node server.js
# Open http://localhost:3333
```

---

## Quick Install (Both Components)

```bash
# 1. Install Claude Flow + RuVector
npx @claude-flow/cli@latest init --wizard

# 2. Add MCP server
claude mcp add claude-flow -- npx -y @claude-flow/cli@latest

# 3. Start visualization
cd claude-flow-ruvector-visualization
npm install && node server.js
```

## Features

| Feature | Install Skill | Visualization |
|---------|---------------|---------------|
| Claude Flow v3 CLI | ✅ | - |
| RuVector Intelligence | ✅ | ✅ (displays) |
| SONA Compression | ✅ | ✅ (metrics) |
| 5-Database Setup | ✅ | ✅ (queries) |
| WebGL 3D Graph | - | ✅ |
| Dashboard Panels | - | ✅ |
| Learning Analytics | - | ✅ |

## Version

- **Install Skill**: v0.9.9
- **Visualization**: v2.0.0
- **Claude Flow**: v3.x
- **RuVector**: v0.7.x

## License

MIT

---

*Built with Claude Code + Claude Flow + RuVector*
