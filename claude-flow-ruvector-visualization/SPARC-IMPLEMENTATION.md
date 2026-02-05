# RuVector Visualization - SPARC Implementation Plan

**Date:** 2026-01-28
**Status:** IN PROGRESS
**Methodology:** SPARC (Specification, Pseudocode, Architecture, Refinement, Completion)

---

## S - Specification

### Goal
Implement complete visualization of ALL RuVector intelligence data per upstream data contract.

### Requirements
1. **Remove redundant computation** - Trust DB edges, delete server-side semantic calculation
2. **All node types** - Memory, Neural Pattern, Q-Pattern, Trajectory, File, Agent, State, Action
3. **All edge types** - Co-Edit, Semantic, Pattern (State→Action), Trajectory→Memory, File sequences
4. **Visual differentiation** - Different shapes per node type
5. **Hyperedges** - Convex hulls for memory type groups
6. **Edge styling** - Solid/dashed/dotted per edge type
7. **Production ready** - No stubs, no TODOs, fully wired

### Data Sources (per Data Contract v1.0)
- `intelligence.db`: memories, patterns, trajectories, edges, neural_patterns, file_sequences
- `.claude-flow/agents/store.json`: Agent registry

### Thresholds (per VIZ doc)
- Semantic edge: 0.7 (pairwise), 0.6 (KNN k=5)

---

## P - Pseudocode

### Phase 1: Server Data Cleanup
```
1. DELETE server.js lines 1447-1513 (semantic edge computation loop)
2. KEEP DB edge loading (already correct)
3. ADD file node extraction from edges table
4. ADD agent node loading from store.json
5. ADD state/action node separation from patterns table
6. ADD hyperedges array to API response
```

### Phase 2: Node Type Implementation
```
FOR each node type IN [Memory, Neural, File, State, Action, Trajectory, Agent]:
  1. CREATE geometry (sphere, icosahedron, cone, cube, torus, octahedron)
  2. CREATE InstancedMesh for that type
  3. ADD to NodeRenderer.meshes map
  4. WIRE color by type-specific attribute
```

### Phase 3: Edge Type Implementation
```
FOR each edge type IN [co_edit, semantic, pattern, trajectory, file_sequence]:
  1. SET dash style (solid=0, dashed=1, dotted=2)
  2. SET color per type
  3. SET width based on weight/visits
  4. UPDATE EdgeRenderer to handle per-edge dash style
```

### Phase 4: Hyperedges
```
1. GROUP nodes by memory_type
2. FOR each group with 4+ members:
   a. GET positions of all members
   b. CREATE ConvexGeometry from positions
   c. ADD transparent mesh to scene
3. UPDATE on position change
```

---

## A - Architecture

### File Changes

| File | Changes |
|------|---------|
| `server.js` | Remove semantic loop, add File/Agent/State/Action nodes, add hyperedges |
| `src/renderer/NodeRenderer.ts` | Multi-shape support, per-type InstancedMesh |
| `src/renderer/EdgeRenderer.ts` | Per-edge dash style attribute |
| `src/renderer/HyperedgeRenderer.ts` | NEW: Convex hull rendering |
| `src/config/Constants.ts` | Node type → shape/color mapping |
| `src/main-three.ts` | Wire hyperedge renderer, update on position change |

### Data Flow
```
intelligence.db
     │
     ▼
server.js ──────────────────────────────────────┐
  │ Extract:                                    │
  │ - memories → Memory nodes                   │
  │ - neural_patterns → NeuralPattern nodes     │
  │ - patterns → State nodes + Action nodes     │
  │ - trajectories → Trajectory nodes           │
  │ - edges.from_node/to_node → File nodes      │
  │ - store.json → Agent nodes                  │
  │                                             │
  │ Edges (from DB, NOT computed):              │
  │ - edges table → co_edit, semantic           │
  │ - patterns → state→action edges             │
  │                                             │
  │ Hyperedges:                                 │
  │ - GROUP BY memory_type                      │
  │ - GROUP BY category                         │
  └─────────────────────────────────────────────┘
     │
     ▼
/api/graph response
     │
     ▼
main-three.ts
  │
  ├─► NodeRenderer (multi-shape InstancedMesh)
  │     ├─ spheres (memory, neural)
  │     ├─ icosahedrons (file)
  │     ├─ cones (state)
  │     ├─ cubes (action)
  │     ├─ tori (trajectory)
  │     └─ octahedrons (agent)
  │
  ├─► EdgeRenderer (per-edge dash style)
  │     ├─ solid (co_edit, trajectory)
  │     ├─ dashed (pattern)
  │     └─ dotted (semantic)
  │
  └─► HyperedgeRenderer (convex hulls)
        └─ transparent meshes per group
```

