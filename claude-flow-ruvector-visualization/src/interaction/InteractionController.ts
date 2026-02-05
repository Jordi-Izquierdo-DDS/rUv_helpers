/**
 * InteractionController - State machine for user interactions
 *
 * Manages interaction states: idle, hovering, dragging, selecting
 * Coordinates between GPUPicker, NodeDragger, and TooltipManager
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { GraphNode } from '../config/Constants';

export enum InteractionState {
  IDLE = 'idle',
  HOVERING = 'hovering',
  DRAGGING = 'dragging',
  SELECTING = 'selecting',
  PANNING = 'panning',
  ZOOMING = 'zooming'
}

export interface InteractionEvent {
  type: 'hover' | 'click' | 'dragStart' | 'drag' | 'dragEnd' | 'select' | 'deselect';
  nodeIndex: number | null;
  node: GraphNode | null;
  screenPosition: { x: number; y: number };
  worldPosition: THREE.Vector3;
  originalEvent: MouseEvent | TouchEvent | WheelEvent;
}

export type InteractionCallback = (event: InteractionEvent) => void;

export class InteractionController {
  private container: HTMLElement;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;

  // State
  private state: InteractionState = InteractionState.IDLE;
  private hoveredNodeIndex: number | null = null;
  private selectedNodeIndex: number | null = null;
  private draggedNodeIndex: number | null = null;

  // Mouse tracking
  private mousePosition: THREE.Vector2 = new THREE.Vector2();
  private mouseDownPosition: THREE.Vector2 = new THREE.Vector2();
  private isDragging = false;
  private dragThreshold = 5; // pixels

  // Callbacks
  private callbacks: Map<string, InteractionCallback[]> = new Map();

  // Node lookup function (provided by renderer)
  private getNodeAtPosition: ((x: number, y: number) => number | null) | null = null;
  private getNodeByIndex: ((index: number) => GraphNode | null) | null = null;

  // Throttling
  private lastHoverTime = 0;
  private hoverThrottle = 33; // ~30fps

  constructor(
    container: HTMLElement,
    camera: THREE.PerspectiveCamera,
    controls: OrbitControls
  ) {
    this.container = container;
    this.camera = camera;
    this.controls = controls;

    this.setupEventListeners();
  }

  /**
   * Set the node lookup function
   */
  setNodeLookup(
    getNodeAtPosition: (x: number, y: number) => number | null,
    getNodeByIndex: (index: number) => GraphNode | null
  ): void {
    this.getNodeAtPosition = getNodeAtPosition;
    this.getNodeByIndex = getNodeByIndex;
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    const canvas = this.container.querySelector('canvas') || this.container;

    // Mouse events
    canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    canvas.addEventListener('click', this.handleClick.bind(this));
    canvas.addEventListener('dblclick', this.handleDoubleClick.bind(this));
    canvas.addEventListener('contextmenu', this.handleContextMenu.bind(this));

    // Touch events
    canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
    canvas.addEventListener('touchmove', this.handleTouchMove.bind(this));
    canvas.addEventListener('touchend', this.handleTouchEnd.bind(this));

    // Wheel event
    canvas.addEventListener('wheel', this.handleWheel.bind(this));

    // Keyboard events
    window.addEventListener('keydown', this.handleKeyDown.bind(this));
    window.addEventListener('keyup', this.handleKeyUp.bind(this));
  }

  /**
   * Handle mouse move
   */
  private handleMouseMove(event: MouseEvent): void {
    const rect = this.container.getBoundingClientRect();
    this.mousePosition.set(
      event.clientX - rect.left,
      event.clientY - rect.top
    );

    // Check for drag
    if (this.isDragging && this.draggedNodeIndex !== null) {
      this.state = InteractionState.DRAGGING;
      this.emitEvent('drag', this.draggedNodeIndex, event);
      return;
    }

    // Throttled hover detection
    const now = performance.now();
    if (now - this.lastHoverTime < this.hoverThrottle) return;
    this.lastHoverTime = now;

    // Check for hover
    if (this.getNodeAtPosition) {
      const nodeIndex = this.getNodeAtPosition(
        event.clientX,
        event.clientY
      );

      if (nodeIndex !== this.hoveredNodeIndex) {
        // Hover changed
        if (this.hoveredNodeIndex !== null) {
          // Left previous node
        }

        this.hoveredNodeIndex = nodeIndex;

        if (nodeIndex !== null) {
          this.state = InteractionState.HOVERING;
          this.emitEvent('hover', nodeIndex, event);
        } else {
          this.state = InteractionState.IDLE;
          this.emitEvent('hover', null, event);
        }
      }
    }
  }

  /**
   * Handle mouse down
   */
  private handleMouseDown(_event: MouseEvent): void {
    this.mouseDownPosition.copy(this.mousePosition);

    // Check if clicking on a node
    if (this.hoveredNodeIndex !== null) {
      this.draggedNodeIndex = this.hoveredNodeIndex;
      // Don't start dragging immediately - wait for threshold
    }
  }

  /**
   * Handle mouse up
   */
  private handleMouseUp(event: MouseEvent): void {
    if (this.isDragging && this.draggedNodeIndex !== null) {
      this.emitEvent('dragEnd', this.draggedNodeIndex, event);
      this.isDragging = false;
      this.draggedNodeIndex = null;
      this.state = InteractionState.IDLE;
    }
  }

  /**
   * Handle click
   */
  private handleClick(event: MouseEvent): void {
    // Check if this was a drag (moved beyond threshold)
    const dx = this.mousePosition.x - this.mouseDownPosition.x;
    const dy = this.mousePosition.y - this.mouseDownPosition.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > this.dragThreshold) {
      // This was a drag, not a click
      return;
    }

    // Check if clicking on a node
    if (this.getNodeAtPosition) {
      const nodeIndex = this.getNodeAtPosition(
        event.clientX,
        event.clientY
      );

      if (nodeIndex !== null) {
        // Clicked on a node
        if (this.selectedNodeIndex === nodeIndex) {
          // Clicked same node - deselect
          this.selectedNodeIndex = null;
          this.emitEvent('deselect', nodeIndex, event);
        } else {
          // Select new node
          this.selectedNodeIndex = nodeIndex;
          this.emitEvent('select', nodeIndex, event);
        }
      } else {
        // Clicked on background - deselect
        if (this.selectedNodeIndex !== null) {
          const prevSelected = this.selectedNodeIndex;
          this.selectedNodeIndex = null;
          this.emitEvent('deselect', prevSelected, event);
        }
      }
    }
  }

  /**
   * Handle double click
   */
  private handleDoubleClick(_event: MouseEvent): void {
    // Double click on node - could trigger zoom to node
    // Or trigger node expansion/details view
  }

  /**
   * Handle context menu (right click)
   */
  private handleContextMenu(event: MouseEvent): void {
    // Could show context menu for node
    // For now, prevent default
    event.preventDefault();
  }

  /**
   * Handle touch start
   */
  private handleTouchStart(event: TouchEvent): void {
    if (event.touches.length === 1) {
      const touch = event.touches[0];
      const rect = this.container.getBoundingClientRect();
      this.mousePosition.set(
        touch.clientX - rect.left,
        touch.clientY - rect.top
      );
      this.mouseDownPosition.copy(this.mousePosition);

      // Check for node
      if (this.getNodeAtPosition) {
        const nodeIndex = this.getNodeAtPosition(touch.clientX, touch.clientY);
        if (nodeIndex !== null) {
          this.draggedNodeIndex = nodeIndex;
        }
      }
    }
  }

  /**
   * Handle touch move
   */
  private handleTouchMove(event: TouchEvent): void {
    if (event.touches.length === 1) {
      const touch = event.touches[0];
      const rect = this.container.getBoundingClientRect();
      this.mousePosition.set(
        touch.clientX - rect.left,
        touch.clientY - rect.top
      );

      // Check for drag
      const dx = this.mousePosition.x - this.mouseDownPosition.x;
      const dy = this.mousePosition.y - this.mouseDownPosition.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > this.dragThreshold && this.draggedNodeIndex !== null) {
        if (!this.isDragging) {
          this.isDragging = true;
          this.emitEvent('dragStart', this.draggedNodeIndex, event);
          this.controls.enabled = false;
        }
        this.emitEvent('drag', this.draggedNodeIndex, event);
      }
    }
  }

  /**
   * Handle touch end
   */
  private handleTouchEnd(event: TouchEvent): void {
    if (this.isDragging && this.draggedNodeIndex !== null) {
      this.emitEvent('dragEnd', this.draggedNodeIndex, event);
      this.isDragging = false;
      this.controls.enabled = true;
    }
    this.draggedNodeIndex = null;
  }

  /**
   * Handle wheel
   */
  private handleWheel(_event: WheelEvent): void {
    this.state = InteractionState.ZOOMING;
    // OrbitControls handles zooming
  }

  /**
   * Handle key down
   */
  private handleKeyDown(event: KeyboardEvent): void {
    // Escape - deselect
    if (event.key === 'Escape' && this.selectedNodeIndex !== null) {
      const prevSelected = this.selectedNodeIndex;
      this.selectedNodeIndex = null;
      this.emitEvent('deselect', prevSelected, new MouseEvent('keydown'));
    }
  }

  /**
   * Handle key up
   */
  private handleKeyUp(_event: KeyboardEvent): void {
    // Nothing for now
  }

  /**
   * Emit interaction event
   */
  private emitEvent(
    type: InteractionEvent['type'],
    nodeIndex: number | null,
    originalEvent: MouseEvent | TouchEvent | WheelEvent
  ): void {
    const node = nodeIndex !== null && this.getNodeByIndex
      ? this.getNodeByIndex(nodeIndex)
      : null;

    const worldPosition = this.screenToWorld(
      this.mousePosition.x,
      this.mousePosition.y
    );

    const event: InteractionEvent = {
      type,
      nodeIndex,
      node,
      screenPosition: { x: this.mousePosition.x, y: this.mousePosition.y },
      worldPosition,
      originalEvent
    };

    // Emit to registered callbacks
    const callbacks = this.callbacks.get(type) || [];
    for (const callback of callbacks) {
      callback(event);
    }

    // Also emit to 'all' listeners
    const allCallbacks = this.callbacks.get('all') || [];
    for (const callback of allCallbacks) {
      callback(event);
    }
  }

  /**
   * Convert screen coordinates to world coordinates
   */
  private screenToWorld(screenX: number, screenY: number): THREE.Vector3 {
    const vector = new THREE.Vector3();
    const rect = this.container.getBoundingClientRect();

    vector.set(
      (screenX / rect.width) * 2 - 1,
      -(screenY / rect.height) * 2 + 1,
      0.5
    );

    vector.unproject(this.camera);
    const dir = vector.sub(this.camera.position).normalize();
    const distance = -this.camera.position.z / dir.z;

    return this.camera.position.clone().add(dir.multiplyScalar(distance));
  }

  /**
   * Register callback for interaction events
   */
  on(type: InteractionEvent['type'] | 'all', callback: InteractionCallback): void {
    if (!this.callbacks.has(type)) {
      this.callbacks.set(type, []);
    }
    this.callbacks.get(type)!.push(callback);
  }

  /**
   * Remove callback
   */
  off(type: InteractionEvent['type'] | 'all', callback: InteractionCallback): void {
    const callbacks = this.callbacks.get(type);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index >= 0) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Get current state
   */
  getState(): InteractionState {
    return this.state;
  }

  /**
   * Get hovered node index
   */
  getHoveredNodeIndex(): number | null {
    return this.hoveredNodeIndex;
  }

  /**
   * Get selected node index
   */
  getSelectedNodeIndex(): number | null {
    return this.selectedNodeIndex;
  }

  /**
   * Set selected node programmatically
   */
  setSelectedNode(index: number | null): void {
    if (this.selectedNodeIndex !== index) {
      const prevSelected = this.selectedNodeIndex;
      this.selectedNodeIndex = index;

      if (prevSelected !== null) {
        this.emitEvent('deselect', prevSelected, new MouseEvent('programmatic'));
      }
      if (index !== null) {
        this.emitEvent('select', index, new MouseEvent('programmatic'));
      }
    }
  }

  /**
   * Dispose
   */
  dispose(): void {
    this.callbacks.clear();
  }
}
