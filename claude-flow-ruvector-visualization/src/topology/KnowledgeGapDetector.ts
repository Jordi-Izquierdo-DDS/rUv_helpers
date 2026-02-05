/**
 * KnowledgeGapDetector - Detects knowledge gaps from H1 homology cycles
 *
 * Uses persistent H1 (loop/hole) features from topological data analysis
 * to identify "gaps" in the knowledge graph -- regions where topics exist
 * around a boundary but the interior is empty, suggesting missing knowledge.
 */

import type { Bar } from './PersistentHomology';
import type { GraphNode } from '../config/Constants';

// ═══════════════════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface KnowledgeGap {
  id: string;
  nodeIndices: number[];      // Nodes forming the boundary of the gap
  center: { x: number; y: number }; // Center of the gap
  radius: number;             // Approximate radius
  persistence: number;        // How persistent/real this gap is
  surroundingTopics: string[]; // Topics/namespaces around the gap
  label: string;              // Human-readable description
}

// ═══════════════════════════════════════════════════════════════════════════
// KNOWLEDGE GAP DETECTOR
// ═══════════════════════════════════════════════════════════════════════════

export class KnowledgeGapDetector {
  constructor() {
    // Stateless detector; all state is passed per invocation
  }

  /**
   * Detect knowledge gaps from persistent H1 cycles.
   *
   * For each significant H1 bar (loop that persists across filtration values):
   * 1. Extract representative cycle nodes
   * 2. Compute geometric center and radius of the void
   * 3. Gather surrounding topic labels from node metadata
   * 4. Generate a human-readable label describing the gap
   *
   * @param nodes - Graph nodes with position and metadata
   * @param positions - (x,y) positions used for homology computation
   * @param bars - Persistence bars from PersistentHomology.compute()
   * @returns Detected knowledge gaps sorted by persistence (most significant first)
   */
  detect(
    nodes: GraphNode[],
    positions: Array<{ x: number; y: number }>,
    bars: Bar[]
  ): KnowledgeGap[] {
    // Filter to H1 bars with representative cycles
    const h1Bars = bars.filter(
      bar => bar.dimension === 1 && bar.representative && bar.representative.length >= 3
    );

    if (h1Bars.length === 0) return [];

    const gaps: KnowledgeGap[] = [];

    for (let idx = 0; idx < h1Bars.length; idx++) {
      const bar = h1Bars[idx];
      const cycleNodes = bar.representative!;
      const persistence = isFinite(bar.death) ? bar.death - bar.birth : bar.birth;

      // 1. Compute center of the gap (mean position of cycle nodes)
      let sumX = 0;
      let sumY = 0;
      for (const nodeIdx of cycleNodes) {
        const pos = positions[nodeIdx];
        if (pos) {
          sumX += pos.x;
          sumY += pos.y;
        }
      }
      const center = {
        x: sumX / cycleNodes.length,
        y: sumY / cycleNodes.length
      };

      // 2. Compute radius (max distance from center to any cycle node)
      let maxDist = 0;
      for (const nodeIdx of cycleNodes) {
        const pos = positions[nodeIdx];
        if (pos) {
          const dx = pos.x - center.x;
          const dy = pos.y - center.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          maxDist = Math.max(maxDist, dist);
        }
      }

      // 3. Gather surrounding topics from cycle nodes
      const topicSet = new Set<string>();
      for (const nodeIdx of cycleNodes) {
        const node = nodes[nodeIdx];
        if (!node) continue;

        // Use namespace as primary topic, fall back to source type
        if (node.namespace) {
          topicSet.add(node.namespace);
        } else if (node.source) {
          topicSet.add(node.source);
        }

        // Also include domain if available
        if (node.domain) {
          topicSet.add(node.domain);
        }
      }
      const surroundingTopics = Array.from(topicSet);

      // 4. Generate human-readable label
      const label = this.generateLabel(surroundingTopics);

      gaps.push({
        id: `gap-${idx}-${cycleNodes[0]}-${cycleNodes[cycleNodes.length - 1]}`,
        nodeIndices: cycleNodes,
        center,
        radius: maxDist,
        persistence,
        surroundingTopics,
        label
      });
    }

    // Sort by persistence descending (most significant gaps first)
    gaps.sort((a, b) => b.persistence - a.persistence);

    return gaps;
  }

  /**
   * Generate a descriptive label for the gap based on surrounding topics.
   */
  private generateLabel(topics: string[]): string {
    if (topics.length === 0) {
      return 'Uncharacterized gap';
    }
    if (topics.length === 1) {
      return `Gap within ${this.formatTopic(topics[0])}`;
    }
    if (topics.length === 2) {
      return `Gap between ${this.formatTopic(topics[0])} and ${this.formatTopic(topics[1])}`;
    }
    // 3+ topics: show first two and count
    const first = this.formatTopic(topics[0]);
    const second = this.formatTopic(topics[1]);
    const remaining = topics.length - 2;
    return `Gap between ${first}, ${second} (+${remaining} more)`;
  }

  /**
   * Format a raw topic string into a human-readable form.
   */
  private formatTopic(topic: string): string {
    return topic
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  /**
   * Filter gaps by minimum persistence threshold.
   *
   * @param gaps - Detected knowledge gaps
   * @param minPersistence - Minimum persistence value to keep
   * @returns Filtered gaps
   */
  filterByPersistence(gaps: KnowledgeGap[], minPersistence: number): KnowledgeGap[] {
    return gaps.filter(gap => gap.persistence >= minPersistence);
  }
}

export default KnowledgeGapDetector;
