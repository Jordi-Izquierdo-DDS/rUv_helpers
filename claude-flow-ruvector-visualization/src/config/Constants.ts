/**
 * RuVector Visualization Constants
 * Central configuration for node types, edge groups, colors, and rendering settings
 */

// ═══════════════════════════════════════════════════════════════════════════
// NODE TYPES & SHAPES
// ═══════════════════════════════════════════════════════════════════════════

export enum NodeType {
  MEMORY = 0,
  NEURAL_PATTERN = 1,
  Q_PATTERN = 2,
  TRAJECTORY = 3,
  FILE = 4,
  STATE = 5,
  ACTION = 6,
  AGENT = 7,
  SYSTEM_COMPONENT = 8
}

/**
 * NodeShape enum for 2D flat rendering (legacy, used by shaders)
 */
export enum NodeShape {
  CIRCLE = 0,
  SQUARE = 1,
  DIAMOND = 2,
  TRIANGLE = 3,
  HEXAGON = 4,
  PENTAGON = 5,
  STAR = 6,
  INVERTED_TRIANGLE = 7
}

/**
 * NodeShape3D enum for 3D geometry types
 * Maps to THREE.js geometry constructors
 */
export enum NodeShape3D {
  SPHERE = 'sphere',
  ICOSAHEDRON = 'icosahedron',
  CONE = 'cone',
  BOX = 'box',
  TORUS = 'torus',
  OCTAHEDRON = 'octahedron',
  TETRAHEDRON = 'tetrahedron',
  DODECAHEDRON = 'dodecahedron'
}

/**
 * Mapping from NodeType to 3D geometry shape
 * Per SPARC implementation spec
 */
export const NODE_TYPE_TO_SHAPE_3D: Record<NodeType, NodeShape3D> = {
  [NodeType.MEMORY]: NodeShape3D.SPHERE,
  [NodeType.NEURAL_PATTERN]: NodeShape3D.ICOSAHEDRON,
  [NodeType.Q_PATTERN]: NodeShape3D.BOX,
  [NodeType.TRAJECTORY]: NodeShape3D.TORUS,
  [NodeType.FILE]: NodeShape3D.OCTAHEDRON,
  [NodeType.STATE]: NodeShape3D.CONE,
  [NodeType.ACTION]: NodeShape3D.TETRAHEDRON,
  [NodeType.AGENT]: NodeShape3D.DODECAHEDRON,
  [NodeType.SYSTEM_COMPONENT]: NodeShape3D.BOX
};

/**
 * Legacy 2D shape mapping (for flat rendering mode)
 */
export const NODE_TYPE_SHAPES: Record<NodeType, NodeShape> = {
  [NodeType.MEMORY]: NodeShape.CIRCLE,
  [NodeType.NEURAL_PATTERN]: NodeShape.DIAMOND,
  [NodeType.Q_PATTERN]: NodeShape.SQUARE,
  [NodeType.TRAJECTORY]: NodeShape.PENTAGON,
  [NodeType.FILE]: NodeShape.STAR,
  [NodeType.STATE]: NodeShape.HEXAGON,
  [NodeType.ACTION]: NodeShape.TRIANGLE,
  [NodeType.AGENT]: NodeShape.INVERTED_TRIANGLE,
  [NodeType.SYSTEM_COMPONENT]: NodeShape.HEXAGON
};

/**
 * Mapping from source string to NodeType
 */
export const SOURCE_TO_NODE_TYPE: Record<string, NodeType> = {
  'memory': NodeType.MEMORY,
  'neural_pattern': NodeType.NEURAL_PATTERN,
  'q_pattern': NodeType.Q_PATTERN,
  'trajectory': NodeType.TRAJECTORY,
  'trajectory_success': NodeType.TRAJECTORY,    // Successful trajectory variant
  'trajectory_failed': NodeType.TRAJECTORY,     // Failed trajectory variant
  'file': NodeType.FILE,
  'state': NodeType.STATE,
  'action': NodeType.ACTION,
  'agent': NodeType.AGENT
};

// ═══════════════════════════════════════════════════════════════════════════
// NODE COLORS (Per VIZ doc color palette)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Memory type colors based on memory_type field
 */
export const MEMORY_TYPE_COLORS: Record<string, number> = {
  // Core memory types from database schema (01-database-schema.md)
  command: 0x3498DB,       // Blue - Bash commands executed
  file_access: 0xF39C12,   // Orange - Files read
  edit: 0x2ECC71,          // Green - Files edited
  search_pattern: 0x5C6BC0, // Indigo - Search queries
  project: 0x7E57C2,       // Deep Purple - Project-level info (FIX: was missing)
  agent_spawn: 0xFF8F00,   // Amber - Agent spawns
  // Extended memory types
  adr: 0xE74C3C,           // Red - Architecture Decision Records
  neural_general: 0x9B59B6, // Purple - General neural patterns
  design_component: 0xAD1457, // Magenta
  architecture: 0x00897B,  // Teal
  lesson: 0x9E9D24,        // Lime
  action: 0x009688,        // Teal variant
  task: 0x7B1FA2,          // Deep purple
  test: 0x00BCD4           // Cyan
};

