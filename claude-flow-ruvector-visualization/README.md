# Claude Flow + RuVector Visualization Dashboard

> **WebGL 3D visualization** for RuVector self-learning memory and Claude Flow agent orchestration

![Three.js](https://img.shields.io/badge/Three.js-black?logo=three.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)

## Features

- 🌐 **3D Force-Directed Graph** - Visualize memories, patterns, and trajectories
- 📊 **5 Dashboard Panels** - System Health, Memory Explorer, Learning Analytics, SONA Neural, Agent Swarm
- ⚡ **Real-Time Updates** - Live data from intelligence.db
- 🎨 **Multiple Color Modes** - By type, Q-value, reward, confidence, temporal
- 🔍 **GPU-Accelerated Picking** - Click nodes for details
- 📈 **Learning Metrics** - Q-value distribution, reward trends, trajectory outcomes

## Quick Start

```bash
# Install dependencies
npm install

# Start development server (with hot reload)
npm run dev

# Or start production server
node server.js
```

Then open: **http://localhost:3333**

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    WebGL Frontend (Three.js)                │
├─────────────────────────────────────────────────────────────┤
│  NodeRenderer │ EdgeRenderer │ HyperedgeRenderer │ Shaders  │
├─────────────────────────────────────────────────────────────┤
│              Dashboard Panels (TypeScript)                  │
│  System Health │ Memory │ Learning │ SONA │ Agent Swarm    │
├─────────────────────────────────────────────────────────────┤
│                Express.js API Server                        │
│  /api/graph │ /api/system-health │ /api/learning-*         │
├─────────────────────────────────────────────────────────────┤
│              SQLite Database (intelligence.db)              │
│  memories │ patterns │ trajectories │ neural_patterns       │
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
claude-flow-ruvector-visualization/
├── src/
│   ├── main-three.ts          # Main Three.js application
│   ├── main.js                # Alternative D3 visualization
│   ├── renderer/              # WebGL renderers
│   │   ├── NodeRenderer.ts    # GPU instanced nodes
│   │   ├── EdgeRenderer.ts    # Edge lines
│   │   └── shaders/           # GLSL shaders
│   ├── panels/                # Dashboard UI panels
│   │   └── learning/          # Learning analytics panels
│   ├── interaction/           # Mouse/touch handling
│   ├── simulation/            # Force simulation
│   ├── lod/                   # Level-of-detail & culling
│   └── ui/                    # Color modes, tooltips
├── server/
│   ├── config/db-paths.js     # Database path configuration
│   ├── routes/                # API route handlers
│   └── utils/                 # Safe number utilities
├── server.js                  # Main Express server (~7000 lines)
├── extract-data.js            # Data extraction utilities
├── index.html                 # Main HTML entry
├── package.json               # Dependencies
├── tsconfig.json              # TypeScript config
└── vite.config.js             # Vite bundler config
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `/api/graph` | Full graph data (nodes + edges) |
| `/api/system-health` | Health metrics, table counts |
| `/api/live-status` | Real-time activity feed |
| `/api/learning-algorithms` | Q-learning, SARSA data |
| `/api/neural-patterns` | SONA compressed patterns |
| `/api/memories-timeline` | Memory creation over time |
| `/api/trajectories-gantt` | Trajectory outcomes |
| `/api/vector-stats` | Vector index statistics |
| `/api/pipeline-stats` | Learning pipeline metrics |

## Dashboard Panels

### 1. System Health
- Health score gauge
- Database size trend
- Activity timeline
- Key metrics (Q-value, coverage)

### 2. Memory Explorer
- Type distribution pie chart
- Memory timeline (daily/hourly)
- Searchable memory table
- Embedding quality gauge

### 3. Learning Analytics
- Q-value distribution histogram
- State-action heatmap
- Trajectory outcomes (success/fail)
- Reward trend over time
- Learning velocity chart

### 4. SONA & Neural
- Pattern categories treemap
- Compression status
- Confidence distribution
- Embedding health

### 5. Agent & Swarm
- Agent memory stats
- Vector index info
- System configuration
- Learning pipeline

## Configuration

Database paths are configured in `server/config/db-paths.js`:

```javascript
export const INTELLIGENCE_DB = '.ruvector/intelligence.db';
export const SWARM_MEMORY_DB = '.swarm/memory.db';
export const CLAUDE_MEMORY_DB = '.claude/memory.db';
```

## Development

```bash
# TypeScript watch mode
npm run dev

# Build for production
npm run build

# Run server only
node server.js
```

## Requirements

- Node.js 18+
- Modern browser with WebGL2 support
- intelligence.db (created by RuVector)

## Related

- [claude-flow-ruvector-install-skill](../claude-flow-ruvector-install-skill/) - Installation guide
- [Claude Flow](https://github.com/ruvnet/claude-flow) - Multi-agent orchestration
- [RuVector](https://github.com/ruvnet/ruvector) - Self-learning intelligence

## License

MIT

---

*Part of the [rUv Helpers](https://github.com/Jordi-Izquierdo-DDS/rUv_helpers) collection*
