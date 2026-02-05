/**
 * TooltipManager - Hover tooltip display and management
 *
 * Features:
 * - Smooth positioning near cursor
 * - Content formatting based on node type
 * - Show/hide animations
 * - Viewport boundary handling
 */

import type { GraphNode } from '../config/Constants';

export interface TooltipConfig {
  offsetX: number;           // Horizontal offset from cursor
  offsetY: number;           // Vertical offset from cursor
  maxWidth: number;          // Maximum tooltip width
  showDelay: number;         // Delay before showing (ms)
  hideDelay: number;         // Delay before hiding (ms)
  animationDuration: number; // Animation duration (ms)
}

export class TooltipManager {
  private container: HTMLElement;
  private tooltipElement: HTMLElement;
  private config: TooltipConfig;

  // State
  private isVisible = false;
  private currentNode: GraphNode | null = null;
  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  // Position tracking
  private targetX = 0;
  private targetY = 0;
  private currentX = 0;
  private currentY = 0;
  private animationFrame: number | null = null;

  constructor(container: HTMLElement, config?: Partial<TooltipConfig>) {
    this.container = container;
    this.config = {
      offsetX: 15,
      offsetY: 15,
      maxWidth: 400,
      showDelay: 100,
      hideDelay: 100,
      animationDuration: 150,
      ...config
    };

    this.tooltipElement = this.createTooltipElement();
    this.container.appendChild(this.tooltipElement);
  }

  /**
   * Create the tooltip DOM element
   */
  private createTooltipElement(): HTMLElement {
    const tooltip = document.createElement('div');
    tooltip.id = 'three-tooltip';
    tooltip.style.cssText = `
      position: fixed;
      background: rgba(74, 29, 143, 0.95);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(139, 79, 217, 0.5);
      border-radius: 12px;
      padding: 12px;
      max-width: ${this.config.maxWidth}px;
      font-size: 12px;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      color: #FFFFFF;
      pointer-events: none;
      z-index: 1000;
      opacity: 0;
      transform: translateY(4px);
      transition: opacity ${this.config.animationDuration}ms ease, transform ${this.config.animationDuration}ms ease;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), 0 0 40px rgba(139, 79, 217, 0.3);
    `;

    return tooltip;
  }

  /**
   * Show tooltip for a node
   */
  show(node: GraphNode, x: number, y: number): void {
    // Clear hide timer
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }

    // Update content if node changed
    if (this.currentNode !== node) {
      this.currentNode = node;
      this.tooltipElement.innerHTML = this.formatContent(node);
    }

    // Update target position
    this.targetX = x + this.config.offsetX;
    this.targetY = y + this.config.offsetY;

