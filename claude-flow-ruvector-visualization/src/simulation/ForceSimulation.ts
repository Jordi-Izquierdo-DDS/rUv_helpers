/**
 * ForceSimulation - Controller for Web Worker-based force simulation
 *
 * Manages:
 * - Worker lifecycle
 * - Configuration updates
 * - Position synchronization
 * - Event callbacks
 */

import type { GraphNode, GraphEdge } from '../config/Constants';
import { SIMULATION_CONFIG } from '../config/Constants';

export interface SimulationConfig {
  charge: number;
  linkDistance: number;
  linkStrength: number;
  centerStrength: number;
  collisionRadius: number;
  alphaDecay: number;
  alphaMin: number;
  velocityDecay: number;
}

export interface SimulationEvents {
  onTick: (positions: Float32Array, alpha: number) => void;
  onEnd: () => void;
  onError: (error: string) => void;
}

export class ForceSimulation {
  private worker: Worker | null = null;
  private nodes: GraphNode[] = [];
  private edges: GraphEdge[] = [];
  private config: SimulationConfig;
  private events: Partial<SimulationEvents> = {};

  // State
  private isRunning = false;
  private alpha = 0;

  // Fallback for browsers without Worker support
  private useFallback = false;
  private fallbackInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config?: Partial<SimulationConfig>) {
    this.config = {
      charge: SIMULATION_CONFIG.force.charge,
      linkDistance: SIMULATION_CONFIG.force.linkDistance,
      linkStrength: SIMULATION_CONFIG.force.linkStrength,
      centerStrength: SIMULATION_CONFIG.force.centerStrength,
      collisionRadius: SIMULATION_CONFIG.force.collisionRadius,
      alphaDecay: SIMULATION_CONFIG.timing.alphaDecay,
      alphaMin: SIMULATION_CONFIG.timing.alphaMin,
      velocityDecay: SIMULATION_CONFIG.timing.velocityDecay,
      ...config
    };

    this.initWorker();
  }

  /**
   * Initialize the web worker
   */
  private initWorker(): void {
    try {
      // Create worker from the compiled bundle
      // Note: Vite handles worker bundling
      this.worker = new Worker(
        new URL('./force-worker.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = this.handleWorkerMessage.bind(this);
      this.worker.onerror = this.handleWorkerError.bind(this);

      console.log('Force simulation worker initialized');
    } catch (error) {
      console.warn('Web Worker not available, using fallback simulation:', error);
      this.useFallback = true;
    }
  }

  /**
   * Handle messages from worker
   */
  private handleWorkerMessage(event: MessageEvent): void {
    const message = event.data;

    switch (message.type) {
      case 'initialized':
        // Initialization complete
        console.log(`Simulation initialized: ${message.nodeCount} nodes, ${message.edgeCount} edges`);
        break;

      case 'tick':
        this.alpha = message.alpha;
        this.updateNodePositions(message.positions);
        if (this.events.onTick) {
          this.events.onTick(message.positions, message.alpha);
        }
        break;

      case 'end':
        this.isRunning = false;
        if (this.events.onEnd) {
          this.events.onEnd();
        }
        break;

      case 'error':
        if (this.events.onError) {
          this.events.onError(message.message);
        }
        break;
    }
  }

  /**
   * Handle worker errors
   */
  private handleWorkerError(error: ErrorEvent): void {
    console.error('Force simulation worker error:', error);
    if (this.events.onError) {
      this.events.onError(error.message);
    }
  }

  /**
   * Update node positions from worker data
   */
  private updateNodePositions(positions: Float32Array): void {
    for (let i = 0; i < this.nodes.length && i * 2 + 1 < positions.length; i++) {
      this.nodes[i].x = positions[i * 2];
      this.nodes[i].y = positions[i * 2 + 1];
    }
  }

  /**
   * Set graph data
   */
  setData(nodes: GraphNode[], edges: GraphEdge[]): void {
    this.nodes = nodes;
    this.edges = edges;

    // Prepare worker data
    const workerNodes = nodes.map((node, index) => ({
      index,
      x: node.x ?? Math.random() * 1000 - 500,
      y: node.y ?? Math.random() * 1000 - 500,
      vx: node.vx ?? 0,
      vy: node.vy ?? 0,
      fx: node.fx ?? null,
      fy: node.fy ?? null
    }));

    const workerEdges = edges.map(edge => ({
      source: typeof edge.source === 'number' ? edge.source : 0,
      target: typeof edge.target === 'number' ? edge.target : 0,
      weight: edge.weight ?? 1
    }));

    if (this.worker && !this.useFallback) {
      this.worker.postMessage({
        type: 'init',
        nodes: workerNodes,
        edges: workerEdges,
        config: this.config
      });
    }
  }

  /**
   * Start simulation
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;

    if (this.worker && !this.useFallback) {
      this.worker.postMessage({ type: 'start' });
    } else {
      this.startFallbackSimulation();
    }
  }

  /**
   * Stop simulation
   */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.worker && !this.useFallback) {
      this.worker.postMessage({ type: 'stop' });
    } else {
      this.stopFallbackSimulation();
    }
  }

  /**
   * Restart simulation with fresh alpha
   */
  restart(alpha = 0.3): void {
    this.alpha = alpha;

    if (this.worker && !this.useFallback) {
      this.worker.postMessage({ type: 'setAlpha', alpha });
      this.start();
    } else {
      this.start();
    }
  }

  /**
   * Update simulation configuration
   */
  updateConfig(config: Partial<SimulationConfig>): void {
    this.config = { ...this.config, ...config };

    if (this.worker && !this.useFallback) {
      this.worker.postMessage({ type: 'updateConfig', config });
    }
  }

  /**
   * Pin a node at a specific position
   */
  pinNode(index: number, x: number, y: number): void {
    if (index < 0 || index >= this.nodes.length) return;

    this.nodes[index].fx = x;
    this.nodes[index].fy = y;

    if (this.worker && !this.useFallback) {
      this.worker.postMessage({ type: 'pinNode', index, x, y });
    }
  }

  /**
   * Unpin a node
   */
  unpinNode(index: number): void {
    if (index < 0 || index >= this.nodes.length) return;

    this.nodes[index].fx = null;
    this.nodes[index].fy = null;

    if (this.worker && !this.useFallback) {
      this.worker.postMessage({ type: 'unpinNode', index });
    }
  }

  /**
   * Register event callbacks
   */
  on<K extends keyof SimulationEvents>(event: K, callback: SimulationEvents[K]): void {
    this.events[event] = callback;
  }

  /**
   * Get current alpha
   */
  getAlpha(): number {
    return this.alpha;
  }

  /**
   * Check if simulation is running
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get nodes reference
   */
  getNodes(): GraphNode[] {
    return this.nodes;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FALLBACK SIMULATION (when Worker not available)
  // ═══════════════════════════════════════════════════════════════════════════

  private startFallbackSimulation(): void {
    if (this.fallbackInterval) return;

    this.alpha = 1;

    this.fallbackInterval = setInterval(() => {
      if (!this.isRunning || this.alpha < this.config.alphaMin) {
        this.stopFallbackSimulation();
        return;
      }

      this.runFallbackTick();
    }, 16);
  }

  private stopFallbackSimulation(): void {
    if (this.fallbackInterval) {
      clearInterval(this.fallbackInterval);
      this.fallbackInterval = null;
    }
  }

  private runFallbackTick(): void {
    // Simplified force simulation
    const nodes = this.nodes;
    const edges = this.edges;

    // Charge force
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        let dx = (nodes[j].x ?? 0) - (nodes[i].x ?? 0);
        let dy = (nodes[j].y ?? 0) - (nodes[i].y ?? 0);
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist < 1) dist = 1;

        const force = (this.config.charge * this.alpha) / (dist * dist);
        dx *= force / dist;
        dy *= force / dist;

        nodes[i].vx = (nodes[i].vx ?? 0) - dx;
        nodes[i].vy = (nodes[i].vy ?? 0) - dy;
        nodes[j].vx = (nodes[j].vx ?? 0) + dx;
        nodes[j].vy = (nodes[j].vy ?? 0) + dy;
      }
    }

    // Link force
    for (const edge of edges) {
      const sourceIdx = typeof edge.source === 'number' ? edge.source : 0;
      const targetIdx = typeof edge.target === 'number' ? edge.target : 0;
      const source = nodes[sourceIdx];
      const target = nodes[targetIdx];

      if (!source || !target) continue;

      let dx = (target.x ?? 0) - (source.x ?? 0);
      let dy = (target.y ?? 0) - (source.y ?? 0);
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;

      const force = ((dist - this.config.linkDistance) / dist) * this.config.linkStrength * this.alpha;
      dx *= force;
      dy *= force;

      source.vx = (source.vx ?? 0) + dx * 0.5;
      source.vy = (source.vy ?? 0) + dy * 0.5;
      target.vx = (target.vx ?? 0) - dx * 0.5;
      target.vy = (target.vy ?? 0) - dy * 0.5;
    }

    // Update positions
    for (const node of nodes) {
      if (node.fx !== null && node.fx !== undefined) {
        node.x = node.fx;
        node.vx = 0;
      } else {
        node.vx = (node.vx ?? 0) * this.config.velocityDecay;
        node.x = (node.x ?? 0) + (node.vx ?? 0);
      }

      if (node.fy !== null && node.fy !== undefined) {
        node.y = node.fy;
        node.vy = 0;
      } else {
        node.vy = (node.vy ?? 0) * this.config.velocityDecay;
        node.y = (node.y ?? 0) + (node.vy ?? 0);
      }
    }

    // Decay alpha
    this.alpha += (this.config.alphaMin - this.alpha) * this.config.alphaDecay;

    // Emit tick
    if (this.events.onTick) {
      const positions = new Float32Array(nodes.length * 2);
      for (let i = 0; i < nodes.length; i++) {
        positions[i * 2] = nodes[i].x ?? 0;
        positions[i * 2 + 1] = nodes[i].y ?? 0;
      }
      this.events.onTick(positions, this.alpha);
    }

    // Check for end
    if (this.alpha < this.config.alphaMin) {
      this.isRunning = false;
      if (this.events.onEnd) {
        this.events.onEnd();
      }
    }
  }

  /**
   * Dispose
   */
  dispose(): void {
    this.stop();

    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this.stopFallbackSimulation();
    this.nodes = [];
    this.edges = [];
  }
}
