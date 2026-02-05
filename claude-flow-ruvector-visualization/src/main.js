// d3 is loaded globally via CDN

// =============================================================================
// SAFE NUMBER UTILITIES - Prevent NaN/null/0 display issues
// =============================================================================
/**
 * Safe number conversion with fallback
 * @param {*} v - Value to convert
 * @param {number} f - Fallback value (default: 0)
 * @returns {number} Safe numeric value
 */
const safeNum = (v, f = 0) => v == null || typeof v !== 'number' || !Number.isFinite(v) ? f : v;

/**
 * Safe percentage string with division-by-zero protection
 * @param {number} n - Numerator
 * @param {number} d - Denominator
 * @returns {string} Percentage string like "45%"
 */
const safePct = (n, d) => d === 0 ? '0%' : `${Math.round(100 * safeNum(n) / safeNum(d, 1))}%`;

/**
 * Safe string conversion for display
 * @param {*} v - Value to convert
 * @param {string} f - Fallback string (default: '-')
 * @returns {string} Safe string value
 */
const safeStr = (v, f = '-') => v == null || (typeof v === 'number' && !Number.isFinite(v)) ? f : String(v);

/**
 * Safe toFixed with null/NaN protection
 * @param {*} v - Value to format
 * @param {number} decimals - Number of decimal places
 * @param {string} fallback - Fallback string (default: '-')
 * @returns {string} Formatted number or fallback
 */
const safeFixed = (v, decimals = 2, fallback = '-') => {
  if (v == null || typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return v.toFixed(decimals);
};

let simulation;
let graphData;
let svg, g, node, link;
let nodes, links;
let timelineData, metricsData;
let linkGroup, nodeGroup; // Groups for rebuildGraph

// Config state
// =============================================================================
// EDGE GROUP DEFINITIONS
// Two main categories: Deterministic (explicit relationships) and Semantic (similarity-based)
// =============================================================================
const EDGE_GROUPS = {
  deterministic: {
    name: 'Deterministic',
    description: 'Explicit relationships from data structure',
    icon: '◆',
    types: [
      // Database schema edge types (from edges.data.type)
      'temporal',              // Time-based sequence from DB
      'pattern',               // State-Action edges from Q-learning (DB)
      'file',                  // Same file relationship from DB
      'trajectory',            // Execution sequence from DB
      'co_edit',               // File co-edit from edges table (DB)

      // Database explicit edges
      'pattern_produces',      // Q-pattern → Memory (from DB)
      'explicit',              // Generic explicit edges from DB

      // Trajectory structural edges
      'trajectory-memory',     // Trajectory → Memory (temporal)
      'trajectory-sequence',   // Step sequence within trajectory
      'trajectory-action',     // Trajectory action → Q-pattern state
      'trajectory-outcome',    // Trajectory outcome → Q-pattern
      'same-agent',           // Same agent trajectories

      // Q-pattern structural edges
      'same-state',           // Q-patterns with same state (deprecated)
      'same-state-prefix',    // Q-patterns with same state prefix
      'same-action',          // Q-patterns with same rare action

      // Cross-type structural edges
      'content-match',        // Content keyword match
      'type-mapping',         // Memory type → Q-pattern state
      'memory-agent',         // Memory mentions trajectory agent
      'memory-context',       // Memory matches trajectory context

      // Other structural edges
      'coedit',               // Files edited together (alias)
      'sequence',             // Action sequences
      'success-cluster',      // Successful trajectory grouping
      'failure-cluster',      // Failed trajectory grouping

      // New structural edge types (Q-pattern/trajectory decomposition)
      'has_state',            // Q-pattern → state node
      'has_action',           // Q-pattern → action node
      'is_agent',             // Action → agent node
      'trajectory-agent',     // Trajectory → agent node
      'trajectory-neural'     // Trajectory → neural pattern
    ],
    defaultColor: '#10B981',   // Emerald - stands out as "real" connections
    dashArray: 'none'          // Solid lines for concrete relationships
  },
  semantic: {
    name: 'Semantic',
    description: 'Similarity-based relationships from embeddings',
    icon: '○',
    types: [
      'semantic',             // Semantic similarity from DB
      'embedding',            // Generic similarity
      'same-namespace',       // Same namespace similarity
      'same-source',          // Same node type similarity
      'cross-type',           // Cross-type similarity bridge
      'knn-bridge',           // KNN cluster bridges
      'semantic_similar',     // High-threshold semantic match
      'semantic_bridge'       // Cross-type semantic bridge
    ],
    defaultColor: '#8B4FD9',   // Purple - ambient/contextual
    dashArray: '4,2'           // Dashed lines for inferred relationships
  }
};

// Helper to get edge group for a type
function getEdgeGroup(edgeType) {
  if (EDGE_GROUPS.deterministic.types.includes(edgeType)) return 'deterministic';
  if (EDGE_GROUPS.semantic.types.includes(edgeType)) return 'semantic';
  return 'semantic'; // Default to semantic for unknown types
}

const config = {
  nodeColorMode: 'sourceType',  // Default to new node type coloring
  nodeColor: '#6B2FB5',
  // Legacy DB source colors (backward compatibility)
  metadataDbColor: '#6B2FB5',
  intelligenceDbColor: '#8B4FD9',
  trajectoriesColor: '#10B981',
  qPatternsColor: '#B794F6',
  qPatternsIntelColor: '#B794F6',
  nodeSizeMode: 'connectivity',
  nodeSize: 8,
  nodeOpacity: 0.8,
  linkColor: '#8B4FD9',
  linkOpacity: 0.6,
  linkWidthMode: 'similarity',
  linkWidth: 2,
  repulsion: -80,
  linkDist: 80,
  namespaceColors: {},
  prefixColors: {},
  timelinePosition: 1000, // 0-1000 continuous
  playSpeed: 100,
  isPlaying: false,
  // Timeline filter settings
  timelineMode: 'video', // 'video' or 'range'
  rangeStart: 0,
  rangeEnd: 1000,
  // v3 Intelligence Settings
  qPatternMode: 'off',
  selectedQPattern: 'all',
  sonaTrajectoryMode: 'off',
  sonaTimelinePosition: 0,
  similarityThreshold: 0.72,
  colorEdgesByType: true,  // Color edges by relationship type
  // Cluster separation settings
  radialTarget: 'q_pattern',  // Which node type to push outward
  radialDist: 800,
  radialStrength: 0.2,
  clusterDeterministic: true,   // Include deterministic edges in clustering forces
  clusterSemantic: true,        // Include semantic edges in clustering forces

  // =============================================================================
  // EDGE GROUP SETTINGS - Independent physics & visuals per group
  // =============================================================================
  edgeGroups: {
    deterministic: {
      enabled: true,
      opacity: 0.8,
      width: 2.5,
      color: '#10B981',        // Emerald green
      distance: 60,            // Shorter - pull connected nodes closer
      strength: 0.8,           // Strong - these are real relationships
      repulsion: -60,          // Less repulsion - clusters are OK
      dashArray: 'none',       // Solid lines
      glowEnabled: true        // Glow effect for emphasis
    },
    semantic: {
      enabled: true,
      opacity: 0.3,
      width: 1,
      color: '#8B4FD9',        // Purple
      distance: 100,           // Longer - looser similarity grouping
      strength: 0.3,           // Weaker - just suggestions
      repulsion: -100,         // More repulsion - spread out
      dashArray: '4,2',        // Dashed lines
      glowEnabled: false       // No glow - subtle background
    }
  },

  // Edge type visibility (all enabled by default)
  visibleEdgeTypes: {
    // DB Schema edge types (from edges.data.type in database)
    'temporal': true,            // Time-based sequence from DB
    'file': true,                // Same file relationship from DB
    'pattern': true,             // State-Action edges from Q-learning
    'trajectory': true,          // Execution sequence from DB
    'semantic': true,            // Semantic similarity from DB

    // Semantic edges (similarity-based)
    'embedding': true,           // Fallback/default type
    'same-namespace': true,      // Same namespace
    'same-source': true,         // Same node type
    'cross-type': true,          // Cross-type similarity
    'semantic_similar': true,    // Cosine similarity
    'semantic_bridge': true,     // Cross-type semantic

    // Q-pattern structural edges
    'same-state': true,          // Same Q-pattern state (deprecated)
    'same-state-prefix': true,   // Same state prefix (chain linking)
    'same-action': true,         // Rare action match

    // Trajectory structural edges
    'trajectory-sequence': true, // Temporal sequence
    'same-agent': true,          // Same agent
    'success-cluster': true,     // Success trajectory cluster
    'failure-cluster': true,     // Failure trajectory cluster

    // Cross-type workflow edges
    'trajectory-memory': true,   // Temporal: trajectory → memory
    'trajectory-action': true,   // Trajectory action → Q-pattern
    'trajectory-outcome': true,  // Trajectory outcome → Q-pattern
    'content-match': true,       // Content keyword match
    'type-mapping': true,        // Memory type → Q-pattern state
    'memory-agent': true,        // Memory mentions agent
    'memory-context': true,      // Memory matches context

    // File relationship edges
    'co_edit': true,             // File co-edit from edges table (DB)
    'coedit': true,              // Co-edit: file → file (alias)
    'sequence': true,            // Step → step sequence

    // Database explicit edges
    'explicit': true,            // From edges table (generic)
    'pattern_produces': true,    // Q-pattern → memory (from DB)

    // Misc
    'knn-bridge': true,          // KNN bridge between clusters

    // New structural edge types (Q-pattern/trajectory decomposition)
    'has_state': true,           // Q-pattern → state node
    'has_action': true,          // Q-pattern → action node
    'is_agent': true,            // Action → agent node
    'trajectory-agent': true,    // Trajectory → agent node
    'trajectory-neural': true    // Trajectory → neural pattern
  },
  // New node type filters (legend-style toggleable)
  sourceTypeFilters: {
    memory: true,
    neural_pattern: true,
    q_pattern: true,
    trajectory: true,
    file: true,
    state: true,
    action: true,
    agent: true
  },
  // Memory type filters (all enabled by default, dynamically populated)
  memoryTypeFilters: {},
  // Pattern category filters (all enabled by default, dynamically populated)
  patternCategoryFilters: {},
  // Currently active filter for highlighting
  activeFilter: { type: null, value: null }
};

let playInterval = null;

// SSOT: Server-provided node type configuration (colors, labels, shapes, icons)
// Populated from /api/graph response's nodeTypeConfig field
let nodeTypeConfig = null;

// Content type colors
const contentTypeColors = {
  json: '#61DAFB',
  yaml: '#CB171E',
  plain: '#888888'
};

// Namespace depth colors
const depthColors = ['#4CAF50', '#2196F3', '#FF9800'];

const defaultColors = {
  'veracy': '#4CAF50',
  'veracy/maintenance': '#2196F3',
  'roo-cline': '#9C27B0',
  'architect': '#FF9800',
  'default': '#607D8B'
};

/**
 * Hardcoded fallback colors used only when nodeTypeConfig is not available.
 * Once the API provides nodeTypeConfig, all colors come from there (SSOT).
 */
const sourceColorFallbacks = {
  memory: '#6B2FB5',
  neural_pattern: '#8B4FD9',
  q_pattern: '#B794F6',
  trajectory: '#10B981',
  state: '#E67E22',
  action: '#2ECC71',
  file: '#1ABC9C',
  agent: '#34495E'
};

/**
 * Get the canonical color for a node type from server-provided SSOT config.
 * Falls back to hardcoded defaults only when nodeTypeConfig is unavailable.
 * Also resolves variant types (e.g. trajectory_success -> trajectory parent's variant).
 * @param {string} type - The node type key (e.g. 'memory', 'trajectory_success')
 * @returns {string} Hex color string
 */
function getSourceColor(type) {
  // 1. Direct match in SSOT
  if (nodeTypeConfig && nodeTypeConfig[type]) return nodeTypeConfig[type].color;
  // 2. Check variants (e.g. trajectory_success -> trajectory.variants.trajectory_success)
  if (nodeTypeConfig) {
    for (const [, cfg] of Object.entries(nodeTypeConfig)) {
      if (cfg.variants && cfg.variants[type]) return cfg.variants[type].color;
    }
  }
  // 3. Fallback to hardcoded defaults
  return sourceColorFallbacks[type] || '#6B2FB5';
}

/**
 * Category colors for neural_pattern nodes
 * Aligned with database schema: neural_patterns.category
 * Categories from DB: filetype, directory, component
 */
const categoryColors = {
  // Actual database categories from neural_patterns table
  filetype: '#3B82F6',     // Blue - File type patterns (e.g., filetype:.js)
  directory: '#10B981',    // Green - Directory patterns (e.g., directory:src)
  component: '#F59E0B',    // Amber - Component patterns (e.g., component:command)
  // Semantic categories (used for categorization/filtering)
  security: '#EF4444',
  quality: '#10B981',
  performance: '#F59E0B',
  testing: '#3B82F6',
  api: '#06B6D4',
  debugging: '#F97316',
  refactoring: '#A855F7',
  documentation: '#6B7280',
  general: '#EC4899'
};

/**
 * Memory type colors for memory nodes
 * Aligned with database schema: memories.memory_type
 * Core types from DB: command, file_access, edit, search_pattern, project, agent_spawn
 */
const memoryTypeColors = {
  // Core memory types from database schema (01-database-schema.md)
  command: '#3498DB',      // Blue - Bash commands executed
  file_access: '#F39C12',  // Orange - Files read
  edit: '#2ECC71',         // Green - Files edited
  search_pattern: '#5C6BC0', // Indigo - Search queries
  project: '#7E57C2',      // Deep Purple - Project-level info
  agent_spawn: '#FF8F00',  // Amber - Agent spawns
  // Extended memory types
  adr: '#E74C3C',          // Red - Architecture Decision Records
  neural_general: '#9B59B6', // Purple - General neural patterns
  design_brand: '#D946EF',
  design_colors: '#C026D3',
  design_component: '#A855F7',
  architecture: '#00897B', // Teal
  lesson: '#9E9D24',       // Lime
  task: '#7B1FA2',         // Deep purple
  action: '#009688',       // Teal variant
  test: '#00BCD4'          // Cyan
};

function getNamespaceColor(namespace) {
  if (config.namespaceColors[namespace]) {
    return config.namespaceColors[namespace];
  }
  for (const [ns, color] of Object.entries(defaultColors)) {
    if (namespace.startsWith(ns)) {
      config.namespaceColors[namespace] = color;
      return color;
    }
  }
  // Generate hash-based color in hex format for HTML color inputs
  let hash = 0;
  for (let i = 0; i < namespace.length; i++) {
    hash = namespace.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  // Convert HSL to RGB to Hex
  const h = hue / 360;
  const s = 0.7;
  const l = 0.5;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h * 12) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color);
  };
  const r = f(0);
  const gVal = f(8);
  const b = f(4);
  const color = '#' + [r, gVal, b].map(x => x.toString(16).padStart(2, '0')).join('');
  config.namespaceColors[namespace] = color;
  return color;
}

// Pre-defined colors for better visual distinction
const prefixColorPalette = [
  '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231',
  '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe',
  '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000',
  '#aaffc3', '#808000', '#ffd8b1', '#000075', '#808080'
];
let prefixColorIndex = 0;

function getPrefixColor(prefix) {
  if (config.prefixColors[prefix]) return config.prefixColors[prefix];
  // Assign colors from palette in order for distinct colors
  const color = prefixColorPalette[prefixColorIndex % prefixColorPalette.length];
  prefixColorIndex++;
  config.prefixColors[prefix] = color;
  return color;
}

/**
 * Check if a node is a Q-pattern node
 * @param {Object} d - The node data
 * @returns {boolean} True if the node is a Q-pattern
 */
function isQPatternNode(d) {
  return d.source === 'qPatterns' || d.source === 'qPatternsIntel' || d.source === 'q_pattern';
}

/**
 * Check if a node is a trajectory node
 * @param {Object} d - The node data
 * @returns {boolean} True if the node is a trajectory
 */
function isTrajectoryNode(d) {
  return d.source === 'trajectories' || d.source === 'trajectory'
      || d.source === 'trajectory_success' || d.source === 'trajectory_failed';
}

/**
 * Check if a node is a memory node
 * @param {Object} d - The node data
 * @returns {boolean} True if the node is a memory
 */
function isMemoryNode(d) {
  return d.source === 'memory' || d.source === 'metadataDb';
}

/**
 * Check if a node is a neural pattern node
 * @param {Object} d - The node data
 * @returns {boolean} True if the node is a neural pattern
 */
function isNeuralPatternNode(d) {
  return d.source === 'neural_pattern' || d.source === 'intelligenceDb';
}

/**
 * Check if a node is a state node
 * @param {Object} d - The node data
 * @returns {boolean} True if the node is a state
 */
function isStateNode(d) {
  return d.source === 'state';
}

/**
 * Check if a node is an action node
 * @param {Object} d - The node data
 * @returns {boolean} True if the node is an action
 */
function isActionNode(d) {
  return d.source === 'action';
}

/**
 * Check if a node is a file node
 * @param {Object} d - The node data
 * @returns {boolean} True if the node is a file
 */
function isFileNode(d) {
  return getNodeSourceType(d) === 'file';
}

/**
 * Check if a node is an agent node
 * @param {Object} d - The node data
 * @returns {boolean} True if the node is an agent
 */
function isAgentNode(d) {
  return getNodeSourceType(d) === 'agent';
}

/**
 * Get the node shape based on node type (canonical mapping from Constants.ts)
 * @param {Object} d - The node data
 * @returns {string} Shape type matching Constants.ts SHAPE_CONFIG
 */
function getNodeShape(d) {
  const src = getNodeSourceType(d);
  switch (src) {
    case 'memory': return 'circle';
    case 'neural_pattern': return 'diamond';
    case 'q_pattern': return 'square';
    case 'trajectory':
    case 'trajectory_success':
    case 'trajectory_failed': return 'pentagon';
    case 'file': return 'star';
    case 'state': return 'hexagon';
    case 'action': return 'triangle';
    case 'agent': return 'inverted_triangle';
    default: return 'circle';
  }
}

