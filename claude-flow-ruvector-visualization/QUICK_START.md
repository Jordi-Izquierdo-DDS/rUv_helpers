# RuVector Visualization - Quick Start Guide

## ✅ Issue Fixed

The MIME type error has been resolved. The server now properly serves JavaScript files with the correct `application/javascript` content type.

## 🚀 How to Start

### Method 1: Simple Node Server (Recommended)

```bash
cd /mnt/data/dev/test/ruvector-viz
node server.js
```

Then open: **http://localhost:3333**

### Method 2: Development Mode with Vite

```bash
cd /mnt/data/dev/test/ruvector-viz
npm run dev
```

This runs:
- Node.js API server on port **3333**
- Vite dev server on port **5173** (with hot reload)

Open: **http://localhost:5173**

## ❌ Don't Use VS Code Live Server

**Problem**: VS Code Live Server (port 5500) doesn't work because:
- No Node.js backend running
- No `/api/graph` endpoint
- Can't load v3 stats from RuVector database

**Solution**: Always use the Node.js server (port 3333) or npm dev mode.

## 🎨 What You'll See

### Main Visualization
- **1,942 nodes** representing RuVector memories
- **6,899 edges** showing semantic connections
- Interactive force-directed graph
- Color-coded by namespace
- Zoom and pan controls

### V3 Learning Panel
Click the **"🧠 v3 Learning"** button to see:

#### SONA Engine Stats
- Trajectories Recorded
- Micro-LoRA Updates
- Base-LoRA Updates
- EWC++ Consolidations
- Patterns Learned

#### Intelligence Layer Stats
- Total Memories
- Total Patterns
- Q-Learning Rewards
- Attention Mechanisms Active
- GNN Layers

### Other Features
- **📅 Timeline** - Filter memories by date
- **📊 Metrics** - Graph statistics
- **🔍 Search** - Semantic search through memories
- **⚙ Settings** - Customize colors, sizes, layouts

## 🛠️ Controls

| Button | Function |
|--------|----------|
| ↻ Refresh | Reload data from database |
| ⊡ Fit View | Center and zoom to fit all nodes |
| ⏸ Simulation | Pause/resume force simulation |
| 📅 Timeline | Show timeline filter |
| 📊 Metrics | Show detailed metrics |
| 🧠 v3 Learning | Show SONA & Intelligence stats |
| 🔍 Search | Semantic search panel |
| ⚙ Settings | Customize visualization |

## 📊 API Endpoints

### Get Graph Data
```bash
curl http://localhost:3333/api/graph
```

Returns:
```json
{
  "nodes": [...],
  "edges": [...],
  "meta": {
    "totalNodes": 1942,
    "totalEdges": 6899,
    "ruvectorVersion": "v3 (0.1.96)",
    "features": ["SONA", "Attention", "GNN", "Q-Learning"]
  },
  "v3": {
    "sona": {...},
    "intelligence": {...}
  },
  "timeline": {...},
  "metrics": {...}
}
```

## 🔧 Troubleshooting

### Port Already in Use
```bash
# Kill existing server
pkill -f "node server.js"

# Or use a different port
PORT=3334 node server.js
```

### Database Not Found
```bash
# Check database exists
ls -lh /mnt/data/dev/Veracy_ODCS/.ruvector/metadata.db

# If missing, the path in server.js may need updating
```

### V3 Stats Showing Zeros
This is normal! V3 stats populate as your system learns:
- **SONA stats** update as trajectories complete
- **Intelligence stats** accumulate over time
- Run operations in Veracy_ODCS to generate learning data

### JavaScript Not Loading
✅ **Fixed!** The server now properly serves `.js` files with correct MIME types.

If you still see issues:
1. Clear browser cache (Ctrl+F5)
2. Check browser console for errors
3. Verify server is running on port 3333
4. Make sure you're NOT using VS Code Live Server

## 📁 File Structure

```
ruvector-viz/
├── server.js              # Node.js backend (port 3333)
├── index.html             # Main visualization page
├── src/
│   └── main.js           # Visualization logic
├── extract-data.js        # Data export tool
├── package.json           # Dependencies
├── vite.config.js         # Vite config
└── QUICK_START.md         # This file
```

## 🎯 Next Steps

1. **Start the server**:
   ```bash
   cd /mnt/data/dev/test/ruvector-viz
   node server.js
   ```

2. **Open in browser**: http://localhost:3333

3. **Explore the visualization**:
   - Pan and zoom the graph
   - Click "🧠 v3 Learning" to see SONA stats
   - Try the semantic search feature
   - Adjust colors and sizes in Settings

4. **Monitor learning**:
   - Watch SONA metrics increase over time
   - See which attention mechanisms are active
   - Track pattern learning progress

## 📚 Learn More

- **Full V3 Upgrade Details**: See `../V3_UPGRADE_SUMMARY.md`
- **Claude-Flow Capabilities**: See `../.claude-flow/CAPABILITIES.md`
- **Configuration**: See `../.claude-flow/config.yaml`

---

**Version**: v3 (0.1.96)
**Updated**: 2026-01-21
**Status**: ✅ Working
