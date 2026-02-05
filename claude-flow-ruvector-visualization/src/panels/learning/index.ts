/**
 * Self-Learning Visualization Panels
 *
 * This module exports all learning-related dashboard panels for the
 * Claude Flow V3 self-learning system visualization.
 */

// Real-time learning velocity chart
export { LearningVelocityPanel } from './LearningVelocityPanel';

// SONA compression ratio visualization
export { SONACompressionPanel } from './SONACompressionPanel';

// State->Action->Reward flow diagram (Sankey)
export { TrajectoryFlowPanel } from './TrajectoryFlowPanel';

// t-SNE projection of embeddings
export { EmbeddingScatterPanel } from './EmbeddingScatterPanel';

// Hook execution timeline
export { HookTimelinePanel } from './HookTimelinePanel';

// Agent spawn/dependency graph
export { AgentCoordinationPanel } from './AgentCoordinationPanel';

// Search quality metrics (recall@k, latency)
export { MemorySearchMetricsPanel } from './MemorySearchMetricsPanel';