function getNodeColor(d, allNodes) {
  // Q-Pattern overlay takes precedence when active
  if (config.qPatternMode !== 'off') {
    if (config.qPatternMode === 'highlight') {
      // Highlight Q-pattern nodes with distinct color
      if (isQPatternNode(d)) {
        // Check if specific pattern selected
        if (config.selectedQPattern !== 'all' && d.key !== config.selectedQPattern) {
          return '#333'; // Dim non-selected patterns
        }
        return '#ff6b6b'; // Bright red for Q-patterns
      }
      return '#444'; // Dim other nodes
    }
    if (config.qPatternMode === 'colorByQValue') {
      if (isQPatternNode(d) && typeof d.qValue === 'number') {
        // Color by Q-value: low (red) to high (green)
        const qPatternNodes = allNodes.filter(n => isQPatternNode(n) && typeof n.qValue === 'number');
        const minQ = Math.min(...qPatternNodes.map(n => n.qValue));
        const maxQ = Math.max(...qPatternNodes.map(n => n.qValue));
        const ratio = maxQ > minQ ? (d.qValue - minQ) / (maxQ - minQ) : 0.5;
        return d3.interpolateRdYlGn(ratio);
      }
      return '#333'; // Non Q-pattern nodes dimmed
    }
  }

  // SONA trajectory overlay - all modes have timeline animation
  if (config.sonaTrajectoryMode !== 'off') {
    if (isTrajectoryNode(d)) {
      const trajectoryNodes = allNodes.filter(n => isTrajectoryNode(n));

      // Timeline animation applies to ALL SONA modes
      const timestamps = trajectoryNodes.map(n => n.timestamp).sort((a, b) => a - b);
      const minT = timestamps[0];
      const maxT = timestamps[timestamps.length - 1];
      const cutoff = minT + (maxT - minT) * (config.sonaTimelinePosition / 100);

      // If this node is not yet visible in timeline, dim it
      if (d.timestamp > cutoff) {
        return '#222';
      }

      // Node is visible - apply mode-specific coloring
      switch (config.sonaTrajectoryMode) {
        case 'timeline': {
          return d.success ? '#4CAF50' : '#f44336';
        }
        case 'microLora': {
          // Micro-LoRA: Color by quality/reward score - frequent small updates
          let quality = d.quality;
          if (quality == null && d.steps) {
            try {
              const stepsArr = typeof d.steps === 'string' ? JSON.parse(d.steps) : d.steps;
              if (Array.isArray(stepsArr) && stepsArr.length > 0) {
                const avgReward = stepsArr.reduce((sum, s) => sum + (s.reward || 0), 0) / stepsArr.length;
                quality = avgReward;
              }
            } catch (e) { quality = 0; }
          }
          quality = quality || 0;
          return d3.interpolateBlues(0.3 + quality * 0.7);
        }
        case 'baseLora': {
          // Base-LoRA: Color by steps count - larger batch updates
          let stepCount = 1;
          try {
            const stepsArr = typeof d.steps === 'string' ? JSON.parse(d.steps) : d.steps;
            stepCount = Array.isArray(stepsArr) ? stepsArr.length : 1;
          } catch (e) { stepCount = 1; }
          const getStepCount = (n) => {
            try {
              const arr = typeof n.steps === 'string' ? JSON.parse(n.steps) : n.steps;
              return Array.isArray(arr) ? arr.length : 1;
            } catch (e) { return 1; }
          };
          const maxSteps = Math.max(...trajectoryNodes.map(getStepCount), 1);
          return d3.interpolateOranges(0.3 + (stepCount / maxSteps) * 0.7);
        }
        case 'ewc': {
          // EWC: Color by success with purple theme - consolidation events
          return d.success ? '#9c27b0' : '#e91e63';
        }
        default:
          return d.success ? '#4CAF50' : '#f44336';
      }
    }
    return '#333'; // Dim non-trajectory nodes
  }

  // Standard color modes
  switch (config.nodeColorMode) {
    case 'sourceType': {
      // Node type coloring via SSOT (getSourceColor reads nodeTypeConfig)
      const sourceType = getNodeSourceType(d);
      return getSourceColor(sourceType);
    }
    case 'single':
      return config.nodeColor;
    case 'connectivity': {
      const maxConn = Math.max(...allNodes.map(n => n.connectionCount || 0), 1);
      return d3.interpolateViridis((d.connectionCount || 0) / maxConn);
    }
    case 'time': {
      const minTs = Math.min(...allNodes.map(n => n.timestamp));
      const maxTs = Math.max(...allNodes.map(n => n.timestamp));
      const ratio = (d.timestamp - minTs) / (maxTs - minTs || 1);
      return d3.interpolatePlasma(ratio);
    }
    case 'recency': {
      const minTs = Math.min(...allNodes.map(n => n.timestamp));
      const maxTs = Math.max(...allNodes.map(n => n.timestamp));
      const ratio = (d.timestamp - minTs) / (maxTs - minTs || 1);
      return d3.interpolateYlGn(ratio);  // Newer = brighter green
    }
    case 'rate': {
      const maxRate = Math.max(...allNodes.map(n => n.rate || 1), 1);
      return d3.interpolateInferno((d.rate || 1) / maxRate);
    }
    case 'charLength': {
      const maxLen = Math.max(...allNodes.map(n => n.valueLength), 1);
      return d3.interpolateYlOrRd(d.valueLength / maxLen);
    }
    case 'wordCount': {
      const maxWords = Math.max(...allNodes.map(n => n.wordCount || 1), 1);
      return d3.interpolateCool((d.wordCount || 1) / maxWords);
    }
    case 'contentType':
      return contentTypeColors[d.contentType] || '#888';
    case 'nsDepth':
      return depthColors[Math.min((d.nsDepth || 1) - 1, 2)];
    case 'keyPrefix':
      return getPrefixColor(d.keyPrefix || 'unknown');
    case 'dbSource':
      if (d.source === 'intelligenceDb') return config.intelligenceDbColor;
      if (d.source === 'trajectories') return config.trajectoriesColor;
      if (d.source === 'qPatterns') return config.qPatternsColor;
      if (d.source === 'qPatternsIntel') return config.qPatternsIntelColor;
      return config.metadataDbColor;
    case 'hasEmbedding':
      return d.hasEmbedding ? '#4CAF50' : '#ff5722';  // Green = has, Orange = no
    case 'crossLinkType': {
      // Color by what type of cross-links this node has
      if (d.source === 'qPatterns' || d.source === 'qPatternsIntel') return '#e91e63';  // Pink for Q-patterns
      if (d.source === 'trajectories') return '#ffeb3b';  // Yellow for trajectories
      if (d.crossLinkCount > 0) return '#9c27b0';  // Purple for nodes with cross-links
      return '#666';  // Gray for no cross-links
    }
    case 'qValue': {
      if (!isQPatternNode(d) || typeof d.qValue !== 'number') return '#333';
      const qNodes = allNodes.filter(n => isQPatternNode(n) && typeof n.qValue === 'number');
      const minQ = Math.min(...qNodes.map(n => n.qValue));
      const maxQ = Math.max(...qNodes.map(n => n.qValue));
      const ratio = maxQ > minQ ? (d.qValue - minQ) / (maxQ - minQ) : 0.5;
      return d3.interpolateRdYlGn(ratio);  // Red (low) to Green (high)
    }
    case 'visits': {
      if (!isQPatternNode(d)) return '#333';
      const qNodes = allNodes.filter(n => isQPatternNode(n));
      const maxVisits = Math.max(...qNodes.map(n => n.visits || 1), 1);
      const ratio = (d.visits || 1) / maxVisits;
      return d3.interpolateBlues(0.3 + ratio * 0.7);  // Light to dark blue
    }
    case 'state': {
      if (!isQPatternNode(d)) return '#333';
      // Hash state string to color
      const hash = (d.state || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      return d3.interpolateRainbow(hash % 360 / 360);
    }
    case 'action': {
      if (!isQPatternNode(d)) return '#333';
      // Hash action string to color
      const hash = (d.action || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      return d3.interpolateSinebow(hash % 360 / 360);
    }
    case 'success':
      if (!isTrajectoryNode(d)) return '#333';
      return d.success ? '#4CAF50' : '#f44336';  // Green = success, Red = failure
    case 'quality': {
      if (!isTrajectoryNode(d) || typeof d.quality !== 'number') return '#333';
      return d3.interpolateRdYlGn(d.quality);  // 0-1 range
    }
    case 'agent': {
      if (!isTrajectoryNode(d)) return '#333';
      // Hash agent name to color
      const hash = (d.agent || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      return d3.interpolateSet1(hash % 9 / 9);
    }
    case 'namespaceFull':
      return getNamespaceColor(d.namespace);  // Full namespace path color
    case 'nodeSource': {
      // Color by node types via SSOT
      const nsType = getNodeSourceType(d);
      return getSourceColor(nsType);
    }
    case 'memoryType':
      // Color by memory_type for memory nodes
      if (!isMemoryNode(d)) return '#333';
      return memoryTypeColors[d.memory_type] || memoryTypeColors[d.memoryType] || getSourceColor('memory');
    case 'category':
      // Color by category for neural_pattern nodes
      if (!isNeuralPatternNode(d)) return '#333';
      return categoryColors[d.category] || categoryColors[d.namespace] || getSourceColor('neural_pattern');
    case 'qValueGradient': {
      // Gradient color for q_patterns based on q_value (0-1 range mapped to purple spectrum)
      if (!isQPatternNode(d)) return '#333';
      const qVal = d.q_value ?? d.qValue ?? 0;
      // Map 0-1 to purple spectrum: light purple (low) to deep purple (high)
      const ratio = Math.max(0, Math.min(1, qVal));
      return d3.interpolatePurples(0.3 + ratio * 0.7);
    }
    case 'successColor':
      // Green/red for trajectories based on success (from SSOT variants)
      if (!isTrajectoryNode(d)) return '#333';
      return d.success ? getSourceColor('trajectory_success') : getSourceColor('trajectory_failed');
    case 'confidence': {
      // Gradient for neural_patterns based on confidence
      if (!isNeuralPatternNode(d)) return '#333';
      const conf = d.confidence ?? 0;
      // Map 0-1 to purple spectrum
      return d3.interpolatePurples(0.3 + conf * 0.7);
    }
    case 'namespace':
    default:
      return getNamespaceColor(d.namespace);
  }
}

function getNodeSize(d, allNodes) {
  const base = config.nodeSize;

  // Q-Pattern size by visits overlay
  if (config.qPatternMode === 'sizeByVisits' && isQPatternNode(d)) {
    const qPatternNodes = allNodes.filter(n => isQPatternNode(n) && typeof n.visits === 'number');
    const maxVisits = Math.max(...qPatternNodes.map(n => n.visits || 1), 1);
    return base + ((d.visits || 1) / maxVisits) * base * 2;
  }

  // SONA trajectory size
  if (config.sonaTrajectoryMode !== 'off' && isTrajectoryNode(d)) {
    return base * 1.5; // Make trajectories slightly larger
  }

  switch (config.nodeSizeMode) {
    case 'connectivity': {
      const maxConn = Math.max(...allNodes.map(n => n.connectionCount || 0), 1);
      return base + (d.connectionCount || 0) / maxConn * base;
    }
    case 'rate': {
      const maxRate = Math.max(...allNodes.map(n => n.rate || 1), 1);
      return base + ((d.rate || 1) / maxRate) * base;
    }
    case 'charLength': {
      const maxLen = Math.max(...allNodes.map(n => n.valueLength), 1);
      return base + (d.valueLength / maxLen) * base;
    }
    case 'wordCount': {
      const maxWords = Math.max(...allNodes.map(n => n.wordCount || 1), 1);
      return base + ((d.wordCount || 1) / maxWords) * base;
    }
    case 'recency': {
      const minTs = Math.min(...allNodes.map(n => n.timestamp));
      const maxTs = Math.max(...allNodes.map(n => n.timestamp));
      const ratio = (d.timestamp - minTs) / (maxTs - minTs || 1);
      return base + ratio * base;  // Newer = larger
    }
    case 'crossLinks': {
      // Count cross-type connections (pattern-memory, trajectory-memory)
      const crossCount = d.crossLinkCount || 0;
      const maxCross = Math.max(...allNodes.map(n => n.crossLinkCount || 0), 1);
      return base + (crossCount / maxCross) * base;
    }
    case 'nsDepth': {
      const maxDepth = Math.max(...allNodes.map(n => n.nsDepth || 1), 1);
      return base + ((d.nsDepth || 1) / maxDepth) * base;
    }
    case 'qValue': {
      if (!isQPatternNode(d) || typeof d.qValue !== 'number') return base * 0.5;
      const qNodes = allNodes.filter(n => isQPatternNode(n) && typeof n.qValue === 'number');
      const minQ = Math.min(...qNodes.map(n => n.qValue));
      const maxQ = Math.max(...qNodes.map(n => n.qValue));
      const ratio = maxQ > minQ ? (d.qValue - minQ) / (maxQ - minQ) : 0.5;
      return base + ratio * base * 1.5;
    }
    case 'visits': {
      if (!isQPatternNode(d)) return base * 0.5;
      const qNodes = allNodes.filter(n => isQPatternNode(n));
      const maxVisits = Math.max(...qNodes.map(n => n.visits || 1), 1);
      return base + ((d.visits || 1) / maxVisits) * base * 1.5;
    }
    case 'success': {
      if (!isTrajectoryNode(d)) return base * 0.5;
      return d.success ? base * 2 : base;  // Success = larger
    }
    case 'quality': {
      if (!isTrajectoryNode(d) || typeof d.quality !== 'number') return base * 0.5;
      return base + d.quality * base;  // Quality 0-1 range
    }
    case 'nodeType':
      // Size by node type with specific formulas:
      // q_patterns: 8 + q_value * 10
      // trajectories: 10 + stepCount * 0.5
      // neural_patterns: 6 + min(usage, 10)
      // memories: base size 6
      if (isQPatternNode(d)) {
        const qVal = d.q_value ?? d.qValue ?? 0;
        return 8 + qVal * 10;
      }
      if (isTrajectoryNode(d)) {
        const stepCount = d.stepCount ?? d.steps?.length ?? 0;
        return 10 + stepCount * 0.5;
      }
      if (isNeuralPatternNode(d)) {
        const usage = d.usage_count ?? d.usage ?? 0;
        return 6 + Math.min(usage, 10);
      }
      // Memory nodes get base size
      return 6;
    case 'fixed':
    default:
      return base;
  }
}

function getLinkWidth(d) {
  const base = config.linkWidth;
  switch (config.linkWidthMode) {
    case 'similarity':
      return base + (d.weight - 0.72) * 10; // Scale from threshold
    case 'fixed':
    default:
      return base;
  }
}

/**
 * Edge type colors for structural relationships
 * Updated to include new edge types for Veracy visualization
 */
const edgeTypeColors = {
  'embedding': null,           // Use config.linkColor
  'same-state': '#ff6b6b',     // Red - Q-patterns with same state
  'same-action': '#ffa500',    // Orange - Q-patterns with same action
  'same-task': '#4CAF50',      // Green - Trajectories with same task
  'same-agent-sequential': '#2196F3', // Blue - Same agent timeline
  'trajectory-sequence': '#00bcd4',   // Cyan - Temporal sequence
  'trajectory-success': '#8bc34a',    // Light green - Successful trajectories
  'trajectory-failure': '#ff5722',    // Deep orange - Failed trajectories
  'pattern-trajectory': '#9c27b0',    // Purple - Q-pattern ↔ trajectory
  'pattern-memory': '#e91e63',        // Pink - Q-pattern ↔ memory
  'trajectory-memory': '#48BB78',     // Green - Trajectory ↔ memory (temporal)
  // New edge types for Veracy visualization
  'same-namespace': '#8B4FD9',        // Purple - nodes in same namespace
  'same-source': '#B794F6',           // Light purple - nodes from same source
  'cross-type': '#6B7280',            // Gray - cross-type connections
  // Workflow edges (from SOLUTION-002)
  'coedit': '#4299E1',                // Blue - Co-edit patterns (files edited together)
  'sequence': '#38B2AC',              // Teal - Sequence (step → step)
  'explicit': '#ECC94B',              // Yellow - Explicit edges from edges table
  // Q-pattern decomposition edges (state/action nodes)
  'has_state': '#E67E22',             // Orange - Q-pattern → State
  'has_action': '#2ECC71',            // Green - Q-pattern → Action
  'is_agent': '#34495E',              // Dark gray-blue - Trajectory → Agent
  // Trajectory cross-type edges
  'trajectory-agent': '#5DADE2',      // Light blue - Trajectory → Agent
  'trajectory-neural': '#AF7AC5',     // Light purple - Trajectory → Neural pattern
  // Q-pattern structural edges
  'same-state-prefix': '#F39C12'      // Amber - Same state prefix chain
};

/**
 * Get edge color based on edge type and connected nodes
 * @param {Object} d - The edge data
 * @param {Array} allNodes - All nodes in the graph (optional)
 * @returns {string} Color hex code
 */
function getEdgeColor(d, allNodes) {
  // If explicit type is set, use it
  if (config.colorEdgesByType && d.type && edgeTypeColors[d.type]) {
    return edgeTypeColors[d.type];
  }

  // Determine edge type from connected nodes
  const sourceNode = typeof d.source === 'object' ? d.source : null;
  const targetNode = typeof d.target === 'object' ? d.target : null;

  if (sourceNode && targetNode) {
    // Same namespace edge
    if (sourceNode.namespace === targetNode.namespace) {
      return edgeTypeColors['same-namespace'];
    }

    // Same node type edge
    if (sourceNode.source === targetNode.source) {
      return edgeTypeColors['same-source'];
    }

    // Cross-type edge (different node types)
    if (sourceNode.source !== targetNode.source) {
      return edgeTypeColors['cross-type'];
    }
  }

  return config.linkColor;
}

/**
 * Get link color for rendering
 * Uses edge group settings with fallback to type-specific colors
 * @param {Object} d - The edge data
 * @returns {string} Color hex code
 */
function getLinkColor(d) {
  const edgeType = d.type || 'embedding';
  const group = getEdgeGroup(edgeType);
  const groupSettings = config.edgeGroups[group];

  // If group has custom color set, use it (unless colorEdgesByType is enabled)
  if (!config.colorEdgesByType && groupSettings.color) {
    return groupSettings.color;
  }

  // Otherwise use type-specific colors
  return getEdgeColor(d);
}

/**
 * Get link opacity based on edge group
 * @param {Object} d - The edge data
 * @returns {number} Opacity value 0-1
 */
function getLinkOpacity(d) {
  const edgeType = d.type || 'embedding';
  const group = getEdgeGroup(edgeType);
  return config.edgeGroups[group].opacity;
}

/**
 * Get link width based on edge group and settings
 * @param {Object} d - The edge data
 * @returns {number} Width in pixels
 */
function getLinkWidthByGroup(d) {
  const edgeType = d.type || 'embedding';
  const group = getEdgeGroup(edgeType);
  const groupWidth = config.edgeGroups[group].width;

  // Apply similarity scaling if enabled
  if (config.linkWidthMode === 'similarity' && d.weight) {
    return groupWidth * (0.5 + d.weight * 0.5);
  }
  return groupWidth;
}

/**
 * Get link dash array based on edge group
 * @param {Object} d - The edge data
 * @returns {string} SVG stroke-dasharray value
 */
function getLinkDashArray(d) {
  const edgeType = d.type || 'embedding';
  const group = getEdgeGroup(edgeType);
  return config.edgeGroups[group].dashArray;
}

/**
 * Get link distance for force simulation based on edge group
 * @param {Object} d - The edge data
 * @returns {number} Distance in pixels
 */
function getLinkDistance(d) {
  const edgeType = d.type || 'embedding';
  const group = getEdgeGroup(edgeType);
  return config.edgeGroups[group].distance;
}

/**
 * Get link strength for force simulation based on edge group
 * @param {Object} d - The edge data
 * @returns {number} Strength value 0-1
 */
function getLinkStrength(d) {
  const edgeType = d.type || 'embedding';
  const group = getEdgeGroup(edgeType);
  return config.edgeGroups[group].strength * (d.weight || 0.5);
}

async function loadData(forceRefresh = false, threshold = null) {
  let url = forceRefresh ? '/api/graph?refresh=true' : '/api/graph';
  if (threshold !== null) {
    url += (url.includes('?') ? '&' : '?') + `threshold=${threshold}`;
  }
  const res = await fetch(url);
  graphData = await res.json();
  timelineData = graphData.timeline;
  metricsData = graphData.metrics;
  // Extract SSOT node type configuration from server response
  nodeTypeConfig = graphData.nodeTypeConfig || null;
  return graphData;
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function renderTimeline() {
  const chart = document.getElementById('timelineChart');
  const { byDay } = timelineData;
  const maxCount = Math.max(...byDay.map(d => d.count));

  chart.innerHTML = byDay.map(({ day, count }) => {
    const height = (count / maxCount) * 100;
    const date = new Date(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `<div class="day-bar" style="height:${height}%" data-day="${day}">
      <div class="tooltip">${date}: ${count} entries</div>
    </div>`;
  }).join('');

  // Initialize current date display
  document.getElementById('currentDate').textContent = formatDate(timelineData.maxTimestamp);
}

function renderMetrics() {
  const m = metricsData || {};
  const content = document.getElementById('metricsContent');
  if (!content) return;

  // Calculate metrics from nodes and links if not provided
  const nodeCount = nodes ? nodes.length : 0;
  const linkCount = links ? links.length : 0;

  // Graph density: actual edges / possible edges
  const possibleEdges = nodeCount > 1 ? (nodeCount * (nodeCount - 1)) / 2 : 1;
  const density = nodeCount > 1 ? safeFixed((linkCount / possibleEdges) * 100, 3, '0') : '0';

  // Connection stats
  const connectionCounts = {};
  if (links) {
    links.forEach(l => {
      const src = typeof l.source === 'object' ? l.source.index : l.source;
      const tgt = typeof l.target === 'object' ? l.target.index : l.target;
      connectionCounts[src] = (connectionCounts[src] || 0) + 1;
      connectionCounts[tgt] = (connectionCounts[tgt] || 0) + 1;
    });
  }
  const counts = Object.values(connectionCounts);
  const avgConnections = counts.length > 0 ? safeFixed(counts.reduce((a, b) => a + b, 0) / counts.length, 1, '0') : '0';
  const maxConnections = counts.length > 0 ? Math.max(...counts) : 0;

  // Word count stats
  const wordCounts = nodes ? nodes.map(n => n.wordCount || 0).filter(w => w > 0) : [];
  const avgWordCount = wordCounts.length > 0 ? Math.round(wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length) : '-';
  const minWordCount = wordCounts.length > 0 ? Math.min(...wordCounts) : '-';
  const maxWordCount = wordCounts.length > 0 ? Math.max(...wordCounts) : '-';

  // Content type counts
  const contentTypeCounts = {};
  if (nodes) {
    nodes.forEach(n => {
      const type = n.contentType || 'unknown';
      contentTypeCounts[type] = (contentTypeCounts[type] || 0) + 1;
    });
  }

  // Top key prefixes
  const prefixCounts = {};
  if (nodes) {
    nodes.forEach(n => {
      const prefix = n.keyPrefix || 'other';
      prefixCounts[prefix] = (prefixCounts[prefix] || 0) + 1;
    });
  }
  const topKeyPrefixes = Object.entries(prefixCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  content.innerHTML = `
    <div class="metric-section">
      <div class="metric-section-title">Graph Structure</div>
      <div class="metric-row"><span class="metric-label">Nodes</span><span class="metric-value">${nodeCount}</span></div>
      <div class="metric-row"><span class="metric-label">Edges</span><span class="metric-value">${linkCount}</span></div>
      <div class="metric-row"><span class="metric-label">Density</span><span class="metric-value">${density}%</span></div>
      <div class="metric-row"><span class="metric-label">Avg Connections</span><span class="metric-value">${avgConnections}</span></div>
      <div class="metric-row"><span class="metric-label">Max Connections</span><span class="metric-value">${maxConnections}</span></div>
    </div>
    <div class="metric-section">
      <div class="metric-section-title">Content</div>
      <div class="metric-row"><span class="metric-label">Avg Length</span><span class="metric-value">${m.avgValueLength || '-'} chars</span></div>
      <div class="metric-row"><span class="metric-label">Avg Words</span><span class="metric-value">${avgWordCount}</span></div>
      <div class="metric-row"><span class="metric-label">Word Range</span><span class="metric-value">${minWordCount} - ${maxWordCount}</span></div>
    </div>
    <div class="metric-section">
      <div class="metric-section-title">Content Types</div>
      ${Object.entries(contentTypeCounts).map(([type, count]) =>
        `<div class="metric-row"><span class="metric-label">${type}</span><span class="metric-value">${count}</span></div>`
      ).join('')}
    </div>
  `;
}

function renderV3Panel() {
  if (!graphData.v3) return;

  const sonaStats = document.getElementById('sona-stats');
  const intelStats = document.getElementById('intel-stats');

  // Render SONA stats
  if (graphData.v3.sona) {
    const s = graphData.v3.sona;
    sonaStats.innerHTML = `
      <div class="metric-row"><span class="metric-label">Trajectories</span><span class="metric-value">${s.trajectoriesRecorded || 0}</span></div>
      <div class="metric-row"><span class="metric-label">Micro-LoRA Updates</span><span class="metric-value">${s.microLoraUpdates || 0}</span></div>
      <div class="metric-row"><span class="metric-label">Base-LoRA Updates</span><span class="metric-value">${s.baseLoraUpdates || 0}</span></div>
      <div class="metric-row"><span class="metric-label">EWC++ Consolidations</span><span class="metric-value">${s.ewcConsolidations || 0}</span></div>
      <div class="metric-row"><span class="metric-label">Patterns Learned</span><span class="metric-value">${s.patternsLearned || 0}</span></div>
    `;
  } else {
    sonaStats.innerHTML = '<div style="color:#666;font-size:11px;">SONA engine not active</div>';
  }

  // Render Intelligence stats
  if (graphData.v3.intelligence) {
    const i = graphData.v3.intelligence;
    intelStats.innerHTML = `
      <div class="metric-row"><span class="metric-label">Total Memories</span><span class="metric-value">${i.totalMemories || 0}</span></div>
      <div class="metric-row"><span class="metric-label">Total Patterns</span><span class="metric-value">${i.totalPatterns || 0}</span></div>
      ${i.qLearning && i.qLearning.avgReward && i.qLearning.avgReward !== 'NaN' ? `<div class="metric-row"><span class="metric-label">Q-Learning Reward</span><span class="metric-value">${i.qLearning.avgReward}</span></div>` : ''}
      ${i.attentionMechanisms && i.attentionMechanisms.length > 0 ? `<div class="metric-row"><span class="metric-label">Attention Mechs</span><span class="metric-value">${i.attentionMechanisms.length}</span></div>` : ''}
    `;
  } else {
    intelStats.innerHTML = '<div style="color:#666;font-size:11px;">Intelligence layer not active</div>';
  }
}

function renderV3Metrics() {
  if (!graphData.v3) return;

  const content = document.getElementById('v3MetricsContent');
  const v3 = graphData.v3;

  let html = '';

  // Data Sources Breakdown - count nodes by source
  const sourceCounts = {
    metadataDb: 0,
    intelligenceDb: 0,
    trajectories: 0,
    qPatterns: 0,
    qPatternsIntel: 0
  };

  if (nodes && nodes.length > 0) {
    nodes.forEach(n => {
      const src = n.source || 'metadataDb';
      if (sourceCounts[src] !== undefined) {
        sourceCounts[src]++;
      }
    });
  }

  html += `
    <div class="metric-section">
      <div class="metric-section-title">Data Sources</div>
      <div class="metric-row"><span class="metric-label">📦 metadata.db</span><span class="metric-value">${sourceCounts.metadataDb}</span></div>
      <div class="metric-row"><span class="metric-label">🧠 intelligence.db</span><span class="metric-value">${sourceCounts.intelligenceDb}</span></div>
      <div class="metric-row"><span class="metric-label">🛤️ trajectories</span><span class="metric-value">${sourceCounts.trajectories}</span></div>
      <div class="metric-row"><span class="metric-label">🎯 Q-patterns</span><span class="metric-value">${sourceCounts.qPatterns}</span></div>
      <div class="metric-row"><span class="metric-label">🎲 Q-intel</span><span class="metric-value">${sourceCounts.qPatternsIntel}</span></div>
    </div>
  `;

  // Update source counts in settings
  const metadataDbCountEl = document.getElementById('metadataDbCount');
  const intelligenceDbCountEl = document.getElementById('intelligenceDbCount');
  const trajectoriesCountEl = document.getElementById('trajectoriesCount');
  const qPatternsCountEl = document.getElementById('qPatternsCount');
  const qPatternsIntelCountEl = document.getElementById('qPatternsIntelCount');

  if (metadataDbCountEl) metadataDbCountEl.textContent = `(${sourceCounts.metadataDb})`;
  if (intelligenceDbCountEl) intelligenceDbCountEl.textContent = `(${sourceCounts.intelligenceDb})`;
  if (trajectoriesCountEl) trajectoriesCountEl.textContent = `(${sourceCounts.trajectories})`;
  if (qPatternsCountEl) qPatternsCountEl.textContent = `(${sourceCounts.qPatterns})`;
  if (qPatternsIntelCountEl) qPatternsIntelCountEl.textContent = `(${sourceCounts.qPatternsIntel})`;

  // Update edge count display
  const edgeCountDisplay = document.getElementById('edgeCountDisplay');
  if (edgeCountDisplay && graphData.meta) {
    edgeCountDisplay.textContent = `${graphData.meta.totalEdges} edges`;
  }

  // Similarity Analysis (keep at top of v3 section)
  if (metricsData) {
    const m = metricsData;
    const avgSim = safeNum(parseFloat(m.avgSimilarity), null);
    const maxSim = safeNum(parseFloat(m.maxSimilarity), null);
    const minSim = safeNum(parseFloat(m.minSimilarity), null);
    const threshold = safeStr(m.similarityThreshold || config.similarityThreshold, '-');

    html += `
      <div class="metric-section">
        <div class="metric-section-title">Similarity</div>
        <div class="metric-row"><span class="metric-label">Threshold</span><span class="metric-value">${threshold}</span></div>
        ${avgSim !== null ? `<div class="metric-row"><span class="metric-label">Average</span><span class="metric-value">${safeFixed(avgSim, 3)}</span></div>` : ''}
        ${maxSim !== null ? `<div class="metric-row"><span class="metric-label">Max</span><span class="metric-value">${safeFixed(maxSim, 3)}</span></div>` : ''}
        ${minSim !== null ? `<div class="metric-row"><span class="metric-label">Min</span><span class="metric-value">${safeFixed(minSim, 3)}</span></div>` : ''}
      </div>
    `;
  }

  // SONA Learning Metrics
  if (v3.sona) {
    const s = v3.sona;
    const totalUpdates = safeNum(s.microLoraUpdates) + safeNum(s.baseLoraUpdates);
    const learningVelocity = totalUpdates > 0 ? safeFixed(safeNum(s.patternsLearned) / totalUpdates, 3, '0.000') : '0.000';

    html += `
      <div class="metric-section">
        <div class="metric-section-title">SONA Learning</div>
        <div class="metric-row"><span class="metric-label">Total Updates</span><span class="metric-value">${totalUpdates}</span></div>
        <div class="metric-row"><span class="metric-label">Learning Velocity</span><span class="metric-value">${learningVelocity}</span></div>
        <div class="metric-row"><span class="metric-label">Consolidations</span><span class="metric-value">${s.ewcConsolidations || 0}</span></div>
      </div>
    `;
  }

  // Q-Learning summary (without Top Patterns - moved to Top Items section)
  if (v3.intelligence?.qLearning?.patterns) {
    const patterns = v3.intelligence.qLearning.patterns;

    // Populate pattern dropdown
    const patternSelect = document.getElementById('qPatternSelect');
    if (patternSelect) {
      const currentValue = patternSelect.value;
      patternSelect.innerHTML = '<option value="all">All Patterns</option>' +
        patterns.map(p => `<option value="${p.key}">${p.state} → ${p.action}</option>`).join('');
      patternSelect.value = currentValue;
    }

    const avgQValue = v3.intelligence.qLearning.avgReward;
    const avgQDisplay = safeFixed(parseFloat(avgQValue), 4, '-');

    html += `
      <div class="metric-section">
        <div class="metric-section-title">Q-Learning</div>
        <div class="metric-row"><span class="metric-label">Total Patterns</span><span class="metric-value">${patterns.length}</span></div>
        <div class="metric-row"><span class="metric-label">Avg Q-Value</span><span class="metric-value">${avgQDisplay}</span></div>
        <div class="metric-row"><span class="metric-label">Total Visits</span><span class="metric-value">${patterns.reduce((sum, p) => sum + (p.visits || 0), 0)}</span></div>
      </div>
    `;
  }

  content.innerHTML = html;
}

function renderTopItems() {
  const content = document.getElementById('topItemsContent');
  if (!content) return;

  let html = '';

  // Top Namespaces
  if (metricsData?.namespaceCounts) {
    const topNs = Object.entries(metricsData.namespaceCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    html += `
      <div class="metric-section">
        <div class="metric-section-title">Top Namespaces</div>
        ${topNs.map(([ns, count]) =>
          `<div class="metric-row"><span class="metric-label">${ns.length > 15 ? ns.slice(0, 13) + '...' : ns}</span><span class="metric-value">${count}</span></div>`
        ).join('')}
      </div>
    `;
  }

  // Top Prefixes
  if (nodes && nodes.length > 0) {
    const prefixCounts = {};
    nodes.forEach(n => {
      const prefix = n.keyPrefix || 'other';
      prefixCounts[prefix] = (prefixCounts[prefix] || 0) + 1;
    });
    const topPrefixes = Object.entries(prefixCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    html += `
      <div class="metric-section">
        <div class="metric-section-title">Top Prefixes</div>
        ${topPrefixes.map(([prefix, count]) =>
          `<div class="metric-row"><span class="metric-label">${prefix}</span><span class="metric-value">${count}</span></div>`
        ).join('')}
      </div>
    `;
  }

  // Top Q-Learning Patterns (v3)
  if (graphData?.v3?.intelligence?.qLearning?.patterns) {
    const patterns = graphData.v3.intelligence.qLearning.patterns;
    const topPatterns = patterns.slice(0, 5).filter(p => typeof p.qValue === 'number' && p.visits !== undefined);

    if (topPatterns.length > 0) {
      html += `
        <div class="metric-section">
          <div class="metric-section-title">🧠 Top Q-Patterns (v3)</div>
          ${topPatterns.map(p => `
            <div class="metric-row">
              <span class="metric-label" style="font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.action || p.key}</span>
              <span class="metric-value" style="font-size:10px;">Q:${safeFixed(p.qValue, 1, '-')} V:${safeNum(p.visits, 0)}</span>
            </div>
          `).join('')}
        </div>
      `;
    }
  }

  content.innerHTML = html;
}

function rebuildGraph() {
  if (!svg || !simulation || !linkGroup || !nodeGroup) return;

  nodes = graphData.nodes.map((n, i) => ({
    ...n,
    index: i,
    x: n.x * window.innerWidth / 4096,
    y: n.y * window.innerHeight / 4096
  }));

  // Map edges preserving type, then filter by visibility
  const allLinks = graphData.edges.map(e => ({
    source: e.source,
    target: e.target,
    weight: e.weight,
    type: e.type || 'embedding'
  }));

  // Filter links by edge type visibility
  links = allLinks.filter(d => config.visibleEdgeTypes[d.type] !== false);
  console.log(`rebuildGraph: ${allLinks.length} total edges -> ${links.length} visible`);

  // Link strength function for simulation
  const linkStrength = (d) => {
    const type = d.type || 'embedding';
    if (type === 'pattern-memory' || type === 'trajectory-memory') return 0.01;
    if (type === 'same-state' || type === 'same-action') return 0.03;
    if (type.startsWith('trajectory-')) return 0.05;
    return 0.1;
  };

  // Update D3 data bindings
  link = linkGroup.selectAll('line')
    .data(links, (d, i) => `${d.source}-${d.target}-${d.type}`);

  link.exit().remove();

  const linkEnter = link.enter().append('line')
    .attr('stroke', d => getLinkColor(d))
    .attr('stroke-opacity', config.linkOpacity)
    .attr('stroke-width', d => getLinkWidth(d));

  link = linkEnter.merge(link);

  // Rebuild nodes with shape support
  node = nodeGroup.selectAll('.node')
    .data(nodes, d => d.id);

  node.exit().remove();

  const nodeEnter = node.enter().append('g')
    .attr('class', 'node')
    .call(drag(simulation));

  // Add shapes to new nodes (canonical shapes from Constants.ts)
  nodeEnter.each(function(d) {
    const shape = getNodeShape(d);
    const size = getNodeSize(d, nodes);
    const sel = d3.select(this);
    const fill = getNodeColor(d, nodes);
    const opacity = config.nodeOpacity;

    switch (shape) {
      case 'square':
        sel.append('rect')
          .attr('class', 'node-shape')
          .attr('width', size * 2).attr('height', size * 2)
          .attr('x', -size).attr('y', -size)
          .attr('fill', fill).attr('opacity', opacity);
        break;
      case 'diamond': {
        const pts = `0,${-size} ${size},0 0,${size} ${-size},0`;
        sel.append('polygon').attr('class', 'node-shape')
          .attr('points', pts).attr('fill', fill).attr('opacity', opacity);
        break;
      }
      case 'triangle': {
        const pts = `0,${-size} ${size},${size} ${-size},${size}`;
        sel.append('polygon').attr('class', 'node-shape')
          .attr('points', pts).attr('fill', fill).attr('opacity', opacity);
        break;
      }
      case 'inverted_triangle': {
        const pts = `${-size},${-size} ${size},${-size} 0,${size}`;
        sel.append('polygon').attr('class', 'node-shape')
          .attr('points', pts).attr('fill', fill).attr('opacity', opacity);
        break;
      }
      case 'pentagon': {
        // Regular pentagon
        const pts = [0,1,2,3,4].map(i => {
          const angle = (i * 2 * Math.PI / 5) - Math.PI / 2;
          return `${(Math.cos(angle) * size).toFixed(1)},${(Math.sin(angle) * size).toFixed(1)}`;
        }).join(' ');
        sel.append('polygon').attr('class', 'node-shape')
          .attr('points', pts).attr('fill', fill).attr('opacity', opacity);
        break;
      }
      case 'hexagon': {
        const pts = [0,1,2,3,4,5].map(i => {
          const angle = (i * Math.PI / 3) - Math.PI / 6;
          return `${(Math.cos(angle) * size).toFixed(1)},${(Math.sin(angle) * size).toFixed(1)}`;
        }).join(' ');
        sel.append('polygon').attr('class', 'node-shape')
          .attr('points', pts).attr('fill', fill).attr('opacity', opacity);
        break;
      }
      case 'star': {
        // 5-point star (10 vertices alternating outer/inner)
        const pts = [];
        for (let i = 0; i < 10; i++) {
          const angle = (i * Math.PI / 5) - Math.PI / 2;
          const r = i % 2 === 0 ? size : size * 0.45;
          pts.push(`${(Math.cos(angle) * r).toFixed(1)},${(Math.sin(angle) * r).toFixed(1)}`);
        }
        sel.append('polygon').attr('class', 'node-shape')
          .attr('points', pts.join(' ')).attr('fill', fill).attr('opacity', opacity);
        break;
      }
      default:
        sel.append('circle').attr('class', 'node-shape')
          .attr('r', size).attr('fill', fill).attr('opacity', opacity);
        break;
    }
  });

  // Add event handlers
  nodeEnter
    .on('mouseover', (event, d) => {
      const tooltip = document.getElementById('tooltip');
      tooltip.style.display = 'block';
      tooltip.style.left = (event.pageX + 10) + 'px';
      tooltip.style.top = (event.pageY + 10) + 'px';

      let extraInfo = '';
      if (isQPatternNode(d)) {
        const qVal = d.q_value ?? d.qValue;
        extraInfo = `<div style="color:#B794F6;margin-top:4px;">Q-Value: ${typeof qVal === 'number' ? qVal.toFixed(4) : 'N/A'} · Visits: ${d.visits || 0}</div>`;
      } else if (isTrajectoryNode(d)) {
        extraInfo = `<div style="color:#10B981;margin-top:4px;">Success: ${d.success ? 'Yes' : 'No'} · Steps: ${d.stepCount || 'N/A'}${d.agent ? ' · Agent: ' + d.agent : ''}${d.durationMs ? ' · ' + (d.durationMs/1000).toFixed(1) + 's' : ''}</div>`;
      } else if (isNeuralPatternNode(d)) {
        const conf = d.confidence ?? 0;
        extraInfo = `<div style="color:#8B4FD9;margin-top:4px;">Category: ${d.category || d.namespace} · Confidence: ${(conf * 100).toFixed(1)}%${d.trajectoryId ? ' · Traj: ' + d.trajectoryId : ''}</div>`;
      } else if (isMemoryNode(d)) {
        const memType = d.memory_type || d.memoryType || 'unknown';
        extraInfo = `<div style="color:#6B2FB5;margin-top:4px;">Memory Type: ${memType.replace(/_/g, ' ')}${d.domain ? ' · Domain: ' + d.domain : ''}</div>`;
      } else if (isStateNode(d)) {
        extraInfo = `<div style="color:#E67E22;margin-top:4px;">State: ${d.stateValue || d.id} · Patterns: ${d.patternCount || 0} · Avg Q: ${typeof d.avgQ === 'number' ? d.avgQ.toFixed(4) : 'N/A'}</div>`;
      } else if (isActionNode(d)) {
        extraInfo = `<div style="color:#2ECC71;margin-top:4px;">Action: ${d.actionValue || d.id} · Patterns: ${d.patternCount || 0} · Avg Q: ${typeof d.avgQ === 'number' ? d.avgQ.toFixed(4) : 'N/A'}</div>`;
      } else if (isFileNode(d)) {
        extraInfo = `<div style="color:#1ABC9C;margin-top:4px;">File: ${d.filePath || d.id} · Type: ${d.fileType || 'unknown'}</div>`;
      } else if (isAgentNode(d)) {
        extraInfo = `<div style="color:#34495E;margin-top:4px;">Agent: ${d.agentType || d.agentSourceType || 'unknown'} · Role: ${d.topologyRole || 'standalone'}</div>`;
      }

      tooltip.innerHTML = `
        <div class="key">${d.key}</div>
        <div class="ns">${d.namespace}</div>
        <div class="date">${formatDate(d.timestamp)} - ${d.valueLength || 0} chars - ${d.wordCount || 0} words</div>
        <div class="preview">${d.preview || ''}</div>
        ${extraInfo}
      `;
    })
    .on('mouseout', () => {
      document.getElementById('tooltip').style.display = 'none';
    });

  node = nodeEnter.merge(node);

  simulation.nodes(nodes);
  simulation.force('link').links(links).strength(linkStrength);
  simulation.alpha(0.3).restart();

  updateColors();
  renderV3Metrics(); // Update counts after rebuild
  renderTopItems();
  renderDistributions(); // Update distribution panels after rebuild
  updateEdgeGroupCounts(); // Update edge type counts
}

/**
 * Get the normalized node type for a node
 * Maps various source field values to the new node types
 * @param {Object} d - The node data
 * @returns {string} The normalized node type
 */
function getNodeSourceType(d) {
  if (isMemoryNode(d)) return 'memory';
  if (isNeuralPatternNode(d)) return 'neural_pattern';
  if (isQPatternNode(d)) return 'q_pattern';
  if (isTrajectoryNode(d)) return 'trajectory';
  if (isStateNode(d)) return 'state';
  if (isActionNode(d)) return 'action';
  return d.source || 'memory';
}

// =============================================================================
// FIX-V07: Node click dispatch
// Handles node click events with visual feedback, detail panel, and Learnings
// tab dispatch based on node type.
// =============================================================================

/**
 * Escape HTML entities to prevent XSS in detail panel content
 * @param {string} str - The string to escape
 * @returns {string} The escaped string
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Show the node detail panel with type-specific information
 * @param {Object} d - The node datum from D3
 */
function showNodeDetail(d) {
  let detailPanel = document.getElementById('node-detail-panel');
  if (!detailPanel) {
    // Fallback: create the panel if the HTML element is missing
    detailPanel = document.createElement('div');
    detailPanel.id = 'node-detail-panel';
    document.body.appendChild(detailPanel);
  }

  detailPanel.style.display = 'block';

  const sourceType = getNodeSourceType(d);
  const typeLabel = sourceType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  let html = `<div class="detail-header">
    <h3>${escapeHtml(typeLabel)}</h3>
    <button class="detail-close" onclick="document.getElementById('node-detail-panel').style.display='none'">&times;</button>
  </div>`;

  html += `<div class="detail-id">${escapeHtml(d.id)}</div>`;

  // Key and namespace
  if (d.key) {
    html += `<div style="margin-bottom:4px;"><strong>Key:</strong> ${escapeHtml(d.key)}</div>`;
  }
  if (d.namespace) {
    html += `<div style="margin-bottom:4px;color:var(--text-muted,#aaa);font-size:11px;">${escapeHtml(d.namespace)}</div>`;
  }

  // Preview content
  if (d.preview) {
    html += `<div class="detail-preview">${escapeHtml(d.preview)}</div>`;
  }

  // Type-specific detail sections
  html += '<div class="detail-section">';

  switch (sourceType) {
    case 'trajectory': {
      const success = d.success;
      const successColor = success ? 'var(--success, #10B981)' : 'var(--error, #EF4444)';
      html += `<div><strong>Agent:</strong> ${escapeHtml(d.agent || 'unknown')}</div>`;
      if (d.context) html += `<div><strong>Context:</strong> ${escapeHtml(d.context)}</div>`;
      html += `<div><strong>Success:</strong> <span style="color:${successColor}">${success ? 'Yes' : 'No'}</span></div>`;
      html += `<div><strong>Steps:</strong> ${d.stepCount || d.steps?.length || 'N/A'}</div>`;
      if (d.durationMs) {
        html += `<div><strong>Duration:</strong> ${(d.durationMs / 1000).toFixed(1)}s</div>`;
      }
      if (d.quality != null) {
        html += `<div><strong>Quality:</strong> ${typeof d.quality === 'number' ? d.quality.toFixed(3) : d.quality}</div>`;
      }
      if (d.startTime) html += `<div><strong>Start:</strong> ${new Date(d.startTime).toLocaleString()}</div>`;
      if (d.endTime) html += `<div><strong>End:</strong> ${new Date(d.endTime).toLocaleString()}</div>`;
      break;
    }

    case 'q_pattern': {
      const qVal = d.q_value ?? d.qValue;
      const state = d.state || d.stateValue || '';
      const action = d.action || d.actionValue || '';
      if (state) html += `<div><strong>State:</strong> ${escapeHtml(state)}</div>`;
      if (action) html += `<div><strong>Action:</strong> ${escapeHtml(action)}</div>`;
      if (typeof qVal === 'number') {
        const qColor = qVal > 0.5 ? 'var(--success, #10B981)' : 'var(--error, #EF4444)';
        html += `<div><strong>Q-Value:</strong> <span style="color:${qColor}">${qVal.toFixed(4)}</span></div>`;
      }
      html += `<div><strong>Visits:</strong> ${d.visits || 0}</div>`;
      if (d.model) html += `<div><strong>Model:</strong> ${escapeHtml(d.model)}</div>`;
      break;
    }

    case 'neural_pattern': {
      if (d.category || d.namespace) {
        html += `<div><strong>Category:</strong> ${escapeHtml(d.category || d.namespace)}</div>`;
      }
      if (d.confidence != null) {
        html += `<div><strong>Confidence:</strong> ${(d.confidence * 100).toFixed(1)}%</div>`;
      }
      if (d.usageCount != null) {
        html += `<div><strong>Usage:</strong> ${d.usageCount}</div>`;
      }
      if (d.trajectoryId) {
        html += `<div><strong>Trajectory:</strong> ${escapeHtml(d.trajectoryId)}</div>`;
      }
      if (d.embeddingDim) html += `<div><strong>Embedding:</strong> ${d.embeddingDim}d</div>`;
      break;
    }

    case 'memory': {
      const memType = d.memory_type || d.memoryType;
      if (memType) {
        html += `<div><strong>Memory Type:</strong> ${escapeHtml(memType.replace(/_/g, ' '))}</div>`;
      }
      if (d.valueLength) {
        html += `<div><strong>Length:</strong> ${d.valueLength} chars</div>`;
      }
      if (d.wordCount) {
        html += `<div><strong>Words:</strong> ${d.wordCount}</div>`;
      }
      if (d.domain) html += `<div><strong>Domain:</strong> ${escapeHtml(d.domain)}</div>`;
      if (d.embeddingDim) html += `<div><strong>Embedding:</strong> ${d.embeddingDim}d</div>`;
      if (d.isFoundation) html += `<div><strong>Foundation:</strong> Yes (${d.layer || 'unknown'} layer)</div>`;
      break;
    }

    case 'state': {
      const stateVal = d.stateValue || d.id || '';
      html += `<div><strong>State Value:</strong> ${escapeHtml(stateVal)}</div>`;
      if (typeof d.patternCount === 'number') {
        html += `<div><strong>Pattern Count:</strong> ${d.patternCount}</div>`;
      }
      if (typeof d.avgQ === 'number') {
        const avgQColor = d.avgQ > 0.5 ? 'var(--success, #10B981)' : 'var(--error, #EF4444)';
        html += `<div><strong>Avg Q-Value:</strong> <span style="color:${avgQColor}">${d.avgQ.toFixed(4)}</span></div>`;
      }
      if (typeof d.totalVisits === 'number') {
        html += `<div><strong>Total Visits:</strong> ${d.totalVisits}</div>`;
      }
      break;
    }

    case 'action': {
      const actionVal = d.actionValue || d.id || '';
      html += `<div><strong>Action Value:</strong> ${escapeHtml(actionVal)}</div>`;
      if (typeof d.patternCount === 'number') {
        html += `<div><strong>Pattern Count:</strong> ${d.patternCount}</div>`;
      }
      if (typeof d.avgQ === 'number') {
        const avgQColor = d.avgQ > 0.5 ? 'var(--success, #10B981)' : 'var(--error, #EF4444)';
        html += `<div><strong>Avg Q-Value:</strong> <span style="color:${avgQColor}">${d.avgQ.toFixed(4)}</span></div>`;
      }
      if (typeof d.totalVisits === 'number') {
        html += `<div><strong>Total Visits:</strong> ${d.totalVisits}</div>`;
      }
      break;
    }

    case 'file': {
      if (d.filePath) html += `<div><strong>Path:</strong> ${escapeHtml(d.filePath)}</div>`;
      if (d.fileType) html += `<div><strong>Extension:</strong> ${escapeHtml(d.fileType)}</div>`;
      break;
    }

    case 'agent': {
      if (d.agentId) html += `<div><strong>Agent ID:</strong> ${escapeHtml(d.agentId)}</div>`;
      if (d.agentType || d.agentSourceType) html += `<div><strong>Type:</strong> ${escapeHtml(d.agentType || d.agentSourceType)}</div>`;
      if (d.agentModel) html += `<div><strong>Model:</strong> ${escapeHtml(d.agentModel)}</div>`;
      if (d.topologyRole) {
        const roleColor = d.topologyRole === 'queen' ? 'var(--warning, #F59E0B)' : 'var(--text-muted, #aaa)';
        html += `<div><strong>Role:</strong> <span style="color:${roleColor}">${escapeHtml(d.topologyRole)}</span></div>`;
      }
      if (d.agentHealth != null) {
        const healthColor = d.agentHealth > 70 ? 'var(--success, #10B981)' : 'var(--error, #EF4444)';
        html += `<div><strong>Health:</strong> <span style="color:${healthColor}">${d.agentHealth}%</span></div>`;
      }
      if (d.agentStatus) html += `<div><strong>Status:</strong> ${escapeHtml(d.agentStatus)}</div>`;
      break;
    }
  }

  html += '</div>';

  // Timestamps
  const tsHtml = [];
  if (d.timestamp) {
    const date = new Date(d.timestamp);
    if (!isNaN(date.getTime())) tsHtml.push(`<div>Latest: ${date.toLocaleString()}</div>`);
  }
  if (d.createdAt && d.createdAt !== d.timestamp) {
    const date = new Date(d.createdAt);
    if (!isNaN(date.getTime())) tsHtml.push(`<div>Created: ${date.toLocaleString()}</div>`);
  }
  if (d.updatedAt && d.updatedAt !== d.timestamp && d.updatedAt !== d.createdAt) {
    const date = new Date(d.updatedAt);
    if (!isNaN(date.getTime())) tsHtml.push(`<div>Updated: ${date.toLocaleString()}</div>`);
  }
  if (tsHtml.length > 0) {
    html += `<div style="margin-top:8px;color:var(--text-muted,#888);font-size:11px;">${tsHtml.join('')}</div>`;
  }

  // Connection count (computed from force links if available)
  if (links) {
    const connCount = links.filter(l => {
      const srcId = typeof l.source === 'object' ? l.source.id : l.source;
      const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
      return srcId === d.id || tgtId === d.id;
    }).length;
    html += `<div class="detail-connections">Connections: ${connCount}</div>`;
  }

  detailPanel.innerHTML = html;
}

/**
 * Handle node click events with dispatch to Learnings panel
 * Provides visual selection feedback, opens the detail panel,
 * and dispatches to the appropriate Learnings tab based on node type.
 * @param {Event} event - The D3 click event
 * @param {Object} d - The node datum
 */
function handleNodeClick(event, d) {
  // Keep existing debug logging
  console.log('Clicked:', d);

  // Update selected node state (accessible globally for other components)
  window.selectedNodeId = d.id;
  window.selectedNodeData = d;

  // Visual feedback: highlight selected node
  d3.selectAll('.node').classed('selected', false);
  d3.select(event.currentTarget).classed('selected', true);

  // Highlight connected edges
  if (link) {
    link.classed('highlighted', false);
    link.classed('highlighted', l => {
      const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
      const targetId = typeof l.target === 'object' ? l.target.id : l.target;
      return sourceId === d.id || targetId === d.id;
    });
  }

  // Open node detail panel
  showNodeDetail(d);

  // Dispatch to Learnings panel based on node type
  const sourceType = getNodeSourceType(d);

  switch (sourceType) {
    case 'neural_pattern':
      if (typeof openLearningsTab === 'function') {
        openLearningsTab('gantt', { highlightId: d.trajectoryId || null });
      }
      break;

    case 'q_pattern': {
      if (typeof openLearningsTab === 'function') {
        const state = d.state || d.stateValue || '';
        const action = d.action || d.actionValue || '';
        // Try parsing pat_* IDs to extract state/action
        if (!state && !action && d.id && d.id.startsWith('pat_')) {
          const parts = d.id.replace('pat_', '');
          const lastUnderscore = parts.lastIndexOf('_');
          if (lastUnderscore > 0) {
            openLearningsTab('qTable', {
              highlightState: parts.substring(0, lastUnderscore),
              highlightAction: parts.substring(lastUnderscore + 1)
            });
          } else {
            openLearningsTab('qTable', { highlightState: parts, highlightAction: null });
          }
        } else {
          openLearningsTab('qTable', {
            highlightState: state || null,
            highlightAction: action || null
          });
        }
      }
      break;
    }

    case 'trajectory':
      if (typeof openLearningsTab === 'function') {
        openLearningsTab('gantt', { highlightId: d.id });
      }
      break;

    case 'state':
      // State click -> open qTable tab, highlight that state's row
      if (typeof openLearningsTab === 'function') {
        openLearningsTab('qTable', {
          highlightState: d.stateValue || d.id || null,
          highlightAction: null
        });
      }
      break;

    case 'action':
      // Action click -> open qTable tab, highlight that action's column
      if (typeof openLearningsTab === 'function') {
        openLearningsTab('qTable', {
          highlightState: null,
          highlightAction: d.actionValue || d.id || null
        });
      }
      break;

    case 'memory':
    default:
      // For memory nodes (foundation, adr, design_*, neural_*, etc.),
      // just show the detail panel -- no auto-open of Learnings tab
      break;
  }
}

/**
 * Rebuild graph with updated cluster separation settings
 * This controls which edge types participate in force simulation (clustering)
 * while keeping all edges visible for rendering
 */
function rebuildGraphWithClusterSettings() {
  if (!simulation || !links) return;

  // Filter links for force simulation based on cluster settings
  const forceLinks = links.filter(d => {
    const type = d.type || 'embedding';
    const group = getEdgeGroup(type);

    // Check if this edge group should participate in clustering forces
    if (group === 'deterministic' && !config.clusterDeterministic) return false;
    if (group === 'semantic' && !config.clusterSemantic) return false;

    // Also check if edge group is enabled
    if (!config.edgeGroups[group].enabled) return false;

    return true;
  });

  console.log(`Cluster settings: det=${config.clusterDeterministic}, sem=${config.clusterSemantic}`);
  console.log(`Force links: ${forceLinks.length} of ${links.length} total`);

  // Update link force with filtered links
  simulation.force('link')
    .links(forceLinks)
    .distance(d => getLinkDistance(d))
    .strength(d => getLinkStrength(d));

  // Compute blended repulsion based on active force links
  const deterministicLinks = forceLinks.filter(d => getEdgeGroup(d.type || 'embedding') === 'deterministic');
  const deterministicRatio = forceLinks.length > 0 ? deterministicLinks.length / forceLinks.length : 0.5;

  // If no force links, use default repulsion
  let blendedRepulsion = config.repulsion;
  if (forceLinks.length > 0) {
    blendedRepulsion = config.edgeGroups.deterministic.repulsion * deterministicRatio +
                      config.edgeGroups.semantic.repulsion * (1 - deterministicRatio);
  } else {
    // No clustering forces - use stronger repulsion to spread nodes
    blendedRepulsion = -200;
  }

  simulation.force('charge').strength(blendedRepulsion);

  // Reheat and restart
  simulation.alpha(0.5).restart();
}

/**
 * Check if a node is visible based on all active filters
 * @param {Object} d - The node data
 * @returns {boolean} True if the node should be visible
 */
function isNodeFilterVisible(d) {
  const sourceType = getNodeSourceType(d);

  // Check node type filter
  if (!config.sourceTypeFilters[sourceType]) {
    return false;
  }

  // Check memory type filter (only for memory nodes)
  if (sourceType === 'memory' && d.memory_type) {
    if (config.memoryTypeFilters[d.memory_type] === false) {
      return false;
    }
  }

  // Check pattern category filter (only for neural_pattern nodes)
  if (sourceType === 'neural_pattern' && d.category) {
    if (config.patternCategoryFilters[d.category] === false) {
      return false;
    }
  }

  return true;
}

/**
 * Get node opacity based on filters and highlighting
 * @param {Object} d - The node data
 * @returns {number} The opacity value
 */
function getNodeFilterOpacity(d) {
  if (!isNodeFilterVisible(d)) {
    return 0;
  }

  // If there's an active highlight filter, dim non-matching nodes
  if (config.activeFilter.type && config.activeFilter.value) {
    const { type, value } = config.activeFilter;
    let matches = false;

    switch (type) {
      case 'sourceType':
        matches = getNodeSourceType(d) === value;
        break;
      case 'memoryType':
        matches = d.memory_type === value;
        break;
      case 'patternCategory':
        matches = d.category === value;
        break;
    }

    return matches ? config.nodeOpacity : config.nodeOpacity * 0.15;
  }

  return config.nodeOpacity;
}

/**
 * Update node visibility based on source filters
 * Works with shape-based nodes (groups with child shape elements)
 */
function updateVisibleNodes() {
  if (!node) return;

  // Legacy filters for backward compatibility
  const legacyFilters = {
    metadataDb: document.getElementById('filterMetadataDb')?.checked ?? true,
    intelligenceDb: document.getElementById('filterIntelligenceDb')?.checked ?? true,
    trajectories: document.getElementById('filterTrajectories')?.checked ?? true,
    qPatterns: document.getElementById('filterQPatterns')?.checked ?? true,
    qPatternsIntel: document.getElementById('filterQPatternsIntel')?.checked ?? true
  };

  // Update node shape opacity (works with group-based nodes)
  node.each(function(d) {
    const source = d.source || 'metadataDb';

    // Check legacy filter first
    if (legacyFilters[source] === false) {
      d3.select(this).select('.node-shape').attr('opacity', 0);
      return;
    }

    // Apply new filter logic
    const opacity = getNodeFilterOpacity(d);
    d3.select(this).select('.node-shape').attr('opacity', opacity);
  });

  // Update link visibility based on node visibility
  if (link) {
    link.attr('opacity', d => {
      const sourceNode = d.source;
      const targetNode = d.target;

      // Check legacy filters
      const srcLegacy = legacyFilters[sourceNode.source || 'metadataDb'];
      const tgtLegacy = legacyFilters[targetNode.source || 'metadataDb'];
      if (srcLegacy === false || tgtLegacy === false) {
        return 0;
      }

      // Check new filters
      if (!isNodeFilterVisible(sourceNode) || !isNodeFilterVisible(targetNode)) {
        return 0;
      }

      // Apply dimming for highlighting
      if (config.activeFilter.type && config.activeFilter.value) {
        const srcOpacity = getNodeFilterOpacity(sourceNode);
        const tgtOpacity = getNodeFilterOpacity(targetNode);
        if (srcOpacity < config.nodeOpacity || tgtOpacity < config.nodeOpacity) {
          return config.linkOpacity * 0.1;
        }
      }

      return config.linkOpacity;
    });
  }
}

/**
 * Render the node type distribution counts
 */
function renderSourceTypeDistribution() {
  if (!nodes) return;

  const counts = { memory: 0, neural_pattern: 0, q_pattern: 0, trajectory: 0, file: 0, state: 0, action: 0, agent: 0 };

  nodes.forEach(d => {
    const sourceType = getNodeSourceType(d);
    if (counts[sourceType] !== undefined) {
      counts[sourceType]++;
    }
  });

  // Update count displays
  Object.keys(counts).forEach(source => {
    const countEl = document.getElementById(`count-${source}`);
    if (countEl) {
      countEl.textContent = counts[source];
    }
  });

  // Update stat totals
  const totalEl = document.getElementById('stat-total');
  if (totalEl) totalEl.textContent = nodes.length;

  const edgesEl = document.getElementById('stat-edges');
  if (edgesEl && links) edgesEl.textContent = links.length;
}

/**
 * Render the memory type distribution panel
 */
function renderMemoryTypeDistribution() {
  const container = document.getElementById('memory-type-distribution');
  if (!container || !nodes) return;

  const typeCounts = {};
  const memoryNodes = nodes.filter(d => isMemoryNode(d));

  memoryNodes.forEach(d => {
    const type = d.memory_type || d.namespace?.split('/')[0] || 'unknown';
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  });

  const sorted = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
  const maxCount = sorted.length > 0 ? sorted[0][1] : 1;

  // Initialize filters
  sorted.forEach(([type]) => {
    if (config.memoryTypeFilters[type] === undefined) {
      config.memoryTypeFilters[type] = true;
    }
  });

  container.innerHTML = sorted.map(([type, count]) => {
    const color = memoryTypeColors[type] || '#6B2FB5';
    const isActive = config.memoryTypeFilters[type] !== false;
    const isHighlighted = config.activeFilter.type === 'memoryType' && config.activeFilter.value === type;
    const barWidth = Math.round((count / maxCount) * 100);

    return `
      <div class="distribution-item ${isActive ? '' : 'disabled'} ${isHighlighted ? 'active' : ''}"
           data-filter-type="memoryType" data-filter-value="${type}">
        <div class="distribution-dot" style="background: ${color};"></div>
        <span class="distribution-label">${type.replace(/_/g, ' ')}</span>
        <div class="distribution-bar">
          <div class="distribution-bar-fill" style="width: ${barWidth}%;"></div>
        </div>
        <span class="distribution-count">${count}</span>
      </div>
    `;
  }).join('');

  // Add click handlers
  container.querySelectorAll('.distribution-item').forEach(el => {
    el.addEventListener('click', handleDistributionClick);
  });
}

/**
 * Render the neural pattern category distribution panel
 */
function renderPatternCategoryDistribution() {
  const container = document.getElementById('pattern-category-distribution');
  if (!container || !nodes) return;

  const categoryCounts = {};
  const patternNodes = nodes.filter(d => isNeuralPatternNode(d));

  patternNodes.forEach(d => {
    const category = d.category || d.namespace?.split('/')[1] || 'general';
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;
  });

  const sorted = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]);
  const maxCount = sorted.length > 0 ? sorted[0][1] : 1;

  // Initialize filters
  sorted.forEach(([category]) => {
    if (config.patternCategoryFilters[category] === undefined) {
      config.patternCategoryFilters[category] = true;
    }
  });

  container.innerHTML = sorted.map(([category, count]) => {
    const color = categoryColors[category] || '#8B4FD9';
    const isActive = config.patternCategoryFilters[category] !== false;
    const isHighlighted = config.activeFilter.type === 'patternCategory' && config.activeFilter.value === category;
    const barWidth = Math.round((count / maxCount) * 100);

    return `
      <div class="distribution-item ${isActive ? '' : 'disabled'} ${isHighlighted ? 'active' : ''}"
           data-filter-type="patternCategory" data-filter-value="${category}">
        <div class="distribution-dot" style="background: ${color};"></div>
        <span class="distribution-label">${category}</span>
        <div class="distribution-bar">
          <div class="distribution-bar-fill" style="width: ${barWidth}%;"></div>
        </div>
        <span class="distribution-count">${count}</span>
      </div>
    `;
  }).join('');

  // Add click handlers
  container.querySelectorAll('.distribution-item').forEach(el => {
    el.addEventListener('click', handleDistributionClick);
  });
}

// =============================================================================
// DYNAMIC DROPDOWN POPULATION
// Fetches metadata from the server and populates settings panel dropdowns
// =============================================================================

/**
 * Cached metadata from /api/meta/all
 */
let cachedMetadata = null;

/**
 * Fetch metadata from server and populate all settings dropdowns dynamically
 * @param {boolean} forceRefresh - Force refresh from server
 */
async function populateDynamicDropdowns(forceRefresh = false) {
  try {
    if (cachedMetadata && !forceRefresh) {
      applyMetadataToDropdowns(cachedMetadata);
      return;
    }

    const response = await fetch('/api/meta/all');
    if (!response.ok) {
      console.warn('Failed to fetch metadata for dropdowns:', response.status);
      return;
    }

    cachedMetadata = await response.json();
    applyMetadataToDropdowns(cachedMetadata);
    console.log('Dynamic dropdowns populated with', Object.keys(cachedMetadata).length, 'categories');
  } catch (err) {
    console.error('Error populating dynamic dropdowns:', err);
  }
}

/**
 * Apply metadata to all settings panel dropdowns
 * @param {Object} meta - Metadata object from /api/meta/all
 */
function applyMetadataToDropdowns(meta) {
  // Populate radialTarget dropdown
  populateRadialTargetDropdown(meta);

  // Populate searchSource dropdown
  populateSearchSourceDropdown(meta);

  // Update edge type visibility checkboxes (if they exist)
  updateEdgeTypeCheckboxes(meta.edgeTypes || []);
}

/**
 * Populate the radialTarget dropdown with dynamic options from database
 * @param {Object} meta - Metadata object
 */
function populateRadialTargetDropdown(meta) {
  const select = document.getElementById('radialTarget');
  if (!select) return;

  // Preserve current selection
  const currentValue = select.value;

  // Clear and rebuild
  select.innerHTML = '';

  // Add "None" option
  const noneOpt = document.createElement('option');
  noneOpt.value = 'none';
  noneOpt.textContent = 'None (disabled)';
  select.appendChild(noneOpt);

  // Node Types optgroup
  if (meta.nodeTypes && meta.nodeTypes.length > 0) {
    const nodeTypeGroup = document.createElement('optgroup');
    nodeTypeGroup.label = 'Node Type';
    meta.nodeTypes.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.value;
      opt.textContent = `${t.label} (${t.count})`;
      nodeTypeGroup.appendChild(opt);
    });
    select.appendChild(nodeTypeGroup);
  }

  // Memory Types optgroup
  if (meta.memoryTypes && meta.memoryTypes.length > 0) {
    const memTypeGroup = document.createElement('optgroup');
    memTypeGroup.label = 'Memory Type';
    meta.memoryTypes.forEach(t => {
      const opt = document.createElement('option');
      opt.value = `memtype:${t.value}`;
      opt.textContent = `${t.label} (${t.count})`;
      memTypeGroup.appendChild(opt);
    });
    select.appendChild(memTypeGroup);
  }

  // Domains optgroup
  if (meta.memoryDomains && meta.memoryDomains.length > 0) {
    const domainGroup = document.createElement('optgroup');
    domainGroup.label = 'Domain';
    meta.memoryDomains.forEach(d => {
      const opt = document.createElement('option');
      opt.value = `domain:${d.value}`;
      opt.textContent = `${d.label} (${d.count})`;
      domainGroup.appendChild(opt);
    });
    select.appendChild(domainGroup);
  }

  // Neural Categories optgroup
  if (meta.neuralCategories && meta.neuralCategories.length > 0) {
    const catGroup = document.createElement('optgroup');
    catGroup.label = 'Category (Neural)';
    meta.neuralCategories.forEach(c => {
      const opt = document.createElement('option');
      opt.value = `category:${c.value}`;
      opt.textContent = `${c.label} (${c.count})`;
      catGroup.appendChild(opt);
    });
    select.appendChild(catGroup);
  }

  // Agents optgroup (if we have agents)
  if (meta.agents && meta.agents.length > 0) {
    const agentGroup = document.createElement('optgroup');
    agentGroup.label = 'Agent';
    meta.agents.forEach(a => {
      const opt = document.createElement('option');
      opt.value = `agent:${a.value}`;
      opt.textContent = a.label;
      agentGroup.appendChild(opt);
    });
    select.appendChild(agentGroup);
  }

  // Quality filters (static)
  const qualityGroup = document.createElement('optgroup');
  qualityGroup.label = 'Quality';
  const qualityOptions = [
    { value: 'quality:high_confidence', label: 'High Confidence (>0.9)' },
    { value: 'quality:low_confidence', label: 'Low Confidence (<0.7)' },
    { value: 'quality:high_qvalue', label: 'High Q-Value (>0.7)' },
    { value: 'quality:low_qvalue', label: 'Low Q-Value (<0.4)' },
    { value: 'quality:successful', label: 'Successful Trajectories' },
    { value: 'quality:failed', label: 'Failed Trajectories' }
  ];
  qualityOptions.forEach(q => {
    const opt = document.createElement('option');
    opt.value = q.value;
    opt.textContent = q.label;
    qualityGroup.appendChild(opt);
  });
  select.appendChild(qualityGroup);

  // Connectivity filters (static)
  const connGroup = document.createElement('optgroup');
  connGroup.label = 'Connectivity';
  const connOptions = [
    { value: 'high_connectivity', label: 'High Connectivity (>10)' },
    { value: 'low_connectivity', label: 'Low Connectivity (<3)' },
    { value: 'isolated', label: 'Isolated (0 edges)' }
  ];
  connOptions.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.value;
    opt.textContent = c.label;
    connGroup.appendChild(opt);
  });
  select.appendChild(connGroup);

  // Embedding filters (static)
  const embGroup = document.createElement('optgroup');
  embGroup.label = 'Embedding';
  const embOptions = [
    { value: 'has_embedding', label: 'Has Embedding' },
    { value: 'no_embedding', label: 'No Embedding' }
  ];
  embOptions.forEach(e => {
    const opt = document.createElement('option');
    opt.value = e.value;
    opt.textContent = e.label;
    embGroup.appendChild(opt);
  });
  select.appendChild(embGroup);

  // Temporal filters (static)
  const tempGroup = document.createElement('optgroup');
  tempGroup.label = 'Temporal';
  const tempOptions = [
    { value: 'temporal:recent', label: 'Recent (last 24h)' },
    { value: 'temporal:week', label: 'This Week' },
    { value: 'temporal:older', label: 'Older (>7 days)' }
  ];
  tempOptions.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.value;
    opt.textContent = t.label;
    tempGroup.appendChild(opt);
  });
  select.appendChild(tempGroup);

  // Restore previous selection if it still exists
  if (currentValue && select.querySelector(`option[value="${currentValue}"]`)) {
    select.value = currentValue;
  } else {
    select.value = 'none';
  }
}

