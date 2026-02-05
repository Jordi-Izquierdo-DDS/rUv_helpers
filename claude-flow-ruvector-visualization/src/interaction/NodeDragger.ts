/**
 * NodeDragger - Node dragging with force simulation integration
 *
 * Handles:
 * - Dragging nodes with mouse/touch
 * - Pinning dragged nodes (fx, fy)
 * - Unpinning on release or timeout
 * - Smooth position updates
 */

import * as THREE from 'three';
import type { GraphNode } from '../config/Constants';

export interface DragConfig {
  pinOnDrag: boolean;        // Pin node to prevent simulation movement
  unpinOnRelease: boolean;   // Unpin when drag ends
  unpinDelay: number;        // Delay before unpinning (ms)
  smoothing: number;         // Position smoothing factor (0-1)
}

export interface DragEvent {
  nodeIndex: number;
  node: GraphNode;
  position: THREE.Vector3;
  delta: THREE.Vector3;
  isDragging: boolean;
}

export type DragCallback = (event: DragEvent) => void;

export class NodeDragger {
  // Configuration
  private config: DragConfig = {
    pinOnDrag: true,
    unpinOnRelease: true,
    unpinDelay: 2000,
    smoothing: 0.3
  };

  // State
  private draggedNodeIndex: number | null = null;
  private draggedNode: GraphNode | null = null;
  private startPosition: THREE.Vector3 = new THREE.Vector3();
  private currentPosition: THREE.Vector3 = new THREE.Vector3();
  private lastPosition: THREE.Vector3 = new THREE.Vector3();
  private dragOffset: THREE.Vector3 = new THREE.Vector3();

  // Unpin timers
  private unpinTimers: Map<number, ReturnType<typeof setTimeout>> = new Map();

  // Callbacks
  private onDragStart: DragCallback | null = null;
  private onDrag: DragCallback | null = null;
  private onDragEnd: DragCallback | null = null;

  // Node data references
  private nodes: GraphNode[] = [];
  private getNodePosition: ((index: number) => THREE.Vector3) | null = null;
  private setNodePosition: ((index: number, position: THREE.Vector3) => void) | null = null;