/**
 * Neural pattern category colors based on neural_patterns.category field
 * Categories from database: filetype, directory, component
 */
export const NEURAL_CATEGORY_COLORS: Record<string, number> = {
  // Actual database categories from neural_patterns table
  filetype: 0x3B82F6,      // Blue - File type patterns (e.g., filetype:.js)
  directory: 0x10B981,     // Green - Directory patterns (e.g., directory:src)
  component: 0xF59E0B,     // Amber - Component patterns (e.g., component:command)
  // Semantic categories (used for categorization)
  security: 0xEF4444,      // Red
  quality: 0x10B981,       // Green
  performance: 0xF59E0B,   // Amber
  testing: 0x3B82F6,       // Blue
  api: 0x06B6D4,           // Cyan
  debugging: 0xF97316,     // Orange
  refactoring: 0xA855F7,   // Purple
  documentation: 0x6B7280, // Gray
  general: 0xEC4899        // Pink
};

/**
 * Node node type colors - SINGLE SOURCE OF TRUTH
 * All UI components (legend, settings, renderer) should use these colors.
 * Self-extending: unknown types get a deterministic hash-based color.
 */
const _NODE_SOURCE_COLORS: Record<string, number> = {
  memory: 0x6B2FB5,            // Purple - default memory (overridden by memory_type)
  neural_pattern: 0x9B59B6,    // Purple (lighter)
  q_pattern: 0x22D3EE,         // VIZ-ARCH: Cyan-ish for Q-pattern raw
  trajectory: 0x22C55E,        // VIZ-ARCH: Green (default for mixed/unknown)
  trajectory_success: 0x22C55E, // VIZ-ARCH: Green for successful trajectories
  trajectory_failed: 0xEF4444,  // VIZ-ARCH: Red for failed trajectories
  file: 0x1ABC9C,              // Teal
  state: 0xF59E0B,             // VIZ-ARCH: Warm amber/orange for state
  action: 0x10B981,            // VIZ-ARCH: Green for action
  agent: 0x34495E              // Dark gray-blue
};

export const NODE_SOURCE_COLORS: Record<string, number> = new Proxy(_NODE_SOURCE_COLORS, {
  get(target, prop: string) {
    if (prop in target) return target[prop];
    const color = stringToHexNum(prop);
    target[prop] = color;
    return color;
  }
});

/**
 * CSS hex string versions of NODE_SOURCE_COLORS for UI components (known types)
 */
const _NODE_SOURCE_COLORS_HEX: Record<string, string> = {
  memory: '#6B2FB5',
  neural_pattern: '#9B59B6',
  q_pattern: '#22D3EE',         // VIZ-ARCH: Cyan-ish
  trajectory: '#22C55E',        // VIZ-ARCH: Green (default)
  trajectory_success: '#22C55E', // VIZ-ARCH: Green
  trajectory_failed: '#EF4444',
  file: '#1ABC9C',
  state: '#F59E0B',             // VIZ-ARCH: Warm amber
  action: '#10B981',            // VIZ-ARCH: Green
  agent: '#34495E'
};

/**
 * Node type labels for UI display (known types)
 */
const _NODE_TYPE_LABELS: Record<string, string> = {
  memory: 'Memory',
  neural_pattern: 'Neural Pattern',
  q_pattern: 'Q-Pattern',
  trajectory: 'Trajectory',
  trajectory_success: 'Trajectory (Success)',
  trajectory_failed: 'Trajectory (Failed)',
  file: 'File',
  state: 'State',
  action: 'Action',
  agent: 'Agent'
};

/**
 * SVG icons for node types (14x14 viewBox, known types)
 */