/**
 * Populate the searchSource dropdown with dynamic node types
 * @param {Object} meta - Metadata object
 */
function populateSearchSourceDropdown(meta) {
  const select = document.getElementById('searchSource');
  if (!select) return;

  const currentValue = select.value;
  select.innerHTML = '';

  // Add "All Sources" option
  const allOpt = document.createElement('option');
  allOpt.value = 'all';
  allOpt.textContent = 'All Sources';
  allOpt.selected = currentValue === 'all' || !currentValue;
  select.appendChild(allOpt);

  // Add dynamic node types
  if (meta.nodeTypes && meta.nodeTypes.length > 0) {
    meta.nodeTypes.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.value;
      opt.textContent = `${t.label} (${t.count})`;
      opt.selected = currentValue === t.value;
      select.appendChild(opt);
    });
  }
}

/**
 * Update edge type visibility checkboxes based on actual edge types in data
 * @param {Array} edgeTypes - Array of edge type objects with value, label, count
 */
function updateEdgeTypeCheckboxes(edgeTypes) {
  // Update the edge type checkboxes in the settings panel Edge Settings section
  // Use the existing container IDs: detEdgeSubtypes and semEdgeSubtypes
  const detContainer = document.getElementById('detEdgeSubtypes');
  const semContainer = document.getElementById('semEdgeSubtypes');

  if (!detContainer && !semContainer) return;

  // Separate edge types by group
  const detTypes = edgeTypes.filter(e => EDGE_GROUPS.deterministic.types.includes(e.value));
  const semTypes = edgeTypes.filter(e => EDGE_GROUPS.semantic.types.includes(e.value) ||
                                         !EDGE_GROUPS.deterministic.types.includes(e.value));

  // Helper to create checkbox HTML with color coding
  const createCheckboxHtml = (types, groupColor) => {
    if (types.length === 0) return '';
    return `
      <div style="font-size:9px;color:var(--text-muted);margin-bottom:4px;">Edge sub-types:</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;">
        ${types.map(t => {
          const checked = config.visibleEdgeTypes[t.value] !== false ? 'checked' : '';
          return `
            <label class="checkbox-label" style="font-size:9px;padding:2px 6px;background:rgba(${groupColor},0.1);border-radius:3px;white-space:nowrap;">
              <input type="checkbox" class="edge-type-checkbox" data-edge-type="${t.value}" ${checked} style="width:10px;height:10px;">
              <span>${t.label.length > 15 ? t.label.substring(0,12) + '...' : t.label}</span>
              <span style="color:var(--text-muted);">${t.count}</span>
            </label>
          `;
        }).join('')}
      </div>
    `;
  };

  if (detContainer && detTypes.length > 0) {
    detContainer.style.display = 'block';
    detContainer.innerHTML = createCheckboxHtml(detTypes, '16,185,129'); // Emerald RGB
    // Re-attach handlers
    detContainer.querySelectorAll('.edge-type-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        config.visibleEdgeTypes[e.target.dataset.edgeType] = e.target.checked;
        rebuildGraph();
      });
    });
  } else if (detContainer) {
    detContainer.style.display = 'none';
  }

  if (semContainer && semTypes.length > 0) {
    semContainer.style.display = 'block';
    semContainer.innerHTML = createCheckboxHtml(semTypes, '139,79,217'); // Purple RGB
    // Re-attach handlers
    semContainer.querySelectorAll('.edge-type-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        config.visibleEdgeTypes[e.target.dataset.edgeType] = e.target.checked;
        rebuildGraph();
      });
    });
  } else if (semContainer) {
    semContainer.style.display = 'none';
  }
}

