/**
 * DataLoader - Streaming and chunked data loading
 *
 * Features:
 * - Chunked loading (10K nodes per request)
 * - Progress tracking
 * - Caching
 * - Binary data parsing
 * - Error recovery
 */

import type { GraphData, GraphNode, GraphEdge } from '../config/Constants';

export interface LoadProgress {
  phase: 'metadata' | 'nodes' | 'edges' | 'complete';
  loaded: number;
  total: number;
  percentage: number;
}

export interface LoaderConfig {
  apiBaseUrl: string;
  chunkSize: number;
  maxRetries: number;
  retryDelay: number;
  useBinary: boolean;
  cacheEnabled: boolean;
  cacheTTL: number; // ms
}

export type ProgressCallback = (progress: LoadProgress) => void;

export class DataLoader {
  private config: LoaderConfig;
  private cache: Map<string, { data: GraphData; timestamp: number }> = new Map();
  private abortController: AbortController | null = null;

  constructor(config?: Partial<LoaderConfig>) {
    this.config = {
      apiBaseUrl: '/api',
      chunkSize: 10000,
      maxRetries: 3,
      retryDelay: 1000,
      useBinary: false, // Will be enabled in Phase 4
      cacheEnabled: true,
      cacheTTL: 5 * 60 * 1000, // 5 minutes
      ...config
    };
  }

  /**
   * Load full graph data
   */
  async loadGraph(
    onProgress?: ProgressCallback,
    forceRefresh = false
  ): Promise<GraphData> {
    // Check cache
    const cacheKey = 'graph';
    if (!forceRefresh && this.config.cacheEnabled) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.config.cacheTTL) {
        console.log('DataLoader: Using cached data');
        return cached.data;
      }
    }

    // Create abort controller
    this.abortController = new AbortController();

    try {
      onProgress?.({
        phase: 'metadata',
        loaded: 0,
        total: 0,
        percentage: 0
      });

      // Load graph data
      const url = forceRefresh
        ? `${this.config.apiBaseUrl}/graph?refresh=true`
        : `${this.config.apiBaseUrl}/graph`;

      const data = await this.fetchWithRetry<GraphData>(url);

      onProgress?.({
        phase: 'complete',
        loaded: data.nodes.length,
        total: data.nodes.length,
        percentage: 100
      });

      // Cache result
      if (this.config.cacheEnabled) {
        this.cache.set(cacheKey, { data, timestamp: Date.now() });
      }

      return data;

    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new Error('Data loading aborted');
      }
      throw error;
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Load graph data in chunks (for very large datasets)
   */
  async loadGraphChunked(
    onProgress?: ProgressCallback
  ): Promise<GraphData> {
    this.abortController = new AbortController();

    try {
      // First, get metadata
      onProgress?.({
        phase: 'metadata',
        loaded: 0,
        total: 0,
        percentage: 0
      });

      const metadata = await this.fetchWithRetry<{
        totalNodes: number;
        totalEdges: number;
      }>(`${this.config.apiBaseUrl}/graph/metadata`);

      const { totalNodes, totalEdges } = metadata;
      const nodes: GraphNode[] = [];
      const edges: GraphEdge[] = [];

      // Load nodes in chunks
      const nodeChunks = Math.ceil(totalNodes / this.config.chunkSize);
      for (let i = 0; i < nodeChunks; i++) {
        const offset = i * this.config.chunkSize;
        const limit = Math.min(this.config.chunkSize, totalNodes - offset);

        const chunk = await this.fetchWithRetry<{ nodes: GraphNode[] }>(
          `${this.config.apiBaseUrl}/graph/nodes?offset=${offset}&limit=${limit}`
        );

        nodes.push(...chunk.nodes);

        onProgress?.({
          phase: 'nodes',
          loaded: nodes.length,
          total: totalNodes,
          percentage: (nodes.length / totalNodes) * 50
        });
      }

      // Load edges in chunks
      const edgeChunks = Math.ceil(totalEdges / this.config.chunkSize);
      for (let i = 0; i < edgeChunks; i++) {
        const offset = i * this.config.chunkSize;
        const limit = Math.min(this.config.chunkSize, totalEdges - offset);

        const chunk = await this.fetchWithRetry<{ edges: GraphEdge[] }>(
          `${this.config.apiBaseUrl}/graph/edges?offset=${offset}&limit=${limit}`
        );

        edges.push(...chunk.edges);

        onProgress?.({
          phase: 'edges',
          loaded: edges.length,
          total: totalEdges,
          percentage: 50 + (edges.length / totalEdges) * 50
        });
      }

      onProgress?.({
        phase: 'complete',
        loaded: nodes.length + edges.length,
        total: totalNodes + totalEdges,
        percentage: 100
      });

      return {
        nodes,
        edges,
        meta: {
          totalNodes,
          totalEdges
        }
      };

    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new Error('Data loading aborted');
      }
      throw error;
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Load binary position data (Phase 4)
   */
  async loadBinaryPositions(): Promise<Float32Array> {
    const response = await fetch(
      `${this.config.apiBaseUrl}/graph/binary/positions`,
      { signal: this.abortController?.signal }
    );

    if (!response.ok) {
      throw new Error(`Failed to load binary positions: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    return new Float32Array(buffer);
  }

  /**
   * Load binary edge data (Phase 4)
   */
  async loadBinaryEdges(): Promise<Uint32Array> {
    const response = await fetch(
      `${this.config.apiBaseUrl}/graph/binary/edges`,
      { signal: this.abortController?.signal }
    );

    if (!response.ok) {
      throw new Error(`Failed to load binary edges: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    return new Uint32Array(buffer);
  }

  /**
   * Search for nodes
   */
  async search(query: string, limit = 20): Promise<{
    query: string;
    total: number;
    results: Array<{
      id: string | number;
      key: string;
      namespace: string;
      preview: string;
      score: number;
    }>;
  }> {
    return this.fetchWithRetry(
      `${this.config.apiBaseUrl}/search?q=${encodeURIComponent(query)}&limit=${limit}`
    );
  }

  /**
   * Fetch with retry logic
   */
  private async fetchWithRetry<T>(
    url: string,
    attempt = 1
  ): Promise<T> {
    try {
      const response = await fetch(url, {
        signal: this.abortController?.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();

    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw error;
      }

      if (attempt < this.config.maxRetries) {
        console.warn(`DataLoader: Retry ${attempt}/${this.config.maxRetries} for ${url}`);
        await new Promise(resolve =>
          setTimeout(resolve, this.config.retryDelay * attempt)
        );
        return this.fetchWithRetry(url, attempt + 1);
      }

      throw error;
    }
  }

  /**
   * Abort current loading operation
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    entries: number;
    keys: string[];
  } {
    return {
      entries: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<LoaderConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
