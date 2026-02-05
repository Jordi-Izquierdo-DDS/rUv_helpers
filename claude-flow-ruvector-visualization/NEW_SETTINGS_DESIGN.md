# RuVector Visualization - New Settings Design

## Proposed Settings Structure (Organized by Tabs)

### 📊 Tab 1: NODE APPEARANCE

#### Color Mode
- [x] Single Color (color picker)
- [x] Namespace (with color customization)
- [x] Connectivity (gradient)
- [x] Time (gradient)
- [x] Rate (gradient)
- [x] Char Length (gradient)
- [x] Word Count (gradient)
- [x] Content Type (JSON/YAML/Plain)
- [x] Namespace Depth (depth-based)
- [x] Key Prefix (categorical)
- **[NEW] Memory Type** (agent_spawn, command, protocol, pattern, etc.)
- **[NEW] Data Source** (metadata.db vs intelligence.json)
- **[NEW] Reward Value** (for trajectories - gradient)
- **[NEW] Learning Algorithm** (Q-Learning, SARSA, PPO, etc.)

#### Size Mode
- [x] Fixed (slider)
- [x] Connectivity
- [x] Rate
- [x] Char Length
- [x] Word Count
- **[NEW] Reward Value**
- **[NEW] Visit Count** (Q-learning patterns)
- **[NEW] Recency** (time-based)

#### Opacity
- [x] Node Opacity (slider)
- [x] Link Opacity (slider)

---

### 🔗 Tab 2: EDGE/LINK APPEARANCE

#### Link Settings
- [x] Link Color (color picker)
- [x] Link Width (slider)
- [x] Link Width Mode
  - Fixed
  - Similarity-based
  - **[NEW] Shared Trajectory** (thicker if nodes in same trajectory)

---

### 🎯 Tab 3: DATA FILTERS

#### Primary Sources
- [x] metadata.db (1,942 nodes)
- [x] intelligence.json (845 nodes)
- [ ] vectors.db (binary - needs decoder)
- [ ] knowledge-graph.db (binary - needs decoder)

#### Intelligence Sub-Filters (NEW)
**Memory Types:**
- [ ] All (845)
- [ ] agent_spawn
- [ ] command
- [ ] protocol
- [ ] pattern
- [ ] user-directive
- [ ] theme-pattern
- [ ] Other types

**Learning Data:**
- [ ] Show Trajectories (439 items)
- [ ] Show Q-Patterns (56 items)
- [ ] Show only High-Reward (reward > threshold)

#### Namespace Filters (NEW)
- Hierarchical tree view:
  ```
  ☑ veracy (1,157)
    ☑ default (565)
    ☑ coordination (69)
    ☑ sparc (23)
    ☑ swarm (15)
  ☑ intelligence (845)
  ☑ undefined (10)
  ```

#### Temporal Filters
- [x] Timeline range (existing range filter)
- **[NEW] Session Filter** (dropdown: Session 1-12)
- **[NEW] Date Range Picker** (start/end dates)

---

### ⏱️ Tab 4: TIMELINE

#### Playback Modes
- [x] Video Mode (progressive reveal)
- [x] Range Mode (start-end filter)
- **[NEW] Trajectory Playback** (replay specific trajectory)
- **[NEW] Session Replay** (replay specific session)

#### Timeline Controls
- [x] Play/Pause
- [x] Speed control
- [x] Scrubber
- **[NEW] Event Markers** (show learning events, errors)
- **[NEW] Reward Overlay** (color timeline by reward)

#### Timeline Chart Enhancements
- [x] Activity by day (bar chart)
- **[NEW] Reward progression line chart**
- **[NEW] Learning events (markers)**
- **[NEW] Session boundaries (vertical lines)**

---

### 🧠 Tab 5: INTELLIGENCE & LEARNING (NEW)

#### Q-Learning Dashboard
**Pattern Explorer:**
- Show all 56 Q-patterns (not just 2)
- Filter by algorithm:
  - [ ] Q-Learning
  - [ ] SARSA
  - [ ] Double-Q (66 updates)
  - [ ] Actor-Critic
  - [ ] PPO
  - [ ] DQN
  - [ ] Monte Carlo
  - [ ] TD-Lambda
  - [ ] Decision Transformer

**Pattern Table:**
| Pattern | Algorithm | Q-Value | Visits | Last Update |
|---------|-----------|---------|--------|-------------|
| cmd_shell_general→success | Q-Learning | 0.80 | 303 | 2026-01-21 |
| edit__in_project→successful-edit | Q-Learning | 1.00 | 136 | 2026-01-21 |

**Visualization Modes:**
- [ ] Show Q-patterns as nodes
- [ ] Color nodes by Q-value
- [ ] Size nodes by visit count
- [ ] Connect related patterns

#### Trajectory Visualizer
**Controls:**
- Trajectory selector (dropdown: 1-439)
- Play trajectory sequence
- Speed control

**Trajectory Info Display:**
```
Trajectory: traj_1768992130
State: cmd_shell_general → success
Outcome: completed
Reward: 0.8
Steps: 5
Duration: 2.3s
```

**Trajectory Graph:**
- Show state transitions
- Color by reward
- Highlight current step

#### Learning Algorithm Dashboard
**Algorithm Comparison:**
| Algorithm | Updates | Avg Reward | Convergence | Last Update |
|-----------|---------|------------|-------------|-------------|
| Double-Q | 66 | 53,606,531 | 66.7% | 2026-01-22 |
| Q-Learning | 0 | 0 | 0% | - |
| SARSA | 0 | 0 | 0% | - |

