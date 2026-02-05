# @ruvector/edge-net -- Complete Reference

> **Version:** v0.7 | **Generated:** 2026-01-31 | **Package:** @ruvector/edge-net 0.1.1

---

## Contents

- [Package Identity](#1-package-identity)
  - [Exports](#exports)
  - [CLI Binaries](#cli-binaries)
- [What edge-net IS](#2-what-edge-net-is)
- [Relationship to Other Edge Packages](#3-relationship-to-other-edge-packages)
- [CLI Commands](#4-cli-commands)
  - [npm script shortcuts](#npm-script-shortcuts)
- [WASM Classes by Domain](#5-wasm-classes-by-domain)
  - [Network and Node](#51-network-and-node)
  - [Cryptographic Identity / Pi-Key System](#52-cryptographic-identity--pi-key-system)
  - [Economic System](#53-economic-system)
  - [Security](#54-security)
  - [Consensus and Coherence](#55-consensus-and-coherence)
  - [AI/ML](#56-aiml)
  - [Task Execution](#57-task-execution)
  - [Reputation](#58-reputation)
  - [MCP Integration](#59-mcp-integration)
  - [Routing](#510-routing)
  - [Standalone Function](#standalone-function)
- [JS Modules](#6-js-modules)
  - [JS-only Classes (from agents.js)](#js-only-classes-from-agentsjs)
  - [JS-only Classes (from networks.js)](#js-only-classes-from-networksjs)
- [Feature Flags](#7-feature-flags)
  - [Building with feature flags](#building-with-feature-flags)
  - [Capabilities enabled by feature flags](#capabilities-enabled-by-feature-flags)
- [Appendix: Quick Usage](#appendix-quick-usage)
  - [Browser](#browser)
  - [Node.js CLI](#nodejs-cli)
  - [Programmatic (Node.js)](#programmatic-nodejs)
- [Appendix: Class Count Summary](#appendix-class-count-summary)

---

## 1. Package Identity

| Field | Value |
|-------|-------|
| **Name** | `@ruvector/edge-net` |
| **Version** | `0.1.1` |
| **License** | MIT |
| **Module type** | ESM (`"type": "module"`) |
| **Main entry** | `ruvector_edge_net.js` |
| **Types** | `ruvector_edge_net.d.ts` |
| **WASM binary** | `ruvector_edge_net_bg.wasm` (1.13 MB) |
| **Node.js** | `>=18.0.0` |
| **Repository** | `https://github.com/ruvnet/ruvector` |
| **Author** | RuVector Team `<team@ruvector.dev>` |
| **Total classes** | 65 exported classes, 2 enums, 1 standalone function |

### Exports

```jsonc
{
  ".":      { "import": "./ruvector_edge_net.js", "types": "./ruvector_edge_net.d.ts" },
  "./wasm": { "import": "./ruvector_edge_net_bg.wasm" }
}
```

### CLI Binaries

| Binary | Target |
|--------|--------|
| `edge-net` | `./cli.js` |
| `ruvector-edge` | `./cli.js` (alias) |
| `edge-net-join` | `./join.js` |

---

## 2. What edge-net IS

`@ruvector/edge-net` is a distributed compute intelligence network compiled to WebAssembly from ~36,500 lines of Rust. Browser participants contribute idle CPU cycles to a P2P collective and earn rUv (Resource Utility Voucher) credits in return. The package implements federated learning with Byzantine fault tolerance, differential privacy, gradient gossip for model training without sharing raw data, entropy-based swarm consensus, HNSW vector indexing (150x speedup), a QDAG cryptographic ledger, Pi-Key Ed25519 identity system, MCP server integration, adversarial security with Q-learning adaptation, and stigmergy-based task routing -- all running entirely in-browser or Node.js with zero native dependencies.

---

## 3. Relationship to Other Edge Packages

| Property | `@ruvector/edge` | `@ruvector/edge-full` | `@ruvector/edge-net` |
|----------|-------------------|------------------------|----------------------|
| **Version** | 0.1.9 | 0.1.0 | 0.1.1 |
| **WASM size** | 364 KB | N/A (multi-module) | 1.13 MB |
| **Focus** | Core AI primitives (HNSW, crypto, neural, P2P) | Full toolkit (graph DB, SQL, SPARQL, Cypher, ONNX) | Distributed compute network with economics |
| **Classes** | ~20 | Multi-package (dag, graph, onnx, rvlite, sona) | 65 |
| **Economics** | No | No | Yes -- rUv credits, staking, rewards, QDAG ledger |
| **Identity** | Basic | Basic | Pi-Key system (40-byte Ed25519) |
| **Consensus** | No | No | Yes -- entropy consensus, swarm intelligence |
| **Security** | Basic | Basic | Adaptive Q-learning, adversarial simulator, Sybil defense |
| **MCP** | No | No | Yes -- WasmMcpServer, transport, broadcast |

---

## 4. CLI Commands

```
npx @ruvector/edge-net <command> [options]
```

| Command | Description | Notable flags |
|---------|-------------|---------------|
| `start` | Start an edge-net node (lightweight mode in CLI) | -- |
| `join` | Join network with identity (multi-contributor) | `--generate`, `--key <hex>`, `--site <id>`, `--export`, `--import`, `--password`, `--status`, `--history`, `--list`, `--peers` |
| `join` (network) | Multi-network management | `--networks`, `--discover`, `--network <id>`, `--create-network`, `--network-type`, `--network-desc`, `--switch <id>`, `--invite <code>` |
| `benchmark` | Run WASM performance benchmarks | -- |
| `info` | Show package/WASM/environment info | -- |
| `demo` | Run interactive demonstration | -- |
| `test` | Test WASM module loading | -- |
| `help` | Show help | `--help`, `-h` |

### npm script shortcuts

| Script | Command |
|--------|---------|
| `npm start` | `node cli.js start` |
| `npm run benchmark` | `node cli.js benchmark` |
| `npm run join` | `node join.js` |
| `npm run join:generate` | `node join.js --generate` |
| `npm run network` | `node network.js stats` |
| `npm run peers` | `node join.js --peers` |
| `npm run history` | `node join.js --history` |

---

## 5. WASM Classes by Domain

All classes expose `free(): void` and `[Symbol.dispose](): void` for deterministic WASM memory cleanup. These are omitted from the tables below.

---

### 5.1 Network and Node

| Class | Constructor | Key Methods |
|-------|-------------|-------------|
| **EdgeNetConfig** | `(site_id: string)` | `cpuLimit(limit: number): EdgeNetConfig`, `memoryLimit(bytes: number): EdgeNetConfig`, `minIdleTime(ms: number): EdgeNetConfig`, `respectBattery(respect: boolean): EdgeNetConfig`, `addRelay(url: string): EdgeNetConfig`, `build(): EdgeNetNode` |
| **EdgeNetNode** | `(site_id: string, config?: NodeConfig \| null)` | `start()`, `pause()`, `resume()`, `disconnect()`, `nodeId(): string`, `isIdle(): boolean`, `getStats(): NodeStats`, `submitTask(task_type, payload, max_credits): Promise<any>`, `processNextTask(): Promise<boolean>`, `ruvBalance(): bigint`, `creditBalance(): bigint`, `getMultiplier(): number`, `getNetworkFitness(): number`, `getEconomicHealth(): string`, `getOptimalPeers(count): string[]`, `recordTaskRouting(task_type, node_id, latency_ms, success)`, `recordPerformance(success_rate, throughput)`, `shouldReplicate(): boolean`, `getRecommendedConfig(): string`, `runSecurityAudit(): string`, `getMerkleRoot(): string`, `getConflictCount(): number`, `getQuarantinedCount(): number`, `canUseClaim(claim_id): boolean`, `processEpoch()`, `getTreasury(): bigint`, `getProtocolFund(): bigint`, `isSelfSustaining(active_nodes, daily_tasks): boolean`, `isStreamHealthy(): boolean`, `getFounderCount(): number`, `checkEvents(): string`, `getMotivation(): string`, `getThemedStatus(node_count): string`, `getThrottle(): number`, `getCapabilities(): any`, `getCapabilitiesSummary(): any`, `stepCapabilities(dt: number)`, `recordPeerInteraction(peer_id, success_rate)`, `getCoherenceStats(): string`, `getCoherenceEventCount(): number`, `getClaimQuarantineLevel(claim_id): number`, `getLearningStats(): string`, `getOptimizationStats(): string`, `getPatternCount(): number`, `storePattern(pattern_json): number`, `lookupPatterns(query_json, k): string`, `prunePatterns(min_usage, min_confidence): number`, `recordLearningTrajectory(trajectory_json): boolean`, `getTrajectoryCount(): number`, `getEnergyEfficiency(seq_len, hidden_dim): number` |
| **EdgeNetNode** (exotic) | -- | `enableTimeCrystal(oscillators): boolean`, `getTimeCrystalSync(): number`, `enableNAO(quorum): boolean`, `proposeNAO(action): string`, `voteNAO(proposal_id, weight): boolean`, `enableMicroLoRA(rank): boolean`, `enableHDC(): boolean`, `enableWTA(num_neurons): boolean`, `enableBTSP(input_dim): boolean`, `enableMorphogenetic(size): boolean`, `enableGlobalWorkspace(capacity): boolean` |
| **NodeConfig** | private constructor (built by EdgeNetConfig) | Fields: `cpu_limit: number`, `memory_limit: number`, `bandwidth_limit: number`, `min_idle_time: number`, `respect_battery: boolean` |
| **NodeStats** | private constructor (returned by EdgeNetNode.getStats) | Fields: `ruv_earned: bigint`, `ruv_spent: bigint`, `tasks_completed: bigint`, `tasks_submitted: bigint`, `uptime_seconds: bigint`, `reputation: number`, `multiplier: number`, `celebration_boost: number` |
| **WasmNetworkManager** | `(node_id: string)` | `peerCount(): number`, `activePeerCount(): number`, `isConnected(): boolean`, `registerPeer(node_id, pubkey, capabilities, stake)`, `selectWorkers(capability, count): string[]`, `updateReputation(node_id, delta)`, `getPeersWithCapability(capability): string[]`, `addRelay(url)` |
| **WasmNodeIdentity** | `static generate(site_id: string): WasmNodeIdentity` | `nodeId(): string`, `siteId(): string`, `sign(message): Uint8Array`, `verify(message, signature): boolean`, `publicKeyHex(): string`, `publicKeyBytes(): Uint8Array`, `exportSecretKey(password): Uint8Array`, `static importSecretKey(encrypted, password, site_id)`, `static fromSecretKey(secret_key, site_id)`, `setFingerprint(fingerprint)`, `getFingerprint(): string \| undefined`, `static verifyFrom(public_key, message, signature): boolean` |
| **NetworkTopology** | `()` | `registerNode(node_id, capabilities: Float32Array)`, `getOptimalPeers(node_id, count): string[]`, `updateConnection(from, to, success_rate)` |
| **NetworkEvents** | `()` | `getMotivation(balance: bigint): string`, `getThemedStatus(node_count, total_ruv): string`, `checkMilestones(balance, node_id): string`, `checkActiveEvents(): string`, `getCelebrationBoost(): number`, `checkDiscovery(action, node_id): string \| undefined`, `getSpecialArt(): string \| undefined`, `setCurrentTime(timestamp)` |
| **NetworkLearning** | `()` | `storePattern(pattern_json): number`, `lookupPatterns(query_json, k): string`, `patternCount(): number`, `prune(min_usage, min_confidence): number`, `recordTrajectory(trajectory_json): boolean`, `trajectoryCount(): number`, `getEnergyRatio(seq_len, hidden_dim): number`, `getStats(): string` |
| **WasmIdleDetector** | `(max_cpu: number, min_idle_time: number)` | `start()`, `stop()`, `pause()`, `resume()`, `isIdle(): boolean`, `shouldWork(): boolean`, `getThrottle(): number`, `recordInteraction()`, `setBatteryStatus(on_battery)`, `updateFps(fps)`, `getStatus(): any` |
| **BrowserFingerprint** | private constructor | `static generate(): Promise<string>` |
| **EventLog** | `()` | `getRoot(): string`, `len(): number`, `totalEvents(): number`, `isEmpty(): boolean` |
| **EvolutionEngine** | `()` | `recordPerformance(node_id, success_rate, throughput)`, `shouldReplicate(node_id): boolean`, `getNetworkFitness(): number`, `getRecommendedConfig(): string`, `evolve()` |
| **OptimizationEngine** | `()` | `recordRouting(task_type, node_id, latency_ms, success)`, `selectOptimalNode(task_type, candidates): string`, `getStats(): string` |
| **GenesisSunset** | `()` | `getCurrentPhase(): number`, `updateNodeCount(count): number`, `isSelfSustaining(): boolean`, `canRetire(): boolean`, `isReadOnly(): boolean`, `shouldAcceptConnections(): boolean`, `registerGenesisNode(node_id)`, `getStatus(): string` |
| **AuditLog** | `()` | `log(event_type, node_id, details, severity)`, `getEventsForNode(node_id): number`, `getEventsBySeverity(min_severity): number`, `exportEvents(): string` |
| **ContributionStream** | `()` | `isHealthy(): boolean`, `processFees(total_fees, epoch): bigint`, `getTotalDistributed(): bigint` |

---

### 5.2 Cryptographic Identity / Pi-Key System

| Class | Constructor | Key Methods |
|-------|-------------|-------------|
| **PiKey** | `(genesis_seed?: Uint8Array \| null)` | `getIdentity(): Uint8Array` (40 bytes), `getIdentityHex(): string`, `getShortId(): string`, `getPublicKey(): Uint8Array` (32 bytes), `getGenesisFingerprint(): Uint8Array` (21 bytes), `sign(data): Uint8Array`, `verify(data, signature, public_key): boolean`, `verifyPiMagic(): boolean`, `createEncryptedBackup(password): Uint8Array`, `static restoreFromBackup(backup, password): PiKey`, `exportCompact(): Uint8Array` (61 bytes), `getStats(): string` |
| **SessionKey** | `(parent: PiKey, ttl_seconds: number)` | `getId(): Uint8Array` (34 bytes, e-sized), `getIdHex(): string`, `isExpired(): boolean`, `getParentIdentity(): Uint8Array`, `encrypt(plaintext): Uint8Array`, `decrypt(data): Uint8Array` |
| **GenesisKey** | `(creator: PiKey, epoch: number)` | `getId(): Uint8Array` (21 bytes, phi-sized), `getIdHex(): string`, `exportUltraCompact(): Uint8Array`, `verify(creator_public_key): boolean`, `getEpoch(): number` |
| **FoundingRegistry** | `()` | `registerContributor(id, category, weight)`, `getFounderCount(): number`, `processEpoch(current_epoch, available_amount): any[]`, `calculateVested(current_epoch, pool_balance): bigint` |

**Key sizes (mathematical constants)**:
- Pi-Key identity: 314 bits = 40 bytes (pi)
- Session key: 271 bits = 34 bytes (e / Euler's number)
- Genesis fingerprint: 161 bits = 21 bytes (phi / golden ratio)

**Cryptographic primitives**: Ed25519 signing, Argon2id KDF (64MB, 3 iterations), AES-256-GCM authenticated encryption, SHA-256 hashing.

---

### 5.3 Economic System

| Class | Constructor | Key Methods |
|-------|-------------|-------------|
| **EconomicEngine** | `()` | `getHealth(): EconomicHealth`, `getTreasury(): bigint`, `getProtocolFund(): bigint`, `advanceEpoch()`, `processReward(base_amount, multiplier): RewardDistribution`, `isSelfSustaining(active_nodes, daily_tasks): boolean` |
| **EconomicHealth** | private constructor | Fields: `velocity: number`, `utilization: number`, `growth_rate: number`, `stability: number` |
| **WasmCreditLedger** | `(node_id: string)` | `balance(): bigint`, `credit(amount, reason)`, `deduct(amount)`, `totalEarned(): bigint`, `totalSpent(): bigint`, `stake(amount)`, `unstake(amount)`, `stakedAmount(): bigint`, `slash(amount): bigint`, `currentMultiplier(): number`, `networkCompute(): number`, `updateNetworkCompute(hours)`, `merge(other_earned, other_spent)` (CRDT), `exportEarned(): Uint8Array`, `exportSpent(): Uint8Array` |
| **QDAGLedger** | `()` | `createGenesis(initial_supply, founder_pubkey): Uint8Array`, `createTransaction(sender_id, recipient_id, amount, tx_type, sender_privkey, sender_pubkey): Uint8Array`, `balance(node_id): bigint`, `stakedAmount(node_id): bigint`, `totalSupply(): bigint`, `transactionCount(): number`, `tipCount(): number`, `exportState(): Uint8Array`, `importState(state_bytes): number` |
| **RewardDistribution** | private constructor | Fields: `total: bigint`, `contributor_share: bigint`, `treasury_share: bigint`, `protocol_share: bigint`, `founder_share: bigint` |
| **RewardManager** | `(default_vesting_ms: bigint)` | `pendingCount(): number`, `pendingAmount(): bigint`, `claimableAmount(node_id): bigint` |
| **StakeManager** | `(min_stake: bigint)` | `stakerCount(): number`, `totalStaked(): bigint`, `getMinStake(): bigint`, `getStake(node_id): bigint`, `hasSufficientStake(node_id): boolean` |
| **RacEconomicEngine** | `()` | `canParticipate(node_id: Uint8Array): boolean`, `getCombinedScore(node_id: Uint8Array): number`, `getSummary(): string` |

---

### 5.4 Security

| Class | Constructor | Key Methods |
|-------|-------------|-------------|
| **AdaptiveSecurity** | `()` | `chooseAction(state, available_actions): string`, `learn(state, action, reward, next_state)`, `detectAttack(features: Float32Array): number`, `recordAttackPattern(pattern_type, features, severity)`, `updateNetworkHealth(active_nodes, suspicious_nodes, attacks_hour, false_positives, avg_response_ms)`, `exportPatterns(): Uint8Array`, `importPatterns(data)`, `getSecurityLevel(): number`, `getMinReputation(): number`, `getRateLimitMax(): number`, `getRateLimitWindow(): bigint`, `getSpotCheckProbability(): number`, `getStats(): string` |
| **AdversarialSimulator** | `()` | `simulateDDoS(requests_per_second, duration_ms): string`, `simulateSybil(fake_nodes, same_fingerprint): string`, `simulateByzantine(byzantine_nodes, total_nodes): string`, `simulateFreeRiding(consumption_rate, contribution_rate): string`, `simulateDoubleSpend(amount, concurrent_targets): string`, `simulateResultTampering(tamper_percentage): string`, `runSecurityAudit(): string`, `enableChaosMode(enabled)`, `generateChaosEvent(): string \| undefined`, `getDefenceMetrics(): string`, `getRecommendations(): string` |
| **ByzantineDetector** | `(max_magnitude: number, zscore_threshold: number)` | `getMaxMagnitude(): number` |
| **SybilDefense** | `()` | `registerNode(node_id, fingerprint): boolean`, `getSybilScore(node_id): number`, `isSuspectedSybil(node_id): boolean` |
| **RateLimiter** | `(window_ms: bigint, max_requests: number)` | `checkAllowed(node_id): boolean`, `getCount(node_id): number`, `reset()` |
| **SpotChecker** | `(check_probability: number)` | `shouldCheck(): boolean`, `addChallenge(task_type, input, expected_output)`, `getChallenge(task_type): Uint8Array \| undefined`, `verifyResponse(input_hash, output): boolean` |
| **QuarantineManager** | `()` | `quarantinedCount(): number`, `canUse(claim_id): boolean`, `getLevel(claim_id): number`, `setLevel(claim_id, level)` |
| **WitnessTracker** | `(min_witnesses: number)` | `witnessCount(claim_id): number`, `witnessConfidence(claim_id): number`, `hasSufficientWitnesses(claim_id): boolean` |

---

### 5.5 Consensus and Coherence

| Class | Constructor | Key Methods |
|-------|-------------|-------------|
| **CoherenceEngine** | `()` | `getMerkleRoot(): string`, `eventCount(): number`, `conflictCount(): number`, `quarantinedCount(): number`, `hasDrifted(context_hex): boolean`, `getDrift(context_hex): number`, `canUseClaim(claim_id): boolean`, `witnessCount(claim_id): number`, `hasSufficientWitnesses(claim_id): boolean`, `getQuarantineLevel(claim_id): number`, `getStats(): string` |
| **EntropyConsensus** | `()` or `static withThreshold(threshold)` | `setBelief(decision_id, probability)`, `set_belief_raw(decision_id, probability)`, `finalize_beliefs()`, `entropy(): number`, `converged(): boolean`, `getDecision(): bigint \| undefined`, `getRounds(): number`, `getTemperature(): number`, `getEntropyThreshold(): number`, `getEntropyHistory(): string`, `hasTimedOut(): boolean`, `optionCount(): number`, `reset()`, `getStats(): string` |
| **DriftTracker** | `(drift_threshold: number)` | `hasDrifted(context_hex): boolean`, `getDrift(context_hex): number`, `getDriftedContexts(): string` |
| **ModelConsensusManager** | `(min_witnesses: number)` | `modelCount(): number`, `disputeCount(): number`, `quarantinedUpdateCount(): number`, `getStats(): string` |

---

### 5.6 AI/ML

| Class | Constructor | Key Methods |
|-------|-------------|-------------|
| **FederatedModel** | `(dimension: number, learning_rate: number, momentum: number)` | `getDimension(): number`, `getParameters(): Float32Array`, `setParameters(params)`, `applyGradients(gradients)`, `setLearningRate(lr)`, `setLocalEpochs(epochs)`, `getRound(): bigint` |
| **GradientGossip** | `(local_peer_id: Uint8Array, dimension: number, k_ratio: number)` | `setLocalGradients(gradients)`, `getAggregatedGradients(): Float32Array`, `advanceRound(): bigint`, `getCurrentRound(): bigint`, `peerCount(): number`, `pruneStale(): number`, `configureDifferentialPrivacy(epsilon, sensitivity)`, `setDPEnabled(enabled)`, `setModelHash(hash)`, `getDimension(): number`, `getCompressionRatio(): number`, `getStats(): string` |
| **DifferentialPrivacy** | `(epsilon: number, sensitivity: number)` | `isEnabled(): boolean`, `getEpsilon(): number`, `setEnabled(enabled)` |
| **TopKSparsifier** | `(k_ratio: number)` | `getCompressionRatio(): number`, `getErrorBufferSize(): number`, `resetErrorFeedback()` |
| **ReasoningBank** | `()` | `store(pattern_json): number`, `lookup(query_json, k): string`, `count(): number`, `prune(min_usage, min_confidence): number`, `getStats(): string` |
| **CollectiveMemory** | `(node_id: string)` | `search(query_json, k): string`, `consolidate(): number`, `hasPattern(pattern_id): boolean`, `patternCount(): number`, `queueSize(): number`, `getStats(): string` |
| **SwarmIntelligence** | `(node_id: string)` | `startConsensus(topic, threshold)`, `setBelief(topic, decision_id, probability)`, `negotiateBeliefs(topic, beliefs_json): boolean`, `hasConsensus(topic): boolean`, `getConsensusDecision(topic): bigint \| undefined`, `addPattern(pattern_json): boolean`, `searchPatterns(query_json, k): string`, `patternCount(): number`, `consolidate(): number`, `replay(): number`, `queueSize(): number`, `nodeId(): string`, `getStats(): string` |
| **MultiHeadAttention** | `(dim: number, num_heads: number)` | `dim(): number`, `numHeads(): number` |
| **SpikeDrivenAttention** | `()` or `static withConfig(threshold, steps, refractory)` | `energyRatio(seq_len, hidden_dim): number` |
| **TrajectoryTracker** | `(max_size: number)` | `record(trajectory_json): boolean`, `count(): number`, `getStats(): string` |
| **WasmAdapterPool** | `(hidden_dim: number, max_slots: number)` | `getAdapter(task_type): any`, `forward(task_type, input): Float32Array`, `routeToAdapter(task_embedding): any`, `exportAdapter(task_type): Uint8Array`, `importAdapter(task_type, bytes): boolean`, `adapterCount(): number`, `getStats(): any` |
| **WasmCapabilities** | `(node_id: string)` | `step(dt)`, `getCapabilities(): any`, `getSummary(): any`, `enableTimeCrystal(oscillators, period_ms): boolean`, `tickTimeCrystal(): any`, `getTimeCrystalSync(): number`, `isTimeCrystalStable(): boolean`, `enableMicroLoRA(dim, rank): boolean`, `adaptMicroLoRA(operator_type, gradient): boolean`, `applyMicroLoRA(operator_type, input): Float32Array`, `enableNAO(quorum): boolean`, `proposeNAO(action): string`, `voteNAO(proposal_id, weight): boolean`, `executeNAO(proposal_id): boolean`, `addNAOMember(member_id, stake): boolean`, `tickNAO(dt)`, `getNAOSync(): number`, `enableHDC(): boolean`, `storeHDC(key): boolean`, `retrieveHDC(key, threshold): any`, `enableWTA(num_neurons, inhibition, threshold): boolean`, `competeWTA(activations): number`, `enableBTSP(input_dim, time_constant): boolean`, `forwardBTSP(input): number`, `oneShotAssociate(pattern, target): boolean`, `enableMorphogenetic(width, height): boolean`, `growMorphogenetic(rate)`, `pruneMorphogenetic(threshold)`, `differentiateMorphogenetic()`, `getMorphogeneticCellCount(): number`, `getMorphogeneticStats(): any`, `enableGlobalWorkspace(capacity): boolean`, `broadcastToWorkspace(content, salience, source_module): boolean`, `getWorkspaceContents(): any` |
| **WasmStigmergy** | `()` or `static withParams(decay_rate, deposit_rate, evaporation_hours)` | `deposit(task_type, peer_id, success_rate, stake)`, `depositWithOutcome(task_type, peer_id, success, stake)`, `follow(task_type): number`, `shouldAccept(task_type): number`, `evaporate()`, `maybeEvaporate(): boolean`, `getIntensity(task_type): number`, `getSuccessRate(task_type): number`, `getSpecialization(task_type): number`, `updateSpecialization(task_type, success)`, `getBestSpecialization(): string \| undefined`, `getRankedTasks(): string`, `setMinStake(min_stake)`, `exportState(): string`, `merge(peer_state_json): boolean`, `getStats(): string` |

---

### 5.7 Task Execution

| Class | Constructor | Key Methods |
|-------|-------------|-------------|
| **WasmTaskExecutor** | `(max_memory: number)` | `setTaskKey(key: Uint8Array)` |
| **WasmTaskQueue** | private constructor | (internal; no public methods beyond free) |
| **WasmWorkScheduler** | `()` | `tasksThisFrame(throttle): number`, `setPendingTasks(count)`, `recordTaskDuration(duration_ms)` |

### Enums

| Enum | Values |
|------|--------|
| **TaskPriority** | `Low = 0`, `Normal = 1`, `High = 2` |
| **TaskType** | `VectorSearch = 0`, `VectorInsert = 1`, `Embedding = 2`, `SemanticMatch = 3`, `NeuralInference = 4`, `Encryption = 5`, `Compression = 6`, `CustomWasm = 7` |

---

### 5.8 Reputation

| Class | Constructor | Key Methods |
|-------|-------------|-------------|
| **ReputationManager** | `(decay_rate: number, decay_interval_ms: bigint)` | `getReputation(node_id: Uint8Array): number`, `averageReputation(): number`, `hasSufficientReputation(node_id): boolean`, `nodeCount(): number` |
| **ReputationSystem** | `()` | `getReputation(node_id: string): number`, `recordSuccess(node_id)`, `recordFailure(node_id)`, `recordPenalty(node_id, severity)`, `canParticipate(node_id): boolean` |

Note: `ReputationManager` uses `Uint8Array` node IDs (binary); `ReputationSystem` uses `string` node IDs. The former includes decay mechanics; the latter is a simpler success/failure tracker.

---

### 5.9 MCP Integration

| Class | Constructor | Key Methods |
|-------|-------------|-------------|
| **WasmMcpServer** | `()` or `static withConfig(config)` | `handleRequest(request_json): Promise<string>`, `handleRequestJs(request): Promise<any>`, `getServerInfo(): any`, `setIdentity(identity: WasmNodeIdentity)`, `initLearning()` |
| **WasmMcpTransport** | `(worker: Worker)` or `static fromPort(port: MessagePort)` | `init()`, `send(request): Promise<any>`, `close()` |
| **WasmMcpBroadcast** | `(channel_name: string)` | `listen()`, `send(request_json)`, `setServer(server: WasmMcpServer)`, `close()` |
| **WasmMcpWorkerHandler** | `(server: WasmMcpServer)` | `start()` |

---

### 5.10 Routing

| Class | Constructor | Key Methods |
|-------|-------------|-------------|
| **SemanticRouter** | `()` or `static withParams(embedding_dim, semantic_neighbors, random_sample)` | `peerCount(): number`, `activePeerCount(): number`, `topicCount(): number`, `setMyPeerId(peer_id)`, `setMyCapabilities(capabilities: string[])`, `getStats(): string` |
| **RacSemanticRouter** | `()` | `peerCount(): number` |

---

### Standalone Function

| Function | Signature | Purpose |
|----------|-----------|---------|
| `init_panic_hook` | `(): void` | Initialize WASM panic hook for better error messages in console |

---

## 6. JS Modules

JavaScript modules that extend the WASM core with Node.js-side coordination, P2P networking, and persistence.

| Module | Size | Purpose |
|--------|------|---------|
| `ruvector_edge_net.js` | 254 KB | Auto-generated WASM bindings (main entry) |
| `cli.js` | 15 KB | CLI dispatcher (start, join, benchmark, info, demo, test) |
| `join.js` | 46 KB | Multi-contributor join CLI with persistent identity management |
| `agents.js` | 27 KB | Distributed agent system (DistributedAgent, AgentSpawner, WorkerPool, TaskOrchestrator) |
| `real-agents.js` | 42 KB | Real agent execution with WASM integration |
| `real-workflows.js` | 22 KB | Multi-step workflow orchestration |
| `network.js` | 24 KB | NetworkManager: QDAG ledger, peer discovery, contribution recording |
| `networks.js` | 23 KB | MultiNetworkManager, NetworkRegistry, NetworkGenesis: multi-network support |
| `p2p.js` | 20 KB | P2P gossip networking layer |
| `dht.js` | 20 KB | Distributed hash table for peer discovery |
| `credits.js` | 19 KB | rUv credit system JS extensions |
| `ledger.js` | 16 KB | QDAG transaction ledger JS interface |
| `qdag.js` | 17 KB | QDAG data structure implementation |
| `genesis.js` | 24 KB | Genesis block creation and network bootstrap |
| `sync.js` | 24 KB | State synchronization between peers |
| `signaling.js` | 19 KB | WebRTC signaling for peer connections |
| `monitor.js` | 17 KB | Network health monitoring |
| `contribute-daemon.js` | 22 KB | Background contribution daemon |
| `secure-access.js` | 20 KB | Access control and authentication |
| `firebase-setup.js` | 14 KB | Firebase integration for signaling |
| `multi-contributor-test.js` | 17 KB | Multi-contributor test harness |

### JS-only Classes (from agents.js)

| Class | Constructor | Key Methods |
|-------|-------------|-------------|
| **DistributedAgent** | `(options: {type, task, maxRuv, priority, timeout})` | `getInfo()`, `updateProgress(progress, message)`, `log(message)`, `complete(result)`, `fail(error)`, `cancel()` |
| **AgentSpawner** | `(networkManager, options?)` | `spawn(options): Promise<DistributedAgent>`, `findBestNode(agent)`, `handleResult(agentId, result)`, `getAgent(agentId)`, `listAgents(filter)`, `getStats()` |
| **WorkerPool** | `(networkManager, options?)` | `initialize(): Promise<this>`, `execute({task, data, strategy, chunkSize})`, `getStatus()`, `shutdown()` |
| **TaskOrchestrator** | `(agentSpawner, workerPool, options?)` | `createWorkflow(name, steps)`, `executeWorkflow(workflowId, input)`, `getWorkflowStatus(workflowId)`, `listWorkflows()` |

**Agent types defined in agents.js**: researcher (10 rUv), coder (15 rUv), reviewer (12 rUv), tester (10 rUv), analyst (8 rUv), optimizer (15 rUv), coordinator (20 rUv), embedder (5 rUv).

### JS-only Classes (from networks.js)

| Class | Constructor | Key Methods |
|-------|-------------|-------------|
| **NetworkGenesis** | `(options?)` | `computeNetworkId(): string`, `createSignedGenesis(signFn)`, `generateInviteCode()` |
| **NetworkRegistry** | `()` | `load()`, `save()`, `createNetwork(options, identity)`, `joinNetwork(networkId, inviteCode)`, `discoverNetworks()`, `setActiveNetwork(networkId)`, `getNetwork(networkId)`, `getActiveNetwork()`, `getJoinedNetworks()`, `getNetworkStats(networkId)`, `listNetworks()` |
| **MultiNetworkManager** | `(identity)` | `initialize()`, `createNetwork(options)`, `discoverNetworks()`, `joinNetwork(networkId, inviteCode)`, `switchNetwork(networkId)`, `showStatus()`, `getActiveNetworkDir()` |

**Network types**: `public` (open join), `private` (invite code required), `consortium` (member approval).

**Well-known networks**: `mainnet` (primary public compute), `testnet` (testing/development).

---

## 7. Feature Flags

Build-time Rust feature flags that enable additional WASM capabilities.

| Flag | Description | Dependencies |
|------|-------------|--------------|
| `exotic` | Time Crystal coordination, Neural Autonomous Organization (NAO), Morphogenetic Networks | `ruvector-exotic-wasm` |
| `learning-enhanced` | MicroLoRA adapter pool, BTSP one-shot learning, HDC hyperdimensional computing, WTA winner-take-all, Global Workspace attention | `ruvector-learning-wasm`, `ruvector-nervous-system-wasm` |
| `economy-enhanced` | Enhanced CRDT credits | `ruvector-economy-wasm` |
| `exotic-full` | All exotic capabilities combined | All above |

### Building with feature flags

```bash
# Standard build (core 65 classes)
wasm-pack build --target web --release --out-dir pkg

# With exotic AI capabilities
wasm-pack build --target web --release --out-dir pkg -- --features exotic

# With learning-enhanced capabilities
wasm-pack build --target web --release --out-dir pkg -- --features learning-enhanced

# All capabilities
wasm-pack build --target web --release --out-dir pkg -- --features exotic-full
```

### Capabilities enabled by feature flags

| Capability | Flag | EdgeNetNode method | Performance |
|------------|------|--------------------|-------------|
| Time Crystal | `exotic` | `enableTimeCrystal(oscillators)` | Period-doubled oscillation sync |
| NAO governance | `exotic` | `enableNAO(quorum)` | Stake-weighted quadratic voting |
| Morphogenetic | `exotic` | `enableMorphogenetic(size)` | Self-organizing network topology |
| MicroLoRA | `learning-enhanced` | `enableMicroLoRA(rank)` | <50us rank-1 forward, 2236+ ops/sec |
| BTSP | `learning-enhanced` | `enableBTSP(input_dim)` | One-shot pattern association |
| HDC | `learning-enhanced` | `enableHDC()` | 10,000-bit binary hypervectors |
| WTA | `learning-enhanced` | `enableWTA(num_neurons)` | <1us instant decisions |
| Global Workspace | `learning-enhanced` | `enableGlobalWorkspace(capacity)` | Attention broadcasting |

---

## Appendix: Quick Usage

### Browser

```javascript
import init, { EdgeNetNode, EdgeNetConfig } from '@ruvector/edge-net';

await init();
const node = new EdgeNetConfig('my-site').cpuLimit(0.3).build();
node.start();
console.log(`Node: ${node.nodeId()}, Balance: ${node.ruvBalance()} rUv`);
```

### Node.js CLI

```bash
# Start a node
npx @ruvector/edge-net start

# Join with persistent identity
npx @ruvector/edge-net join --site my-contributor

# Benchmark WASM performance
npx @ruvector/edge-net benchmark

# Discover and join networks
npx @ruvector/edge-net join --discover
npx @ruvector/edge-net join --create-network "ML Research" --network-type public
```

### Programmatic (Node.js)

```javascript
const { createRequire } = await import('module');
const require = createRequire(import.meta.url);
const wasm = require('@ruvector/edge-net/node/ruvector_edge_net.cjs');

const detector = new wasm.ByzantineDetector(0.5, 2.0);
const model = new wasm.FederatedModel(100, 0.01, 0.9);
const dp = new wasm.DifferentialPrivacy(1.0, 0.001);
const piKey = new wasm.PiKey();
console.log(`Identity: ${piKey.getShortId()}`);
```

---

## Appendix: Class Count Summary

| Domain | Count | Representative Classes |
|--------|-------|----------------------|
| Network and Node | 15 | EdgeNetNode, EdgeNetConfig, WasmNetworkManager, WasmNodeIdentity |
| Cryptographic Identity | 4 | PiKey, SessionKey, GenesisKey, FoundingRegistry |
| Economic System | 7 | EconomicEngine, WasmCreditLedger, QDAGLedger, StakeManager, RewardManager |
| Security | 8 | AdaptiveSecurity, AdversarialSimulator, ByzantineDetector, SybilDefense, RateLimiter |
| Consensus and Coherence | 4 | CoherenceEngine, EntropyConsensus, DriftTracker, ModelConsensusManager |
| AI/ML | 13 | FederatedModel, GradientGossip, SwarmIntelligence, WasmAdapterPool, WasmCapabilities |
| Task Execution | 3 + 2 enums | WasmTaskExecutor, WasmTaskQueue, WasmWorkScheduler |
| Reputation | 2 | ReputationManager, ReputationSystem |
| MCP Integration | 4 | WasmMcpServer, WasmMcpTransport, WasmMcpBroadcast, WasmMcpWorkerHandler |
| Routing | 2 | SemanticRouter, RacSemanticRouter |
| **Total** | **65 classes + 2 enums** | -- |

---

*End of reference. Generated from source at `/mnt/data/dev/CFV3/ruvector-upstream/examples/edge-net/pkg/`.*
