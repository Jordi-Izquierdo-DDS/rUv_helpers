/**
 * Force Simulation Web Worker
 *
 * Runs D3-force simulation in a separate thread to prevent UI blocking.
 * Communicates with main thread via postMessage.
 */

// Worker-side types (no DOM access)
interface WorkerNode {
  index: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number | null;
  fy: number | null;
}

interface WorkerEdge {
  source: number;
  target: number;
  weight: number;
}

interface WorkerConfig {
  charge: number;
  linkDistance: number;
  linkStrength: number;
  centerStrength: number;
  collisionRadius: number;
  alphaDecay: number;
  alphaMin: number;
  velocityDecay: number;
}

// Message types
type IncomingMessage =
  | { type: 'init'; nodes: WorkerNode[]; edges: WorkerEdge[]; config: WorkerConfig }
  | { type: 'start' }
  | { type: 'stop' }
  | { type: 'tick' }
  | { type: 'setAlpha'; alpha: number }
  | { type: 'updateConfig'; config: Partial<WorkerConfig> }
  | { type: 'pinNode'; index: number; x: number; y: number }
  | { type: 'unpinNode'; index: number }
  | { type: 'updatePositions'; positions: Float32Array };

type OutgoingMessage =
  | { type: 'initialized'; nodeCount: number; edgeCount: number }
  | { type: 'tick'; positions: Float32Array; alpha: number }
  | { type: 'end' }
  | { type: 'error'; message: string };

// Simulation state
let nodes: WorkerNode[] = [];
let edges: WorkerEdge[] = [];
let config: WorkerConfig = {
  charge: -80,
  linkDistance: 80,
  linkStrength: 0.5,
  centerStrength: 0.1,
  collisionRadius: 15,
  alphaDecay: 0.02,
  alphaMin: 0.001,
  velocityDecay: 0.4
};

let alpha = 1;
let isRunning = false;
let tickCount = 0;

// Position buffer for sending to main thread
let positionBuffer: Float32Array | null = null;

/**
 * Initialize simulation with data
 */
function initSimulation(
  nodeData: WorkerNode[],
  edgeData: WorkerEdge[],
  simConfig: WorkerConfig
): void {
  nodes = nodeData;
  edges = edgeData;
  config = { ...config, ...simConfig };

  // Initialize velocities
  for (const node of nodes) {
    node.vx = node.vx || 0;
    node.vy = node.vy || 0;
  }

  // Create position buffer
  positionBuffer = new Float32Array(nodes.length * 2);

  alpha = 1;
  tickCount = 0;

  postMessage({
    type: 'initialized',
    nodeCount: nodes.length,
    edgeCount: edges.length
  } as OutgoingMessage);
}

/**
 * Run one simulation tick
 */
function tick(): void {
  if (!isRunning || alpha < config.alphaMin) {
    if (alpha < config.alphaMin) {
      isRunning = false;
      postMessage({ type: 'end' } as OutgoingMessage);
    }
    return;
  }

  // Apply forces
  applyChargeForce();
  applyLinkForce();
  applyCenterForce();
  applyCollisionForce();

  // Update positions
  for (const node of nodes) {
    if (node.fx !== null) {
      node.x = node.fx;
      node.vx = 0;
    } else {
      node.vx *= config.velocityDecay;
      node.x += node.vx;
    }

    if (node.fy !== null) {
      node.y = node.fy;
      node.vy = 0;
    } else {
      node.vy *= config.velocityDecay;
      node.y += node.vy;
    }
  }

  // Decay alpha
  alpha += (config.alphaMin - alpha) * config.alphaDecay;

  // Update position buffer
  if (positionBuffer) {
    for (let i = 0; i < nodes.length; i++) {
      positionBuffer[i * 2] = nodes[i].x;
      positionBuffer[i * 2 + 1] = nodes[i].y;
    }

    // Send positions (transferable for performance)
    const buffer = positionBuffer.buffer.slice(0);
    const message: OutgoingMessage = {
      type: 'tick',
      positions: new Float32Array(buffer),
      alpha
    };
    self.postMessage(message, { transfer: [buffer] });
  }

  tickCount++;

  // Schedule next tick
  if (isRunning) {
    setTimeout(tick, 0);
  }
}

/**
 * Apply charge (repulsion) force - Barnes-Hut approximation
 */