**Charts:**
- Reward history line chart (66 entries)
- Convergence score over time
- Update frequency by algorithm

#### Reward Analytics
- Reward distribution histogram
- Reward over time (line chart)
- High/low reward nodes highlighted
- Reward threshold slider

---

### 📈 Tab 6: METRICS & ANALYTICS

#### Current Metrics (keep existing)
- Graph structure (density, connections)
- Similarity stats
- Content stats
- Activity rate
- Namespace distribution
- Top prefixes

#### New Analytics (ADD)

**Learning Metrics:**
- Total trajectories: 439
- Active trajectories: 1
- Q-tables: 56
- Reward history entries: 66
- Learning algorithms active: 1 (Double-Q)

**Session Metrics:**
- Total sessions: 12
- Avg session duration: X
- LoRA updates: 0
- Errors: 0

**Memory Breakdown:**
- By source (metadata: 1942, intelligence: 845)
- By memory type (pie chart)
- By namespace (bar chart)
- Growth over time (line chart)

**Data Quality:**
- Embedding dimension: 1536 (metadata), 64 (intelligence)
- Missing embeddings: 0
- Duplicate keys: 0
- Content length distribution

---

### 🔍 Tab 7: SEARCH & ADVANCED FILTERS

#### Basic Search (existing)
- [x] Text search
- [x] Search field selector
- [x] Highlight mode
- [x] Max results
- [x] Min similarity

#### Advanced Filters (NEW)
**Memory Type:**
- [ ] agent_spawn
- [ ] command
- [ ] protocol
- [ ] pattern
- [ ] user-directive

**Trajectory Filters:**
- State: [dropdown]
- Action: [dropdown]
- Outcome: completed | failed | pending
- Reward: min [___] max [___]

**Q-Pattern Filters:**
- Algorithm: [dropdown]
- Q-Value: min [___] max [___]
- Visits: min [___] max [___]

**Content Filters:**
- Content type: JSON | YAML | Plain
- Length: min [___] max [___]
- Word count: min [___] max [___]

**Temporal Filters:**
- Date range: [start] to [end]
- Session: [dropdown]
- Last N days: [slider]

---

### ⚙️ Tab 8: SIMULATION & LAYOUT

#### Force Simulation (existing)
- [x] Repulsion strength
- [x] Link distance
- [x] Simulation on/off

#### Layout Algorithms (NEW)
- [ ] Force-directed (current)
- [ ] Hierarchical (by namespace)
- [ ] Circular (by time)
- [ ] Grid (uniform)
- [ ] Custom (upload coordinates)

#### Dimension Reduction (NEW)
- [x] UMAP (current)
- [ ] t-SNE (add option)
- [ ] PCA (add option)
- Parameters per algorithm

---

### 💾 Tab 9: EXPORT & REPORTS

#### Export Options (ALL NEW)
**Data Export:**
- Export visible nodes (CSV/JSON)
- Export filtered nodes
- Export trajectory sequences
- Export Q-tables
- Export reward history
- Export full graph (GraphML/GEXF)

**Visual Export:**
- Screenshot (PNG)
- SVG export
- PDF report

**Reports:**
- Learning metrics report (PDF/HTML)
- Session summary report
- Namespace distribution report
- Custom report builder

---

### 🎨 Tab 10: APPEARANCE & THEMES

#### UI Theme (NEW)
- [ ] Dark mode (current)
- [ ] Light mode
- [ ] High contrast
- [ ] Custom colors

#### Panel Layout (NEW)
- Sidebar position: Left | Right
- Panel transparency
- Font size
- Compact mode

#### Legend (existing)
- [x] Show/hide legend
- [x] Interactive filtering
- [x] Double-click reset

---

## Implementation Plan

### Phase 1: Core Rebuild (Week 1)
1. Create new tabbed settings panel structure
2. Migrate existing settings to new tabs
3. Add Memory Type color/size modes
4. Add Data Source color mode
5. Add Intelligence sub-filters

### Phase 2: Learning Features (Week 2)
6. Create Q-Learning dashboard (Tab 5)
7. Add trajectory visualizer
8. Add learning algorithm comparison
9. Add reward analytics

### Phase 3: Advanced Analytics (Week 3)
10. Add new metrics to Tab 6
11. Add advanced filters to Tab 7
12. Add session analytics
13. Add namespace hierarchy browser

### Phase 4: Export & Polish (Week 4)
14. Implement export functionality
15. Add report generation
16. Add layout algorithm options
17. Add UI themes
18. Testing & bug fixes

---

## UI Framework Recommendation

Consider using a component library for better organization:

**Option A: Native HTML + CSS Grid**
- Pros: No dependencies, fast
- Cons: More manual work

**Option B: Lightweight tabs library (Pure CSS)**
- Use CSS-only tabs
- Minimal overhead

**Option C: Keep current approach, reorganize**
- Collapsible sections within settings
- Better grouping

---

## Estimated Impact

**Development Time:** 3-4 weeks full rebuild
**Code Size:** ~2,000 lines → ~4,000 lines
**Performance:** Same or better (better filtering)
**User Experience:** Significantly improved organization
**Data Coverage:** 35% → 90%+

---

## Next Steps

1. **User approval** of this design
2. **Choose approach**:
   - Full rebuild from scratch
   - Incremental addition to existing
   - Hybrid (new tabs for new features)
3. **Prioritize tabs** (which ones first?)
4. **Set timeline** (all at once vs phased)