const _NODE_TYPE_ICONS: Record<string, string> = {
  memory: '<circle cx="7" cy="7" r="5"/>',                                      // Circle
  neural_pattern: '<polygon points="7,1 13,7 7,13 1,7"/>',                      // Diamond
  q_pattern: '<rect x="2" y="2" width="10" height="10"/>',                      // Square
  trajectory: '<polygon points="7,1 13,4.5 11,12 3,12 1,4.5"/>',               // Pentagon
  trajectory_success: '<polygon points="7,1 13,4.5 11,12 3,12 1,4.5"/>',       // Pentagon (green)
  trajectory_failed: '<polygon points="7,1 13,4.5 11,12 3,12 1,4.5"/>',        // Pentagon (red)
  file: '<polygon points="7,1 8.8,4.8 13,5.2 9.8,8.2 10.8,13 7,10.5 3.2,13 4.2,8.2 1,5.2 5.2,4.8"/>', // Star
  state: '<polygon points="3.5,1 10.5,1 14,7 10.5,13 3.5,13 0,7"/>',           // Hexagon
  action: '<polygon points="7,2 12,12 2,12"/>',                                 // Triangle
  agent: '<polygon points="2,2 12,2 7,12"/>'                                    // Inverted triangle
};

// ─── Auto-generation for unknown types ───────────────────────────────────────

/**
 * Generate a deterministic color from a string hash
 * Returns a vibrant HSL color that's visually distinct
 */