/**
 * Handle click on distribution items for highlighting
 */
function handleDistributionClick(event) {
  const el = event.currentTarget;
  const filterType = el.dataset.filterType;
  const filterValue = el.dataset.filterValue;

  // Toggle highlight
  if (config.activeFilter.type === filterType && config.activeFilter.value === filterValue) {
    config.activeFilter = { type: null, value: null };
    el.classList.remove('active');
  } else {
    config.activeFilter = { type: filterType, value: filterValue };
    // Update UI
    el.parentElement.querySelectorAll('.distribution-item').forEach(item => {
      item.classList.remove('active');
    });
    el.classList.add('active');
  }

  updateVisibleNodes();
}

/**
 * Setup node type filter click handlers
 */
function setupSourceTypeFilters() {
  const container = document.getElementById('source-filters');
  if (!container) return;

  container.querySelectorAll('.source-filter-item').forEach(el => {
    el.addEventListener('click', () => {
      const source = el.dataset.source;

      // Toggle filter
      config.sourceTypeFilters[source] = !config.sourceTypeFilters[source];
      el.classList.toggle('active', config.sourceTypeFilters[source]);
      el.classList.toggle('disabled', !config.sourceTypeFilters[source]);

      updateVisibleNodes();
    });
  });
}

/**
 * Render all distribution panels
 */
function renderDistributions() {
  renderSourceTypeDistribution();
  renderMemoryTypeDistribution();
  renderPatternCategoryDistribution();
}

/**
 * Apply timeline filter to nodes and links
 * Works with shape-based nodes (groups with child shape elements)
 */