    // Schedule show
    if (!this.isVisible) {
      if (this.showTimer) {
        clearTimeout(this.showTimer);
      }
      this.showTimer = setTimeout(() => {
        this.displayTooltip();
      }, this.config.showDelay);
    } else {
      // Already visible, just update position
      this.updatePosition();
    }
  }

  /**
   * Hide tooltip
   */
  hide(): void {
    // Clear show timer
    if (this.showTimer) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }

    // Schedule hide
    if (this.isVisible) {
      if (this.hideTimer) {
        clearTimeout(this.hideTimer);
      }
      this.hideTimer = setTimeout(() => {
        this.hideTooltip();
      }, this.config.hideDelay);
    }
  }

  /**
   * Immediately hide tooltip
   */
  hideImmediately(): void {
    if (this.showTimer) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.hideTooltip();
  }

  /**
   * Display the tooltip
   */
  private displayTooltip(): void {
    this.isVisible = true;

    // Initial position
    this.currentX = this.targetX;
    this.currentY = this.targetY;
    this.adjustPosition();

    this.tooltipElement.style.left = `${this.currentX}px`;
    this.tooltipElement.style.top = `${this.currentY}px`;
    this.tooltipElement.style.opacity = '1';
    this.tooltipElement.style.transform = 'translateY(0)';

    // Start position animation loop
    this.startPositionAnimation();
  }

  /**
   * Hide the tooltip
   */
  private hideTooltip(): void {
    this.isVisible = false;
    this.currentNode = null;

    this.tooltipElement.style.opacity = '0';
    this.tooltipElement.style.transform = 'translateY(4px)';

    // Stop position animation
    this.stopPositionAnimation();
  }

  /**
   * Update tooltip position (called on mouse move when visible)
   */
  updatePosition(x?: number, y?: number): void {
    if (x !== undefined && y !== undefined) {
      this.targetX = x + this.config.offsetX;
      this.targetY = y + this.config.offsetY;
    }
  }

  /**
   * Start smooth position animation
   */
  private startPositionAnimation(): void {
    if (this.animationFrame) return;

    const animate = () => {
      if (!this.isVisible) return;

      // Smooth interpolation
      const lerp = 0.15;
      this.currentX += (this.targetX - this.currentX) * lerp;
      this.currentY += (this.targetY - this.currentY) * lerp;

      // Adjust for viewport
      this.adjustPosition();

      // Apply position
      this.tooltipElement.style.left = `${this.currentX}px`;
      this.tooltipElement.style.top = `${this.currentY}px`;

      this.animationFrame = requestAnimationFrame(animate);
    };

    this.animationFrame = requestAnimationFrame(animate);
  }

  /**
   * Stop position animation
   */
  private stopPositionAnimation(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  /**
   * Adjust position to stay within viewport
   */
  private adjustPosition(): void {
    const rect = this.tooltipElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 10;

    // Check right edge
    if (this.currentX + rect.width > viewportWidth - padding) {
      this.currentX = this.targetX - this.config.offsetX - rect.width - padding;
    }

    // Check bottom edge
    if (this.currentY + rect.height > viewportHeight - padding) {
      this.currentY = this.targetY - this.config.offsetY - rect.height - padding;
    }

    // Check left edge
    if (this.currentX < padding) {
      this.currentX = padding;
    }

    // Check top edge
    if (this.currentY < padding) {
      this.currentY = padding;
    }
  }

  /**
   * Format tooltip content based on node type
   */
  private formatContent(node: GraphNode): string {
    const parts: string[] = [];

    // Header with key/ID
    const key = (node as any).key || node.id;
    parts.push(`<div style="color: #B794F6; font-weight: bold; margin-bottom: 4px; font-size: 13px;">${this.escapeHtml(String(key))}</div>`);

    // node type badge
    const sourceColor = this.getSourceColor(node.source);
    parts.push(`<div style="display: inline-block; background: ${sourceColor}33; color: ${sourceColor}; padding: 2px 8px; border-radius: 4px; font-size: 10px; margin-bottom: 6px;">${node.source}</div>`);

    // Namespace if different from source
    if (node.namespace && node.namespace !== node.source) {
      parts.push(`<div style="color: #B0B0B0; font-size: 11px; margin-bottom: 4px;">${this.escapeHtml(node.namespace)}</div>`);
    }

    // Timestamp
    if (node.timestamp) {
      const date = new Date(node.timestamp);
      parts.push(`<div style="color: #888; font-size: 10px; margin-bottom: 8px;">${date.toLocaleString()}</div>`);
    }

    // Source-specific content
    switch (node.source) {
      case 'q_pattern':
        if (node.qValue !== undefined) {
          parts.push(`<div style="margin-bottom: 4px;"><span style="color: #888;">Q-Value:</span> <span style="color: #10B981; font-family: monospace;">${node.qValue.toFixed(4)}</span></div>`);
        }
        if (node.visits !== undefined) {
          parts.push(`<div style="margin-bottom: 4px;"><span style="color: #888;">Visits:</span> <span style="color: #B794F6; font-family: monospace;">${node.visits}</span></div>`);
        }
        if (node.state) {
          parts.push(`<div style="margin-bottom: 4px;"><span style="color: #888;">State:</span> ${this.escapeHtml(node.state)}</div>`);
        }
        if (node.action) {
          parts.push(`<div style="margin-bottom: 4px;"><span style="color: #888;">Action:</span> ${this.escapeHtml(node.action)}</div>`);
        }
        break;

      case 'trajectory':
        if (node.success !== undefined) {
          const successColor = node.success ? '#10B981' : '#EF4444';
          const successText = node.success ? 'Success' : 'Failed';
          parts.push(`<div style="margin-bottom: 4px;"><span style="color: ${successColor}; font-weight: bold;">${successText}</span></div>`);
        }
        if (node.agent) {
          parts.push(`<div style="margin-bottom: 4px;"><span style="color: #888;">Agent:</span> ${this.escapeHtml(node.agent)}</div>`);
        }
        if (node.stepCount !== undefined) {
          parts.push(`<div style="margin-bottom: 4px;"><span style="color: #888;">Steps:</span> ${node.stepCount}</div>`);
        }
        break;
    }

    // Preview (for memory and neural_pattern)
    if (node.preview) {
      const preview = node.preview.length > 200
        ? node.preview.substring(0, 200) + '...'
        : node.preview;
      parts.push(`<div style="color: #E0E0E0; line-height: 1.4; border-top: 1px solid rgba(139, 79, 217, 0.3); padding-top: 8px; margin-top: 4px;">${this.escapeHtml(preview)}</div>`);
    }

    // Connection count
    if (node.connectionCount !== undefined && node.connectionCount > 0) {
      parts.push(`<div style="color: #888; font-size: 10px; margin-top: 8px;">${node.connectionCount} connections</div>`);
    }

    return parts.join('');
  }

  /**
   * Get color for node type
   */
  private getSourceColor(source: string): string {
    const colors: Record<string, string> = {
      memory: '#6B2FB5',
      neural_pattern: '#8B4FD9',
      q_pattern: '#B794F6',
      trajectory: '#10B981'
    };
    return colors[source] || '#888888';
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Check if tooltip is visible
   */
  getIsVisible(): boolean {
    return this.isVisible;
  }

  /**
   * Get current node
   */
  getCurrentNode(): GraphNode | null {
    return this.currentNode;
  }

  /**
   * Dispose
   */
  dispose(): void {
    this.stopPositionAnimation();

    if (this.showTimer) {
      clearTimeout(this.showTimer);
    }
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
    }

    if (this.tooltipElement.parentNode) {
      this.tooltipElement.parentNode.removeChild(this.tooltipElement);
    }
  }
}
