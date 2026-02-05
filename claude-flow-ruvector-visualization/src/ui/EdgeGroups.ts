/**
 * EdgeGroups - Edge group configuration and management
 *
 * Manages deterministic vs semantic edge groups with
 * independent settings for visibility, styling, and forces.
 */

import {
  EdgeGroup,
  EdgeGroupSettings,
  DETERMINISTIC_EDGE_TYPES,
  SEMANTIC_EDGE_TYPES,
  PRESETS,
  Preset,
  GraphEdge,
  hexToRGB
} from '../config/Constants';

export interface EdgeGroupState {
  deterministic: EdgeGroupSettings;
  semantic: EdgeGroupSettings;
}

export interface EdgeGroupStats {
  deterministicCount: number;
  semanticCount: number;
  deterministicVisible: number;
  semanticVisible: number;
  typeBreakdown: Map<string, number>;
}

export type EdgeGroupChangeCallback = (state: EdgeGroupState) => void;

/**
 * EdgeGroupManager - Manages edge group settings
 */
export class EdgeGroupManager {
  private state: EdgeGroupState;
  private edges: GraphEdge[] = [];
  private edgeGroups: EdgeGroup[] = []; // Group for each edge

  // Callbacks
  private onChangeCallbacks: EdgeGroupChangeCallback[] = [];

  constructor(preset?: string) {
    // Initialize with balanced preset
    const initialPreset = PRESETS[preset ?? 'balanced'];
    this.state = {
      deterministic: { ...initialPreset.deterministic },
      semantic: { ...initialPreset.semantic }
    };
  }

  /**
   * Initialize with edge data
   */
  initialize(edges: GraphEdge[]): void {
    this.edges = edges;
    this.edgeGroups = [];

    // Classify each edge
    for (const edge of edges) {
      const group = this.classifyEdge(edge);
      this.edgeGroups.push(group);
    }

    console.log(`EdgeGroupManager initialized: ${this.getStats().deterministicCount} deterministic, ${this.getStats().semanticCount} semantic`);
  }

  /**
   * Classify an edge into its group
   */
  private classifyEdge(edge: GraphEdge): EdgeGroup {
    const type = edge.type ?? '';

    if (DETERMINISTIC_EDGE_TYPES.has(type)) {
      return EdgeGroup.DETERMINISTIC;
    }
    if (SEMANTIC_EDGE_TYPES.has(type)) {
      return EdgeGroup.SEMANTIC;
    }

    // Default based on edge properties
    if (edge.weight != null && edge.weight > 0.5) {
      return EdgeGroup.DETERMINISTIC;
    }

    return EdgeGroup.SEMANTIC;
  }

  /**
   * Apply a preset
   */
  applyPreset(presetName: string): void {
    const preset = PRESETS[presetName];
    if (!preset) {
      console.warn(`Unknown preset: ${presetName}`);
      return;
    }

    this.state = {
      deterministic: { ...preset.deterministic },
      semantic: { ...preset.semantic }
    };

    this.notifyChange();
  }

  /**
   * Get current state
   */
  getState(): EdgeGroupState {
    return {
      deterministic: { ...this.state.deterministic },
      semantic: { ...this.state.semantic }
    };
  }

  /**
   * Get settings for a specific group
   */
  getGroupSettings(group: EdgeGroup): EdgeGroupSettings {
    return group === EdgeGroup.DETERMINISTIC
      ? { ...this.state.deterministic }
      : { ...this.state.semantic };
  }

  /**
   * Update settings for a specific group
   */
  updateGroupSettings(group: EdgeGroup, settings: Partial<EdgeGroupSettings>): void {
    if (group === EdgeGroup.DETERMINISTIC) {
      this.state.deterministic = { ...this.state.deterministic, ...settings };
    } else {
      this.state.semantic = { ...this.state.semantic, ...settings };
    }
    this.notifyChange();
  }

  /**
   * Toggle group visibility
   */
  toggleGroup(group: EdgeGroup): void {
    if (group === EdgeGroup.DETERMINISTIC) {
      this.state.deterministic.enabled = !this.state.deterministic.enabled;
    } else {
      this.state.semantic.enabled = !this.state.semantic.enabled;
    }
    this.notifyChange();
  }