  constructor(config?: Partial<DragConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  /**
   * Set node data references
   */
  setNodeData(
    nodes: GraphNode[],
    getPosition: (index: number) => THREE.Vector3,
    setPosition: (index: number, position: THREE.Vector3) => void
  ): void {
    this.nodes = nodes;
    this.getNodePosition = getPosition;
    this.setNodePosition = setPosition;
  }

  /**
   * Start dragging a node
   */
  startDrag(nodeIndex: number, worldPosition: THREE.Vector3): void {
    if (nodeIndex < 0 || nodeIndex >= this.nodes.length) return;

    this.draggedNodeIndex = nodeIndex;
    this.draggedNode = this.nodes[nodeIndex];

    // Get current node position
    if (this.getNodePosition) {
      this.startPosition.copy(this.getNodePosition(nodeIndex));
    } else {
      this.startPosition.set(
        this.draggedNode.x ?? 0,
        this.draggedNode.y ?? 0,
        this.draggedNode.z ?? 0
      );
    }

    this.currentPosition.copy(this.startPosition);
    this.lastPosition.copy(this.startPosition);

    // Calculate offset from click to node center
    this.dragOffset.copy(this.startPosition).sub(worldPosition);

    // Pin node if configured
    if (this.config.pinOnDrag) {
      this.pinNode(nodeIndex);
    }

    // Clear any pending unpin timer
    this.clearUnpinTimer(nodeIndex);

    // Emit event
    if (this.onDragStart) {
      this.onDragStart({
        nodeIndex,
        node: this.draggedNode,
        position: this.currentPosition.clone(),
        delta: new THREE.Vector3(),
        isDragging: true
      });
    }
  }

  /**
   * Update drag position
   */
  updateDrag(worldPosition: THREE.Vector3): void {
    if (this.draggedNodeIndex === null || !this.draggedNode) return;

    // Apply offset to get target position
    const targetPosition = worldPosition.clone().add(this.dragOffset);

    // Apply smoothing
    this.currentPosition.lerp(targetPosition, 1 - this.config.smoothing);

    // Calculate delta
    const delta = this.currentPosition.clone().sub(this.lastPosition);

    // Update node position
    this.draggedNode.x = this.currentPosition.x;
    this.draggedNode.y = this.currentPosition.y;
    this.draggedNode.z = this.currentPosition.z;

    // Update pinned position
    if (this.config.pinOnDrag) {
      this.draggedNode.fx = this.currentPosition.x;
      this.draggedNode.fy = this.currentPosition.y;
    }

    // Update via callback if provided
    if (this.setNodePosition) {
      this.setNodePosition(this.draggedNodeIndex, this.currentPosition);
    }

    // Emit event
    if (this.onDrag) {
      this.onDrag({
        nodeIndex: this.draggedNodeIndex,
        node: this.draggedNode,
        position: this.currentPosition.clone(),
        delta,
        isDragging: true
      });
    }

    // Store for next delta calculation
    this.lastPosition.copy(this.currentPosition);
  }

  /**
   * End dragging
   */
  endDrag(): void {
    if (this.draggedNodeIndex === null || !this.draggedNode) return;

    const nodeIndex = this.draggedNodeIndex;
    const node = this.draggedNode;
    const finalPosition = this.currentPosition.clone();

    // Emit event
    if (this.onDragEnd) {
      this.onDragEnd({
        nodeIndex,
        node,
        position: finalPosition,
        delta: new THREE.Vector3(),
        isDragging: false
      });
    }

    // Schedule unpin if configured
    if (this.config.unpinOnRelease && this.config.unpinDelay > 0) {
      this.scheduleUnpin(nodeIndex);
    } else if (this.config.unpinOnRelease) {
      this.unpinNode(nodeIndex);
    }

    // Clear drag state
    this.draggedNodeIndex = null;
    this.draggedNode = null;
  }

  /**
   * Cancel drag without completing
   */
  cancelDrag(): void {
    if (this.draggedNodeIndex === null || !this.draggedNode) return;

    // Restore original position
    this.draggedNode.x = this.startPosition.x;
    this.draggedNode.y = this.startPosition.y;
    this.draggedNode.z = this.startPosition.z;

    // Unpin
    this.unpinNode(this.draggedNodeIndex);

    // Clear drag state
    this.draggedNodeIndex = null;
    this.draggedNode = null;
  }

  /**
   * Pin a node (prevent simulation from moving it)
   */
  private pinNode(nodeIndex: number): void {
    const node = this.nodes[nodeIndex];
    if (node) {
      node.fx = node.x;
      node.fy = node.y;
    }
  }

  /**
   * Unpin a node (allow simulation to move it)
   */
  private unpinNode(nodeIndex: number): void {
    const node = this.nodes[nodeIndex];
    if (node) {
      node.fx = null;
      node.fy = null;
    }
  }

  /**
   * Schedule unpin after delay
   */
  private scheduleUnpin(nodeIndex: number): void {
    this.clearUnpinTimer(nodeIndex);

    const timer = setTimeout(() => {
      this.unpinNode(nodeIndex);
      this.unpinTimers.delete(nodeIndex);
    }, this.config.unpinDelay);

    this.unpinTimers.set(nodeIndex, timer);
  }

  /**
   * Clear pending unpin timer
   */
  private clearUnpinTimer(nodeIndex: number): void {
    const timer = this.unpinTimers.get(nodeIndex);
    if (timer) {
      clearTimeout(timer);
      this.unpinTimers.delete(nodeIndex);
    }
  }

  /**
   * Register drag callbacks
   */
  onStart(callback: DragCallback): void {
    this.onDragStart = callback;
  }

  onMove(callback: DragCallback): void {
    this.onDrag = callback;
  }

  onEnd(callback: DragCallback): void {
    this.onDragEnd = callback;
  }

  /**
   * Check if currently dragging
   */
  isDragging(): boolean {
    return this.draggedNodeIndex !== null;
  }

  /**
   * Get dragged node index
   */
  getDraggedNodeIndex(): number | null {
    return this.draggedNodeIndex;
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<DragConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Dispose
   */
  dispose(): void {
    // Clear all unpin timers
    for (const timer of this.unpinTimers.values()) {
      clearTimeout(timer);
    }
    this.unpinTimers.clear();

    this.draggedNodeIndex = null;
    this.draggedNode = null;
    this.onDragStart = null;
    this.onDrag = null;
    this.onDragEnd = null;
  }
}