function applyTimelineFilter() {
  if (!node || !link || !timelineData) return;

  if (config.timelineMode === 'video') {
    // Video playback mode: show entries up to cutoff time
    const range = timelineData.maxTimestamp - timelineData.minTimestamp;
    const cutoffTs = timelineData.minTimestamp + (range * config.timelinePosition / 1000);

    const visibleCount = nodes.filter(n => !n.timestamp || n.timestamp <= cutoffTs).length;

    // Update visibility - nodes fade in as time passes (works with shape-based nodes)
    // Nodes without timestamps are always visible (no fake Date.now())
    node.each(function(d) {
      let opacity;
      if (!d.timestamp) {
        opacity = config.nodeOpacity * 0.5; // No timestamp = always visible, dimmed
      } else if (d.timestamp <= cutoffTs) {
        // Fade based on how recent within the view
        const age = cutoffTs - d.timestamp;
        const fadeWindow = range * 0.1; // 10% of range for fade effect
        opacity = age < fadeWindow ? config.nodeOpacity : config.nodeOpacity * 0.7;
      } else {
        opacity = 0; // Not yet visible
      }
      d3.select(this).select('.node-shape').attr('opacity', opacity);
    });

    link.attr('opacity', d => {
      // After simulation starts, d.source/d.target are node objects
      const srcNode = typeof d.source === 'object' ? d.source : nodes[d.source];
      const tgtNode = typeof d.target === 'object' ? d.target : nodes[d.target];
      const srcTs = srcNode?.timestamp;
      const tgtTs = tgtNode?.timestamp;
      // Nodes without timestamps are always considered visible
      const srcVisible = !srcTs || srcTs <= cutoffTs;
      const tgtVisible = !tgtTs || tgtTs <= cutoffTs;
      return (srcVisible && tgtVisible) ? config.linkOpacity : 0;
    });

    // Update current date display
    document.getElementById('currentDate').textContent = formatDate(cutoffTs);

    // Update filter info
    document.getElementById('filterInfo').innerHTML =
      `Showing <strong>${visibleCount}</strong> of ${nodes.length} entries up to ${formatDate(cutoffTs)}`;

    // Update scrubber highlight on timeline chart
    updateTimelineHighlight(cutoffTs);
  } else {
    // Range filter mode: show entries between start and end positions
    const range = timelineData.maxTimestamp - timelineData.minTimestamp;
    const startTs = timelineData.minTimestamp + (range * config.rangeStart / 1000);
    const endTs = timelineData.minTimestamp + (range * config.rangeEnd / 1000);

    const visibleCount = nodes.filter(n => !n.timestamp || (n.timestamp >= startTs && n.timestamp <= endTs)).length;

    // Update visibility - simple show/hide based on range (works with shape-based nodes)
    // Nodes without timestamps are always visible (no fake Date.now())
    node.each(function(d) {
      if (!d.timestamp) {
        d3.select(this).select('.node-shape').attr('opacity', config.nodeOpacity * 0.5);
        return;
      }
      const visible = d.timestamp >= startTs && d.timestamp <= endTs;
      const opacity = visible ? config.nodeOpacity : 0;
      d3.select(this).select('.node-shape').attr('opacity', opacity);
    });

    link.attr('opacity', d => {
      // After simulation starts, d.source/d.target are node objects
      const srcNode = typeof d.source === 'object' ? d.source : nodes[d.source];
      const tgtNode = typeof d.target === 'object' ? d.target : nodes[d.target];
      const srcTs = srcNode?.timestamp;
      const tgtTs = tgtNode?.timestamp;
      // Nodes without timestamps are always considered visible
      const srcVisible = !srcTs || (srcTs >= startTs && srcTs <= endTs);
      const tgtVisible = !tgtTs || (tgtTs >= startTs && tgtTs <= endTs);
      return (srcVisible && tgtVisible) ? config.linkOpacity : 0;
    });

    // Update date displays
    document.getElementById('rangeStartDate').textContent = formatDate(startTs);
    document.getElementById('rangeEndDate').textContent = formatDate(endTs);

    // Update filter info
    document.getElementById('filterInfo').innerHTML =
      `Showing <strong>${visibleCount}</strong> of ${nodes.length} entries from ${formatDate(startTs)} to ${formatDate(endTs)}`;

    // Update range highlight on timeline chart
    updateTimelineRangeHighlight(startTs, endTs);
  }
}

function updateTimelineHighlight(cutoffTs) {
  const chart = document.getElementById('timelineChart');
  const bars = chart.querySelectorAll('.day-bar');
  bars.forEach(bar => {
    const day = bar.dataset.day;
    const dayTs = new Date(day).getTime();
    bar.style.opacity = dayTs <= cutoffTs ? '1' : '0.2';
  });
}

function updateTimelineRangeHighlight(startTs, endTs) {
  const chart = document.getElementById('timelineChart');
  const bars = chart.querySelectorAll('.day-bar');
  bars.forEach(bar => {
    const day = bar.dataset.day;
    const dayTs = new Date(day).getTime();
    bar.style.opacity = (dayTs >= startTs && dayTs <= endTs) ? '1' : '0.2';
  });
}

function renderLegend() {
  const legend = document.getElementById('legend');
  let items = [];

  // SONA Trajectory View mode legends (take priority when active)
  if (config.sonaTrajectoryMode !== 'off') {
    switch (config.sonaTrajectoryMode) {
      case 'timeline':
        items = [
          { label: '✓ Success', color: '#4CAF50', filter: d => isTrajectoryNode(d) && d.success },
          { label: '✗ Failed', color: '#f44336', filter: d => isTrajectoryNode(d) && !d.success },
          { label: 'Not yet visible', color: '#222', filter: null },
          { label: 'Other nodes', color: '#333', filter: d => !isTrajectoryNode(d) }
        ];
        break;
      case 'microLora':
        items = [
          { label: 'High quality', color: d3.interpolateBlues(1), filter: null },
          { label: '→', color: d3.interpolateBlues(0.6), filter: null },
          { label: 'Low quality', color: d3.interpolateBlues(0.3), filter: null },
          { label: 'Not yet visible', color: '#222', filter: null },
          { label: 'Other nodes', color: '#333', filter: d => !isTrajectoryNode(d) }
        ];
        break;
      case 'baseLora':
        items = [
          { label: 'Many steps', color: d3.interpolateOranges(1), filter: null },
          { label: '→', color: d3.interpolateOranges(0.6), filter: null },
          { label: 'Few steps', color: d3.interpolateOranges(0.3), filter: null },
          { label: 'Not yet visible', color: '#222', filter: null },
          { label: 'Other nodes', color: '#333', filter: d => !isTrajectoryNode(d) }
        ];
        break;
      case 'ewc':
        items = [
          { label: '✓ Success', color: '#9c27b0', filter: d => isTrajectoryNode(d) && d.success },
          { label: '✗ Failed', color: '#e91e63', filter: d => isTrajectoryNode(d) && !d.success },
          { label: 'Not yet visible', color: '#222', filter: null },
          { label: 'Other nodes', color: '#333', filter: d => !isTrajectoryNode(d) }
        ];
        break;
    }

    legend.innerHTML = items.map((item, i) => `
      <div class="legend-item" data-idx="${i}">
        <div class="legend-dot" style="background:${item.color}"></div>${item.label}
      </div>
    `).join('');
    return;
  }

  // Q-Pattern overlay mode legends (take priority when active)
  if (config.qPatternMode !== 'off') {
    // Already handled below in standard legend
  }

  switch (config.nodeColorMode) {
    case 'sourceType': {
      items = Object.entries(nodeTypeConfig || {})
        .filter(([, cfg]) => cfg.active !== false)
        .sort((a, b) => (a[1].order ?? 99) - (b[1].order ?? 99))
        .map(([type, cfg]) => ({
          label: cfg.label || type,
          color: getSourceColor(type),
          shape: cfg.shape2d,
          svgIcon: cfg.svgIcon,
          filter: d => getNodeSourceType(d) === type
        }));
      break;
    }
    case 'namespace': {
      // Count all namespaces from nodes (not just meta)
      const nsCounts = {};
      if (nodes) nodes.forEach(n => {
        const ns = n.namespace || 'unknown';
        const base = ns.split('/')[0].split('_')[0]; // Handle both "design/brand" and "design_brand"
        nsCounts[base] = (nsCounts[base] || 0) + 1;
      });
      // Sort by count and take top 12
      const topNs = Object.entries(nsCounts).sort((a, b) => b[1] - a[1]).slice(0, 12);
      items = topNs.map(([base, count]) => ({
        label: `${base} (${count})`,
        color: getNamespaceColor(base),
        filter: d => {
          const ns = d.namespace || '';
          const nodeBase = ns.split('/')[0].split('_')[0];
          return nodeBase === base;
        }
      }));
      break;
    }
    case 'contentType':
      items = [
        { label: 'JSON', color: contentTypeColors.json, filter: d => d.contentType === 'json' },
        { label: 'YAML', color: contentTypeColors.yaml, filter: d => d.contentType === 'yaml' },
        { label: 'Plain', color: contentTypeColors.plain, filter: d => d.contentType === 'plain' }
      ];
      break;
    case 'nsDepth':
      items = [
        { label: 'Depth 1', color: depthColors[0], filter: d => d.nsDepth === 1 },
        { label: 'Depth 2', color: depthColors[1], filter: d => d.nsDepth === 2 },
        { label: 'Depth 3+', color: depthColors[2], filter: d => d.nsDepth >= 3 }
      ];
      break;
    case 'keyPrefix': {
      // Get top prefixes from data
      const prefixCounts = {};
      if (nodes) nodes.forEach(n => { prefixCounts[n.keyPrefix] = (prefixCounts[n.keyPrefix] || 0) + 1; });
      const topPrefixes = Object.entries(prefixCounts).sort((a,b) => b[1] - a[1]).slice(0, 10);
      items = topPrefixes.map(([prefix]) => ({
        label: prefix,
        color: getPrefixColor(prefix),
        filter: d => d.keyPrefix === prefix
      }));
      break;
    }
    case 'time':
      items = [
        { label: 'Oldest', color: d3.interpolatePlasma(0), filter: null },
        { label: '→', color: d3.interpolatePlasma(0.5), filter: null },
        { label: 'Newest', color: d3.interpolatePlasma(1), filter: null }
      ];
      break;
    case 'rate':
      items = [
        { label: 'Low rate', color: d3.interpolateInferno(0.1), filter: null },
        { label: '→', color: d3.interpolateInferno(0.5), filter: null },
        { label: 'High rate', color: d3.interpolateInferno(1), filter: null }
      ];
      break;
    case 'connectivity':
      items = [
        { label: 'Few links', color: d3.interpolateViridis(0.1), filter: null },
        { label: '→', color: d3.interpolateViridis(0.5), filter: null },
        { label: 'Many links', color: d3.interpolateViridis(1), filter: null }
      ];
      break;
    case 'charLength':
    case 'wordCount':
      items = [
        { label: 'Short', color: d3.interpolateYlOrRd(0.1), filter: null },
        { label: '→', color: d3.interpolateYlOrRd(0.5), filter: null },
        { label: 'Long', color: d3.interpolateYlOrRd(1), filter: null }
      ];
      break;
    case 'single':
      items = [{ label: 'All nodes', color: config.nodeColor, filter: null }];
      break;
    case 'dbSource':
      items = [
        { label: '📦 metadata.db', color: config.metadataDbColor, filter: d => d.source === 'metadataDb' || !d.source },
        { label: '🧠 intelligence.db', color: config.intelligenceDbColor, filter: d => d.source === 'intelligenceDb' },
        { label: '🛤️ trajectories', color: config.trajectoriesColor, filter: d => d.source === 'trajectories' },
        { label: '🎯 Q-patterns', color: config.qPatternsColor, filter: d => d.source === 'qPatterns' },
        { label: '🎲 Q-intel', color: config.qPatternsIntelColor, filter: d => d.source === 'qPatternsIntel' }
      ];
      break;
    case 'namespaceFull': {
      // Show top 10 unique full namespaces
      const nsCounts = {};
      if (nodes) nodes.forEach(n => { nsCounts[n.namespace] = (nsCounts[n.namespace] || 0) + 1; });
      const topNs = Object.entries(nsCounts).sort((a,b) => b[1] - a[1]).slice(0, 10);
      items = topNs.map(([ns]) => ({
        label: ns.length > 20 ? '...' + ns.slice(-18) : ns,
        color: getNamespaceColor(ns),
        filter: d => d.namespace === ns
      }));
      break;
    }
    case 'recency':
      items = [
        { label: 'Older', color: d3.interpolatePlasma(0.2), filter: null },
        { label: '→', color: d3.interpolatePlasma(0.6), filter: null },
        { label: 'Newer', color: d3.interpolatePlasma(1), filter: null }
      ];
      break;
    case 'hasEmbedding':
      items = [
        { label: '✓ Has embedding', color: '#4CAF50', filter: d => d.hasEmbedding },
        { label: '✗ No embedding', color: '#ff5722', filter: d => !d.hasEmbedding }
      ];
      break;
    case 'crossLinkType':
      items = [
        { label: 'Has cross-links', color: '#e91e63', filter: d => d.hasCrossLinks },
        { label: 'No cross-links', color: '#666', filter: d => !d.hasCrossLinks }
      ];
      break;
    case 'qValue':
      items = [
        { label: 'Low Q', color: d3.interpolateRdYlGn(0), filter: null },
        { label: '→', color: d3.interpolateRdYlGn(0.5), filter: null },
        { label: 'High Q', color: d3.interpolateRdYlGn(1), filter: null },
        { label: 'N/A', color: '#333', filter: d => !isQPatternNode(d) }
      ];
      break;
    case 'visits':
      items = [
        { label: 'Few visits', color: d3.interpolatePurples(0.2), filter: null },
        { label: '→', color: d3.interpolatePurples(0.6), filter: null },
        { label: 'Many visits', color: d3.interpolatePurples(1), filter: null },
        { label: 'N/A', color: '#333', filter: d => !isQPatternNode(d) }
      ];
      break;
    case 'state': {
      // Get top states from Q-patterns
      const stateCounts = {};
      if (nodes) nodes.filter(isQPatternNode).forEach(n => {
        const s = n.state || 'unknown';
        stateCounts[s] = (stateCounts[s] || 0) + 1;
      });
      const topStates = Object.entries(stateCounts).sort((a,b) => b[1] - a[1]).slice(0, 6);
      items = topStates.map(([state], i) => ({
        label: state.length > 15 ? state.slice(0, 13) + '...' : state,
        color: d3.interpolateRainbow(i / Math.max(topStates.length, 1)),
        filter: d => isQPatternNode(d) && d.state === state
      }));
      break;
    }
    case 'action': {
      // Get top actions from Q-patterns
      const actionCounts = {};
      if (nodes) nodes.filter(isQPatternNode).forEach(n => {
        const a = n.action || 'unknown';
        actionCounts[a] = (actionCounts[a] || 0) + 1;
      });
      const topActions = Object.entries(actionCounts).sort((a,b) => b[1] - a[1]).slice(0, 6);
      items = topActions.map(([action], i) => ({
        label: action.length > 15 ? action.slice(0, 13) + '...' : action,
        color: d3.interpolateSinebow(i / Math.max(topActions.length, 1)),
        filter: d => isQPatternNode(d) && d.action === action
      }));
      break;
    }
    case 'success':
      items = [
        { label: '✓ Success', color: '#4CAF50', filter: d => d.success === true },
        { label: '✗ Failed', color: '#f44336', filter: d => d.success === false },
        { label: 'N/A', color: '#333', filter: d => d.success === undefined }
      ];
      break;
    case 'quality':
      items = [
        { label: 'Low quality', color: d3.interpolateRdYlGn(0), filter: null },
        { label: '→', color: d3.interpolateRdYlGn(0.5), filter: null },
        { label: 'High quality', color: d3.interpolateRdYlGn(1), filter: null },
        { label: 'N/A', color: '#333', filter: d => typeof d.quality !== 'number' }
      ];
      break;
    case 'agent': {
      // Get unique agents from trajectories
      const agentCounts = {};
      if (nodes) nodes.forEach(n => {
        if (n.agent) agentCounts[n.agent] = (agentCounts[n.agent] || 0) + 1;
      });
      const topAgents = Object.entries(agentCounts).sort((a,b) => b[1] - a[1]).slice(0, 8);
      items = topAgents.map(([agent]) => {
        const hash = agent.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        return {
          label: agent.length > 15 ? agent.slice(0, 13) + '...' : agent,
          color: d3.interpolateSet1(hash % 9 / 9),
          filter: d => d.agent === agent
        };
      });
      break;
    }
    case 'nodeSource': {
      // Legend for all node types with canonical shapes (from SSOT nodeTypeConfig)
      items = Object.entries(nodeTypeConfig || {})
        .filter(([, cfg]) => cfg.active !== false)
        .sort((a, b) => (a[1].order ?? 99) - (b[1].order ?? 99))
        .map(([type, cfg]) => ({
          label: cfg.label || type,
          color: getSourceColor(type),
          shape: cfg.shape2d,
          svgIcon: cfg.svgIcon,
          filter: d => getNodeSourceType(d) === type
        }));
      break;
    }
    case 'memoryType': {
      // Legend for memory types
      const memTypeCounts = {};
      if (nodes) nodes.filter(isMemoryNode).forEach(n => {
        const mt = n.memory_type || n.memoryType || 'unknown';
        memTypeCounts[mt] = (memTypeCounts[mt] || 0) + 1;
      });
      const topMemTypes = Object.entries(memTypeCounts).sort((a,b) => b[1] - a[1]).slice(0, 8);
      items = topMemTypes.map(([memType]) => ({
        label: memType.replace(/_/g, ' '),
        color: memoryTypeColors[memType] || getSourceColor('memory'),
        filter: d => isMemoryNode(d) && (d.memory_type === memType || d.memoryType === memType)
      }));
      if (items.length === 0) {
        items = [{ label: 'No memory nodes', color: '#333', filter: null }];
      }
      break;
    }
    case 'category': {
      // Legend for neural pattern categories
      const catCounts = {};
      if (nodes) nodes.filter(isNeuralPatternNode).forEach(n => {
        const cat = n.category || n.namespace || 'unknown';
        catCounts[cat] = (catCounts[cat] || 0) + 1;
      });
      const topCats = Object.entries(catCounts).sort((a,b) => b[1] - a[1]).slice(0, 8);
      items = topCats.map(([cat]) => ({
        label: cat,
        color: categoryColors[cat] || getSourceColor('neural_pattern'),
        filter: d => isNeuralPatternNode(d) && (d.category === cat || d.namespace === cat)
      }));
      if (items.length === 0) {
        items = [{ label: 'No neural patterns', color: '#333', filter: null }];
      }
      break;
    }
    case 'qValueGradient':
      items = [
        { label: 'Low Q-Value', color: d3.interpolatePurples(0.3), filter: null },
        { label: '→', color: d3.interpolatePurples(0.5), filter: null },
        { label: 'High Q-Value', color: d3.interpolatePurples(1), filter: null },
        { label: 'N/A', color: '#333', filter: d => !isQPatternNode(d) }
      ];
      break;
    case 'successColor': {
      const trajCfg = (nodeTypeConfig || {}).trajectory;
      const successColor = trajCfg?.variants?.trajectory_success?.color || '#22C55E';
      const failedColor = trajCfg?.variants?.trajectory_failed?.color || '#EF4444';
      const trajShape = trajCfg?.shape2d || 'pentagon';
      items = [
        { label: 'Success', color: successColor, shape: trajShape, filter: d => isTrajectoryNode(d) && d.success },
        { label: 'Failed', color: failedColor, shape: trajShape, filter: d => isTrajectoryNode(d) && !d.success },
        { label: 'N/A', color: '#333', filter: d => !isTrajectoryNode(d) }
      ];
      break;
    }
    case 'confidence':
      items = [
        { label: 'Low Confidence', color: d3.interpolatePurples(0.3), filter: null },
        { label: '→', color: d3.interpolatePurples(0.5), filter: null },
        { label: 'High Confidence', color: d3.interpolatePurples(1), filter: null },
        { label: 'N/A', color: '#333', filter: d => !isNeuralPatternNode(d) }
      ];
      break;
    default:
      break;
  }

  legend.innerHTML = items.map((item, i) => {
    // Generate shape indicator SVG based on item.shape or item.svgIcon (SSOT)
    let shapeHtml;
    if (item.svgIcon) {
      // Use server-provided SVG icon from nodeTypeConfig, applying item color
      const coloredIcon = item.svgIcon
        .replace(/fill="[^"]*"/g, '')
        .replace(/\/>/, ` fill="${item.color}" stroke="white" stroke-width="0.5"/>`);
      shapeHtml = `<svg width="12" height="12" viewBox="0 0 14 14" style="margin-right:6px;">${coloredIcon}</svg>`;
    } else {
      switch (item.shape) {
        case 'square':
          shapeHtml = `<svg width="12" height="12" viewBox="0 0 12 12" style="margin-right:6px;"><rect x="1" y="1" width="10" height="10" fill="${item.color}" stroke="white" stroke-width="0.5"/></svg>`;
          break;
        case 'diamond':
          shapeHtml = `<svg width="12" height="12" viewBox="0 0 12 12" style="margin-right:6px;"><polygon points="6,1 11,6 6,11 1,6" fill="${item.color}" stroke="white" stroke-width="0.5"/></svg>`;
          break;
        case 'triangle':
          shapeHtml = `<svg width="12" height="12" viewBox="0 0 12 12" style="margin-right:6px;"><polygon points="6,1 11,11 1,11" fill="${item.color}" stroke="white" stroke-width="0.5"/></svg>`;
          break;
        case 'inverted_triangle':
          shapeHtml = `<svg width="12" height="12" viewBox="0 0 12 12" style="margin-right:6px;"><polygon points="1,1 11,1 6,11" fill="${item.color}" stroke="white" stroke-width="0.5"/></svg>`;
          break;
        case 'pentagon':
          shapeHtml = `<svg width="12" height="12" viewBox="0 0 12 12" style="margin-right:6px;"><polygon points="6,1 11,4.5 9.5,10.5 2.5,10.5 1,4.5" fill="${item.color}" stroke="white" stroke-width="0.5"/></svg>`;
          break;
        case 'hexagon':
          shapeHtml = `<svg width="12" height="12" viewBox="0 0 12 12" style="margin-right:6px;"><polygon points="3,1 9,1 12,6 9,11 3,11 0,6" fill="${item.color}" stroke="white" stroke-width="0.5"/></svg>`;
          break;
        case 'star':
          shapeHtml = `<svg width="12" height="12" viewBox="0 0 14 14" style="margin-right:6px;"><polygon points="7,1 8.5,5 13,5.3 9.5,8 10.8,13 7,10.2 3.2,13 4.5,8 1,5.3 5.5,5" fill="${item.color}" stroke="white" stroke-width="0.5"/></svg>`;
          break;
        default:
          shapeHtml = `<div class="legend-dot" style="background:${item.color}"></div>`;
          break;
      }
    }
    return `<div class="legend-item" data-idx="${i}">${shapeHtml}${item.label}</div>`;
  }).join('');

  // Add click handlers for filtering
  legend.querySelectorAll('.legend-item').forEach((el, i) => {
    const item = items[i];
    if (item && item.filter) {
      el.style.cursor = 'pointer';
      el.onclick = () => {
        node.attr('opacity', d => item.filter(d) ? 1 : 0.1);
        link.attr('opacity', d => {
          // d.source/target can be node objects (after simulation) or indices
          const srcNode = typeof d.source === 'object' ? d.source : nodes[d.source];
          const tgtNode = typeof d.target === 'object' ? d.target : nodes[d.target];
          const srcMatch = srcNode && item.filter(srcNode);
          const tgtMatch = tgtNode && item.filter(tgtNode);
          return (srcMatch || tgtMatch) ? config.linkOpacity : 0.02;
        });
      };
    }
  });

  legend.ondblclick = () => {
    node.attr('opacity', config.nodeOpacity);
    link.attr('opacity', config.linkOpacity);
  };
}