  /**
   * Set group visibility
   */
  setGroupEnabled(group: EdgeGroup, enabled: boolean): void {
    if (group === EdgeGroup.DETERMINISTIC) {
      this.state.deterministic.enabled = enabled;
    } else {
      this.state.semantic.enabled = enabled;
    }
    this.notifyChange();
  }

  /**
   * Set group opacity
   */
  setGroupOpacity(group: EdgeGroup, opacity: number): void {
    const clamped = Math.max(0, Math.min(1, opacity));
    if (group === EdgeGroup.DETERMINISTIC) {
      this.state.deterministic.opacity = clamped;
    } else {
      this.state.semantic.opacity = clamped;
    }
    this.notifyChange();
  }

  /**
   * Set group width
   */
  setGroupWidth(group: EdgeGroup, width: number): void {
    const clamped = Math.max(0.1, Math.min(10, width));
    if (group === EdgeGroup.DETERMINISTIC) {
      this.state.deterministic.width = clamped;
    } else {
      this.state.semantic.width = clamped;
    }
    this.notifyChange();
  }

  /**
   * Set group glow
   */
  setGroupGlow(group: EdgeGroup, glow: boolean): void {
    if (group === EdgeGroup.DETERMINISTIC) {
      this.state.deterministic.glow = glow;
    } else {
      this.state.semantic.glow = glow;
    }
    this.notifyChange();
  }

  /**
   * Set group color
   */
  setGroupColor(group: EdgeGroup, color: number): void {
    if (group === EdgeGroup.DETERMINISTIC) {
      this.state.deterministic.color = color;
    } else {
      this.state.semantic.color = color;
    }
    this.notifyChange();
  }

  /**
   * Get edge group for an edge index
   */
  getEdgeGroup(index: number): EdgeGroup {
    return this.edgeGroups[index] ?? EdgeGroup.SEMANTIC;
  }

  /**
   * Get visibility flags for all edges
   */
  getVisibility(): Uint8Array {
    const visibility = new Uint8Array(this.edges.length);

    for (let i = 0; i < this.edges.length; i++) {
      const group = this.edgeGroups[i];
      const settings = group === EdgeGroup.DETERMINISTIC
        ? this.state.deterministic
        : this.state.semantic;
      visibility[i] = settings.enabled ? 1 : 0;
    }

    return visibility;
  }

  /**
   * Get opacity values for all edges
   */
  getOpacities(): Float32Array {
    const opacities = new Float32Array(this.edges.length);

    for (let i = 0; i < this.edges.length; i++) {
      const group = this.edgeGroups[i];
      const settings = group === EdgeGroup.DETERMINISTIC
        ? this.state.deterministic
        : this.state.semantic;
      opacities[i] = settings.enabled ? settings.opacity : 0;
    }

    return opacities;
  }

  /**
   * Get width values for all edges
   */
  getWidths(): Float32Array {
    const widths = new Float32Array(this.edges.length);

    for (let i = 0; i < this.edges.length; i++) {
      const group = this.edgeGroups[i];
      const settings = group === EdgeGroup.DETERMINISTIC
        ? this.state.deterministic
        : this.state.semantic;
      widths[i] = settings.width;
    }

    return widths;
  }

  /**
   * Get colors for all edges (RGB arrays)
   */
  getColors(): Float32Array {
    const colors = new Float32Array(this.edges.length * 3);

    for (let i = 0; i < this.edges.length; i++) {
      const group = this.edgeGroups[i];
      const settings = group === EdgeGroup.DETERMINISTIC
        ? this.state.deterministic
        : this.state.semantic;
      const rgb = hexToRGB(settings.color);
      colors[i * 3] = rgb[0];
      colors[i * 3 + 1] = rgb[1];
      colors[i * 3 + 2] = rgb[2];
    }

    return colors;
  }

  /**
   * Get force simulation parameters for edges
   */
  getForceParams(): {
    deterministicDistance: number;
    deterministicStrength: number;
    semanticDistance: number;
    semanticStrength: number;
    repulsion: number;
  } {
    return {
      deterministicDistance: this.state.deterministic.distance,
      deterministicStrength: this.state.deterministic.strength,
      semanticDistance: this.state.semantic.distance,
      semanticStrength: this.state.semantic.strength,
      repulsion: (this.state.deterministic.repulsion + this.state.semantic.repulsion) / 2
    };
  }