function stringToHex(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  // Convert HSL to hex (saturation=65%, lightness=50%)
  const s = 0.65, l = 0.5;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + hue / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function stringToHexNum(str: string): number {
  const hex = stringToHex(str);
  return parseInt(hex.slice(1), 16);
}

function formatLabel(type: string): string {
  return type
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

// Cycle through distinct shapes for unknown types
const FALLBACK_SHAPES = [
  '<circle cx="7" cy="7" r="5"/>',
  '<rect x="2" y="2" width="10" height="10"/>',
  '<polygon points="7,1 13,7 7,13 1,7"/>',
  '<polygon points="7,2 12,12 2,12"/>',
  '<polygon points="7,1 13,5 10,13 4,13 1,5"/>',
  '<rect x="3" y="3" width="8" height="8" rx="2"/>'
];

let _shapeCounter = 0;

// ─── Self-extending Proxy-based SSOT ─────────────────────────────────────────

/**
 * NODE_SOURCE_COLORS_HEX: Returns known colors or auto-generates for unknown types.
 * New types get a deterministic hash-based color.
 */
export const NODE_SOURCE_COLORS_HEX: Record<string, string> = new Proxy(_NODE_SOURCE_COLORS_HEX, {
  get(target, prop: string) {
    if (prop in target) return target[prop];
    // Auto-generate and cache
    const color = stringToHex(prop);
    target[prop] = color;
    console.log(`[SSOT] Auto-generated color for new type "${prop}": ${color}`);
    return color;
  }
});

/**
 * NODE_TYPE_LABELS: Returns known labels or auto-formats for unknown types.
 */
export const NODE_TYPE_LABELS: Record<string, string> = new Proxy(_NODE_TYPE_LABELS, {
  get(target, prop: string) {
    if (prop in target) return target[prop];
    const label = formatLabel(prop);
    target[prop] = label;
    return label;
  }
});

/**
 * NODE_TYPE_ICONS: Returns known icons or assigns a fallback shape for unknown types.
 */
export const NODE_TYPE_ICONS: Record<string, string> = new Proxy(_NODE_TYPE_ICONS, {
  get(target, prop: string) {
    if (prop in target) return target[prop];
    const icon = FALLBACK_SHAPES[_shapeCounter % FALLBACK_SHAPES.length];
    _shapeCounter++;
    target[prop] = icon;
    return icon;
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// SHAPE_CONFIG — Single Source of Truth for shape/icon/color per node type
// Every node type has a UNIQUE 2D shape and a UNIQUE 3D shape.
// ═══════════════════════════════════════════════════════════════════════════

export interface ShapeConfigEntry {
  shape2d: NodeShape;
  shape3d: NodeShape3D;
  svgIcon: string;    // SVG element string for filter icons (14x14 viewBox)
  label: string;      // Human-readable display name
  color: string;      // CSS hex color for this type
}

export const SHAPE_CONFIG: Record<string, ShapeConfigEntry> = {
  memory: {
    shape2d: NodeShape.CIRCLE,
    shape3d: NodeShape3D.SPHERE,
    svgIcon: '<circle cx="7" cy="7" r="5"/>',
    label: 'Memory',
    color: '#6B2FB5'
  },
  neural_pattern: {
    shape2d: NodeShape.DIAMOND,
    shape3d: NodeShape3D.ICOSAHEDRON,
    svgIcon: '<polygon points="7,1 13,7 7,13 1,7"/>',
    label: 'Neural Pattern',
    color: '#9B59B6'
  },
  q_pattern: {
    shape2d: NodeShape.SQUARE,
    shape3d: NodeShape3D.BOX,
    svgIcon: '<rect x="2" y="2" width="10" height="10"/>',
    label: 'Q-Pattern',
    color: '#22D3EE'
  },
  trajectory: {
    shape2d: NodeShape.PENTAGON,
    shape3d: NodeShape3D.TORUS,
    svgIcon: '<polygon points="7,1 13,4.5 11,12 3,12 1,4.5"/>',
    label: 'Trajectory',
    color: '#22C55E'
  },
  file: {
    shape2d: NodeShape.STAR,
    shape3d: NodeShape3D.OCTAHEDRON,
    svgIcon: '<polygon points="7,1 8.8,4.8 13,5.2 9.8,8.2 10.8,13 7,10.5 3.2,13 4.2,8.2 1,5.2 5.2,4.8"/>',
    label: 'File',
    color: '#1ABC9C'
  },
  state: {
    shape2d: NodeShape.HEXAGON,
    shape3d: NodeShape3D.CONE,
    svgIcon: '<polygon points="3.5,1 10.5,1 14,7 10.5,13 3.5,13 0,7"/>',
    label: 'State',
    color: '#F59E0B'
  },
  action: {
    shape2d: NodeShape.TRIANGLE,
    shape3d: NodeShape3D.TETRAHEDRON,
    svgIcon: '<polygon points="7,2 12,12 2,12"/>',
    label: 'Action',
    color: '#10B981'
  },
  agent: {
    shape2d: NodeShape.INVERTED_TRIANGLE,
    shape3d: NodeShape3D.DODECAHEDRON,
    svgIcon: '<polygon points="2,2 12,2 7,12"/>',
    label: 'Agent',
    color: '#34495E'
  },
  // Trajectory aliases (point to same shapes/3D as trajectory)
  trajectory_success: {
    shape2d: NodeShape.PENTAGON,
    shape3d: NodeShape3D.TORUS,
    svgIcon: '<polygon points="7,1 13,4.5 11,12 3,12 1,4.5"/>',
    label: 'Trajectory (Success)',
    color: '#22C55E'
  },
  trajectory_failed: {
    shape2d: NodeShape.PENTAGON,
    shape3d: NodeShape3D.TORUS,
    svgIcon: '<polygon points="7,1 13,4.5 11,12 3,12 1,4.5"/>',
    label: 'Trajectory (Failed)',
    color: '#EF4444'
  }
};

/**
 * Get color for a node based on its source and attributes
 * @param source - Node node type string
 * @param memoryType - Memory type (for memory nodes)
 * @param success - Success status (for trajectory nodes)
 * @param qValue - Q value (for action nodes, range 0-1)
 * @returns Hex color number
 */
export function getNodeColor(
  source: string,
  memoryType?: string,
  success?: boolean,
  qValue?: number
): number {
  switch (source) {
    case 'memory':
      if (memoryType && MEMORY_TYPE_COLORS[memoryType]) {
        return MEMORY_TYPE_COLORS[memoryType];
      }
      return NODE_SOURCE_COLORS.memory;

    case 'trajectory':
      return success ? NODE_SOURCE_COLORS.trajectory_success : NODE_SOURCE_COLORS.trajectory_failed;

    case 'trajectory_success':
      return NODE_SOURCE_COLORS.trajectory_success;

    case 'trajectory_failed':
      return NODE_SOURCE_COLORS.trajectory_failed;

    case 'action':
      // Gradient from red (low q) to green (high q)
      if (qValue !== undefined) {
        const q = Math.max(0, Math.min(1, qValue));
        // Interpolate from red (0xE74C3C) to green (0x2ECC71)
        const r = Math.round(0xE7 + (0x2E - 0xE7) * q);
        const g = Math.round(0x4C + (0xCC - 0x4C) * q);
        const b = Math.round(0x3C + (0x71 - 0x3C) * q);
        return (r << 16) | (g << 8) | b;
      }
      return NODE_SOURCE_COLORS.action;

    default:
      return NODE_SOURCE_COLORS[source] ?? NODE_SOURCE_COLORS.memory;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// COLORS (Legacy - use NODE_SOURCE_COLORS and MEMORY_TYPE_COLORS instead)
// ═══════════════════════════════════════════════════════════════════════════

export const COLORS = {
  // Node type colors - synced with NODE_SOURCE_COLORS (VIZ-ARCH spec)
  nodeTypes: {
    memory: 0x6B2FB5,
    neural_pattern: 0x9B59B6,
    q_pattern: 0x22D3EE,        // VIZ-ARCH: Cyan-ish
    trajectory: 0x22C55E,       // VIZ-ARCH: Green
    trajectory_success: 0x22C55E, // VIZ-ARCH: Green
    trajectory_failed: 0xEF4444,  // VIZ-ARCH: Red
    file: 0x1ABC9C,
    state: 0xF59E0B,            // VIZ-ARCH: Warm amber
    action: 0x10B981,           // VIZ-ARCH: Green
    agent: 0x34495E,
  },

  // Edge group colors
  edges: {
    deterministic: 0x10B981,
    semantic: 0x8B4FD9,
    default: 0x666666
  },

  // Status colors
  status: {
    success: 0x10B981,
    failure: 0xEF4444,
    warning: 0xF59E0B
  },

  // UI colors
  ui: {
    background: 0x4A1D8F,
    highlight: 0xFFFFFF,
    selection: 0xF59E0B,
    hover: 0xDDD6FE
  }
};

// RGB arrays for shader uniforms (normalized 0-1)
export function hexToRGB(hex: number): [number, number, number] {
  return [
    ((hex >> 16) & 0xFF) / 255,
    ((hex >> 8) & 0xFF) / 255,
    (hex & 0xFF) / 255
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// EDGE GROUPS
// ═══════════════════════════════════════════════════════════════════════════

export enum EdgeGroup {
  DETERMINISTIC = 'deterministic',
  SEMANTIC = 'semantic'
}

/**
 * DETERMINISTIC EDGE TYPES
 * Based on explicit structural relationships, temporal correlations, or exact attribute matching.
 * These edges represent "ground truth" connections that can be verified objectively.
 *
 * Per SSOT (RUVECTOR-MEMORY-ARCHITECTURE_VIZ.md Section 11.2-11.3)
 */
export const DETERMINISTIC_EDGE_TYPES = new Set([
  // === Q-Learning Structural (from patterns table) ===
  'pattern',            // State→Action edges from Q-learning
  'pattern_produces',   // Pattern output relationships

  // === Temporal/Workflow (time-based correlations) ===
  'temporal',           // Time-based sequence from edges.data.type (DB schema)
  'trajectory-memory',  // Trajectory overlaps with memory creation time
  'trajectory-sequence',// Temporal sequence between trajectories
  'trajectory-action',  // Trajectory action type → Q-pattern state
  'trajectory-outcome', // Trajectory success/failure → outcome patterns
  'sequence',           // Step-to-step sequence within trajectories

  // === Exact Attribute Matching ===
  'same-state-prefix',  // Q-patterns with same state prefix (edit, cmd, etc.)
  'same-state',         // Q-patterns with identical state
  'same-action',        // Q-patterns with identical action
  'same-agent',         // Trajectories from same agent
  'success-cluster',    // Successful trajectories grouped
  'failure-cluster',    // Failed trajectories grouped
  'memory-agent',       // Memory mentions agent name (exact match)

  // === File Relationships (explicit from DB) ===
  'file',               // Same file relationship from edges.data.type (DB schema)
  'co_edit',            // File co-edit from edges table
  'coedit',             // Alias for co_edit
  'test_pair',          // Source file ↔ test file mapping

  // === Explicit DB Edges ===
  'explicit',           // Direct edges from edges table

  // === New structural edge types (Q-pattern/trajectory decomposition) ===
  'has_state',          // Q-pattern → state node
  'has_action',         // Q-pattern → action node
  'is_agent',           // Action → agent node
  'trajectory-agent',   // Trajectory → agent node
  'trajectory-neural',  // Trajectory → neural pattern (learned from trajectory)

  // === FIX-010: Agent Hierarchy (claude-flow) ===
  'instance_of',        // Agent → trajectory agent type mapping
  'coordinates',        // Queen agent → worker agent hierarchy
  'agent-hierarchy',    // Computed: queen → workers
  'agent-instance',     // Computed: worker → trajectory bridge

  // === FIX-016: Foundation knowledge graph edges ===
  'references',         // ADR cross-references
  'details',            // Summary-to-detail link
  'learned_from',       // Pattern learned from file
  'about_file',         // Memory describes file
  'extends',            // ADR extension
  'supersedes',         // ADR supersession

  // === RC-2: Q-pattern routing ===
  'routes_to'           // Q-pattern → file routing
]);

/**
 * SEMANTIC EDGE TYPES
 * Based on content similarity, embedding distance, or inferred relationships.
 * These edges represent "soft" connections based on semantic inference.
 *
 * Per SSOT: Even if pre-computed and stored in DB, these remain semantic by nature.
 */
export const SEMANTIC_EDGE_TYPES = new Set([
  // === Embedding-Based (stored in DB but semantic by nature) ===
  'semantic_similar',   // Cosine similarity between embeddings
  'semantic_bridge',    // Cross-type semantic connections
  'embedding',          // Legacy: embedding similarity

  // === Content-Based Inference (computed from text matching) ===
  'content-match',      // Word overlap between memory content and Q-pattern state/action
  'type-mapping',       // Memory type → Q-pattern state inference
  'cross-type',         // Cross-node-type semantic connections
  'memory-context',     // Memory content matches trajectory context (word overlap)

  // === Namespace/Source Inference ===
  'same-namespace',     // Same namespace grouping (semantic category)
  'same-source',        // Same node type grouping
  'knn-bridge'          // K-nearest neighbors bridge
]);

/**
 * Single source of truth for edge group classification.
 * Unknown types default to SEMANTIC - safe for new database types.
 * To add a deterministic type, add it to DETERMINISTIC_EDGE_TYPES above.
 */
export function getEdgeGroup(type: string): EdgeGroup {
  if (DETERMINISTIC_EDGE_TYPES.has(type)) return EdgeGroup.DETERMINISTIC;
  return EdgeGroup.SEMANTIC;
}

// ═══════════════════════════════════════════════════════════════════════════
// RENDERING SETTINGS
// ═══════════════════════════════════════════════════════════════════════════

export const RENDER_CONFIG = {
  // Node rendering
  node: {
    baseSize: 8,
    minSize: 2,
    maxSize: 30,
    opacity: 0.9,
    highlightScale: 1.5,
    hoverScale: 1.2
  },

  // Edge rendering
  edge: {
    baseWidth: 2,
    minWidth: 0.5,
    maxWidth: 5,
    opacity: {
      deterministic: 0.1,
      semantic: 0.05
    }
  },

  // Camera
  camera: {
    fov: 60,
    near: 1,
    far: 100000,
    defaultZ: 2000
  },

  // Performance
  performance: {
    maxNodesPerDraw: 100000,
    maxEdgesPerDraw: 500000,
    updateThrottleMs: 33, // ~30fps
    pickingResolution: 1
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// COLOR MODES
// ═══════════════════════════════════════════════════════════════════════════

export enum ColorMode {
  SOURCE_TYPE = 'sourceType',
  NAMESPACE = 'namespace',
  NAMESPACE_FULL = 'namespaceFull',
  DOMAIN = 'domain',
  SINGLE = 'single',
  DB_SOURCE = 'dbSource',
  CONNECTIVITY = 'connectivity',
  TIME = 'time',
  RECENCY = 'recency',
  RATE = 'rate',
  CHAR_LENGTH = 'charLength',
  WORD_COUNT = 'wordCount',
  CONTENT_TYPE = 'contentType',
  NS_DEPTH = 'nsDepth',
  KEY_PREFIX = 'keyPrefix',
  HAS_EMBEDDING = 'hasEmbedding',
  CROSS_LINK_TYPE = 'crossLinkType',
  Q_VALUE = 'qValue',
  VISITS = 'visits',
  STATE = 'state',
  ACTION = 'action',
  SUCCESS = 'success',
  QUALITY = 'quality',
  AGENT = 'agent',
  MODEL = 'model',                   // FIX-010: Color by AI model (haiku/sonnet/opus)
  TOPOLOGY_ROLE = 'topologyRole',    // FIX-010: Color by queen/worker/standalone
  // FIX-016: Foundation RL modes
  RECALL_COUNT = 'recallCount',      // FIX-016: Color by recall frequency
  REWARD_SUM = 'rewardSum',          // FIX-016: Color by accumulated RL reward
  EFFECTIVENESS = 'effectiveness',   // FIX-016: Color by effectiveness ratio
  LAYER = 'layer',                   // FIX-016: Color by foundation layer (summary/detail)
  FOUNDATION_DOC = 'foundationDoc'   // FIX-016: Color by ADR document group
}

// FIX-016: Edge relation type colors (per VIZ doc Section 5)
export const EDGE_RELATION_COLORS: Record<string, number> = {
  semantic_similar: 0x888888,    // Light gray — opacity = weight
  semantic_bridge: 0x3B82F6,     // Blue — cross-type connections
  references: 0xF59E0B,          // Orange — ADR cross-references
  details: 0x8B5CF6,             // Purple — summary-to-detail
  learned_from: 0x10B981,        // Green — pattern-to-file learning
  about_file: 0x14B8A6,          // Teal — memory-to-file
  co_edit: 0xEAB308,             // Yellow — file co-edit pairs
  instance_of: 0x9CA3AF,         // Gray — agent hierarchy
  coordinates: 0xEF4444,         // Red — queen-to-worker
  extends: 0x06B6D4,             // Cyan — ADR extension
  supersedes: 0xDC2626,          // Red (darker) — ADR replacement
  routes_to: 0xD946EF,           // Magenta — Q-pattern → file routing (RC-2)

  // New structural edge types (Q-pattern/trajectory decomposition)
  has_state: 0x22D3EE,           // Cyan — Q-pattern → state
  has_action: 0x10B981,          // Green — Q-pattern → action
  is_agent: 0x34495E,            // Dark gray-blue — action → agent
  'trajectory-agent': 0xF59E0B,  // Amber — trajectory → agent
  'trajectory-neural': 0x9B59B6  // Purple — trajectory → neural pattern
};

// FIX-016: Foundation layer colors
export const FOUNDATION_LAYER_COLORS: Record<string, number> = {
  summary: 0x3B82F6,             // Blue for summary layer
  detail: 0xF59E0B              // Orange for detail layer
};

// Domain colors for memory categorization
export const DOMAIN_COLORS: Record<string, number> = {
  code: 0x3B82F6,        // Blue
  architecture: 0x8B5CF6, // Purple
  security: 0xEF4444,     // Red
  error: 0xF59E0B,        // Amber
  test: 0x10B981,         // Green
  unknown: 0x6B7280       // Gray
};

// ═══════════════════════════════════════════════════════════════════════════
// SIZE MODES
// ═══════════════════════════════════════════════════════════════════════════

export enum SizeMode {
  FIXED = 'fixed',
  CONNECTIVITY = 'connectivity',
  RATE = 'rate',
  CHAR_LENGTH = 'charLength',
  WORD_COUNT = 'wordCount',
  RECENCY = 'recency',
  CROSS_LINKS = 'crossLinks',
  NS_DEPTH = 'nsDepth',
  Q_VALUE = 'qValue',
  VISITS = 'visits',
  SUCCESS = 'success',
  QUALITY = 'quality',
  // FIX-016: Foundation RL modes
  RECALL_COUNT = 'recallCount',      // FIX-016: Size by recall frequency
  EFFECTIVENESS = 'effectiveness'    // FIX-016: Size by effectiveness ratio
}

// ═══════════════════════════════════════════════════════════════════════════
// SIMULATION SETTINGS
// ═══════════════════════════════════════════════════════════════════════════

export const SIMULATION_CONFIG = {
  // Force settings
  force: {
    charge: -80,
    linkDistance: 80,
    linkStrength: 0.5,
    centerStrength: 0.1,
    collisionRadius: 15
  },

  // Radial force for cluster separation
  radial: {
    target: 'q_pattern',
    radius: 800,
    strength: 0.2
  },

  // Simulation timing
  timing: {
    alphaDecay: 0.02,
    alphaMin: 0.001,
    velocityDecay: 0.4
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// PRESETS
// ═══════════════════════════════════════════════════════════════════════════

export interface EdgeGroupSettings {
  enabled: boolean;
  distance: number;
  strength: number;
  opacity: number;
  width: number;
  repulsion: number;
  color: number;
  glow: boolean;
  style?: 'solid' | 'dashed' | 'dotted';
  widthMode?: 'fixed' | 'similarity' | 'weight';
}

export interface Preset {
  name: string;
  deterministic: EdgeGroupSettings;
  semantic: EdgeGroupSettings;
}

export const PRESETS: Record<string, Preset> = {
  workflow: {
    name: 'Workflow Focus',
    deterministic: {
      enabled: true,
      distance: 40,
      strength: 0.9,
      opacity: 0.9,
      width: 3,
      repulsion: -40,
      color: 0x10B981,
      glow: true
    },
    semantic: {
      enabled: true,
      distance: 150,
      strength: 0.1,
      opacity: 0.15,
      width: 0.5,
      repulsion: -120,
      color: 0x8B4FD9,
      glow: false
    }
  },
  semantic: {
    name: 'Semantic Focus',
    deterministic: {
      enabled: true,
      distance: 100,
      strength: 0.3,
      opacity: 0.3,
      width: 1,
      repulsion: -80,
      color: 0x10B981,
      glow: false
    },
    semantic: {
      enabled: true,
      distance: 60,
      strength: 0.8,
      opacity: 0.7,
      width: 2.5,
      repulsion: -60,
      color: 0x8B4FD9,
      glow: true
    }
  },
  balanced: {
    name: 'Balanced',
    deterministic: {
      enabled: true,
      distance: 60,
      strength: 0.8,
      opacity: 0.8,
      width: 2.5,
      repulsion: -60,
      color: 0x10B981,
      glow: true
    },
    semantic: {
      enabled: true,
      distance: 100,
      strength: 0.3,
      opacity: 0.3,
      width: 1,
      repulsion: -100,
      color: 0x8B4FD9,
      glow: false
    }
  },
  minimal: {
    name: 'Minimal',
    deterministic: {
      enabled: true,
      distance: 80,
      strength: 0.5,
      opacity: 0.5,
      width: 1.5,
      repulsion: -80,
      color: 0x10B981,
      glow: false
    },
    semantic: {
      enabled: false,
      distance: 100,
      strength: 0.3,
      opacity: 0.1,
      width: 0.5,
      repulsion: -100,
      color: 0x8B4FD9,
      glow: false
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// GPU DATA STRUCTURES
// ═══════════════════════════════════════════════════════════════════════════

export interface GPUNodeData {
  positions: Float32Array;    // [x,y,z, x,y,z, ...] 3 floats per node
  colors: Float32Array;       // [r,g,b, r,g,b, ...] 3 floats per node
  sizes: Float32Array;        // [s, s, s, ...] 1 float per node
  types: Uint8Array;          // [0-3] node type enum
  ids: Uint32Array;           // Original IDs for picking
  visible: Uint8Array;        // [0|1] visibility flags
}

export interface GPUEdgeData {
  positions: Float32Array;     // [x1,y1,z1, x2,y2,z2, ...] 6 floats per edge
  colors: Float32Array;        // Per-vertex colors [r1,g1,b1, r2,g2,b2, ...]
  sourceIndices: Uint32Array;  // Source node indices for dynamic updates
  targetIndices: Uint32Array;  // Target node indices for dynamic updates
  groups: Uint8Array;          // Edge group (deterministic=0, semantic=1)
  visible: Uint8Array;         // Visibility flags
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface GraphNode {
  id: string | number;
  key?: string;
  x?: number;
  y?: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  fx?: number | null;
  fy?: number | null;
  source: string;
  dbSource?: string;
  namespace?: string;
  preview?: string;
  color?: string;
  timestamp?: number;
  connectionCount?: number;
  hasEmbedding?: boolean;
  // Memory-specific
  valueLength?: number;
  wordCount?: number;
  nsDepth?: number;
  keyPrefix?: string;
  contentType?: string;
  memoryType?: string;
  rate?: number;
  quality?: number;
  domain?: string;  // Memory domain: code, architecture, security, error, test
  // Q-pattern specific
  qValue?: number;
  visits?: number;
  state?: string;
  action?: string;
  // Trajectory specific
  success?: boolean;
  agent?: string;
  stepCount?: number;
  // Neural pattern specific
  category?: string;
  confidence?: number;
  trajectoryId?: string | null;  // Source trajectory ID (from metadata.trajectory_id)
  // File-specific
  filePath?: string;
  fileType?: string;
  // Agent-specific
  agentId?: string;
  agentRole?: string;
  agentModel?: string;           // FIX-010: sonnet, haiku, opus, unknown
  agentSourceType?: string;      // FIX-010: claude-flow-hive, swarm, task-agent, claude
  topologyRole?: string;         // FIX-010: queen, worker, standalone
  // Q-pattern model (FIX-010)
  model?: string;                // FIX-010: model from state key suffix
  baseState?: string;            // FIX-010: state without model suffix
  // Foundation RL metadata (FIX-016)
  isFoundation?: boolean;        // FIX-016: true for foundation memories
  layer?: string;                // FIX-016: "summary" or "detail"
  document?: string;             // FIX-016: ADR document name
  recallCount?: number;          // FIX-016: times recalled by suggest-context
  rewardSum?: number;            // FIX-016: accumulated RL reward
  effectiveness?: number;        // FIX-016: reward_sum / recall_count
  lastRecalled?: number;         // FIX-016: timestamp of last recall (ms)
  sourceDoc?: string;            // FIX-016: source collection (e.g. "__ADRS__")
  // RC-1: Trigger-filled timestamps (all tables)
  createdAt?: number;            // RC-1: trigger-filled creation time (ms)
  updatedAt?: number;            // RC-1: trigger-filled update time (ms)
  // State-specific
  stateHash?: string;
  // Action-specific
  actionType?: string;
  // Computed
  nodeType?: NodeType;
  nodeIndex?: number;
  shape3D?: NodeShape3D;
}

export interface GraphEdge {
  source: number | GraphNode;
  target: number | GraphNode;
  weight?: number;
  type?: string;
  group?: EdgeGroup | 'deterministic' | 'semantic';  // Server sends string, client may use enum
  createdAt?: number;  // RC-1: trigger-filled creation time (ms)
}

/**
 * Hyperedge definition for convex hull groups
 * Used to visualize memory type groups with transparent hulls
 */
export interface Hyperedge {
  id: string;
  type: string;  // e.g., 'memory_type', 'category'
  label: string; // Display label (e.g., 'command', 'adr')
  nodeIds: string[];  // IDs of nodes in this group
  color?: number;     // Optional custom color
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  hyperedges?: Hyperedge[];  // Convex hull groups for memory types, categories, etc.
  meta?: {
    totalNodes: number;
    totalEdges: number;
    namespaces?: string[];
  };
  timeline?: {
    minTimestamp: number;
    maxTimestamp: number;
  };
  metrics?: Record<string, unknown>;
  stats?: Record<string, unknown>;
}