function applyChargeForce(): void {
  const strength = config.charge;

  // Simple O(n^2) for now - will be optimized with quadtree in production
  for (let i = 0; i < nodes.length; i++) {
    const nodeA = nodes[i];

    for (let j = i + 1; j < nodes.length; j++) {
      const nodeB = nodes[j];

      let dx = nodeB.x - nodeA.x;
      let dy = nodeB.y - nodeA.y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 1;

      // Prevent extreme forces at small distances
      if (dist < 1) dist = 1;

      const force = (strength * alpha) / (dist * dist);

      dx *= force / dist;
      dy *= force / dist;

      nodeA.vx -= dx;
      nodeA.vy -= dy;
      nodeB.vx += dx;
      nodeB.vy += dy;
    }
  }
}

/**
 * Apply link (attraction) force
 */
function applyLinkForce(): void {
  const distance = config.linkDistance;
  const strength = config.linkStrength;

  for (const edge of edges) {
    const sourceNode = nodes[edge.source];
    const targetNode = nodes[edge.target];

    if (!sourceNode || !targetNode) continue;

    let dx = targetNode.x - sourceNode.x;
    let dy = targetNode.y - sourceNode.y;
    let dist = Math.sqrt(dx * dx + dy * dy) || 1;

    // Spring force
    const force = ((dist - distance) / dist) * strength * alpha * (edge.weight || 1);

    dx *= force;
    dy *= force;

    // Apply equally to both nodes
    const bias = 0.5;
    sourceNode.vx += dx * bias;
    sourceNode.vy += dy * bias;
    targetNode.vx -= dx * (1 - bias);
    targetNode.vy -= dy * (1 - bias);
  }
}

/**
 * Apply centering force
 */
function applyCenterForce(): void {
  if (config.centerStrength === 0) return;

  // Calculate center of mass
  let cx = 0;
  let cy = 0;
  for (const node of nodes) {
    cx += node.x;
    cy += node.y;
  }
  cx /= nodes.length;
  cy /= nodes.length;

  // Apply centering force
  const strength = config.centerStrength * alpha;
  for (const node of nodes) {
    node.vx -= (node.x - cx) * strength * 0.01;
    node.vy -= (node.y - cy) * strength * 0.01;
  }
}

/**
 * Apply collision force
 */
function applyCollisionForce(): void {
  const radius = config.collisionRadius;
  if (radius <= 0) return;

  // Simple O(n^2) collision detection
  for (let i = 0; i < nodes.length; i++) {
    const nodeA = nodes[i];

    for (let j = i + 1; j < nodes.length; j++) {
      const nodeB = nodes[j];

      let dx = nodeB.x - nodeA.x;
      let dy = nodeB.y - nodeA.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const minDist = radius * 2;
      if (dist < minDist && dist > 0) {
        const force = ((minDist - dist) / dist) * 0.5 * alpha;

        dx *= force;
        dy *= force;

        nodeA.vx -= dx;
        nodeA.vy -= dy;
        nodeB.vx += dx;
        nodeB.vy += dy;
      }
    }
  }
}

/**
 * Handle messages from main thread
 */
self.onmessage = (event: MessageEvent<IncomingMessage>) => {
  const message = event.data;

  switch (message.type) {
    case 'init':
      initSimulation(message.nodes, message.edges, message.config);
      break;

    case 'start':
      if (!isRunning) {
        isRunning = true;
        alpha = Math.max(alpha, 0.3);
        tick();
      }
      break;

    case 'stop':
      isRunning = false;
      break;

    case 'tick':
      // Manual single tick
      if (!isRunning) {
        tick();
      }
      break;

    case 'setAlpha':
      alpha = message.alpha;
      break;

    case 'updateConfig':
      config = { ...config, ...message.config };
      break;

    case 'pinNode':
      if (nodes[message.index]) {
        nodes[message.index].fx = message.x;
        nodes[message.index].fy = message.y;
      }
      break;

    case 'unpinNode':
      if (nodes[message.index]) {
        nodes[message.index].fx = null;
        nodes[message.index].fy = null;
      }
      break;

    case 'updatePositions':
      // Update positions from main thread (e.g., after dragging)
      const positions = message.positions;
      for (let i = 0; i < nodes.length && i * 2 + 1 < positions.length; i++) {
        nodes[i].x = positions[i * 2];
        nodes[i].y = positions[i * 2 + 1];
      }
      break;
  }
};

// Export for TypeScript (worker scope)
export {};