  /**
   * Get statistics
   */
  getStats(): EdgeGroupStats {
    let deterministicCount = 0;
    let semanticCount = 0;
    let deterministicVisible = 0;
    let semanticVisible = 0;
    const typeBreakdown = new Map<string, number>();

    for (let i = 0; i < this.edges.length; i++) {
      const group = this.edgeGroups[i];
      const type = this.edges[i].type ?? 'unknown';

      typeBreakdown.set(type, (typeBreakdown.get(type) ?? 0) + 1);

      if (group === EdgeGroup.DETERMINISTIC) {
        deterministicCount++;
        if (this.state.deterministic.enabled) {
          deterministicVisible++;
        }
      } else {
        semanticCount++;
        if (this.state.semantic.enabled) {
          semanticVisible++;
        }
      }
    }

    return {
      deterministicCount,
      semanticCount,
      deterministicVisible,
      semanticVisible,
      typeBreakdown
    };
  }

  /**
   * Get indices for a specific group
   */
  getGroupIndices(group: EdgeGroup): number[] {
    const indices: number[] = [];
    for (let i = 0; i < this.edgeGroups.length; i++) {
      if (this.edgeGroups[i] === group) {
        indices.push(i);
      }
    }
    return indices;
  }

  /**
   * Get visible edge indices
   */
  getVisibleIndices(): number[] {
    const indices: number[] = [];
    for (let i = 0; i < this.edgeGroups.length; i++) {
      const group = this.edgeGroups[i];
      const settings = group === EdgeGroup.DETERMINISTIC
        ? this.state.deterministic
        : this.state.semantic;
      if (settings.enabled) {
        indices.push(i);
      }
    }
    return indices;
  }

  /**
   * Register change callback
   */
  onChange(callback: EdgeGroupChangeCallback): void {
    this.onChangeCallbacks.push(callback);
  }

  /**
   * Remove change callback
   */
  offChange(callback: EdgeGroupChangeCallback): void {
    const index = this.onChangeCallbacks.indexOf(callback);
    if (index >= 0) {
      this.onChangeCallbacks.splice(index, 1);
    }
  }

  /**
   * Notify change callbacks
   */
  private notifyChange(): void {
    const state = this.getState();
    for (const callback of this.onChangeCallbacks) {
      callback(state);
    }
  }

  /**
   * Get available presets
   */
  static getPresets(): string[] {
    return Object.keys(PRESETS);
  }

  /**
   * Get preset info
   */
  static getPresetInfo(name: string): Preset | undefined {
    return PRESETS[name];
  }

  /**
   * Get all edge types
   */
  static getEdgeTypes(): {
    deterministic: string[];
    semantic: string[];
  } {
    return {
      deterministic: Array.from(DETERMINISTIC_EDGE_TYPES),
      semantic: Array.from(SEMANTIC_EDGE_TYPES)
    };
  }

  /**
   * Create UI controls configuration
   */
  getUIConfig(): {
    groups: Array<{
      name: string;
      group: EdgeGroup;
      settings: EdgeGroupSettings;
      count: number;
    }>;
    presets: string[];
  } {
    const stats = this.getStats();

    return {
      groups: [
        {
          name: 'Deterministic',
          group: EdgeGroup.DETERMINISTIC,
          settings: this.state.deterministic,
          count: stats.deterministicCount
        },
        {
          name: 'Semantic',
          group: EdgeGroup.SEMANTIC,
          settings: this.state.semantic,
          count: stats.semanticCount
        }
      ],
      presets: Object.keys(PRESETS)
    };
  }

  /**
   * Serialize state for persistence
   */
  serialize(): string {
    return JSON.stringify(this.state);
  }

  /**
   * Restore state from serialized data
   */
  deserialize(data: string): void {
    try {
      const parsed = JSON.parse(data);
      if (parsed.deterministic && parsed.semantic) {
        this.state = parsed;
        this.notifyChange();
      }
    } catch (e) {
      console.warn('Failed to deserialize EdgeGroupManager state:', e);
    }
  }

  /**
   * Dispose
   */
  dispose(): void {
    this.edges = [];
    this.edgeGroups = [];
    this.onChangeCallbacks = [];
  }
}

export default EdgeGroupManager;
