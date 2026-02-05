/**
 * RuVector Three.js Visualization - Main Entry Point
 *
 * Initializes the Three.js renderer and connects to the data API.
 * Provides the same user experience as the D3 version but with WebGL performance.
 */

import { RuVectorRenderer } from './renderer/RuVectorRenderer';
import {
  type GraphData,
  type GraphNode,
  type GraphEdge,
  EdgeGroup,
  hexToRGB,
  PRESETS,
  ColorMode,
  SizeMode,
  getEdgeGroup,
  DOMAIN_COLORS,
  NODE_SOURCE_COLORS,
  NODE_SOURCE_COLORS_HEX,
  NODE_TYPE_LABELS,
  NODE_TYPE_ICONS
} from './config/Constants';
import {
  type Hyperedge,
  type NodePosition,
  createMemoryTypeHyperedges,
  createCategoryHyperedges
} from './renderer/HyperedgeRenderer';
import { ViewModeController, type ViewMode } from './ui/ViewModeController';
import { HyperbolicProjection } from './projection/HyperbolicProjection';
import { GeodesicComputer } from './projection/GeodesicComputer';
import { PoincareDiskRenderer } from './renderer/PoincareDiskRenderer';
import { GeodesicEdgeRenderer } from './renderer/GeodesicEdgeRenderer';
import { RewardPotentialField } from './temporal/RewardPotentialField';
import { GeodesicIntegrator } from './temporal/GeodesicIntegrator';
import { PotentialSurfaceRenderer } from './renderer/PotentialSurfaceRenderer';
import { PersistentHomology } from './topology/PersistentHomology';
import { KnowledgeGapDetector } from './topology/KnowledgeGapDetector';
import { TopologyRenderer } from './renderer/TopologyRenderer';
// DreamRenderer removed - dream mode deprecated
import { PulseRenderer } from './renderer/PulseRenderer';
import {
  TrajectoryTimeline,
  LearningDashboard,
  SessionAnalytics,
  SystemHealthPanel,
  SystemValidationPanel,
  RewardFieldConnector
} from './panels/DashboardPanels';
import { LearningPulsePanel } from './panels/LearningPulsePanel';
import { SonaAttentionPanel } from './panels/SonaAttentionPanel';
import { EmbeddingExplorer3D } from './panels/EmbeddingExplorer3D';
// Self-Learning V3 Panels
import {
  LearningVelocityPanel,
  SONACompressionPanel,
  TrajectoryFlowPanel,
  EmbeddingScatterPanel,
  HookTimelinePanel,
  AgentCoordinationPanel,
  MemorySearchMetricsPanel,
} from './panels/learning';
import * as d3 from 'd3';

// ═══════════════════════════════════════════════════════════════════════════
// SAFE NUMBER UTILITIES - Prevent NaN/null/0 display issues
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Safe number conversion with fallback
 */
const safeNum = (v: unknown, f: number = 0): number =>
  v == null || typeof v !== 'number' || !Number.isFinite(v) ? f : v;

/**
 * Safe percentage string with division-by-zero protection
 */
const safePct = (n: number, d: number): string =>
  d === 0 ? '0%' : `${Math.round(100 * safeNum(n) / safeNum(d, 1))}%`;

/**
 * Safe string conversion for display
 */
const safeStr = (v: unknown, f: string = '-'): string =>
  v == null || (typeof v === 'number' && !Number.isFinite(v)) ? f : String(v);

/**
 * Safe toFixed with null/NaN protection
 */
const safeFixed = (v: unknown, decimals: number = 2, fallback: string = '-'): string => {
  if (v == null || typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return v.toFixed(decimals);
};

// ═══════════════════════════════════════════════════════════════════════════
// MULTI-DIMENSIONAL VISUALIZATION STATE
// ═══════════════════════════════════════════════════════════════════════════

// Poincaré mode state
let hyperbolicProjection: HyperbolicProjection | null = null;
let geodesicComputer: GeodesicComputer | null = null;
let poincareDiskRenderer: PoincareDiskRenderer | null = null;
let geodesicEdgeRenderer: GeodesicEdgeRenderer | null = null;
let poincarePositions: { x: number; y: number }[] = [];

// Temporal spacetime state
let rewardPotentialField: RewardPotentialField | null = null;
let geodesicIntegrator: GeodesicIntegrator | null = null;
let potentialSurfaceRenderer: PotentialSurfaceRenderer | null = null;

// TDA state
let persistentHomology: PersistentHomology | null = null;
let knowledgeGapDetector: KnowledgeGapDetector | null = null;
let topologyRenderer: TopologyRenderer | null = null;

// Pulse mode state
let pulseRenderer: PulseRenderer | null = null;
let pulseAnimateCallback: ((dt: number) => void) | null = null;

// Global state
let renderer: RuVectorRenderer | null = null;
let graphData: GraphData | null = null;
let nodeTypeConfig: Record<string, any> | null = null;
let simulationRunning = false;
let forceSimulation: d3.Simulation<GraphNode, undefined> | null = null;
let viewModeController: ViewModeController | null = null;

// UI State
let currentColorMode: ColorMode = ColorMode.NAMESPACE;
let currentSizeMode: SizeMode = SizeMode.CONNECTIVITY;

// Legend filter state - tracks which legend items are active
let legendFilterState: Map<string, boolean> = new Map();

// Track "other" namespaces not in the legend (for filtering)
let otherNamespaces: Set<string> = new Set();

// Edge type visibility state - tracks which edge types are ENABLED (affects physics)
let edgeTypeVisibility: Map<string, boolean> = new Map();

// Edge type legend visibility - tracks which edge types are SHOWN (visual only)
let edgeTypeLegendVisible: Map<string, boolean> = new Map();

// Node node type visibility state - tracks which node types are ENABLED (affects physics)
let sourceTypeEnabled: Map<string, boolean> = new Map();

// node types hidden by default in graph view
// Note: q_pattern, state, action, trajectory are excluded server-side (not in graph data)
const HIDDEN_BY_DEFAULT_SOURCES = new Set<string>();

// Memory namespaces hidden by default (low-signal noise per backend analysis)
// - edit: near-identical "successful edit" strings, dense meaningless cluster (~625 noise edges)
// - command: generic "npm test succeeded" strings
// - file_access, search_pattern, agent_spawn: raw event log entries
// - one-offs: test/debug artifacts with no semantic value
const HIDDEN_BY_DEFAULT_NAMESPACES = new Set<string>([
  // All visible by default — user can hide via settings and save as preset
]);

// Template agent IDs (routing labels, not real topology nodes)
const TEMPLATE_AGENT_IDS = new Set([
  'agent:claude', 'agent:coder', 'agent:tester', 'agent:detective'
]);

// Namespace-level visibility state (for memory sub-type filtering)
let namespaceEnabled: Map<string, boolean> = new Map();

// Edge group enabled state - tracks whether deterministic/semantic groups are enabled (affects physics)
// Start disabled to let layout settle, then enable after animation
let edgeGroupEnabled = {
  deterministic: false,
  semantic: false
};

// Store original UMAP positions so we can restore them when going back to 2D
let originalPositions: { x: number; y: number }[] | null = null;

// Store UMAP center for 3D calculations
let umapCenter: { x: number; y: number } = { x: 0, y: 0 };

// Store 2D simulation positions separately from 3D display positions
// This allows the simulation to run in 2D while displaying in 3D
let sim2DPositions: { x: number; y: number }[] = [];

// Extended mode re-apply tracking:
// When physics params change while in an extended mode (poincare, spacetime, tda),
// the force simulation runs in the background but the visual doesn't update because
// these modes use their own static projections. This flag + timer ensure that once
// the simulation settles, the current mode is re-applied so the new layout is visible.
let _extendedModeReapplyDone = false;
let _extendedModeReapplyTimer: ReturnType<typeof setTimeout> | null = null;

// Modes that use fixed projections (not updated by simulation tick)
const EXTENDED_MODES: ViewMode[] = ['poincare', 'spacetime', 'tda'];

function isExtendedMode(mode: ViewMode | undefined): boolean {
  return !!mode && EXTENDED_MODES.includes(mode);
}

/**
 * Schedule a deferred re-apply of the current extended view mode.
 * Called after the simulation is reheated (physics params change, data refresh, etc.)
 * while an extended mode is active. Uses a debounced timer so we only re-apply once
 * after the simulation has had time to settle.
 */
function scheduleExtendedModeReapply(): void {
  const currentMode = viewModeController?.getMode();
  if (!currentMode || !isExtendedMode(currentMode)) return;

  // Clear any pending timer
  if (_extendedModeReapplyTimer) {
    clearTimeout(_extendedModeReapplyTimer);
    _extendedModeReapplyTimer = null;
  }

  // Reset the "done" flag so the tick handler can trigger a re-apply
  _extendedModeReapplyDone = false;
}

// ═══════════════════════════════════════════════════════════════════════════
// NODE TYPE NORMALIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize a node source string to its base type.
 * Maps trajectory_success/trajectory_failed → trajectory so that
 * filters, counts, and renderer visibility all use the same key.
 */
function normalizeSourceType(source: string): string {
  if (source === 'trajectory_success' || source === 'trajectory_failed') return 'trajectory';
  return source;
}

// ═══════════════════════════════════════════════════════════════════════════
// RADIAL TARGET MATCHING (used by both 2D physics and 3D layout)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a node matches the radial target criteria
 * Used for "push to outer ring" in 2D and "push to surface" in 3D
 */
function matchesRadialTarget(node: GraphNode, target: string): boolean {
  // By node type (normalize trajectory variants)
  if (target === 'memory' || target === 'neural_pattern' || target === 'q_pattern' || target === 'trajectory'
      || target === 'file' || target === 'state' || target === 'action' || target === 'agent') {
    return normalizeSourceType(node.source) === target;
  }

  // By memory type (memtype:xxx)
  if (target.startsWith('memtype:')) {
    const memType = target.slice(8);
    return node.memoryType === memType || node.namespace === memType;
  }

  // By domain (domain:xxx)
  if (target.startsWith('domain:')) {
    const domain = target.slice(7);
    return node.domain === domain;
  }

  // By category (category:xxx) - neural patterns
  if (target.startsWith('category:')) {
    const category = target.slice(9);
    return node.category === category;
  }

  // By quality metrics
  if (target.startsWith('quality:')) {
    const qualType = target.slice(8);
    if (qualType === 'high_confidence') return node.source === 'neural_pattern' && (node.confidence || 0) > 0.9;
    if (qualType === 'low_confidence') return node.source === 'neural_pattern' && (node.confidence || 0) < 0.7;
    if (qualType === 'high_qvalue') return node.source === 'q_pattern' && (node.qValue || 0) > 0.7;
    if (qualType === 'low_qvalue') return node.source === 'q_pattern' && (node.qValue || 0) < 0.4;
    if (qualType === 'successful') return normalizeSourceType(node.source) === 'trajectory' && node.success === true;
    if (qualType === 'failed') return normalizeSourceType(node.source) === 'trajectory' && node.success === false;
  }

  // By agent (agent:dynamic collects all unique agents)
  if (target.startsWith('agent:')) {
    return normalizeSourceType(node.source) === 'trajectory' && !!node.agent;
  }

  // By connectivity
  if (target === 'high_connectivity') return (node.connectionCount || 0) > 10;
  if (target === 'low_connectivity') return (node.connectionCount || 0) < 3;
  if (target === 'isolated') return (node.connectionCount || 0) <= 1;

  // By embedding status
  if (target === 'has_embedding') return node.hasEmbedding === true;
  if (target === 'no_embedding') return node.hasEmbedding === false;

  // By temporal
  if (target.startsWith('temporal:') && node.timestamp) {
    const temporalType = target.slice(9);
    const nodeTime = new Date(node.timestamp).getTime();
    const now = Date.now();
    if (temporalType === 'recent') return nodeTime > now - 24 * 60 * 60 * 1000;
    if (temporalType === 'week') return nodeTime > now - 7 * 24 * 60 * 60 * 1000 && nodeTime <= now - 24 * 60 * 60 * 1000;
    if (temporalType === 'older') return nodeTime <= now - 7 * 24 * 60 * 60 * 1000;
  }

  return false;
}

/**
 * Recalculate 3D positions when settings change (radial target, strength, etc.)
 * Only does anything if currently in 3D mode
 * Uses sim2DPositions (current simulation state) when available, falling back to originalPositions
 */
function recalculate3DPositions(): void {
  if (!viewModeController || !graphData || !renderer) return;
  if (viewModeController.getMode() !== '3d') return;

  // Use current simulation positions if available, fall back to original UMAP positions
  const useSimPositions = sim2DPositions.length >= graphData.nodes.length;
  if (!useSimPositions && !originalPositions) return;

  const radialTarget = (simParams as any).radialTarget || 'none';
  const radialStrength = (simParams as any).radialStrength || 0.5;

  // Calculate center of the 2D positions we'll use
  const positions = useSimPositions ? sim2DPositions : originalPositions!;
  let sumX = 0, sumY = 0;
  for (const pos of positions) {
    sumX += pos.x;
    sumY += pos.y;
  }
  const centerX = sumX / positions.length;
  const centerY = sumY / positions.length;

  // Update spatial bounds for proper spherical projection
  viewModeController.updateSpatialBoundsFromPositions(positions);

  // Recalculate 3D positions
  for (let i = 0; i < graphData.nodes.length; i++) {
    const node = graphData.nodes[i];
    const pos2D = positions[i];

    // Check if this node should be pushed to outer surface
    const pushToSurface = radialTarget !== 'none' && matchesRadialTarget(node, radialTarget);

    const pos3D = viewModeController.getNode3DPosition(
      node, i, pos2D.x, pos2D.y, centerX, centerY,
      pushToSurface, radialStrength
    );
    node.x = pos3D.x;
    node.y = pos3D.y;
    node.z = pos3D.z;
  }

  // Update renderers
  renderer.getNodeRenderer().updatePositions(graphData.nodes);
  renderer.getNodeRenderer().setViewMode('3d'); // Refresh 3D mesh
  renderer.getEdgeRenderer().updatePositions(graphData.nodes);

  // Restore 2D positions for simulation continuity
  for (let i = 0; i < graphData.nodes.length; i++) {
    const node = graphData.nodes[i];
    const pos2D = positions[i];
    node.x = pos2D.x;
    node.y = pos2D.y;
    node.z = 0;
  }

  console.log(`3D positions recalculated (target: ${radialTarget}, strength: ${radialStrength})`);
}

/**
 * Update 3D display from simulation tick.
 * This is called on each simulation tick when in 3D mode.
 *
 * The simulation runs in 2D space (modifying node.x, node.y).
 * We transform those 2D positions to 3D spherical coordinates for display,
 * then restore 2D positions for the next simulation tick.
 *
 * This solves the architectural conflict: simulation expects 2D, display needs 3D.
 */
function update3DFromSimulation(): void {
  if (!viewModeController || !graphData || !renderer) return;
  if (viewModeController.getMode() !== '3d') return;

  const radialTarget = (simParams as any).radialTarget || 'none';
  const radialStrength = (simParams as any).radialStrength || 0.5;

  // Step 1: Save current positions as the 2D simulation state
  // The simulation has just modified node.x, node.y with 2D force calculations
  for (let i = 0; i < graphData.nodes.length; i++) {
    const node = graphData.nodes[i];
    if (!sim2DPositions[i]) {
      sim2DPositions[i] = { x: 0, y: 0 };
    }
    sim2DPositions[i].x = node.x || 0;
    sim2DPositions[i].y = node.y || 0;
  }

  // Step 2: Calculate center of current 2D positions
  let sumX = 0, sumY = 0;
  for (const pos of sim2DPositions) {
    sumX += pos.x;
    sumY += pos.y;
  }
  const centerX = sumX / sim2DPositions.length;
  const centerY = sumY / sim2DPositions.length;

  // Step 3: Update spatial bounds for proper spherical projection
  viewModeController.updateSpatialBoundsFromPositions(sim2DPositions);

  // Step 4: Transform 2D positions to 3D spherical coordinates
  for (let i = 0; i < graphData.nodes.length; i++) {
    const node = graphData.nodes[i];
    const pos2D = sim2DPositions[i];

    // Check if this node should be pushed to outer surface
    const pushToSurface = radialTarget !== 'none' && matchesRadialTarget(node, radialTarget);

    const pos3D = viewModeController.getNode3DPosition(
      node, i, pos2D.x, pos2D.y, centerX, centerY,
      pushToSurface, radialStrength
    );

    // Set 3D positions for rendering
    node.x = pos3D.x;
    node.y = pos3D.y;
    node.z = pos3D.z;
  }

  // Step 5: Update renderers with 3D positions
  renderer.getNodeRenderer().updatePositions(graphData.nodes);
  renderer.getEdgeRenderer().updatePositions(graphData.nodes);

  // Step 5.5: Update hyperedge hulls with current 3D positions
  // Must be done before restoring 2D positions
  updateHyperedgePositions();

  // Step 6: Restore 2D positions for next simulation tick
  // This is critical - the simulation needs 2D coordinates to work correctly
  for (let i = 0; i < graphData.nodes.length; i++) {
    const node = graphData.nodes[i];
    node.x = sim2DPositions[i].x;
    node.y = sim2DPositions[i].y;
    node.z = 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LOADING PROGRESS
// ═══════════════════════════════════════════════════════════════════════════

function updateLoadingProgress(percent: number, status: string): void {
  const progressBar = document.getElementById('loadingProgressBar');
  const statusEl = document.getElementById('loadingStatus');
  if (progressBar) progressBar.style.width = `${percent}%`;
  if (statusEl) statusEl.textContent = status;
}

/**
 * Show error message in loading screen with retry button
 */
function showLoadingError(message: string, details?: string): void {
  const loadingEl = document.getElementById('loading');
  const spinnerEl = loadingEl?.querySelector('.loading-spinner');
  const textEl = document.getElementById('loadingText');
  const progressEl = loadingEl?.querySelector('.loading-progress');
  const statusEl = document.getElementById('loadingStatus');

  // Hide spinner and progress bar
  if (spinnerEl) (spinnerEl as HTMLElement).style.display = 'none';
  if (progressEl) (progressEl as HTMLElement).style.display = 'none';

  // Show error icon and message
  if (textEl) {
    textEl.innerHTML = `<span style="color: #EF4444; font-size: 32px;">⚠</span><br><span style="color: #EF4444;">Error Loading Data</span>`;
  }

  // Show error details and retry button
  if (statusEl) {
    statusEl.innerHTML = `
      <div style="color: #EF4444; margin-bottom: 12px;">${message}</div>
      ${details ? `<div style="color: #9CA3AF; font-size: 11px; margin-bottom: 12px; max-width: 300px; word-break: break-word;">${details}</div>` : ''}
      <button id="retryLoadBtn" style="
        background: linear-gradient(135deg, #6B2FB5, #8B4FD9);
        color: white;
        border: none;
        padding: 8px 20px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        transition: transform 0.2s, box-shadow 0.2s;
      ">Retry</button>
    `;

    // Add retry handler
    const retryBtn = document.getElementById('retryLoadBtn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        // Reset loading UI
        if (spinnerEl) (spinnerEl as HTMLElement).style.display = 'block';
        if (progressEl) (progressEl as HTMLElement).style.display = 'block';
        if (textEl) textEl.textContent = 'Loading RuVector data...';
        if (statusEl) statusEl.textContent = 'Retrying...';
        updateLoadingProgress(5, 'Retrying connection...');

        // Retry loading
        loadData(true).catch(err => {
          console.error('Retry failed:', err);
          showLoadingError('Retry failed', err.message);
        });
      });

      retryBtn.addEventListener('mouseenter', () => {
        retryBtn.style.transform = 'scale(1.05)';
        retryBtn.style.boxShadow = '0 4px 12px rgba(107, 47, 181, 0.4)';
      });
      retryBtn.addEventListener('mouseleave', () => {
        retryBtn.style.transform = 'scale(1)';
        retryBtn.style.boxShadow = 'none';
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

async function init(): Promise<void> {
  console.log('Initializing RuVector Three.js Visualization...');
  updateLoadingProgress(5, 'Initializing WebGL renderer...');

  // Get container
  const container = document.getElementById('container');
  if (!container) {
    console.error('Container element not found');
    return;
  }

  // Create renderer
  renderer = new RuVectorRenderer({
    container,
    antialias: true
  });

  // Set up event handlers
  renderer.onHover(handleNodeHover);
  renderer.onClick(handleNodeClick);
  renderer.onTick(handleSimulationTick);
  renderer.onDrag(handleNodeDrag);
  renderer.onUnpin(handleNodeUnpin);

  // Per-frame mode-specific animation updates
  renderer.setOnAnimate((_deltaTime: number) => {
    const mode = viewModeController?.getMode();
    if (mode === 'tda' && topologyRenderer) {
      topologyRenderer.updateGapAnimation();
    }
  });

  updateLoadingProgress(10, 'Fetching graph data from server...');

  // Load data with error handling
  try {
    await loadData();
  } catch (error) {
    // Error already displayed by loadData
    console.error('Initialization stopped due to load error');
    return;
  }

  updateLoadingProgress(95, 'Starting renderer...');

  // Start rendering
  renderer.start();

  // Set up UI
  setupUI();

  // Apply settings: use saved preset if available, otherwise hardcoded defaults + animation
  const savedPresets = getPresets();
  if (savedPresets['__default__']) {
    applySettings(savedPresets['__default__'].settings);
    console.log('Restored saved default preset');
  } else {
    applyAllDefaults();
  }

  // Fit view after a short delay to let simulation settle
  setTimeout(() => renderer?.fitView(), 1500);

  updateLoadingProgress(100, 'Complete!');

  // Hide loading indicator with fade
  const loading = document.getElementById('loading');
  if (loading) {
    loading.style.transition = 'opacity 0.3s ease';
    loading.style.opacity = '0';
    setTimeout(() => { loading.style.display = 'none'; }, 300);
  }

  // Show controls
  const controls = document.getElementById('controls');
  if (controls) {
    controls.style.display = 'flex';
  }

  // Show info panel
  const info = document.getElementById('information');
  if (info) {
    info.style.display = 'block';
  }

  // Update stats display
  updateStatsDisplay();
  setInterval(updateStatsDisplay, 1000);

  console.log('Initialization complete');

  // Expose for external automation (Playwright, testing)
  (window as any).__switchToMode = (mode: string) => {
    if (!viewModeController || !renderer || !graphData) return 'not ready';
    viewModeController.setMode(mode as ViewMode);
    switchToMode(mode as ViewMode);
    return viewModeController.getMode();
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA LOADING
// ═══════════════════════════════════════════════════════════════════════════

async function loadData(forceRefresh = false): Promise<void> {
  try {
    const url = forceRefresh ? '/api/graph?refresh=true' : '/api/graph';
    updateLoadingProgress(15, 'Connecting to API server...');

    // Add timeout with AbortController (60 seconds - server edge computation can take 30s+)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        throw new Error('Timeout: Server did not respond within 60 seconds');
      }
      throw fetchError;
    }

    // Check response status
    if (!response.ok) {
      throw new Error(`Server error: ${response.status} ${response.statusText}`);
    }

    updateLoadingProgress(18, 'Fetching data from API...');

    // Track download progress
    const contentLength = response.headers.get('Content-Length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    let loaded = 0;
    const chunks: Uint8Array[] = [];
    const reader = response.body?.getReader();

    console.log(`[LoadData] Content-Length: ${total}, reader: ${!!reader}`);

    // Start progress animation for visual feedback during fetch
    let progressInterval: ReturnType<typeof setInterval> | null = null;
    let animatedPercent = 15;

    if (reader && total > 0) {
      // Stream with progress tracking (direct API access)
      let chunkCount = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        loaded += value.length;
        chunkCount++;

        const percent = Math.round((loaded / total) * 25) + 15; // 15-40%
        const loadedMB = (loaded / 1024 / 1024).toFixed(1);
        const totalMB = (total / 1024 / 1024).toFixed(1);
        const progressText = `Fetching data from API... ${loadedMB}/${totalMB} MB (${Math.round(loaded/total*100)}%)`;
        console.log(`[LoadData] Chunk ${chunkCount}: ${progressText}`);
        updateLoadingProgress(percent, progressText);
      }

      // Combine chunks and parse
      updateLoadingProgress(40, 'Parsing graph data...');
      const allChunks = new Uint8Array(loaded);
      let position = 0;
      for (const chunk of chunks) {
        allChunks.set(chunk, position);
        position += chunk.length;
      }
      const text = new TextDecoder().decode(allChunks);
      graphData = JSON.parse(text) as GraphData;
    } else {
      // Fallback: Vite proxy buffers response (no streaming)
      // Show animated progress while waiting
      progressInterval = setInterval(() => {
        animatedPercent = Math.min(animatedPercent + 1, 38);
        const dots = '.'.repeat((animatedPercent % 3) + 1);
        updateLoadingProgress(animatedPercent, `Fetching data from API${dots} (loading ~2MB)`);
      }, 150);

      try {
        graphData = await response.json() as GraphData;
      } finally {
        if (progressInterval) clearInterval(progressInterval);
      }
    }

    updateLoadingProgress(45, 'Processing graph data...');

    if (!graphData || !graphData.nodes) {
      throw new Error('Invalid graph data');
    }

    // Capture server SSOT node type configuration
    nodeTypeConfig = (graphData as any).nodeTypeConfig || null;
    if (nodeTypeConfig) {
      console.log(`[SSOT] Loaded nodeTypeConfig with ${Object.keys(nodeTypeConfig).length} types`);
    }

    console.log(`Loaded ${graphData.nodes.length} nodes, ${graphData.edges.length} edges`);
    updateLoadingProgress(50, `Loaded ${graphData.nodes.length.toLocaleString()} nodes, ${graphData.edges.length.toLocaleString()} edges`);

    // Set data in renderer
    if (renderer) {
      updateLoadingProgress(60, 'Building WebGL geometries...');
      renderer.setData(graphData);
    }

    // Initialize view mode controller
    viewModeController = new ViewModeController({
      maxDepth: 500,
      layerCount: 5,
      opacityFalloff: 0.5,
      sizeFalloff: 0.3
    });
    viewModeController.initialize(graphData.nodes);

    // Initialize force simulation
    updateLoadingProgress(75, 'Initializing force simulation...');
    initForceSimulation();

    // Initialize hyperedges (convex hulls for memory type groups)
    updateLoadingProgress(80, 'Creating hyperedge hulls...');
    initializeHyperedges();

    // Precompute min/max for color/size modes
    updateLoadingProgress(85, 'Computing node attributes...');
    computedMinMax = null;
    computeMinMax();

    // Update UI
    updateLoadingProgress(90, 'Updating UI components...');
    updateInfoPanel();
    updateTimeline();
    updateAllEdgeCounts();
    updateEdgeTypeCounts();
    updateColorLegend();

    // Update last refresh time
    const lastRefresh = document.getElementById('lastRefreshTime');
    if (lastRefresh) {
      lastRefresh.textContent = new Date().toLocaleTimeString();
    }

    // Fit view after refresh
    if (forceRefresh && renderer) {
      setTimeout(() => renderer?.fitView(), 1500);
    }

    // Re-apply current extended mode after data refresh.
    // loadData reinitializes the force simulation and renderers, so modes
    // like poincare/spacetime/tda need their projections recomputed.
    const currentModeAfterLoad = viewModeController?.getMode();
    if (currentModeAfterLoad && currentModeAfterLoad !== '2d') {
      setTimeout(() => {
        const mode = viewModeController?.getMode();
        if (mode && mode !== '2d') {
          console.log(`[loadData] Re-applying ${mode} mode after data refresh`);
          applyViewMode(mode);
        }
      }, 500);
    }

  } catch (error) {
    console.error('Failed to load graph data:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Determine user-friendly message
    let friendlyMessage = 'Failed to load visualization data';
    let details = errorMessage;

    if (errorMessage.includes('fetch') || errorMessage.includes('network') || errorMessage.includes('Failed to fetch')) {
      friendlyMessage = 'Cannot connect to server';
      details = 'Make sure the API server is running on port 3333';
    } else if (errorMessage.includes('JSON') || errorMessage.includes('parse')) {
      friendlyMessage = 'Invalid data received from server';
      details = 'The server response was not valid JSON';
    } else if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
      friendlyMessage = 'Connection timed out';
      details = 'The server took too long to respond';
    } else if (errorMessage.includes('Invalid graph data')) {
      friendlyMessage = 'No data available';
      details = 'The database may be empty or inaccessible';
    }

    showLoadingError(friendlyMessage, details);
    throw error; // Re-throw to prevent further initialization
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HYPEREDGE INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Initialize hyperedges (convex hulls) for memory type groups.
 * Creates hulls from API-provided hyperedges or generates them from node data.
 */
function initializeHyperedges(): void {
  if (!graphData || !renderer) return;

  // Build node positions map
  const nodePositions = buildNodePositionsMap();

  // Use hyperedges from API if available, otherwise generate from node data
  let hyperedges: Hyperedge[];

  if (graphData.hyperedges && graphData.hyperedges.length > 0) {
    // Convert API hyperedges to renderer format
    // Server sends members as node indices (numbers), convert to string IDs
    hyperedges = graphData.hyperedges.map(h => {
      // Get members - could be nodeIds (string[]) or members (number[])
      const rawMembers = (h as any).members || (h as any).nodeIds || [];

      // Convert numeric indices to string node IDs
      const memberIds: string[] = rawMembers.map((m: number | string) => {
        if (typeof m === 'number') {
          // It's a node index - get the node ID
          const node = graphData!.nodes[m];
          return node ? String(node.id) : String(m);
        }
        return String(m);
      });

      // Parse color - could be hex string like '#3498DB' or number
      let colorStr = '#7F8C8D';
      const rawColor = (h as any).color;
      if (rawColor) {
        if (typeof rawColor === 'string') {
          colorStr = rawColor.startsWith('#') ? rawColor : `#${rawColor}`;
        } else if (typeof rawColor === 'number') {
          colorStr = `#${rawColor.toString(16).padStart(6, '0')}`;
        }
      }

      return {
        id: h.id,
        type: (h.type === 'memory_type' ? 'memory_group' :
               h.type === 'category' ? 'category_group' :
               h.type === 'memory_group' ? 'memory_group' :
               h.type === 'source_group' ? 'memory_group' :
               'memory_group') as 'memory_group' | 'category_group' | 'agent_group',
        label: h.label,
        members: memberIds,
        color: colorStr
      };
    });
    console.log(`Using ${hyperedges.length} hyperedges from API`);
  } else {
    // Generate hyperedges from node memory types
    const memoryHyperedges = createMemoryTypeHyperedges(
      graphData.nodes.map(n => ({
        id: String(n.id),
        memoryType: n.memoryType || n.namespace
      }))
    );

    // Also generate from categories (for neural patterns)
    const categoryHyperedges = createCategoryHyperedges(
      graphData.nodes.map(n => ({
        id: String(n.id),
        category: n.category
      }))
    );

    hyperedges = [...memoryHyperedges, ...categoryHyperedges];
    console.log(`Generated ${hyperedges.length} hyperedges (${memoryHyperedges.length} memory, ${categoryHyperedges.length} category)`);
  }

  // Create convex hulls
  renderer.setHyperedges(hyperedges, nodePositions);

  const hullCount = renderer.getHyperedgeRenderer().getHullCount();
  console.log(`HyperedgeRenderer: Created ${hullCount} convex hulls`);
}

/**
 * Build a Map of node ID to position for hyperedge rendering.
 */
function buildNodePositionsMap(): Map<string, NodePosition> {
  const nodePositions = new Map<string, NodePosition>();

  if (!graphData) return nodePositions;

  for (const node of graphData.nodes) {
    nodePositions.set(String(node.id), {
      x: node.x ?? 0,
      y: node.y ?? 0,
      z: node.z ?? 0
    });
  }

  return nodePositions;
}

/**
 * Update hyperedge hull positions when nodes move.
 * Called on each simulation tick.
 */
function updateHyperedgePositions(): void {
  if (!graphData || !renderer) return;

  const nodePositions = buildNodePositionsMap();
  renderer.updateHyperedgePositions(nodePositions);
}

// ═══════════════════════════════════════════════════════════════════════════
// FORCE SIMULATION
// ═══════════════════════════════════════════════════════════════════════════

function initForceSimulation(): void {
  if (!graphData) return;

  // Import d3-force dynamically (it's already in the page via CDN)
  const d3 = (window as any).d3;
  if (!d3) {
    console.warn('D3 not available, running without force simulation');
    return;
  }

  // Create simulation
  forceSimulation = d3.forceSimulation(graphData.nodes)
    .force('charge', d3.forceManyBody().strength(-80))
    .force('link', d3.forceLink(graphData.edges)
      .id((d: GraphNode) => d.nodeIndex)
      .distance(80)
      .strength(0.5))
    .force('centerX', d3.forceX(0).strength(0.05))
    .force('centerY', d3.forceY(0).strength(0.05))
    .force('collision', d3.forceCollide().radius(15))
    .alphaDecay(0.05)
    .velocityDecay(0.3)
    .on('tick', () => {
      if (!renderer || !graphData) return;

      const currentMode = viewModeController?.getMode();

      if (currentMode === '3d') {
        // In 3D mode, transform current simulation positions to spherical coordinates
        // This makes the 3D visualization "live" - it responds to simulation changes
        update3DFromSimulation();
      } else if (isExtendedMode(currentMode)) {
        // Extended modes (poincare, spacetime, tda)
        // use their own static projections. The simulation still updates node.x/y but
        // these positions are not reflected in the mode-specific renderers.
        // Once the simulation settles (alpha < 0.05), re-apply the current mode once
        // so the new force layout is projected into the mode-specific visualization.
        if (!_extendedModeReapplyDone && forceSimulation && forceSimulation.alpha() < 0.05) {
          _extendedModeReapplyDone = true;
          // Use a short delay to batch any final position changes
          if (_extendedModeReapplyTimer) clearTimeout(_extendedModeReapplyTimer);
          _extendedModeReapplyTimer = setTimeout(() => {
            _extendedModeReapplyTimer = null;
            const mode = viewModeController?.getMode();
            if (mode && isExtendedMode(mode)) {
              console.log(`[tick] Simulation settled in ${mode} mode, re-applying projection`);
              applyViewMode(mode);
            }
          }, 200);
        }
      } else {
        // In 2D/2.5D mode, use simulation positions directly
        renderer.updateNodePositions(graphData.nodes);
      }

      // Update hyperedge hulls with new node positions
      updateHyperedgePositions();
    });

  // Initially run the simulation
  simulationRunning = true;

  console.log('Force simulation initialized');

  // Apply initial cluster separation settings (radial force, etc.)
  // This applies the default simParams including radial force for cluster separation
  updateForceSimulationParams();
}

function toggleSimulation(): void {
  if (!forceSimulation) return;

  if (simulationRunning) {
    forceSimulation.stop();
    simulationRunning = false;
  } else {
    forceSimulation.alpha(0.3).restart();
    simulationRunning = true;
  }

  // Update button state
  const simBtn = document.getElementById('simBtn');
  if (simBtn) {
    simBtn.classList.toggle('active', simulationRunning);
    simBtn.textContent = simulationRunning ? 'Pause Sim' : 'Resume Sim';
  }
}

/**
 * Toggle hyperedge hull visibility
 */
function toggleHyperedgeVisibility(): void {
  if (!renderer) return;

  const hyperedgeRenderer = renderer.getHyperedgeRenderer();
  const hullCount = hyperedgeRenderer.getHullCount();

  if (hullCount === 0) {
    console.log('No hyperedge hulls to toggle');
    return;
  }

  // Get current visibility by checking first hull
  const firstHullId = hyperedgeRenderer.getHullIds()[0];
  const hull = hyperedgeRenderer.getHull(firstHullId);
  const isCurrentlyVisible = hull?.mesh?.visible ?? true;

  hyperedgeRenderer.setVisible(!isCurrentlyVisible);

  // Update button state
  const btn = document.getElementById('hyperedgeBtn');
  if (btn) {
    btn.classList.toggle('active', !isCurrentlyVisible);
    btn.textContent = !isCurrentlyVisible ? 'Hide Hulls' : 'Show Hulls';
  }

  console.log(`Hyperedge hulls: ${!isCurrentlyVisible ? 'visible' : 'hidden'} (${hullCount} hulls)`);
}

// ═══════════════════════════════════════════════════════════════════════════
// VIEW MODE (2D/3D TOGGLE)
// ═══════════════════════════════════════════════════════════════════════════

function switchToMode(targetMode: ViewMode): void {
  if (!renderer || !viewModeController || !graphData) return;
  viewModeController.setMode(targetMode);
  applyViewMode(targetMode);
}

// ═══════════════════════════════════════════════════════════════════════════
// VISIBILITY HELPERS - shared by applySourceTypeFilters & extended modes
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute the set of node indices that are currently enabled by the
 * source-type, namespace, and template-agent filter toggles.
 * This mirrors the filtering logic in applySourceTypeFilters() but returns
 * the result without side-effects so extended view modes can reuse it.
 */
function getEnabledNodeIndices(): Set<number> {
  const enabled = new Set<number>();
  if (!graphData) return enabled;

  graphData.nodes.forEach((node, i) => {
    const sourceType = node.source || 'memory';

    // Check source-level toggle
    const srcEnabled = sourceTypeEnabled.get(sourceType);
    if (srcEnabled === false) return;

    // For memory nodes, also check namespace-level toggle
    if (sourceType === 'memory') {
      const ns = node.namespace || 'memory';
      const nsEnabled = namespaceEnabled.get(ns);
      if (nsEnabled === false) return;
    }

    // For agent nodes, check template agent filter
    if (sourceType === 'agent') {
      const nodeId = String(node.id || '');
      if (TEMPLATE_AGENT_IDS.has(nodeId)) {
        const templateEnabled = namespaceEnabled.get('_template_agents');
        if (templateEnabled === false) return;
      }
    }

    enabled.add(node.nodeIndex ?? i);
  });

  return enabled;
}

/**
 * Filter graphData.edges to only those whose endpoints are both in
 * the given enabledNodes set AND whose edge group / individual type
 * toggles are enabled.  Returns the filtered array.
 */
function getEnabledEdges(enabledNodes: Set<number>): GraphEdge[] {
  if (!graphData) return [];

  return graphData.edges.filter(edge => {
    // --- endpoint visibility ---
    let sourceIdx: number;
    let targetIdx: number;

    if (typeof edge.source === 'number') {
      sourceIdx = edge.source;
    } else if (edge.source && typeof edge.source === 'object') {
      sourceIdx = (edge.source as GraphNode).nodeIndex ?? -1;
    } else {
      sourceIdx = -1;
    }

    if (typeof edge.target === 'number') {
      targetIdx = edge.target;
    } else if (edge.target && typeof edge.target === 'object') {
      targetIdx = (edge.target as GraphNode).nodeIndex ?? -1;
    } else {
      targetIdx = -1;
    }

    if (!enabledNodes.has(sourceIdx) || !enabledNodes.has(targetIdx)) return false;

    // --- group toggle (deterministic / semantic) ---
    const group = edge.group ?? getEdgeGroup(edge.type || 'embedding');
    if (group === EdgeGroup.DETERMINISTIC && !edgeGroupEnabled.deterministic) return false;
    if (group === EdgeGroup.SEMANTIC && !edgeGroupEnabled.semantic) return false;

    // --- individual edge-type toggle ---
    const edgeType = edge.type || 'embedding';
    const typeEnabled = edgeTypeVisibility.get(edgeType);
    if (typeEnabled === false) return false;

    return true;
  });
}

/**
 * Re-trigger applyViewMode for the current mode so that mode-specific
 * renderers (Poincare disk, geodesic edges, TDA rings, etc.)
 * rebuild with the updated set of visible nodes / edges.
 *
 * Only acts for extended modes -- 2d/2.5d/3d use the force simulation
 * directly and do not need a full reapply.
 */
function reapplyCurrentMode(): void {
  if (!viewModeController) return;
  const currentMode = viewModeController.getMode();
  if (['poincare', 'spacetime', 'tda', 'pulse'].includes(currentMode)) {
    applyViewMode(currentMode);
  }
}

function applyViewMode(newMode: ViewMode): void {
  if (!renderer || !viewModeController || !graphData) return;

  // ═══════════════════════════════════════════════════════════════════════════
  // CLEANUP: Hide ALL mode-specific renderers before activating the new mode.
  // Each mode re-enables only what it needs.
  // ═══════════════════════════════════════════════════════════════════════════
  if (poincareDiskRenderer) poincareDiskRenderer.setVisible(false);
  if (geodesicEdgeRenderer) geodesicEdgeRenderer.setVisible(false);
  if (potentialSurfaceRenderer) potentialSurfaceRenderer.setVisible(false);
  if (topologyRenderer) topologyRenderer.setVisible(false);
  if (pulseRenderer) pulseRenderer.setVisible(false);

  // Restore normal animation callback when leaving pulse mode
  if (pulseAnimateCallback && renderer) {
    renderer.setOnAnimate(null);
    pulseAnimateCallback = null;
  }

  // Restore standard edge visibility (modes that hide edges will re-hide them)
  if (renderer.getEdgeRenderer().getEdgeCounts().total > 0) {
    renderer.getEdgeRenderer().setGroupVisible(EdgeGroup.DETERMINISTIC, edgeGroupEnabled.deterministic);
    renderer.getEdgeRenderer().setGroupVisible(EdgeGroup.SEMANTIC, edgeGroupEnabled.semantic);
  }

  if (newMode === '2.5d') {
    // Save original positions before first transform
    if (!originalPositions) {
      originalPositions = graphData.nodes.map(node => ({
        x: node.x || 0,
        y: node.y || 0
      }));
    }

    // Switch to 2.5D mode - apply temporal layering
    const zPositions = viewModeController.calculateAllNodeZ();

    // Update node.z on actual node objects (so edges connect across layers)
    for (let i = 0; i < graphData.nodes.length; i++) {
      graphData.nodes[i].z = zPositions[i];
    }

    // Log layer distribution
    logLayerDistribution();

    // Update GPU buffers for nodes
    renderer.updateNodeZPositions(zPositions);

    // Update edges to connect across Z layers
    renderer.getEdgeRenderer().updatePositions(graphData.nodes);

    // Apply depth-based visual effects (opacity/size falloff)
    renderer.applyDepthEffects(zPositions);

    // Switch renderer to 2.5D camera mode (tilted view, keeps interactivity)
    renderer.setViewMode('2.5d');
    renderer.getNodeRenderer().setViewMode('2.5d');  // Keep flat nodes in 2.5D

    // Restart force simulation for physics-based modes
    if (forceSimulation) forceSimulation.alpha(0.3).restart();

    console.log('Switched to 2.5D temporal layers');

  } else if (newMode === '3d') {
    // Save original UMAP positions before first transform
    if (!originalPositions) {
      // Handle NaN/undefined positions (can happen with isolated nodes in force simulation)
      let nanCount = 0;
      originalPositions = graphData.nodes.map((node, i) => {
        let x = node.x;
        let y = node.y;

        // Check for invalid positions
        if (x == null || !isFinite(x) || y == null || !isFinite(y)) {
          nanCount++;
          // Use a random position spread around the center to avoid clustering
          const angle = (i / graphData!.nodes.length) * Math.PI * 2;
          const radius = 200 + Math.random() * 300;
          x = Math.cos(angle) * radius;
          y = Math.sin(angle) * radius;
        }

        return { x, y };
      });

      if (nanCount > 0) {
        console.warn(`3D mode: ${nanCount} nodes had invalid positions, assigned fallback positions`);
      }

      // Calculate and store UMAP center for recalculations
      let sumX = 0, sumY = 0;
      for (const pos of originalPositions) {
        sumX += pos.x;
        sumY += pos.y;
      }
      umapCenter.x = sumX / originalPositions.length;
      umapCenter.y = sumY / originalPositions.length;

      // Update ViewModeController's spatial bounds to match these positions
      // This ensures 3D projection uses correct bounds for full 360° distribution
      viewModeController.updateSpatialBoundsFromPositions(originalPositions);
    }

    // Initialize sim2DPositions for live simulation updates in 3D mode
    // Copy current 2D positions so the simulation can continue to run
    sim2DPositions = graphData.nodes.map(node => ({
      x: node.x || 0,
      y: node.y || 0
    }));

    // Get radial target settings for "push to surface" effect
    const radialTarget = (simParams as any).radialTarget || 'none';
    const radialStrength = (simParams as any).radialStrength || 0.5;

    // Calculate 3D spherical positions using original UMAP positions
    for (let i = 0; i < graphData.nodes.length; i++) {
      const node = graphData.nodes[i];
      const origPos = originalPositions[i];

      // Check if this node should be pushed to outer surface
      const pushToSurface = radialTarget !== 'none' && matchesRadialTarget(node, radialTarget);

      const pos = viewModeController.getNode3DPosition(
        node, i, origPos.x, origPos.y, umapCenter.x, umapCenter.y,
        pushToSurface, radialStrength
      );
      node.x = pos.x;
      node.y = pos.y;
      node.z = pos.z;
    }

    // Verify all node positions are valid before updating renderers
    let invalidPosCount = 0;
    for (let i = 0; i < graphData.nodes.length; i++) {
      const node = graphData.nodes[i];
      if (!isFinite(node.x!) || !isFinite(node.y!) || !isFinite(node.z!)) {
        invalidPosCount++;
        // Fix invalid positions
        node.x = 0;
        node.y = 0;
        node.z = 0;
      }
    }
    if (invalidPosCount > 0) {
      console.warn(`3D transform: ${invalidPosCount} nodes had invalid positions after spherical projection`);
    }

    // Update GPU buffers
    renderer.getNodeRenderer().updatePositions(graphData.nodes);
    renderer.getEdgeRenderer().updatePositions(graphData.nodes);

    // Switch to 3D mode - spheres, full orbit, no depth effects
    renderer.setViewMode('3d');
    renderer.getNodeRenderer().setViewMode('3d');  // Use sphere geometry
    renderer.getEdgeRenderer().setViewMode('3d');  // Enable fog for edges

    // Restore 2D positions for simulation continuity
    // The renderers have the 3D positions in GPU buffers, but node.x/y need to be 2D
    // for the force simulation to work correctly
    for (let i = 0; i < graphData.nodes.length; i++) {
      const node = graphData.nodes[i];
      node.x = sim2DPositions[i].x;
      node.y = sim2DPositions[i].y;
      node.z = 0;
    }

    // Log 3D stats
    logLayerDistribution();

    // Restart simulation animation as if first load
    if (forceSimulation) {
      forceSimulation.alpha(1).restart();
    }
    animatePhysicsParams();

    console.log(`Switched to 3D spherical view (radial target: ${radialTarget}, nodes: ${graphData.nodes.length})`);

  } else if (newMode === 'poincare') {
    // ═══════════════════════════════════════════════════════════════════════
    // POINCARÉ DISK MODE - Hyperbolic geometry projection
    // ═══════════════════════════════════════════════════════════════════════

    // Save original positions before first transform
    if (!originalPositions) {
      originalPositions = graphData.nodes.map(node => ({
        x: node.x || 0,
        y: node.y || 0
      }));
    }

    // Initialize hyperbolic projection if needed
    if (!hyperbolicProjection) {
      hyperbolicProjection = new HyperbolicProjection();
    }
    if (!geodesicComputer) {
      geodesicComputer = new GeodesicComputer();
    }

    // Determine which nodes are enabled by user filters
    const poincareEnabledIndices = getEnabledNodeIndices();
    const poincareEnabledNodes = graphData.nodes.filter(
      (n, i) => poincareEnabledIndices.has(n.nodeIndex ?? i)
    );

    // Project only enabled nodes to Poincaré disk
    const diskRadius = 900; // Match UMAP spread
    const enabledPoincarePos = hyperbolicProjection.projectNodes(poincareEnabledNodes);

    // Build a map from enabled node's nodeIndex to its projected position
    const poincarePosMap = new Map<number, { x: number; y: number }>();
    poincareEnabledNodes.forEach((node, idx) => {
      poincarePosMap.set(node.nodeIndex ?? graphData!.nodes.indexOf(node), enabledPoincarePos[idx]);
    });

    // Write positions for ALL nodes (disabled nodes get origin so they stay hidden)
    poincarePositions = graphData.nodes.map((node, i) => {
      const idx = node.nodeIndex ?? i;
      return poincarePosMap.get(idx) || { x: 0, y: 0 };
    });

    // Set node positions to Poincaré disk positions (scaled to screen)
    for (let i = 0; i < graphData.nodes.length; i++) {
      const node = graphData.nodes[i];
      node.x = poincarePositions[i].x * diskRadius;
      node.y = poincarePositions[i].y * diskRadius;
      node.z = 0;
    }

    // Update node positions
    renderer.getNodeRenderer().updatePositions(graphData.nodes);

    // Create Poincaré disk background renderer
    if (!poincareDiskRenderer) {
      poincareDiskRenderer = new PoincareDiskRenderer(renderer.getScene(), diskRadius);
    }
    poincareDiskRenderer.setVisible(true);

    // Create geodesic edge renderer
    if (!geodesicEdgeRenderer) {
      geodesicEdgeRenderer = new GeodesicEdgeRenderer(renderer.getScene(), geodesicComputer);
    }
    // Filter edges: only those between enabled nodes with enabled groups/types
    const poincareEnabledEdges = getEnabledEdges(poincareEnabledIndices);
    geodesicEdgeRenderer.setEdges(poincareEnabledEdges, poincarePositions, diskRadius);

    // Hide standard edges (replaced by geodesic edges)
    renderer.getEdgeRenderer().setViewMode('2d'); // Use 2D straight (hidden)
    if (renderer.getEdgeRenderer().getEdgeCounts().total > 0) {
      renderer.getEdgeRenderer().setGroupVisible(EdgeGroup.DETERMINISTIC, false);
      renderer.getEdgeRenderer().setGroupVisible(EdgeGroup.SEMANTIC, false);
    }

    // Switch to flat 2D camera mode (Poincaré disk is flat)
    renderer.setViewMode('poincare');
    renderer.getNodeRenderer().setViewMode('2d');

    // Restore 2D positions for simulation continuity
    for (let i = 0; i < graphData.nodes.length; i++) {
      const pos2D = sim2DPositions[i] || originalPositions![i];
      graphData.nodes[i].x = pos2D.x;
      graphData.nodes[i].y = pos2D.y;
      graphData.nodes[i].z = 0;
    }

    console.log(`Switched to Poincaré disk view (${poincareEnabledNodes.length}/${graphData.nodes.length} nodes projected to H²)`);

    // Pause force simulation - this mode uses fixed hyperbolic projection
    if (forceSimulation) forceSimulation.stop();

  } else if (newMode === 'spacetime') {
    // ═══════════════════════════════════════════════════════════════════════
    // SPACETIME MODE - Temporal geodesic curvature through reward potential
    // ═══════════════════════════════════════════════════════════════════════

    // Save original positions
    if (!originalPositions) {
      originalPositions = graphData.nodes.map(node => ({
        x: node.x || 0,
        y: node.y || 0
      }));
    }
    sim2DPositions = graphData.nodes.map(node => ({
      x: node.x || 0,
      y: node.y || 0
    }));

    // Determine which nodes are enabled by user filters
    const spacetimeEnabledIndices = getEnabledNodeIndices();
    const spacetimeEnabledNodes = graphData.nodes.filter(
      (n, i) => spacetimeEnabledIndices.has(n.nodeIndex ?? i)
    );

    // Build the reward potential field from enabled node data only
    if (!rewardPotentialField) {
      rewardPotentialField = new RewardPotentialField(128);
    }
    rewardPotentialField.computeField(spacetimeEnabledNodes);

    // Integrate geodesic trajectories through the potential field
    if (!geodesicIntegrator) {
      geodesicIntegrator = new GeodesicIntegrator(rewardPotentialField);
    }

    // Deflect trajectory edges through the reward potential (only enabled nodes get z)
    for (let i = 0; i < graphData.nodes.length; i++) {
      const node = graphData.nodes[i];
      const idx = node.nodeIndex ?? i;
      if (spacetimeEnabledIndices.has(idx)) {
        // Keep 2D positions but use potential field to compute z displacement
        const potential = rewardPotentialField.sample(node.x || 0, node.y || 0);
        node.z = -potential * 100; // Gravity wells go downward
      } else {
        node.z = 0; // Disabled nodes stay flat
      }
    }

    // Create potential surface renderer
    if (!potentialSurfaceRenderer) {
      potentialSurfaceRenderer = new PotentialSurfaceRenderer(renderer.getScene());
    }
    potentialSurfaceRenderer.buildSurface(rewardPotentialField, 100);
    potentialSurfaceRenderer.setVisible(true);

    // Update node/edge positions
    renderer.getNodeRenderer().updatePositions(graphData.nodes);
    renderer.getEdgeRenderer().updatePositions(graphData.nodes);

    // Switch to 3D camera for spacetime view
    renderer.setViewMode('spacetime');
    renderer.getNodeRenderer().setViewMode('3d');
    renderer.getEdgeRenderer().setViewMode('3d');

    // Restore simulation positions
    for (let i = 0; i < graphData.nodes.length; i++) {
      graphData.nodes[i].x = sim2DPositions[i].x;
      graphData.nodes[i].y = sim2DPositions[i].y;
      graphData.nodes[i].z = 0;
    }

    console.log(`Switched to Spacetime view (reward potential field with geodesic curvature)`);

  } else if (newMode === 'tda') {
    // ═══════════════════════════════════════════════════════════════════════
    // TDA MODE - Topological Data Analysis with persistent homology
    // ═══════════════════════════════════════════════════════════════════════

    // Save original positions
    if (!originalPositions) {
      originalPositions = graphData.nodes.map(node => ({
        x: node.x || 0,
        y: node.y || 0
      }));
    }

    // Determine which nodes are enabled by user filters
    const tdaEnabledIndices = getEnabledNodeIndices();
    const tdaEnabledNodes = graphData.nodes.filter(
      (n, i) => tdaEnabledIndices.has(n.nodeIndex ?? i)
    );

    // Prepare 2D positions for distance matrix (only enabled nodes)
    const positions2D = tdaEnabledNodes.map(n => ({
      x: n.x || 0,
      y: n.y || 0
    }));

    // Compute persistent homology (limit to 200 nodes for performance)
    if (!persistentHomology) {
      persistentHomology = new PersistentHomology();
    }
    const tdaPositions = positions2D.length > 100
      ? positions2D.slice(0, 100)
      : positions2D;
    persistentHomology.buildDistanceMatrix(tdaPositions);
    const bars = persistentHomology.compute(undefined, 0);

    // Detect knowledge gaps from H1 cycles (use enabled nodes subset)
    if (!knowledgeGapDetector) {
      knowledgeGapDetector = new KnowledgeGapDetector();
    }
    const gaps = knowledgeGapDetector.detect(tdaEnabledNodes, tdaPositions, bars);

    // Initialize topology renderer
    if (!topologyRenderer) {
      topologyRenderer = new TopologyRenderer(renderer.getScene());
    }
    topologyRenderer.setVisible(true);

    // Render initial complex at a default epsilon
    const defaultEpsilon = bars.length > 0
      ? bars.reduce((max, b) => Math.max(max, b.death === Infinity ? b.birth : b.death), 0) * 0.3
      : 100;
    const complex = persistentHomology.getComplexAtEpsilon(defaultEpsilon);
    topologyRenderer.renderComplex(complex, tdaPositions, defaultEpsilon);

    // Render knowledge gaps (limit to top 20 for rendering)
    const topGaps = gaps.slice(0, 20);
    if (topGaps.length > 0) {
      topologyRenderer.renderGaps(topGaps);
      console.log(`TDA found ${gaps.length} knowledge gap(s), showing top ${topGaps.length}:`);
      topGaps.slice(0, 5).forEach((g, i) => console.log(`  ${i + 1}. ${g.label} (persistence: ${g.persistence.toFixed(2)})`));
    }

    // Create barcode panel (limit to top 200 most significant bars for performance)
    const significantBars = bars
      .filter(b => isFinite(b.death))
      .sort((a, b) => (b.death - b.birth) - (a.death - a.birth))
      .slice(0, 200);
    topologyRenderer.createBarcodePanel(significantBars, renderer.getContainer());

    // Keep nodes flat
    for (let i = 0; i < graphData.nodes.length; i++) {
      graphData.nodes[i].z = 0;
    }
    renderer.getNodeRenderer().updatePositions(graphData.nodes);

    // Hide standard graph edges (replaced by simplicial complex edges)
    if (renderer.getEdgeRenderer().getEdgeCounts().total > 0) {
      renderer.getEdgeRenderer().setGroupVisible(EdgeGroup.DETERMINISTIC, false);
      renderer.getEdgeRenderer().setGroupVisible(EdgeGroup.SEMANTIC, false);
    }

    // Switch to 3D camera (allows orbit rotation of the topology)
    renderer.setViewMode('tda');
    renderer.getNodeRenderer().setViewMode('3d');
    renderer.getEdgeRenderer().setViewMode('3d');

    console.log(`Switched to TDA view (${bars.length} persistence bars, ${tdaPositions.length}/${graphData.nodes.length} nodes analyzed)`);

    // Pause force simulation - this mode uses fixed topological projection
    if (forceSimulation) forceSimulation.stop();

  } else if (newMode === 'pulse') {
    // ═══════════════════════════════════════════════════════════════════════
    // PULSE MODE - Live system architecture diagram
    // ═══════════════════════════════════════════════════════════════════════

    // Initialize Pulse renderer (positioned at large Z offset away from graph)
    if (!pulseRenderer) {
      pulseRenderer = new PulseRenderer(renderer.getScene(), renderer.getCamera());
    }

    // Load data and show
    pulseRenderer.loadData().then(() => {
      pulseRenderer!.setVisible(true);
    });

    // Switch to 2D camera and move camera to look at the pulse diagram
    renderer.setViewMode('2d');
    const cam = renderer.getCamera() as THREE.PerspectiveCamera;
    cam.position.set(0, 0, 2000);
    cam.lookAt(0, 0, 0);
    // Move pulse group to view (it uses its own z-offset internally)
    const controls = renderer.getControls();
    if (controls) {
      controls.target.set(0, 0, 0);
      controls.update();
    }

    // Set up per-frame animation
    pulseAnimateCallback = (dt: number) => {
      if (pulseRenderer) pulseRenderer.update(dt);
    };
    renderer.setOnAnimate(pulseAnimateCallback);

    // Pause force simulation
    if (forceSimulation) forceSimulation.stop();

    console.log('Switched to Pulse mode (Live system architecture diagram)');

  } else {
    // Switch to 2D mode - flatten everything and restore simulation positions
    // (Mode-specific renderers already hidden by cleanup block above)

    // Prefer sim2DPositions (latest simulation state) over originalPositions (stale snapshot)
    for (let i = 0; i < graphData.nodes.length; i++) {
      const node = graphData.nodes[i];
      if (sim2DPositions.length > i && sim2DPositions[i]) {
        // Use latest simulation state
        node.x = sim2DPositions[i].x;
        node.y = sim2DPositions[i].y;
      } else if (originalPositions && originalPositions[i]) {
        // Fallback to original positions
        node.x = originalPositions[i].x;
        node.y = originalPositions[i].y;
      }
      node.z = 0;
    }

    renderer.resetDepthEffects();

    // Update node positions back to original UMAP positions
    renderer.getNodeRenderer().updatePositions(graphData.nodes);

    // Update edges back to flat
    renderer.getEdgeRenderer().updatePositions(graphData.nodes);

    // Switch renderer to 2D camera mode, flat shapes
    renderer.setViewMode('2d');
    renderer.getNodeRenderer().setViewMode('2d');  // Back to flat shapes
    renderer.getEdgeRenderer().setViewMode('2d');  // Disable fog for edges

    // Restart force simulation for physics-based modes
    if (forceSimulation) forceSimulation.alpha(0.3).restart();

    console.log('Switched to 2D flat view');
  }

  // Update button state
  updateViewModeButton(newMode);
}

function logLayerDistribution(): void {
  if (!viewModeController || !graphData) return;

  const currentMode = viewModeController.getMode();

  if (currentMode === '3d') {
    // Log 3D spherical mode statistics
    const positions = graphData.nodes.map(n => ({ x: n.x || 0, y: n.y || 0, z: n.z || 0 }));

    // Calculate center of mass
    let sumX = 0, sumY = 0, sumZ = 0;
    for (const pos of positions) {
      sumX += pos.x;
      sumY += pos.y;
      sumZ += pos.z;
    }
    const centerX = sumX / positions.length;
    const centerY = sumY / positions.length;
    const centerZ = sumZ / positions.length;

    // Calculate radii from center
    const radii = positions.map(pos => Math.sqrt(
      Math.pow(pos.x - centerX, 2) +
      Math.pow(pos.y - centerY, 2) +
      Math.pow(pos.z - centerZ, 2)
    ));

    const minRadius = Math.min(...radii);
    const maxRadius = Math.max(...radii);
    const avgRadius = radii.reduce((a, b) => a + b, 0) / radii.length;

    // Calculate bounding box
    const minX = Math.min(...positions.map(p => p.x));
    const maxX = Math.max(...positions.map(p => p.x));
    const minY = Math.min(...positions.map(p => p.y));
    const maxY = Math.max(...positions.map(p => p.y));
    const minZ = Math.min(...positions.map(p => p.z));
    const maxZ = Math.max(...positions.map(p => p.z));

    console.log('=== 3D Spherical Distribution ===');
    console.log(`Total nodes: ${graphData.nodes.length}`);
    console.log(`Center of mass: (${centerX.toFixed(1)}, ${centerY.toFixed(1)}, ${centerZ.toFixed(1)})`);
    console.log(`Radius range: ${minRadius.toFixed(1)} to ${maxRadius.toFixed(1)}`);
    console.log(`Average radius: ${avgRadius.toFixed(1)}`);
    console.log(`Bounding box:`);
    console.log(`  X: ${minX.toFixed(1)} to ${maxX.toFixed(1)} (span: ${(maxX - minX).toFixed(1)})`);
    console.log(`  Y: ${minY.toFixed(1)} to ${maxY.toFixed(1)} (span: ${(maxY - minY).toFixed(1)})`);
    console.log(`  Z: ${minZ.toFixed(1)} to ${maxZ.toFixed(1)} (span: ${(maxZ - minZ).toFixed(1)})`);

  } else {
    // Log 2.5D temporal mode statistics
    const config = viewModeController.getConfig();
    const bounds = viewModeController.getTemporalBounds();
    if (!bounds) return;

    // Collect Z positions for statistics
    const zPositions: number[] = [];
    for (let i = 0; i < graphData.nodes.length; i++) {
      const z = viewModeController.getNodeZ(graphData.nodes[i], i);
      zPositions.push(z);
    }

    // Calculate statistics
    const minZ = Math.min(...zPositions);
    const maxZ = Math.max(...zPositions);
    const avgZ = zPositions.reduce((a, b) => a + b, 0) / zPositions.length;

    // Calculate distribution across depth bins (for visualization of spread)
    const numBins = 10;
    const binCounts: number[] = new Array(numBins).fill(0);
    const binSize = config.maxDepth / numBins;

    for (const z of zPositions) {
      const binIndex = Math.min(numBins - 1, Math.floor(Math.abs(z) / binSize));
      binCounts[binIndex]++;
    }

    // Log distribution
    console.log('=== 2.5D Temporal Depth Distribution ===');
    console.log(`Mode: ${config.continuous ? 'CONTINUOUS' : 'DISCRETE'}`);
    console.log(`Total nodes: ${graphData.nodes.length}`);
    console.log(`Date range: ${new Date(bounds.minTimestamp).toLocaleString()} → ${new Date(bounds.maxTimestamp).toLocaleString()}`);
    console.log(`Time span: ${((bounds.range) / (1000 * 60 * 60)).toFixed(1)} hours`);
    console.log(`Z range: ${minZ.toFixed(0)} to ${maxZ.toFixed(0)} (max: -${config.maxDepth})`);
    console.log(`Average Z: ${avgZ.toFixed(0)}`);
    console.log('Depth distribution (front → back):');
    for (let i = 0; i < numBins; i++) {
      const depthLabel = `Z ${(-i * binSize).toFixed(0)} to ${(-(i + 1) * binSize).toFixed(0)}`;
      const bar = '█'.repeat(Math.ceil(binCounts[i] / graphData.nodes.length * 40));
      console.log(`  ${depthLabel.padEnd(16)}: ${binCounts[i].toString().padStart(4)} ${bar}`);
    }
  }
}

const VIZ_DESCRIPTIONS: Record<ViewMode, { title: string; html: string } | null> = {
  '2d': null,  // Hide section for default 2D
  '2.5d': {
    title: '2.5D Temporal Layers',
    html: '<strong>Algorithm:</strong> Nodes are layered along the Z-axis by creation timestamp. Newer nodes appear in the foreground, older ones recede. Opacity and size decrease with depth.<br><em>Interaction: Pan/zoom as usual. Depth reveals temporal evolution of the memory graph.</em>'
  },
  '3d': {
    title: '3D Spherical Projection',
    html: '<strong>Algorithm:</strong> 2D UMAP positions are projected onto a sphere using azimuthal equidistant mapping. Polar angle from distance to centroid, azimuth from atan2. Radial push separates selected node types to the outer shell.<br><em>Interaction: Orbit camera with drag. Scroll to zoom. Use "Push to outer ring" to separate types.</em>'
  },
  'poincare': {
    title: 'H\u00B2 Poincar\u00E9 Disk',
    html: '<strong>Algorithm:</strong> Nodes are embedded into the Poincar\u00E9 disk model of hyperbolic geometry via exponential map. Distances grow exponentially toward the boundary, so hierarchical structure is naturally compressed. Edges are drawn as geodesic arcs (circular arcs orthogonal to the boundary).<br><em>Interaction: Nodes near the center are "roots"; periphery = leaves. Clusters compress at the boundary.</em>'
  },
  'spacetime': {
    title: 'Spacetime Gravity Wells',
    html: '<strong>Algorithm:</strong> A 128\u00D7128 reward potential field is computed from node effectiveness scores using Gaussian kernel smoothing. The surface is rendered as a height-map where high-reward regions create gravity wells (downward curvature). Nodes sit on the surface at their potential depth.<br><em>Interaction: Orbit to see the 3D curvature. Deep wells = clusters of high-reward memories.</em>'
  },
  'tda': {
    title: 'TDA Persistent Homology',
    html: '<strong>Algorithm:</strong> Computes a Vietoris-Rips filtration over node positions. As the radius \u03B5 grows, simplices (edges, triangles) appear. Persistent homology tracks when topological features (connected components H\u2080, loops H\u2081) are born and die. Long-lived features = robust structure. Knowledge gaps are H\u2081 cycles that persist long, indicating missing connections.<br><em>Interaction: The barcode panel shows birth/death of features. Colored rings show the filtration. Gap labels mark discovered holes in knowledge.</em>'
  },
  'pulse': {
    title: 'Learning Pulse Monitor',
    html: '<strong>Algorithm:</strong> Live system architecture diagram showing the v3 intelligence pipeline as a layered DAG. Node sizes are proportional to row counts, colors indicate health status (green/amber/red). Animated particles flow along active edges to visualize data movement through the pipeline stages: Hooks → Bridge → Processing (ONNX, Q-Learning, SONA) → Storage tables → SQLite.<br><em>Interaction: Left-drag to rotate, right-drag to pan, scroll to zoom. Data refreshes from /api/learning-pulse.</em>'
  }
};

function updateVizDescription(mode: ViewMode): void {
  const section = document.getElementById('vizDescriptionSection');
  const titleEl = document.getElementById('vizDescriptionTitle');
  const bodyEl = document.getElementById('vizDescription');
  if (!section || !titleEl || !bodyEl) return;

  const desc = VIZ_DESCRIPTIONS[mode];
  if (!desc) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';
  titleEl.textContent = desc.title;
  bodyEl.innerHTML = desc.html;
}

function updateViewModeButton(mode: ViewMode): void {
  const select = document.getElementById('viewModeSelect') as HTMLSelectElement | null;
  if (select) {
    select.value = mode;
  }
  updateVizDescription(mode);
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENT HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// Q-TABLE HEATMAP PANEL
// Fetches /api/qtable and renders a full state×action matrix with color coding.
// ═══════════════════════════════════════════════════════════════════════════

interface QTableData {
  states: string[];
  actions: string[];
  matrix: Record<string, Record<string, { q: number; v: number }>>;
  meta: { totalPatterns: number; stateCount: number; actionCount: number; qRange: { min: number; max: number } };
}

let qtableCache: QTableData | null = null;

function qValueToColor(q: number, min: number, max: number): string {
  // Normalize to 0..1
  const range = max - min || 1;
  const norm = (q - min) / range;
  // Red (low) → yellow (0.5) → green (high)
  if (norm < 0.5) {
    const r = 220;
    const g = Math.round(norm * 2 * 180);
    return `rgb(${r},${g},40)`;
  } else {
    const r = Math.round((1 - (norm - 0.5) * 2) * 200);
    return `rgb(${r},200,40)`;
  }
}

async function loadQTableHeatmap(container?: HTMLElement, tabFilter?: LearningsTabFilter): Promise<void> {
  const body = container || document.getElementById('learningsBody');
  if (!body) return;

  if (!qtableCache) {
    body.innerHTML = '<div style="font-size: 10px; color: var(--text-muted); font-style: italic; padding: 8px;">Loading Q-table data...</div>';
    try {
      const resp = await fetch('/api/qtable');
      qtableCache = await resp.json() as QTableData;
    } catch (err) {
      body.innerHTML = '<div style="color: #e55; font-size: 10px; padding: 8px;">Failed to load Q-table data</div>';
      return;
    }
  }

  const data = qtableCache;
  if (!data || data.states.length === 0) {
    body.innerHTML = '<div style="font-size: 10px; color: var(--text-muted); padding: 8px;">No Q-table data available</div>';
    return;
  }

  const { states, actions, matrix, meta } = data;
  const { min: qMin, max: qMax } = meta.qRange;

  // §7.0.1: Filter states/actions when a node-click filter is active
  let filteredStates = states;
  let filteredActions = actions;

  const highlightAction = tabFilter?.highlightAction;
  const highlightState = tabFilter?.highlightState;

  if (highlightAction) {
    filteredActions = actions.filter(a => a === highlightAction);
  }
  if (highlightState) {
    filteredStates = states.filter(s => s === highlightState);
  }

  // A3: filterCells — specific state/action pairs from routes_to JOIN
  if (tabFilter?.filterCells && tabFilter.filterCells.length > 0) {
    const cellStates = new Set(tabFilter.filterCells.map(c => c.state));
    const cellActions = new Set(tabFilter.filterCells.map(c => c.action));
    filteredStates = states.filter(s => cellStates.has(s));
    filteredActions = actions.filter(a => cellActions.has(a));
  }

  // A5: filterKeyword — substring match on states
  if (tabFilter?.filterKeyword) {
    const kw = tabFilter.filterKeyword.toLowerCase();
    filteredStates = states.filter(s => s.toLowerCase().includes(kw));
  }

  // When filtering leaves nothing, show a contextual empty-state message
  if (filteredStates.length === 0 || filteredActions.length === 0) {
    let msg = 'No Q-table data';
    if (highlightAction) msg += ` for action "${highlightAction}"`;
    if (highlightState) msg += ` for state "${highlightState}"`;
    if (tabFilter?.filterCells) msg = 'No routing patterns target this file yet';
    if (tabFilter?.filterKeyword) msg = `No routing patterns for "${tabFilter.filterKeyword}" yet`;
    body.innerHTML = `<div style="font-size:10px;color:var(--text-muted);padding:8px;">${msg}</div>`;
    return;
  }

  // Truncate long state labels for display
  const stateLabel = (s: string) => s.length > 25 ? s.slice(0, 22) + '...' : s;
  const actionLabel = (a: string) => a.length > 12 ? a.slice(0, 10) + '..' : a;

  // Build grid: columns = [row-label] + filtered actions
  let html = `<div class="qtable-grid" style="grid-template-columns: 140px repeat(${filteredActions.length}, 1fr);">`;

  // Header row: empty corner + action names
  html += '<div class="qtable-header"></div>';
  filteredActions.forEach(a => {
    html += `<div class="qtable-header" title="${a}">${actionLabel(a)}</div>`;
  });

  // Data rows: state label + cells (only filtered states × filtered actions)
  filteredStates.forEach(state => {
    html += `<div class="qtable-row-label" title="${state}">${stateLabel(state)}</div>`;
    filteredActions.forEach(action => {
      const cell = matrix[state]?.[action];
      if (cell) {
        const bg = qValueToColor(cell.q, qMin, qMax);
        const textColor = safeNum(cell.q) > (qMin + qMax) / 2 ? '#111' : '#eee';
        const cellQ = safeNum(cell.q, 0);
        html += `<div class="qtable-cell" style="background: ${bg}; color: ${textColor};" title="${state} → ${action}\nQ: ${safeFixed(cellQ, 3, '0')}\nVisits: ${safeNum(cell.v, 0)}">${safeFixed(cellQ, 2, '-')}</div>`;
      } else {
        html += `<div class="qtable-cell" style="background: rgba(40,40,60,0.3); color: #555;">-</div>`;
      }
    });
  });

  html += '</div>';

  // Legend
  const isFiltered = filteredStates.length < states.length || filteredActions.length < actions.length;
  html += `<div class="qtable-legend">
    <span>Q-value:</span>
    <span>${safeFixed(qMin, 2, '0')}</span>
    <div class="qtable-legend-gradient"></div>
    <span>${safeFixed(qMax, 2, '1')}</span>
    <span style="margin-left: auto;">${isFiltered ? `Showing ${filteredStates.length}×${filteredActions.length} of ` : ''}${safeNum(data.meta.totalPatterns, 0)} patterns</span>
  </div>`;

  body.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════════════════
// INLINE Q-PATTERN MINI-HEATMAP (§7.2)
// Renders Q-patterns inline inside the node detail view for learning nodes.
// ═══════════════════════════════════════════════════════════════════════════

interface QPatternRow { state: string; action: string; q: number; visits: number }

/**
 * Filters the cached Q-table data for patterns relevant to a given node.
 * Returns matching Q-pattern rows per §7.1 dispatch table.
 */
function getQPatternsForNode(node: GraphNode): { rows: QPatternRow[]; label: string } | null {
  if (!qtableCache) return null;

  const { states, actions, matrix } = qtableCache;

  // Flatten matrix into rows for filtering
  const allRows: QPatternRow[] = [];
  states.forEach(s => {
    actions.forEach(a => {
      const cell = matrix[s]?.[a];
      if (cell) allRows.push({ state: s, action: a, q: cell.q, visits: cell.v });
    });
  });

  if (node.source === 'agent') {
    // Agent node: patterns where action = this agent's ID
    const agentId = String(node.id).replace(/^agent:/, '');
    const rows = allRows.filter(r => r.action === agentId).sort((a, b) => b.visits - a.visits);
    return rows.length > 0 ? { rows, label: `for "${agentId}"` } : null;
  }

  if (node.source === 'neural_pattern') {
    // Neural pattern: extract agent name from content ("Route task to coder agent...")
    const content = node.preview || '';
    const match = content.match(/to (\S+) agent/i);
    if (match) {
      const agentName = match[1].toLowerCase();
      const rows = allRows.filter(r => r.action === agentName).sort((a, b) => b.visits - a.visits);
      return rows.length > 0 ? { rows, label: `for "${agentName}"` } : null;
    }
    return null;
  }

  if (node.source === 'file') {
    // File node: patterns that route_to this file via graph edges (A3 JOIN)
    const fileId = String(node.id);
    const cells = getQTableCellsForFile(fileId);
    if (cells && cells.length > 0) {
      const cellSet = new Set(cells.map(c => `${c.state}|${c.action}`));
      const rows = allRows.filter(r => cellSet.has(`${r.state}|${r.action}`))
        .sort((a, b) => b.visits - a.visits);
      if (rows.length > 0) return { rows, label: `routing to ${fileId.replace('file:', '')}` };
    }
    return null;
  }

  if (node.source === 'q_pattern') {
    // Pat_* node: the exact pattern row
    const patId = String(node.id).replace('pat_', '');
    const lastUnderscore = patId.lastIndexOf('_');
    const state = patId.substring(0, lastUnderscore);
    const action = patId.substring(lastUnderscore + 1);
    const rows = allRows.filter(r => r.state === state && r.action === action);
    return rows.length > 0 ? { rows, label: `${state} → ${action}` } : null;
  }

  if (node.source === 'memory') {
    const memType = node.memoryType || '';

    if (memType === 'foundation' || node.isFoundation) {
      // Foundation: match by document domain keyword (A5 improved extraction)
      const keyword = getQTableKeyword(node);
      if (keyword) {
        const rows = allRows.filter(r => r.state.toLowerCase().includes(keyword)).sort((a, b) => b.visits - a.visits).slice(0, 15);
        return rows.length > 0 ? { rows, label: `for domain "${keyword}"` } : null;
      }
    }

    if (memType.startsWith('neural_')) {
      // Neural memory: match by category
      const category = memType.replace('neural_', '');
      const rows = allRows.filter(r => r.state.includes(category) || r.action.includes(category)).sort((a, b) => b.visits - a.visits).slice(0, 15);
      return rows.length > 0 ? { rows, label: `for "${category}"` } : null;
    }
  }

  return null;
}

/**
 * Renders the inline Q-pattern mini-heatmap in the node detail panel.
 */
function renderInlineQPatterns(node: GraphNode): void {
  const section = document.getElementById('nodeQPatternSection');
  const body = document.getElementById('nodeQPatternBody');
  const label = document.getElementById('nodeQPatternLabel');
  if (!section || !body) return;

  const result = getQPatternsForNode(node);
  if (!result || result.rows.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  if (label) label.textContent = result.label;

  const { min: qMin, max: qMax } = qtableCache?.meta.qRange || { min: 0, max: 1 };

  let html = '<table class="qp-mini-table"><tr><th>State</th><th>Q</th><th>Visits</th><th>Action</th></tr>';

  result.rows.forEach(r => {
    const rowQ = safeNum(r.q, 0);
    const color = qValueToColor(rowQ, qMin, qMax);
    const barW = Math.max(8, Math.min(40, (rowQ - qMin) / (qMax - qMin || 1) * 40));
    html += `<tr class="qp-mini-row" data-qp-state="${r.state}" data-qp-action="${r.action}" title="${r.state} → ${r.action}\nQ: ${safeFixed(rowQ, 3, '0')}\nVisits: ${safeNum(r.visits, 0)}">
      <td class="qp-mini-state">${r.state}</td>
      <td class="qp-mini-q"><span class="qp-mini-q-bar" style="background:${color};width:${safeFixed(barW, 0, '8')}px;"></span>${safeFixed(rowQ, 2, '-')}</td>
      <td class="qp-mini-visits">${safeNum(r.visits, 0)}</td>
      <td class="qp-mini-action">${r.action}</td>
    </tr>`;
  });

  html += '</table>';
  body.innerHTML = html;

  // Click Q-row → highlight pat_* node in graph (§7.3)
  body.querySelectorAll('.qp-mini-row').forEach(row => {
    row.addEventListener('click', () => {
      const state = (row as HTMLElement).dataset.qpState;
      const action = (row as HTMLElement).dataset.qpAction;
      if (!state || !action || !graphData) return;
      const patId = `pat_${state}_${action}`;
      const nodeIdx = graphData.nodes.findIndex(n => n.id === patId);
      if (nodeIdx >= 0) {
        handleNodeClick(graphData.nodes[nodeIdx], nodeIdx);
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// AGENT PANEL (§5.5)
// Fetches /api/agents and renders hive agents, template agents, ghost routing labels.
// ═══════════════════════════════════════════════════════════════════════════

interface AgentInfo {
  id: string;
  name: string;
  capabilities: Record<string, unknown>;
  performanceScore: number;
  lastUsed: number | null;
  createdAt: number;
  updatedAt: number;
  isTemplate: boolean;
  isHive: boolean;
  topologyRole: string;
}

interface GhostAgent {
  label: string;
  patternCount: number;
  totalVisits: number;
}

interface AgentPanelData {
  agents: AgentInfo[];
  feedbackRates: Array<{ agent: string; total: number; followed: number; followed_success: number; ignored_success: number }>;
  feedbackSummary: { totalSuggestions: number; followed: number; successful: number };
  ghostAgents: GhostAgent[];
  meta: { totalAgents: number; hiveAgents: number; templateAgents: number; ghostCount: number };
}

let agentPanelCache: AgentPanelData | null = null;

async function loadAgentPanel(container?: HTMLElement, highlightAgentId?: string): Promise<void> {
  const body = container || document.getElementById('learningsBody');
  if (!body) return;

  if (!agentPanelCache) {
    body.innerHTML = '<div style="padding: 8px 10px; font-size: 10px; color: var(--text-muted); font-style: italic;">Loading agent data...</div>';
    try {
      const resp = await fetch('/api/agents');
      agentPanelCache = await resp.json() as AgentPanelData;
    } catch (err) {
      body.innerHTML = '<div style="color: #e55; font-size: 10px; padding: 8px;">Failed to load agent data</div>';
      return;
    }
  }

  const data = agentPanelCache;
  if (!data || data.agents.length === 0) {
    body.innerHTML = '<div style="font-size: 10px; color: var(--text-muted); padding: 8px;">No agent data available</div>';
    return;
  }

  // Build feedback rates lookup
  const ratesByAgent = new Map<string, typeof data.feedbackRates[0]>();
  data.feedbackRates.forEach(r => ratesByAgent.set(r.agent, r));

  // §7.0.1: Filter agents when a node-click filter is active
  let agents = data.agents;
  let ghosts = data.ghostAgents;
  if (highlightAgentId) {
    const bare = highlightAgentId.replace(/^agent:/, '');
    agents = agents.filter(a => a.id === bare || a.id === highlightAgentId);
    ghosts = ghosts.filter(g => g.label === bare || g.label === highlightAgentId);
    if (agents.length === 0 && ghosts.length === 0) {
      body.innerHTML = `<div style="font-size:10px;color:var(--text-muted);padding:8px;">No agent data for "${bare}"</div>`;
      return;
    }
  }

  let html = '';

  // Feedback summary bar (only when unfiltered)
  if (!highlightAgentId) {
    const fb = data.feedbackSummary;
    const followRate = fb.totalSuggestions > 0 ? safeFixed((fb.followed / fb.totalSuggestions) * 100, 1, '0') : '0';
    const successRate = fb.followed > 0 ? safeFixed((fb.successful / fb.followed) * 100, 1, '0') : '0';
    html += `<div class="feedback-summary">
      <div class="feedback-stat"><span class="value">${fb.totalSuggestions}</span><span>suggestions</span></div>
      <div class="feedback-stat"><span class="value">${followRate}%</span><span>follow rate</span></div>
      <div class="feedback-stat"><span class="value">${successRate}%</span><span>success rate</span></div>
    </div>`;
  }

  // Hive agents first
  const hiveAgents = agents.filter(a => a.isHive);
  const templateAgents = agents.filter(a => a.isTemplate);
  const otherAgents = agents.filter(a => !a.isHive && !a.isTemplate);

  const renderAgentCard = (agent: AgentInfo): string => {
    const badgeClass = agent.isHive ? 'hive' : agent.isTemplate ? 'template' : 'template';
    const badgeText = agent.isHive ? 'Hive' : agent.isTemplate ? 'Template' : agent.topologyRole;
    const cardClass = agent.isHive ? 'hive' : 'template';
    const score = safeNum(agent.performanceScore, 0);
    const scoreColor = score > 0.7 ? '#4CAF50' : score > 0.4 ? '#FFB74D' : '#e55';

    // Feedback rate for this agent
    const rate = ratesByAgent.get(agent.id);
    let feedbackHtml = '';
    if (rate) {
      const pct = rate.followed > 0 ? safeFixed((rate.followed_success / rate.followed) * 100, 0, '-') : '-';
      feedbackHtml = `<div class="agent-feedback">Suggestions: ${rate.total} | Followed: ${rate.followed} | Success: ${pct}%</div>`;
    }

    // Capabilities summary
    const caps = agent.capabilities;
    const focus = (caps.focus as string) || '';
    const model = (caps.model as string) || '';
    const agentType = (caps.agentType as string) || '';

    let detailParts: string[] = [];
    if (agentType) detailParts.push(agentType);
    if (model) detailParts.push(model);
    if (focus) detailParts.push(focus);

    const lastUsed = agent.lastUsed ? new Date(agent.lastUsed).toLocaleDateString() : 'never';

    return `<div class="agent-card ${cardClass}" data-agent-id="${agent.id}">
      <div class="agent-name">
        ${agent.name || agent.id}
        <span class="agent-badge ${badgeClass}">${badgeText}</span>
      </div>
      <div class="agent-detail">
        ${detailParts.length > 0 ? detailParts.join(' · ') + '<br>' : ''}
        <div class="agent-score">
          Score: ${safeFixed(score, 2, '-')}
          <div class="agent-score-bar"><div class="agent-score-fill" style="width: ${score * 100}%; background: ${scoreColor};"></div></div>
          Last used: ${lastUsed}
        </div>
      </div>
      ${feedbackHtml}
    </div>`;
  };

  // Render sections
  if (hiveAgents.length > 0) {
    hiveAgents.forEach(a => { html += renderAgentCard(a); });
  }

  if (templateAgents.length > 0) {
    html += '<div style="padding: 4px 10px; font-size: 9px; color: var(--text-muted); border-top: 1px solid rgba(139,79,217,0.15); margin-top: 2px; font-weight: 600;">TEMPLATE AGENTS</div>';
    templateAgents.forEach(a => { html += renderAgentCard(a); });
  }

  if (otherAgents.length > 0) {
    otherAgents.forEach(a => { html += renderAgentCard(a); });
  }

  // Ghost agents section
  if (ghosts.length > 0) {
    html += '<div class="ghost-section">';
    html += '<h4>Routing Labels <span class="agent-badge ghost">Ghost</span></h4>';
    ghosts.forEach(g => {
      html += `<div class="ghost-row">
        <span>${g.label}</span>
        <span>${g.patternCount} patterns · ${g.totalVisits} visits</span>
      </div>`;
    });
    html += '</div>';
  }

  body.innerHTML = html;

  // Wire click handlers: hive agent cards → highlight graph node
  body.querySelectorAll('.agent-card.hive').forEach(card => {
    card.addEventListener('click', () => {
      const agentId = (card as HTMLElement).dataset.agentId;
      if (!agentId || !graphData) return;
      // Find the agent node in the graph
      const nodeIdx = graphData.nodes.findIndex(n => n.source === 'agent' && (n.id === `agent:${agentId}` || n.agentId === agentId));
      if (nodeIdx >= 0) {
        handleNodeClick(graphData.nodes[nodeIdx], nodeIdx);
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// TRAJECTORY GANTT PANEL (§5.2)
// ═══════════════════════════════════════════════════════════════════════════

interface TrajectoryGanttData {
  trajectories: Array<{
    id: string; agent: string; context: string; success: boolean;
    startTime: number; endTime: number; durationMs: number; stepCount: number;
    quality: number | null;
    steps: Array<{ action: string; state: string; reward: number; time: number }>;
  }>;
  meta: { total: number; successCount: number; contexts: Record<string, number>; timeRange: { min: number; max: number } };
}

let trajGanttCache: TrajectoryGanttData | null = null;

async function loadTrajGantt(highlightId?: string, container?: HTMLElement, filterAgent?: string): Promise<void> {
  const body = container || document.getElementById('learningsBody');
  if (!body) return;

  if (!trajGanttCache) {
    body.innerHTML = '<div style="padding:8px 10px;font-size:10px;color:var(--text-muted);font-style:italic;">Loading trajectory data...</div>';
    try {
      const resp = await fetch('/api/trajectories-gantt');
      trajGanttCache = await resp.json() as TrajectoryGanttData;
    } catch { body.innerHTML = '<div style="color:#e55;font-size:10px;padding:8px;">Failed to load</div>'; return; }
  }

  const data = trajGanttCache;
  if (!data || data.trajectories.length === 0) {
    body.innerHTML = '<div style="font-size:10px;color:var(--text-muted);padding:8px;">No trajectory data</div>';
    return;
  }

  // §7.0.1: Filter by agent if specified (e.g., clicking agent or pat_* node)
  let trajs = data.trajectories;
  if (filterAgent) {
    const bare = filterAgent.replace(/^agent:/, '');
    trajs = trajs.filter(t => t.agent === bare || t.agent === filterAgent);
    if (trajs.length === 0) {
      body.innerHTML = `<div style="font-size:10px;color:var(--text-muted);padding:8px;">No trajectories for agent "${bare}"</div>`;
      return;
    }
  }

  // Meta info rendered inline in learnings header

  const { min: tMin, max: tMax } = data.meta.timeRange;
  const tRange = tMax - tMin || 1;

  // Group by context
  const byContext = new Map<string, typeof trajs>();
  trajs.forEach(t => {
    const ctx = t.context || 'unknown';
    if (!byContext.has(ctx)) byContext.set(ctx, []);
    byContext.get(ctx)!.push(t);
  });

  let html = '';
  byContext.forEach((trajs, ctx) => {
    html += `<div class="gantt-context-group">${ctx} (${trajs.length})</div>`;
    trajs.forEach(t => {
      const left = safeFixed((t.startTime - tMin) / tRange * 100, 1, '0');
      const width = Math.max(1, safeNum((t.durationMs / tRange * 100), 1));
      const cls = t.success ? 'success' : 'failure';
      const highlight = t.id === highlightId ? 'outline:2px solid #fff;' : '';
      const dur = safeNum(t.durationMs) > 60000 ? `${safeFixed(t.durationMs / 60000, 1, '0')}m` : `${safeFixed(t.durationMs / 1000, 1, '0')}s`;
      const shortId = t.id.slice(0, 20);

      html += `<div class="gantt-row" data-traj-id="${t.id}">
        <div class="gantt-label" title="${t.id}">${shortId}</div>
        <div class="gantt-track">
          <div class="gantt-bar ${cls}" style="left:${left}%;width:${safeFixed(width, 1, '1')}%;${highlight}" title="${t.agent} | ${t.stepCount} steps | ${dur} | ${t.success ? 'OK' : 'FAIL'}"></div>
        </div>
      </div>`;

      // Expandable steps (hidden by default)
      html += `<div class="gantt-steps" data-steps-for="${t.id}">`;
      t.steps.forEach(s => {
        const safeReward = safeNum(s.reward, 0);
        const rColor = safeReward >= 0.7 ? '#4CAF50' : safeReward >= 0.5 ? '#FFB74D' : '#e55';
        html += `<div class="gantt-step">
          <span class="gantt-step-action">${s.action || '-'}</span>
          <span>${s.state || '-'}</span>
          <span class="gantt-step-reward" style="color:${rColor}">${safeFixed(safeReward, 1, '0')}</span>
        </div>`;
      });
      html += '</div>';
    });
  });

  body.innerHTML = html;

  // Click to expand/collapse steps + reverse-wire to neural_pattern graph node (§7 line 1606)
  body.querySelectorAll('.gantt-row').forEach(row => {
    row.addEventListener('click', () => {
      const id = (row as HTMLElement).dataset.trajId;
      const steps = body.querySelector(`[data-steps-for="${id}"]`) as HTMLElement | null;
      if (steps) steps.style.display = steps.style.display === 'none' ? 'block' : 'none';
    });
    // Double-click → navigate to the neural_pattern node whose trajectoryId matches
    row.addEventListener('dblclick', () => {
      const trajId = (row as HTMLElement).dataset.trajId;
      if (!trajId || !graphData) return;
      const nodeIdx = graphData.nodes.findIndex(n =>
        n.source === 'neural_pattern' && n.trajectoryId === trajId
      );
      if (nodeIdx >= 0) {
        handleNodeClick(graphData.nodes[nodeIdx], nodeIdx);
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// EDIT TIMELINE PANEL (§5.3)
// ═══════════════════════════════════════════════════════════════════════════

interface EditTimelineData {
  edits: Array<{ id: string; content: string; fileName: string; domain: string | null; timestamp: number; createdAt: number; isEmpty: boolean }>;
  sessionEdits: Array<{ id: number; file: string; timestamp: number; createdAt: number }>;
  meta: { editMemoryCount: number; sessionEditCount: number; emptyContentCount: number;
    files: Array<{ file: string; count: number }>; timeRange: { min: number; max: number } };
}

let editTimelineCache: EditTimelineData | null = null;
let editTimelineFilterFile: string | null = null;

async function loadEditTimeline(filterFile?: string, container?: HTMLElement): Promise<void> {
  const body = container || document.getElementById('learningsBody');
  if (!body) return;

  if (filterFile !== undefined) editTimelineFilterFile = filterFile;

  if (!editTimelineCache) {
    body.innerHTML = '<div style="padding:8px 10px;font-size:10px;color:var(--text-muted);font-style:italic;">Loading edit data...</div>';
    try {
      const resp = await fetch('/api/edit-timeline');
      editTimelineCache = await resp.json() as EditTimelineData;
    } catch { body.innerHTML = '<div style="color:#e55;font-size:10px;padding:8px;">Failed to load</div>'; return; }
  }

  const data = editTimelineCache;
  // Meta info rendered inline in learnings header

  // Render session edits as primary timeline (higher resolution)
  let edits = data.sessionEdits;
  if (editTimelineFilterFile) {
    edits = edits.filter(e => e.file === editTimelineFilterFile || e.file.includes(editTimelineFilterFile!));
  }

  if (edits.length === 0) {
    body.innerHTML = '<div style="font-size:10px;color:var(--text-muted);padding:8px;">No edit events' + (editTimelineFilterFile ? ` for "${editTimelineFilterFile}"` : '') + '</div>';
    return;
  }

  const { min: tMin, max: tMax } = data.meta.timeRange;
  const tRange = tMax - tMin || 1;

  // Scatter chart at top
  let html = '<div class="timeline-chart" style="height:80px;margin:8px;position:relative;border-bottom:1px solid rgba(139,79,217,0.2);">';
  // Get unique files for Y-axis mapping
  const uniqueFiles = [...new Set(edits.map(e => e.file))].sort();
  const fileYMap = new Map<string, number>();
  uniqueFiles.forEach((f, i) => fileYMap.set(f, (i / Math.max(uniqueFiles.length - 1, 1)) * 70 + 5));

  edits.forEach(e => {
    const x = safeFixed((e.timestamp - tMin) / tRange * 100, 1, '0');
    const y = fileYMap.get(e.file) || 40;
    html += `<div class="timeline-chart-dot" style="left:${x}%;top:${y}px;" title="${e.file}\n${new Date(e.timestamp).toLocaleString()}" data-file="${e.file}"></div>`;
  });
  html += '</div>';

  // File list below
  html += '<div style="padding:4px 8px;font-size:9px;color:var(--text-muted);border-bottom:1px solid rgba(139,79,217,0.15);font-weight:600;">FILES (${uniqueFiles.length})</div>';
  const fileCounts = new Map<string, number>();
  edits.forEach(e => fileCounts.set(e.file, (fileCounts.get(e.file) || 0) + 1));
  const sortedFiles = [...fileCounts.entries()].sort((a, b) => b[1] - a[1]);

  sortedFiles.forEach(([file, count]) => {
    const isFiltered = editTimelineFilterFile === file;
    html += `<div class="timeline-row${isFiltered ? ' edit-filter-active' : ''}" data-edit-file="${file}">
      <div class="timeline-dot has-content"></div>
      <div class="timeline-file" title="${file}">${file || '(empty)'}</div>
      <div style="flex:1;font-size:9px;color:var(--text-muted);">${count} edits</div>
    </div>`;
  });

  body.innerHTML = html;

  // Click file row → highlight file node in graph
  body.querySelectorAll('.timeline-row').forEach(row => {
    row.addEventListener('click', () => {
      const file = (row as HTMLElement).dataset.editFile;
      if (!file || !graphData) return;
      const nodeIdx = graphData.nodes.findIndex(n => n.source === 'file' && (n.id === `file:${file}` || (n.filePath && n.filePath.endsWith(file))));
      if (nodeIdx >= 0) handleNodeClick(graphData.nodes[nodeIdx], nodeIdx);
    });
  });

  // Click chart dot → highlight file node
  body.querySelectorAll('.timeline-chart-dot').forEach(dot => {
    dot.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const file = (dot as HTMLElement).dataset.file;
      if (!file || !graphData) return;
      const nodeIdx = graphData.nodes.findIndex(n => n.source === 'file' && (n.id === `file:${file}` || (n.filePath && n.filePath.endsWith(file))));
      if (nodeIdx >= 0) handleNodeClick(graphData.nodes[nodeIdx], nodeIdx);
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMAND TIMELINE PANEL (§5.4)
// ═══════════════════════════════════════════════════════════════════════════

interface CmdTimelineData {
  commands: Array<{ id: string; content: string; cmdName: string; domain: string | null; timestamp: number; createdAt: number }>;
  meta: { total: number; timeRange: { min: number; max: number } };
}

let cmdTimelineCache: CmdTimelineData | null = null;

async function loadCmdTimeline(container?: HTMLElement, filterPrefix?: string): Promise<void> {
  const body = container || document.getElementById('learningsBody');
  if (!body) return;

  if (!cmdTimelineCache) {
    body.innerHTML = '<div style="padding:8px 10px;font-size:10px;color:var(--text-muted);font-style:italic;">Loading command data...</div>';
    try {
      const resp = await fetch('/api/command-timeline');
      cmdTimelineCache = await resp.json() as CmdTimelineData;
    } catch { body.innerHTML = '<div style="color:#e55;font-size:10px;padding:8px;">Failed to load</div>'; return; }
  }

  const data = cmdTimelineCache;
  // Meta info rendered inline in learnings header

  // §7.0.1: Filter by state prefix if specified (e.g., pat_* with cmd_ state)
  let cmds = data.commands;
  if (filterPrefix) {
    const keyword = filterPrefix.replace(/^cmd_/, '').toLowerCase();
    cmds = cmds.filter(c => c.content.toLowerCase().includes(keyword));
  }

  if (cmds.length === 0) {
    body.innerHTML = `<div style="font-size:10px;color:var(--text-muted);padding:8px;">No command data${filterPrefix ? ` matching "${filterPrefix}"` : ''}</div>`;
    return;
  }

  let html = '';
  cmds.forEach(c => {
    const isSuccess = c.content.includes('succeeded');
    const isFail = c.content.includes('failed');
    const statusCls = isFail ? 'failure' : 'success';
    const statusText = isFail ? 'FAIL' : isSuccess ? 'OK' : '?';
    const time = new Date(c.timestamp).toLocaleString();
    const preview = c.content.length > 80 ? c.content.slice(0, 77) + '...' : c.content;

    html += `<div class="cmd-row">
      <span class="cmd-status ${statusCls}">${statusText}</span>
      <span class="cmd-name" title="${c.content}">${preview}</span>
      <span class="cmd-time">${time}</span>
    </div>`;
  });

  body.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════════════════
// ANALYTICS PANEL — Calibration / Errors / Co-edit (§5.6-5.8)
// ═══════════════════════════════════════════════════════════════════════════

interface CalibrationData { buckets: Array<{ bucket: number; total: number; correct: number; accuracy: number }>; meta: { bucketCount: number; predictionCount: number } }
interface ErrorData { patterns: Array<{ code: string; type: string; category: string; count: number; last_seen: number }>; fixes: Array<{ code: string; category: string; fix_description: string; timestamp: number }>; meta: { patternCount: number; fixCount: number } }
interface CoeditData { sequences: Array<{ from_file: string; to_file: string; count: number }>; meta: { pairCount: number; fileCount: number; files: string[] } }

let calibrationCache: CalibrationData | null = null;
let errorCache: ErrorData | null = null;
let coeditCache: CoeditData | null = null;
let analyticsActiveTab = 'calibration';

async function loadAnalytics(tab?: string, container?: HTMLElement): Promise<void> {
  if (tab) analyticsActiveTab = tab;
  const body = container || document.getElementById('learningsBody');
  if (!body) return;

  // Build analytics sub-tabs + content area inside the body
  let analyticsHtml = '<div class="analytics-tabs">';
  analyticsHtml += `<div class="analytics-tab${analyticsActiveTab === 'calibration' ? ' active' : ''}" data-analytics-tab="calibration">Calibration</div>`;
  analyticsHtml += `<div class="analytics-tab${analyticsActiveTab === 'errors' ? ' active' : ''}" data-analytics-tab="errors">Errors</div>`;
  analyticsHtml += `<div class="analytics-tab${analyticsActiveTab === 'coedit' ? ' active' : ''}" data-analytics-tab="coedit">Co-edit</div>`;
  analyticsHtml += '</div>';
  analyticsHtml += '<div id="analyticsInnerBody" class="analytics-content"></div>';
  body.innerHTML = analyticsHtml;

  const innerBody = document.getElementById('analyticsInnerBody');
  if (!innerBody) return;

  if (analyticsActiveTab === 'calibration') {
    await loadCalibrationTab(innerBody);
  } else if (analyticsActiveTab === 'errors') {
    await loadErrorsTab(innerBody);
  } else if (analyticsActiveTab === 'coedit') {
    await loadCoeditTab(innerBody);
  }

  // Wire analytics sub-tab clicks
  body.querySelectorAll('[data-analytics-tab]').forEach(t => {
    t.addEventListener('click', () => {
      const tabName = (t as HTMLElement).dataset.analyticsTab;
      if (tabName) loadAnalytics(tabName, body);
    });
  });
}

async function loadCalibrationTab(body: HTMLElement): Promise<void> {
  if (!calibrationCache) {
    body.innerHTML = '<div style="font-size:10px;color:var(--text-muted);padding:8px;font-style:italic;">Loading calibration data...</div>';
    try {
      const resp = await fetch('/api/calibration');
      calibrationCache = await resp.json() as CalibrationData;
    } catch { body.innerHTML = '<div style="color:#e55;font-size:10px;padding:8px;">Failed to load</div>'; return; }
  }

  const data = calibrationCache;
  const metaEl = document.getElementById('analyticsMeta');
  if (metaEl) metaEl.textContent = `${data.meta.predictionCount} predictions | ${data.meta.bucketCount} buckets`;

  if (data.buckets.length === 0) {
    body.innerHTML = '<div style="font-size:10px;color:var(--text-muted);padding:8px;">No calibration data</div>';
    return;
  }

  // SVG calibration curve
  const w = 460, h = 180, pad = 30;
  let svg = `<svg width="${w}" height="${h}" style="display:block;margin:8px auto;">`;
  // Diagonal (perfect calibration)
  svg += `<line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${pad}" stroke="rgba(139,79,217,0.3)" stroke-dasharray="4"/>`;
  // Axes
  svg += `<line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" stroke="rgba(255,255,255,0.2)"/>`;
  svg += `<line x1="${pad}" y1="${pad}" x2="${pad}" y2="${h - pad}" stroke="rgba(255,255,255,0.2)"/>`;
  // Labels
  svg += `<text x="${w / 2}" y="${h - 5}" fill="var(--text-muted)" font-size="9" text-anchor="middle">Confidence</text>`;
  svg += `<text x="10" y="${h / 2}" fill="var(--text-muted)" font-size="9" text-anchor="middle" transform="rotate(-90,10,${h / 2})">Accuracy</text>`;

  // Data points + line
  const points = data.buckets.map(b => ({
    x: pad + (b.bucket * (w - 2 * pad)),
    y: (h - pad) - (b.accuracy * (h - 2 * pad)),
    bucket: b.bucket,
    accuracy: b.accuracy,
    total: b.total
  }));

  if (points.length > 1) {
    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
    svg += `<path d="${pathD}" fill="none" stroke="var(--primary)" stroke-width="2"/>`;
  }

  points.forEach(p => {
    const r = Math.min(8, Math.max(3, safeNum(p.total, 1) / 10));
    svg += `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="var(--primary-active)" stroke="rgba(0,0,0,0.3)" stroke-width="1">
      <title>Bucket ${safeFixed(p.bucket, 1, '0')}: accuracy=${safeFixed(p.accuracy, 3, '0')} (${safeNum(p.total, 0)} samples)</title></circle>`;
  });

  svg += '</svg>';

  // Summary table
  let table = '<div style="padding:0 8px;font-size:9px;"><table style="width:100%;border-collapse:collapse;">';
  table += '<tr style="color:var(--text-muted);border-bottom:1px solid rgba(139,79,217,0.15);"><th style="text-align:left;padding:2px 4px;">Bucket</th><th>Total</th><th>Correct</th><th>Accuracy</th></tr>';
  data.buckets.forEach(b => {
    table += `<tr style="border-bottom:1px solid rgba(139,79,217,0.05);color:var(--text-secondary);">
      <td style="padding:2px 4px;">${safeFixed(b.bucket, 1, '0')}</td><td style="text-align:center;">${safeNum(b.total, 0)}</td>
      <td style="text-align:center;">${safeNum(b.correct, 0)}</td><td style="text-align:center;">${safeFixed(b.accuracy, 3, '0')}</td></tr>`;
  });
  table += '</table></div>';

  body.innerHTML = svg + table;
}

async function loadErrorsTab(body: HTMLElement): Promise<void> {
  if (!errorCache) {
    body.innerHTML = '<div style="font-size:10px;color:var(--text-muted);padding:8px;font-style:italic;">Loading error data...</div>';
    try {
      const resp = await fetch('/api/errors');
      errorCache = await resp.json() as ErrorData;
    } catch { body.innerHTML = '<div style="color:#e55;font-size:10px;padding:8px;">Failed to load</div>'; return; }
  }

  const data = errorCache;
  const metaEl = document.getElementById('analyticsMeta');
  if (metaEl) metaEl.textContent = `${data.meta.patternCount} patterns | ${data.meta.fixCount} fixes`;

  const maxCount = Math.max(...data.patterns.map(p => safeNum(p.count, 0)), 1);

  let html = '<div style="padding:4px 8px;font-size:9px;color:var(--text-muted);font-weight:600;border-bottom:1px solid rgba(139,79,217,0.15);">ERROR PATTERNS</div>';
  data.patterns.forEach(p => {
    const w = safeFixed(safeNum(p.count, 0) / maxCount * 100, 0, '0');
    html += `<div class="error-bar">
      <span class="error-bar-label" title="${p.code}">${p.category || p.type}</span>
      <div style="flex:1;"><div class="error-bar-fill" style="width:${w}%;"></div></div>
      <span class="error-bar-count">${p.count}x</span>
    </div>`;
  });

  if (data.fixes.length > 0) {
    html += '<div style="padding:4px 8px;margin-top:8px;font-size:9px;color:var(--text-muted);font-weight:600;border-bottom:1px solid rgba(139,79,217,0.15);">RECENT FIXES</div>';
    data.fixes.slice(0, 15).forEach(f => {
      const time = new Date(f.timestamp).toLocaleDateString();
      html += `<div class="fix-row">
        <span style="color:var(--text-secondary);min-width:60px;">${f.category}</span>
        <span style="flex:1;">${f.fix_description || f.code}</span>
        <span>${time}</span>
      </div>`;
    });
  }

  body.innerHTML = html;
}

async function loadCoeditTab(body: HTMLElement): Promise<void> {
  if (!coeditCache) {
    body.innerHTML = '<div style="font-size:10px;color:var(--text-muted);padding:8px;font-style:italic;">Loading co-edit data...</div>';
    try {
      const resp = await fetch('/api/file-coedit');
      coeditCache = await resp.json() as CoeditData;
    } catch { body.innerHTML = '<div style="color:#e55;font-size:10px;padding:8px;">Failed to load</div>'; return; }
  }

  const data = coeditCache;
  const metaEl = document.getElementById('analyticsMeta');
  if (metaEl) metaEl.textContent = `${data.meta.pairCount} pairs | ${data.meta.fileCount} files`;

  if (data.sequences.length === 0) {
    body.innerHTML = '<div style="font-size:10px;color:var(--text-muted);padding:8px;">No co-edit data</div>';
    return;
  }

  // Simple arc/chord representation using SVG
  const files = data.meta.files;
  const n = files.length;
  const w = 460, h = 300;
  const cx = w / 2, cy = h / 2, r = 120;

  // Position files around a circle
  const filePos = new Map<string, { x: number; y: number; angle: number }>();
  files.forEach((f, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    filePos.set(f, { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r, angle });
  });

  const maxCount = Math.max(...data.sequences.map(s => s.count), 1);

  let svg = `<svg width="${w}" height="${h}" style="display:block;margin:0 auto;">`;

  // Draw arcs
  data.sequences.forEach(s => {
    const from = filePos.get(s.from_file);
    const to = filePos.get(s.to_file);
    if (!from || !to) return;
    const opacity = 0.2 + (s.count / maxCount) * 0.6;
    const strokeW = 1 + (s.count / maxCount) * 3;
    svg += `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="var(--primary)" stroke-width="${strokeW}" opacity="${opacity}">
      <title>${s.from_file} ↔ ${s.to_file} (${s.count}x)</title></line>`;
  });

  // Draw file labels
  files.forEach(f => {
    const p = filePos.get(f)!;
    const labelR = r + 15;
    const lx = cx + Math.cos(p.angle) * labelR;
    const ly = cy + Math.sin(p.angle) * labelR;
    const anchor = p.angle > Math.PI / 2 && p.angle < 3 * Math.PI / 2 ? 'end' : 'start';
    svg += `<circle cx="${p.x}" cy="${p.y}" r="4" fill="var(--primary-active)"/>`;
    svg += `<text x="${lx}" y="${ly}" fill="var(--text-secondary)" font-size="9" text-anchor="${anchor}" dominant-baseline="middle">${f}</text>`;
  });

  svg += '</svg>';

  // Pair list
  let list = '<div style="padding:4px 8px;font-size:9px;color:var(--text-muted);font-weight:600;border-bottom:1px solid rgba(139,79,217,0.15);">CO-EDIT PAIRS</div>';
  data.sequences.forEach(s => {
    list += `<div class="fix-row" data-from-file="${s.from_file}" data-to-file="${s.to_file}" style="cursor:pointer;">
      <span style="color:var(--text-secondary);">${s.from_file}</span>
      <span>↔</span>
      <span style="color:var(--text-secondary);">${s.to_file}</span>
      <span style="margin-left:auto;font-weight:600;">${s.count}x</span>
    </div>`;
  });

  body.innerHTML = svg + list;

  // Click pair → highlight both file nodes in graph
  body.querySelectorAll('.fix-row[data-from-file]').forEach(row => {
    row.addEventListener('click', () => {
      const fromFile = (row as HTMLElement).dataset.fromFile;
      const toFile = (row as HTMLElement).dataset.toFile;
      if (!fromFile || !toFile || !graphData) return;
      // Highlight first file node found
      const fromIdx = graphData.nodes.findIndex(n => n.source === 'file' && n.id === `file:${fromFile}`);
      if (fromIdx >= 0) handleNodeClick(graphData.nodes[fromIdx], fromIdx);
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED LEARNINGS PANEL
// ═══════════════════════════════════════════════════════════════════════════

let learningsActiveTab = 'qtable';

/** Per-tab filter data computed from a clicked graph node (§7.0.1) */
interface LearningsTabFilter {
  highlightId?: string;        // Gantt: trajectory bar to outline
  highlightState?: string;     // Q-Table: row to bold/outline
  highlightAction?: string;    // Q-Table: column to bold/outline
  highlightAgentId?: string;   // Agents: card to outline + scroll
  highlightFile?: string;      // Analytics co-edit: file to highlight
  filterFile?: string;         // Edits: filter to this file
  filterAgent?: string;        // Gantt: show only this agent's trajectories
  filterPrefix?: string;       // Cmds: filter by state prefix
  filterKeyword?: string;      // Q-Table: substring match on states (A5)
  filterCells?: Array<{state: string; action: string}>; // Q-Table: exact cells from routes_to JOIN (A3)
  sub?: string;                // Analytics: which sub-tab (calibration/errors/coedit)
}

interface LearningsFilters {
  defaultTab: string | null;   // Tab to auto-open (null = don't auto-open panel)
  nodeLabel: string;           // Display label for filter bar
  qtable: LearningsTabFilter | null;
  gantt: LearningsTabFilter | null;
  edits: LearningsTabFilter | null;
  agents: LearningsTabFilter | null;
  cmds: LearningsTabFilter | null;
  analytics: LearningsTabFilter | null;
}

let currentLearningsFilters: LearningsFilters | null = null;

/** Strip client-side ID prefixes to get raw DB IDs (A6) */
// @ts-ignore: reserved utility function
function getDbId(node: GraphNode): string {
  const id = String(node.id);
  if (node.source === 'neural_pattern') return id.replace(/^np-/, '');
  return id;
}

/** Parse pat_* node ID into {state, action} using lastIndexOf (A7) */
function parsePatId(patNodeId: string): { state: string; action: string } | null {
  const raw = String(patNodeId).replace(/^pat_/, '');
  const i = raw.lastIndexOf('_');
  if (i <= 0) return null;
  return { state: raw.substring(0, i), action: raw.substring(i + 1) };
}

/** Find about_file edge target for a node → file basename (A4) */
function getEditsFilterForNode(nodeId: string): string | null {
  if (!graphData) return null;
  for (const edge of graphData.edges) {
    if (edge.type !== 'about_file') continue;
    const srcIdx = typeof edge.source === 'number' ? edge.source : (edge.source as GraphNode).nodeIndex ?? -1;
    if (srcIdx < 0 || String(graphData.nodes[srcIdx]?.id) !== nodeId) continue;
    const tgtIdx = typeof edge.target === 'number' ? edge.target : (edge.target as GraphNode).nodeIndex ?? -1;
    if (tgtIdx < 0) continue;
    const tgtId = String(graphData.nodes[tgtIdx]?.id || '');
    if (tgtId.startsWith('file:')) return tgtId.replace('file:', '');
  }
  return null;
}

/** Find Q-table cells that route to a file node via routes_to edges (A3) */
function getQTableCellsForFile(fileNodeId: string): Array<{state: string; action: string}> | null {
  if (!graphData) return null;
  const cells: Array<{state: string; action: string}> = [];
  for (const edge of graphData.edges) {
    if (edge.type !== 'routes_to') continue;
    const tgtIdx = typeof edge.target === 'number' ? edge.target : (edge.target as GraphNode).nodeIndex ?? -1;
    if (tgtIdx < 0 || String(graphData.nodes[tgtIdx]?.id) !== fileNodeId) continue;
    const srcIdx = typeof edge.source === 'number' ? edge.source : (edge.source as GraphNode).nodeIndex ?? -1;
    if (srcIdx < 0) continue;
    const srcNode = graphData.nodes[srcIdx];
    if (srcNode?.source !== 'q_pattern') continue;
    const parsed = parsePatId(String(srcNode.id));
    if (parsed) cells.push(parsed);
  }
  return cells.length > 0 ? cells : null;
}

/** Extract Q-table keyword for foundation or neural_* nodes (A5) */
function getQTableKeyword(node: GraphNode): string | null {
  if (node.memoryType === 'foundation' || node.isFoundation) {
    const doc = node.document || node.sourceDoc || '';
    if (!doc) return null;
    const segments = doc.split(/[-_]/).filter(s => s.length > 2).map(s => s.toLowerCase());
    return segments.find(s => !['adr', 'fix'].includes(s)) || segments[0] || null;
  }
  if (node.memoryType && node.memoryType.startsWith('neural_')) {
    const category = node.memoryType.replace('neural_', '');
    return category.length >= 2 ? category : null;
  }
  return null;
}

/**
 * Probe whether a tab would have data for the given filter.
 * Uses cached API data when available; fetches + caches otherwise.
 * Returns true if the tab would show content, false if it would be empty.
 */
async function probeTabHasData(tabName: string, filter: LearningsTabFilter | null): Promise<boolean> {
  switch (tabName) {
    case 'qtable': {
      if (!qtableCache) {
        try { qtableCache = await (await fetch('/api/qtable')).json() as QTableData; } catch { return false; }
      }
      if (!qtableCache || qtableCache.states.length === 0) return false;
      if (!filter) return true;
      if (filter.highlightAction && !qtableCache.actions.includes(filter.highlightAction)) return false;
      if (filter.highlightState && !qtableCache.states.includes(filter.highlightState)) return false;
      // A3: filterCells — check if any cell's state/action exists in the Q-table
      if (filter.filterCells) {
        return filter.filterCells.some(c =>
          qtableCache!.states.includes(c.state) && qtableCache!.actions.includes(c.action)
        );
      }
      // A5: filterKeyword — check if any state contains the keyword
      if (filter.filterKeyword) {
        const kw = filter.filterKeyword.toLowerCase();
        return qtableCache.states.some(s => s.toLowerCase().includes(kw));
      }
      return true;
    }
    case 'agents': {
      if (!agentPanelCache) {
        try { agentPanelCache = await (await fetch('/api/agents')).json() as AgentPanelData; } catch { return false; }
      }
      if (!agentPanelCache || agentPanelCache.agents.length === 0) return false;
      if (!filter) return true;
      if (filter.highlightAgentId) {
        const bare = filter.highlightAgentId.replace(/^agent:/, '');
        return agentPanelCache.agents.some(a => a.id === bare || a.id === filter.highlightAgentId) ||
               agentPanelCache.ghostAgents.some(g => g.label === bare || g.label === filter.highlightAgentId);
      }
      return true;
    }
    case 'gantt': {
      if (!trajGanttCache) {
        try { trajGanttCache = await (await fetch('/api/trajectories-gantt')).json() as TrajectoryGanttData; } catch { return false; }
      }
      if (!trajGanttCache || trajGanttCache.trajectories.length === 0) return false;
      if (!filter) return true;
      if (filter.filterAgent) {
        const bare = filter.filterAgent.replace(/^agent:/, '');
        return trajGanttCache.trajectories.some(t => t.agent === bare || t.agent === filter.filterAgent);
      }
      if (filter.highlightId) {
        return trajGanttCache.trajectories.some(t => t.id === filter.highlightId);
      }
      return true;
    }
    case 'edits': {
      if (!editTimelineCache) {
        try { editTimelineCache = await (await fetch('/api/edit-timeline')).json() as EditTimelineData; } catch { return false; }
      }
      if (!editTimelineCache) return false;
      const edits = editTimelineCache.sessionEdits;
      if (edits.length === 0) return false;
      if (!filter) return true;
      if (filter.filterFile) {
        return edits.some(e => e.file === filter.filterFile || e.file.includes(filter.filterFile!));
      }
      return true;
    }
    case 'cmds': {
      if (!cmdTimelineCache) {
        try { cmdTimelineCache = await (await fetch('/api/command-timeline')).json() as CmdTimelineData; } catch { return false; }
      }
      if (!cmdTimelineCache) return false;
      const cmds = cmdTimelineCache.commands;
      if (cmds.length === 0) return false;
      if (!filter) return true;
      if (filter.filterPrefix) {
        const keyword = filter.filterPrefix.replace(/^cmd_/, '').toLowerCase();
        return cmds.some(c => c.content.toLowerCase().includes(keyword));
      }
      return true;
    }
    case 'analytics':
      return true; // analytics sub-tabs always have structure
    default:
      return false;
  }
}

/**
 * Probe all tabs in parallel and update their .no-data CSS class
 * based on actual data availability for the current filters.
 */
async function updateTabDataStates(filters: LearningsFilters): Promise<void> {
  if (!filters.nodeLabel) {
    // No node filter → remove all no-data classes
    document.querySelectorAll('.learn-tab').forEach(t => t.classList.remove('no-data'));
    return;
  }

  const tabNames = ['qtable', 'gantt', 'edits', 'agents', 'cmds', 'analytics'] as const;
  const tabFilters: Record<string, LearningsTabFilter | null> = {
    qtable: filters.qtable, gantt: filters.gantt, edits: filters.edits,
    agents: filters.agents, cmds: filters.cmds, analytics: filters.analytics,
  };

  const results = await Promise.all(
    tabNames.map(async name => ({ name, hasData: await probeTabHasData(name, tabFilters[name]) }))
  );

  // Only update if the filters haven't changed while we were probing
  if (currentLearningsFilters !== filters) return;

  document.querySelectorAll('.learn-tab').forEach(t => {
    const tabName = (t as HTMLElement).dataset.tab || '';
    const result = results.find(r => r.name === tabName);
    if (result) {
      t.classList.toggle('no-data', !result.hasData);
    }
  });
}

/**
 * §7.0.2: Compute per-tab filter data from a clicked graph node.
 * Returns a LearningsFilters object with per-tab filter instructions
 * matching the cross-reference table in VIZ-ARCHITECTURE.md §7.0.1.
 */
function getLearningsFilters(node: GraphNode): LearningsFilters {
  const nodeId = String(node.id);
  const nodeLabel = String(node.key || node.id);

  // ── NEURAL PATTERN ── (A1, A6)
  // Gantt: highlight source trajectory | Q-Table: action match | Agents: agent match
  if (node.source === 'neural_pattern') {
    const agentMatch = (node.preview || '').match(/to (\S+) agent/);
    const agentName = agentMatch ? agentMatch[1] : null;
    // A1: use trajectory_id from metadata (null for imported patterns)
    const trajId = node.trajectoryId || undefined;
    return {
      defaultTab: 'gantt',
      nodeLabel,
      gantt: trajId ? { highlightId: trajId } : null,
      qtable: agentName ? { highlightAction: agentName } : null,
      agents: agentName ? { highlightAgentId: agentName } : null,
      edits: null, cmds: null, analytics: null,
    };
  }

  // ── AGENT ── (A2)
  // Agents: highlight card | Q-Table: action=id | Gantt: agent filter
  if (node.source === 'agent') {
    const aid = node.agentId || nodeId;
    return {
      defaultTab: 'agents',
      nodeLabel,
      agents: { highlightAgentId: aid },
      qtable: { highlightAction: aid },
      gantt: { filterAgent: aid },
      edits: null, cmds: null,
      analytics: null, // A2: feedback data lives in Agents tab, not Analytics
    };
  }

  // ── FILE ── (A3, A4)
  // Edits: file filter | Q-Table: routes_to JOIN | Analytics: co-edit chord
  if (node.source === 'file') {
    const basename = nodeId.replace(/^file:/, '');
    // A3: client-side JOIN — find Q-table cells that route to this file
    const cells = getQTableCellsForFile(nodeId);
    return {
      defaultTab: 'edits',
      nodeLabel,
      edits: { filterFile: basename },
      qtable: cells ? { filterCells: cells } : null,
      analytics: { sub: 'coedit', highlightFile: basename },
      gantt: null, agents: null, cmds: null,
    };
  }

  // ── Q-PATTERN ──
  // Q-Table: exact cell | Gantt: agent's trajs | Edits: routed file | Agents: action agent | Cmds: cmd_ prefix
  if (node.source === 'q_pattern') {
    const state = node.state || '';
    const action = node.action || '';
    // Find routed file from graph edges
    let routedFile: string | undefined;
    if (graphData) {
      for (const edge of graphData.edges) {
        if (edge.type !== 'routes_to') continue;
        const srcIdx = typeof edge.source === 'number' ? edge.source : (edge.source as GraphNode).nodeIndex ?? -1;
        if (srcIdx < 0 || String(graphData.nodes[srcIdx]?.id) !== nodeId) continue;
        const tgtIdx = typeof edge.target === 'number' ? edge.target : (edge.target as GraphNode).nodeIndex ?? -1;
        if (tgtIdx >= 0) {
          routedFile = String(graphData.nodes[tgtIdx]?.id || '').replace(/^file:/, '');
          break;
        }
      }
    }
    return {
      defaultTab: 'qtable',
      nodeLabel,
      qtable: { highlightState: state, highlightAction: action },
      agents: action ? { highlightAgentId: action } : null,
      gantt: action ? { filterAgent: action } : null,
      edits: routedFile ? { filterFile: routedFile } : null,
      cmds: state.startsWith('cmd_') ? { filterPrefix: state } : null,
      analytics: null,
    };
  }

  // ── FOUNDATION MEMORY ── (A4, A5)
  // Q-Table: domain keyword | Edits: via about_file edges
  if (node.source === 'memory' && (node.isFoundation || node.memoryType === 'foundation')) {
    const keyword = getQTableKeyword(node);
    const editFile = getEditsFilterForNode(nodeId);
    return {
      defaultTab: null,
      nodeLabel,
      qtable: keyword ? { filterKeyword: keyword } : null,
      edits: editFile ? { filterFile: editFile } : null,
      gantt: null, agents: null, cmds: null, analytics: null,
    };
  }

  // ── NEURAL_* MEMORY ── (A5)
  // Q-Table: category keyword
  if (node.source === 'memory' && (node.memoryType || '').startsWith('neural_')) {
    const keyword = getQTableKeyword(node);
    return {
      defaultTab: null,
      nodeLabel,
      qtable: keyword ? { filterKeyword: keyword } : null,
      gantt: null, edits: null, agents: null, cmds: null, analytics: null,
    };
  }

  // ── ADR, DESIGN_*, EVERYTHING ELSE ──
  return {
    defaultTab: null,
    nodeLabel,
    qtable: null, gantt: null, edits: null, agents: null, cmds: null, analytics: null,
  };
}

function openLearningsPanel(tab: string, filters: LearningsFilters): void {
  // Mutual exclusivity: Hide Settings panel when opening Learnings
  const configPanel = document.getElementById('config');
  if (configPanel && configPanel.style.display !== 'none') {
    configPanel.style.display = 'none';
    document.getElementById('configBtn')?.classList.remove('active');
  }

  // Show Learnings panel
  const learningsPanel = document.getElementById('learnings');
  if (!learningsPanel) return;
  learningsPanel.style.display = 'block';
  document.getElementById('learningsBtn')?.classList.add('active');

  // Set state
  learningsActiveTab = tab;
  currentLearningsFilters = filters;

  // Update filter bar
  const filterBar = document.getElementById('learningsFilter');
  const filterLabel = document.getElementById('learningsFilterLabel');
  if (filterBar && filterLabel) {
    if (filters.nodeLabel) {
      filterBar.style.display = 'flex';
      filterLabel.textContent = filters.nodeLabel;
    } else {
      filterBar.style.display = 'none';
    }
  }

  // Update tab active states; clear stale no-data classes (async probe will set them correctly)
  document.querySelectorAll('.learn-tab').forEach(t => {
    const tabName = (t as HTMLElement).dataset.tab || '';
    t.classList.toggle('active', tabName === learningsActiveTab);
    t.classList.remove('no-data');
  });

  // Load the active tab content
  loadLearningsTab();

  // Probe actual data availability for all tabs and update no-data state
  updateTabDataStates(filters);

  // Reposition dependent panels
  repositionNodeDetails();
  repositionSearch();
}

async function loadLearningsTab(): Promise<void> {
  const body = document.getElementById('learningsBody');
  if (!body) return;

  const f = currentLearningsFilters;

  switch (learningsActiveTab) {
    case 'qtable': {
      const tf = f?.qtable;
      await loadQTableHeatmap(body, tf || undefined);
      break;
    }
    case 'agents': {
      const tf = f?.agents;
      await loadAgentPanel(body, tf?.highlightAgentId);
      break;
    }
    case 'gantt': {
      const tf = f?.gantt;
      await loadTrajGantt(tf?.highlightId, body, tf?.filterAgent);
      break;
    }
    case 'edits': {
      const tf = f?.edits;
      await loadEditTimeline(tf?.filterFile, body);
      break;
    }
    case 'cmds': {
      const tf = f?.cmds;
      await loadCmdTimeline(body, tf?.filterPrefix);
      break;
    }
    case 'analytics': {
      const tf = f?.analytics;
      await loadAnalytics(tf?.sub, body);
      break;
    }
  }
}

function closeLearningsPanel(): void {
  const learningsPanel = document.getElementById('learnings');
  if (learningsPanel) learningsPanel.style.display = 'none';
  document.getElementById('learningsBtn')?.classList.remove('active');
  currentLearningsFilters = null;

  // Show Settings panel again
  const configPanel = document.getElementById('config');
  if (configPanel) configPanel.style.display = 'block';
  document.getElementById('configBtn')?.classList.add('active');

  repositionNodeDetails();
  repositionSearch();
}

function handleNodeHover(node: GraphNode | null, index: number | null): void {
  // Track hovered node for potential future use

  // Update tooltip
  const tooltip = document.getElementById('tooltip');
  if (!tooltip) return;

  if (node && index !== null) {
    tooltip.style.display = 'block';

    // Position tooltip near cursor
    const domainBadge = node.domain ? `<span class="domain-badge" style="background: #${(DOMAIN_COLORS[node.domain] || DOMAIN_COLORS.unknown).toString(16).padStart(6, '0')}; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-left: 8px;">${node.domain}</span>` : '';
    // Type-specific extra info
    let extraInfo = '';
    const src = node.source;
    switch (src) {
      case 'memory': {
        const memType = (node as any).memory_type || (node as any).memoryType || node.memoryType;
        extraInfo = memType ? `<div style="color:#6B2FB5;margin-top:4px;">Type: ${memType.replace(/_/g, ' ')}${node.domain ? ' · Domain: ' + node.domain : ''}</div>` : '';
        break;
      }
      case 'neural_pattern': {
        const conf = node.confidence ?? 0;
        extraInfo = `<div style="color:#9B59B6;margin-top:4px;">Category: ${node.category || node.namespace || '-'} · Confidence: ${(conf * 100).toFixed(1)}%${node.trajectoryId ? ' · Traj: ' + node.trajectoryId : ''}</div>`;
        break;
      }
      case 'q_pattern': {
        const qVal = node.qValue;
        extraInfo = `<div style="color:#22D3EE;margin-top:4px;">Q: ${typeof qVal === 'number' ? qVal.toFixed(4) : 'N/A'} · Visits: ${node.visits || 0}${node.state ? ' · State: ' + node.state : ''}</div>`;
        break;
      }
      case 'trajectory':
      case 'trajectory_success':
      case 'trajectory_failed': {
        extraInfo = `<div style="color:#22C55E;margin-top:4px;">Success: ${node.success ? 'Yes' : 'No'} · Steps: ${node.stepCount || 'N/A'}${node.agent ? ' · Agent: ' + node.agent : ''}</div>`;
        break;
      }
      case 'file': {
        extraInfo = `<div style="color:#1ABC9C;margin-top:4px;">File: ${node.filePath || String(node.id)}${node.fileType ? ' · Type: ' + node.fileType : ''}</div>`;
        break;
      }
      case 'agent': {
        extraInfo = `<div style="color:#34495E;margin-top:4px;">Agent: ${node.agentSourceType || 'unknown'} · Role: ${node.topologyRole || 'standalone'}${node.agentModel ? ' · Model: ' + node.agentModel : ''}</div>`;
        break;
      }
      case 'state': {
        extraInfo = `<div style="color:#F59E0B;margin-top:4px;">Patterns: ${(node as any).patternCount || 0} · Avg Q: ${typeof (node as any).avgQ === 'number' ? (node as any).avgQ.toFixed(4) : 'N/A'}</div>`;
        break;
      }
      case 'action': {
        extraInfo = `<div style="color:#10B981;margin-top:4px;">Patterns: ${(node as any).patternCount || 0} · Avg Q: ${typeof (node as any).avgQ === 'number' ? (node as any).avgQ.toFixed(4) : 'N/A'}</div>`;
        break;
      }
    }

    const typeLabel = NODE_TYPE_LABELS[node.source] || node.source;
    tooltip.innerHTML = `
      <div class="key">${node.key || node.id}${domainBadge}</div>
      <div class="ns"><span style="color:${NODE_SOURCE_COLORS_HEX[node.source] || '#6B2FB5'}">${typeLabel}</span> · ${node.namespace || '-'}</div>
      <div class="date">${node.timestamp ? new Date(node.timestamp).toLocaleString() : 'No date'}</div>
      <div class="preview">${(node.preview || '').substring(0, 200)}${(node.preview?.length || 0) > 200 ? '...' : ''}</div>
      ${extraInfo}
    `;

    // Position using mouse event (we'd need to track this)
    document.addEventListener('mousemove', positionTooltip);
  } else {
    tooltip.style.display = 'none';
    document.removeEventListener('mousemove', positionTooltip);
  }
}

function positionTooltip(e: MouseEvent): void {
  const tooltip = document.getElementById('tooltip');
  if (!tooltip) return;

  const x = Math.min(e.clientX + 15, window.innerWidth - tooltip.offsetWidth - 20);
  const y = Math.min(e.clientY + 15, window.innerHeight - tooltip.offsetHeight - 20);

  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

function handleNodeClick(node: GraphNode | null, index: number | null): void {
  // Clear previous selection (nodes + edges)
  if (renderer) {
    renderer.clearHighlights();
  }

  const contentPanel = document.getElementById('nodeContent');

  if (node && index !== null) {
    // Collect neighbors (1-level depth) and connected edge indices
    const neighbors = new Set<number>([index]);
    const connectedEdges = new Set<number>();

    if (graphData) {
      graphData.edges.forEach((edge, edgeIdx) => {
        const sourceIdx = typeof edge.source === 'number'
          ? edge.source
          : (edge.source as GraphNode).nodeIndex ?? -1;
        const targetIdx = typeof edge.target === 'number'
          ? edge.target
          : (edge.target as GraphNode).nodeIndex ?? -1;

        if (sourceIdx === index) {
          neighbors.add(targetIdx);
          connectedEdges.add(edgeIdx);
        }
        if (targetIdx === index) {
          neighbors.add(sourceIdx);
          connectedEdges.add(edgeIdx);
        }
      });
    }

    // Highlight nodes + edges
    if (renderer) {
      renderer.highlightNodes(Array.from(neighbors));
      if (connectedEdges.size > 0) {
        renderer.highlightEdges(connectedEdges);
      }
    }

    // Show node content panel, positioned to the left of config
    if (contentPanel) {
      contentPanel.style.display = 'block';
      repositionNodeDetails();

      // Connection count badge
      const badge = document.getElementById('ndConnCount');
      if (badge) {
        badge.textContent = `${connectedEdges.size} edges · ${neighbors.size - 1} neighbors`;
      }

      // Populate content
      const typeEl = document.getElementById('nodeType');
      const keyEl = document.getElementById('nodeKey');
      const nsEl = document.getElementById('nodeNamespace');
      const previewEl = document.getElementById('nodePreview');
      const metaEl = document.getElementById('nodeMeta');
      const metaSection = document.getElementById('nodeMetaSection');

      if (typeEl) {
        const color = NODE_SOURCE_COLORS_HEX[node.source] || '#6B2FB5';
        const label = NODE_TYPE_LABELS[node.source] || node.source;
        typeEl.innerHTML = `<span style="color: ${color}; font-weight: 600;">${label}</span>`;
      }
      if (keyEl) keyEl.textContent = String(node.key || node.id || '-');
      if (nsEl) nsEl.textContent = node.namespace || '-';
      if (previewEl) previewEl.textContent = node.preview || '(no content)';

      // Build metadata
      if (metaEl && metaSection) {
        const meta: string[] = [];

        // Type-specific metadata
        switch (node.source) {
          case 'memory': {
            const memType = (node as any).memory_type || node.memoryType;
            if (memType) meta.push(`Memory Type: ${memType.replace(/_/g, ' ')}`);
            if (node.domain) meta.push(`Domain: ${node.domain}`);
            if ((node as any).valueLength) meta.push(`Length: ${(node as any).valueLength} chars`);
            if ((node as any).wordCount) meta.push(`Words: ${(node as any).wordCount}`);
            if ((node as any).embeddingDim) meta.push(`Embedding: ${(node as any).embeddingDim}d`);
            if (node.isFoundation) {
              meta.push(`<strong>Foundation Memory</strong>`);
              if (node.layer) meta.push(`Layer: ${node.layer}`);
              if (node.document) meta.push(`Document: ${node.document}`);
            }
            if (node.hasEmbedding !== undefined) meta.push(`Has embedding: ${node.hasEmbedding ? 'Yes' : 'No'}`);
            break;
          }
          case 'neural_pattern': {
            if (node.category || node.namespace) meta.push(`Category: ${node.category || node.namespace}`);
            if (node.confidence != null) meta.push(`Confidence: ${(node.confidence * 100).toFixed(1)}%`);
            if ((node as any).usageCount != null) meta.push(`Usage: ${(node as any).usageCount}`);
            if (node.trajectoryId) meta.push(`Trajectory: ${node.trajectoryId}`);
            if ((node as any).embeddingDim) meta.push(`Embedding: ${(node as any).embeddingDim}d`);
            if (node.hasEmbedding !== undefined) meta.push(`Has embedding: ${node.hasEmbedding ? 'Yes' : 'No'}`);
            break;
          }
          case 'q_pattern': {
            if (node.state) meta.push(`State: ${node.state}`);
            if (node.action) meta.push(`Action: ${node.action}`);
            if (node.qValue !== undefined) {
              const qColor = node.qValue > 0.5 ? '#10B981' : '#EF4444';
              meta.push(`Q-Value: <span style="color:${qColor}">${node.qValue.toFixed(4)}</span>`);
            }
            if (node.visits !== undefined) meta.push(`Visits: ${node.visits}`);
            if (node.model) meta.push(`Model: ${node.model}`);
            break;
          }
          case 'trajectory':
          case 'trajectory_success':
          case 'trajectory_failed': {
            if (node.agent) meta.push(`Agent: ${node.agent}`);
            if ((node as any).context) meta.push(`Context: ${(node as any).context}`);
            const successColor = node.success ? '#10B981' : '#EF4444';
            meta.push(`Success: <span style="color:${successColor}">${node.success ? 'Yes' : 'No'}</span>`);
            if (node.stepCount) meta.push(`Steps: ${node.stepCount}`);
            if ((node as any).durationMs) meta.push(`Duration: ${((node as any).durationMs / 1000).toFixed(1)}s`);
            if ((node as any).startTime) meta.push(`Start: ${new Date((node as any).startTime).toLocaleString()}`);
            if ((node as any).endTime) meta.push(`End: ${new Date((node as any).endTime).toLocaleString()}`);
            break;
          }
          case 'file': {
            if (node.filePath) meta.push(`Path: ${node.filePath}`);
            if (node.fileType) meta.push(`Extension: ${node.fileType}`);
            break;
          }
          case 'agent': {
            if (node.agentId) meta.push(`Agent ID: ${node.agentId}`);
            if (node.agentSourceType) meta.push(`Type: ${node.agentSourceType}`);
            if (node.agentModel) meta.push(`Model: ${node.agentModel}`);
            if (node.topologyRole) {
              const roleColor = node.topologyRole === 'queen' ? '#F59E0B' : '#aaa';
              meta.push(`Role: <span style="color:${roleColor}">${node.topologyRole}</span>`);
            }
            if ((node as any).agentHealth != null) {
              const healthColor = (node as any).agentHealth > 70 ? '#10B981' : '#EF4444';
              meta.push(`Health: <span style="color:${healthColor}">${(node as any).agentHealth}%</span>`);
            }
            if ((node as any).agentStatus) meta.push(`Status: ${(node as any).agentStatus}`);
            break;
          }
          case 'state': {
            if ((node as any).stateValue) meta.push(`State: ${(node as any).stateValue}`);
            if ((node as any).patternCount != null) meta.push(`Patterns: ${(node as any).patternCount}`);
            if ((node as any).avgQ != null) {
              const qColor = (node as any).avgQ > 0.5 ? '#10B981' : '#EF4444';
              meta.push(`Avg Q: <span style="color:${qColor}">${(node as any).avgQ.toFixed(4)}</span>`);
            }
            if ((node as any).totalVisits != null) meta.push(`Total Visits: ${(node as any).totalVisits}`);
            break;
          }
          case 'action': {
            if ((node as any).actionValue) meta.push(`Action: ${(node as any).actionValue}`);
            if ((node as any).patternCount != null) meta.push(`Patterns: ${(node as any).patternCount}`);
            if ((node as any).avgQ != null) {
              const qColor = (node as any).avgQ > 0.5 ? '#10B981' : '#EF4444';
              meta.push(`Avg Q: <span style="color:${qColor}">${(node as any).avgQ.toFixed(4)}</span>`);
            }
            if ((node as any).totalVisits != null) meta.push(`Total Visits: ${(node as any).totalVisits}`);
            break;
          }
          default: {
            // Generic fallback for unknown types
            if (node.domain) meta.push(`Domain: ${node.domain}`);
            if (node.hasEmbedding !== undefined) meta.push(`Has embedding: ${node.hasEmbedding ? 'Yes' : 'No'}`);
            break;
          }
        }

        // Common fields (shown for all types)
        if (node.timestamp) meta.push(`Timestamp: ${new Date(node.timestamp).toLocaleString()}`);
        if (node.createdAt && node.createdAt !== node.timestamp) meta.push(`Created: ${new Date(node.createdAt).toLocaleString()}`);
        if (node.updatedAt && node.updatedAt !== node.timestamp && node.updatedAt !== node.createdAt) meta.push(`Updated: ${new Date(node.updatedAt).toLocaleString()}`);
        if (node.connectionCount !== undefined) meta.push(`Connections: ${node.connectionCount}`);

        // FIX-016: Foundation RL metadata (only if not already shown by memory case)
        if (node.source !== 'memory' && node.isFoundation) {
          meta.push(`<strong>Foundation Memory</strong>`);
          if (node.layer) meta.push(`Layer: ${node.layer}`);
          if (node.document) meta.push(`Document: ${node.document}`);
          if (node.recallCount != null) meta.push(`Recall Count: ${node.recallCount}`);
          if (node.rewardSum != null) meta.push(`Reward Sum: ${node.rewardSum.toFixed(2)}`);
          if (node.effectiveness != null) meta.push(`Effectiveness: ${(node.effectiveness * 100).toFixed(1)}%`);
          if (node.lastRecalled) meta.push(`Last Recalled: ${new Date(node.lastRecalled).toLocaleString()}`);
          if (node.sourceDoc) meta.push(`Source: ${node.sourceDoc}`);
        }

        if (meta.length > 0) {
          metaEl.innerHTML = meta.join('<br>');
          metaSection.style.display = 'block';
        } else {
          metaSection.style.display = 'none';
        }
      }

      // §7.2: Inline Q-pattern mini-heatmap in node detail view
      // Preload Q-table if not cached, then render inline
      if (!qtableCache) {
        fetch('/api/qtable').then(r => r.json()).then(data => {
          qtableCache = data as QTableData;
          renderInlineQPatterns(node);
        }).catch(() => { /* silently skip */ });
      } else {
        renderInlineQPatterns(node);
      }

    }

    // §7.0.2: Compute per-tab filters and auto-open Learnings if defaultTab is set
    const filters = getLearningsFilters(node);
    if (filters.defaultTab) {
      openLearningsPanel(filters.defaultTab, filters);
    }

    console.log('Selected node:', node.id, `(${connectedEdges.size} edges, ${neighbors.size - 1} neighbors)`);
  } else {
    // Clear selection: hide panels
    if (contentPanel) {
      contentPanel.style.display = 'none';
    }
    // Hide Learnings panel if it was opened by a node click (has a filter)
    if (currentLearningsFilters?.nodeLabel) {
      closeLearningsPanel();
    }
  }
}

/**
 * Position the Node Details panel to the left of the rightmost visible panel (config or learnings)
 */
function repositionNodeDetails(): void {
  const contentPanel = document.getElementById('nodeContent');
  if (!contentPanel) return;

  const gap = 8;
  let rightOffset = 16; // fallback

  // Check which right-side panel is visible: learnings or config
  const learningsPanel = document.getElementById('learnings');
  const configPanel = document.getElementById('config');

  const visiblePanel = (learningsPanel && learningsPanel.style.display !== 'none') ? learningsPanel
    : (configPanel && configPanel.style.display !== 'none') ? configPanel : null;

  if (visiblePanel) {
    const rect = visiblePanel.getBoundingClientRect();
    rightOffset = (window.innerWidth - rect.left) + gap;
  }

  contentPanel.style.right = `${rightOffset}px`;
}

/**
 * Position the Search panel to the bottom-left of the config panel,
 * stacking above the timeline if both are open.
 */
function repositionSearch(): void {
  const searchPanel = document.getElementById('search');
  const configPanel = document.getElementById('config');
  if (!searchPanel || getComputedStyle(searchPanel).display === 'none') return;

  const gap = 8;

  // Horizontal: left of rightmost visible panel (learnings or config)
  let rightOffset = 16;
  const learningsPanel = document.getElementById('learnings');
  const visibleRightPanel = (learningsPanel && getComputedStyle(learningsPanel).display !== 'none') ? learningsPanel
    : (configPanel && getComputedStyle(configPanel).display !== 'none') ? configPanel : null;
  if (visibleRightPanel) {
    const rect = visibleRightPanel.getBoundingClientRect();
    rightOffset = (window.innerWidth - rect.left) + gap;
  }
  searchPanel.style.right = `${rightOffset}px`;

  // Vertical: above timeline if it's open, otherwise at bottom
  const timeline = document.getElementById('timeline');
  let bottomOffset = 16;
  if (timeline && getComputedStyle(timeline).display !== 'none') {
    const tlRect = timeline.getBoundingClientRect();
    bottomOffset = (window.innerHeight - tlRect.top) + gap;
  }
  searchPanel.style.bottom = `${bottomOffset}px`;
}

function handleSimulationTick(): void {
  // Called on each simulation tick
  // Can be used to update UI elements
}

function handleNodeDrag(_node: GraphNode, _index: number): void {
  // Reheat the simulation so other nodes respond to the dragged node
  if (forceSimulation) {
    forceSimulation.alpha(0.3).restart();
  }
}

function handleNodeUnpin(_node: GraphNode, _index: number): void {
  // Restart simulation so the unpinned node returns to natural position
  if (forceSimulation) {
    forceSimulation.alpha(0.5).restart();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UI SETUP
// ═══════════════════════════════════════════════════════════════════════════

function setupUI(): void {
  // Control buttons
  document.getElementById('refreshBtn')?.addEventListener('click', () => loadData(true));
  document.getElementById('fitBtn')?.addEventListener('click', () => renderer?.fitView());
  document.getElementById('simBtn')?.addEventListener('click', toggleSimulation);

  // Panel toggles
  document.getElementById('infoBtn')?.addEventListener('click', () => {
    const panel = document.getElementById('information');
    if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    document.getElementById('infoBtn')?.classList.toggle('active');
    repositionTimeline();
  });

  document.getElementById('configBtn')?.addEventListener('click', () => {
    const panel = document.getElementById('config');
    if (!panel) return;
    const isOpening = panel.style.display === 'none';

    // Mutual exclusivity: close Learnings panel when opening Settings
    if (isOpening) {
      const learningsPanel = document.getElementById('learnings');
      if (learningsPanel && getComputedStyle(learningsPanel).display !== 'none') {
        learningsPanel.style.display = 'none';
        document.getElementById('learningsBtn')?.classList.remove('active');
        currentLearningsFilters = null;
      }
    }

    panel.style.display = isOpening ? 'block' : 'none';
    document.getElementById('configBtn')?.classList.toggle('active');
    repositionTimeline();
    repositionNodeDetails();
    repositionSearch();
  });

  document.getElementById('closeConfig')?.addEventListener('click', () => {
    const panel = document.getElementById('config');
    if (panel) panel.style.display = 'none';
    document.getElementById('configBtn')?.classList.remove('active');
    repositionNodeDetails();
    repositionSearch();
  });

  // Config panel left-side resize handle
  const configResizeHandle = document.getElementById('configResizeHandle');
  const configPanel = document.getElementById('config');
  if (configResizeHandle && configPanel) {
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    configResizeHandle.addEventListener('mousedown', (e: MouseEvent) => {
      isResizing = true;
      startX = e.clientX;
      startWidth = configPanel.offsetWidth;
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (!isResizing) return;
      // Dragging left increases width, dragging right decreases
      const delta = startX - e.clientX;
      const newWidth = Math.min(500, Math.max(220, startWidth + delta));
      configPanel.style.width = `${newWidth}px`;
      repositionTimeline();
      repositionNodeDetails();
      repositionSearch();
    });

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }

  document.getElementById('timelineBtn')?.addEventListener('click', () => {
    const panel = document.getElementById('timeline');
    if (!panel) return;
    const isHidden = getComputedStyle(panel).display === 'none';
    panel.style.display = isHidden ? 'block' : 'none';
    const btn = document.getElementById('timelineBtn');
    if (isHidden) {
      btn?.classList.add('active');
    } else {
      btn?.classList.remove('active');
    }
    repositionTimeline();
    repositionSearch();
  });

  // View mode selector dropdown
  document.getElementById('viewModeSelect')?.addEventListener('change', (e) => {
    const select = e.target as HTMLSelectElement;
    switchToMode(select.value as ViewMode);
  });

  // Hyperedge visibility toggle
  document.getElementById('hyperedgeBtn')?.addEventListener('click', toggleHyperedgeVisibility);

  document.getElementById('searchToggleBtn')?.addEventListener('click', () => {
    const panel = document.getElementById('search');
    if (!panel) return;
    const isHidden = getComputedStyle(panel).display === 'none';
    panel.style.display = isHidden ? 'block' : 'none';
    const btn = document.getElementById('searchToggleBtn');
    if (isHidden) {
      btn?.classList.add('active');
    } else {
      btn?.classList.remove('active');
    }
    repositionSearch();
  });

  // Search panel close button - syncs the toolbar button
  document.getElementById('closeSearch')?.addEventListener('click', () => {
    const panel = document.getElementById('search');
    if (panel) panel.style.display = 'none';
    document.getElementById('searchToggleBtn')?.classList.remove('active');
  });

  // Unified Learnings panel toggle
  document.getElementById('learningsBtn')?.addEventListener('click', () => {
    const panel = document.getElementById('learnings');
    if (!panel) return;
    const isHidden = getComputedStyle(panel).display === 'none';
    if (isHidden) {
      openLearningsPanel(learningsActiveTab, {
        defaultTab: learningsActiveTab,
        nodeLabel: '',
        qtable: null, gantt: null, edits: null, agents: null, cmds: null, analytics: null,
      });
    } else {
      closeLearningsPanel();
    }
  });

  document.getElementById('closeLearnings')?.addEventListener('click', () => {
    closeLearningsPanel();
  });

  // Learnings tab switching
  document.querySelectorAll('.learn-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = (tab as HTMLElement).dataset.tab;
      if (tabName) {
        learningsActiveTab = tabName;
        document.querySelectorAll('.learn-tab').forEach(t => {
          t.classList.toggle('active', (t as HTMLElement).dataset.tab === tabName);
        });
        loadLearningsTab();
      }
    });
  });

  // Clear learnings filter
  document.getElementById('clearLearningsFilter')?.addEventListener('click', () => {
    currentLearningsFilters = null;
    editTimelineFilterFile = null;
    const filterBar = document.getElementById('learningsFilter');
    if (filterBar) filterBar.style.display = 'none';
    loadLearningsTab();
  });

  // Learnings panel left-side resize handle
  const learningsResizeHandle = document.getElementById('learningsResizeHandle');
  const learningsPanel = document.getElementById('learnings');
  if (learningsResizeHandle && learningsPanel) {
    let isLearningsResizing = false;
    let learningsStartX = 0;
    let learningsStartWidth = 0;

    learningsResizeHandle.addEventListener('mousedown', (e: MouseEvent) => {
      isLearningsResizing = true;
      learningsStartX = e.clientX;
      learningsStartWidth = learningsPanel.offsetWidth;
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (!isLearningsResizing) return;
      const delta = learningsStartX - e.clientX;
      const newWidth = Math.min(600, Math.max(220, learningsStartWidth + delta));
      learningsPanel.style.width = `${newWidth}px`;
      repositionNodeDetails();
      repositionSearch();
    });

    document.addEventListener('mouseup', () => {
      if (isLearningsResizing) {
        isLearningsResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }

  // Color mode
  document.getElementById('nodeColorMode')?.addEventListener('change', (e) => {
    currentColorMode = (e.target as HTMLSelectElement).value as ColorMode;
    applyColorMode();
    updateColorLegend();
  });

  // Size mode
  document.getElementById('nodeSizeMode')?.addEventListener('change', (e) => {
    currentSizeMode = (e.target as HTMLSelectElement).value as SizeMode;
    applySizeMode();
  });

  // Node opacity
  document.getElementById('nodeOpacity')?.addEventListener('input', (e) => {
    const opacity = parseFloat((e.target as HTMLInputElement).value);
    renderer?.setNodeOpacity(opacity);
    const label = document.getElementById('nodeOpacityVal');
    if (label) label.textContent = opacity.toFixed(2);
  });

  // Base node size
  document.getElementById('nodeSize')?.addEventListener('input', (e) => {
    baseNodeSize = parseFloat((e.target as HTMLInputElement).value);
    applySizeMode();
    const label = document.getElementById('nodeSizeVal');
    if (label) label.textContent = baseNodeSize.toString();
  });

  // Edge group controls
  setupEdgeGroupControls();

  // Presets (built-in)
  setupPresets();

  // Preset management (save/load/delete)
  setupPresetHandlers();

  // Source filters (populate from SSOT, then attach event listeners)
  populateSourceFilters();
  setupSourceFilters();

  // Edge legend
  setupEdgeLegend();

  // Search
  setupSearch();

  // Node content panel close button
  document.getElementById('closeNodeContent')?.addEventListener('click', () => {
    const panel = document.getElementById('nodeContent');
    if (panel) panel.style.display = 'none';
    if (renderer) renderer.clearHighlights();
    // Clear selected node
  });

  // Simulation settings
  setupSimulationControls();

  // Timeline
  setupTimeline();
}

function setupEdgeGroupControls(): void {
  // Deterministic controls
  document.getElementById('deterministicEnabled')?.addEventListener('change', (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    edgeGroupEnabled.deterministic = enabled;
    renderer?.setEdgeGroupSettings(EdgeGroup.DETERMINISTIC, { enabled });
    applyEdgeGroupFilters();
  });

  document.getElementById('deterministicOpacity')?.addEventListener('input', (e) => {
    const opacity = parseFloat((e.target as HTMLInputElement).value);
    renderer?.setEdgeGroupSettings(EdgeGroup.DETERMINISTIC, { opacity });
    const label = document.getElementById('detOpacityVal');
    if (label) label.textContent = opacity.toFixed(2);
  });

  document.getElementById('deterministicWidth')?.addEventListener('input', (e) => {
    const width = parseFloat((e.target as HTMLInputElement).value);
    renderer?.setEdgeGroupSettings(EdgeGroup.DETERMINISTIC, { width });
    const label = document.getElementById('detWidthVal');
    if (label) label.textContent = width.toFixed(1);
  });

  document.getElementById('deterministicDist')?.addEventListener('input', (e) => {
    const distance = parseFloat((e.target as HTMLInputElement).value);
    simParams.deterministicLinkDistance = distance;
    renderer?.setEdgeGroupSettings(EdgeGroup.DETERMINISTIC, { distance });
    updateForceSimulationParams();
    const label = document.getElementById('detDistVal');
    if (label) label.textContent = distance.toString();
  });

  document.getElementById('deterministicRepulsion')?.addEventListener('input', (e) => {
    const repulsion = parseFloat((e.target as HTMLInputElement).value);
    simParams.deterministicRepulsion = repulsion;
    renderer?.setEdgeGroupSettings(EdgeGroup.DETERMINISTIC, { repulsion });
    updateForceSimulationParams();
    const label = document.getElementById('detRepulsionVal');
    if (label) label.textContent = repulsion.toString();
  });

  document.getElementById('deterministicGlow')?.addEventListener('change', (e) => {
    const glow = (e.target as HTMLInputElement).checked;
    renderer?.setEdgeGroupSettings(EdgeGroup.DETERMINISTIC, { glow });
  });

  document.getElementById('deterministicColor')?.addEventListener('input', (e) => {
    const hex = (e.target as HTMLInputElement).value;
    const color = parseInt(hex.slice(1), 16);
    renderer?.setEdgeGroupSettings(EdgeGroup.DETERMINISTIC, { color });
  });

  document.getElementById('deterministicStyle')?.addEventListener('change', (e) => {
    const style = (e.target as HTMLSelectElement).value as 'solid' | 'dashed' | 'dotted';
    renderer?.setEdgeGroupSettings(EdgeGroup.DETERMINISTIC, { style });
  });

  document.getElementById('deterministicWidthMode')?.addEventListener('change', (e) => {
    const widthMode = (e.target as HTMLSelectElement).value as 'fixed' | 'similarity' | 'weight';
    renderer?.setEdgeGroupSettings(EdgeGroup.DETERMINISTIC, { widthMode } as any);
  });

  // Semantic controls
  document.getElementById('semanticEnabled')?.addEventListener('change', (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    edgeGroupEnabled.semantic = enabled;
    renderer?.setEdgeGroupSettings(EdgeGroup.SEMANTIC, { enabled });
    applyEdgeGroupFilters();
  });

  document.getElementById('semanticOpacity')?.addEventListener('input', (e) => {
    const opacity = parseFloat((e.target as HTMLInputElement).value);
    renderer?.setEdgeGroupSettings(EdgeGroup.SEMANTIC, { opacity });
    const label = document.getElementById('semOpacityVal');
    if (label) label.textContent = opacity.toFixed(2);
  });

  document.getElementById('semanticWidth')?.addEventListener('input', (e) => {
    const width = parseFloat((e.target as HTMLInputElement).value);
    renderer?.setEdgeGroupSettings(EdgeGroup.SEMANTIC, { width });
    const label = document.getElementById('semWidthVal');
    if (label) label.textContent = width.toFixed(1);
  });

  document.getElementById('semanticDist')?.addEventListener('input', (e) => {
    const distance = parseFloat((e.target as HTMLInputElement).value);
    simParams.semanticLinkDistance = distance;
    renderer?.setEdgeGroupSettings(EdgeGroup.SEMANTIC, { distance });
    updateForceSimulationParams();
    const label = document.getElementById('semDistVal');
    if (label) label.textContent = distance.toString();
  });

  document.getElementById('semanticRepulsion')?.addEventListener('input', (e) => {
    const repulsion = parseFloat((e.target as HTMLInputElement).value);
    simParams.semanticRepulsion = repulsion;
    renderer?.setEdgeGroupSettings(EdgeGroup.SEMANTIC, { repulsion });
    updateForceSimulationParams();
    const label = document.getElementById('semRepulsionVal');
    if (label) label.textContent = repulsion.toString();
  });

  document.getElementById('semanticGlow')?.addEventListener('change', (e) => {
    const glow = (e.target as HTMLInputElement).checked;
    renderer?.setEdgeGroupSettings(EdgeGroup.SEMANTIC, { glow });
  });

  document.getElementById('semanticColor')?.addEventListener('input', (e) => {
    const hex = (e.target as HTMLInputElement).value;
    const color = parseInt(hex.slice(1), 16);
    renderer?.setEdgeGroupSettings(EdgeGroup.SEMANTIC, { color });
  });

  document.getElementById('semanticStyle')?.addEventListener('change', (e) => {
    const style = (e.target as HTMLSelectElement).value as 'solid' | 'dashed' | 'dotted';
    renderer?.setEdgeGroupSettings(EdgeGroup.SEMANTIC, { style });
  });

  document.getElementById('semanticWidthMode')?.addEventListener('change', (e) => {
    const widthMode = (e.target as HTMLSelectElement).value as 'fixed' | 'similarity' | 'weight';
    renderer?.setEdgeGroupSettings(EdgeGroup.SEMANTIC, { widthMode } as any);
  });

  // Node Types toggle panel
  document.getElementById('toggleNodeTypes')?.addEventListener('click', () => {
    const list = document.getElementById('nodeTypesList');
    const btn = document.getElementById('toggleNodeTypes');
    if (list && btn) {
      const isVisible = list.style.display !== 'none';
      list.style.display = isVisible ? 'none' : 'block';
      btn.textContent = isVisible ? '▼' : '▲';
    }
  });

  // Edge type visibility toggles
  setupEdgeTypeToggles();
  setupSourceTypeToggles();
  setupNamespaceToggles();
}

/**
 * Apply all default settings on initialization
 * Ensures the visualization matches the UI defaults
 */
function applyAllDefaults(): void {
  console.log('Applying all default settings...');

  // Apply default color mode (namespace)
  applyColorMode();
  updateColorLegend();

  // Apply default size mode (connectivity)
  applySizeMode();

  // Apply default node opacity (0.9)
  renderer?.setNodeOpacity(0.9);

  // Apply default edge settings
  if (renderer) {
    // Deterministic edges: opacity 0.15, width 1.5, glow on, solid
    // Start DISABLED to let layout settle
    renderer.setEdgeGroupSettings(EdgeGroup.DETERMINISTIC, {
      enabled: false,
      opacity: 0.15,
      width: 1.5,
      glow: true,
      style: 'solid'
    } as any);

    // Semantic edges: opacity 0.10, width 2.0, glow on, solid
    // Start DISABLED to let layout settle
    renderer.setEdgeGroupSettings(EdgeGroup.SEMANTIC, {
      enabled: false,
      opacity: 0.10,
      width: 2.0,
      glow: true,
      style: 'solid'
    } as any);

    // Update checkboxes to reflect disabled state
    const detCheckbox = document.getElementById('deterministicEnabled') as HTMLInputElement;
    const semCheckbox = document.getElementById('semanticEnabled') as HTMLInputElement;
    if (detCheckbox) detCheckbox.checked = false;
    if (semCheckbox) semCheckbox.checked = false;

    // Apply the disabled state to physics
    applyEdgeGroupFilters();

    // Enable edges on next frame (after nodes are positioned)
    requestAnimationFrame(() => {
      console.log('Enabling edge groups after node creation...');
      edgeGroupEnabled.deterministic = true;
      edgeGroupEnabled.semantic = true;

      renderer?.setEdgeGroupSettings(EdgeGroup.DETERMINISTIC, { enabled: true });
      renderer?.setEdgeGroupSettings(EdgeGroup.SEMANTIC, { enabled: true });

      // Update checkboxes
      if (detCheckbox) detCheckbox.checked = true;
      if (semCheckbox) semCheckbox.checked = true;

      // Apply to physics
      applyEdgeGroupFilters();
    });
  }

  // Apply node type defaults (state/action hidden by default)
  applySourceTypeFilters();

  // Start animation with Center Force and Radial Strength at 0, then transition to defaults
  animatePhysicsParams();

  console.log('Default settings applied');
}

/**
 * Animate physics parameters smoothly on load
 * Center Force: 0.00 → 0.05 (increases)
 * Radial Strength: 1.00 → 0.50 (decreases)
 */
function animatePhysicsParams(): void {
  const duration = 4000; // 4 seconds (2x for smoother animation)
  const startTime = Date.now();

  // Start and target values
  const startCenterForce = 0;
  const targetCenterForce = 0.05;
  const startRadialStrength = 1.0;
  const targetRadialStrength = 0.5;

  // Set initial values
  simParams.radialStrength = startRadialStrength;
  if (forceSimulation) {
    const d3 = (window as any).d3;
    if (d3) {
      forceSimulation.force('centerX', d3.forceX(0).strength(startCenterForce));
      forceSimulation.force('centerY', d3.forceY(0).strength(startCenterForce));
    }
  }
  updateForceSimulationParams();

  // Get UI elements
  const centerForceSlider = document.getElementById('centerForce') as HTMLInputElement;
  const centerForceLabel = document.getElementById('centerForceVal');
  const radialStrengthSlider = document.getElementById('radialStrength') as HTMLInputElement;
  const radialStrengthLabel = document.getElementById('radialStrengthVal');

  // Update UI to show starting values
  if (centerForceSlider) centerForceSlider.value = startCenterForce.toString();
  if (centerForceLabel) centerForceLabel.textContent = startCenterForce.toFixed(2);
  if (radialStrengthSlider) radialStrengthSlider.value = startRadialStrength.toString();
  if (radialStrengthLabel) radialStrengthLabel.textContent = startRadialStrength.toFixed(1);

  function animate() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Ease-in-out curve for smooth animation
    const eased = progress < 0.5
      ? 2 * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;

    // Interpolate values
    const currentCenterForce = startCenterForce + eased * (targetCenterForce - startCenterForce);
    const currentRadialStrength = startRadialStrength + eased * (targetRadialStrength - startRadialStrength);

    // Apply to simulation
    if (forceSimulation) {
      const d3 = (window as any).d3;
      if (d3) {
        forceSimulation.force('centerX', d3.forceX(0).strength(currentCenterForce));
        forceSimulation.force('centerY', d3.forceY(0).strength(currentCenterForce));
      }
    }

    simParams.radialStrength = currentRadialStrength;
    updateForceSimulationParams();

    // Update UI
    if (centerForceSlider) centerForceSlider.value = currentCenterForce.toString();
    if (centerForceLabel) centerForceLabel.textContent = currentCenterForce.toFixed(2);
    if (radialStrengthSlider) radialStrengthSlider.value = currentRadialStrength.toString();
    if (radialStrengthLabel) radialStrengthLabel.textContent = currentRadialStrength.toFixed(1);

    // Continue animation if not done
    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      console.log('Physics animation complete');
    }
  }

  // Start animation
  requestAnimationFrame(animate);
}

/**
 * Generate a color from the full 360° spectrum based on string hash
 * Used for legends/selectors where color differentiation is useful
 */
// @ts-ignore: reserved utility function
function stringToHSLColor(str: string, saturation = 70, lightness = 50): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * Dynamically populate edge type toggles based on actual data
 * Simple 2-level hierarchy: Deterministic/Semantic → individual types
 */
function populateEdgeTypeToggles(): void {
  if (!graphData) return;

  const container = document.getElementById('edgeTypesList');
  if (!container) return;

  // Count edges by type and track group
  const typeCounts = new Map<string, number>();
  const typeToGroup = new Map<string, string>();

  graphData.edges.forEach(edge => {
    const edgeType = edge.type || 'embedding';
    typeCounts.set(edgeType, (typeCounts.get(edgeType) || 0) + 1);
    if (!typeToGroup.has(edgeType)) {
      typeToGroup.set(edgeType, edge.group || 'semantic');
    }
  });

  // Separate and sort by count
  const allTypes = Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1]);
  const deterministicTypes = allTypes.filter(([type]) => typeToGroup.get(type) === 'deterministic');
  const semanticTypes = allTypes.filter(([type]) => typeToGroup.get(type) !== 'deterministic');

  // Generate flat list of type toggles
  const generateTypeList = (types: [string, number][], group: string) => types.map(([type, count]) => `
    <label style="display: flex; align-items: center; gap: 4px; padding: 2px 4px; font-size: 9px; cursor: pointer; background: rgba(255,255,255,0.02); border-radius: 3px; margin: 1px 0;">
      <input type="checkbox" class="edge-type-toggle" data-type="${type}" data-group="${group}" checked style="width: 10px; height: 10px;">
      <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${type}</span>
      <span style="color: var(--text-muted); font-size: 8px;">${count.toLocaleString()}</span>
    </label>
  `).join('');

  // Inject sub-types into each Edge Settings box (Deterministic / Semantic)
  const detSubtypes = document.getElementById('detEdgeSubtypes');
  const semSubtypes = document.getElementById('semEdgeSubtypes');

  if (detSubtypes) {
    detSubtypes.style.display = deterministicTypes.length > 0 ? 'block' : 'none';
    detSubtypes.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;" class="edge-subtypes-header" data-group="deterministic">
        <span style="font-size: 9px; color: var(--text-muted); font-weight: 600;">Sub-types</span>
        <span style="display: flex; align-items: center; gap: 4px; font-size: 9px; color: var(--text-muted);"><span class="edge-subtype-header-status" data-group="deterministic" style="color: var(--primary); font-weight: 600;">All</span> <span class="expand-icon">▼</span></span>
      </div>
      <div class="edge-subtypes-list" data-group="deterministic" style="display: none; padding: 4px 0 0 0;">
        <div style="display: flex; justify-content: flex-end; gap: 6px; margin-bottom: 4px;">
          <button class="edge-subtype-select-all" data-group="deterministic" style="background: none; border: none; color: var(--primary); cursor: pointer; font-size: 9px; padding: 0;">All</button>
          <button class="edge-subtype-select-none" data-group="deterministic" style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 9px; padding: 0;">None</button>
        </div>
        ${generateTypeList(deterministicTypes, 'deterministic')}
        <div class="edge-subtype-status" data-group="deterministic" style="font-size: 9px; color: var(--text-muted); margin-top: 4px; font-style: italic;">
          ${deterministicTypes.length}/${deterministicTypes.length} sub-types shown
        </div>
      </div>
    `;
  }

  if (semSubtypes) {
    semSubtypes.style.display = semanticTypes.length > 0 ? 'block' : 'none';
    semSubtypes.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;" class="edge-subtypes-header" data-group="semantic">
        <span style="font-size: 9px; color: var(--text-muted); font-weight: 600;">Sub-types</span>
        <span style="display: flex; align-items: center; gap: 4px; font-size: 9px; color: var(--text-muted);"><span class="edge-subtype-header-status" data-group="semantic" style="color: var(--primary); font-weight: 600;">All</span> <span class="expand-icon">▼</span></span>
      </div>
      <div class="edge-subtypes-list" data-group="semantic" style="display: none; padding: 4px 0 0 0;">
        <div style="display: flex; justify-content: flex-end; gap: 6px; margin-bottom: 4px;">
          <button class="edge-subtype-select-all" data-group="semantic" style="background: none; border: none; color: var(--primary); cursor: pointer; font-size: 9px; padding: 0;">All</button>
          <button class="edge-subtype-select-none" data-group="semantic" style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 9px; padding: 0;">None</button>
        </div>
        ${generateTypeList(semanticTypes, 'semantic')}
        <div class="edge-subtype-status" data-group="semantic" style="font-size: 9px; color: var(--text-muted); margin-top: 4px; font-style: italic;">
          ${semanticTypes.length}/${semanticTypes.length} sub-types shown
        </div>
      </div>
    `;
  }

  // Expand/collapse handlers for sub-type headers
  document.querySelectorAll('.edge-subtypes-header').forEach(header => {
    header.addEventListener('click', () => {
      const group = (header as HTMLElement).dataset.group;
      const list = header.parentElement?.querySelector(`.edge-subtypes-list[data-group="${group}"]`) as HTMLElement;
      const icon = header.querySelector('.expand-icon') as HTMLElement;
      if (list && icon) {
        const isHidden = list.style.display === 'none';
        list.style.display = isHidden ? 'block' : 'none';
        icon.textContent = isHidden ? '▲' : '▼';
      }
    });
  });

  // All / None handlers for edge sub-type groups
  document.querySelectorAll('.edge-subtype-select-all').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const group = (btn as HTMLElement).dataset.group;
      const list = btn.closest('.edge-subtypes-list');
      if (!list) return;
      list.querySelectorAll('.edge-type-toggle').forEach(cb => {
        const input = cb as HTMLInputElement;
        input.checked = true;
        const edgeType = input.dataset.type;
        if (edgeType) edgeTypeVisibility.set(edgeType, true);
      });
      applyEdgeTypeFilters();
      updateEdgeSubtypeStatus(group || '');
      // Settings = physics only, no legend sync
    });
  });

  document.querySelectorAll('.edge-subtype-select-none').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const group = (btn as HTMLElement).dataset.group;
      const list = btn.closest('.edge-subtypes-list');
      if (!list) return;
      list.querySelectorAll('.edge-type-toggle').forEach(cb => {
        const input = cb as HTMLInputElement;
        input.checked = false;
        const edgeType = input.dataset.type;
        if (edgeType) edgeTypeVisibility.set(edgeType, false);
      });
      applyEdgeTypeFilters();
      updateEdgeSubtypeStatus(group || '');
      // Settings = physics only, no legend sync
    });
  });

  // Individual toggle handlers
  document.querySelectorAll('.edge-type-toggle').forEach(toggle => {
    toggle.addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement;
      const edgeType = input.dataset.type;
      const group = input.dataset.group;
      if (edgeType) {
        edgeTypeVisibility.set(edgeType, input.checked);
        applyEdgeTypeFilters();
        if (group) updateEdgeSubtypeStatus(group);
        // Settings = physics only, no legend sync
      }
    });
  });

  console.log(`Edge types: ${deterministicTypes.length} deterministic, ${semanticTypes.length} semantic`);
}

/**
 * Map from nodeTypeConfig key → set of raw source types in graphData.
 * e.g. 'trajectory' → {'trajectory', 'trajectory_success', 'trajectory_failed'}
 * Built once in populateSourceTypeToggles, used by toggle handlers.
 */
let sourceTypeVariantMap: Map<string, Set<string>> = new Map();

/**
 * Dynamically populate node type toggles from nodeTypeConfig SSOT.
 * Falls back to counting from graphData.nodes if SSOT unavailable.
 */
function populateSourceTypeToggles(): void {
  if (!graphData) return;

  const container = document.getElementById('nodeTypesList');
  if (!container) return;

  // Build variant map: config key → raw source types found in data
  sourceTypeVariantMap.clear();
  const configKeys = nodeTypeConfig ? Object.keys(nodeTypeConfig) : [];
  if (nodeTypeConfig) {
    configKeys.forEach(key => {
      const variants = new Set<string>([key]);
      graphData!.nodes.forEach(node => {
        const raw = node.source || 'memory';
        if (raw === key || raw.startsWith(key + '_')) {
          variants.add(raw);
        }
      });
      sourceTypeVariantMap.set(key, variants);
    });
  }

  // Build entries from SSOT or data
  const entries: Array<{ type: string; label: string; count: number; color: string; icon: string }> = [];

  if (nodeTypeConfig) {
    // SSOT: use server-provided config (labels, counts, ordering)
    const types = Object.entries(nodeTypeConfig)
      .sort((a: [string, any], b: [string, any]) => (a[1].order ?? 99) - (b[1].order ?? 99));
    for (const [type, cfg] of types as [string, any][]) {
      const color = NODE_SOURCE_COLORS_HEX[type];
      const iconTemplate = NODE_TYPE_ICONS[type] || '<circle cx="7" cy="7" r="5"/>';
      const icon = iconTemplate.includes('fill="none"')
        ? iconTemplate.replace('/>', ` stroke="${color}"/>`)
        : iconTemplate.replace('/>', ` fill="${color}"/>`);
      entries.push({ type, label: cfg.label, count: cfg.count || 0, color, icon });
    }
  } else {
    // Fallback: discover from data
    const typeCounts = new Map<string, number>();
    graphData.nodes.forEach(node => {
      const sourceType = node.source || 'memory';
      typeCounts.set(sourceType, (typeCounts.get(sourceType) || 0) + 1);
    });
    Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
      if (type.includes('_success') || type.includes('_failed')) return;
      const color = NODE_SOURCE_COLORS_HEX[type];
      const iconTemplate = NODE_TYPE_ICONS[type] || '<circle cx="7" cy="7" r="5"/>';
      const icon = iconTemplate.includes('fill="none"')
        ? iconTemplate.replace('/>', ` stroke="${color}"/>`)
        : iconTemplate.replace('/>', ` fill="${color}"/>`);
      const label = NODE_TYPE_LABELS[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      entries.push({ type, label, count, color, icon });
    });
  }

  // Generate HTML for toggles
  const togglesHTML = entries.map(({ type, label, count, icon }) => `
    <label class="source-type-item" style="display: flex; align-items: center; gap: 6px; font-size: 11px; padding: 4px 8px;
           border-radius: 6px; cursor: pointer; transition: all 0.2s; flex: 1 1 calc(50% - 4px); min-width: 90px;
           background: rgba(139,79,217,0.15);" title="${label}: ${count} nodes">
      <input type="checkbox" class="source-type-toggle" data-source="${type}" ${HIDDEN_BY_DEFAULT_SOURCES.has(type) ? '' : 'checked'} style="width: 12px; height: 12px; flex-shrink: 0;">
      <svg width="14" height="14" viewBox="0 0 14 14" style="flex-shrink: 0;">${icon}</svg>
      <span style="color: var(--text-secondary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${label}</span>
      <span style="font-size: 9px; color: var(--text-muted);">${count.toLocaleString()}</span>
    </label>
  `).join('');

  container.innerHTML = `
    <div style="display: flex; justify-content: flex-end; gap: 6px; margin-bottom: 4px;">
      <button id="nodeTypeSelectAll" style="background: none; border: none; color: var(--primary); cursor: pointer; font-size: 9px; padding: 0;">All</button>
      <button id="nodeTypeSelectNone" style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 9px; padding: 0;">None</button>
    </div>
    <div style="display: flex; flex-wrap: wrap; gap: 4px;">
      ${togglesHTML}
    </div>
    <div id="nodeTypeStatusText" style="font-size: 9px; color: var(--text-muted); margin-top: 4px; font-style: italic;">
      ${entries.length}/${entries.length} node types enabled
    </div>
  `;

  // Set total count in header
  const totalNodes = entries.reduce((s, e) => s + e.count, 0);
  const totalCountEl = document.getElementById('nodeSettingsTotalCount');
  if (totalCountEl) totalCountEl.textContent = totalNodes.toLocaleString();

  console.log(`Populated ${entries.length} node type toggles from ${nodeTypeConfig ? 'SSOT' : 'data'}`);
}

function setupEdgeTypeToggles(): void {
  // Populate toggles dynamically (includes event handlers)
  populateEdgeTypeToggles();

  // Initialize visibility state for all edge types
  const toggles = document.querySelectorAll('.edge-type-toggle');
  toggles.forEach(checkbox => {
    const input = checkbox as HTMLInputElement;
    const edgeType = input.dataset.type;
    if (edgeType) {
      edgeTypeVisibility.set(edgeType, true);
    }
  });
  console.log(`Initialized ${toggles.length} edge type toggles`);
}

function applyEdgeTypeFilters(): void {
  // Update physics via the combined filter function
  applyEdgeGroupFilters();

  // Also update visual rendering (hide edges of disabled types)
  if (renderer) {
    const hiddenTypes = new Set<string>();
    edgeTypeVisibility.forEach((visible, edgeType) => {
      if (!visible) hiddenTypes.add(edgeType);
    });
    renderer.setHiddenEdgeTypes(hiddenTypes);
  }
}

/**
 * Apply edge group filters (deterministic/semantic enabled checkboxes)
 * This affects physics - disabled groups are removed from force simulation
 */
function applyEdgeGroupFilters(): void {
  if (!graphData || !renderer) return;

  // Filter edges based on both group enabled state AND individual type visibility
  const enabledEdges = graphData.edges.filter(edge => {
    // Check edge group (deterministic vs semantic)
    const group = edge.group ?? getEdgeGroup(edge.type || 'embedding');
    if (group === EdgeGroup.DETERMINISTIC && !edgeGroupEnabled.deterministic) return false;
    if (group === EdgeGroup.SEMANTIC && !edgeGroupEnabled.semantic) return false;

    // Also check individual edge type visibility
    const edgeType = edge.type || 'embedding';
    const typeEnabled = edgeTypeVisibility.get(edgeType);
    if (typeEnabled === false) return false;

    return true;
  });

  console.log(`Edge group filter: ${graphData.edges.length} total -> ${enabledEdges.length} enabled (det=${edgeGroupEnabled.deterministic}, sem=${edgeGroupEnabled.semantic})`);

  // Update force simulation with filtered edges
  if (forceSimulation) {
    const d3 = (window as any).d3;
    if (d3) {
      forceSimulation.force('link', d3.forceLink(enabledEdges)
        .id((d: GraphNode) => d.nodeIndex)
        .distance((edge: any) => {
          const group = edge.group ?? getEdgeGroup(edge.type || 'embedding');
          return group === EdgeGroup.DETERMINISTIC
            ? simParams.deterministicLinkDistance
            : simParams.semanticLinkDistance;
        })
        .strength(0.5)
      );
      forceSimulation.alpha(0.3).restart();
    }
  }

  updateEdgeTypeCounts();
  updateAllEdgeCounts();

  // Re-trigger extended mode renderers so they rebuild with visible edges
  reapplyCurrentMode();
}

function setupSourceTypeToggles(): void {
  // First populate the toggles dynamically from SSOT
  populateSourceTypeToggles();

  const toggles = document.querySelectorAll('.source-type-toggle');
  console.log(`Setting up ${toggles.length} node type toggles`);

  toggles.forEach(checkbox => {
    const input = checkbox as HTMLInputElement;
    const sourceType = input.dataset.source;
    if (sourceType) {
      // Initialize enabled state for this key and all its variants
      const defaultEnabled = !HIDDEN_BY_DEFAULT_SOURCES.has(sourceType);
      sourceTypeEnabled.set(sourceType, defaultEnabled);
      const variants = sourceTypeVariantMap.get(sourceType);
      if (variants) {
        variants.forEach(v => sourceTypeEnabled.set(v, defaultEnabled));
      }

      input.addEventListener('change', () => {
        const isChecked = input.checked;
        console.log(`node type toggle: ${sourceType} = ${isChecked}`);
        // Set parent key and all variant keys (physics-level)
        sourceTypeEnabled.set(sourceType, isChecked);
        const vars = sourceTypeVariantMap.get(sourceType);
        if (vars) {
          vars.forEach(v => sourceTypeEnabled.set(v, isChecked));
        }
        applySourceTypeFilters();
        updateNodeTypeStatusText();
      });
    }
  });

  // All / None buttons for node types
  document.getElementById('nodeTypeSelectAll')?.addEventListener('click', () => {
    document.querySelectorAll('.source-type-toggle').forEach(cb => {
      const input = cb as HTMLInputElement;
      input.checked = true;
      const st = input.dataset.source;
      if (st) {
        sourceTypeEnabled.set(st, true);
        const vars = sourceTypeVariantMap.get(st);
        if (vars) vars.forEach(v => sourceTypeEnabled.set(v, true));
      }
    });
    applySourceTypeFilters();
    updateNodeTypeStatusText();
  });

  document.getElementById('nodeTypeSelectNone')?.addEventListener('click', () => {
    document.querySelectorAll('.source-type-toggle').forEach(cb => {
      const input = cb as HTMLInputElement;
      input.checked = false;
      const st = input.dataset.source;
      if (st) {
        sourceTypeEnabled.set(st, false);
        const vars = sourceTypeVariantMap.get(st);
        if (vars) vars.forEach(v => sourceTypeEnabled.set(v, false));
      }
    });
    applySourceTypeFilters();
    updateNodeTypeStatusText();
  });
}

function updateNodeTypeStatusText(): void {
  const toggles = document.querySelectorAll('.source-type-toggle');
  let total = 0, enabled = 0;
  toggles.forEach(cb => {
    total++;
    if ((cb as HTMLInputElement).checked) enabled++;
  });
  const el = document.getElementById('nodeTypeStatusText');
  if (el) el.textContent = `${enabled}/${total} node types enabled`;
  // Update header badge
  const badge = document.getElementById('nodeTypesStatus');
  if (badge) {
    badge.textContent = enabled === total ? 'All' : enabled === 0 ? 'None' : 'Cust.';
    badge.style.color = enabled === 0 ? 'var(--text-muted)' : 'var(--primary)';
  }
}

/**
 * Dynamically populate namespace sub-type toggles for memory nodes and template agents.
 * Builds a checkbox list from actual data, sorted by count descending.
 */
function populateNamespaceToggles(): void {
  if (!graphData) return;

  const container = document.getElementById('namespaceTypesList');
  if (!container) return;

  // Count memory nodes by namespace
  const nsCounts: Map<string, number> = new Map();
  graphData.nodes.forEach(node => {
    if ((node.source || 'memory') === 'memory') {
      const ns = node.namespace || 'memory';
      nsCounts.set(ns, (nsCounts.get(ns) || 0) + 1);
    }
  });

  // Count template agents
  let templateCount = 0;
  graphData.nodes.forEach(node => {
    if (node.source === 'agent' && TEMPLATE_AGENT_IDS.has(String(node.id || ''))) {
      templateCount++;
    }
  });

  // Build toggles HTML
  const nsEntries = Array.from(nsCounts.entries()).sort((a, b) => b[1] - a[1]);

  const togglesHTML = nsEntries.map(([ns, count]) => {
    const defaultOn = !HIDDEN_BY_DEFAULT_NAMESPACES.has(ns);
    const label = ns.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return `
      <label class="namespace-toggle-item" style="display: flex; align-items: center; gap: 4px; font-size: 10px; padding: 2px 6px;
             border-radius: 4px; cursor: pointer; transition: all 0.2s;"
             title="${label}: ${count} nodes${defaultOn ? '' : ' (hidden by default)'}">
        <input type="checkbox" class="namespace-toggle" data-namespace="${ns}" ${defaultOn ? 'checked' : ''} style="width: 11px; height: 11px; flex-shrink: 0;">
        <span style="color: var(--text-secondary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${label}</span>
        <span style="font-size: 9px; color: var(--text-muted);">${count}</span>
      </label>
    `;
  }).join('');

  // Template agents toggle
  const templateHTML = templateCount > 0 ? `
    <label class="namespace-toggle-item" style="display: flex; align-items: center; gap: 4px; font-size: 10px; padding: 2px 6px;
           border-radius: 4px; cursor: pointer; transition: all 0.2s; margin-top: 4px; border-top: 1px solid rgba(139,79,217,0.2); padding-top: 6px;"
           title="Template agents (routing labels, not real topology): ${templateCount} nodes (hidden by default)">
      <input type="checkbox" class="namespace-toggle" data-namespace="_template_agents" style="width: 11px; height: 11px; flex-shrink: 0;">
      <span style="color: var(--text-secondary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Template Agents</span>
      <span style="font-size: 9px; color: var(--text-muted);">${templateCount}</span>
    </label>
  ` : '';

  // Select-all row
  const totalNs = nsEntries.length + (templateCount > 0 ? 1 : 0);
  const enabledCount = nsEntries.filter(([ns]) => !HIDDEN_BY_DEFAULT_NAMESPACES.has(ns)).length + 0; // template agents off by default

  container.innerHTML = `
    <div style="display: flex; justify-content: flex-end; gap: 6px; margin-bottom: 4px;">
      <button id="nsSelectAll" style="background: none; border: none; color: var(--primary); cursor: pointer; font-size: 9px; padding: 0;">All</button>
      <button id="nsSelectNone" style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 9px; padding: 0;">None</button>
    </div>
    <div style="display: flex; flex-direction: column; gap: 2px; max-height: 200px; overflow-y: auto;">
      ${togglesHTML}
      ${templateHTML}
    </div>
    <div id="nsStatusText" style="font-size: 9px; color: var(--text-muted); margin-top: 4px; font-style: italic;">
      ${enabledCount}/${totalNs} sub-types shown
    </div>
  `;

  console.log(`Populated ${totalNs} namespace toggles (${enabledCount} enabled by default)`);
}

/**
 * Set up namespace toggle event handlers and initialize defaults.
 */
function setupNamespaceToggles(): void {
  populateNamespaceToggles();

  // Initialize namespace enabled state from checkboxes
  const toggles = document.querySelectorAll('.namespace-toggle');
  toggles.forEach(checkbox => {
    const input = checkbox as HTMLInputElement;
    const ns = input.dataset.namespace;
    if (ns) {
      namespaceEnabled.set(ns, input.checked);

      input.addEventListener('change', () => {
        namespaceEnabled.set(ns, input.checked);
        console.log(`Namespace toggle: ${ns} = ${input.checked}`);
        applySourceTypeFilters();
        updateNamespaceStatusText();
      });
    }
  });

  // Select All / None buttons
  document.getElementById('nsSelectAll')?.addEventListener('click', () => {
    document.querySelectorAll('.namespace-toggle').forEach(cb => {
      const input = cb as HTMLInputElement;
      input.checked = true;
      const ns = input.dataset.namespace;
      if (ns) namespaceEnabled.set(ns, true);
    });
    applySourceTypeFilters();
    updateNamespaceStatusText();
  });

  document.getElementById('nsSelectNone')?.addEventListener('click', () => {
    document.querySelectorAll('.namespace-toggle').forEach(cb => {
      const input = cb as HTMLInputElement;
      input.checked = false;
      const ns = input.dataset.namespace;
      if (ns) namespaceEnabled.set(ns, false);
    });
    applySourceTypeFilters();
    updateNamespaceStatusText();
  });

  // Collapse/expand toggle
  document.getElementById('toggleNamespaceTypes')?.addEventListener('click', () => {
    const list = document.getElementById('namespaceTypesList');
    const btn = document.getElementById('toggleNamespaceTypes');
    if (list && btn) {
      const isVisible = list.style.display !== 'none';
      list.style.display = isVisible ? 'none' : 'block';
      btn.textContent = isVisible ? '▼' : '▲';
    }
  });

  console.log(`Initialized ${toggles.length} namespace toggles`);
}

function updateNamespaceStatusText(): void {
  const toggles = document.querySelectorAll('.namespace-toggle');
  let total = 0, enabled = 0;
  toggles.forEach(cb => {
    total++;
    if ((cb as HTMLInputElement).checked) enabled++;
  });
  const statusEl = document.getElementById('nsStatusText');
  if (statusEl) {
    statusEl.textContent = `${enabled}/${total} sub-types shown`;
  }
  // Update header badge
  const badge = document.getElementById('nsTypesStatus');
  if (badge) {
    badge.textContent = enabled === total ? 'All' : enabled === 0 ? 'None' : 'Cust.';
    badge.style.color = enabled === 0 ? 'var(--text-muted)' : 'var(--primary)';
  }
}

function applySourceTypeFilters(): void {
  if (!graphData || !renderer) return;

  // Filter nodes based on node type + namespace + template agent checks
  const enabledNodeIndices = new Set<number>();
  graphData.nodes.forEach((node, i) => {
    const sourceType = node.source || 'memory';

    // Check source-level toggle
    const sourceEnabled = sourceTypeEnabled.get(sourceType);
    if (sourceEnabled === false) return;

    // For memory nodes, also check namespace-level toggle
    if (sourceType === 'memory') {
      const ns = node.namespace || 'memory';
      const nsEnabled = namespaceEnabled.get(ns);
      if (nsEnabled === false) return;
    }

    // For agent nodes, check template agent filter
    if (sourceType === 'agent') {
      const nodeId = String(node.id || '');
      if (TEMPLATE_AGENT_IDS.has(nodeId)) {
        const templateEnabled = namespaceEnabled.get('_template_agents');
        if (templateEnabled === false) return;
      }
    }

    enabledNodeIndices.add(node.nodeIndex ?? i);
  });

  console.log(`Source filter: ${graphData.nodes.length} total -> ${enabledNodeIndices.size} enabled`);

  // Filter edges to only include those between enabled nodes
  const enabledEdges = graphData.edges.filter(edge => {
    let sourceIdx: number;
    let targetIdx: number;

    if (typeof edge.source === 'number') {
      sourceIdx = edge.source;
    } else if (edge.source && typeof edge.source === 'object') {
      sourceIdx = (edge.source as GraphNode).nodeIndex ?? -1;
    } else {
      sourceIdx = -1;
    }

    if (typeof edge.target === 'number') {
      targetIdx = edge.target;
    } else if (edge.target && typeof edge.target === 'object') {
      targetIdx = (edge.target as GraphNode).nodeIndex ?? -1;
    } else {
      targetIdx = -1;
    }

    return enabledNodeIndices.has(sourceIdx) && enabledNodeIndices.has(targetIdx);
  });

  // Update renderer visibility
  renderer.setVisibleNodes(enabledNodeIndices);

  // Update force simulation with filtered nodes/edges
  if (forceSimulation) {
    const d3 = (window as any).d3;
    if (d3) {
      forceSimulation.force('link', d3.forceLink(enabledEdges)
        .id((d: GraphNode) => d.nodeIndex)
        .distance(80)
        .strength(0.1)
      );
      forceSimulation.alpha(0.3).restart();
    }
  }

  updateSourceTypeCounts();

  // Re-trigger extended mode renderers so they rebuild with visible nodes
  reapplyCurrentMode();
}

function updateSourceTypeCounts(): void {
  if (!graphData) return;

  // Count nodes by node type
  const typeCounts: Map<string, number> = new Map();
  graphData.nodes.forEach(node => {
    const sourceType = node.source || 'memory';
    typeCounts.set(sourceType, (typeCounts.get(sourceType) || 0) + 1);
  });

  // Update toggle labels with counts
  document.querySelectorAll('.source-type-toggle').forEach(checkbox => {
    const input = checkbox as HTMLInputElement;
    const sourceType = input.dataset.source;
    if (sourceType) {
      const count = typeCounts.get(sourceType) || 0;
      const label = input.parentElement?.querySelector('span');
      if (label) {
        // Preserve the readable name, add count
        const readableName = sourceType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        label.textContent = `${readableName} (${count})`;
      }
    }
  });
}

function updateEdgeTypeCounts(): void {
  if (!graphData) return;

  // Count edges by type
  const typeCounts: Map<string, number> = new Map();
  graphData.edges.forEach(edge => {
    const edgeType = edge.type || 'embedding';
    typeCounts.set(edgeType, (typeCounts.get(edgeType) || 0) + 1);
  });

  // Update toggle labels with counts (in settings panel)
  document.querySelectorAll('.edge-type-toggle').forEach(checkbox => {
    const input = checkbox as HTMLInputElement;
    const edgeType = input.dataset.type;
    if (edgeType) {
      const count = typeCounts.get(edgeType) || 0;
      const label = input.parentElement?.querySelector('span');
      if (label) {
        label.textContent = `${edgeType} (${count})`;
      }
    }
  });

  // Update edge type legend list
  renderEdgeTypeLegend(typeCounts);
}

// Edge type visual configuration (mirrors EdgeRenderer.ts)
const EDGE_LEGEND_COLORS: Record<string, string> = {
  // Deterministic - structured
  'co_edit': '#4A90D9', 'coedit': '#4A90D9',
  'trajectory-memory': '#795548', 'trajectory-sequence': '#795548', 'trajectory-action': '#795548', 'trajectory-outcome': '#795548',
  'pattern': '#808000', 'pattern_produces': '#808000',
  'same-state': '#14B8A6', 'same-action': '#14B8A6', 'same-state-prefix': '#14B8A6', 'same-agent': '#14B8A6',
  'explicit': '#10B981', 'sequence': '#10B981', 'test_pair': '#10B981', 'memory-agent': '#10B981',
  'success-cluster': '#22C55E', 'failure-cluster': '#EF4444',
  // Semantic - inferred
  'semantic': '#9B59B6', 'semantic_similar': '#9B59B6', 'semantic_bridge': '#3B82F6', 'embedding': '#9B59B6',
  'content-match': '#A855F7', 'type-mapping': '#A855F7', 'cross-type': '#A855F7', 'memory-context': '#A855F7',
  'same-namespace': '#8B5CF6', 'same-source': '#8B5CF6', 'knn-bridge': '#8B5CF6',
  // FIX-016: Foundation knowledge graph relation types
  'references': '#F59E0B', 'details': '#8B5CF6', 'learned_from': '#10B981',
  'about_file': '#14B8A6', 'extends': '#06B6D4', 'supersedes': '#DC2626',
  'instance_of': '#9CA3AF', 'coordinates': '#EF4444',
  // RC-2: Q-pattern routing
  'routes_to': '#D946EF',
  // New structural edge types (Q-pattern/trajectory decomposition)
  'has_state': '#22D3EE', 'has_action': '#10B981', 'is_agent': '#34495E',
  'trajectory-agent': '#F59E0B', 'trajectory-neural': '#9B59B6'
};

// Edge type to line style: 0=solid, 1=dashed, 2=dotted
const EDGE_LEGEND_STYLES: Record<string, number> = {
  // Solid (deterministic structural)
  'co_edit': 0, 'coedit': 0, 'trajectory-memory': 0, 'trajectory-sequence': 0, 'explicit': 0, 'sequence': 0, 'test_pair': 0, 'memory-agent': 0,
  // Dashed (pattern/Q-learning)
  'pattern': 1, 'pattern_produces': 1, 'same-state-prefix': 1, 'same-action': 1, 'same-state': 1, 'same-agent': 1,
  'success-cluster': 1, 'failure-cluster': 1, 'trajectory-action': 1, 'trajectory-outcome': 1,
  // Dotted (semantic/inferred)
  'semantic': 2, 'semantic_similar': 2, 'semantic_bridge': 2, 'embedding': 2,
  'content-match': 2, 'type-mapping': 2, 'cross-type': 2, 'memory-context': 2,
  'same-namespace': 2, 'same-source': 2, 'knn-bridge': 2,
  // FIX-016: Foundation knowledge graph relation types
  'references': 0, 'details': 0, 'learned_from': 0, 'extends': 0,   // Solid
  'about_file': 1, 'supersedes': 1,                                    // Dashed
  'instance_of': 2, 'coordinates': 2,                                  // Dotted
  // RC-2: Q-pattern routing
  'routes_to': 0,                                                       // Solid (thick)
  // New structural edge types (Q-pattern/trajectory decomposition)
  'has_state': 0, 'has_action': 0, 'is_agent': 0,                      // Solid
  'trajectory-agent': 0, 'trajectory-neural': 0                         // Solid
};

function renderEdgeTypeLegend(typeCounts: Map<string, number>): void {
  const container = document.getElementById('edgeTypeLegendList');
  if (!container || !graphData) return;

  // Build type → group mapping from edges
  const typeToGroup = new Map<string, string>();
  graphData.edges.forEach(edge => {
    const edgeType = edge.type || 'embedding';
    if (!typeToGroup.has(edgeType)) {
      typeToGroup.set(edgeType, edge.group || 'semantic');
    }
  });

  // Separate and sort by count
  const allTypes = Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1]);
  const deterministicTypes = allTypes.filter(([type]) => typeToGroup.get(type) === 'deterministic');
  const semanticTypes = allTypes.filter(([type]) => typeToGroup.get(type) !== 'deterministic');

  const detTotal = deterministicTypes.reduce((s, [, c]) => s + c, 0);
  const semTotal = semanticTypes.reduce((s, [, c]) => s + c, 0);

  // Get edge color and line style SVG
  const getEdgeColor = (type: string, group: string): string => {
    return EDGE_LEGEND_COLORS[type] || (group === 'deterministic' ? '#10B981' : '#9B59B6');
  };

  const getLineSvg = (type: string, color: string): string => {
    const style = EDGE_LEGEND_STYLES[type] ?? (type.includes('semantic') ? 2 : 0);
    const dashArray = style === 2 ? '2,2' : style === 1 ? '4,2' : 'none';
    return `<svg width="24" height="10" style="flex-shrink:0;"><line x1="0" y1="5" x2="24" y2="5" stroke="${color}" stroke-width="2" ${dashArray !== 'none' ? `stroke-dasharray="${dashArray}"` : ''}/></svg>`;
  };

  // Generate type list HTML - matching color legend style
  const generateTypeItems = (types: [string, number][], group: string) => types.map(([edgeType, count]) => {
    const isVisible = edgeTypeLegendVisible.get(edgeType) !== false;
    const color = getEdgeColor(edgeType, group);
    return `
      <div class="edge-type-legend-item" data-edge-type="${edgeType}" data-group="${group}"
           style="display: flex; align-items: center; gap: 6px; font-size: 11px; padding: 4px 6px;
                  border-radius: 6px; cursor: pointer; transition: all 0.2s;
                  flex: 1 1 calc(50% - 4px); min-width: 100px;
                  background: ${isVisible ? `rgba(139,79,217,0.15)` : 'rgba(100,100,100,0.1)'};
                  opacity: ${isVisible ? '1' : '0.4'};">
        ${getLineSvg(edgeType, color)}
        <span style="color: var(--text-secondary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${edgeType}</span>
        <span style="font-size: 9px; color: var(--text-muted); min-width: 30px; text-align: right;">${count.toLocaleString()}</span>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <!-- Deterministic -->
    <div style="margin-bottom: 6px;">
      <div class="edge-legend-group-header" data-group="deterministic" style="display: flex; align-items: center; gap: 8px; font-size: 11px; padding: 4px 8px; background: rgba(16,185,129,0.2); border-radius: 6px; cursor: pointer;">
        <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke="#10B981" stroke-width="2"/></svg>
        <span style="flex: 1; font-weight: 600; color: #10B981;">Deterministic</span>
        <span style="font-size: 9px; color: var(--text-muted);">${deterministicTypes.length} · ${detTotal.toLocaleString()}</span>
        <span class="expand-icon" style="font-size: 10px; color: var(--text-muted);">▲</span>
      </div>
      <div class="edge-legend-group-content" data-group="deterministic" style="display: flex; flex-wrap: wrap; gap: 2px; padding: 4px 0 0 12px; margin-left: 4px; border-left: 2px solid rgba(16,185,129,0.3);">
        ${generateTypeItems(deterministicTypes, 'deterministic')}
      </div>
    </div>
    <!-- Semantic -->
    <div>
      <div class="edge-legend-group-header" data-group="semantic" style="display: flex; align-items: center; gap: 8px; font-size: 11px; padding: 4px 8px; background: rgba(155,89,182,0.2); border-radius: 6px; cursor: pointer;">
        <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke="#9B59B6" stroke-width="2" stroke-dasharray="2,2"/></svg>
        <span style="flex: 1; font-weight: 600; color: #9B59B6;">Semantic</span>
        <span style="font-size: 9px; color: var(--text-muted);">${semanticTypes.length} · ${semTotal.toLocaleString()}</span>
        <span class="expand-icon" style="font-size: 10px; color: var(--text-muted);">▲</span>
      </div>
      <div class="edge-legend-group-content" data-group="semantic" style="display: flex; flex-wrap: wrap; gap: 2px; padding: 4px 0 0 12px; margin-left: 4px; border-left: 2px solid rgba(155,89,182,0.3);">
        ${generateTypeItems(semanticTypes, 'semantic')}
      </div>
    </div>
  `;

  // Add expand/collapse handlers for group headers
  container.querySelectorAll('.edge-legend-group-header').forEach(header => {
    header.addEventListener('click', () => {
      const group = (header as HTMLElement).dataset.group;
      const content = container.querySelector(`.edge-legend-group-content[data-group="${group}"]`) as HTMLElement;
      const icon = header.querySelector('.expand-icon') as HTMLElement;
      if (content && icon) {
        const isHidden = content.style.display === 'none';
        content.style.display = isHidden ? 'flex' : 'none';
        icon.textContent = isHidden ? '▲' : '▼';
      }
    });
  });

  // Add click handlers for individual type items
  container.querySelectorAll('.edge-type-legend-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const edgeType = (item as HTMLElement).dataset.edgeType;
      if (!edgeType) return;

      // Toggle legend visibility only (visual hide/show, no physics change)
      const isCurrentlyVisible = edgeTypeLegendVisible.get(edgeType) !== false;
      edgeTypeLegendVisible.set(edgeType, !isCurrentlyVisible);

      const isNowVisible = !isCurrentlyVisible;
      (item as HTMLElement).style.opacity = isNowVisible ? '1' : '0.4';
      (item as HTMLElement).style.background = isNowVisible ? 'rgba(139,79,217,0.15)' : 'rgba(100,100,100,0.1)';

      // Visual-only filter (hide/show rendering, no simulation change)
      applyEdgeTypeLegendFilter();
    });
  });
}

function applyEdgeTypeLegendFilter(): void {
  if (!renderer) return;

  // Build set of hidden edge types
  const hiddenTypes = new Set<string>();
  edgeTypeLegendVisible.forEach((visible, edgeType) => {
    if (!visible) hiddenTypes.add(edgeType);
  });

  // Tell renderer to hide edges of these types (visual only, not physics)
  renderer.setHiddenEdgeTypes(hiddenTypes);
}

function updateEdgeSubtypeStatus(group: string): void {
  const statusEl = document.querySelector(`.edge-subtype-status[data-group="${group}"]`);
  if (!statusEl) return;
  const list = statusEl.closest('.edge-subtypes-list');
  if (!list) return;
  const toggles = list.querySelectorAll('.edge-type-toggle');
  let total = 0, enabled = 0;
  toggles.forEach(cb => {
    total++;
    if ((cb as HTMLInputElement).checked) enabled++;
  });
  statusEl.textContent = `${enabled}/${total} sub-types shown`;
  // Update header badge
  const badge = document.querySelector(`.edge-subtype-header-status[data-group="${group}"]`);
  if (badge) {
    (badge as HTMLElement).textContent = enabled === total ? 'All' : enabled === 0 ? 'None' : 'Cust.';
    (badge as HTMLElement).style.color = enabled === 0 ? 'var(--text-muted)' : 'var(--primary)';
  }
}

// Legend and Settings are intentionally independent:
// - Legend: visual-only hide/show (no physics)
// - Settings: physics-level disable/remove (affects simulation)

function setupPresets(): void {
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const presetName = (btn as HTMLElement).dataset.preset;
      if (presetName && PRESETS[presetName] && renderer) {
        renderer.applyPreset(PRESETS[presetName]);
        console.log(`Applied preset: ${presetName}`);
      }
    });
  });
}

/**
 * Dynamically populate the source-filter panel from the server SSOT nodeTypeConfig.
 * Must be called BEFORE setupSourceFilters() so that event listeners can be attached.
 */
function populateSourceFilters(): void {
  const container = document.getElementById('source-filters');
  if (!container || !nodeTypeConfig) return;

  // Clear any existing items
  container.innerHTML = '';

  // Sort types by order field from SSOT
  const types = Object.entries(nodeTypeConfig)
    .sort((a: [string, any], b: [string, any]) => (a[1].order ?? 99) - (b[1].order ?? 99));

  for (const [type, cfg] of types) {
    const div = document.createElement('div');
    div.className = 'source-filter-item active';
    div.dataset.source = type;

    // SVG icon from SSOT
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('viewBox', '0 0 14 14');
    svg.innerHTML = cfg.svgIcon || '<circle cx="7" cy="7" r="5"/>';
    // Neutral icon color — actual node colors depend on color mode setting
    const shape = svg.firstElementChild;
    if (shape) shape.setAttribute('fill', 'rgba(255,255,255,0.5)');

    const label = document.createElement('span');
    label.className = 'source-filter-label';
    label.textContent = cfg.label;

    const count = document.createElement('span');
    count.className = 'source-filter-count';
    count.id = `count-${type}`;
    count.textContent = String(cfg.count || 0);

    div.appendChild(svg);
    div.appendChild(label);
    div.appendChild(count);
    container.appendChild(div);
  }
}

function setupSourceFilters(): void {
  document.querySelectorAll('.source-filter-item').forEach(item => {
    item.addEventListener('click', () => {
      item.classList.toggle('active');
      applySourceFilters();
    });
  });
}

function setupEdgeLegend(): void {
  // Edge legend is now populated dynamically by renderEdgeTypeLegend()
  // This function is kept for compatibility but the old static items were removed
}

/**
 * Single source of truth for edge group counts.
 * Uses edge.group set by server (deterministic = from DB, semantic = computed for viz).
 */
function getEdgeGroupCounts(): { deterministic: number; semantic: number } {
  if (!graphData) return { deterministic: 0, semantic: 0 };

  let deterministic = 0;
  let semantic = 0;

  graphData.edges.forEach(edge => {
    if (edge.group === 'deterministic') {
      deterministic++;
    } else {
      semantic++;
    }
  });

  return { deterministic, semantic };
}

/**
 * Updates edge count displays (settings panel, distribution bars).
 */
function updateAllEdgeCounts(): void {
  const { deterministic, semantic } = getEdgeGroupCounts();
  const total = deterministic + semantic || 1;
  const detPct = Math.round(deterministic / total * 100);
  const semPct = Math.round(semantic / total * 100);

  // Settings panel counts
  const detCountEl = document.getElementById('deterministicCount');
  const semCountEl = document.getElementById('semanticCount');
  if (detCountEl) detCountEl.textContent = deterministic.toLocaleString();
  if (semCountEl) semCountEl.textContent = semantic.toLocaleString();

  // Distribution percentages
  const detPctEl = document.getElementById('deterministicPct');
  const semPctEl = document.getElementById('semanticPct');
  if (detPctEl) detPctEl.textContent = `${detPct}%`;
  if (semPctEl) semPctEl.textContent = `${semPct}%`;

  // Distribution bars
  const detBar = document.getElementById('deterministicBar');
  const semBar = document.getElementById('semanticBar');
  if (detBar) detBar.style.width = `${detPct}%`;
  if (semBar) semBar.style.width = `${semPct}%`;
}

function applySourceFilters(): void {
  if (!graphData || !renderer) return;

  // Legend = visual-only hide/show (does NOT affect physics or settings)
  const hiddenSources = new Set<string>();

  document.querySelectorAll('.source-filter-item').forEach(item => {
    const source = (item as HTMLElement).dataset.source;
    if (source && !item.classList.contains('active')) {
      hiddenSources.add(source);
      // Also hide variant types (e.g. trajectory_success, trajectory_failed)
      const variants = sourceTypeVariantMap.get(source);
      if (variants) {
        variants.forEach(v => hiddenSources.add(v));
      }
    }
  });

  renderer.setHiddenSourceTypes(hiddenSources);
}

function setupSearch(): void {
  const searchInput = document.getElementById('searchInput') as HTMLInputElement;
  const searchBtn = document.getElementById('searchBtn');
  const clearBtn = document.getElementById('clearSearchBtn');

  searchBtn?.addEventListener('click', performSearch);
  clearBtn?.addEventListener('click', clearSearch);

  searchInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
  });
}

async function performSearch(): Promise<void> {
  const searchInput = document.getElementById('searchInput') as HTMLInputElement;
  const query = searchInput?.value.trim();
  if (!query || !renderer || !graphData) return;

  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=20`);
    const results = await response.json();

    displaySearchResults(results);

    // Highlight matching nodes
    const matchingIds = new Set(results.results.map((r: any) => r.id));
    const matchingIndices: number[] = [];

    graphData.nodes.forEach((node, i) => {
      if (matchingIds.has(node.id)) {
        matchingIndices.push(i);
      }
    });

    renderer.highlightNodes(matchingIndices);

  } catch (error) {
    console.error('Search failed:', error);
  }
}

function displaySearchResults(results: any): void {
  const container = document.getElementById('searchResults');
  if (!container) return;

  if (results.results.length === 0) {
    container.innerHTML = '<div style="padding: 10px; color: var(--text-muted);">No results found</div>';
    return;
  }

  container.innerHTML = results.results.map((r: any) => `
    <div class="result-item" data-id="${r.id}">
      <div class="result-key">${r.key || r.id}</div>
      <div class="result-ns">${r.namespace}</div>
      <div class="result-preview">${r.preview?.substring(0, 100) || ''}</div>
      <div class="result-score">Score: <strong>${r.score}</strong></div>
    </div>
  `).join('');

  // Add click handlers
  container.querySelectorAll('.result-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = (item as HTMLElement).dataset.id;
      if (id && graphData) {
        const index = graphData.nodes.findIndex(n => String(n.id) === id);
        if (index >= 0) {
          handleNodeClick(graphData.nodes[index], index);
        }
      }
    });
  });
}

function clearSearch(): void {
  const searchInput = document.getElementById('searchInput') as HTMLInputElement;
  if (searchInput) searchInput.value = '';

  const container = document.getElementById('searchResults');
  if (container) container.innerHTML = '';

  renderer?.clearHighlights();
}

// ═══════════════════════════════════════════════════════════════════════════
// SIMULATION CONTROLS
// ═══════════════════════════════════════════════════════════════════════════

let simParams = {
  // Per-group settings
  deterministicRepulsion: -100,
  deterministicLinkDistance: 500,
  semanticRepulsion: -200,
  semanticLinkDistance: 50,
  // Cluster separation
  radialTarget: 'neural_pattern',
  radialDistance: 1000,
  radialStrength: 0.5,
  clusterDeterministic: true,
  clusterSemantic: true
};

function setupSimulationControls(): void {
  // Cluster separation edge group toggles
  document.getElementById('clusterDeterministic')?.addEventListener('change', (e) => {
    simParams.clusterDeterministic = (e.target as HTMLInputElement).checked;
    updateForceSimulationParams();
  });

  document.getElementById('clusterSemantic')?.addEventListener('change', (e) => {
    simParams.clusterSemantic = (e.target as HTMLInputElement).checked;
    updateForceSimulationParams();
  });

  // Radial Target (cluster separation)
  document.getElementById('radialTarget')?.addEventListener('change', (e) => {
    simParams.radialTarget = (e.target as HTMLSelectElement).value;
    updateForceSimulationParams();
    recalculate3DPositions();  // Also update 3D if in 3D mode
  });

  // Radial Distance
  document.getElementById('radialDist')?.addEventListener('input', (e) => {
    simParams.radialDistance = parseFloat((e.target as HTMLInputElement).value);
    updateForceSimulationParams();
    recalculate3DPositions();  // Also update 3D if in 3D mode
    const label = document.getElementById('radialDistVal');
    if (label) label.textContent = `${Math.round(simParams.radialDistance / 10)}%`;
  });

  // Radial Strength
  document.getElementById('radialStrength')?.addEventListener('input', (e) => {
    simParams.radialStrength = parseFloat((e.target as HTMLInputElement).value);
    updateForceSimulationParams();
    recalculate3DPositions();  // Also update 3D if in 3D mode
    const label = document.getElementById('radialStrengthVal');
    if (label) label.textContent = simParams.radialStrength.toFixed(1);
  });

  // Graph Physics controls
  document.getElementById('centerForce')?.addEventListener('input', (e) => {
    const value = parseFloat((e.target as HTMLInputElement).value);
    if (forceSimulation) {
      const d3 = (window as any).d3;
      // Use forceX and forceY for adjustable center pull strength
      forceSimulation.force('centerX', d3.forceX(0).strength(value));
      forceSimulation.force('centerY', d3.forceY(0).strength(value));
      forceSimulation.alpha(0.3).restart();
      scheduleExtendedModeReapply();
    }
    const label = document.getElementById('centerForceVal');
    if (label) label.textContent = value.toFixed(2);
  });

  document.getElementById('collisionRadius')?.addEventListener('input', (e) => {
    const value = parseFloat((e.target as HTMLInputElement).value);
    if (forceSimulation) {
      const d3 = (window as any).d3;
      forceSimulation.force('collision', d3.forceCollide().radius(value));
      forceSimulation.alpha(0.3).restart();
      scheduleExtendedModeReapply();
    }
    const label = document.getElementById('collisionRadiusVal');
    if (label) label.textContent = value.toString();
  });

  document.getElementById('alphaDecay')?.addEventListener('input', (e) => {
    const value = parseFloat((e.target as HTMLInputElement).value);
    if (forceSimulation) {
      forceSimulation.alphaDecay(value);
      forceSimulation.alpha(0.3).restart();
      scheduleExtendedModeReapply();
    }
    const label = document.getElementById('alphaDecayVal');
    if (label) label.textContent = value.toFixed(2);
  });

  document.getElementById('velocityDecay')?.addEventListener('input', (e) => {
    const value = parseFloat((e.target as HTMLInputElement).value);
    if (forceSimulation) {
      forceSimulation.velocityDecay(value);
      forceSimulation.alpha(0.3).restart();
      scheduleExtendedModeReapply();
    }
    const label = document.getElementById('velocityDecayVal');
    if (label) label.textContent = value.toFixed(2);
  });

  // Per-group repulsion and link distance are handled in setupEdgeGroupControls
}

function updateForceSimulationParams(): void {
  if (!forceSimulation || !graphData) return;

  const d3 = (window as any).d3;
  if (!d3) return;

  // Use the stronger repulsion value (min since they're negative)
  // This ensures deterministic edges have proper effect even when outnumbered
  const effectiveRepulsion = Math.min(
    simParams.deterministicRepulsion,
    simParams.semanticRepulsion
  );

  // Update charge (repulsion) - use stronger of the two
  forceSimulation.force('charge', d3.forceManyBody().strength(effectiveRepulsion));

  // Build set of target node indices for link weakening
  // Uses module-level matchesRadialTarget function
  const targetNodeIndices = new Set<number>();
  if (simParams.radialTarget !== 'none') {
    graphData.nodes.forEach((node, i) => {
      const idx = node.nodeIndex ?? i;
      if (matchesRadialTarget(node, simParams.radialTarget)) {
        targetNodeIndices.add(idx);
      }
    });
  }

  // Update link force with per-group distances
  // Weaken links connected to target nodes so radial force can move them
  forceSimulation.force('link', d3.forceLink(graphData.edges)
    .id((d: GraphNode) => d.nodeIndex)
    .distance((edge: any) => {
      return edge.group === EdgeGroup.DETERMINISTIC
        ? simParams.deterministicLinkDistance
        : simParams.semanticLinkDistance;
    })
    .strength((edge: any) => {
      const sourceIdx = typeof edge.source === 'number' ? edge.source : edge.source?.nodeIndex;
      const targetIdx = typeof edge.target === 'number' ? edge.target : edge.target?.nodeIndex;

      // If either end is a radial target, weaken the link significantly
      if (targetNodeIndices.has(sourceIdx) || targetNodeIndices.has(targetIdx)) {
        return 0.05;  // Very weak - allows radial force to dominate
      }
      return 0.5;  // Normal strength
    }));

  // Add radial force for cluster separation
  // Apply radial force to push target nodes toward the outer ring
  console.log(`Cluster separation: ${targetNodeIndices.size} target nodes (${simParams.radialTarget}), dist=${simParams.radialDistance}, strength=${simParams.radialStrength}`);

  if (simParams.radialTarget !== 'none') {
    forceSimulation.force('radial', d3.forceRadial(simParams.radialDistance, 0, 0)
      .strength((d: GraphNode) => {
        return matchesRadialTarget(d, simParams.radialTarget) ? simParams.radialStrength : 0;
      }));
  } else {
    forceSimulation.force('radial', null);
  }

  // Reheat simulation
  forceSimulation.alpha(0.3).restart();

  // If in an extended mode, schedule a re-apply once the simulation settles
  scheduleExtendedModeReapply();
}

// ═══════════════════════════════════════════════════════════════════════════
// TIMELINE POSITIONING (fits between info + config panels)
// ═══════════════════════════════════════════════════════════════════════════

function repositionTimeline(): void {
  const timeline = document.getElementById('timeline');
  if (!timeline || timeline.style.display === 'none') return;

  const infoPanel = document.getElementById('information');
  const configPanel = document.getElementById('config');
  const gap = 12; // px gap from panels

  // Left edge: right side of info panel (or 16px if hidden)
  if (infoPanel && infoPanel.style.display !== 'none') {
    timeline.style.left = `${infoPanel.offsetLeft + infoPanel.offsetWidth + gap}px`;
  } else {
    timeline.style.left = '16px';
  }

  // Right edge: left side of config panel (or 16px if hidden)
  if (configPanel && configPanel.style.display !== 'none') {
    const configRight = window.innerWidth - configPanel.offsetLeft;
    timeline.style.right = `${configRight + gap}px`;
  } else {
    timeline.style.right = '16px';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TIMELINE CONTROLS
// ═══════════════════════════════════════════════════════════════════════════

let timelineState = {
  playing: false,
  mode: 'video' as 'video' | 'range',
  position: 1,        // 0-1, used in video mode
  rangeStart: 0,      // 0-1, used in range mode
  rangeEnd: 1,        // 0-1, used in range mode
  minDate: 0,
  maxDate: 0,
  animationId: 0
};
// Timeline-visible node indices (null = no timeline filter active, show all)
let currentTimelineVisibleIndices: Set<number> | null = null;

function tlDateStr(ts: number): string {
  const d = new Date(ts);
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}

// @ts-ignore: reserved utility function
function tlShortDate(ts: number): string {
  const d = new Date(ts);
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  return `${M}-${D}`;
}

function setupTimeline(): void {
  // Initialize date range from precomputed data
  if (computedMinMax) {
    timelineState.minDate = computedMinMax.minTime;
    timelineState.maxDate = computedMinMax.maxTime;
  }

  // Tab switching
  const tabVideo = document.getElementById('tlTabVideo');
  const tabRange = document.getElementById('tlTabRange');
  const paneVideo = document.getElementById('tlVideoPane');
  const paneRange = document.getElementById('tlRangePane');

  tabVideo?.addEventListener('click', () => {
    timelineState.mode = 'video';
    tabVideo.classList.add('active');
    tabRange?.classList.remove('active');
    if (paneVideo) paneVideo.style.display = '';
    if (paneRange) paneRange.style.display = 'none';
  });
  tabRange?.addEventListener('click', () => {
    timelineState.mode = 'range';
    // Stop playback if running
    if (timelineState.playing) toggleTimelinePlayback();
    tabRange.classList.add('active');
    tabVideo?.classList.remove('active');
    if (paneRange) paneRange.style.display = '';
    if (paneVideo) paneVideo.style.display = 'none';
    // Apply current range
    applyRangeFilter();
  });

  // --- Video mode ---
  const playBtn = document.getElementById('playBtn');
  const scrubber = document.getElementById('timelineScrubber') as HTMLInputElement;

  playBtn?.addEventListener('click', toggleTimelinePlayback);

  // Scrubber tooltip helper
  const scrubTip = document.getElementById('tlScrubTip');

  function showScrubTip(slider: HTMLInputElement, ts: number): void {
    if (!scrubTip) return;
    scrubTip.textContent = tlDateStr(ts);
    scrubTip.style.display = 'block';
    // Position above the slider thumb
    const rect = slider.getBoundingClientRect();
    const timelineRect = slider.closest('#timeline')?.getBoundingClientRect();
    if (!timelineRect) return;
    const pct = (parseInt(slider.value) - parseInt(slider.min)) /
                (parseInt(slider.max) - parseInt(slider.min));
    const thumbX = rect.left + pct * rect.width - timelineRect.left;
    const thumbY = rect.top - timelineRect.top;
    scrubTip.style.left = `${thumbX}px`;
    scrubTip.style.bottom = `${timelineRect.height - thumbY + 4}px`;
  }

  function hideScrubTip(): void {
    if (scrubTip) scrubTip.style.display = 'none';
  }

  scrubber?.addEventListener('input', (e) => {
    const value = parseInt((e.target as HTMLInputElement).value);
    timelineState.position = value / 1000;
    applyTimelineFilter();
    // Show tooltip
    const { minDate, maxDate } = timelineState;
    const cutoff = minDate + (maxDate - minDate) * timelineState.position;
    showScrubTip(scrubber, cutoff);
  });
  scrubber?.addEventListener('mouseup', hideScrubTip);
  scrubber?.addEventListener('mouseleave', hideScrubTip);

  // --- Range mode ---
  const rangeStartEl = document.getElementById('rangeStart') as HTMLInputElement;
  const rangeEndEl = document.getElementById('rangeEnd') as HTMLInputElement;

  rangeStartEl?.addEventListener('input', () => {
    const val = parseInt(rangeStartEl.value) / 1000;
    timelineState.rangeStart = val;
    if (val > timelineState.rangeEnd) {
      timelineState.rangeEnd = val;
      if (rangeEndEl) rangeEndEl.value = rangeStartEl.value;
    }
    applyRangeFilter();
    const { minDate, maxDate } = timelineState;
    showScrubTip(rangeStartEl, minDate + (maxDate - minDate) * val);
  });
  rangeStartEl?.addEventListener('mouseup', hideScrubTip);
  rangeStartEl?.addEventListener('mouseleave', hideScrubTip);

  rangeEndEl?.addEventListener('input', () => {
    const val = parseInt(rangeEndEl.value) / 1000;
    timelineState.rangeEnd = val;
    if (val < timelineState.rangeStart) {
      timelineState.rangeStart = val;
      if (rangeStartEl) rangeStartEl.value = rangeEndEl.value;
    }
    applyRangeFilter();
    const { minDate, maxDate } = timelineState;
    showScrubTip(rangeEndEl, minDate + (maxDate - minDate) * val);
  });
  rangeEndEl?.addEventListener('mouseup', hideScrubTip);
  rangeEndEl?.addEventListener('mouseleave', hideScrubTip);

  // Reset button
  document.getElementById('tlReset')?.addEventListener('click', () => {
    // Stop playback
    if (timelineState.playing) toggleTimelinePlayback();
    // Reset sliders
    timelineState.position = 1;
    timelineState.rangeStart = 0;
    timelineState.rangeEnd = 1;
    if (scrubber) scrubber.value = '1000';
    if (rangeStartEl) rangeStartEl.value = '0';
    if (rangeEndEl) rangeEndEl.value = '1000';
    // Clear filter
    currentTimelineVisibleIndices = null;
    applyComposedFilter();
    updateTimelineUI();
    refreshLegendCounts();
  });

  // Set initial date labels
  updateTimelineUI();
  updateChartDateLabels();

  // Watch info panel resize (CSS resize: horizontal) and window resize
  const infoPanel = document.getElementById('information');
  if (infoPanel) {
    new ResizeObserver(() => repositionTimeline()).observe(infoPanel);
  }
  window.addEventListener('resize', () => {
    repositionTimeline();
    repositionNodeDetails();
    repositionSearch();
  });
}

function toggleTimelinePlayback(): void {
  const playBtn = document.getElementById('playBtn');
  const scrubber = document.getElementById('timelineScrubber') as HTMLInputElement;

  if (timelineState.playing) {
    // Stop
    timelineState.playing = false;
    cancelAnimationFrame(timelineState.animationId);
    if (playBtn) {
      playBtn.innerHTML = '&#9654;';
      playBtn.classList.remove('playing');
    }
    // Hide scrub tooltip
    const tip = document.getElementById('tlScrubTip');
    if (tip) tip.style.display = 'none';
  } else {
    // Start
    timelineState.playing = true;
    if (playBtn) {
      playBtn.innerHTML = '&#9632;';
      playBtn.classList.add('playing');
    }

    // Reset to start if at end
    if (timelineState.position >= 1) {
      timelineState.position = 0;
    }

    const animate = () => {
      if (!timelineState.playing) return;

      // Use speed selector value
      const speedEl = document.getElementById('playSpeed') as HTMLSelectElement;
      const speedMs = speedEl ? parseInt(speedEl.value) || 100 : 100;
      const increment = 0.002 * (100 / speedMs);
      timelineState.position += increment;

      if (timelineState.position >= 1) {
        timelineState.position = 1;
        timelineState.playing = false;
        if (playBtn) {
          playBtn.innerHTML = '&#9654;';
          playBtn.classList.remove('playing');
        }
        const tip = document.getElementById('tlScrubTip');
        if (tip) tip.style.display = 'none';
      }

      if (scrubber) scrubber.value = String(Math.round(timelineState.position * 1000));
      applyTimelineFilter();

      // Show tooltip during playback
      if (scrubber) {
        const tip = document.getElementById('tlScrubTip');
        if (tip) {
          const { minDate, maxDate } = timelineState;
          const cutoff = minDate + (maxDate - minDate) * timelineState.position;
          tip.textContent = tlDateStr(cutoff);
          tip.style.display = 'block';
          const rect = scrubber.getBoundingClientRect();
          const tlRect = scrubber.closest('#timeline')?.getBoundingClientRect();
          if (tlRect) {
            const pct = timelineState.position;
            tip.style.left = `${rect.left + pct * rect.width - tlRect.left}px`;
            tip.style.bottom = `${tlRect.height - (rect.top - tlRect.top) + 4}px`;
          }
        }
      }

      if (timelineState.playing) {
        timelineState.animationId = requestAnimationFrame(animate);
      }
    };

    timelineState.animationId = requestAnimationFrame(animate);
  }
}

/** Update UI labels for the current timeline state */
function updateTimelineUI(): void {
  const { minDate, maxDate } = timelineState;
  const range = maxDate - minDate;

  if (timelineState.mode === 'video') {
    const cutoff = minDate + range * timelineState.position;
    const dateDisplay = document.getElementById('currentDate');
    if (dateDisplay) {
      dateDisplay.textContent = timelineState.position >= 1 ? 'All' : tlDateStr(cutoff);
    }
  } else {
    const startTs = minDate + range * timelineState.rangeStart;
    const endTs = minDate + range * timelineState.rangeEnd;
    const startLabel = document.getElementById('rangeStartDate');
    const endLabel = document.getElementById('rangeEndDate');
    if (startLabel) startLabel.textContent = tlDateStr(startTs);
    if (endLabel) endLabel.textContent = timelineState.rangeEnd >= 1 ? 'Now' : tlDateStr(endTs);
  }

  // Update filter info (compact inline in header)
  const filterInfo = document.getElementById('filterInfo');
  if (filterInfo && graphData) {
    const count = currentTimelineVisibleIndices ? currentTimelineVisibleIndices.size : graphData.nodes.length;
    const isFiltered = currentTimelineVisibleIndices !== null;
    filterInfo.innerHTML = isFiltered
      ? `<strong>${count.toLocaleString()}</strong> / ${graphData.nodes.length.toLocaleString()}`
      : 'All';
  }

  // Highlight chart bars in range
  updateChartHighlight();
}

function updateChartDateLabels(): void {
  const minEl = document.getElementById('tlChartMin');
  const maxEl = document.getElementById('tlChartMax');
  if (minEl) minEl.textContent = timelineState.minDate ? tlDateStr(timelineState.minDate) : '-';
  if (maxEl) maxEl.textContent = timelineState.maxDate ? tlDateStr(timelineState.maxDate) : '-';
}

function updateChartHighlight(): void {
  const chart = document.getElementById('timelineChart');
  if (!chart) return;
  const bars = chart.querySelectorAll('.tl-bar');
  if (bars.length === 0) return;

  let startPos: number, endPos: number;
  if (timelineState.mode === 'video') {
    startPos = 0;
    endPos = timelineState.position;
  } else {
    startPos = timelineState.rangeStart;
    endPos = timelineState.rangeEnd;
  }

  bars.forEach((bar, i) => {
    const barPos = i / bars.length;
    const inRange = barPos >= startPos && barPos <= endPos;
    bar.classList.toggle('in-range', inRange);
    bar.classList.toggle('out-range', !inRange);
  });
}

/** Range mode: filter nodes by [from, to] date window */
function applyRangeFilter(): void {
  if (!graphData || !renderer) return;
  const { minDate, maxDate, rangeStart, rangeEnd } = timelineState;
  const range = maxDate - minDate;
  const startTs = minDate + range * rangeStart;
  const endTs = minDate + range * rangeEnd;

  // If full range, clear filter
  if (rangeStart <= 0 && rangeEnd >= 1) {
    currentTimelineVisibleIndices = null;
    applyComposedFilter();
    updateTimelineUI();
    refreshLegendCounts();
    return;
  }

  const visibleIndices = new Set<number>();
  graphData.nodes.forEach((node, i) => {
    if (!node.timestamp) {
      visibleIndices.add(i); // nodes without timestamps always shown
    } else {
      const nodeDate = new Date(node.timestamp).getTime();
      if (nodeDate >= startTs && nodeDate <= endTs) {
        visibleIndices.add(i);
      }
    }
  });

  currentTimelineVisibleIndices = visibleIndices;
  applyComposedFilter();
  updateTimelineUI();
  refreshLegendCounts(visibleIndices);
}

function applyTimelineFilter(): void {
  if (!graphData || !renderer) return;

  const cutoffDate = timelineState.minDate + (timelineState.maxDate - timelineState.minDate) * timelineState.position;

  // At position 1.0, show all (clear timeline filter)
  if (timelineState.position >= 1) {
    currentTimelineVisibleIndices = null;
    applyComposedFilter();
    updateTimelineUI();
    refreshLegendCounts();
    return;
  }

  const visibleIndices = new Set<number>();
  graphData.nodes.forEach((node, i) => {
    if (!node.timestamp) {
      visibleIndices.add(i);
    } else {
      const nodeDate = new Date(node.timestamp).getTime();
      if (nodeDate <= cutoffDate) {
        visibleIndices.add(i);
      }
    }
  });

  currentTimelineVisibleIndices = visibleIndices;
  applyComposedFilter();
  updateTimelineUI();
  refreshLegendCounts(visibleIndices);
}

/**
 * Compose timeline + legend filters: renderer sees the intersection.
 * Called by both applyTimelineFilter() and applyLegendFilter().
 */
function applyComposedFilter(): void {
  if (!graphData || !renderer) return;

  const allLegendActive = legendFilterState.size === 0 ||
    Array.from(legendFilterState.values()).every(v => v);

  // No legend filter active → use timeline filter only
  if (allLegendActive) {
    if (currentTimelineVisibleIndices) {
      renderer.setVisibleNodes(currentTimelineVisibleIndices);
    } else {
      renderer.showAllNodes();
    }
    return;
  }

  // No legend items active at all → hide everything
  const activeFilters = Array.from(legendFilterState.entries())
    .filter(([_, active]) => active)
    .map(([key]) => key);
  if (activeFilters.length === 0) {
    renderer.setVisibleNodes(new Set());
    return;
  }

  // Intersect: node must pass BOTH timeline AND legend filter
  const candidates = currentTimelineVisibleIndices
    ? Array.from(currentTimelineVisibleIndices)
    : graphData.nodes.map((_, i) => i);

  const mode = currentColorMode as string;
  const activeSet = new Set(activeFilters);
  const visibleIndices = new Set<number>();

  for (const i of candidates) {
    const key = getNodeLegendFilterKey(graphData.nodes[i], mode);
    if (key && activeSet.has(key)) {
      visibleIndices.add(i);
    }
  }

  renderer.setVisibleNodes(visibleIndices);
}

/**
 * Map a node to the legend filterKey for the current color mode.
 * Returns '' if the node doesn't belong to any legend category.
 */
function getNodeLegendFilterKey(node: any, mode: string): string {
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;

  switch (mode) {
    case 'sourceType':
      return node.source || 'unknown';

    case 'memoryType':
    case 'namespace':
    case 'namespaceFull': {
      const ns = node.memoryType || node.namespace || 'unknown';
      return otherNamespaces.has(ns) ? 'ns:__other__' : `ns:${ns}`;
    }

    case 'category':
      return node.source === 'neural_pattern' && node.category
        ? `category:${node.category}` : '';

    case 'confidence':
      if (node.confidence !== undefined) {
        if (node.confidence > 0.9) return 'conf:high';
        if (node.confidence >= 0.7) return 'conf:med';
        return 'conf:low';
      }
      return 'conf:na';

    case 'domain':
      return `domain:${node.domain || 'unknown'}`;

    case 'connectivity': {
      const conn = node.connectionCount || 0;
      if (conn <= 3) return 'conn:low';
      if (conn <= 10) return 'conn:med';
      return 'conn:high';
    }

    case 'time':
    case 'recency': {
      const nodeTime = node.timestamp ? new Date(node.timestamp).getTime() : 0;
      const age = now - nodeTime;
      if (age < sevenDays) return 'time:new';
      if (age < thirtyDays) return 'time:mid';
      return 'time:old';
    }

    case 'qValue': {
      const qv = node.qValue;
      if (qv !== undefined) {
        if (qv < 0) return 'qval:low';
        if (qv <= 0.5) return 'qval:med';
        return 'qval:high';
      }
      return '';
    }

    case 'visits': {
      const v = node.visits || 0;
      if (v <= 5) return 'visits:low';
      if (v <= 20) return 'visits:med';
      return 'visits:high';
    }

    case 'success':
      if (normalizeSourceType(node.source) === 'trajectory') return node.success ? 'success:true' : 'success:false';
      return 'success:na';

    case 'agent':
      return node.agent ? `agent:${node.agent}` : '';

    case 'hasEmbedding':
      return node.hasEmbedding ? 'embed:yes' : 'embed:no';

    case 'charLength': {
      const len = (node.preview || '').length;
      if (len < 100) return 'len:short';
      if (len <= 500) return 'len:med';
      return 'len:long';
    }

    case 'wordCount': {
      const words = (node.preview || '').split(/\s+/).filter((w: string) => w.length > 0).length;
      if (words < 20) return 'words:short';
      if (words <= 100) return 'words:med';
      return 'words:long';
    }

    case 'single':
      return 'all';

    case 'dbSource':
      return node.dbSource ? `db:${node.dbSource}` : '';

    case 'rate': {
      const c = node.connectionCount || 0;
      if (c <= 2) return 'rate:low';
      if (c <= 8) return 'rate:med';
      return 'rate:high';
    }

    case 'contentType': {
      const content = node.preview || '';
      const hasCode = /[{}\[\]();]|function|const |let |var |=>|import |export /.test(content);
      const hasJson = /^[\s]*[\[{]/.test(content) && /[}\]][\s]*$/.test(content);
      if (hasJson) return 'ctype:data';
      if (hasCode) return 'ctype:code';
      if (content.length < 10) return 'ctype:other';
      return 'ctype:text';
    }

    case 'nsDepth': {
      const depth = (node.namespace || '').split('/').filter((p: string) => p.length > 0).length || 1;
      if (depth === 1) return 'depth:1';
      if (depth === 2) return 'depth:2';
      if (depth === 3) return 'depth:3';
      return 'depth:4+';
    }

    case 'keyPrefix': {
      const key = String(node.key || node.id || '');
      return `prefix:${key.split(/[/_]/)[0] || 'unknown'}`;
    }

    case 'crossLinkType': {
      const c2 = node.connectionCount || 0;
      if (c2 <= 3) return 'xlink:same';
      if (c2 <= 10) return 'xlink:cross';
      return 'xlink:hub';
    }

    case 'state':
      return node.source === 'q_pattern' && node.state ? `state:${node.state}` : '';

    case 'action':
      return node.source === 'q_pattern' && node.action ? `action:${node.action}` : '';

    case 'quality':
      if (normalizeSourceType(node.source) === 'trajectory' && node.quality !== undefined) {
        if (node.quality < 0.3) return 'qual:low';
        if (node.quality <= 0.7) return 'qual:med';
        return 'qual:high';
      }
      return '';

    // ═══ FIX-016: Foundation RL filter keys ═══

    case 'recallCount': {
      if (!node.isFoundation && node.recallCount == null) return 'recall:na';
      const rc = node.recallCount ?? 0;
      if (rc === 0) return 'recall:0';
      if (rc <= 2) return 'recall:low';
      if (rc <= 5) return 'recall:med';
      return 'recall:high';
    }

    case 'rewardSum': {
      if (node.rewardSum == null) return 'reward:na';
      if (node.rewardSum < -0.1) return 'reward:neg';
      if (node.rewardSum > 0.1) return 'reward:pos';
      return 'reward:zero';
    }

    case 'effectiveness': {
      if (node.effectiveness == null) return 'eff:na';
      if (node.effectiveness < 0.3) return 'eff:low';
      if (node.effectiveness <= 0.7) return 'eff:mid';
      return 'eff:high';
    }

    case 'layer':
      if (node.layer === 'summary') return 'layer:summary';
      if (node.layer === 'detail') return 'layer:detail';
      return 'layer:na';

    case 'foundationDoc':
      return node.document ? `doc:${node.document}` : 'doc:na';

    default:
      return '';
  }
}

/**
 * Update legend count spans in-place without rebuilding the entire legend.
 * Counts only nodes visible in the given set (or all nodes if not provided).
 */
function refreshLegendCounts(visibleIndices?: Set<number>): void {
  if (!graphData) return;
  const container = document.getElementById('colorLegend');
  if (!container) return;

  const isFiltered = !!visibleIndices;
  const mode = currentColorMode as string;
  const counts = new Map<string, number>();
  let totalVisible = 0;

  graphData.nodes.forEach((node, i) => {
    if (visibleIndices && !visibleIndices.has(i)) return;
    totalVisible++;
    const key = getNodeLegendFilterKey(node, mode);
    if (key) {
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  });

  // Update legend title to show filtered count
  const titleEl = document.getElementById('colorLegendTitle');
  if (titleEl) {
    const modeLabel = COLOR_MODE_LABELS[mode] || mode;
    titleEl.textContent = isFiltered
      ? `Color: ${modeLabel}  (${totalVisible.toLocaleString()} / ${graphData.nodes.length.toLocaleString()})`
      : `Color: ${modeLabel}`;
  }

  // Update each legend item: count + visual dim when 0
  container.querySelectorAll('.legend-filter-item').forEach(el => {
    const filterKey = (el as HTMLElement).dataset.filter;
    if (!filterKey) return;
    const countSpan = el.querySelector('.legend-count') as HTMLElement;
    const count = counts.get(filterKey) || 0;
    if (countSpan) {
      countSpan.textContent = count.toLocaleString();
    }
    // Dim items with 0 visible nodes when a filter is active
    if (isFiltered) {
      (el as HTMLElement).style.opacity = count > 0 ? '1' : '0.3';
    } else {
      (el as HTMLElement).style.opacity = '1';
    }
  });

  // Also update the info panel (node types, edge types, stat totals)
  refreshInfoPanelCounts(visibleIndices);
}

/**
 * Update the info panel node-type counts, edge-type counts, and stat totals
 * to reflect only the timeline-visible subset. When visibleIndices is null/undefined,
 * restores the full (unfiltered) counts.
 */
function refreshInfoPanelCounts(visibleIndices?: Set<number>): void {
  if (!graphData) return;
  const isFiltered = !!visibleIndices;

  // --- Node type counts (count-{source}) ---
  // Normalize trajectory variants to base type for counting
  const srcCounts: Record<string, number> = {};
  let totalVisibleNodes = 0;
  graphData.nodes.forEach((node, i) => {
    if (visibleIndices && !visibleIndices.has(i)) return;
    totalVisibleNodes++;
    const src = normalizeSourceType(node.source || 'unknown');
    srcCounts[src] = (srcCounts[src] || 0) + 1;
  });

  // Update each count-{source} element
  const knownSources = ['memory', 'neural_pattern', 'q_pattern', 'trajectory', 'file', 'state', 'action', 'agent'];
  for (const src of knownSources) {
    const el = document.getElementById(`count-${src}`);
    if (el) el.textContent = (srcCounts[src] || 0).toLocaleString();
  }
  // Also update any dynamically-discovered node types
  for (const [src, count] of Object.entries(srcCounts)) {
    const el = document.getElementById(`count-${src}`);
    if (el) el.textContent = count.toLocaleString();
  }

  // Dim source filter items that have 0 visible nodes
  document.querySelectorAll('.source-filter-item').forEach(el => {
    const src = (el as HTMLElement).dataset.source;
    if (!src) return;
    const count = srcCounts[src] || 0;
    if (isFiltered) {
      (el as HTMLElement).style.opacity = count > 0 ? '1' : '0.35';
    } else {
      (el as HTMLElement).style.opacity = '1';
    }
  });

  // --- Stat totals ---
  const statTotal = document.getElementById('stat-total');
  if (statTotal) {
    statTotal.textContent = isFiltered
      ? `${totalVisibleNodes.toLocaleString()} / ${graphData.nodes.length.toLocaleString()}`
      : graphData.nodes.length.toLocaleString();
  }

  // --- Edge counts (only edges where BOTH endpoints are visible) ---
  let totalVisibleEdges = 0;
  let detCount = 0;
  let semCount = 0;
  const edgeTypeCounts = new Map<string, number>();
  const edgeTypeToGroup = new Map<string, string>();

  graphData.edges.forEach(edge => {
    if (visibleIndices) {
      // Edge visible only if both source and target are visible
      const srcIdx = typeof edge.source === 'number' ? edge.source : 0;
      const tgtIdx = typeof edge.target === 'number' ? edge.target : 0;
      if (!visibleIndices.has(srcIdx) || !visibleIndices.has(tgtIdx)) return;
    }
    totalVisibleEdges++;
    const edgeType = edge.type || 'embedding';
    edgeTypeCounts.set(edgeType, (edgeTypeCounts.get(edgeType) || 0) + 1);
    if (!edgeTypeToGroup.has(edgeType)) {
      edgeTypeToGroup.set(edgeType, edge.group || 'semantic');
    }
    if (edge.group === 'deterministic') {
      detCount++;
    } else {
      semCount++;
    }
  });

  // Update stat-edges (info panel only — NOT the edge settings panel)
  const statEdges = document.getElementById('stat-edges');
  if (statEdges) {
    statEdges.textContent = isFiltered
      ? `${totalVisibleEdges.toLocaleString()} / ${graphData.edges.length.toLocaleString()}`
      : graphData.edges.length.toLocaleString();
  }

  // NOTE: We intentionally do NOT update the Edge Settings panel
  // (deterministicCount, semanticCount, distribution bars, etc.)
  // Those are configuration controls and always show full dataset totals.

  // Update edge type legend counts in the info panel (without rebuilding DOM)
  const legendContainer = document.getElementById('edgeTypeLegendList');
  if (legendContainer) {
    // Update group headers
    legendContainer.querySelectorAll('.edge-legend-group-header').forEach(header => {
      const group = (header as HTMLElement).dataset.group;
      const countSpan = header.querySelector('span:nth-child(3)') as HTMLElement;
      if (countSpan && group) {
        const gCount = group === 'deterministic' ? detCount : semCount;
        const gTypes = Array.from(edgeTypeCounts.entries()).filter(
          ([t]) => edgeTypeToGroup.get(t) === group
        ).length;
        countSpan.textContent = `${gTypes} · ${gCount.toLocaleString()}`;
      }
    });

    // Update individual edge type items
    legendContainer.querySelectorAll('.edge-type-legend-item').forEach(item => {
      const edgeType = (item as HTMLElement).dataset.edgeType;
      if (!edgeType) return;
      const count = edgeTypeCounts.get(edgeType) || 0;
      // The count is in the last span child
      const spans = item.querySelectorAll('span');
      const countSpan = spans[spans.length - 1] as HTMLElement;
      if (countSpan) countSpan.textContent = count.toLocaleString();
      // Dim zero-count items
      if (isFiltered) {
        (item as HTMLElement).style.opacity = count > 0 ? '1' : '0.3';
      } else {
        (item as HTMLElement).style.opacity = '1';
      }
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// COLOR & SIZE MODES
// ═══════════════════════════════════════════════════════════════════════════

// Precomputed data for color/size modes
let computedMinMax: {
  minTime: number; maxTime: number;
  minConnections: number; maxConnections: number;
  minCharLen: number; maxCharLen: number;
  minQValue: number; maxQValue: number;
  minVisits: number; maxVisits: number;
  namespaceColors: Map<string, [number, number, number]>;
  // FIX-016: Foundation RL ranges
  maxRecallCount: number;
  minRewardSum: number; maxRewardSum: number;
  documentColors: Map<string, [number, number, number]>;
} | null = null;

function computeMinMax(): void {
  if (!graphData) return;

  const timestamps = graphData.nodes
    .filter(n => n.timestamp)
    .map(n => new Date(n.timestamp!).getTime());

  const connections = graphData.nodes.map(n => n.connectionCount || 0);
  const charLens = graphData.nodes.map(n => (n.preview?.length || 0));
  const qValues = graphData.nodes.filter(n => n.qValue !== undefined).map(n => n.qValue!);
  const visits = graphData.nodes.filter(n => n.visits !== undefined).map(n => n.visits!);

  // Generate namespace colors
  const namespaces = new Set(graphData.nodes.map(n => n.namespace || 'unknown'));
  const namespaceColors = new Map<string, [number, number, number]>();
  let hue = 0;
  namespaces.forEach(ns => {
    const h = hue / 360;
    const rgb = hslToRgb(h, 0.7, 0.5);
    namespaceColors.set(ns, rgb);
    hue = (hue + 137.5) % 360; // Golden angle
  });

  // FIX-016: Compute foundation RL ranges
  const recallCounts = graphData.nodes.filter(n => n.recallCount != null).map(n => n.recallCount!);
  const rewardSums = graphData.nodes.filter(n => n.rewardSum != null).map(n => n.rewardSum!);

  // FIX-016: Generate document colors (golden angle hue rotation)
  const documents = new Set(
    graphData.nodes.filter(n => n.document).map(n => n.document!)
  );
  const documentColors = new Map<string, [number, number, number]>();
  let docHue = 30; // Start offset to avoid overlap with namespace colors
  documents.forEach(doc => {
    const h = docHue / 360;
    const rgb = hslToRgb(h, 0.75, 0.5);
    documentColors.set(doc, rgb);
    docHue = (docHue + 137.5) % 360;
  });

  computedMinMax = {
    minTime: timestamps.length ? Math.min(...timestamps) : 0,
    maxTime: timestamps.length ? Math.max(...timestamps) : 0,
    minConnections: Math.min(...connections),
    maxConnections: Math.max(...connections) || 1,
    minCharLen: Math.min(...charLens),
    maxCharLen: Math.max(...charLens) || 1,
    minQValue: qValues.length ? Math.min(...qValues) : 0,
    maxQValue: qValues.length ? Math.max(...qValues) : 1,
    minVisits: visits.length ? Math.min(...visits) : 0,
    maxVisits: visits.length ? Math.max(...visits) : 1,
    namespaceColors,
    // FIX-016
    maxRecallCount: recallCounts.length ? Math.max(...recallCounts) : 1,
    minRewardSum: rewardSums.length ? Math.min(...rewardSums) : -1,
    maxRewardSum: rewardSums.length ? Math.max(...rewardSums) : 1,
    documentColors
  };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return [f(0), f(8), f(4)];
}

function applyColorMode(): void {
  if (!renderer || !graphData) return;
  if (!computedMinMax) computeMinMax();

  const mode = currentColorMode as string;

  renderer.setNodeColors((node, _index) => {
    switch (mode) {
      case 'sourceType':
      case ColorMode.SOURCE_TYPE: {
        // Prefer server SSOT nodeTypeConfig, fall back to local NODE_SOURCE_COLORS
        if (nodeTypeConfig) {
          const base = normalizeSourceType(node.source);
          const cfg = nodeTypeConfig[base];
          if (cfg) {
            // Check for variant-specific color (e.g. trajectory_success / trajectory_failed)
            if (cfg.variants && cfg.variants[node.source]) {
              const varColor = parseInt(cfg.variants[node.source].color.slice(1), 16);
              return hexToRGB(varColor);
            }
            const colorNum = parseInt(cfg.color.slice(1), 16);
            return hexToRGB(colorNum);
          }
        }
        const colorHex = NODE_SOURCE_COLORS[node.source] || NODE_SOURCE_COLORS.memory;
        return hexToRGB(colorHex);
      }

      case 'memoryType':  // New clearer name
      case 'namespace':
      case 'namespaceFull': {
        const ns = node.memoryType || node.namespace || 'unknown';
        return computedMinMax!.namespaceColors.get(ns) || [0.5, 0.5, 0.5];
      }

      case 'category': {
        // Neural pattern categories with distinct colors
        const categoryColors: Record<string, [number, number, number]> = {
          general: [0.42, 0.18, 0.71],      // Purple
          testing: [0.06, 0.73, 0.51],      // Green
          security: [0.94, 0.27, 0.27],     // Red
          debugging: [0.96, 0.62, 0.04],    // Orange
          api: [0.23, 0.51, 0.96],          // Blue
          performance: [0.55, 0.36, 0.96],  // Violet
          documentation: [0.02, 0.71, 0.78],// Cyan
          refactoring: [0.93, 0.27, 0.60],  // Pink
          quality: [0.52, 0.80, 0.09]       // Lime
        };
        if (node.source === 'neural_pattern' && node.category) {
          return categoryColors[node.category] || [0.4, 0.4, 0.4];
        }
        // Non-neural nodes get neutral color
        return [0.3, 0.3, 0.3];
      }

      case 'confidence': {
        // Neural pattern confidence
        if (node.source === 'neural_pattern' && node.confidence !== undefined) {
          const conf = node.confidence;
          if (conf > 0.9) return [0.06, 0.73, 0.51];  // High - green
          if (conf > 0.7) return [0.96, 0.62, 0.04];  // Medium - orange
          return [0.94, 0.27, 0.27];                   // Low - red
        }
        return [0.4, 0.4, 0.4];  // N/A
      }

      case 'domain':
      case ColorMode.DOMAIN: {
        const domain = node.domain || 'unknown';
        const color = DOMAIN_COLORS[domain] || DOMAIN_COLORS.unknown;
        return hexToRGB(color);
      }

      case 'single': {
        return hexToRGB(0x6B2FB5);
      }

      case 'connectivity':
      case ColorMode.CONNECTIVITY: {
        const t = (node.connectionCount || 0) / computedMinMax!.maxConnections;
        return [0.3 + t * 0.5, 0.2 + t * 0.5, 0.7 + t * 0.3];
      }

      case 'time': {
        if (!node.timestamp) return [0.4, 0.4, 0.4];
        const t = (new Date(node.timestamp).getTime() - computedMinMax!.minTime) /
                  (computedMinMax!.maxTime - computedMinMax!.minTime);
        return [0.2 + t * 0.6, 0.3 + t * 0.4, 0.8 - t * 0.3];
      }

      case 'recency': {
        if (!node.timestamp) return [0.3, 0.3, 0.3];
        const t = (new Date(node.timestamp).getTime() - computedMinMax!.minTime) /
                  (computedMinMax!.maxTime - computedMinMax!.minTime);
        return [0.3 + t * 0.5, 0.2 + t * 0.6, 0.8];
      }

      case 'charLength': {
        const len = node.preview?.length || 0;
        const t = len / computedMinMax!.maxCharLen;
        return [0.8 - t * 0.4, 0.4 + t * 0.4, 0.5];
      }

      case 'qValue':
      case ColorMode.Q_VALUE: {
        if (node.source === 'q_pattern' && node.qValue !== undefined) {
          const range = computedMinMax!.maxQValue - computedMinMax!.minQValue || 1;
          const t = (node.qValue - computedMinMax!.minQValue) / range;
          return [1 - t, t, 0.3];
        }
        return [0.4, 0.4, 0.4];
      }

      case 'visits':
      case ColorMode.VISITS: {
        if (node.visits !== undefined) {
          const t = Math.log1p(node.visits) / Math.log1p(computedMinMax!.maxVisits);
          return [0.3 + t * 0.5, 0.6, 0.3 + t * 0.4];
        }
        return [0.4, 0.4, 0.4];
      }

      case 'success':
      case ColorMode.SUCCESS: {
        if (normalizeSourceType(node.source) === 'trajectory') {
          // Use SSOT colors for trajectory success/failure
          return node.success ? hexToRGB(NODE_SOURCE_COLORS.trajectory_success) : hexToRGB(NODE_SOURCE_COLORS.trajectory_failed);
        }
        return hexToRGB(NODE_SOURCE_COLORS[node.source] || NODE_SOURCE_COLORS.memory);
      }

      case 'agent': {
        if (node.agent) {
          // Hash agent name to color
          let hash = 0;
          for (let i = 0; i < node.agent.length; i++) {
            hash = node.agent.charCodeAt(i) + ((hash << 5) - hash);
          }
          const hue = Math.abs(hash) % 360 / 360;
          return hslToRgb(hue, 0.7, 0.5);
        }
        return [0.5, 0.5, 0.5];
      }

      case 'hasEmbedding': {
        return node.hasEmbedding ? [0.3, 0.8, 0.5] : [0.7, 0.3, 0.3];
      }

      // ═══ FIX-016: Foundation RL color modes ═══

      case 'recallCount':
      case ColorMode.RECALL_COUNT: {
        if (node.recallCount != null && node.recallCount > 0) {
          const t = node.recallCount / computedMinMax!.maxRecallCount;
          // Blue (rarely recalled) → Gold (frequently recalled)
          return [0.2 + t * 0.8, 0.3 + t * 0.5, 0.9 - t * 0.7];
        }
        // Non-foundation or never recalled
        return node.isFoundation ? [0.3, 0.3, 0.3] : [0.25, 0.25, 0.25];
      }

      case 'rewardSum':
      case ColorMode.REWARD_SUM: {
        if (node.rewardSum != null) {
          const range = computedMinMax!.maxRewardSum - computedMinMax!.minRewardSum || 1;
          const t = (node.rewardSum - computedMinMax!.minRewardSum) / range;
          // Red (negative reward) → Gray (zero) → Green (positive reward)
          if (t < 0.5) {
            const s = t * 2; // 0→1 for negative→zero
            return [0.9 - s * 0.5, 0.2 + s * 0.2, 0.2];
          } else {
            const s = (t - 0.5) * 2; // 0→1 for zero→positive
            return [0.4 - s * 0.3, 0.4 + s * 0.5, 0.2 + s * 0.1];
          }
        }
        return [0.3, 0.3, 0.3];
      }

      case 'effectiveness':
      case ColorMode.EFFECTIVENESS: {
        if (node.effectiveness != null) {
          const e = Math.max(0, Math.min(1, node.effectiveness));
          // Red (0.0 ineffective) → Yellow (0.5 neutral) → Green (1.0 effective)
          if (e < 0.5) {
            const s = e * 2;
            return [0.9, 0.2 + s * 0.6, 0.2];
          } else {
            const s = (e - 0.5) * 2;
            return [0.9 - s * 0.8, 0.8, 0.2 + s * 0.1];
          }
        }
        return [0.3, 0.3, 0.3];
      }

      case 'layer':
      case ColorMode.LAYER: {
        if (node.layer === 'summary') return [0.23, 0.51, 0.96]; // Blue
        if (node.layer === 'detail') return [0.96, 0.62, 0.04];  // Orange
        // Non-foundation nodes: gray
        return node.isFoundation ? [0.5, 0.5, 0.5] : [0.25, 0.25, 0.25];
      }

      case 'foundationDoc':
      case ColorMode.FOUNDATION_DOC: {
        if (node.document) {
          return computedMinMax!.documentColors.get(node.document) || [0.5, 0.5, 0.5];
        }
        return [0.25, 0.25, 0.25];
      }

      default:
        return hexToRGB(NODE_SOURCE_COLORS.memory);
    }
  });
}

let baseNodeSize = 8;

function applySizeMode(): void {
  if (!renderer || !graphData) return;
  if (!computedMinMax) computeMinMax();

  const mode = currentSizeMode as string;

  renderer.setNodeSizes((node, _index) => {
    switch (mode) {
      case 'fixed':
      case SizeMode.FIXED:
        return baseNodeSize;

      case 'connectivity':
      case SizeMode.CONNECTIVITY: {
        const t = (node.connectionCount || 0) / computedMinMax!.maxConnections;
        return baseNodeSize * (0.5 + t * 1.5);
      }

      case 'charLength': {
        const len = node.preview?.length || 0;
        const t = len / computedMinMax!.maxCharLen;
        return baseNodeSize * (0.5 + t * 1.5);
      }

      case 'recency': {
        if (!node.timestamp) return baseNodeSize * 0.5;
        const t = (new Date(node.timestamp).getTime() - computedMinMax!.minTime) /
                  (computedMinMax!.maxTime - computedMinMax!.minTime);
        return baseNodeSize * (0.5 + t * 1.5);
      }

      case 'crossLinks': {
        // Count cross-type connections
        const crossLinks = node.connectionCount || 0;
        const t = crossLinks / computedMinMax!.maxConnections;
        return baseNodeSize * (0.5 + t * 1.5);
      }

      case 'nsDepth': {
        const depth = (node.namespace || '').split('/').length;
        return baseNodeSize * (0.5 + Math.min(depth / 5, 1) * 1);
      }

      case 'qValue':
      case SizeMode.Q_VALUE: {
        if (node.source === 'q_pattern' && node.qValue !== undefined) {
          const range = computedMinMax!.maxQValue - computedMinMax!.minQValue || 1;
          const t = (node.qValue - computedMinMax!.minQValue) / range;
          return baseNodeSize * (0.5 + t * 1.5);
        }
        return baseNodeSize * 0.7;
      }

      case 'visits':
      case SizeMode.VISITS: {
        if (node.visits !== undefined) {
          const t = Math.log1p(node.visits) / Math.log1p(computedMinMax!.maxVisits);
          return baseNodeSize * (0.5 + t * 1.5);
        }
        return baseNodeSize * 0.7;
      }

      case 'success': {
        if (normalizeSourceType(node.source) === 'trajectory') {
          return node.success ? baseNodeSize * 1.5 : baseNodeSize * 0.8;
        }
        return baseNodeSize;
      }

      case 'quality': {
        if (node.quality !== undefined) {
          return baseNodeSize * (0.5 + node.quality * 1.5);
        }
        return baseNodeSize;
      }

      // ═══ FIX-016: Foundation RL size modes ═══

      case 'recallCount':
      case SizeMode.RECALL_COUNT: {
        if (node.recallCount != null && node.recallCount > 0) {
          const t = node.recallCount / computedMinMax!.maxRecallCount;
          return baseNodeSize * (0.5 + t * 2.0);
        }
        return node.isFoundation ? baseNodeSize * 0.5 : baseNodeSize * 0.4;
      }

      case 'effectiveness':
      case SizeMode.EFFECTIVENESS: {
        if (node.effectiveness != null) {
          const e = Math.max(0, Math.min(1, node.effectiveness));
          return baseNodeSize * (0.4 + e * 1.6);
        }
        return node.isFoundation ? baseNodeSize * 0.5 : baseNodeSize * 0.4;
      }

      default:
        return baseNodeSize;
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// COLOR LEGEND
// ═══════════════════════════════════════════════════════════════════════════

// Friendly names for color modes
const COLOR_MODE_LABELS: Record<string, string> = {
  'sourceType': 'Node Type',
  'memoryType': 'Memory Type',
  'namespace': 'Namespace',
  'namespaceFull': 'Namespace (Full)',
  'category': 'Category',
  'confidence': 'Confidence',
  'domain': 'Domain',
  'connectivity': 'Connectivity',
  'time': 'Time',
  'recency': 'Recency',
  'qValue': 'Q-Value',
  'visits': 'Visits',
  'success': 'Success',
  'agent': 'Agent',
  'hasEmbedding': 'Has Embedding',
  'charLength': 'Char Length',
  'wordCount': 'Word Count',
  'single': 'Single Color',
  'dbSource': 'DB Source',
  'rate': 'Rate',
  'contentType': 'Content Type',
  'nsDepth': 'Namespace Depth',
  'keyPrefix': 'Key Prefix',
  // FIX-016: Foundation RL modes
  'recallCount': 'Recall Count',
  'rewardSum': 'Reward Sum',
  'effectiveness': 'Effectiveness',
  'layer': 'Foundation Layer',
  'foundationDoc': 'Document Group'
};

function updateColorLegend(): void {
  const container = document.getElementById('colorLegend');
  if (!container) return;

  const mode = currentColorMode as string;

  // Update legend title with current mode
  const titleEl = document.getElementById('colorLegendTitle');
  if (titleEl) {
    titleEl.textContent = `Color: ${COLOR_MODE_LABELS[mode] || mode}`;
  }

  let legendItems: Array<{ color: string; label: string; filterKey: string; count?: number }> = [];

  switch (mode) {
    case 'sourceType':
      // Build legend from centralized constants - includes ALL node types
      {
        // Count nodes per node type
        const srcCounts = new Map<string, number>();
        if (graphData) {
          graphData.nodes.forEach(n => {
            const s = n.source || 'unknown';
            srcCounts.set(s, (srcCounts.get(s) || 0) + 1);
          });
        }
        // Build from actual data + known constants — auto-discovers new types
        const sourceTypes = new Set<string>(
          Object.keys(NODE_SOURCE_COLORS_HEX).filter(t => !t.includes('_success') && !t.includes('_failed'))
        );
        srcCounts.forEach((_, t) => sourceTypes.add(t));
        legendItems = Array.from(sourceTypes)
          .map(type => ({
            color: NODE_SOURCE_COLORS_HEX[type],
            label: NODE_TYPE_LABELS[type],
            filterKey: type,
            count: srcCounts.get(type) || 0
          }))
          .sort((a, b) => b.count - a.count);
      }
      break;

    case 'memoryType':  // New clearer name
    case 'namespace':
    case 'namespaceFull':
      if (computedMinMax?.namespaceColors && graphData) {
        // Count nodes per namespace (which is essentially memory type)
        const nsCounts = new Map<string, number>();
        graphData.nodes.forEach(n => {
          const ns = n.memoryType || n.namespace || 'unknown';
          nsCounts.set(ns, (nsCounts.get(ns) || 0) + 1);
        });

        // Get namespaces from color map and add counts
        const nsWithCounts: Array<{ ns: string; rgb: [number, number, number]; count: number }> = [];
        computedMinMax.namespaceColors.forEach((rgb, ns) => {
          nsWithCounts.push({ ns, rgb, count: nsCounts.get(ns) || 0 });
        });

        // Sort by count descending
        nsWithCounts.sort((a, b) => b.count - a.count);

        // Take top 14 and add "Other" for the rest
        const top14 = nsWithCounts.slice(0, 14);
        const otherNs = nsWithCounts.slice(14);
        const otherCount = otherNs.reduce((sum, item) => sum + item.count, 0);

        top14.forEach(({ ns, rgb, count }) => {
          const hex = `rgb(${Math.round(rgb[0]*255)},${Math.round(rgb[1]*255)},${Math.round(rgb[2]*255)})`;
          legendItems.push({ color: hex, label: ns, filterKey: `ns:${ns}`, count });
        });

        // Add "Other" category if there are more namespaces
        // Store the "other" namespaces globally for filtering
        otherNamespaces.clear();
        otherNs.forEach(item => otherNamespaces.add(item.ns));

        if (otherNs.length > 0) {
          legendItems.push({ color: '#666666', label: `Other (${otherNs.length} types)`, filterKey: 'ns:__other__', count: otherCount });
        }
      }
      break;

    case 'category':
      // Neural pattern categories
      if (graphData) {
        const catCounts = new Map<string, number>();
        graphData.nodes.forEach(n => {
          if (n.source === 'neural_pattern' && n.category) {
            catCounts.set(n.category, (catCounts.get(n.category) || 0) + 1);
          }
        });

        const categoryColors: Record<string, string> = {
          general: '#6B2FB5',
          testing: '#10B981',
          security: '#EF4444',
          debugging: '#F59E0B',
          api: '#3B82F6',
          performance: '#8B5CF6',
          documentation: '#06B6D4',
          refactoring: '#EC4899',
          quality: '#84CC16'
        };

        // Sort by count descending
        const sortedCats = Array.from(catCounts.entries()).sort((a, b) => b[1] - a[1]);
        sortedCats.forEach(([cat, count]) => {
          const color = categoryColors[cat] || '#666666';
          const label = cat.charAt(0).toUpperCase() + cat.slice(1);
          legendItems.push({ color, label, filterKey: `category:${cat}`, count });
        });

        if (legendItems.length === 0) {
          legendItems.push({ color: '#666', label: 'No categories', filterKey: 'none' });
        }
      }
      break;

    case 'confidence':
      // Neural pattern confidence levels
      legendItems = [
        { color: '#10B981', label: 'High (>0.9)', filterKey: 'conf:high' },
        { color: '#F59E0B', label: 'Medium (0.7-0.9)', filterKey: 'conf:med' },
        { color: '#EF4444', label: 'Low (<0.7)', filterKey: 'conf:low' },
        { color: '#666666', label: 'N/A', filterKey: 'conf:na' }
      ];
      break;

    case 'domain':
      if (graphData) {
        // Count nodes per domain
        const domainCounts = new Map<string, number>();
        graphData.nodes.forEach(n => {
          const domain = n.domain || 'unknown';
          domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
        });

        // Create legend items for each domain
        const domainOrder = ['code', 'architecture', 'security', 'error', 'test', 'unknown'];
        domainOrder.forEach(domain => {
          const count = domainCounts.get(domain) || 0;
          if (count > 0 || domain === 'unknown') {
            const color = DOMAIN_COLORS[domain] || DOMAIN_COLORS.unknown;
            const hex = `#${color.toString(16).padStart(6, '0')}`;
            const label = domain.charAt(0).toUpperCase() + domain.slice(1);
            legendItems.push({ color: hex, label, filterKey: `domain:${domain}`, count });
          }
        });
      }
      break;

    case 'connectivity':
      legendItems = [
        { color: '#4D3380', label: 'Low (0-3)', filterKey: 'conn:low' },
        { color: '#7A52B3', label: 'Medium (4-10)', filterKey: 'conn:med' },
        { color: '#B794F6', label: 'High (>10)', filterKey: 'conn:high' }
      ];
      break;

    case 'time':
    case 'recency':
      legendItems = [
        { color: '#4D5980', label: 'Oldest (>30d)', filterKey: 'time:old' },
        { color: '#7080B3', label: 'Middle (7-30d)', filterKey: 'time:mid' },
        { color: '#99B3FF', label: 'Newest (<7d)', filterKey: 'time:new' }
      ];
      break;

    case 'qValue':
      legendItems = [
        { color: '#FF6666', label: 'Low (<0)', filterKey: 'qval:low' },
        { color: '#B3B34D', label: 'Medium (0-0.5)', filterKey: 'qval:med' },
        { color: '#66FF4D', label: 'High (>0.5)', filterKey: 'qval:high' }
      ];
      break;

    case 'visits':
      legendItems = [
        { color: '#4D994D', label: 'Few (0-5)', filterKey: 'visits:low' },
        { color: '#66B366', label: 'Some (6-20)', filterKey: 'visits:med' },
        { color: '#99E699', label: 'Many (>20)', filterKey: 'visits:high' }
      ];
      break;

    case 'success':
      legendItems = [
        { color: '#10B981', label: 'Success', filterKey: 'success:true' },
        { color: '#EF4444', label: 'Failure', filterKey: 'success:false' },
        { color: '#666666', label: 'N/A', filterKey: 'success:na' }
      ];
      break;

    case 'agent':
      // Collect unique agents
      if (graphData) {
        const agents = new Set<string>();
        graphData.nodes.forEach(n => { if (n.agent) agents.add(n.agent); });
        agents.forEach(agent => {
          let hash = 0;
          for (let i = 0; i < agent.length; i++) {
            hash = agent.charCodeAt(i) + ((hash << 5) - hash);
          }
          const hue = Math.abs(hash) % 360;
          legendItems.push({ color: `hsl(${hue}, 70%, 50%)`, label: agent, filterKey: `agent:${agent}` });
        });
        if (legendItems.length === 0) {
          legendItems.push({ color: '#666', label: 'No agents', filterKey: 'none' });
        }
      }
      break;

    case 'hasEmbedding':
      legendItems = [
        { color: '#4DCC80', label: 'Has embedding', filterKey: 'embed:yes' },
        { color: '#B34D4D', label: 'No embedding', filterKey: 'embed:no' }
      ];
      break;

    case 'charLength':
      legendItems = [
        { color: '#CC6666', label: 'Short (<100)', filterKey: 'len:short' },
        { color: '#999966', label: 'Medium (100-500)', filterKey: 'len:med' },
        { color: '#66B380', label: 'Long (>500)', filterKey: 'len:long' }
      ];
      break;

    case 'wordCount':
      legendItems = [
        { color: '#CC6666', label: 'Few words (<20)', filterKey: 'words:short' },
        { color: '#999966', label: 'Medium (20-100)', filterKey: 'words:med' },
        { color: '#66B380', label: 'Many words (>100)', filterKey: 'words:long' }
      ];
      break;

    case 'single':
      legendItems = [
        { color: '#6B2FB5', label: 'All nodes', filterKey: 'all' }
      ];
      break;

    case 'dbSource':
      // Collect unique db sources
      if (graphData) {
        const dbSources = new Set<string>();
        graphData.nodes.forEach(n => { if (n.dbSource) dbSources.add(n.dbSource); });
        let hue = 0;
        dbSources.forEach(db => {
          legendItems.push({ color: `hsl(${hue}, 70%, 50%)`, label: db, filterKey: `db:${db}` });
          hue = (hue + 137.5) % 360;
        });
        if (legendItems.length === 0) {
          legendItems.push({ color: '#6B2FB5', label: 'Default DB', filterKey: 'all' });
        }
      } else {
        legendItems.push({ color: '#6B2FB5', label: 'DB Source', filterKey: 'all' });
      }
      break;

    case 'rate':
      legendItems = [
        { color: '#4D5980', label: 'Low rate', filterKey: 'rate:low' },
        { color: '#7080B3', label: 'Medium rate', filterKey: 'rate:med' },
        { color: '#99B3FF', label: 'High rate', filterKey: 'rate:high' }
      ];
      break;

    case 'contentType':
      legendItems = [
        { color: '#6B2FB5', label: 'Text', filterKey: 'ctype:text' },
        { color: '#10B981', label: 'Code', filterKey: 'ctype:code' },
        { color: '#F59E0B', label: 'JSON/Data', filterKey: 'ctype:data' },
        { color: '#EF4444', label: 'Other', filterKey: 'ctype:other' }
      ];
      break;

    case 'nsDepth':
      legendItems = [
        { color: '#B794F6', label: 'Depth 1 (root)', filterKey: 'depth:1' },
        { color: '#8B4FD9', label: 'Depth 2', filterKey: 'depth:2' },
        { color: '#6B2FB5', label: 'Depth 3', filterKey: 'depth:3' },
        { color: '#4A1D8F', label: 'Depth 4+', filterKey: 'depth:4+' }
      ];
      break;

    case 'keyPrefix':
      // Collect unique key prefixes (first part before / or _)
      if (graphData) {
        const prefixes = new Map<string, number>();
        graphData.nodes.forEach(n => {
          const key = String(n.key || n.id || '');
          const prefix = key.split(/[/_]/)[0] || 'unknown';
          prefixes.set(prefix, (prefixes.get(prefix) || 0) + 1);
        });
        // Sort by count and take top entries
        const sorted = Array.from(prefixes.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);
        let hue = 0;
        sorted.forEach(([prefix, _]) => {
          legendItems.push({ color: `hsl(${hue}, 70%, 50%)`, label: prefix, filterKey: `prefix:${prefix}` });
          hue = (hue + 137.5) % 360;
        });
        if (legendItems.length === 0) {
          legendItems.push({ color: '#6B2FB5', label: 'No prefixes', filterKey: 'all' });
        }
      } else {
        legendItems.push({ color: '#6B2FB5', label: 'Key Prefix', filterKey: 'all' });
      }
      break;

    case 'crossLinkType':
      legendItems = [
        { color: '#10B981', label: 'Same-type links only', filterKey: 'xlink:same' },
        { color: '#8B4FD9', label: 'Cross-type links', filterKey: 'xlink:cross' },
        { color: '#F59E0B', label: 'Hub (many cross)', filterKey: 'xlink:hub' }
      ];
      break;

    case 'state':
      // Collect unique states from q_patterns
      if (graphData) {
        const states = new Set<string>();
        graphData.nodes.forEach(n => {
          if (n.source === 'q_pattern' && n.state) states.add(n.state);
        });
        let hue = 0;
        states.forEach(state => {
          const shortState = state.length > 20 ? state.slice(0, 20) + '...' : state;
          legendItems.push({ color: `hsl(${hue}, 70%, 50%)`, label: shortState, filterKey: `state:${state}` });
          hue = (hue + 137.5) % 360;
        });
        if (legendItems.length === 0) {
          legendItems.push({ color: '#B794F6', label: 'No state data', filterKey: 'all' });
        }
        if (legendItems.length > 12) {
          legendItems = legendItems.slice(0, 12);
        }
      } else {
        legendItems.push({ color: '#B794F6', label: 'State Pattern', filterKey: 'all' });
      }
      break;

    case 'action':
      // Collect unique actions from q_patterns
      if (graphData) {
        const actions = new Set<string>();
        graphData.nodes.forEach(n => {
          if (n.source === 'q_pattern' && n.action) actions.add(n.action);
        });
        let hue = 200;
        actions.forEach(action => {
          const shortAction = action.length > 20 ? action.slice(0, 20) + '...' : action;
          legendItems.push({ color: `hsl(${hue}, 70%, 50%)`, label: shortAction, filterKey: `action:${action}` });
          hue = (hue + 137.5) % 360;
        });
        if (legendItems.length === 0) {
          legendItems.push({ color: '#8B4FD9', label: 'No action data', filterKey: 'all' });
        }
        if (legendItems.length > 12) {
          legendItems = legendItems.slice(0, 12);
        }
      } else {
        legendItems.push({ color: '#8B4FD9', label: 'Action Type', filterKey: 'all' });
      }
      break;

    case 'quality':
      legendItems = [
        { color: '#EF4444', label: 'Low quality (<0.3)', filterKey: 'qual:low' },
        { color: '#F59E0B', label: 'Medium (0.3-0.7)', filterKey: 'qual:med' },
        { color: '#10B981', label: 'High quality (>0.7)', filterKey: 'qual:high' }
      ];
      break;

    // ═══ FIX-016: Foundation RL legend entries ═══

    case 'recallCount':
      legendItems = [
        { color: '#3366E6', label: 'Never recalled (0)', filterKey: 'recall:0' },
        { color: '#6699CC', label: 'Low (1-2)', filterKey: 'recall:low' },
        { color: '#CC9933', label: 'Medium (3-5)', filterKey: 'recall:med' },
        { color: '#E6CC33', label: 'High (>5)', filterKey: 'recall:high' },
        { color: '#404040', label: 'Non-foundation', filterKey: 'recall:na' }
      ];
      break;

    case 'rewardSum':
      legendItems = [
        { color: '#E63333', label: 'Negative (<0)', filterKey: 'reward:neg' },
        { color: '#666633', label: 'Neutral (~0)', filterKey: 'reward:zero' },
        { color: '#1A8C4D', label: 'Positive (>0)', filterKey: 'reward:pos' },
        { color: '#4D4D4D', label: 'N/A', filterKey: 'reward:na' }
      ];
      break;

    case 'effectiveness':
      legendItems = [
        { color: '#E63333', label: 'Ineffective (0-0.3)', filterKey: 'eff:low' },
        { color: '#E6CC33', label: 'Moderate (0.3-0.7)', filterKey: 'eff:mid' },
        { color: '#1ACC33', label: 'Effective (0.7-1.0)', filterKey: 'eff:high' },
        { color: '#4D4D4D', label: 'N/A', filterKey: 'eff:na' }
      ];
      break;

    case 'layer':
      {
        // Count foundation nodes per layer
        let summaryCount = 0, detailCount = 0, otherCount = 0;
        if (graphData) {
          graphData.nodes.forEach(n => {
            if (n.layer === 'summary') summaryCount++;
            else if (n.layer === 'detail') detailCount++;
            else otherCount++;
          });
        }
        legendItems = [
          { color: '#3B82F6', label: 'Summary', filterKey: 'layer:summary', count: summaryCount },
          { color: '#F59E0B', label: 'Detail', filterKey: 'layer:detail', count: detailCount },
          { color: '#404040', label: 'Non-foundation', filterKey: 'layer:na', count: otherCount }
        ];
      }
      break;

    case 'foundationDoc':
      if (graphData && computedMinMax?.documentColors) {
        const docCounts = new Map<string, number>();
        graphData.nodes.forEach(n => {
          if (n.document) docCounts.set(n.document, (docCounts.get(n.document) || 0) + 1);
        });
        const sortedDocs = Array.from(docCounts.entries()).sort((a, b) => b[1] - a[1]);
        sortedDocs.forEach(([doc, count]) => {
          const rgb = computedMinMax!.documentColors.get(doc);
          const hex = rgb ? `rgb(${Math.round(rgb[0]*255)},${Math.round(rgb[1]*255)},${Math.round(rgb[2]*255)})` : '#666';
          const shortDoc = doc.length > 25 ? doc.slice(0, 25) + '...' : doc;
          legendItems.push({ color: hex, label: shortDoc, filterKey: `doc:${doc}`, count });
        });
        const nonDocCount = graphData.nodes.filter(n => !n.document).length;
        legendItems.push({ color: '#404040', label: 'Non-foundation', filterKey: 'doc:na', count: nonDocCount });
      }
      break;

    default:
      // For any unhandled modes, show the mode name
      legendItems = [
        { color: '#6B2FB5', label: mode || 'Unknown mode', filterKey: 'all' }
      ];
  }

  // Reset legend filter state for new mode (all active by default)
  legendFilterState.clear();
  legendItems.forEach(item => legendFilterState.set(item.filterKey, true));

  // Render legend with clickable items
  container.innerHTML = legendItems.map(item => {
    const isActive = legendFilterState.get(item.filterKey) !== false;
    const countStr = item.count !== undefined ? item.count.toLocaleString() : '';
    return `
      <div class="legend-filter-item" data-filter="${item.filterKey}"
           style="display: flex; align-items: center; gap: 6px; font-size: 11px; padding: 4px 8px;
                  border-radius: 6px; cursor: pointer; transition: all 0.2s;
                  flex: 1 1 calc(50% - 4px); min-width: 100px;
                  background: ${isActive ? 'rgba(139,79,217,0.2)' : 'rgba(100,100,100,0.1)'};
                  opacity: ${isActive ? '1' : '0.4'};">
        <div style="width: 14px; height: 14px; border-radius: 3px; background: ${item.color}; flex-shrink: 0;
                    box-shadow: ${isActive ? '0 0 6px ' + item.color : 'none'};"></div>
        <span style="color: ${isActive ? 'var(--text-secondary)' : 'var(--text-muted)'}; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.label}</span>
        <span class="legend-count" style="font-size: 9px; color: var(--text-muted); min-width: 30px; text-align: right;">${countStr}</span>
      </div>
    `;
  }).join('');

  // Add click handlers
  container.querySelectorAll('.legend-filter-item').forEach(el => {
    el.addEventListener('click', () => {
      const filterKey = (el as HTMLElement).dataset.filter;
      if (!filterKey || filterKey === 'all' || filterKey === 'none') return;

      // Toggle state
      const currentState = legendFilterState.get(filterKey) !== false;
      legendFilterState.set(filterKey, !currentState);

      // Update visual
      const isNowActive = !currentState;
      (el as HTMLElement).style.background = isNowActive ? 'rgba(139,79,217,0.2)' : 'rgba(100,100,100,0.1)';
      (el as HTMLElement).style.opacity = isNowActive ? '1' : '0.4';
      const colorBox = el.querySelector('div') as HTMLElement;
      if (colorBox) {
        colorBox.style.boxShadow = isNowActive ? `0 0 6px ${colorBox.style.background}` : 'none';
      }

      // Apply filter
      applyLegendFilter();
    });

    // Hover effect
    el.addEventListener('mouseenter', () => {
      (el as HTMLElement).style.transform = 'translateX(2px)';
    });
    el.addEventListener('mouseleave', () => {
      (el as HTMLElement).style.transform = 'translateX(0)';
    });
  });

  // Compute counts for all legend items (filtered by timeline if active)
  refreshLegendCounts(currentTimelineVisibleIndices || undefined);
}

function applyLegendFilter(): void {
  // Delegate to the composed filter which handles both timeline + legend
  applyComposedFilter();
}

// ═══════════════════════════════════════════════════════════════════════════
// UI UPDATES
// ═══════════════════════════════════════════════════════════════════════════

function updateStatsDisplay(): void {
  if (!renderer) return;

  const stats = renderer.getStats();

  const statTotal = document.getElementById('stat-total');
  if (statTotal) statTotal.textContent = stats.nodes.toLocaleString();

  const statEdges = document.getElementById('stat-edges');
  if (statEdges) statEdges.textContent = stats.edges.toLocaleString();

  // Update FPS if we have a display element
  const fpsDisplay = document.getElementById('fpsDisplay');
  if (fpsDisplay) fpsDisplay.textContent = `${stats.fps} FPS`;

  // FIX-016: Foundation RL stats
  if (graphData) {
    let foundationCount = 0;
    let summaryCount = 0;
    let detailCount = 0;
    let effSum = 0;
    let effCount = 0;

    for (const node of graphData.nodes) {
      if (node.isFoundation) {
        foundationCount++;
        if (node.layer === 'summary') summaryCount++;
        else if (node.layer === 'detail') detailCount++;
      }
      if (node.effectiveness != null) {
        effSum += node.effectiveness;
        effCount++;
      }
    }

    const statFoundation = document.getElementById('stat-foundation');
    if (statFoundation) statFoundation.textContent = foundationCount.toLocaleString();

    const statFoundationLabel = document.getElementById('stat-foundation-label');
    if (statFoundationLabel && foundationCount > 0) {
      statFoundationLabel.textContent = `Foundation (${summaryCount}s / ${detailCount}d)`;
    }

    const statEffectiveness = document.getElementById('stat-effectiveness');
    if (statEffectiveness) {
      statEffectiveness.textContent = effCount > 0
        ? `${safeFixed(effSum / effCount * 100, 1, 'N/A')}%`
        : 'N/A';
    }
  }
}

function updateInfoPanel(): void {
  if (!graphData) return;

  // Update source counts
  const counts: Record<string, number> = {};
  graphData.nodes.forEach(node => {
    counts[node.source] = (counts[node.source] || 0) + 1;
  });

  for (const [source, count] of Object.entries(counts)) {
    const el = document.getElementById(`count-${source}`);
    if (el) el.textContent = count.toString();
  }

  // Update edge distribution
  updateAllEdgeCounts();

  // Update color legend
  updateColorLegend();
}


function updateTimeline(): void {
  if (!graphData?.timeline) return;

  const chart = document.getElementById('timelineChart');
  if (!chart) return;

  const byDay = (graphData as any).timeline?.byDay || [];
  if (byDay.length === 0) return;

  const maxCount = Math.max(...byDay.map((d: any) => d.count));

  chart.innerHTML = byDay.slice(-30).map((d: any) => {
    const height = Math.max((d.count / maxCount) * 100, 3); // min 3% so bars are visible
    return `
      <div class="tl-bar in-range" style="height: ${height}%;">
        <div class="tl-tip">${d.day}: ${d.count}</div>
      </div>
    `;
  }).join('');

  updateChartDateLabels();
  updateChartHighlight();
}

// ═══════════════════════════════════════════════════════════════════════════
// PRESET MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

const PRESET_STORAGE_KEY = 'ruvector-presets';

interface SettingsPreset {
  name: string;
  timestamp: number;
  settings: {
    // Dropdowns
    nodeColorMode: string;
    nodeSizeMode: string;
    radialTarget: string;
    // Sliders
    nodeSize: number;
    nodeOpacity: number;
    centerForce: number;
    collisionRadius: number;
    alphaDecay: number;
    radialDist: number;
    radialStrength: number;
    deterministicOpacity: number;
    deterministicWidth: number;
    deterministicRepulsion: number;
    deterministicLinkDist: number;
    deterministicWidthMode: string;
    deterministicStyle: string;
    deterministicColor: string;
    deterministicGlow: boolean;
    semanticOpacity: number;
    semanticWidth: number;
    semanticRepulsion: number;
    semanticLinkDist: number;
    semanticWidthMode: string;
    semanticStyle: string;
    semanticColor: string;
    semanticGlow: boolean;
    // Checkboxes
    clusterDeterministic: boolean;
    clusterSemantic: boolean;
    enableDeterministic: boolean;
    enableSemantic: boolean;
    // Physics
    velocityDecay: number;
    // Edge type visibility (Map serialized as object)
    edgeTypeVisibility: Record<string, boolean>;
    // node type visibility
    sourceTypeEnabled: Record<string, boolean>;
    // memory sub-type (namespace) visibility
    namespaceEnabled?: Record<string, boolean>;
  };
}

// Default settings values
const DEFAULT_SETTINGS: SettingsPreset['settings'] = {
  nodeColorMode: 'memoryType',
  nodeSizeMode: 'connectivity',
  radialTarget: 'neural_pattern',
  nodeSize: 8,
  nodeOpacity: 0.9,
  centerForce: 0.05,
  collisionRadius: 15,
  alphaDecay: 0.05,
  radialDist: 1000,
  radialStrength: 0.5,
  deterministicOpacity: 0.15,
  deterministicWidth: 1.5,
  deterministicRepulsion: -100,
  deterministicLinkDist: 80,
  deterministicWidthMode: 'fixed',
  deterministicStyle: 'solid',
  deterministicColor: '#10B981',
  deterministicGlow: true,
  semanticOpacity: 0.10,
  semanticWidth: 2.0,
  semanticRepulsion: -200,
  semanticLinkDist: 150,
  semanticWidthMode: 'fixed',
  semanticStyle: 'solid',
  semanticColor: '#8B4FD9',
  semanticGlow: true,
  clusterDeterministic: true,
  clusterSemantic: true,
  enableDeterministic: true,
  enableSemantic: true,
  velocityDecay: 0.3,
  edgeTypeVisibility: {},
  sourceTypeEnabled: {},
  namespaceEnabled: {}  // empty = all visible (default)
};

/**
 * Collect all current settings from the UI
 */
function getAllSettings(): SettingsPreset['settings'] {
  const getVal = (id: string, fallback: any = '') => {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    if (!el) return fallback;
    if (el.type === 'checkbox') return (el as HTMLInputElement).checked;
    if (el.type === 'range') return parseFloat(el.value);
    return el.value;
  };

  return {
    nodeColorMode: getVal('nodeColorMode', 'memoryType'),
    nodeSizeMode: getVal('nodeSizeMode', 'connectivity'),
    radialTarget: getVal('radialTarget', 'neural_pattern'),
    nodeSize: getVal('nodeSize', 8),
    nodeOpacity: getVal('nodeOpacity', 0.9),
    centerForce: getVal('centerForce', 0.05),
    collisionRadius: getVal('collisionRadius', 15),
    alphaDecay: getVal('alphaDecay', 0.05),
    radialDist: getVal('radialDist', 1000),
    radialStrength: getVal('radialStrength', 0.5),
    deterministicOpacity: getVal('deterministicOpacity', 0.15),
    deterministicWidth: getVal('deterministicWidth', 1.5),
    deterministicRepulsion: getVal('deterministicRepulsion', -100),
    deterministicLinkDist: getVal('deterministicDist', 80),
    deterministicWidthMode: getVal('deterministicWidthMode', 'fixed'),
    deterministicStyle: getVal('deterministicStyle', 'solid'),
    deterministicColor: getVal('deterministicColor', '#10B981'),
    deterministicGlow: getVal('deterministicGlow', true),
    semanticOpacity: getVal('semanticOpacity', 0.10),
    semanticWidth: getVal('semanticWidth', 2.0),
    semanticRepulsion: getVal('semanticRepulsion', -200),
    semanticLinkDist: getVal('semanticDist', 150),
    semanticWidthMode: getVal('semanticWidthMode', 'fixed'),
    semanticStyle: getVal('semanticStyle', 'solid'),
    semanticColor: getVal('semanticColor', '#8B4FD9'),
    semanticGlow: getVal('semanticGlow', true),
    clusterDeterministic: getVal('clusterDeterministic', true),
    clusterSemantic: getVal('clusterSemantic', true),
    enableDeterministic: getVal('deterministicEnabled', true),
    enableSemantic: getVal('semanticEnabled', true),
    velocityDecay: getVal('velocityDecay', 0.3),
    edgeTypeVisibility: Object.fromEntries(edgeTypeVisibility),
    sourceTypeEnabled: Object.fromEntries(sourceTypeEnabled),
    namespaceEnabled: Object.fromEntries(namespaceEnabled)
  };
}

/**
 * Apply settings to UI controls and trigger visualization updates
 */
function applySettings(settings: SettingsPreset['settings']): void {
  const setVal = (id: string, value: any) => {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    if (!el) return;
    if (el.type === 'checkbox') {
      (el as HTMLInputElement).checked = value;
    } else {
      el.value = String(value);
    }
    // Trigger both change and input events to update UI and visualization
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };

  // Apply dropdowns
  setVal('nodeColorMode', settings.nodeColorMode);
  setVal('nodeSizeMode', settings.nodeSizeMode);
  setVal('radialTarget', settings.radialTarget);

  // Apply sliders
  setVal('nodeSize', settings.nodeSize);
  setVal('nodeOpacity', settings.nodeOpacity);
  setVal('centerForce', settings.centerForce);
  setVal('collisionRadius', settings.collisionRadius);
  setVal('alphaDecay', settings.alphaDecay);
  setVal('velocityDecay', settings.velocityDecay);
  setVal('radialDist', settings.radialDist);
  setVal('radialStrength', settings.radialStrength);
  setVal('deterministicOpacity', settings.deterministicOpacity);
  setVal('deterministicWidth', settings.deterministicWidth);
  setVal('deterministicRepulsion', settings.deterministicRepulsion);
  setVal('deterministicDist', settings.deterministicLinkDist);
  setVal('deterministicWidthMode', settings.deterministicWidthMode);
  setVal('deterministicStyle', settings.deterministicStyle);
  setVal('deterministicColor', settings.deterministicColor);
  setVal('semanticOpacity', settings.semanticOpacity);
  setVal('semanticWidth', settings.semanticWidth);
  setVal('semanticRepulsion', settings.semanticRepulsion);
  setVal('semanticDist', settings.semanticLinkDist);
  setVal('semanticWidthMode', settings.semanticWidthMode);
  setVal('semanticStyle', settings.semanticStyle);
  setVal('semanticColor', settings.semanticColor);

  // Apply checkboxes
  setVal('clusterDeterministic', settings.clusterDeterministic);
  setVal('clusterSemantic', settings.clusterSemantic);
  setVal('deterministicEnabled', settings.enableDeterministic);
  setVal('semanticEnabled', settings.enableSemantic);
  setVal('deterministicGlow', settings.deterministicGlow);
  setVal('semanticGlow', settings.semanticGlow);

  // Apply edge type visibility
  if (settings.edgeTypeVisibility) {
    edgeTypeVisibility.clear();
    Object.entries(settings.edgeTypeVisibility).forEach(([type, visible]) => {
      edgeTypeVisibility.set(type, visible);
      const toggle = document.querySelector(`.edge-type-toggle[data-type="${type}"]`) as HTMLInputElement;
      if (toggle) toggle.checked = visible;
    });
    // Update prefix master toggles based on children
    document.querySelectorAll('.prefix-master-toggle').forEach(toggle => {
      const prefix = (toggle as HTMLElement).dataset.prefix;
      if (prefix) {
        const children = document.querySelectorAll(`.edge-type-toggle[data-prefix="${prefix}"]`);
        const allChecked = Array.from(children).every(c => (c as HTMLInputElement).checked);
        (toggle as HTMLInputElement).checked = allChecked;
      }
    });
    // Update top-level master toggles
    document.querySelectorAll('.group-master-toggle').forEach(toggle => {
      const group = (toggle as HTMLElement).dataset.group;
      if (group) {
        const children = document.querySelectorAll(`.edge-type-toggle[data-group="${group}"]`);
        const allChecked = Array.from(children).every(c => (c as HTMLInputElement).checked);
        (toggle as HTMLInputElement).checked = allChecked;
      }
    });
    applyEdgeTypeFilters();
  }

  // Apply node type visibility
  if (settings.sourceTypeEnabled) {
    sourceTypeEnabled.clear();
    Object.entries(settings.sourceTypeEnabled).forEach(([type, enabled]) => {
      sourceTypeEnabled.set(type, enabled);
      const toggle = document.querySelector(`.source-type-toggle[data-source="${type}"]`) as HTMLInputElement;
      if (toggle) toggle.checked = enabled;
    });
  }

  // Apply memory sub-type (namespace) visibility
  if (settings.namespaceEnabled && Object.keys(settings.namespaceEnabled).length > 0) {
    namespaceEnabled.clear();
    Object.entries(settings.namespaceEnabled).forEach(([ns, enabled]) => {
      namespaceEnabled.set(ns, enabled);
      const toggle = document.querySelector(`.namespace-toggle[data-namespace="${ns}"]`) as HTMLInputElement;
      if (toggle) toggle.checked = enabled;
    });
  }

  // Apply all node visibility (source types + namespaces together)
  applySourceTypeFilters();

  console.log('Applied settings preset');
}

/**
 * Get all saved presets from localStorage
 */
function getPresets(): Record<string, SettingsPreset> {
  try {
    const stored = localStorage.getItem(PRESET_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (e) {
    console.warn('Failed to load presets from localStorage:', e);
    return {};
  }
}

/**
 * Save presets to localStorage
 */
function savePresets(presets: Record<string, SettingsPreset>): void {
  try {
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
  } catch (e) {
    console.warn('Failed to save presets to localStorage:', e);
  }
}

/**
 * Save current settings as a named preset
 */
function savePreset(name: string): boolean {
  if (!name.trim()) return false;

  const presets = getPresets();
  presets[name] = {
    name,
    timestamp: Date.now(),
    settings: getAllSettings()
  };
  savePresets(presets);
  populatePresetSelect();
  showPresetStatus(`Saved "${name}"`, 'success');
  return true;
}

/**
 * Load a preset by name
 */
function loadPreset(name: string): boolean {
  const presets = getPresets();

  // For default, check if user has saved a custom default, otherwise use hardcoded
  if (name === '__default__') {
    if (presets['__default__']) {
      applySettings(presets['__default__'].settings);
      showPresetStatus('Loaded custom default', 'success');
    } else {
      applySettings(DEFAULT_SETTINGS);
      showPresetStatus('Loaded default settings', 'success');
    }
    return true;
  }

  const preset = presets[name];
  if (!preset) {
    showPresetStatus(`Preset "${name}" not found`, 'error');
    return false;
  }

  applySettings(preset.settings);
  showPresetStatus(`Loaded "${name}"`, 'success');
  return true;
}

/**
 * Delete a preset by name
 */
function deletePreset(name: string): boolean {
  if (name === '__default__') {
    showPresetStatus('Cannot delete default preset', 'error');
    return false;
  }

  const presets = getPresets();
  if (!presets[name]) {
    showPresetStatus(`Preset "${name}" not found`, 'error');
    return false;
  }

  delete presets[name];
  savePresets(presets);
  populatePresetSelect();
  showPresetStatus(`Deleted "${name}"`, 'success');
  return true;
}

/**
 * Populate the preset dropdown with saved presets
 */
function populatePresetSelect(): void {
  const select = document.getElementById('presetSelect') as HTMLSelectElement;
  if (!select) return;

  const presets = getPresets();
  // Filter out __default__ from user presets (it's shown separately)
  const presetNames = Object.keys(presets).filter(n => n !== '__default__').sort();

  select.innerHTML = `
    <option value="__default__" selected>Default Settings</option>
    ${presetNames.map(name => `<option value="${name}">${name}</option>`).join('')}
  `;
}

/**
 * Show a status message in the preset UI
 */
function showPresetStatus(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
  const status = document.getElementById('presetStatus');
  if (!status) return;

  const colors = {
    success: '#10B981',
    error: '#EF4444',
    info: 'var(--text-muted)'
  };

  status.textContent = message;
  status.style.color = colors[type];

  // Clear after 3 seconds
  setTimeout(() => {
    if (status.textContent === message) {
      status.textContent = '';
    }
  }, 3000);
}

/**
 * Initialize preset management UI handlers
 */
function setupPresetHandlers(): void {
  const selectEl = document.getElementById('presetSelect') as HTMLSelectElement;
  const deleteBtn = document.getElementById('presetDelete');
  const saveBtn = document.getElementById('presetSave');
  const nameInput = document.getElementById('presetName') as HTMLInputElement;

  // Populate dropdown on init
  populatePresetSelect();

  // Default preset is now applied synchronously in init() — no timer needed

  // Load preset on selection change
  selectEl?.addEventListener('change', () => {
    const selected = selectEl.value;
    if (selected) {
      loadPreset(selected);
    }
  });

  // Delete button - deletes currently selected preset
  deleteBtn?.addEventListener('click', () => {
    const selected = selectEl?.value;
    if (!selected) {
      showPresetStatus('Select a preset to delete', 'error');
      return;
    }

    const presets = getPresets();
    const displayName = selected === '__default__' ? 'Default Settings' : selected;

    // For default, only allow delete if a custom default exists
    if (selected === '__default__') {
      if (!presets['__default__']) {
        showPresetStatus('Default is already original', 'error');
        return;
      }
      if (confirm(`Reset "${displayName}" to original?`)) {
        deletePreset(selected);
        showPresetStatus('Default reset to original', 'success');
      }
    } else {
      if (confirm(`Delete preset "${displayName}"?`)) {
        deletePreset(selected);
        selectEl.value = '';
      }
    }
  });

  // Save button - use input name, or selected preset name if input is empty
  saveBtn?.addEventListener('click', () => {
    let name = nameInput?.value.trim();

    // If no name entered, use currently selected preset (including default)
    if (!name && selectEl?.value) {
      name = selectEl.value === '__default__' ? '__default__' : selectEl.value;
    }

    if (name) {
      const presets = getPresets();
      const displayName = name === '__default__' ? 'Default Settings' : name;
      const isExisting = name === '__default__' || presets[name];

      if (isExisting) {
        if (confirm(`Overwrite "${displayName}"?`)) {
          savePreset(name);
          nameInput.value = '';
          selectEl.value = name;
        }
      } else {
        savePreset(name);
        nameInput.value = '';
        selectEl.value = name;
      }
    } else {
      showPresetStatus('Enter a preset name or select one', 'error');
    }
  });

  // Enter key in name input triggers save
  nameInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveBtn?.click();
    }
  });

  console.log('Preset handlers initialized');
}

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD PANELS (Phase 2 + 3)
// ═══════════════════════════════════════════════════════════════════════════

const dashboardPanelInstances = {
  trajectories: new TrajectoryTimeline(),
  algorithms: new LearningDashboard(),
  sessions: new SessionAnalytics(),
  health: new SystemHealthPanel(),
  validation: new SystemValidationPanel(),
  rewardConnector: new RewardFieldConnector(),
  learningPulse: new LearningPulsePanel(),
  sonaAttention: new SonaAttentionPanel(),
  embedding3d: new EmbeddingExplorer3D(),
  // V3 Self-Learning Panels
  learningVelocity: new LearningVelocityPanel(),
  sonaCompression: new SONACompressionPanel(),
  trajectoryFlow: new TrajectoryFlowPanel(),
  embeddingScatter: new EmbeddingScatterPanel(),
  hookTimeline: new HookTimelinePanel(),
  agentCoordination: new AgentCoordinationPanel(),
  searchMetrics: new MemorySearchMetricsPanel(),
};

let dashboardLoadedTabs = new Set<string>();
let currentDashboardTab = 'system-health';
let currentSubtab: Record<string, string> = {};

// New 5-tab structure per 04-dashboard-recommendations.md
const DASHBOARD_TABS: Record<string, { subtabs: string[]; default: string }> = {
  'system-health': { subtabs: ['health-score', 'db-size-trend', 'activity-timeline', 'key-metrics'], default: 'health-score' },
  'memory-explorer': { subtabs: ['type-distribution', 'memory-timeline', 'memory-table', 'embedding-quality'], default: 'type-distribution' },
  'learning-analytics': { subtabs: ['q-distribution', 'state-action-heatmap', 'trajectory-outcomes', 'reward-trend', 'learning-velocity'], default: 'q-distribution' },
  'sona-neural': { subtabs: ['pattern-categories', 'compression-status', 'pattern-confidence', 'embedding-health'], default: 'pattern-categories' },
  'agent-swarm': { subtabs: ['agent-memory', 'vector-index', 'system-config', 'learning-pipeline'], default: 'agent-memory' }
};

function openDashboard(tab?: string): void {
  const overlay = document.getElementById('dashboardOverlay');
  if (!overlay) return;
  overlay.classList.add('visible');
  document.getElementById('dashboardBtn')?.classList.add('active');
  if (tab) switchDashboardTab(tab);
  else switchDashboardTab(currentDashboardTab);
}

function closeDashboard(): void {
  const overlay = document.getElementById('dashboardOverlay');
  if (!overlay) return;
  overlay.classList.remove('visible');
  document.getElementById('dashboardBtn')?.classList.remove('active');
}

async function switchDashboardTab(tab: string, subtab?: string): Promise<void> {
  currentDashboardTab = tab;

  // Update tab buttons - remove all active first, then set selected
  document.querySelectorAll('.dashboard-tab').forEach(t => {
    t.classList.remove('active');
  });
  const activeTabBtn = document.querySelector(`.dashboard-tab[data-dtab="${tab}"]`);
  if (activeTabBtn) activeTabBtn.classList.add('active');

  // Show/hide content areas - hide ALL first, then show selected
  document.querySelectorAll('.dashboard-tab-content').forEach(c => {
    c.classList.remove('active');
    (c as HTMLElement).style.display = 'none';
  });
  const activeContent = document.getElementById(`dtab-${tab}`);
  if (activeContent) {
    activeContent.classList.add('active');
    activeContent.style.display = 'block';
  }

  // Update timestamp for selected tab
  updateDashboardTimestamp(tab);

  // Determine which subtab to show
  const tabConfig = DASHBOARD_TABS[tab];
  if (tabConfig) {
    const targetSubtab = subtab || currentSubtab[tab] || tabConfig.default;
    currentSubtab[tab] = targetSubtab;
    await switchSubtab(tab, targetSubtab);
  } else {
    // Fallback for legacy tabs without subtab structure - load directly
    await loadPanelForSubtab(tab);
  }
}

function switchSubtab(mainTab: string, subtab: string): void {
  const container = document.getElementById(`dtab-${mainTab}`);
  if (!container) return;

  // Update subtab buttons
  container.querySelectorAll('.subtab').forEach(b => b.classList.remove('active'));
  container.querySelector(`[data-subtab="${subtab}"]`)?.classList.add('active');

  // Show subtab content
  container.querySelectorAll('.subtab-content').forEach(c => {
    c.classList.remove('active');
    (c as HTMLElement).style.display = 'none';
  });
  const content = document.getElementById(`subtab-${subtab}`);
  if (content) {
    content.classList.add('active');
    content.style.display = 'block';
  }

  // Load panel for this subtab
  loadPanelForSubtab(subtab);
}

async function loadPanelForSubtab(subtab: string): Promise<void> {
  // Check if already loaded
  if (dashboardLoadedTabs.has(subtab)) return;

  // Find the container - could be subtab-specific or main tab container
  let container = document.getElementById(`subtab-${subtab}`);
  if (!container) {
    // Fallback: find within the main tab content
    for (const [tab, config] of Object.entries(DASHBOARD_TABS)) {
      if (config.subtabs.includes(subtab)) {
        container = document.getElementById(`dtab-${tab}`);
        break;
      }
    }
  }
  if (!container) return;

  container.innerHTML = '<div style="text-align:center;padding:40px;color:#B0B0B0;">Loading...</div>';

  try {
    switch (subtab) {
      // === Dashboard 1: System Health ===
      case 'health-score':
        await renderHealthScorePanel(container);
        break;
      case 'db-size-trend':
        await renderDbSizeTrendPanel(container);
        break;
      case 'activity-timeline':
        await renderActivityTimelinePanel(container);
        break;
      case 'key-metrics':
        await renderKeyMetricsPanel(container);
        break;

      // === Dashboard 2: Memory Explorer ===
      case 'type-distribution':
        await renderTypeDistributionPanel(container);
        break;
      case 'memory-timeline':
        await renderMemoryTimelinePanel(container);
        break;
      case 'memory-table':
        await renderMemoryTablePanel(container);
        break;
      case 'embedding-quality':
        await renderEmbeddingQualityPanel(container);
        break;

      // === Dashboard 3: Learning Analytics ===
      case 'q-distribution':
        await renderQDistributionPanel(container);
        break;
      case 'state-action-heatmap':
        await renderStateActionHeatmapPanel(container);
        break;
      case 'trajectory-outcomes':
        await renderTrajectoryOutcomesPanel(container);
        break;
      case 'reward-trend':
        await renderRewardTrendPanel(container);
        break;
      case 'learning-velocity':
        await dashboardPanelInstances.learningVelocity.init(container);
        break;

      // === Dashboard 4: SONA & Neural ===
      case 'pattern-categories':
        await renderPatternCategoriesPanel(container);
        break;
      case 'compression-status':
        await renderCompressionStatusPanel(container);
        break;
      case 'pattern-confidence':
        await renderPatternConfidencePanel(container);
        break;
      case 'embedding-health':
        await renderEmbeddingHealthPanel(container);
        break;

      // === Dashboard 5: Agent & Swarm ===
      case 'agent-memory':
        await renderAgentMemoryPanel(container);
        break;
      case 'vector-index':
        await renderVectorIndexPanel(container);
        break;
      case 'system-config':
        await renderSystemConfigPanel(container);
        break;
      case 'learning-pipeline':
        await renderLearningPipelinePanel(container);
        break;

      // Legacy fallback for backward compatibility
      case 'algorithms':
        await dashboardPanelInstances.algorithms.render(container);
        break;
      case 'sona-compression':
        await dashboardPanelInstances.sonaCompression.init(container);
        break;
      case 'trajectories':
        await dashboardPanelInstances.trajectories.render(container);
        break;
      case 'trajectory-flow':
        await dashboardPanelInstances.trajectoryFlow.init(container);
        break;
      case 'reward-field':
        await renderRewardFieldTab(container);
        break;
      case 'embedding-scatter':
        await dashboardPanelInstances.embeddingScatter.init(container);
        break;
      case 'embedding-3d':
        await dashboardPanelInstances.embedding3d.render(container);
        break;
      case 'memory-search':
        await dashboardPanelInstances.searchMetrics.init(container);
        break;
      case 'agent-coordination':
        await dashboardPanelInstances.agentCoordination.init(container);
        break;
      case 'sessions':
        await dashboardPanelInstances.sessions.render(container);
        break;
      case 'health':
        await dashboardPanelInstances.health.render(container);
        break;
      case 'validation':
        await dashboardPanelInstances.validation.render(container);
        break;
      case 'hooks-timeline':
        await dashboardPanelInstances.hookTimeline.init(container);
        break;
      case 'sona-attention':
        await dashboardPanelInstances.sonaAttention.render(container);
        break;
      case 'overview':
        await renderOverviewPanel(container);
        break;
      case 'learning-pulse':
        await dashboardPanelInstances.learningPulse.render(container);
        break;
      case 'search-metrics':
        await dashboardPanelInstances.searchMetrics.init(container);
        break;
      case 'hook-timeline':
        await dashboardPanelInstances.hookTimeline.init(container);
        break;
    }
    dashboardLoadedTabs.add(subtab);
    // Update timestamp after content loads
    updateDashboardTimestamp(subtab);
  } catch (err) {
    container.innerHTML = `<div style="text-align:center;padding:40px;color:#EF4444;">Error loading ${subtab}: ${(err as Error).message}</div>`;
  }
}

async function renderOverviewPanel(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div style="padding: 20px;">
      <h3 style="color: #B794F6; font-size: 16px; margin: 0 0 16px 0;">System Overview</h3>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
        <div style="background: rgba(183, 148, 246, 0.1); border: 1px solid rgba(183, 148, 246, 0.3); border-radius: 8px; padding: 16px;">
          <div style="color: #B0B0B0; font-size: 12px;">Total Memories</div>
          <div style="color: #B794F6; font-size: 24px; font-weight: bold;" id="overview-memories">--</div>
        </div>
        <div style="background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 8px; padding: 16px;">
          <div style="color: #B0B0B0; font-size: 12px;">Active Trajectories</div>
          <div style="color: #22C55E; font-size: 24px; font-weight: bold;" id="overview-trajectories">--</div>
        </div>
        <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 16px;">
          <div style="color: #B0B0B0; font-size: 12px;">Patterns Learned</div>
          <div style="color: #3B82F6; font-size: 24px; font-weight: bold;" id="overview-patterns">--</div>
        </div>
        <div style="background: rgba(249, 115, 22, 0.1); border: 1px solid rgba(249, 115, 22, 0.3); border-radius: 8px; padding: 16px;">
          <div style="color: #B0B0B0; font-size: 12px;">Active Agents</div>
          <div style="color: #F97316; font-size: 24px; font-weight: bold;" id="overview-agents">--</div>
        </div>
      </div>
    </div>
  `;

  // Fetch stats for overview - fetch live-status and agents in parallel
  try {
    const [liveRes, agentsRes] = await Promise.all([
      fetch('/api/live-status'),
      fetch('/api/agents/coordination')
    ]);

    if (liveRes.ok) {
      const data = await liveRes.json();
      const memoriesEl = document.getElementById('overview-memories');
      const trajectoriesEl = document.getElementById('overview-trajectories');
      const patternsEl = document.getElementById('overview-patterns');
      if (memoriesEl) memoriesEl.textContent = String(data.memoriesCount ?? 0);
      if (trajectoriesEl) trajectoriesEl.textContent = String(data.trajectoriesCount ?? 0);
      if (patternsEl) patternsEl.textContent = String(data.patternsCount ?? 0);
    }

    // FIX: Populate agents count from /api/agents/coordination
    if (agentsRes.ok) {
      const agentsData = await agentsRes.json();
      const agentsEl = document.getElementById('overview-agents');
      if (agentsEl) {
        // Use activeAgents if available, fallback to totalAgents
        const count = agentsData.summary?.activeAgents ?? agentsData.summary?.totalAgents ?? 0;
        agentsEl.textContent = String(count);
      }
    }
  } catch {
    // Silently fail - overview will show "--" values
  }
}

// Track last refresh time for each dashboard tab
const dashboardRefreshTimes = new Map<string, Date>();

function updateDashboardTimestamp(tab: string): void {
  const now = new Date();
  dashboardRefreshTimes.set(tab, now);

  // Update shared header timestamp element
  const timeEl = document.getElementById('dashboard-current-time');
  if (timeEl) {
    const storedTime = dashboardRefreshTimes.get(tab);
    if (storedTime) {
      timeEl.textContent = `Updated: ${storedTime.toLocaleTimeString()}`;
      timeEl.title = `${tab}: ${storedTime.toLocaleString()}`;
    } else {
      timeEl.textContent = '--';
    }
  }
}

async function renderRewardFieldTab(container: HTMLElement): Promise<void> {
  const data = await dashboardPanelInstances.rewardConnector.getRewardData();
  container.innerHTML = '';

  const header = document.createElement('div');
  header.style.cssText = 'margin-bottom:16px;';
  header.innerHTML = `
    <h3 style="color:#B794F6;font-size:14px;margin:0 0 8px 0;">Reinforcement Learning Reward Map</h3>
    <p style="color:#B0B0B0;font-size:12px;margin:0 0 6px 0;">
      Heatmap of cumulative RL reward signals from Q-learning trajectories. Bright regions
      indicate high-reward state-action patterns; dark regions indicate low or negative reward.
    </p>
    <p style="color:#808080;font-size:11px;margin:0 0 12px 0;">
      Each point represents a trajectory's reward mapped to its UMAP 2D position.
      Activate <strong style="color:#B794F6;">Spacetime</strong> view mode to see the 3D
      potential field with geodesic edge deflection.
    </p>
    <div style="display:flex;gap:12px;margin-bottom:16px;">
      <div style="background:rgba(107,47,181,0.15);border:1px solid rgba(139,79,217,0.3);border-radius:8px;padding:12px;flex:1;text-align:center;">
        <div style="font-size:24px;font-weight:700;color:#B794F6;font-family:var(--font-mono);">${data.points.length}</div>
        <div style="font-size:10px;color:#B0B0B0;text-transform:uppercase;">Reward Points</div>
      </div>
      <div style="background:rgba(107,47,181,0.15);border:1px solid rgba(139,79,217,0.3);border-radius:8px;padding:12px;flex:1;text-align:center;">
        <div style="font-size:24px;font-weight:700;color:#10B981;font-family:var(--font-mono);">${data.points.length > 0 ? safeFixed(data.points.reduce((s, p) => s + safeNum(p.reward), 0) / data.points.length, 3, '0') : '0'}</div>
        <div style="font-size:10px;color:#B0B0B0;text-transform:uppercase;">Avg Reward</div>
      </div>
      <div style="background:rgba(107,47,181,0.15);border:1px solid rgba(139,79,217,0.3);border-radius:8px;padding:12px;flex:1;text-align:center;">
        <div style="font-size:24px;font-weight:700;color:#F59E0B;font-family:var(--font-mono);">${data.points.length > 0 ? safeFixed(Math.max(...data.points.map(p => safeNum(p.reward, 0))), 3, '0') : '0'}</div>
        <div style="font-size:10px;color:#B0B0B0;text-transform:uppercase;">Max Reward</div>
      </div>
    </div>
  `;
  container.appendChild(header);

  // Render a 2D heatmap of the potential field
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  canvas.style.cssText = 'width:100%;max-width:512px;border-radius:8px;border:1px solid rgba(139,79,217,0.3);';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx || data.points.length === 0) return;

  // Build a simple potential field
  const res = 128;
  const field = new Float32Array(res * res);
  const sigma = 15;

  // Normalize points to 0-1
  const minX = Math.min(...data.points.map(p => p.x));
  const maxX = Math.max(...data.points.map(p => p.x));
  const minY = Math.min(...data.points.map(p => p.y));
  const maxY = Math.max(...data.points.map(p => p.y));
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  for (const pt of data.points) {
    const px = ((pt.x - minX) / rangeX) * (res - 1);
    const py = ((pt.y - minY) / rangeY) * (res - 1);
    const r2sigma2 = 2 * sigma * sigma;
    const extent = Math.ceil(sigma * 3);
    for (let dy = -extent; dy <= extent; dy++) {
      for (let dx = -extent; dx <= extent; dx++) {
        const ix = Math.round(px + dx);
        const iy = Math.round(py + dy);
        if (ix < 0 || ix >= res || iy < 0 || iy >= res) continue;
        const dist2 = dx * dx + dy * dy;
        field[iy * res + ix] += pt.reward * Math.exp(-dist2 / r2sigma2);
      }
    }
  }

  // Normalize field
  let maxF = 0;
  for (let i = 0; i < field.length; i++) if (field[i] > maxF) maxF = field[i];
  if (maxF > 0) for (let i = 0; i < field.length; i++) field[i] /= maxF;

  // Render field to canvas
  const imgData = ctx.createImageData(res, res);
  for (let i = 0; i < field.length; i++) {
    const v = field[i];
    // Purple-to-green gradient
    const r = Math.round(107 * (1 - v) + 16 * v);
    const g = Math.round(47 * (1 - v) + 185 * v);
    const b = Math.round(181 * (1 - v) + 129 * v);
    imgData.data[i * 4] = r;
    imgData.data[i * 4 + 1] = g;
    imgData.data[i * 4 + 2] = b;
    imgData.data[i * 4 + 3] = 200 + Math.round(55 * v);
  }
  ctx.putImageData(imgData, 0, 0);

  // Scale up to canvas size
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = res;
  tempCanvas.height = res;
  tempCanvas.getContext('2d')!.putImageData(imgData, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.clearRect(0, 0, 512, 512);
  ctx.drawImage(tempCanvas, 0, 0, 512, 512);

  // Draw reward points as dots
  for (const pt of data.points) {
    const px = ((pt.x - minX) / rangeX) * 512;
    const py = ((pt.y - minY) / rangeY) * 512;
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fillStyle = pt.reward > 0.5 ? '#10B981' : pt.reward > 0 ? '#F59E0B' : '#EF4444';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  // Activate spacetime hint
  const hint = document.createElement('div');
  hint.style.cssText = 'margin-top:12px;padding:10px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:6px;font-size:11px;color:#10B981;';
  hint.textContent = 'Tip: Select "Spacetime" in the view mode dropdown to see this field integrated with geodesic edge deflection in the main 3D visualization.';
  container.appendChild(hint);
}

// ═══════════════════════════════════════════════════════════════════════════
// NEW DASHBOARD PANEL RENDERING FUNCTIONS (per 04-dashboard-recommendations.md)
// ═══════════════════════════════════════════════════════════════════════════

// --- Dashboard 1: System Health ---

async function renderHealthScorePanel(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div style="padding: 20px;">
      <h3 style="color: #B794F6; font-size: 16px; margin: 0 0 16px 0;">System Health Score Card</h3>
      <div id="health-loading" style="text-align: center; padding: 20px; color: #B0B0B0;">Loading health data...</div>
      <div id="health-content" style="display: none;">
        <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 20px;">
          <div style="font-size: 48px; font-weight: bold; font-family: var(--font-mono);" id="health-score-value">--</div>
          <div style="font-size: 14px; color: #B0B0B0;">Overall Health</div>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px;" id="health-metrics-grid"></div>
      </div>
    </div>
  `;

  try {
    const res = await fetch('/api/system-health');
    if (!res.ok) throw new Error('Failed to fetch health data');
    const data = await res.json();

    const loadingEl = document.getElementById('health-loading');
    const contentEl = document.getElementById('health-content');
    const scoreEl = document.getElementById('health-score-value');
    const gridEl = document.getElementById('health-metrics-grid');

    if (loadingEl) loadingEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'block';

    // Calculate health score
    const embCoverage = data.meta?.embeddingCoverage || 0;
    const healthScore = Math.round(embCoverage);
    const scoreColor = healthScore >= 90 ? '#22c55e' : healthScore >= 70 ? '#f59e0b' : '#ef4444';

    if (scoreEl) {
      scoreEl.textContent = `${healthScore}%`;
      scoreEl.style.color = scoreColor;
    }

    // Build metrics grid
    const metrics = [
      { label: 'Memory DB', value: data.tableCounts?.memories || 0, status: true, suffix: ' entries' },
      { label: 'Embeddings', value: `${safeFixed(embCoverage, 1, '0')}%`, status: embCoverage > 95 },
      { label: 'Neural Patterns', value: data.tableCounts?.neural_patterns || 0, status: true, suffix: ' active' },
      { label: 'Q-Learning', value: data.tableCounts?.patterns || 0, status: true, suffix: ' pat' },
      { label: 'Edges', value: data.tableCounts?.edges || 0, status: true },
      { label: 'Trajectories', value: data.tableCounts?.trajectories || 0, status: true }
    ];

    if (gridEl) {
      gridEl.innerHTML = metrics.map(m => `
        <div style="background: rgba(${m.status ? '34,197,94' : '239,68,68'},0.1); border: 1px solid rgba(${m.status ? '34,197,94' : '239,68,68'},0.3); border-radius: 8px; padding: 12px;">
          <div style="font-size: 10px; color: ${m.status ? '#22c55e' : '#ef4444'};">${m.status ? '\u2713' : '\u26A0'} ${m.label}</div>
          <div style="font-size: 18px; font-weight: bold; color: #fff; font-family: var(--font-mono);">${m.value}${m.suffix || ''}</div>
        </div>
      `).join('');
    }
  } catch (err) {
    container.innerHTML = `<div style="padding: 40px; text-align: center; color: #ef4444;">Error loading health data: ${(err as Error).message}</div>`;
  }
}

async function renderDbSizeTrendPanel(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div style="padding: 20px;">
      <h3 style="color: #B794F6; font-size: 16px; margin: 0 0 16px 0;">Database Size Trend</h3>
      <div id="db-size-content">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;" id="db-size-cards"></div>
        <div style="margin-top: 16px; padding: 12px; background: rgba(107,47,181,0.1); border-radius: 8px;">
          <div style="font-size: 11px; color: #B0B0B0;">Monitor database growth rate. Alert thresholds: > 100MB warning, > 500MB critical.</div>
        </div>
      </div>
    </div>
  `;

  try {
    const res = await fetch('/api/system-health');
    if (!res.ok) throw new Error('Failed to fetch');
    const data = await res.json();

    const cardsEl = document.getElementById('db-size-cards');
    if (cardsEl && data.dbInfo) {
      const sizeMB = safeFixed(safeNum(data.dbInfo.size, 0) / (1024 * 1024), 2, '0');
      cardsEl.innerHTML = `
        <div style="background: rgba(107,47,181,0.15); border: 1px solid rgba(139,79,217,0.3); border-radius: 8px; padding: 16px;">
          <div style="color: #B0B0B0; font-size: 12px;">intelligence.db</div>
          <div style="color: #B794F6; font-size: 24px; font-weight: bold;">${sizeMB} MB</div>
          <div style="color: #808080; font-size: 10px;">Last modified: ${data.dbInfo.lastModified || '--'}</div>
        </div>
        <div style="background: rgba(107,47,181,0.15); border: 1px solid rgba(139,79,217,0.3); border-radius: 8px; padding: 16px;">
          <div style="color: #B0B0B0; font-size: 12px;">Total Rows</div>
          <div style="color: #B794F6; font-size: 24px; font-weight: bold;">${data.meta?.totalRows || 0}</div>
          <div style="color: #808080; font-size: 10px;">Across ${data.meta?.tablesPresent || 0} tables</div>
        </div>
      `;
    }
  } catch (err) {
    container.innerHTML = `<div style="padding: 40px; text-align: center; color: #ef4444;">Error: ${(err as Error).message}</div>`;
  }
}

async function renderActivityTimelinePanel(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div style="padding: 20px;">
      <h3 style="color: #B794F6; font-size: 16px; margin: 0 0 16px 0;">Recent Activity Timeline</h3>
      <div id="activity-list" style="max-height: 400px; overflow-y: auto;"></div>
    </div>
  `;

  try {
    const res = await fetch('/api/live-status');
    if (!res.ok) throw new Error('Failed to fetch');
    const data = await res.json();

    const listEl = document.getElementById('activity-list');
    if (listEl) {
      // FIX: Use enhanced recentActivity array if available (server-side sorted and detailed)
      // Fall back to legacy lastMemoryTimestamp/lastTrajectoryTimestamp approach
      const activities: Array<{ time: number; type: string; text: string; subtype?: string }> = [];

      // Prefer recentActivity array from enhanced API
      if (data.recentActivity && Array.isArray(data.recentActivity) && data.recentActivity.length > 0) {
        for (const activity of data.recentActivity) {
          const ts = activity.timestamp;
          if (ts && ts > 0) {
            const timeMs = ts < 1e12 ? ts * 1000 : ts;
            activities.push({
              time: timeMs,
              type: activity.type || 'unknown',
              subtype: activity.subtype,
              text: activity.summary || `${activity.type} activity`
            });
          }
        }
      } else {
        // Legacy fallback: use lastMemoryTimestamp/lastTrajectoryTimestamp
        const memTs = data.lastMemoryTimestamp || data.lastMemoryTime;
        if (memTs && memTs > 0) {
          const timeMs = memTs < 1e12 ? memTs * 1000 : memTs;
          activities.push({
            time: timeMs,
            type: 'memory',
            text: `Memory created (total: ${data.memoriesCount || 0})`
          });
        }

        const trajTs = data.lastTrajectoryTimestamp || data.lastTrajectoryTime;
        if (trajTs && trajTs > 0) {
          const timeMs = trajTs < 1e12 ? trajTs * 1000 : trajTs;
          activities.push({
            time: timeMs,
            type: 'trajectory',
            text: `Trajectory recorded (total: ${data.trajectoriesCount || 0})`
          });
        }

        const patternTs = data.lastPatternTimestamp;
        if (patternTs && patternTs > 0) {
          const timeMs = patternTs < 1e12 ? patternTs * 1000 : patternTs;
          activities.push({
            time: timeMs,
            type: 'pattern',
            text: `Pattern updated (total: ${data.patternsCount || 0})`
          });
        }
      }

      // Sort by most recent first
      activities.sort((a, b) => b.time - a.time);

      if (activities.length === 0) {
        listEl.innerHTML = '<div style="color: #808080; text-align: center; padding: 20px;">No recent activity</div>';
      } else {
        listEl.innerHTML = activities.map(a => {
          const timeStr = new Date(a.time).toLocaleString();
          // Activity type icons and colors
          const typeConfig: Record<string, { icon: string; color: string }> = {
            memory: { icon: '\uD83D\uDCDD', color: '#B794F6' },     // Memo
            trajectory: { icon: '\uD83D\uDCC8', color: '#22C55E' }, // Chart
            pattern: { icon: '\uD83E\uDDE0', color: '#F59E0B' },    // Brain
            unknown: { icon: '\u2022', color: '#808080' }          // Bullet
          };
          const config = typeConfig[a.type] || typeConfig.unknown;
          const subtypeLabel = a.subtype ? ` (${a.subtype})` : '';
          return `
            <div style="display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid rgba(139,79,217,0.15);">
              <div style="font-size: 14px;">${config.icon}</div>
              <div style="flex: 1;">
                <div style="font-size: 12px; color: #E0E0E0;">${a.text}</div>
                <div style="font-size: 10px; color: #808080;">${timeStr}</div>
              </div>
              <div style="font-size: 10px; color: ${config.color}; text-transform: uppercase;">${a.type}${subtypeLabel}</div>
            </div>
          `;
        }).join('');
      }
    }
  } catch (err) {
    container.innerHTML = `<div style="padding: 40px; text-align: center; color: #ef4444;">Error: ${(err as Error).message}</div>`;
  }
}

async function renderKeyMetricsPanel(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div style="padding: 20px;">
      <h3 style="color: #B794F6; font-size: 16px; margin: 0 0 16px 0;">Key Metrics</h3>
      <div id="key-metrics-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;"></div>
    </div>
  `;

  try {
    const res = await fetch('/api/system-health');
    if (!res.ok) throw new Error('Failed to fetch');
    const data = await res.json();

    const gridEl = document.getElementById('key-metrics-grid');
    if (gridEl) {
      const embCoverage = data.meta?.embeddingCoverage || 0;
      const memories = data.tableCounts?.memories || 0;
      const edges = data.tableCounts?.edges || 0;
      const edgeDensity = memories > 0 ? safeFixed(edges / memories, 2, '0') : '0';

      // FIX: Use meta.avgQValue (from patterns table) instead of convergence.finalAvg (from rewardHistory)
      // The API provides avgQValue directly calculated from patterns.q_value
      const avgQValue = safeNum(data.meta?.avgQValue, 0) || safeNum(data.convergence?.finalAvg, 0);

      const metrics = [
        { label: 'Embedding Coverage', value: `${safeFixed(embCoverage, 1, '0')}%`, target: '>95%', ok: embCoverage > 95 },
        { label: 'SONA Compression', value: '100%', target: '100%', ok: true },
        { label: 'Q-Value Average', value: safeFixed(avgQValue, 3, '0.000'), target: '>0.5', ok: avgQValue > 0.5 },
        { label: 'Edge Density', value: edgeDensity, target: '>2.0', ok: parseFloat(edgeDensity) > 2.0 }
      ];

      gridEl.innerHTML = metrics.map(m => `
        <div style="background: rgba(107,47,181,0.1); border: 1px solid rgba(139,79,217,0.2); border-radius: 8px; padding: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #B0B0B0; font-size: 11px;">${m.label}</span>
            <span style="font-size: 9px; color: ${m.ok ? '#22c55e' : '#f59e0b'};">${m.ok ? '\u2713' : '\u26A0'}</span>
          </div>
          <div style="font-size: 20px; font-weight: bold; color: #B794F6; font-family: var(--font-mono);">${m.value}</div>
          <div style="font-size: 9px; color: #808080;">Target: ${m.target}</div>
        </div>
      `).join('');
    }
  } catch (err) {
    container.innerHTML = `<div style="padding: 40px; text-align: center; color: #ef4444;">Error: ${(err as Error).message}</div>`;
  }
}

// --- Dashboard 2: Memory Explorer ---

async function renderTypeDistributionPanel(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div style="padding: 20px;">
      <h3 style="color: #B794F6; font-size: 16px; margin: 0 0 16px 0;">Memory Type Distribution</h3>
      <div style="display: flex; gap: 24px; align-items: flex-start;">
        <div id="type-chart" style="width: 200px; height: 200px;"></div>
        <div id="type-legend" style="flex: 1;"></div>
      </div>
    </div>
  `;

  try {
    const res = await fetch('/api/memory-types');
    if (!res.ok) throw new Error('Failed to fetch');
    const data = await res.json();

    const legendEl = document.getElementById('type-legend');
    const chartEl = document.getElementById('type-chart');

    const types = data.types || [];
    const total = types.reduce((s: number, t: { count: number }) => s + t.count, 0);
    const colors = ['#B794F6', '#22D3EE', '#10B981', '#F59E0B', '#EF4444', '#EC4899'];

    if (legendEl) {
      legendEl.innerHTML = types.map((t: { type: string; count: number }, i: number) => {
        const pct = total > 0 ? safeFixed((t.count / total) * 100, 1, '0') : '0';
        return `
          <div style="display: flex; align-items: center; gap: 8px; padding: 4px 0;">
            <div style="width: 12px; height: 12px; border-radius: 50%; background: ${colors[i % colors.length]};"></div>
            <span style="flex: 1; font-size: 12px; color: #E0E0E0;">${t.type}</span>
            <span style="font-size: 12px; color: #B794F6; font-family: var(--font-mono);">${t.count}</span>
            <span style="font-size: 10px; color: #808080;">(${pct}%)</span>
          </div>
        `;
      }).join('');
    }

    // Simple donut chart using SVG
    if (chartEl && types.length > 0) {
      let cumulativeAngle = 0;
      const paths = types.map((t: { count: number }, i: number) => {
        const angle = (t.count / total) * 360;
        const startAngle = cumulativeAngle;
        cumulativeAngle += angle;
        const endAngle = cumulativeAngle;

        const startRad = (startAngle - 90) * Math.PI / 180;
        const endRad = (endAngle - 90) * Math.PI / 180;
        const largeArc = angle > 180 ? 1 : 0;

        const x1 = 100 + 70 * Math.cos(startRad);
        const y1 = 100 + 70 * Math.sin(startRad);
        const x2 = 100 + 70 * Math.cos(endRad);
        const y2 = 100 + 70 * Math.sin(endRad);

        return `<path d="M 100 100 L ${x1} ${y1} A 70 70 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${colors[i % colors.length]}" opacity="0.8"/>`;
      }).join('');

      chartEl.innerHTML = `
        <svg viewBox="0 0 200 200" width="200" height="200">
          ${paths}
          <circle cx="100" cy="100" r="40" fill="#0D0612"/>
          <text x="100" y="105" text-anchor="middle" fill="#B794F6" font-size="18" font-weight="bold">${total}</text>
        </svg>
      `;
    }
  } catch (err) {
    container.innerHTML = `<div style="padding: 40px; text-align: center; color: #ef4444;">Error: ${(err as Error).message}</div>`;
  }
}

async function renderMemoryTimelinePanel(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div style="padding: 20px;">
      <h3 style="color: #B794F6; font-size: 16px; margin: 0 0 16px 0;">Memory Timeline</h3>
      <div id="memory-timeline-chart" style="height: 200px; background: rgba(107,47,181,0.1); border-radius: 8px; padding: 12px;"></div>
      <div style="margin-top: 8px; font-size: 10px; color: #808080;">X-axis: Date/hour, Y-axis: Memory count by type</div>
    </div>
  `;

  try {
    // Try the dedicated memories-timeline API first, fallback to session-analytics
    let timelineData: Array<{ label: string; count: number }> = [];
    let useHourly = false;

    const timelineRes = await fetch('/api/memories-timeline');
    if (timelineRes.ok) {
      const tData = await timelineRes.json();
      // If only 1 day of data, use byHour for better visualization
      if (tData.byDay && tData.byDay.length === 1 && tData.byHour && tData.byHour.length > 0) {
        // Aggregate byHour data (may have multiple types per hour)
        const hourMap = new Map<string, number>();
        for (const h of tData.byHour) {
          const existing = hourMap.get(h.hour) || 0;
          hourMap.set(h.hour, existing + (h.count || 0));
        }
        timelineData = Array.from(hourMap.entries()).map(([hour, count]) => ({
          label: hour.slice(11, 16), // Extract "HH:MM"
          count
        }));
        useHourly = true;
      } else if (tData.byDay && tData.byDay.length > 0) {
        timelineData = tData.byDay.map((d: { day: string; count: number }) => ({
          label: d.day,
          count: d.count
        }));
      }
    }

    // Fallback to session-analytics if memories-timeline has no data
    if (timelineData.length === 0) {
      const res = await fetch('/api/session-analytics');
      if (res.ok) {
        const data = await res.json();
        if (data.sessions && data.sessions.length > 0) {
          timelineData = data.sessions.map((s: { date: string; memoryCount: number }) => ({
            label: s.date,
            count: s.memoryCount
          }));
        }
      }
    }

    const chartEl = document.getElementById('memory-timeline-chart');
    if (chartEl) {
      if (timelineData.length === 0) {
        chartEl.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #808080; font-size: 12px;">
            No timeline data available. Memories may not have valid timestamps.
          </div>
        `;
        return;
      }

      // Simple bar representation
      const sessions = timelineData.slice(-14); // Last 14 entries
      const maxCount = Math.max(...sessions.map((s) => s.count), 1);
      const totalCount = timelineData.reduce((s, d) => s + d.count, 0);
      const timeLabel = useHourly ? `${totalCount} memories (hourly breakdown)` : `${totalCount} memories over ${timelineData.length} days`;

      chartEl.innerHTML = `
        <div style="display: flex; align-items: flex-end; height: 150px; gap: 4px;">
          ${sessions.map((s) => {
            const height = (s.count / maxCount) * 100;
            return `
              <div style="flex: 1; display: flex; flex-direction: column; align-items: center;">
                <div style="width: 100%; height: ${height}%; background: linear-gradient(180deg, #B794F6 0%, #6B2FB5 100%); border-radius: 2px 2px 0 0; min-height: 4px;" title="${s.label}: ${s.count}"></div>
                <div style="font-size: 8px; color: #808080; margin-top: 4px; writing-mode: vertical-rl; transform: rotate(180deg);">${useHourly ? s.label : (s.label || '').slice(5)}</div>
              </div>
            `;
          }).join('')}
        </div>
        <div style="margin-top: 8px; text-align: center; font-size: 11px; color: #B794F6;">Total: ${timeLabel}</div>
      `;
    }
  } catch (err) {
    container.innerHTML = `<div style="padding: 40px; text-align: center; color: #ef4444;">Error: ${(err as Error).message}</div>`;
  }
}

async function renderMemoryTablePanel(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div style="padding: 20px;">
      <h3 style="color: #B794F6; font-size: 16px; margin: 0 0 16px 0;">Memory Table</h3>
      <div style="margin-bottom: 12px;">
        <input type="text" id="memory-search-input" placeholder="Search memories..." style="width: 100%; padding: 8px 12px; background: rgba(107,47,181,0.15); border: 1px solid rgba(139,79,217,0.3); border-radius: 6px; color: #fff; font-size: 12px;">
      </div>
      <div id="memory-table" style="max-height: 400px; overflow-y: auto;"></div>
    </div>
  `;

  try {
    const res = await fetch('/api/graph');
    if (!res.ok) throw new Error('Failed to fetch');
    const data = await res.json();

    const tableEl = document.getElementById('memory-table');
    const memories = (data.nodes || []).filter((n: { source: string }) => n.source === 'memory').slice(0, 50);

    if (tableEl) {
      tableEl.innerHTML = `
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr style="border-bottom: 1px solid rgba(139,79,217,0.3);">
              <th style="text-align: left; padding: 8px; color: #B794F6;">ID</th>
              <th style="text-align: left; padding: 8px; color: #B794F6;">Type</th>
              <th style="text-align: left; padding: 8px; color: #B794F6;">Content Preview</th>
              <th style="text-align: center; padding: 8px; color: #B794F6;">Embed</th>
            </tr>
          </thead>
          <tbody>
            ${memories.map((m: { id: string; memoryType?: string; namespace?: string; content?: string; preview?: string; label?: string; hasEmbedding?: boolean }) => `
              <tr style="border-bottom: 1px solid rgba(139,79,217,0.1);">
                <td style="padding: 8px; color: #808080; font-family: var(--font-mono); font-size: 9px;">${(m.id || '').slice(0, 12)}...</td>
                <td style="padding: 8px; color: #E0E0E0;">${m.memoryType || m.namespace || '--'}</td>
                <td style="padding: 8px; color: #B0B0B0; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${(m.preview || m.content || m.label || '(no content)').slice(0, 60)}${(m.preview || m.content || m.label || '').length > 60 ? '...' : ''}</td>
                <td style="padding: 8px; text-align: center;">${m.hasEmbedding ? '\u2713' : '\u2717'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }
  } catch (err) {
    container.innerHTML = `<div style="padding: 40px; text-align: center; color: #ef4444;">Error: ${(err as Error).message}</div>`;
  }
}

async function renderEmbeddingQualityPanel(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div style="padding: 20px;">
      <h3 style="color: #B794F6; font-size: 16px; margin: 0 0 16px 0;">Embedding Quality</h3>
      <div id="embedding-gauge" style="text-align: center;"></div>
    </div>
  `;

  try {
    const res = await fetch('/api/system-health');
    if (!res.ok) throw new Error('Failed to fetch');
    const data = await res.json();

    const gaugeEl = document.getElementById('embedding-gauge');
    const coverage = data.meta?.embeddingCoverage || 0;
    const total = data.tableCounts?.memories || 0;
    const withEmbed = Math.round(total * coverage / 100);

    if (gaugeEl) {
      const color = coverage >= 95 ? '#22c55e' : coverage >= 80 ? '#f59e0b' : '#ef4444';
      const circumference = 2 * Math.PI * 60;
      const offset = circumference * (1 - coverage / 100);

      gaugeEl.innerHTML = `
        <svg width="160" height="160" viewBox="0 0 160 160">
          <circle cx="80" cy="80" r="60" fill="none" stroke="#261442" stroke-width="12"/>
          <circle cx="80" cy="80" r="60" fill="none" stroke="${color}" stroke-width="12"
            stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
            stroke-linecap="round" transform="rotate(-90 80 80)"
            style="transition: stroke-dashoffset 1s ease;"/>
          <text x="80" y="75" text-anchor="middle" fill="#fff" font-size="24" font-weight="bold">${safeFixed(coverage, 1, '0')}%</text>
          <text x="80" y="95" text-anchor="middle" fill="#808080" font-size="11">${withEmbed}/${total}</text>
        </svg>
        <div style="margin-top: 12px; color: #B0B0B0; font-size: 12px;">Memories with valid 384d embeddings</div>
      `;
    }
  } catch (err) {
    container.innerHTML = `<div style="padding: 40px; text-align: center; color: #ef4444;">Error: ${(err as Error).message}</div>`;
  }
}

// --- Dashboard 3: Learning Analytics ---

async function renderQDistributionPanel(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div style="padding: 20px;">
      <h3 style="color: #B794F6; font-size: 16px; margin: 0 0 16px 0;">Q-Value Distribution</h3>
      <div id="q-histogram" style="height: 200px;"></div>
    </div>
  `;

  try {
    const res = await fetch('/api/learning-algorithms');
    if (!res.ok) throw new Error('Failed to fetch');
    const data = await res.json();

    const histEl = document.getElementById('q-histogram');

    // Extract Q values from algorithms
    const algorithms = data.algorithms || [];
    const buckets = { '0.0-0.2': 0, '0.2-0.4': 0, '0.4-0.6': 0, '0.6+': 0 };

    for (const algo of algorithms) {
      const qTable = algo.qTable || {};
      // Handle flat structure: "state|action": value (number)
      // or nested structure: qTable[state][action].q
      for (const key of Object.keys(qTable)) {
        const val = qTable[key];
        let q = 0;
        if (typeof val === 'number') {
          // Flat structure: "state|action": 0.6019...
          q = val;
        } else if (typeof val === 'object' && val !== null) {
          // Nested structure: qTable[state][action].q
          for (const action of Object.keys(val)) {
            const innerVal = val[action];
            q = typeof innerVal === 'number' ? innerVal : (innerVal?.q || 0);
            if (q < 0.2) buckets['0.0-0.2']++;
            else if (q < 0.4) buckets['0.2-0.4']++;
            else if (q < 0.6) buckets['0.4-0.6']++;
            else buckets['0.6+']++;
          }
          continue; // Already processed nested entries
        }
        if (q < 0.2) buckets['0.0-0.2']++;
        else if (q < 0.4) buckets['0.2-0.4']++;
        else if (q < 0.6) buckets['0.4-0.6']++;
        else buckets['0.6+']++;
      }
    }

    const maxCount = Math.max(...Object.values(buckets), 1);

    if (histEl) {
      histEl.innerHTML = `
        <div style="display: flex; align-items: flex-end; height: 150px; gap: 16px; padding: 0 20px;">
          ${Object.entries(buckets).map(([label, count]) => {
            const height = (count / maxCount) * 100;
            return `
              <div style="flex: 1; display: flex; flex-direction: column; align-items: center;">
                <div style="font-size: 12px; color: #B794F6; margin-bottom: 4px;">${count}</div>
                <div style="width: 100%; height: ${height}%; background: linear-gradient(180deg, #B794F6 0%, #6B2FB5 100%); border-radius: 4px 4px 0 0; min-height: 4px;"></div>
                <div style="font-size: 10px; color: #808080; margin-top: 8px;">${label}</div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }
  } catch (err) {
    container.innerHTML = `<div style="padding: 40px; text-align: center; color: #ef4444;">Error: ${(err as Error).message}</div>`;
  }
}

async function renderStateActionHeatmapPanel(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div style="padding: 20px;">
      <h3 style="color: #B794F6; font-size: 16px; margin: 0 0 16px 0;">State-Action Heatmap</h3>
      <div id="heatmap-container" style="overflow-x: auto;"></div>
    </div>
  `;

  try {
    const res = await fetch('/api/learning-algorithms');
    if (!res.ok) throw new Error('Failed to fetch');
    const data = await res.json();

    const heatmapEl = document.getElementById('heatmap-container');

    // Collect all states and actions
    const algorithms = data.algorithms || [];
    const stateSet = new Set<string>();
    const actionSet = new Set<string>();
    const qMatrix: Record<string, Record<string, number>> = {};

    for (const algo of algorithms) {
      const qTable = algo.qTable || {};
      for (const key of Object.keys(qTable)) {
        const val = qTable[key];
        if (typeof val === 'number') {
          // Flat structure: "state|action": value - parse the key
          const parts = key.split('|');
          const state = parts[0] || key;
          const action = parts[1] || 'default';
          stateSet.add(state);
          actionSet.add(action);
          qMatrix[state] = qMatrix[state] || {};
          qMatrix[state][action] = val;
        } else if (typeof val === 'object' && val !== null) {
          // Nested structure: qTable[state][action]
          stateSet.add(key);
          qMatrix[key] = qMatrix[key] || {};
          for (const action of Object.keys(val)) {
            actionSet.add(action);
            const innerVal = val[action];
            qMatrix[key][action] = typeof innerVal === 'number' ? innerVal : (innerVal?.q || 0);
          }
        }
      }
    }

    const states = Array.from(stateSet).slice(0, 10);
    const actions = Array.from(actionSet).slice(0, 8);

    if (heatmapEl && states.length > 0 && actions.length > 0) {
      heatmapEl.innerHTML = `
        <table style="border-collapse: collapse; font-size: 10px;">
          <thead>
            <tr>
              <th style="padding: 4px;"></th>
              ${actions.map(a => `<th style="padding: 4px; color: #808080; max-width: 60px; overflow: hidden; text-overflow: ellipsis;">${a.slice(0, 10)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${states.map(s => `
              <tr>
                <td style="padding: 4px; color: #B0B0B0; max-width: 100px; overflow: hidden; text-overflow: ellipsis;">${s.slice(0, 15)}</td>
                ${actions.map(a => {
                  const q = safeNum(qMatrix[s]?.[a], 0);
                  const r = Math.round(220 * (1 - q));
                  const g = Math.round(180 * q);
                  return `<td style="padding: 4px; text-align: center; background: rgb(${r},${g},80); color: ${q > 0.5 ? '#000' : '#fff'};">${safeFixed(q, 2, '-')}</td>`;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else {
      heatmapEl!.innerHTML = '<div style="color: #808080; text-align: center; padding: 20px;">No Q-table data available</div>';
    }
  } catch (err) {
    container.innerHTML = `<div style="padding: 40px; text-align: center; color: #ef4444;">Error: ${(err as Error).message}</div>`;
  }
}

async function renderTrajectoryOutcomesPanel(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div style="padding: 20px;">
      <h3 style="color: #B794F6; font-size: 16px; margin: 0 0 16px 0;">Trajectory Outcomes</h3>
      <div id="outcomes-chart" style="display: flex; gap: 24px; align-items: center;"></div>
    </div>
  `;

  try {
    const res = await fetch('/api/trajectories-gantt');
    if (!res.ok) throw new Error('Failed to fetch');
    const data = await res.json();

    const chartEl = document.getElementById('outcomes-chart');
    const trajectories = data.trajectories || [];

    const outcomes = {
      completed: trajectories.filter((t: { success: boolean }) => t.success === true).length,
      failed: trajectories.filter((t: { success: boolean }) => t.success === false).length,
      other: trajectories.filter((t: { success: boolean | undefined }) => t.success === undefined).length
    };

    const total = outcomes.completed + outcomes.failed + outcomes.other;

    if (chartEl) {
      chartEl.innerHTML = `
        <div style="width: 120px; height: 120px;">
          <svg viewBox="0 0 120 120" width="120" height="120">
            ${total > 0 ? (() => {
              let cumulativeAngle = 0;
              const colors = { completed: '#22c55e', failed: '#ef4444', other: '#6b7280' };
              return Object.entries(outcomes).map(([key, count]) => {
                if (count === 0) return '';
                const angle = (count / total) * 360;
                const startAngle = cumulativeAngle;
                cumulativeAngle += angle;
                const endAngle = cumulativeAngle;

                const startRad = (startAngle - 90) * Math.PI / 180;
                const endRad = (endAngle - 90) * Math.PI / 180;
                const largeArc = angle > 180 ? 1 : 0;

                const x1 = 60 + 50 * Math.cos(startRad);
                const y1 = 60 + 50 * Math.sin(startRad);
                const x2 = 60 + 50 * Math.cos(endRad);
                const y2 = 60 + 50 * Math.sin(endRad);

                return `<path d="M 60 60 L ${x1} ${y1} A 50 50 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${colors[key as keyof typeof colors]}"/>`;
              }).join('');
            })() : '<circle cx="60" cy="60" r="50" fill="#261442"/>'}
            <circle cx="60" cy="60" r="25" fill="#0D0612"/>
          </svg>
        </div>
        <div style="flex: 1;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <div style="width: 12px; height: 12px; background: #22c55e; border-radius: 2px;"></div>
            <span style="color: #E0E0E0; font-size: 12px;">Completed</span>
            <span style="margin-left: auto; color: #22c55e; font-weight: bold;">${outcomes.completed} (${total > 0 ? safeFixed((outcomes.completed/total)*100, 1, '0') : '0'}%)</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <div style="width: 12px; height: 12px; background: #ef4444; border-radius: 2px;"></div>
            <span style="color: #E0E0E0; font-size: 12px;">Failed</span>
            <span style="margin-left: auto; color: #ef4444; font-weight: bold;">${outcomes.failed} (${total > 0 ? safeFixed((outcomes.failed/total)*100, 1, '0') : '0'}%)</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 12px; height: 12px; background: #6b7280; border-radius: 2px;"></div>
            <span style="color: #E0E0E0; font-size: 12px;">In Progress</span>
            <span style="margin-left: auto; color: #6b7280; font-weight: bold;">${outcomes.other} (${total > 0 ? safeFixed((outcomes.other/total)*100, 1, '0') : '0'}%)</span>
          </div>
        </div>
      `;
    }
  } catch (err) {
    container.innerHTML = `<div style="padding: 40px; text-align: center; color: #ef4444;">Error: ${(err as Error).message}</div>`;
  }
}

async function renderRewardTrendPanel(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div style="padding: 20px;">
      <h3 style="color: #B794F6; font-size: 16px; margin: 0 0 16px 0;">Reward Over Time</h3>
      <div id="reward-chart" style="height: 200px; background: rgba(107,47,181,0.1); border-radius: 8px; padding: 12px;"></div>
    </div>
  `;

  try {
    // Use learning-algorithms which has actual rewardHistory data
    const res = await fetch('/api/learning-algorithms');
    if (!res.ok) throw new Error('Failed to fetch');
    const data = await res.json();

    const chartEl = document.getElementById('reward-chart');
    const rewardHistory = data.rewardHistory || [];

    if (chartEl && rewardHistory.length > 0) {
      // Compute running average from reward history
      const points: { reward: number; runningAvg: number }[] = [];
      let sum = 0;
      for (let i = 0; i < rewardHistory.length; i++) {
        sum += rewardHistory[i].reward || 0;
        points.push({
          reward: rewardHistory[i].reward || 0,
          runningAvg: sum / (i + 1)
        });
      }

      const minR = Math.min(...points.map((p) => p.runningAvg), 0);
      const maxR = Math.max(...points.map((p) => p.runningAvg), 1);
      const range = maxR - minR || 1;

      const width = 100;
      const height = 150;
      const pathPoints = points.map((p, i: number) => {
        const x = points.length > 1 ? (i / (points.length - 1)) * width : 50;
        const y = height - ((p.runningAvg - minR) / range) * (height - 20);
        return `${x},${y}`;
      }).join(' ');

      const avgReward = points.length > 0 ? points[points.length - 1].runningAvg : 0;

      chartEl.innerHTML = `
        <svg viewBox="0 0 100 ${height}" preserveAspectRatio="none" style="width: 100%; height: ${height}px;">
          <polyline points="${pathPoints}" fill="none" stroke="#B794F6" stroke-width="1.5"/>
          <polygon points="0,${height} ${pathPoints} 100,${height}" fill="url(#gradient-reward)" opacity="0.3"/>
          <defs>
            <linearGradient id="gradient-reward" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#B794F6"/>
              <stop offset="100%" stop-color="#0D0612"/>
            </linearGradient>
          </defs>
        </svg>
        <div style="display: flex; justify-content: space-between; font-size: 10px; color: #808080; margin-top: 4px;">
          <span>Start (${rewardHistory.length} events)</span>
          <span>Avg: ${safeFixed(avgReward, 3, '--')}</span>
          <span>Now</span>
        </div>
      `;
    } else {
      chartEl!.innerHTML = '<div style="text-align: center; color: #808080; padding: 40px;">No reward data available</div>';
    }
  } catch (err) {
    container.innerHTML = `<div style="padding: 40px; text-align: center; color: #ef4444;">Error: ${(err as Error).message}</div>`;
  }
}

// --- Dashboard 4: SONA & Neural ---

async function renderPatternCategoriesPanel(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div style="padding: 20px;">
      <h3 style="color: #B794F6; font-size: 16px; margin: 0 0 16px 0;">Neural Pattern Categories</h3>
      <div id="categories-treemap" style="display: flex; flex-wrap: wrap; gap: 8px;"></div>
    </div>
  `;

  try {
    const res = await fetch('/api/neural-patterns');
    if (!res.ok) throw new Error('Failed to fetch');
    const data = await res.json();

    const treemapEl = document.getElementById('categories-treemap');
    const patterns = data.patterns || [];

    // Group by category
    const categories: Record<string, number> = {};
    for (const p of patterns) {
      const cat = p.category || 'unknown';
      categories[cat] = (categories[cat] || 0) + 1;
    }

    const total = Object.values(categories).reduce((s, c) => s + c, 0);
    const colors = ['#B794F6', '#22D3EE', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6'];

    if (treemapEl) {
      treemapEl.innerHTML = Object.entries(categories).sort((a, b) => b[1] - a[1]).map(([cat, count], i) => {
        const pct = total > 0 ? safeFixed((count / total) * 100, 1, '0') : '0';
        const size = Math.max(80, Math.min(200, 80 + (count / total) * 200));
        return `
          <div style="background: ${colors[i % colors.length]}22; border: 1px solid ${colors[i % colors.length]}44; border-radius: 8px; padding: 12px; width: ${size}px;">
            <div style="font-size: 11px; color: ${colors[i % colors.length]}; font-weight: bold;">${cat}</div>
            <div style="font-size: 18px; color: #fff; font-weight: bold;">${count}</div>
            <div style="font-size: 9px; color: #808080;">${pct}%</div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    container.innerHTML = `<div style="padding: 40px; text-align: center; color: #ef4444;">Error: ${(err as Error).message}</div>`;
  }
}

async function renderCompressionStatusPanel(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div style="padding: 20px;">
      <h3 style="color: #B794F6; font-size: 16px; margin: 0 0 16px 0;">SONA Compression Pipeline</h3>
      <div id="compression-status"></div>
    </div>
  `;

  try {
    // Fetch both SONA stats and neural patterns for accurate counts
    const [sonaRes, neuralRes] = await Promise.all([
      fetch('/api/sona-stats'),
      fetch('/api/neural-patterns')
    ]);

    const sonaData = sonaRes.ok ? await sonaRes.json() : { sona: {} };
    const neuralData = neuralRes.ok ? await neuralRes.json() : { patterns: [], summary: {} };

    const statusEl = document.getElementById('compression-status');
    const sona = sonaData.sona || {};
    const summary = neuralData.summary || {};

    // Use actual counts from database
    const neuralCount = summary.total || (neuralData.patterns || []).length || 0;
    const compressedCount = sona.patterns_stored || 0;
    const hasCompression = compressedCount > 0;

    // Calculate compression ratio - if no compression yet, show pending status
    const compressionRatio = hasCompression && neuralCount > 0
      ? Math.min(100, (compressedCount / neuralCount) * 100)
      : 0;

    // Get average confidence from summary
    const avgConfidence = summary.avgConfidence || 0;

    if (statusEl) {
      statusEl.innerHTML = `
        <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 20px;">
          <div style="text-align: center;">
            <div style="font-size: 32px; font-weight: bold; color: #B794F6;">${neuralCount}</div>
            <div style="font-size: 10px; color: #808080;">neural_patterns</div>
          </div>
          <div style="flex: 1; text-align: center;">
            ${hasCompression ? `
              <div style="font-size: 14px; color: #22c55e;">\u2192 ${safeFixed(compressionRatio, 0, '0')}% \u2192</div>
              <div style="height: 8px; background: #261442; border-radius: 4px; margin: 8px 0;">
                <div style="height: 100%; width: ${compressionRatio}%; background: linear-gradient(90deg, #B794F6, #22c55e); border-radius: 4px;"></div>
              </div>
            ` : `
              <div style="font-size: 12px; color: #f59e0b;">Compression not active</div>
              <div style="font-size: 10px; color: #808080; margin-top: 4px;">Patterns stored raw</div>
            `}
          </div>
          <div style="text-align: center;">
            <div style="font-size: 32px; font-weight: bold; color: ${hasCompression ? '#22c55e' : '#808080'};">${compressedCount}</div>
            <div style="font-size: 10px; color: #808080;">compressed_patterns</div>
          </div>
        </div>
        <div style="background: rgba(107,47,181,0.1); border-radius: 8px; padding: 12px; margin-bottom: 12px;">
          <div style="font-size: 11px; color: #B0B0B0; margin-bottom: 8px;">SONA LIFECYCLE</div>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; font-size: 10px;">
            <div><span style="color: #808080;">Tick Count:</span> <span style="color: #B794F6;">${sona.tick_count || 0}</span></div>
            <div><span style="color: #808080;">Warmup Replays:</span> <span style="color: #B794F6;">${sona.warmup_replays || 0}</span></div>
            <div><span style="color: #808080;">Force Learn:</span> <span style="color: #B794F6;">${sona.force_learn_count || 0}</span></div>
          </div>
        </div>
        <div style="background: rgba(107,47,181,0.1); border-radius: 8px; padding: 12px;">
          <div style="font-size: 11px; color: #B0B0B0; margin-bottom: 8px;">PATTERN SUMMARY (from DB)</div>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 10px;">
            <div><span style="color: #808080;">Total Patterns:</span> <span style="color: #B794F6;">${neuralCount}</span></div>
            <div><span style="color: #808080;">Avg Confidence:</span> <span style="color: ${avgConfidence >= 0.9 ? '#22c55e' : avgConfidence >= 0.5 ? '#f59e0b' : '#ef4444'};">${safeFixed(avgConfidence * 100, 1, '0')}%</span></div>
            <div><span style="color: #808080;">With Embeddings:</span> <span style="color: #B794F6;">${summary.withEmbeddings || 0}</span></div>
            <div><span style="color: #808080;">Total Usage:</span> <span style="color: #B794F6;">${summary.totalUsage || 0}</span></div>
          </div>
        </div>
      `;
    }
  } catch (err) {
    container.innerHTML = `<div style="padding: 40px; text-align: center; color: #ef4444;">Error: ${(err as Error).message}</div>`;
  }
}

async function renderPatternConfidencePanel(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div style="padding: 20px;">
      <h3 style="color: #B794F6; font-size: 16px; margin: 0 0 16px 0;">Pattern Confidence</h3>
      <div id="confidence-summary" style="margin-bottom: 16px;"></div>
      <div id="confidence-table" style="max-height: 300px; overflow-y: auto;"></div>
    </div>
  `;

  try {
    const res = await fetch('/api/neural-patterns');
    if (!res.ok) throw new Error('Failed to fetch');
    const data = await res.json();

    const allPatterns = data.patterns || [];
    const summaryEl = document.getElementById('confidence-summary');
    const tableEl = document.getElementById('confidence-table');

    // Calculate confidence distribution
    const highConf = allPatterns.filter((p: { confidence?: number }) => (p.confidence || 0) >= 0.9).length;
    const medConf = allPatterns.filter((p: { confidence?: number }) => (p.confidence || 0) >= 0.5 && (p.confidence || 0) < 0.9).length;
    const lowConf = allPatterns.filter((p: { confidence?: number }) => (p.confidence || 0) < 0.5).length;
    const avgConf = allPatterns.length > 0
      ? allPatterns.reduce((sum: number, p: { confidence?: number }) => sum + (p.confidence || 0), 0) / allPatterns.length
      : 0;
    const minConf = allPatterns.length > 0
      ? Math.min(...allPatterns.map((p: { confidence?: number }) => p.confidence || 0))
      : 0;
    const maxConf = allPatterns.length > 0
      ? Math.max(...allPatterns.map((p: { confidence?: number }) => p.confidence || 0))
      : 0;

    // Render confidence distribution summary
    if (summaryEl) {
      summaryEl.innerHTML = `
        <div style="background: rgba(107,47,181,0.1); border-radius: 8px; padding: 12px; margin-bottom: 12px;">
          <div style="font-size: 11px; color: #B0B0B0; margin-bottom: 8px;">CONFIDENCE DISTRIBUTION</div>
          <div style="display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 12px;">
            <div style="text-align: center;">
              <div style="font-size: 20px; font-weight: bold; color: #22c55e;">${highConf}</div>
              <div style="font-size: 9px; color: #808080;">High (90%+)</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 20px; font-weight: bold; color: #f59e0b;">${medConf}</div>
              <div style="font-size: 9px; color: #808080;">Med (50-89%)</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 20px; font-weight: bold; color: #ef4444;">${lowConf}</div>
              <div style="font-size: 9px; color: #808080;">Low (<50%)</div>
            </div>
          </div>
          <div style="display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: #261442;">
            ${highConf > 0 ? `<div style="width: ${(highConf / allPatterns.length) * 100}%; background: #22c55e;"></div>` : ''}
            ${medConf > 0 ? `<div style="width: ${(medConf / allPatterns.length) * 100}%; background: #f59e0b;"></div>` : ''}
            ${lowConf > 0 ? `<div style="width: ${(lowConf / allPatterns.length) * 100}%; background: #ef4444;"></div>` : ''}
          </div>
          <div style="font-size: 10px; color: #808080; margin-top: 8px;">
            Avg: <span style="color: #B794F6;">${safeFixed(avgConf * 100, 1, '0')}%</span> |
            Range: <span style="color: #B794F6;">${safeFixed(minConf * 100, 0, '0')}% - ${safeFixed(maxConf * 100, 0, '0')}%</span> |
            Total: <span style="color: #B794F6;">${allPatterns.length}</span> patterns
          </div>
        </div>
      `;
    }

    // Sort patterns to show variety: first show any non-100% confidence, then 100%
    const sortedPatterns = [...allPatterns].sort((a: { confidence?: number }, b: { confidence?: number }) => {
      const confA = a.confidence || 0;
      const confB = b.confidence || 0;
      // Prioritize non-100% confidence patterns to show variety
      if (confA < 1 && confB >= 1) return -1;
      if (confA >= 1 && confB < 1) return 1;
      // Within same group, sort by confidence descending
      return confB - confA;
    }).slice(0, 25);

    if (tableEl) {
      tableEl.innerHTML = `
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr style="border-bottom: 1px solid rgba(139,79,217,0.3);">
              <th style="text-align: left; padding: 6px; color: #B794F6;">Pattern</th>
              <th style="text-align: left; padding: 6px; color: #B794F6;">Category</th>
              <th style="text-align: center; padding: 6px; color: #B794F6;">Confidence</th>
              <th style="text-align: right; padding: 6px; color: #B794F6;">Usage</th>
            </tr>
          </thead>
          <tbody>
            ${sortedPatterns.map((p: { id: string; content?: string; category?: string; confidence?: number; usage?: number }) => {
              const conf = p.confidence || 0;
              const confColor = conf >= 0.9 ? '#22c55e' : conf >= 0.5 ? '#f59e0b' : '#ef4444';
              const highlightStyle = conf < 1 ? 'background: rgba(245, 158, 11, 0.1);' : '';
              return `
                <tr style="border-bottom: 1px solid rgba(139,79,217,0.1); ${highlightStyle}">
                  <td style="padding: 6px; color: #E0E0E0; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${(p.content || p.id || '').slice(0, 30)}</td>
                  <td style="padding: 6px; color: #808080;">${p.category || '--'}</td>
                  <td style="padding: 6px; text-align: center;"><span style="color: ${confColor}; font-weight: bold;">${safeFixed(conf * 100, 1, '0')}%</span></td>
                  <td style="padding: 6px; text-align: right; color: #B794F6;">${p.usage || 0}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
    }
  } catch (err) {
    container.innerHTML = `<div style="padding: 40px; text-align: center; color: #ef4444;">Error: ${(err as Error).message}</div>`;
  }
}

async function renderEmbeddingHealthPanel(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div style="padding: 20px;">
      <h3 style="color: #B794F6; font-size: 16px; margin: 0 0 16px 0;">Embedding Health Check</h3>
      <div id="embedding-health-content"></div>
    </div>
  `;

  try {
    const res = await fetch('/api/neural-patterns');
    if (!res.ok) throw new Error('Failed to fetch');
    const data = await res.json();

    const contentEl = document.getElementById('embedding-health-content');
    const patterns = data.patterns || [];

    const withEmbed = patterns.filter((p: { hasEmbedding?: boolean }) => p.hasEmbedding).length;
    const withoutEmbed = patterns.length - withEmbed;
    const pct = patterns.length > 0 ? (withEmbed / patterns.length) * 100 : 100;

    if (contentEl) {
      contentEl.innerHTML = `
        <div style="display: flex; gap: 16px; margin-bottom: 16px;">
          <div style="flex: 1; background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.3); border-radius: 8px; padding: 16px; text-align: center;">
            <div style="font-size: 28px; font-weight: bold; color: #22c55e;">${withEmbed}</div>
            <div style="font-size: 11px; color: #808080;">With Embeddings</div>
          </div>
          <div style="flex: 1; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 8px; padding: 16px; text-align: center;">
            <div style="font-size: 28px; font-weight: bold; color: ${withoutEmbed > 0 ? '#ef4444' : '#22c55e'};">${withoutEmbed}</div>
            <div style="font-size: 11px; color: #808080;">Missing Embeddings</div>
          </div>
        </div>
        <div style="background: #261442; border-radius: 4px; height: 20px; overflow: hidden;">
          <div style="height: 100%; width: ${pct}%; background: linear-gradient(90deg, #22c55e, #10B981);">
          </div>
        </div>
        <div style="text-align: center; margin-top: 8px; font-size: 12px; color: #B0B0B0;">${safeFixed(pct, 1, '0')}% coverage</div>
      `;
    }
  } catch (err) {
    container.innerHTML = `<div style="padding: 40px; text-align: center; color: #ef4444;">Error: ${(err as Error).message}</div>`;
  }
}

// --- Dashboard 5: Agent & Swarm ---

async function renderAgentMemoryPanel(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div style="padding: 20px;">
      <h3 style="color: #B794F6; font-size: 16px; margin: 0 0 16px 0;">Agent Memory Overview</h3>
      <div id="agent-memory-content" style="text-align: center; color: #808080; font-size: 11px;">Loading...</div>
    </div>
  `;

  try {
    // Fetch full agent memory data from intelligence.db
    const res = await fetch('/api/agent-memory-full');
    const data = res.ok ? await res.json() : { memories: { total: 0, byNamespace: [] }, agents: { list: [] } };

    const contentEl = document.getElementById('agent-memory-content');
    if (!contentEl) return;

    const memories = data.memories || { total: 0, byNamespace: [], withEmbeddings: 0 };
    const agents = data.agents || { total: 0, list: [] };
    const trajectories = data.trajectories || { total: 0, successful: 0, failed: 0 };
    const namespaces = memories.byNamespace || [];

    // Summary cards
    const summaryHtml = `
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px;">
        <div style="background: rgba(107,47,181,0.15); border-radius: 8px; padding: 16px; text-align: center;">
          <div style="font-size: 28px; font-weight: bold; color: #B794F6;">${memories.total}</div>
          <div style="font-size: 10px; color: #808080;">Total Memories</div>
        </div>
        <div style="background: rgba(34,197,94,0.15); border-radius: 8px; padding: 16px; text-align: center;">
          <div style="font-size: 28px; font-weight: bold; color: #22c55e;">${memories.withEmbeddings}</div>
          <div style="font-size: 10px; color: #808080;">With Embeddings</div>
        </div>
        <div style="background: rgba(59,130,246,0.15); border-radius: 8px; padding: 16px; text-align: center;">
          <div style="font-size: 28px; font-weight: bold; color: #3b82f6;">${namespaces.length}</div>
          <div style="font-size: 10px; color: #808080;">Namespaces</div>
        </div>
        <div style="background: rgba(245,158,11,0.15); border-radius: 8px; padding: 16px; text-align: center;">
          <div style="font-size: 28px; font-weight: bold; color: #f59e0b;">${agents.total}</div>
          <div style="font-size: 10px; color: #808080;">Agents</div>
        </div>
      </div>
    `;

    // Namespace table
    const nsTableHtml = namespaces.length > 0 ? `
      <div style="margin-bottom: 20px;">
        <h4 style="color: #B794F6; font-size: 13px; margin: 0 0 12px 0;">Memory by Namespace</h4>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr style="border-bottom: 1px solid rgba(139,79,217,0.3);">
              <th style="text-align: left; padding: 8px; color: #B794F6;">Namespace</th>
              <th style="text-align: right; padding: 8px; color: #B794F6;">Count</th>
              <th style="text-align: left; padding: 8px; color: #B794F6;">Bar</th>
            </tr>
          </thead>
          <tbody>
            ${namespaces.slice(0, 10).map((ns: { namespace: string; count: number }) => {
              const pct = memories.total > 0 ? (ns.count / memories.total) * 100 : 0;
              return `
                <tr style="border-bottom: 1px solid rgba(139,79,217,0.1);">
                  <td style="padding: 8px; color: #E0E0E0;">${ns.namespace}</td>
                  <td style="padding: 8px; text-align: right; color: #B794F6; font-weight: bold;">${ns.count}</td>
                  <td style="padding: 8px;">
                    <div style="background: #261442; border-radius: 2px; height: 8px; width: 100px;">
                      <div style="height: 100%; width: ${pct}%; background: linear-gradient(90deg, #B794F6, #9333ea); border-radius: 2px;"></div>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    ` : '<div style="color: #808080; padding: 12px;">No namespaces found</div>';

    // Agent table
    const agentTableHtml = agents.list.length > 0 ? `
      <div style="margin-bottom: 20px;">
        <h4 style="color: #B794F6; font-size: 13px; margin: 0 0 12px 0;">Agent Activity</h4>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr style="border-bottom: 1px solid rgba(139,79,217,0.3);">
              <th style="text-align: left; padding: 8px; color: #B794F6;">Agent</th>
              <th style="text-align: right; padding: 8px; color: #B794F6;">Sessions</th>
              <th style="text-align: right; padding: 8px; color: #B794F6;">Trajectories</th>
              <th style="text-align: right; padding: 8px; color: #B794F6;">Success</th>
            </tr>
          </thead>
          <tbody>
            ${agents.list.map((a: { name: string; sessionCount: number; trajectoryCount: number; successCount: number }) => `
              <tr style="border-bottom: 1px solid rgba(139,79,217,0.1);">
                <td style="padding: 8px; color: #E0E0E0;">${a.name}</td>
                <td style="padding: 8px; text-align: right; color: #808080;">${a.sessionCount}</td>
                <td style="padding: 8px; text-align: right; color: #B794F6;">${a.trajectoryCount}</td>
                <td style="padding: 8px; text-align: right; color: ${a.successCount > 0 ? '#22c55e' : '#808080'};">${a.successCount}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : '';

    // Trajectory summary
    const trajHtml = trajectories.total > 0 ? `
      <div style="background: rgba(107,47,181,0.1); border-radius: 8px; padding: 12px;">
        <h4 style="color: #B794F6; font-size: 13px; margin: 0 0 8px 0;">Trajectory Summary</h4>
        <div style="display: flex; gap: 16px; font-size: 12px;">
          <span style="color: #808080;">Total: <strong style="color: #E0E0E0;">${trajectories.total}</strong></span>
          <span style="color: #22c55e;">Success: <strong>${trajectories.successful}</strong></span>
          <span style="color: #ef4444;">Failed: <strong>${trajectories.failed}</strong></span>
          <span style="color: #B794F6;">Rate: <strong>${trajectories.total > 0 ? ((trajectories.successful / trajectories.total) * 100).toFixed(1) : 0}%</strong></span>
        </div>
      </div>
    ` : '';

    contentEl.innerHTML = summaryHtml + nsTableHtml + agentTableHtml + trajHtml;

  } catch (err) {
    container.innerHTML = `<div style="padding: 40px; text-align: center; color: #ef4444;">Error: ${(err as Error).message}</div>`;
  }
}

async function renderVectorIndexPanel(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div style="padding: 20px;">
      <h3 style="color: #B794F6; font-size: 16px; margin: 0 0 16px 0;">Vector Index Status</h3>
      <div id="vector-index-content" style="text-align: center; color: #808080; font-size: 11px;">Loading...</div>
    </div>
  `;

  try {
    // Use the new /api/vector-stats endpoint for comprehensive vector data
    const res = await fetch('/api/vector-stats');
    const data = res.ok ? await res.json() : { swarmIndexes: [], intelligenceStats: {}, combined: {} };

    const contentEl = document.getElementById('vector-index-content');
    if (!contentEl) return;

    const swarmIndexes = data.swarmIndexes || [];
    const intStats = data.intelligenceStats || {};
    const combined = data.combined || {};

    // Summary cards showing real data
    const summaryHtml = `
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px;">
        <div style="background: rgba(107,47,181,0.15); border-radius: 8px; padding: 16px; text-align: center;">
          <div style="font-size: 28px; font-weight: bold; color: #B794F6;">${swarmIndexes.length}</div>
          <div style="font-size: 10px; color: #808080;">HNSW Indexes</div>
        </div>
        <div style="background: rgba(34,197,94,0.15); border-radius: 8px; padding: 16px; text-align: center;">
          <div style="font-size: 28px; font-weight: bold; color: #22c55e;">${intStats.withEmbeddings || 0}</div>
          <div style="font-size: 10px; color: #808080;">Memory Embeddings</div>
        </div>
        <div style="background: rgba(59,130,246,0.15); border-radius: 8px; padding: 16px; text-align: center;">
          <div style="font-size: 28px; font-weight: bold; color: #3b82f6;">${intStats.neuralWithEmbeddings || 0}</div>
          <div style="font-size: 10px; color: #808080;">Neural Embeddings</div>
        </div>
        <div style="background: rgba(245,158,11,0.15); border-radius: 8px; padding: 16px; text-align: center;">
          <div style="font-size: 28px; font-weight: bold; color: ${intStats.embeddingDimension === 384 ? '#22c55e' : '#f59e0b'};">${intStats.embeddingDimension || 384}</div>
          <div style="font-size: 10px; color: #808080;">Dimensions</div>
        </div>
      </div>
    `;

    // Swarm HNSW indexes table
    const indexTableHtml = swarmIndexes.length > 0 ? `
      <div style="margin-bottom: 20px;">
        <h4 style="color: #B794F6; font-size: 13px; margin: 0 0 12px 0;">HNSW Indexes (.swarm/memory.db)</h4>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr style="border-bottom: 1px solid rgba(139,79,217,0.3);">
              <th style="text-align: left; padding: 8px; color: #B794F6;">Index</th>
              <th style="text-align: center; padding: 8px; color: #B794F6;">Dim</th>
              <th style="text-align: center; padding: 8px; color: #B794F6;">Metric</th>
              <th style="text-align: center; padding: 8px; color: #B794F6;">M</th>
              <th style="text-align: right; padding: 8px; color: #B794F6;">Vectors</th>
            </tr>
          </thead>
          <tbody>
            ${swarmIndexes.map((idx: { name: string; dimensions: number; metric: string; hnswM: number; totalVectors: number }) => `
              <tr style="border-bottom: 1px solid rgba(139,79,217,0.1);">
                <td style="padding: 8px; color: #E0E0E0;">${idx.name}</td>
                <td style="padding: 8px; text-align: center; color: ${idx.dimensions === 384 ? '#22c55e' : '#f59e0b'};">${idx.dimensions}</td>
                <td style="padding: 8px; text-align: center; color: #808080;">${idx.metric}</td>
                <td style="padding: 8px; text-align: center; color: #808080;">${idx.hnswM}</td>
                <td style="padding: 8px; text-align: right; color: #B794F6;">${idx.totalVectors}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : `
      <div style="margin-bottom: 20px; padding: 12px; background: rgba(107,47,181,0.1); border-radius: 8px; border: 1px dashed rgba(139,79,217,0.3);">
        <div style="font-size: 12px; color: #808080;">No HNSW indexes in .swarm/memory.db</div>
      </div>
    `;

    // Intelligence.db embedding stats
    const intStatsHtml = `
      <div style="background: rgba(107,47,181,0.1); border-radius: 8px; padding: 12px;">
        <h4 style="color: #B794F6; font-size: 13px; margin: 0 0 8px 0;">Embedding Coverage (intelligence.db)</h4>
        <div style="display: flex; gap: 16px; font-size: 12px;">
          <span style="color: #808080;">Memories: <strong style="color: #E0E0E0;">${intStats.withEmbeddings || 0}/${intStats.totalMemories || 0}</strong></span>
          <span style="color: #808080;">Neural: <strong style="color: #E0E0E0;">${intStats.neuralWithEmbeddings || 0}/${intStats.totalNeuralPatterns || 0}</strong></span>
          <span style="color: #B794F6;">Total Vectors: <strong>${combined.totalVectors || 0}</strong></span>
        </div>
      </div>
    `;

    contentEl.innerHTML = summaryHtml + indexTableHtml + intStatsHtml;

  } catch (err) {
    container.innerHTML = `<div style="padding: 40px; text-align: center; color: #ef4444;">Error: ${(err as Error).message}</div>`;
  }
}

async function renderSystemConfigPanel(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div style="padding: 20px;">
      <h3 style="color: #B794F6; font-size: 16px; margin: 0 0 16px 0;">System Configuration</h3>
      <div id="config-table" style="text-align: center; color: #808080; font-size: 11px;">Loading...</div>
    </div>
  `;

  // FIX: Fetch real config from swarm-memory API instead of hardcoded stub values
  try {
    const res = await fetch('/api/swarm-memory');
    const data = res.ok ? await res.json() : { metadata: {} };
    const metadata = data.metadata || {};

    // Build config items from real database metadata
    const configItems = [
      {
        key: 'schema_version',
        value: metadata.schema_version || metadata['schema_version'] || 'unknown',
        status: !!metadata.schema_version || !!metadata['schema_version']
      },
      {
        key: 'backend',
        value: metadata.backend || metadata.memory_backend || 'unknown',
        status: !!metadata.backend || !!metadata.memory_backend
      },
      {
        key: 'vector_embeddings',
        value: metadata.vector_embeddings || (data.meta?.hasData ? 'detected' : 'none'),
        status: data.meta?.hasData || false
      },
      {
        key: 'pattern_learning',
        value: (data.patterns?.length > 0) ? 'active' : 'inactive',
        status: (data.patterns?.length > 0)
      },
      {
        key: 'hnsw_indexing',
        value: (data.vectorIndexes?.length > 0) ? 'active' : 'inactive',
        status: (data.vectorIndexes?.length > 0)
      }
    ];

    const tableEl = document.getElementById('config-table');
    if (tableEl) {
      if (Object.keys(metadata).length === 0 && !data.meta?.hasData) {
        tableEl.innerHTML = `
          <div style="padding: 20px; text-align: center; background: rgba(107,47,181,0.1); border-radius: 8px; border: 1px dashed rgba(139,79,217,0.3);">
            <div style="font-size: 24px; margin-bottom: 8px; opacity: 0.5;">-</div>
            <div style="font-size: 12px; color: #808080; margin-bottom: 4px;">No Configuration Data</div>
            <div style="font-size: 10px; color: #606060;">
              Configuration will appear when .swarm/memory.db metadata table is populated.
            </div>
          </div>
        `;
      } else {
        tableEl.innerHTML = `
          <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <thead>
              <tr style="border-bottom: 1px solid rgba(139,79,217,0.3);">
                <th style="text-align: left; padding: 8px; color: #B794F6;">Setting</th>
                <th style="text-align: center; padding: 8px; color: #B794F6;">Value</th>
                <th style="text-align: center; padding: 8px; color: #B794F6;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${configItems.map(cfg => `
                <tr style="border-bottom: 1px solid rgba(139,79,217,0.1);">
                  <td style="padding: 8px; color: #E0E0E0;">${cfg.key}</td>
                  <td style="padding: 8px; text-align: center; color: #B794F6;">${cfg.value}</td>
                  <td style="padding: 8px; text-align: center; color: ${cfg.status ? '#22c55e' : '#ef4444'};">${cfg.status ? '\u2713' : '\u2717'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      }
    }
  } catch (err) {
    const tableEl = document.getElementById('config-table');
    if (tableEl) {
      tableEl.innerHTML = `<div style="color: #ef4444; font-size: 11px;">Error loading config: ${(err as Error).message}</div>`;
    }
  }
}

async function renderLearningPipelinePanel(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div style="padding: 20px;">
      <h3 style="color: #B794F6; font-size: 16px; margin: 0 0 16px 0;">Learning Pipeline Status</h3>
      <div id="pipeline-status" style="text-align: center; color: #808080; font-size: 11px;">Loading...</div>
    </div>
  `;

  try {
    // Fetch real pipeline stats from intelligence.db
    const res = await fetch('/api/pipeline-stats');
    const data = res.ok ? await res.json() : { totals: {}, sona: {}, pipeline: {}, learning: {} };

    const totals = data.totals || {};
    const sona = data.sona || {};
    const pipeline = data.pipeline || {};
    const learning = data.learning || {};

    const statusEl = document.getElementById('pipeline-status');
    if (!statusEl) return;

    // Summary cards with real totals
    const summaryHtml = `
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px;">
        <div style="background: rgba(107,47,181,0.15); border-radius: 8px; padding: 16px; text-align: center;">
          <div style="font-size: 28px; font-weight: bold; color: #B794F6;">${totals.memories || 0}</div>
          <div style="font-size: 10px; color: #808080;">Memories</div>
        </div>
        <div style="background: rgba(34,197,94,0.15); border-radius: 8px; padding: 16px; text-align: center;">
          <div style="font-size: 28px; font-weight: bold; color: #22c55e;">${totals.trajectories || 0}</div>
          <div style="font-size: 10px; color: #808080;">Trajectories</div>
        </div>
        <div style="background: rgba(59,130,246,0.15); border-radius: 8px; padding: 16px; text-align: center;">
          <div style="font-size: 28px; font-weight: bold; color: #3b82f6;">${totals.patterns || 0}</div>
          <div style="font-size: 10px; color: #808080;">Q-Patterns</div>
        </div>
        <div style="background: rgba(245,158,11,0.15); border-radius: 8px; padding: 16px; text-align: center;">
          <div style="font-size: 28px; font-weight: bold; color: #f59e0b;">${totals.neuralPatterns || 0}</div>
          <div style="font-size: 10px; color: #808080;">Neural Patterns</div>
        </div>
      </div>
    `;

    // Pipeline flow visualization
    const pipelineHtml = `
      <div style="margin-bottom: 20px;">
        <h4 style="color: #B794F6; font-size: 13px; margin: 0 0 12px 0;">SONA Pipeline</h4>
        <div style="display: flex; align-items: center; gap: 16px;">
          <div style="flex: 1; text-align: center; background: rgba(107,47,181,0.15); border-radius: 8px; padding: 16px;">
            <div style="font-size: 24px; font-weight: bold; color: #B794F6;">${pipeline.shortTerm || 0}</div>
            <div style="font-size: 10px; color: #808080;">Short-term (recent)</div>
          </div>
          <div style="color: #808080;">\u2192</div>
          <div style="text-align: center; padding: 12px; border: 2px dashed rgba(139,79,217,0.3); border-radius: 8px;">
            <div style="font-size: 10px; color: #f59e0b;">SONA compress</div>
            <div style="font-size: 9px; color: #808080;">${sona.patternsCompressed || 0} compressed</div>
          </div>
          <div style="color: #808080;">\u2192</div>
          <div style="flex: 1; text-align: center; background: rgba(34,197,94,0.15); border-radius: 8px; padding: 16px;">
            <div style="font-size: 24px; font-weight: bold; color: #22c55e;">${pipeline.longTerm || 0}</div>
            <div style="font-size: 10px; color: #808080;">Long-term (consolidated)</div>
          </div>
        </div>
      </div>
    `;

    // SONA status
    const sonaHtml = `
      <div style="background: rgba(107,47,181,0.1); border-radius: 8px; padding: 12px; margin-bottom: 12px;">
        <h4 style="color: #B794F6; font-size: 13px; margin: 0 0 8px 0;">SONA Status</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px;">
          <div style="color: #808080;">Last Dream Cycle: <span style="color: #E0E0E0;">${sona.lastDreamCycle ? new Date(sona.lastDreamCycle).toLocaleString() : 'Never'}</span></div>
          <div style="color: #808080;">Last Consolidate: <span style="color: #E0E0E0;">${sona.lastConsolidate ? new Date(sona.lastConsolidate).toLocaleString() : 'Never'}</span></div>
          <div style="color: #808080;">Compressed Patterns: <span style="color: #22c55e;">${sona.patternsCompressed || 0}</span></div>
          <div style="color: #808080;">Session Count: <span style="color: #B794F6;">${learning.sessionCount || 0}</span></div>
        </div>
      </div>
    `;

    // Additional stats
    const statsHtml = `
      <div style="background: rgba(34,197,94,0.1); border-radius: 8px; padding: 12px;">
        <h4 style="color: #22c55e; font-size: 13px; margin: 0 0 8px 0;">Learning Stats</h4>
        <div style="display: flex; gap: 16px; font-size: 12px;">
          <span style="color: #808080;">Agents: <strong style="color: #E0E0E0;">${totals.agents || 0}</strong></span>
          <span style="color: #808080;">Edges: <strong style="color: #E0E0E0;">${totals.edges || 0}</strong></span>
          <span style="color: #808080;">Errors: <strong style="color: ${learning.totalErrors > 0 ? '#ef4444' : '#22c55e'};">${learning.totalErrors || 0}</strong></span>
        </div>
      </div>
    `;

    statusEl.innerHTML = summaryHtml + pipelineHtml + sonaHtml + statsHtml;

  } catch (err) {
    const statusEl = document.getElementById('pipeline-status');
    if (statusEl) {
      statusEl.innerHTML = `<div style="color: #ef4444; font-size: 11px;">Error loading pipeline: ${(err as Error).message}</div>`;
    }
  }
}

function initDashboard(): void {
  // Dashboard button toggle
  document.getElementById('dashboardBtn')?.addEventListener('click', () => {
    const overlay = document.getElementById('dashboardOverlay');
    if (!overlay) return;
    if (overlay.classList.contains('visible')) {
      closeDashboard();
    } else {
      openDashboard();
    }
  });

  // Close button
  document.getElementById('closeDashboard')?.addEventListener('click', closeDashboard);

  // Escape key closes dashboard
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const overlay = document.getElementById('dashboardOverlay');
      if (overlay?.classList.contains('visible')) {
        closeDashboard();
        e.stopPropagation();
      }
    }
  });

  // Tab switching
  document.querySelectorAll('.dashboard-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = (tab as HTMLElement).dataset.dtab;
      if (tabName) switchDashboardTab(tabName);
    });
  });

  // Subtab switching
  document.querySelectorAll('.subtab').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const subtab = target.dataset.subtab;
      const mainTabContent = target.closest('.dashboard-tab-content');
      const mainTab = mainTabContent?.id.replace('dtab-', '');
      if (mainTab && subtab) {
        switchSubtab(mainTab, subtab);
      }
    });
  });

  // Refresh on re-open (clear cache so data is fresh)
  document.getElementById('dashboardBtn')?.addEventListener('dblclick', () => {
    dashboardLoadedTabs.clear();
    openDashboard();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// LIVE MODE (Phase 3) - Incremental Updates with Highlighting
// ═══════════════════════════════════════════════════════════════════════════

let liveMode = false;
let liveInterval: ReturnType<typeof setInterval> | null = null;
let lastKnownCounts = { memories: 0, trajectories: 0, patterns: 0 };
let highlightTimeout: ReturnType<typeof setTimeout> | null = null;
const HIGHLIGHT_DURATION_MS = 3000; // 3 seconds highlight for new nodes

function toggleLiveMode(): void {
  liveMode = !liveMode;
  const btn = document.getElementById('liveToggle');
  const indicator = document.getElementById('liveIndicator');

  if (liveMode) {
    btn?.classList.add('active');
    indicator?.classList.add('active');
    lastKnownCounts = { memories: 0, trajectories: 0, patterns: 0 };
    pollLiveStatus();
    liveInterval = setInterval(pollLiveStatus, 2000);
  } else {
    btn?.classList.remove('active');
    indicator?.classList.remove('active');
    if (liveInterval) { clearInterval(liveInterval); liveInterval = null; }
    if (highlightTimeout) { clearTimeout(highlightTimeout); highlightTimeout = null; }
    // Clear any remaining highlights when disabling live mode
    renderer?.clearHighlights();
  }
}

async function pollLiveStatus(): Promise<void> {
  try {
    const res = await fetch('/api/live-status');
    if (!res.ok) return;
    const data = await res.json();

    const tsEl = document.getElementById('liveTimestamp');
    if (tsEl) {
      const ts = data.lastMemoryTimestamp;
      const d = new Date(ts < 1e12 ? ts * 1000 : ts);
      tsEl.textContent = `Last: ${d.toLocaleTimeString()} | M:${data.memoriesCount} T:${data.trajectoriesCount} P:${data.patternsCount}`;
    }

    // Detect new data
    const hasNewData = (
      (lastKnownCounts.memories > 0 && data.memoriesCount > lastKnownCounts.memories) ||
      (lastKnownCounts.trajectories > 0 && data.trajectoriesCount > lastKnownCounts.trajectories) ||
      (lastKnownCounts.patterns > 0 && data.patternsCount > lastKnownCounts.patterns)
    );

    if (hasNewData) {
      // Clear dashboard cache so it reloads fresh data
      dashboardLoadedTabs.clear();
      // Reload current dashboard tab if visible
      const overlay = document.getElementById('dashboardOverlay');
      if (overlay?.classList.contains('visible')) {
        switchDashboardTab(currentDashboardTab);
      }

      // INCREMENTAL UPDATE: Fetch new graph data and merge
      try {
        const graphRes = await fetch('/api/graph?refresh=true');
        if (graphRes.ok) {
          const newGraphData = await graphRes.json() as GraphData;
          if (renderer && newGraphData.nodes) {
            // Get existing node IDs for diffing
            const existingNodeIds = renderer.getNodeIds();

            // Use incremental add instead of full replace
            const { newNodeIndices: _newNodeIndices, addedNodes, addedEdges } = renderer.addIncrementalData(
              newGraphData,
              existingNodeIds
            );

            // Update our local reference
            graphData = newGraphData;

            // Show notification if new elements were added
            if (addedNodes > 0 || addedEdges > 0) {
              console.log(`Live mode: Added ${addedNodes} nodes, ${addedEdges} edges`);

              // Update the live indicator with add count and flash animation
              const indicator = document.getElementById('liveIndicator');
              if (indicator) {
                indicator.classList.remove('new-data');
                // Force reflow to restart animation
                void indicator.offsetWidth;
                indicator.classList.add('new-data');
              }

              if (tsEl) {
                tsEl.innerHTML = `Last: ${new Date().toLocaleTimeString()} | <span class="live-add-count">+${addedNodes}N +${addedEdges}E</span>`;
              }

              // Schedule highlight removal after duration
              if (highlightTimeout) {
                clearTimeout(highlightTimeout);
              }
              highlightTimeout = setTimeout(() => {
                renderer?.clearHighlights();
                highlightTimeout = null;
                // Clear the add count display after highlight fades
                if (tsEl) {
                  tsEl.textContent = `Last: ${new Date().toLocaleTimeString()} | M:${lastKnownCounts.memories} T:${lastKnownCounts.trajectories} P:${lastKnownCounts.patterns}`;
                }
              }, HIGHLIGHT_DURATION_MS);
            }
          }
        }
      } catch (err) {
        console.warn('Live mode graph refresh error:', err);
      }
    }

    lastKnownCounts = {
      memories: data.memoriesCount,
      trajectories: data.trajectoriesCount,
      patterns: data.patternsCount,
    };
  } catch (_) { /* ignore polling errors */ }
}

// Wire up Live toggle button
document.getElementById('liveToggle')?.addEventListener('click', toggleLiveMode);

// ═══════════════════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════════════════

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { init(); initDashboard(); });
} else {
  init();
  initDashboard();
}

// Export for debugging
(window as any).ruvectorRenderer = () => renderer;
(window as any).ruvectorData = () => graphData;