---

## R - Refinement

### Implementation Order (Dependency-Based)

1. **server.js changes** (no dependencies)
   - Remove semantic computation
   - Add File nodes
   - Add Agent nodes
   - Split State/Action
   - Add hyperedges to response

2. **Constants.ts** (no dependencies)
   - Node type configs
   - Color palette
   - Shape mapping

3. **NodeRenderer.ts** (depends on Constants)
   - Multi-shape geometry
   - Per-type InstancedMesh
   - Type-based coloring

4. **EdgeRenderer.ts** (depends on Constants)
   - Per-edge dash style attribute
   - Type-based styling

5. **HyperedgeRenderer.ts** (depends on NodeRenderer positions)
   - NEW file
   - ConvexGeometry generation
   - Update on position change

6. **main-three.ts** (depends on all renderers)
   - Wire HyperedgeRenderer
   - Pass hyperedges from API
   - Update hulls on simulation tick

---

## C - Completion Checklist

### Phase 1: Data Cleanup ✅ COMPLETE
- [x] Remove server.js semantic computation (lines 1447-1513)
- [x] Verify DB edges still load correctly
- [x] Test edge counts match expectations

### Phase 2: Node Types ✅ COMPLETE
- [x] File nodes from edges table
- [x] Agent nodes from store.json
- [x] State nodes from patterns.state
- [x] Action nodes from patterns.action
- [x] State→Action edges with q_value weight

### Phase 3: Visual Differentiation ✅ COMPLETE
- [x] Sphere: Memory, Neural Pattern
- [x] Icosahedron: File
- [x] Cone: State
- [x] Cube: Action
- [x] Torus: Trajectory
- [x] Octahedron: Agent
- [x] Colors per type

### Phase 4: Hyperedges ✅ COMPLETE
- [x] HyperedgeRenderer.ts created
- [x] Convex hulls for memory_type groups
- [x] Convex hulls for category groups
- [x] Toggle UI for hull visibility
- [x] Update on position change

### Phase 5: Edge Styling ✅ COMPLETE
- [x] Solid: co_edit, trajectory-memory
- [x] Dashed: pattern (state→action)
- [x] Dotted: semantic
- [x] Width by weight/visits
- [x] Color by type

### Integration ✅ COMPLETE
- [x] All phases wired in main-three.ts
- [x] API response includes hyperedges
- [x] No console errors
- [x] Visual verification of all node/edge types
- [x] 3D mode works with all features
- [x] Fog effect applies to all node types

---

## Implementation Complete: 2026-01-28

All 5 phases implemented by SPARC swarm:
- **server-agent**: Phase 1 server data cleanup
- **node-agent**: Phase 2-3 multi-shape NodeRenderer
- **edge-agent**: Phase 5 edge styling
- **hull-agent**: Phase 4 HyperedgeRenderer
- **integration-agent**: Wire everything together

Build verified: `npm run build` succeeds
No TODOs, no stubs - production ready.

---

## Agent Assignments

| Agent | Task | Files |
|-------|------|-------|
| **server-agent** | Phase 1 + API changes | server.js |
| **node-agent** | Phase 2 + Phase 3 | NodeRenderer.ts, Constants.ts |
| **edge-agent** | Phase 5 | EdgeRenderer.ts |
| **hull-agent** | Phase 4 | HyperedgeRenderer.ts (new) |
| **integration-agent** | Wire everything | main-three.ts |

---

*SPARC Plan Created: 2026-01-28*