function renderNamespaceColorPickers(namespaces) {
  const container = document.getElementById('namespaceColors');
  const uniqueNs = [...new Set(namespaces.map(ns => ns.split('/')[0]))].slice(0, 10);

  container.innerHTML = uniqueNs.map(ns => {
    const color = getNamespaceColor(ns);
    return `<div class="color-row">
      <span>${ns}</span>
      <input type="color" data-ns="${ns}" value="${color}">
    </div>`;
  }).join('');

  container.querySelectorAll('input[type="color"]').forEach(input => {
    input.oninput = (e) => {
      const ns = e.target.dataset.ns;
      Object.keys(config.namespaceColors).forEach(key => {
        if (key.startsWith(ns)) config.namespaceColors[key] = e.target.value;
      });
      config.namespaceColors[ns] = e.target.value;
      updateColors();
      renderLegend();
    };
  });
}

/**
 * Update colors and sizes for all nodes and links
 * Handles multiple node shapes (circle, square, diamond)
 */
function updateColors() {
  if (!node || !link) return;

  // Update node shapes - select the child shape element within each node group
  node.each(function(d) {
    const shape = getNodeShape(d);
    const size = getNodeSize(d, nodes);
    const color = getNodeColor(d, nodes);
    const shapeEl = d3.select(this).select('.node-shape');

    shapeEl.attr('fill', color)
           .attr('opacity', config.nodeOpacity);

    switch (shape) {
      case 'square':
        shapeEl.attr('width', size * 2)
               .attr('height', size * 2)
               .attr('x', -size)
               .attr('y', -size);
        break;
      case 'diamond':
        shapeEl.attr('points', `0,${-size} ${size},0 0,${size} ${-size},0`);
        break;
      case 'triangle':
        shapeEl.attr('points', `0,${-size} ${size},${size} ${-size},${size}`);
        break;
      case 'inverted_triangle':
        shapeEl.attr('points', `${-size},${-size} ${size},${-size} 0,${size}`);
        break;
      case 'pentagon': {
        const pts = [0,1,2,3,4].map(i => {
          const angle = (i * 2 * Math.PI / 5) - Math.PI / 2;
          return `${(Math.cos(angle) * size).toFixed(1)},${(Math.sin(angle) * size).toFixed(1)}`;
        }).join(' ');
        shapeEl.attr('points', pts);
        break;
      }
      case 'hexagon': {
        const pts = [0,1,2,3,4,5].map(i => {
          const angle = (i * Math.PI / 3) - Math.PI / 6;
          return `${(Math.cos(angle) * size).toFixed(1)},${(Math.sin(angle) * size).toFixed(1)}`;
        }).join(' ');
        shapeEl.attr('points', pts);
        break;
      }
      case 'star': {
        const pts = [];
        for (let i = 0; i < 10; i++) {
          const angle = (i * Math.PI / 5) - Math.PI / 2;
          const r = i % 2 === 0 ? size : size * 0.45;
          pts.push(`${(Math.cos(angle) * r).toFixed(1)},${(Math.sin(angle) * r).toFixed(1)}`);
        }
        shapeEl.attr('points', pts.join(' '));
        break;
      }
      default:
        shapeEl.attr('r', size);
        break;
    }
  });

  link
    .attr('stroke', d => getLinkColor(d))
    .attr('stroke-opacity', config.linkOpacity)
    .attr('stroke-width', d => getLinkWidth(d));
}

function setupConfigHandlers() {
  const configPanel = document.getElementById('config');
  const configBtn = document.getElementById('configBtn');
  const closeConfig = document.getElementById('closeConfig');
  const timelinePanel = document.getElementById('timeline');
  const timelineBtn = document.getElementById('timelineBtn');
  const infoPanel = document.getElementById('information');
  const infoBtn = document.getElementById('infoBtn');

  configBtn.onclick = () => {
    const show = configPanel.style.display === 'none';
    configPanel.style.display = show ? 'block' : 'none';
    configBtn.classList.toggle('active', show);
  };

  closeConfig.onclick = () => {
    configPanel.style.display = 'none';
    configBtn.classList.remove('active');
  };

  timelineBtn.onclick = () => {
    const show = timelinePanel.style.display === 'none';
    timelinePanel.style.display = show ? 'block' : 'none';
    timelineBtn.classList.toggle('active', show);
  };

  infoBtn.onclick = () => {
    const show = infoPanel.style.display === 'none';
    infoPanel.style.display = show ? 'block' : 'none';
    infoBtn.classList.toggle('active', show);
  };

  // Timeline controls
  const playBtn = document.getElementById('playBtn');
  const scrubber = document.getElementById('timelineScrubber');
  const speedSelect = document.getElementById('playSpeed');

  function startPlayback() {
    config.isPlaying = true;
    playBtn.textContent = '⏸';
    playInterval = setInterval(() => {
      config.timelinePosition += 5;
      if (config.timelinePosition > 1000) {
        config.timelinePosition = 0; // Loop
      }
      scrubber.value = config.timelinePosition;
      applyTimelineFilter();
    }, config.playSpeed);
  }

  function stopPlayback() {
    config.isPlaying = false;
    playBtn.textContent = '▶';
    if (playInterval) {
      clearInterval(playInterval);
      playInterval = null;
    }
  }

  playBtn.onclick = () => {
    if (config.isPlaying) {
      stopPlayback();
    } else {
      startPlayback();
    }
  };

  scrubber.oninput = (e) => {
    stopPlayback();
    config.timelinePosition = parseInt(e.target.value);
    applyTimelineFilter();
  };

  speedSelect.onchange = (e) => {
    config.playSpeed = parseInt(e.target.value);
    if (config.isPlaying) {
      stopPlayback();
      startPlayback();
    }
  };

  // Timeline mode switcher
  const videoModeBtn = document.getElementById('videoModeBtn');
  const rangeModeBtn = document.getElementById('rangeModeBtn');
  const videoControls = document.getElementById('videoControls');
  const rangeControls = document.getElementById('rangeControls');
  const rangeStartSlider = document.getElementById('rangeStart');
  const rangeEndSlider = document.getElementById('rangeEnd');

  videoModeBtn.onclick = () => {
    config.timelineMode = 'video';
    videoModeBtn.classList.add('active');
    rangeModeBtn.classList.remove('active');
    videoControls.style.display = 'flex';
    rangeControls.style.display = 'none';
    stopPlayback();
    applyTimelineFilter();
  };

  rangeModeBtn.onclick = () => {
    config.timelineMode = 'range';
    rangeModeBtn.classList.add('active');
    videoModeBtn.classList.remove('active');
    videoControls.style.display = 'none';
    rangeControls.style.display = 'block';
    stopPlayback();
    applyTimelineFilter();
  };

  rangeStartSlider.oninput = (e) => {
    const val = parseInt(e.target.value);
    if (val > config.rangeEnd) {
      e.target.value = config.rangeEnd;
      return;
    }
    config.rangeStart = val;
    applyTimelineFilter();
  };

  rangeEndSlider.oninput = (e) => {
    const val = parseInt(e.target.value);
    if (val < config.rangeStart) {
      e.target.value = config.rangeStart;
      return;
    }
    config.rangeEnd = val;
    applyTimelineFilter();
  };

  // Node color mode
  document.getElementById('nodeColorMode').onchange = (e) => {
    config.nodeColorMode = e.target.value;
    document.getElementById('singleNodeColor').style.display = e.target.value === 'single' ? 'block' : 'none';
    document.getElementById('namespaceColors').style.display = e.target.value === 'namespace' ? 'block' : 'none';
    document.getElementById('sourceColors').style.display = (e.target.value === 'dbSource' || e.target.value === 'sourceType') ? 'block' : 'none';
    updateColors();
    renderLegend();
  };

  // node type color pickers - write through to SSOT nodeTypeConfig
  const colorPickerMap = {
    memoryColor: 'memory',
    neuralPatternColor: 'neural_pattern',
    qPatternColor: 'q_pattern',
    trajectoryColor: 'trajectory'
  };
  Object.entries(colorPickerMap).forEach(([elId, typeKey]) => {
    const el = document.getElementById(elId);
    if (el) {
      el.oninput = (e) => {
        if (nodeTypeConfig && nodeTypeConfig[typeKey]) {
          nodeTypeConfig[typeKey].color = e.target.value;
        }
        // Also update fallback so getSourceColor works if nodeTypeConfig is missing
        sourceColorFallbacks[typeKey] = e.target.value;
        updateColors();
        renderLegend();
      };
    }
  });

  document.getElementById('nodeSizeMode').onchange = (e) => {
    config.nodeSizeMode = e.target.value;
    updateColors();
  };

  document.getElementById('linkWidthMode').onchange = (e) => {
    config.linkWidthMode = e.target.value;
    updateColors();
  };

  document.getElementById('nodeColor').oninput = (e) => { config.nodeColor = e.target.value; updateColors(); };
  document.getElementById('linkColor').oninput = (e) => { config.linkColor = e.target.value; updateColors(); };

  // Color edges by type toggle
  document.getElementById('colorEdgesByType').onchange = (e) => {
    config.colorEdgesByType = e.target.checked;
    updateColors();
  };

  // DB source color pickers (optional elements)
  const metadataDbColor = document.getElementById('metadataDbColor');
  const intelligenceDbColor = document.getElementById('intelligenceDbColor');
  const trajectoriesColor = document.getElementById('trajectoriesColor');
  const qPatternsColor = document.getElementById('qPatternsColor');
  const qPatternsIntelColor = document.getElementById('qPatternsIntelColor');

  if (metadataDbColor) metadataDbColor.oninput = (e) => { config.metadataDbColor = e.target.value; updateColors(); renderLegend(); };
  if (intelligenceDbColor) intelligenceDbColor.oninput = (e) => { config.intelligenceDbColor = e.target.value; updateColors(); renderLegend(); };
  if (trajectoriesColor) trajectoriesColor.oninput = (e) => { config.trajectoriesColor = e.target.value; updateColors(); renderLegend(); };
  if (qPatternsColor) qPatternsColor.oninput = (e) => { config.qPatternsColor = e.target.value; updateColors(); renderLegend(); };
  if (qPatternsIntelColor) qPatternsIntelColor.oninput = (e) => { config.qPatternsIntelColor = e.target.value; updateColors(); renderLegend(); };

  const linkOpacityEl = document.getElementById('linkOpacity');
  if (linkOpacityEl) {
    linkOpacityEl.oninput = (e) => {
      config.linkOpacity = parseFloat(e.target.value);
      const val = document.getElementById('linkOpacityVal');
      if (val) val.textContent = config.linkOpacity;
      updateColors();
    };
  }

  const linkWidthEl = document.getElementById('linkWidth');
  if (linkWidthEl) {
    linkWidthEl.oninput = (e) => {
      config.linkWidth = parseFloat(e.target.value);
      const val = document.getElementById('linkWidthVal');
      if (val) val.textContent = config.linkWidth;
      updateColors();
    };
  }

  const nodeSizeEl = document.getElementById('nodeSize');
  if (nodeSizeEl) {
    nodeSizeEl.oninput = (e) => {
      config.nodeSize = parseInt(e.target.value);
      const val = document.getElementById('nodeSizeVal');
      if (val) val.textContent = config.nodeSize;
      updateColors();
    };
  }

  const nodeOpacityEl = document.getElementById('nodeOpacity');
  if (nodeOpacityEl) {
    nodeOpacityEl.oninput = (e) => {
      config.nodeOpacity = parseFloat(e.target.value);
      const val = document.getElementById('nodeOpacityVal');
      if (val) val.textContent = config.nodeOpacity;
      updateColors();
    };
  }

  const repulsionEl = document.getElementById('repulsion');
  if (repulsionEl) {
    repulsionEl.oninput = (e) => {
      config.repulsion = parseInt(e.target.value);
      const val = document.getElementById('repulsionVal');
      if (val) val.textContent = config.repulsion;
      if (simulation) {
        simulation.force('charge', d3.forceManyBody().strength(d => {
          if (d.source === 'qPatterns' || d.source === 'qPatternsIntel') return config.repulsion * 5;
          if (d.source === 'trajectories') return config.repulsion * 2;
          return config.repulsion;
        }));
        simulation.alpha(0.3).restart();
      }
    };
  }

  const linkDistEl = document.getElementById('linkDist');
  if (linkDistEl) {
    linkDistEl.oninput = (e) => {
      config.linkDist = parseInt(e.target.value);
      const val = document.getElementById('linkDistVal');
      if (val) val.textContent = config.linkDist;
      if (simulation) {
        simulation.force('link').distance(config.linkDist);
        simulation.alpha(0.3).restart();
      }
    };
  }

  // Cluster Separation Controls

  // Edge type visibility toggles
  const edgeTypeToggles = document.querySelectorAll('.edge-type-toggle');
  console.log(`Setting up ${edgeTypeToggles.length} edge type toggles`);
  edgeTypeToggles.forEach(checkbox => {
    checkbox.onchange = (e) => {
      const edgeType = e.target.dataset.type;
      const isChecked = e.target.checked;
      console.log(`Edge type toggle: ${edgeType} = ${isChecked}`);
      config.visibleEdgeTypes[edgeType] = isChecked;

      // Debug: show edge counts before/after filter
      const allEdges = graphData.edges;
      const matchingEdges = allEdges.filter(d => d.type === edgeType);
      console.log(`  Edges of type "${edgeType}": ${matchingEdges.length}`);
      console.log(`  visibleEdgeTypes:`, JSON.stringify(config.visibleEdgeTypes));

      rebuildGraph();  // Rebuild to apply filter
    };
  });

  // Radial target dropdown
  const radialTargetSelect = document.getElementById('radialTarget');
  if (radialTargetSelect) {
    radialTargetSelect.onchange = (e) => {
      config.radialTarget = e.target.value;
      if (simulation) {
        simulation.force('radial').strength(d => {
          if (config.radialTarget === 'none') return 0;
          if (d.source === config.radialTarget) return config.radialStrength;
          return 0;
        });
        simulation.alpha(0.5).restart();
      }
    };
  }

  // Radial distance slider
  const radialDistSlider = document.getElementById('radialDist');
  if (radialDistSlider) {
    radialDistSlider.oninput = (e) => {
      config.radialDist = parseInt(e.target.value);
      document.getElementById('radialDistVal').textContent = Math.round(config.radialDist / 10) + '%';
      if (simulation && config.radialTarget !== 'none') {
        const effectiveRadius = Math.min(window.innerWidth, window.innerHeight) * (config.radialDist / 1000);
        simulation.force('radial').radius(effectiveRadius);
        simulation.alpha(0.3).restart();
      }
    };
  }

  // Radial strength slider
  const radialStrengthSlider = document.getElementById('radialStrength');
  if (radialStrengthSlider) {
    radialStrengthSlider.oninput = (e) => {
      config.radialStrength = parseFloat(e.target.value);
      document.getElementById('radialStrengthVal').textContent = config.radialStrength;
      if (simulation && config.radialTarget !== 'none') {
        simulation.force('radial').strength(d => {
          if (d.source === config.radialTarget) return config.radialStrength;
          return 0;
        });
        simulation.alpha(0.3).restart();
      }
    };
  }

  // Cluster Separation checkboxes (which edge groups affect clustering forces)
  const clusterDetCheckbox = document.getElementById('clusterDeterministic');
  if (clusterDetCheckbox) {
    clusterDetCheckbox.onchange = (e) => {
      config.clusterDeterministic = e.target.checked;
      rebuildGraphWithClusterSettings();
    };
  }

  const clusterSemCheckbox = document.getElementById('clusterSemantic');
  if (clusterSemCheckbox) {
    clusterSemCheckbox.onchange = (e) => {
      config.clusterSemantic = e.target.checked;
      rebuildGraphWithClusterSettings();
    };
  }

  // Edge Types toggle panel
  const toggleEdgeTypesBtn = document.getElementById('toggleEdgeTypes');
  const edgeTypesList = document.getElementById('edgeTypesList');
  if (toggleEdgeTypesBtn && edgeTypesList) {
    toggleEdgeTypesBtn.onclick = () => {
      const isVisible = edgeTypesList.style.display !== 'none';
      edgeTypesList.style.display = isVisible ? 'none' : 'block';
      toggleEdgeTypesBtn.textContent = isVisible ? '▼' : '▲';
    };
  }

  // v3 Intelligence Controls

  // Similarity Threshold
  document.getElementById('similarityThreshold').oninput = async (e) => {
    const threshold = parseFloat(e.target.value);
    document.getElementById('similarityThresholdVal').textContent = threshold;
    document.getElementById('edgeCountDisplay').textContent = 'Loading...';

    // Reload data with new threshold
    const newData = await loadData(true, threshold);

    // Update edge count display
    document.getElementById('edgeCountDisplay').textContent = `${newData.meta.totalEdges} edges`;

    // Update the visualization
    graphData = newData;
    timelineData = newData.timeline;
    metricsData = newData.metrics;

    // Rebuild graph with new edges
    rebuildGraph();
    renderMetrics();
  };

  // Data Source Filters
  const dataSourceFilters = ['filterMetadataDb', 'filterIntelligenceDb', 'filterTrajectories', 'filterQPatterns', 'filterQPatternsIntel'];
  dataSourceFilters.forEach(filterId => {
    const el = document.getElementById(filterId);
    if (el) {
      el.onchange = () => {
        updateVisibleNodes();
      };
    }
  });

  // Q-Learning Pattern Overlay
  document.getElementById('qPatternMode').onchange = (e) => {
    config.qPatternMode = e.target.value;
    // Reset SONA mode when Q-pattern mode is activated
    if (config.qPatternMode !== 'off') {
      config.sonaTrajectoryMode = 'off';
      document.getElementById('sonaTrajectoryMode').value = 'off';
      document.getElementById('sonaTimelineControl').style.display = 'none';
    }
    updateColors();
    renderLegend();
  };

  document.getElementById('qPatternSelect').onchange = (e) => {
    config.selectedQPattern = e.target.value;
    updateColors();
  };

  // SONA Trajectory View
  document.getElementById('sonaTrajectoryMode').onchange = (e) => {
    const mode = e.target.value;
    config.sonaTrajectoryMode = mode;
    const timelineControl = document.getElementById('sonaTimelineControl');
    // Show timeline control for all SONA modes (not just 'timeline')
    timelineControl.style.display = mode !== 'off' ? 'block' : 'none';
    // Reset Q-pattern mode when SONA mode is activated
    if (mode !== 'off') {
      config.qPatternMode = 'off';
      document.getElementById('qPatternMode').value = 'off';
      // Start at final position (100) by default
      config.sonaTimelinePosition = 100;
      document.getElementById('sonaTimeline').value = 100;
    }
    updateColors();
    renderLegend();
  };

  const sonaPlayBtn = document.getElementById('sonaPlayBtn');
  const sonaResetBtn = document.getElementById('sonaResetBtn');
  const sonaTimeline = document.getElementById('sonaTimeline');

  let sonaAnimationInterval = null;

  sonaPlayBtn.onclick = () => {
    if (sonaAnimationInterval) {
      // Stop
      clearInterval(sonaAnimationInterval);
      sonaAnimationInterval = null;
      sonaPlayBtn.textContent = '▶ Play';
    } else {
      // Start
      sonaPlayBtn.textContent = '⏸ Pause';
      sonaAnimationInterval = setInterval(() => {
        let val = parseInt(sonaTimeline.value);
        val = (val + 1) % 101;
        sonaTimeline.value = val;
        config.sonaTimelinePosition = val;
        document.getElementById('sonaTimelineVal').textContent = val;
        updateColors();
      }, 100);
    }
  };

  sonaResetBtn.onclick = () => {
    if (sonaAnimationInterval) {
      clearInterval(sonaAnimationInterval);
      sonaAnimationInterval = null;
      sonaPlayBtn.textContent = '▶ Play';
    }
    sonaTimeline.value = 0;
    config.sonaTimelinePosition = 0;
    document.getElementById('sonaTimelineVal').textContent = 0;
    updateColors();
  };

  sonaTimeline.oninput = (e) => {
    config.sonaTimelinePosition = parseInt(e.target.value);
    document.getElementById('sonaTimelineVal').textContent = e.target.value;
    updateColors();
  };
}

async function init(forceRefresh = false) {
  try {
    const data = await loadData(forceRefresh);

    document.getElementById('loading').style.display = 'none';
    document.getElementById('information').style.display = 'block';
    document.getElementById('controls').style.display = 'flex';

    // Update new stat cards
    const statTotalEl = document.getElementById('stat-total');
    if (statTotalEl) {
      statTotalEl.textContent = data.meta.totalNodes;
    }

    const statEdgesEl = document.getElementById('stat-edges');
    if (statEdgesEl) {
      statEdgesEl.textContent = data.meta.totalEdges;
    }

    // Legacy stats element (for backward compatibility)
    const statsEl = document.getElementById('stats');
    if (statsEl) {
      statsEl.innerHTML =
        `<b>${data.meta.totalNodes}</b> memories · <b>${data.meta.totalEdges}</b> connections<br>
        <small>Loaded in ${data.meta.loadTimeMs}ms from ${Object.keys(data.meta.dataSources || {}).length} sources</small>`;
    }

    // Update last refresh time
    const lastRefreshTime = document.getElementById('lastRefreshTime');
    if (lastRefreshTime) {
      lastRefreshTime.textContent = new Date(data.meta.loadedAt).toLocaleTimeString();
    }

    const container = document.getElementById('container');
    const width = window.innerWidth;
    const height = window.innerHeight;

    container.innerHTML = '';

    svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height]);

    g = svg.append('g');

    // Store zoom behavior for later use (e.g., Fit View button)
    const zoom = d3.zoom()
      .extent([[0, 0], [width, height]])
      .scaleExtent([0.1, 8])
      .on('zoom', (event) => g.attr('transform', event.transform));

    svg.call(zoom);

    // Store zoom on svg element for access from button handlers
    svg.node().__zoom_behavior = zoom;

    // Create nodes array BEFORE rendering UI that depends on it
    nodes = data.nodes.map((n, i) => ({
      ...n,
      index: i,
      x: n.x * width / 4096,
      y: n.y * height / 4096
    }));

    links = data.edges.map(e => ({
      source: e.source,
      target: e.target,
      weight: e.weight,
      type: e.type || 'embedding'
    }));

    console.log(`Loaded ${nodes.length} nodes, ${links.length} links`);

    // Now render UI that depends on nodes
    renderLegend();
    renderNamespaceColorPickers(data.meta.namespaces);
    renderTimeline();
    renderMetrics();
    renderV3Panel();
    renderV3Metrics(); // Now nodes is available
    renderTopItems();
    renderDistributions(); // New distribution panels
    setupConfigHandlers();
    setupSearchHandlers();
    setupSourceTypeFilters(); // New node type filter handlers
    setupEdgeGroupHandlers(); // Edge groups panel handlers

    // Populate settings dropdowns with actual database values (async, non-blocking)
    populateDynamicDropdowns(forceRefresh).catch(err => {
      console.warn('Failed to populate dynamic dropdowns:', err);
    });

    // Q-pattern nodes get stronger repulsion to push them outward
    const chargeStrength = (d) => {
      if (d.source === 'qPatterns' || d.source === 'qPatternsIntel') {
        return config.repulsion * 5;  // 5x stronger repulsion for Q-patterns
      }
      if (d.source === 'trajectories') {
        return config.repulsion * 2;  // 2x stronger for trajectories
      }
      return config.repulsion;
    };

    // Link strength: very weak for cross-links to prevent clustering
    const linkStrength = (d) => {
      const type = d.type || 'embedding';
      if (type === 'pattern-memory' || type === 'trajectory-memory') {
        return 0.01;  // Near-zero: visual only, minimal pull
      }
      if (type === 'same-state' || type === 'same-action') {
        return 0.03;  // Very weak for Q-pattern structural links
      }
      if (type.startsWith('trajectory-')) {
        return 0.05;  // Weak for trajectory links
      }
      return 0.1;  // Normal for embedding similarity
    };

    // Radial force: push selected node type to outer ring
    // Use viewport-relative radius (radialDist/1000 gives 0.2-0.9 of viewport)
    const effectiveRadius = Math.min(width, height) * (config.radialDist / 1000);
    const radialForce = d3.forceRadial(effectiveRadius, width / 2, height / 2)
      .strength(d => {
        if (config.radialTarget === 'none') return 0;
        if (d.source === config.radialTarget) return config.radialStrength;
        return 0;
      });

    // Filter links by visibility settings AND edge group enabled state
    const visibleLinks = links.filter(d => {
      const type = d.type || 'embedding';
      const group = getEdgeGroup(type);

      // Check if edge group is enabled
      if (!config.edgeGroups[group].enabled) return false;

      // Check if specific edge type is enabled
      return config.visibleEdgeTypes[type] !== false;
    });

    // Compute weighted repulsion based on edge group distribution
    const deterministicLinks = visibleLinks.filter(d => getEdgeGroup(d.type || 'embedding') === 'deterministic');
    const semanticLinks = visibleLinks.filter(d => getEdgeGroup(d.type || 'embedding') === 'semantic');
    const deterministicRatio = deterministicLinks.length / (visibleLinks.length || 1);

    // Blend repulsion based on ratio of edge types
    const blendedRepulsion = config.edgeGroups.deterministic.repulsion * deterministicRatio +
                            config.edgeGroups.semantic.repulsion * (1 - deterministicRatio);

    simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(visibleLinks)
        .id(d => d.index)
        .distance(d => getLinkDistance(d))      // Per-edge distance
        .strength(d => getLinkStrength(d)))     // Per-edge strength
      .force('charge', d3.forceManyBody().strength(d => {
        // Use node-based charge with edge group influence
        const baseCharge = chargeStrength(d);
        return baseCharge * (blendedRepulsion / config.repulsion);
      }))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('radial', radialForce)
      .force('collision', d3.forceCollide().radius(config.nodeSize + 2));

    // Create groups for links and nodes (needed for rebuildGraph)
    linkGroup = g.append('g').attr('class', 'links');
    nodeGroup = g.append('g').attr('class', 'nodes');

    // Define SVG filter for glow effect (used by deterministic edges)
    const defs = svg.select('defs').empty() ? svg.append('defs') : svg.select('defs');
    if (defs.select('#edgeGlow').empty()) {
      const filter = defs.append('filter')
        .attr('id', 'edgeGlow')
        .attr('x', '-50%').attr('y', '-50%')
        .attr('width', '200%').attr('height', '200%');
      filter.append('feGaussianBlur')
        .attr('stdDeviation', '2')
        .attr('result', 'coloredBlur');
      const feMerge = filter.append('feMerge');
      feMerge.append('feMergeNode').attr('in', 'coloredBlur');
      feMerge.append('feMergeNode').attr('in', 'SourceGraphic');
    }

    link = linkGroup
      .selectAll('line')
      .data(visibleLinks)
      .join('line')
      .attr('stroke', d => getLinkColor(d))
      .attr('stroke-opacity', d => getLinkOpacity(d))
      .attr('stroke-width', d => getLinkWidthByGroup(d))
      .attr('stroke-dasharray', d => getLinkDashArray(d))
      .attr('filter', d => {
        const group = getEdgeGroup(d.type || 'embedding');
        return config.edgeGroups[group].glowEnabled ? 'url(#edgeGlow)' : 'none';
      });

    const connectionCounts = new Map();
    links.forEach(l => {
      connectionCounts.set(l.source, (connectionCounts.get(l.source) || 0) + 1);
      connectionCounts.set(l.target, (connectionCounts.get(l.target) || 0) + 1);
    });

    // Render nodes with shape support (circle, square, diamond)
    node = nodeGroup
      .selectAll('.node')
      .data(nodes)
      .join(
        enter => {
          const g = enter.append('g')
            .attr('class', 'node')
            .call(drag(simulation));

          // Add shapes based on node type (canonical shapes from Constants.ts)
          g.each(function(d) {
            const shape = getNodeShape(d);
            const size = getNodeSize(d, nodes);
            const sel = d3.select(this);
            const fill = getNodeColor(d, nodes);
            const opacity = config.nodeOpacity;

            switch (shape) {
              case 'square':
                sel.append('rect')
                  .attr('class', 'node-shape')
                  .attr('width', size * 2).attr('height', size * 2)
                  .attr('x', -size).attr('y', -size)
                  .attr('fill', fill).attr('opacity', opacity);
                break;
              case 'diamond': {
                const pts = `0,${-size} ${size},0 0,${size} ${-size},0`;
                sel.append('polygon').attr('class', 'node-shape')
                  .attr('points', pts).attr('fill', fill).attr('opacity', opacity);
                break;
              }
              case 'triangle': {
                const pts = `0,${-size} ${size},${size} ${-size},${size}`;
                sel.append('polygon').attr('class', 'node-shape')
                  .attr('points', pts).attr('fill', fill).attr('opacity', opacity);
                break;
              }
              case 'inverted_triangle': {
                const pts = `${-size},${-size} ${size},${-size} 0,${size}`;
                sel.append('polygon').attr('class', 'node-shape')
                  .attr('points', pts).attr('fill', fill).attr('opacity', opacity);
                break;
              }
              case 'pentagon': {
                const pts = [0,1,2,3,4].map(i => {
                  const angle = (i * 2 * Math.PI / 5) - Math.PI / 2;
                  return `${(Math.cos(angle) * size).toFixed(1)},${(Math.sin(angle) * size).toFixed(1)}`;
                }).join(' ');
                sel.append('polygon').attr('class', 'node-shape')
                  .attr('points', pts).attr('fill', fill).attr('opacity', opacity);
                break;
              }
              case 'hexagon': {
                const pts = [0,1,2,3,4,5].map(i => {
                  const angle = (i * Math.PI / 3) - Math.PI / 6;
                  return `${(Math.cos(angle) * size).toFixed(1)},${(Math.sin(angle) * size).toFixed(1)}`;
                }).join(' ');
                sel.append('polygon').attr('class', 'node-shape')
                  .attr('points', pts).attr('fill', fill).attr('opacity', opacity);
                break;
              }
              case 'star': {
                const pts = [];
                for (let i = 0; i < 10; i++) {
                  const angle = (i * Math.PI / 5) - Math.PI / 2;
                  const r = i % 2 === 0 ? size : size * 0.45;
                  pts.push(`${(Math.cos(angle) * r).toFixed(1)},${(Math.sin(angle) * r).toFixed(1)}`);
                }
                sel.append('polygon').attr('class', 'node-shape')
                  .attr('points', pts.join(' ')).attr('fill', fill).attr('opacity', opacity);
                break;
              }
              default:
                sel.append('circle').attr('class', 'node-shape')
                  .attr('r', size).attr('fill', fill).attr('opacity', opacity);
                break;
            }
          });

          return g;
        },
        update => update,
        exit => exit.remove()
      );

    const tooltip = document.getElementById('tooltip');

    node.on('mouseover', (event, d) => {
      const date = new Date(d.timestamp).toLocaleString();
      let extraInfo = '';
      // Handle both old and new node type names
      if (isQPatternNode(d)) {
        const qVal = d.q_value ?? d.qValue;
        extraInfo = `<div style="color:#B794F6;margin-top:4px;">Q-Value: ${typeof qVal === 'number' ? qVal.toFixed(4) : 'N/A'} · Visits: ${d.visits || 0}</div>`;
      } else if (isTrajectoryNode(d)) {
        extraInfo = `<div style="color:#10B981;margin-top:4px;">Success: ${d.success ? 'Yes' : 'No'} · Steps: ${d.stepCount || d.steps?.length || 'N/A'}${d.agent ? ' · Agent: ' + d.agent : ''}${d.durationMs ? ' · ' + (d.durationMs/1000).toFixed(1) + 's' : ''}</div>`;
      } else if (isNeuralPatternNode(d)) {
        const conf = d.confidence ?? 0;
        extraInfo = `<div style="color:#8B4FD9;margin-top:4px;">Category: ${d.category || d.namespace} · Confidence: ${(conf * 100).toFixed(1)}%${d.trajectoryId ? ' · Traj: ' + d.trajectoryId : ''}</div>`;
      } else if (isMemoryNode(d)) {
        const memType = d.memory_type || d.memoryType || 'unknown';
        extraInfo = `<div style="color:#6B2FB5;margin-top:4px;">Memory Type: ${memType.replace(/_/g, ' ')}${d.domain ? ' · Domain: ' + d.domain : ''}</div>`;
      } else if (isStateNode(d)) {
        extraInfo = `<div style="color:#E67E22;margin-top:4px;">State: ${d.stateValue || d.id} · Patterns: ${d.patternCount || 0} · Avg Q: ${typeof d.avgQ === 'number' ? d.avgQ.toFixed(4) : 'N/A'}</div>`;
      } else if (isActionNode(d)) {
        extraInfo = `<div style="color:#2ECC71;margin-top:4px;">Action: ${d.actionValue || d.id} · Patterns: ${d.patternCount || 0} · Avg Q: ${typeof d.avgQ === 'number' ? d.avgQ.toFixed(4) : 'N/A'}</div>`;
      } else if (isFileNode(d)) {
        extraInfo = `<div style="color:#1ABC9C;margin-top:4px;">File: ${d.filePath || d.id} · Type: ${d.fileType || 'unknown'}</div>`;
      } else if (isAgentNode(d)) {
        extraInfo = `<div style="color:#34495E;margin-top:4px;">Agent: ${d.agentType || d.agentSourceType || 'unknown'} · Role: ${d.topologyRole || 'standalone'}</div>`;
      }
      tooltip.innerHTML = `
        <div class="key">${d.key}</div>
        <div class="ns">${d.namespace}</div>
        <div class="date">${date} · ${d.valueLength || 0} chars · ${d.wordCount || 0} words</div>
        <div class="preview">${d.preview || ''}...</div>
        ${extraInfo}
      `;
      tooltip.style.display = 'block';
      tooltip.style.left = (event.pageX + 15) + 'px';
      tooltip.style.top = (event.pageY + 15) + 'px';

      // Highlight the node shape
      const shape = getNodeShape(d);
      const currentSize = getNodeSize(d, nodes);
      const nodeEl = d3.select(event.currentTarget).select('.node-shape');
      const newSize = currentSize + 3;

      if (shape === 'square') {
        nodeEl.attr('width', newSize * 2)
              .attr('height', newSize * 2)
              .attr('x', -newSize)
              .attr('y', -newSize)
              .attr('stroke', '#4CAF50')
              .attr('stroke-width', 2);
      } else if (shape === 'diamond') {
        nodeEl.attr('points', `0,${-newSize} ${newSize},0 0,${newSize} ${-newSize},0`)
              .attr('stroke', '#4CAF50')
              .attr('stroke-width', 2);
      } else if (shape === 'triangle') {
        nodeEl.attr('points', `0,${-newSize} ${newSize},${newSize} ${-newSize},${newSize}`)
              .attr('stroke', '#4CAF50')
              .attr('stroke-width', 2);
      } else if (shape === 'inverted_triangle') {
        nodeEl.attr('points', `${-newSize},${-newSize} ${newSize},${-newSize} 0,${newSize}`)
              .attr('stroke', '#4CAF50')
              .attr('stroke-width', 2);
      } else if (shape === 'pentagon') {
        const pts = [0,1,2,3,4].map(i => {
          const angle = (i * 2 * Math.PI / 5) - Math.PI / 2;
          return `${(Math.cos(angle) * newSize).toFixed(1)},${(Math.sin(angle) * newSize).toFixed(1)}`;
        }).join(' ');
        nodeEl.attr('points', pts)
              .attr('stroke', '#4CAF50')
              .attr('stroke-width', 2);
      } else if (shape === 'hexagon') {
        const pts = [0,1,2,3,4,5].map(i => {
          const angle = (i * Math.PI / 3) - Math.PI / 6;
          return `${(Math.cos(angle) * newSize).toFixed(1)},${(Math.sin(angle) * newSize).toFixed(1)}`;
        }).join(' ');
        nodeEl.attr('points', pts)
              .attr('stroke', '#4CAF50')
              .attr('stroke-width', 2);
      } else if (shape === 'star') {
        const pts = [];
        for (let i = 0; i < 10; i++) {
          const angle = (i * Math.PI / 5) - Math.PI / 2;
          const r = i % 2 === 0 ? newSize : newSize * 0.45;
          pts.push(`${(Math.cos(angle) * r).toFixed(1)},${(Math.sin(angle) * r).toFixed(1)}`);
        }
        nodeEl.attr('points', pts.join(' '))
              .attr('stroke', '#4CAF50')
              .attr('stroke-width', 2);
      } else {
        nodeEl.attr('r', newSize)
              .attr('stroke', '#4CAF50')
              .attr('stroke-width', 2);
      }
    })
    .on('mousemove', (event) => {
      tooltip.style.left = (event.pageX + 15) + 'px';
      tooltip.style.top = (event.pageY + 15) + 'px';
    })
    .on('mouseout', (event, d) => {
      tooltip.style.display = 'none';
      const shape = getNodeShape(d);
      const size = getNodeSize(d, nodes);
      const nodeEl = d3.select(event.currentTarget).select('.node-shape');

      if (shape === 'square') {
        nodeEl.attr('width', size * 2)
              .attr('height', size * 2)
              .attr('x', -size)
              .attr('y', -size)
              .attr('stroke', 'none');
      } else if (shape === 'diamond') {
        nodeEl.attr('points', `0,${-size} ${size},0 0,${size} ${-size},0`)
              .attr('stroke', 'none');
      } else if (shape === 'triangle') {
        nodeEl.attr('points', `0,${-size} ${size},${size} ${-size},${size}`)
              .attr('stroke', 'none');
      } else if (shape === 'inverted_triangle') {
        nodeEl.attr('points', `${-size},${-size} ${size},${-size} 0,${size}`)
              .attr('stroke', 'none');
      } else if (shape === 'pentagon') {
        const pts = [0,1,2,3,4].map(i => {
          const angle = (i * 2 * Math.PI / 5) - Math.PI / 2;
          return `${(Math.cos(angle) * size).toFixed(1)},${(Math.sin(angle) * size).toFixed(1)}`;
        }).join(' ');
        nodeEl.attr('points', pts)
              .attr('stroke', 'none');
      } else if (shape === 'hexagon') {
        const pts = [0,1,2,3,4,5].map(i => {
          const angle = (i * Math.PI / 3) - Math.PI / 6;
          return `${(Math.cos(angle) * size).toFixed(1)},${(Math.sin(angle) * size).toFixed(1)}`;
        }).join(' ');
        nodeEl.attr('points', pts)
              .attr('stroke', 'none');
      } else if (shape === 'star') {
        const pts = [];
        for (let i = 0; i < 10; i++) {
          const angle = (i * Math.PI / 5) - Math.PI / 2;
          const r = i % 2 === 0 ? size : size * 0.45;
          pts.push(`${(Math.cos(angle) * r).toFixed(1)},${(Math.sin(angle) * r).toFixed(1)}`);
        }
        nodeEl.attr('points', pts.join(' '))
              .attr('stroke', 'none');
      } else {
        nodeEl.attr('r', size)
              .attr('stroke', 'none');
      }
    })
    .on('click', (event, d) => handleNodeClick(event, d));

    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
      // Position node groups using transform (works for all shape types)
      node.attr('transform', d => `translate(${d.x}, ${d.y})`);
    });

    setTimeout(() => simulation.alphaTarget(0), 3000);

    // Auto fit view after nodes have initial positions
    setTimeout(() => {
      document.getElementById('fitBtn').click();
    }, 800);

    // Manual refresh button
    document.getElementById('refreshBtn').onclick = async () => {
      if (simulation) simulation.stop();
      document.getElementById('loading').style.display = 'block';
      document.getElementById('information').style.display = 'none';
      document.getElementById('controls').style.display = 'none';
      document.getElementById('config').style.display = 'none';
      document.getElementById('timeline').style.display = 'none';
      await init(true); // Force refresh
    };

    document.getElementById('fitBtn').onclick = () => {
      // Calculate bounding box of all nodes
      if (!nodes || nodes.length === 0) return;

      const padding = 50;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

      nodes.forEach(n => {
        if (n.x !== undefined && n.y !== undefined) {
          minX = Math.min(minX, n.x);
          maxX = Math.max(maxX, n.x);
          minY = Math.min(minY, n.y);
          maxY = Math.max(maxY, n.y);
        }
      });

      if (minX === Infinity) return; // No valid positions

      const nodeWidth = maxX - minX;
      const nodeHeight = maxY - minY;
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      // Calculate scale to fit all nodes with padding
      const scaleX = (width - padding * 2) / (nodeWidth || 1);
      const scaleY = (height - padding * 2) / (nodeHeight || 1);
      const scale = Math.min(scaleX, scaleY, 2); // Cap at 2x zoom

      // Calculate translation to center
      const translateX = width / 2 - centerX * scale;
      const translateY = height / 2 - centerY * scale;

      // Use stored zoom behavior
      const zoomBehavior = svg.node().__zoom_behavior;
      svg.transition().duration(750)
         .call(zoomBehavior.transform, d3.zoomIdentity.translate(translateX, translateY).scale(scale));
    };

    let simRunning = true;
    document.getElementById('simBtn').onclick = () => {
      simRunning = !simRunning;
      if (simRunning) {
        simulation.alpha(0.3).restart();
        document.getElementById('simBtn').textContent = '⏸ Simulation';
      } else {
        simulation.stop();
        document.getElementById('simBtn').textContent = '▶ Simulation';
      }
    };

  } catch (err) {
    console.error('Failed to load graph:', err);
    document.getElementById('loading').textContent = 'Error: ' + err.message;
  }
}

function drag(simulation) {
  return d3.drag()
    .on('start', (event) => {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    })
    .on('drag', (event) => {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    })
    .on('end', (event) => {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    });
}

// Search configuration
const searchConfig = {
  mode: 'server', // 'server' or 'client'
  source: 'all', // 'all', 'metadata', 'intelligence'
  maxResults: 8,
  minSimilarity: 0.3,
  highlightMode: 'fade',
  searchField: 'all'
};

let currentSearchResults = [];

// Simple text similarity using TF-IDF-like scoring
function textSimilarity(query, text) {
  if (!text) return 0;
  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
  const textLower = text.toLowerCase();

  let score = 0;
  let matchedTerms = 0;

  for (const term of queryTerms) {
    if (textLower.includes(term)) {
      matchedTerms++;
      // Bonus for exact word matches
      const wordBoundary = new RegExp(`\\b${term}\\b`, 'i');
      if (wordBoundary.test(text)) {
        score += 2;
      } else {
        score += 1;
      }
      // Bonus for term appearing multiple times
      const occurrences = (textLower.match(new RegExp(term, 'g')) || []).length;
      score += Math.log(1 + occurrences) * 0.5;
    }
  }

  // Normalize by query length
  const normalizedScore = queryTerms.length > 0 ? score / (queryTerms.length * 2.5) : 0;

  // Boost if all terms matched
  const allTermsBonus = matchedTerms === queryTerms.length ? 0.2 : 0;

  return Math.min(1, normalizedScore + allTermsBonus);
}

function searchNodes(query) {
  if (!query.trim() || !nodes) return [];

  const results = nodes.map((n, idx) => {
    let searchText = '';
    switch (searchConfig.searchField) {
      case 'key':
        searchText = n.key;
        break;
      case 'preview':
        searchText = n.preview;
        break;
      case 'namespace':
        searchText = n.namespace;
        break;
      case 'all':
      default:
        searchText = `${n.key} ${n.namespace} ${n.preview}`;
        // Include state/action/agent properties for comprehensive search
        if (n.state) searchText += ` ${n.state}`;
        if (n.action) searchText += ` ${n.action}`;
        if (n.agent) searchText += ` ${n.agent}`;
        if (n.stateValue) searchText += ` ${n.stateValue}`;
        if (n.actionValue) searchText += ` ${n.actionValue}`;
    }

    const similarity = textSimilarity(query, searchText);
    return { node: n, index: idx, similarity };
  })
  .filter(r => r.similarity >= searchConfig.minSimilarity)
  .sort((a, b) => b.similarity - a.similarity)
  .slice(0, searchConfig.maxResults);

  return results;
}

function highlightSearchResults(results) {
  if (!node || !link) return;

  const matchedIndices = new Set(results.map(r => r.index));

  switch (searchConfig.highlightMode) {
    case 'focus':
      // Just highlight matches, don't change others
      node.attr('stroke', (d, i) => matchedIndices.has(i) ? '#4CAF50' : '#fff')
          .attr('stroke-width', (d, i) => matchedIndices.has(i) ? 3 : 0.5);
      break;
    case 'fade':
      // Fade non-matches
      node.attr('opacity', (d, i) => matchedIndices.has(i) ? 1 : 0.15)
          .attr('stroke', (d, i) => matchedIndices.has(i) ? '#4CAF50' : '#fff')
          .attr('stroke-width', (d, i) => matchedIndices.has(i) ? 3 : 0.5);
      link.attr('opacity', d => {
        const srcIdx = typeof d.source === 'object' ? d.source.index : d.source;
        const tgtIdx = typeof d.target === 'object' ? d.target.index : d.target;
        return (matchedIndices.has(srcIdx) || matchedIndices.has(tgtIdx)) ? config.linkOpacity : 0.02;
      });
      break;
    case 'hide':
      // Hide non-matches completely
      node.attr('opacity', (d, i) => matchedIndices.has(i) ? 1 : 0)
          .attr('stroke', (d, i) => matchedIndices.has(i) ? '#4CAF50' : '#fff')
          .attr('stroke-width', (d, i) => matchedIndices.has(i) ? 3 : 0.5);
      link.attr('opacity', d => {
        const srcIdx = typeof d.source === 'object' ? d.source.index : d.source;
        const tgtIdx = typeof d.target === 'object' ? d.target.index : d.target;
        return (matchedIndices.has(srcIdx) && matchedIndices.has(tgtIdx)) ? config.linkOpacity : 0;
      });
      break;
  }
}

function clearSearchHighlight() {
  if (!node || !link) return;
  node.attr('opacity', config.nodeOpacity)
      .attr('stroke', 'none');
  link.attr('opacity', config.linkOpacity);
}

function renderSearchResults(results) {
  const container = document.getElementById('searchResults');
  const status = document.getElementById('searchStatus');

  if (results.length === 0) {
    container.innerHTML = '';
    status.style.display = 'block';
    status.textContent = 'No matches found. Try adjusting parameters.';
    return;
  }

  // Keep status visible for server search to show source breakdown
  if (searchConfig.mode !== 'server') {
    status.style.display = 'none';
  }

  container.innerHTML = results.map((r, idx) => {
    const sourceIcons = {
      'metadataDb': '📦',
      'intelligenceDb': '🧠',
      'trajectories': '🛤️',
      'qPatterns': '🎯',
      'qPatternsIntel': '🎲'
    };
    const sourceLabel = sourceIcons[r.node.source] || '📦';
    const inGraphLabel = r.inGraph === false ? ' <span style="color:#888;font-size:9px;">(not in graph)</span>' : '';
    const scoreLabel = r.fromServer ? `Score: <strong>${safeFixed(r.similarity, 0, '-')}</strong>` : `Similarity: <strong>${safeFixed(safeNum(r.similarity) * 100, 0, '-')}%</strong>`;

    return `
      <div class="result-item${r.inGraph === false ? ' not-in-graph' : ''}" data-idx="${idx}" data-node-idx="${r.index}">
        <div class="result-key">${sourceLabel} ${r.node.key}${inGraphLabel}</div>
        <div class="result-ns">${r.node.namespace}${r.node.memoryType ? ` · ${r.node.memoryType}` : ''}</div>
        <div class="result-preview">${(r.node.preview || '').substring(0, 120)}...</div>
        <div class="result-score">${scoreLabel}</div>
      </div>
    `;
  }).join('');

  // Add click handlers to focus on node
  container.querySelectorAll('.result-item').forEach(el => {
    el.onclick = () => {
      const nodeIdx = parseInt(el.dataset.nodeIdx);
      const targetNode = nodeIdx >= 0 ? nodes[nodeIdx] : null;

      // Remove active from all
      container.querySelectorAll('.result-item').forEach(e => e.classList.remove('active'));
      el.classList.add('active');

      // Zoom to node if it exists in the graph
      if (targetNode && svg) {
        const scale = 2;
        const x = -targetNode.x * scale + window.innerWidth / 2;
        const y = -targetNode.y * scale + window.innerHeight / 2;
        const zoomBehavior = svg.node().__zoom_behavior;
        if (zoomBehavior) {
          svg.transition().duration(500)
             .call(zoomBehavior.transform, d3.zoomIdentity.translate(x, y).scale(scale));
        }
      }
    };
  });
}

async function performSearch() {
  const query = document.getElementById('searchInput').value;
  if (!query.trim()) {
    clearSearch();
    return;
  }

  const status = document.getElementById('searchStatus');

  if (searchConfig.mode === 'server') {
    // Server-side search using the API
    status.textContent = 'Searching databases...';
    status.style.display = 'block';

    try {
      const params = new URLSearchParams({
        q: query,
        limit: searchConfig.maxResults,
        source: searchConfig.source
      });
      const response = await fetch(`/api/search?${params}`);
      const data = await response.json();

      if (data.error) {
        status.textContent = `Error: ${data.error}`;
        return;
      }

      // Map API results to node format for rendering
      currentSearchResults = data.results.map(r => {
        // Try to find matching node in loaded graph
        const matchingNode = nodes?.find(n => n.id === r.id || n.key === r.key);
        return {
          node: matchingNode || {
            id: r.id,
            key: r.key,
            namespace: r.namespace,
            preview: r.preview,
            timestamp: r.timestamp,
            source: r.source,
            memoryType: r.memoryType
          },
          index: matchingNode ? nodes.indexOf(matchingNode) : -1,
          similarity: r.score / 100, // Normalize score to 0-1 range
          fromServer: true,
          inGraph: !!matchingNode
        };
      });

      renderSearchResults(currentSearchResults);
      highlightSearchResults(currentSearchResults);

      // Update status with source breakdown
      const srcParts = [];
      if (data.sources.metadataDb) srcParts.push(`📦${data.sources.metadataDb}`);
      if (data.sources.intelligenceDb) srcParts.push(`🧠${data.sources.intelligenceDb}`);
      status.textContent = `Found ${data.total} results (${srcParts.join(' ')})`;
    } catch (e) {
      status.textContent = `Search failed: ${e.message}`;
      console.error('Search error:', e);
    }
  } else {
    // Client-side search (existing behavior)
    currentSearchResults = searchNodes(query);
    renderSearchResults(currentSearchResults);
    highlightSearchResults(currentSearchResults);
  }
}

function clearSearch() {
  document.getElementById('searchInput').value = '';
  document.getElementById('searchResults').innerHTML = '';
  document.getElementById('searchStatus').style.display = 'none';
  currentSearchResults = [];
  clearSearchHighlight();
}

function setupSearchHandlers() {
  const searchPanel = document.getElementById('search');
  const searchToggleBtn = document.getElementById('searchToggleBtn');
  const toggleParams = document.getElementById('toggleParams');
  const searchParams = document.getElementById('searchParams');
  const searchInput = document.getElementById('searchInput');
  const searchBtn = document.getElementById('searchBtn');
  const clearSearchBtn = document.getElementById('clearSearchBtn');

  // Toggle search panel
  searchToggleBtn.onclick = () => {
    const show = searchPanel.style.display === 'none';
    searchPanel.style.display = show ? 'block' : 'none';
    searchToggleBtn.classList.toggle('active', show);
    if (show) searchInput.focus();
  };

  // Toggle parameters
  toggleParams.onclick = () => {
    searchParams.classList.toggle('show');
    toggleParams.textContent = searchParams.classList.contains('show') ? '⚙ Hide' : '⚙ Parameters';
  };

  // Search on button click or Enter
  searchBtn.onclick = performSearch;
  searchInput.onkeydown = (e) => {
    if (e.key === 'Enter') performSearch();
  };

  // Live search on input (debounced)
  let searchTimeout;
  searchInput.oninput = () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(performSearch, 300);
  };

  // Clear search
  clearSearchBtn.onclick = clearSearch;

  // Parameter handlers
  document.getElementById('searchMaxResults').oninput = (e) => {
    searchConfig.maxResults = parseInt(e.target.value);
    document.getElementById('searchMaxResultsVal').textContent = searchConfig.maxResults;
    if (document.getElementById('searchInput').value) performSearch();
  };

  document.getElementById('searchMinSim').oninput = (e) => {
    searchConfig.minSimilarity = parseFloat(e.target.value);
    document.getElementById('searchMinSimVal').textContent = searchConfig.minSimilarity.toFixed(2);
    if (document.getElementById('searchInput').value) performSearch();
  };

  document.getElementById('searchHighlight').onchange = (e) => {
    searchConfig.highlightMode = e.target.value;
    if (currentSearchResults.length > 0) highlightSearchResults(currentSearchResults);
  };

  document.getElementById('searchField').onchange = (e) => {
    searchConfig.searchField = e.target.value;
    if (document.getElementById('searchInput').value) performSearch();
  };

  // New: Search mode handler (server vs client)
  document.getElementById('searchMode').onchange = (e) => {
    searchConfig.mode = e.target.value;
    // Show/hide source option based on mode (only relevant for server search)
    const sourceRow = document.getElementById('searchSource').closest('.param-row');
    if (sourceRow) {
      sourceRow.style.display = searchConfig.mode === 'server' ? 'flex' : 'none';
    }
    if (document.getElementById('searchInput').value) performSearch();
  };

  // New: Data source handler
  document.getElementById('searchSource').onchange = (e) => {
    searchConfig.source = e.target.value;
    if (document.getElementById('searchInput').value) performSearch();
  };
}

// =============================================================================
// EDGE GROUP HANDLERS
// =============================================================================

/**
 * Preset configurations for edge groups
 */
const EDGE_GROUP_PRESETS = {
  workflow: {
    name: 'Workflow Focus',
    description: 'Emphasize deterministic relationships, minimize semantic noise',
    deterministic: {
      enabled: true, opacity: 1.0, width: 3, distance: 50, strength: 0.9, repulsion: -40, glowEnabled: true
    },
    semantic: {
      enabled: true, opacity: 0.15, width: 0.5, distance: 150, strength: 0.1, repulsion: -120, glowEnabled: false
    }
  },
  semantic: {
    name: 'Semantic Focus',
    description: 'Emphasize similarity relationships, show semantic clusters',
    deterministic: {
      enabled: true, opacity: 0.4, width: 1.5, distance: 80, strength: 0.4, repulsion: -80, glowEnabled: false
    },
    semantic: {
      enabled: true, opacity: 0.8, width: 2, distance: 60, strength: 0.7, repulsion: -50, glowEnabled: true
    }
  },
  balanced: {
    name: 'Balanced',
    description: 'Equal emphasis on both edge types',
    deterministic: {
      enabled: true, opacity: 0.7, width: 2, distance: 70, strength: 0.6, repulsion: -60, glowEnabled: true
    },
    semantic: {
      enabled: true, opacity: 0.5, width: 1.5, distance: 80, strength: 0.5, repulsion: -80, glowEnabled: false
    }
  },
  minimal: {
    name: 'Minimal',
    description: 'Reduce visual clutter, show only essential connections',
    deterministic: {
      enabled: true, opacity: 0.6, width: 1.5, distance: 60, strength: 0.7, repulsion: -50, glowEnabled: false
    },
    semantic: {
      enabled: false, opacity: 0.2, width: 0.5, distance: 120, strength: 0.2, repulsion: -100, glowEnabled: false
    }
  }
};

/**
 * Update edge group counts and distribution bar
 */
function updateEdgeGroupCounts() {
  if (!links) return;

  // Count by edge type
  const typeCounts = {};
  links.forEach(d => {
    const type = d.type || 'embedding';
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  });

  const deterministicCount = links.filter(d => getEdgeGroup(d.type || 'embedding') === 'deterministic').length;
  const semanticCount = links.filter(d => getEdgeGroup(d.type || 'embedding') === 'semantic').length;
  const total = links.length || 1;

  const deterministicPct = safeFixed(deterministicCount / total * 100, 1, '0.0');
  const semanticPct = safeFixed(semanticCount / total * 100, 1, '0.0');

  // Update count displays
  const detCountEl = document.getElementById('deterministicCount');
  const semCountEl = document.getElementById('semanticCount');
  if (detCountEl) detCountEl.textContent = `${deterministicCount} edges`;
  if (semCountEl) semCountEl.textContent = `${semanticCount} edges`;

  // Update distribution bar
  const detBar = document.getElementById('deterministicBar');
  const semBar = document.getElementById('semanticBar');
  const detPctEl = document.getElementById('deterministicPct');
  const semPctEl = document.getElementById('semanticPct');

  if (detBar) detBar.style.width = deterministicPct + '%';
  if (semBar) semBar.style.width = semanticPct + '%';
  if (detPctEl) detPctEl.textContent = deterministicPct + '%';
  if (semPctEl) semPctEl.textContent = semanticPct + '%';

  // Update individual edge type counts in the toggle list
  document.querySelectorAll('.edge-type-toggle').forEach(checkbox => {
    const edgeType = checkbox.dataset.type;
    const count = typeCounts[edgeType] || 0;
    const label = checkbox.parentElement.querySelector('span');
    if (label) {
      // Update label to show count
      const baseName = edgeType.replace(/-/g, ' ').replace(/_/g, ' ');
      label.textContent = `${baseName} (${count})`;
    }
    // Update checkbox state from config
    checkbox.checked = config.visibleEdgeTypes[edgeType] !== false;
  });
}

/**
 * Update UI controls to reflect current config values
 */
function syncEdgeGroupUI() {
  // Deterministic controls
  const detEnabled = document.getElementById('deterministicEnabled');
  const detDist = document.getElementById('deterministicDist');
  const detStrength = document.getElementById('deterministicStrength');
  const detOpacity = document.getElementById('deterministicOpacity');
  const detWidth = document.getElementById('deterministicWidth');
  const detRepulsion = document.getElementById('deterministicRepulsion');
  const detColor = document.getElementById('deterministicColor');
  const detGlow = document.getElementById('deterministicGlow');
  const detControls = document.getElementById('deterministicControls');

  // Value display elements
  const detDistVal = document.getElementById('detDistVal');
  const detStrengthVal = document.getElementById('detStrengthVal');
  const detOpacityVal = document.getElementById('detOpacityVal');
  const detWidthVal = document.getElementById('detWidthVal');
  const detRepulsionVal = document.getElementById('detRepulsionVal');

  if (detEnabled) detEnabled.checked = config.edgeGroups.deterministic.enabled;
  if (detDist) detDist.value = config.edgeGroups.deterministic.distance;
  if (detStrength) detStrength.value = config.edgeGroups.deterministic.strength;
  if (detOpacity) detOpacity.value = config.edgeGroups.deterministic.opacity;
  if (detWidth) detWidth.value = config.edgeGroups.deterministic.width;
  if (detRepulsion) detRepulsion.value = config.edgeGroups.deterministic.repulsion;
  if (detColor) detColor.value = config.edgeGroups.deterministic.color;
  if (detGlow) detGlow.checked = config.edgeGroups.deterministic.glowEnabled;
  if (detControls) detControls.style.opacity = config.edgeGroups.deterministic.enabled ? '1' : '0.5';

  // Sync value displays
  if (detDistVal) detDistVal.textContent = config.edgeGroups.deterministic.distance;
  if (detStrengthVal) detStrengthVal.textContent = config.edgeGroups.deterministic.strength;
  if (detOpacityVal) detOpacityVal.textContent = config.edgeGroups.deterministic.opacity;
  if (detWidthVal) detWidthVal.textContent = config.edgeGroups.deterministic.width;
  if (detRepulsionVal) detRepulsionVal.textContent = config.edgeGroups.deterministic.repulsion;

  // Semantic controls
  const semEnabled = document.getElementById('semanticEnabled');
  const semDist = document.getElementById('semanticDist');
  const semStrength = document.getElementById('semanticStrength');
  const semOpacity = document.getElementById('semanticOpacity');
  const semWidth = document.getElementById('semanticWidth');
  const semRepulsion = document.getElementById('semanticRepulsion');
  const semColor = document.getElementById('semanticColor');
  const semGlow = document.getElementById('semanticGlow');
  const semControls = document.getElementById('semanticControls');

  // Value display elements
  const semDistVal = document.getElementById('semDistVal');
  const semStrengthVal = document.getElementById('semStrengthVal');
  const semOpacityVal = document.getElementById('semOpacityVal');
  const semWidthVal = document.getElementById('semWidthVal');
  const semRepulsionVal = document.getElementById('semRepulsionVal');

  if (semEnabled) semEnabled.checked = config.edgeGroups.semantic.enabled;
  if (semDist) semDist.value = config.edgeGroups.semantic.distance;
  if (semStrength) semStrength.value = config.edgeGroups.semantic.strength;
  if (semOpacity) semOpacity.value = config.edgeGroups.semantic.opacity;
  if (semWidth) semWidth.value = config.edgeGroups.semantic.width;
  if (semRepulsion) semRepulsion.value = config.edgeGroups.semantic.repulsion;
  if (semColor) semColor.value = config.edgeGroups.semantic.color;
  if (semGlow) semGlow.checked = config.edgeGroups.semantic.glowEnabled;
  if (semControls) semControls.style.opacity = config.edgeGroups.semantic.enabled ? '1' : '0.5';

  // Sync value displays
  if (semDistVal) semDistVal.textContent = config.edgeGroups.semantic.distance;
  if (semStrengthVal) semStrengthVal.textContent = config.edgeGroups.semantic.strength;
  if (semOpacityVal) semOpacityVal.textContent = config.edgeGroups.semantic.opacity;
  if (semWidthVal) semWidthVal.textContent = config.edgeGroups.semantic.width;
  if (semRepulsionVal) semRepulsionVal.textContent = config.edgeGroups.semantic.repulsion;
}

/**
 * Apply preset to edge group config
 */
function applyEdgeGroupPreset(presetName) {
  const preset = EDGE_GROUP_PRESETS[presetName];
  if (!preset) return;

  // Apply preset values to config
  Object.assign(config.edgeGroups.deterministic, preset.deterministic);
  Object.assign(config.edgeGroups.semantic, preset.semantic);

  // Sync UI to new values
  syncEdgeGroupUI();

  // Update visuals and physics
  updateEdgeVisuals();
  restartSimulationWithEdgeGroups();

  // Visual feedback on preset buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.style.transform = btn.dataset.preset === presetName ? 'scale(1.05)' : 'scale(1)';
    btn.style.boxShadow = btn.dataset.preset === presetName ? '0 0 8px currentColor' : 'none';
  });

  // Reset visual feedback after animation
  setTimeout(() => {
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.style.transform = 'scale(1)';
      btn.style.boxShadow = 'none';
    });
  }, 300);
}

/**
 * Update link visuals without restarting simulation
 */
function updateEdgeVisuals() {
  if (!link) return;

  link
    .attr('opacity', d => {
      const group = getEdgeGroup(d.type || 'embedding');
      if (!config.edgeGroups[group].enabled) return 0;
      return getLinkOpacity(d);
    })
    .attr('stroke-width', d => getLinkWidthByGroup(d))
    .attr('stroke-dasharray', d => getLinkDashArray(d))
    .attr('stroke', d => {
      const group = getEdgeGroup(d.type || 'embedding');
      return config.edgeGroups[group].color;
    })
    .attr('filter', d => {
      const group = getEdgeGroup(d.type || 'embedding');
      return config.edgeGroups[group].glowEnabled ? 'url(#edgeGlow)' : 'none';
    });
}

/**
 * Restart simulation with updated edge group physics
 */
function restartSimulationWithEdgeGroups() {
  if (!simulation || !links) return;

  // Filter links by enabled state
  const visibleLinks = links.filter(d => {
    const type = d.type || 'embedding';
    const group = getEdgeGroup(type);
    if (!config.edgeGroups[group].enabled) return false;
    return config.visibleEdgeTypes[type] !== false;
  });

  // Update link force with new physics
  simulation.force('link')
    .links(visibleLinks)
    .distance(d => getLinkDistance(d))
    .strength(d => getLinkStrength(d));

  // Compute blended repulsion
  const deterministicLinks = visibleLinks.filter(d => getEdgeGroup(d.type || 'embedding') === 'deterministic');
  const deterministicRatio = deterministicLinks.length / (visibleLinks.length || 1);
  const blendedRepulsion = config.edgeGroups.deterministic.repulsion * deterministicRatio +
                          config.edgeGroups.semantic.repulsion * (1 - deterministicRatio);

  // Update charge force
  simulation.force('charge').strength(blendedRepulsion);

  // Reheat and restart
  simulation.alpha(0.3).restart();

  // Update link selection with new data
  if (linkGroup) {
    link = linkGroup.selectAll('line')
      .data(visibleLinks, d => `${d.source.index || d.source}-${d.target.index || d.target}`);

    link.exit().remove();

    const linkEnter = link.enter().append('line')
      .attr('class', 'link');

    link = linkEnter.merge(link);
    updateEdgeVisuals();
  }
}

/**
 * Setup edge group panel handlers
 */
function setupEdgeGroupHandlers() {
  const edgeGroupsPanel = document.getElementById('edgeGroups');
  const closeEdgeGroups = document.getElementById('closeEdgeGroups');
  const edgeGroupsBtn = document.getElementById('edgeGroupsBtn');

  // Toggle button
  if (edgeGroupsBtn) {
    edgeGroupsBtn.onclick = () => {
      const show = edgeGroupsPanel.style.display === 'none';
      edgeGroupsPanel.style.display = show ? 'block' : 'none';
      edgeGroupsBtn.classList.toggle('active', show);
    };
  }

  // Close button
  if (closeEdgeGroups) {
    closeEdgeGroups.onclick = () => {
      if (edgeGroupsPanel) edgeGroupsPanel.style.display = 'none';
      if (edgeGroupsBtn) edgeGroupsBtn.classList.remove('active');
    };
  }

  // === DETERMINISTIC GROUP HANDLERS ===

  const detEnabled = document.getElementById('deterministicEnabled');
  const detControls = document.getElementById('deterministicControls');
  if (detEnabled) {
    detEnabled.onchange = (e) => {
      config.edgeGroups.deterministic.enabled = e.target.checked;
      if (detControls) detControls.style.opacity = e.target.checked ? '1' : '0.5';
      updateEdgeVisuals();
      restartSimulationWithEdgeGroups();
    };
  }

  const detDist = document.getElementById('deterministicDist');
  const detDistVal = document.getElementById('detDistVal');
  if (detDist) {
    detDist.oninput = (e) => {
      config.edgeGroups.deterministic.distance = parseInt(e.target.value);
      if (detDistVal) detDistVal.textContent = e.target.value;
      restartSimulationWithEdgeGroups();
    };
  }

  const detStrength = document.getElementById('deterministicStrength');
  const detStrengthVal = document.getElementById('detStrengthVal');
  if (detStrength) {
    detStrength.oninput = (e) => {
      config.edgeGroups.deterministic.strength = parseFloat(e.target.value);
      if (detStrengthVal) detStrengthVal.textContent = e.target.value;
      restartSimulationWithEdgeGroups();
    };
  }

  const detOpacity = document.getElementById('deterministicOpacity');
  const detOpacityVal = document.getElementById('detOpacityVal');
  if (detOpacity) {
    detOpacity.oninput = (e) => {
      config.edgeGroups.deterministic.opacity = parseFloat(e.target.value);
      if (detOpacityVal) detOpacityVal.textContent = e.target.value;
      updateEdgeVisuals();
    };
  }

  const detWidth = document.getElementById('deterministicWidth');
  const detWidthVal = document.getElementById('detWidthVal');
  if (detWidth) {
    detWidth.oninput = (e) => {
      config.edgeGroups.deterministic.width = parseFloat(e.target.value);
      if (detWidthVal) detWidthVal.textContent = e.target.value;
      updateEdgeVisuals();
    };
  }

  const detRepulsion = document.getElementById('deterministicRepulsion');
  const detRepulsionVal = document.getElementById('detRepulsionVal');
  if (detRepulsion) {
    detRepulsion.oninput = (e) => {
      config.edgeGroups.deterministic.repulsion = parseInt(e.target.value);
      if (detRepulsionVal) detRepulsionVal.textContent = e.target.value;
      restartSimulationWithEdgeGroups();
    };
  }

  const detColor = document.getElementById('deterministicColor');
  if (detColor) {
    detColor.oninput = (e) => {
      config.edgeGroups.deterministic.color = e.target.value;
      updateEdgeVisuals();
    };
  }

  const detGlow = document.getElementById('deterministicGlow');
  if (detGlow) {
    detGlow.onchange = (e) => {
      config.edgeGroups.deterministic.glowEnabled = e.target.checked;
      updateEdgeVisuals();
    };
  }

  // === SEMANTIC GROUP HANDLERS ===

  const semEnabled = document.getElementById('semanticEnabled');
  const semControls = document.getElementById('semanticControls');
  if (semEnabled) {
    semEnabled.onchange = (e) => {
      config.edgeGroups.semantic.enabled = e.target.checked;
      if (semControls) semControls.style.opacity = e.target.checked ? '1' : '0.5';
      updateEdgeVisuals();
      restartSimulationWithEdgeGroups();
    };
  }

  const semDist = document.getElementById('semanticDist');
  const semDistVal = document.getElementById('semDistVal');
  if (semDist) {
    semDist.oninput = (e) => {
      config.edgeGroups.semantic.distance = parseInt(e.target.value);
      if (semDistVal) semDistVal.textContent = e.target.value;
      restartSimulationWithEdgeGroups();
    };
  }

  const semStrength = document.getElementById('semanticStrength');
  const semStrengthVal = document.getElementById('semStrengthVal');
  if (semStrength) {
    semStrength.oninput = (e) => {
      config.edgeGroups.semantic.strength = parseFloat(e.target.value);
      if (semStrengthVal) semStrengthVal.textContent = e.target.value;
      restartSimulationWithEdgeGroups();
    };
  }

  const semOpacity = document.getElementById('semanticOpacity');
  const semOpacityVal = document.getElementById('semOpacityVal');
  if (semOpacity) {
    semOpacity.oninput = (e) => {
      config.edgeGroups.semantic.opacity = parseFloat(e.target.value);
      if (semOpacityVal) semOpacityVal.textContent = e.target.value;
      updateEdgeVisuals();
    };
  }

  const semWidth = document.getElementById('semanticWidth');
  const semWidthVal = document.getElementById('semWidthVal');
  if (semWidth) {
    semWidth.oninput = (e) => {
      config.edgeGroups.semantic.width = parseFloat(e.target.value);
      if (semWidthVal) semWidthVal.textContent = e.target.value;
      updateEdgeVisuals();
    };
  }

  const semRepulsion = document.getElementById('semanticRepulsion');
  const semRepulsionVal = document.getElementById('semRepulsionVal');
  if (semRepulsion) {
    semRepulsion.oninput = (e) => {
      config.edgeGroups.semantic.repulsion = parseInt(e.target.value);
      if (semRepulsionVal) semRepulsionVal.textContent = e.target.value;
      restartSimulationWithEdgeGroups();
    };
  }

  const semColor = document.getElementById('semanticColor');
  if (semColor) {
    semColor.oninput = (e) => {
      config.edgeGroups.semantic.color = e.target.value;
      updateEdgeVisuals();
    };
  }

  const semGlow = document.getElementById('semanticGlow');
  if (semGlow) {
    semGlow.onchange = (e) => {
      config.edgeGroups.semantic.glowEnabled = e.target.checked;
      updateEdgeVisuals();
    };
  }

  // === PRESET BUTTONS ===

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.onclick = () => {
      const preset = btn.dataset.preset;
      if (preset) applyEdgeGroupPreset(preset);
    };
  });

  // Initial sync
  syncEdgeGroupUI();
  updateEdgeGroupCounts();
}

init();
