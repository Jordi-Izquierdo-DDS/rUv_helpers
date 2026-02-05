'use strict';

const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

const DB_PATH = path.resolve(__dirname, '../../.ruvector/intelligence.db');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rid(len = 8) {
  return crypto.randomBytes(len).toString('hex').slice(0, len);
}

function randomFloat(min, max) {
  return min + Math.random() * (max - min);
}

function randomInt(min, max) {
  return Math.floor(randomFloat(min, max + 1));
}

function pick(arr) {
  return arr[randomInt(0, arr.length - 1)];
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

/** Generate a random 384-dimensional Float32 embedding normalised to unit length. */
function makeEmbedding() {
  const dim = 384;
  const arr = new Float32Array(dim);
  let sumSq = 0;
  for (let i = 0; i < dim; i++) {
    // Box-Muller for normally distributed components
    const u1 = Math.random() || 1e-12;
    const u2 = Math.random();
    arr[i] = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    sumSq += arr[i] * arr[i];
  }
  const norm = Math.sqrt(sumSq);
  for (let i = 0; i < dim; i++) arr[i] /= norm;
  return Buffer.from(arr.buffer);
}

// ---------------------------------------------------------------------------
// Data generators
// ---------------------------------------------------------------------------

function generateMemories(count) {
  const types = [
    'file_access', 'search_pattern', 'agent_spawn',
    'command_result', 'semantic', 'general',
  ];
  const templates = {
    file_access: [
      'Reading: auth.ts in services/',
      'Reading: DashboardPanels.ts in components/',
      'Writing: server.js — added CORS middleware',
      'Reading: package.json for dependency audit',
      'Reading: tsconfig.json — checking strict mode',
      'Writing: migrations/002_add_users.sql',
      'Reading: README.md for onboarding context',
      'Reading: .env.example for required vars',
      'Writing: utils/hash.ts — bcrypt wrapper',
      'Reading: docker-compose.yml for service topology',
    ],
    search_pattern: [
      'Search: async error handling patterns',
      'Search: React useEffect cleanup patterns',
      'Search: SQL injection prevention',
      'Search: JWT refresh token rotation',
      'Search: WebSocket reconnection strategy',
      'Search: rate limiting middleware express',
      'Search: TypeScript discriminated unions',
      'Search: Node.js worker_threads usage',
    ],
    agent_spawn: [
      'Agent: coder -- implement login flow',
      'Agent: tester -- write integration tests for /api/users',
      'Agent: reviewer -- review PR #42 security changes',
      'Agent: researcher -- investigate memory leak in worker pool',
      'Agent: planner -- break down OAuth2 integration epic',
      'Agent: architect -- design event-sourcing schema',
    ],
    command_result: [
      'npm test -- 47 passed, 0 failed',
      'npm run build -- completed in 3.2s',
      'eslint src/ -- 0 errors, 2 warnings',
      'tsc --noEmit -- success',
      'jest --coverage -- 87% statements',
      'docker build . -- image built 142MB',
    ],
    semantic: [
      'The authentication module uses JWT with RS256 signing',
      'Database migrations are managed via knex with rollback support',
      'CI pipeline runs lint, test, build in parallel stages',
      'Error boundaries wrap every route-level React component',
      'The caching layer uses Redis with 5-minute TTL for session data',
    ],
    general: [
      'Project initialized with TypeScript strict mode',
      'Switched from REST to GraphQL for the admin API',
      'Added Prometheus metrics endpoint at /metrics',
      'Configured Sentry for production error tracking',
      'Set up GitHub Actions for PR checks',
    ],
  };

  const now = nowSec();
  const rows = [];
  for (let i = 0; i < count; i++) {
    const type = pick(types);
    const content = pick(templates[type]);
    const tags = [type, pick(['dev', 'ops', 'security', 'test', 'docs'])];
    rows.push({
      id: `mem-stress-${i}-${rid()}`,
      memory_type: type,
      content,
      embedding: makeEmbedding(),
      metadata: JSON.stringify({
        tags,
        source: pick(['hook', 'cli', 'agent', 'manual']),
        confidence: +randomFloat(0.4, 0.98).toFixed(3),
      }),
      timestamp: now - randomInt(0, 86400), // last 24h
    });
  }
  return rows;
}

function generatePatterns() {
  const states = [
    'edit-file', 'read-file', 'run-test', 'spawn-agent',
    'search-code', 'create-file', 'review-code', 'deploy',
  ];
  const actions = ['coder', 'tester', 'reviewer', 'researcher', 'planner'];
  const now = nowSec();
  const rows = [];
  for (const state of states) {
    const action = pick(actions);
    rows.push({
      key: `${state}|${action}`,
      state,
      action,
      q_value: +randomFloat(0.3, 0.95).toFixed(4),
      visits: randomInt(1, 50),
      last_update: now - randomInt(0, 7200),
    });
  }
  return rows;
}

function generateTrajectories(count) {
  const workflows = [
    { state: 'edit-file', action: 'coder', outcome: 'compiled' },
    { state: 'edit-file', action: 'coder', outcome: 'syntax-error' },
    { state: 'run-test', action: 'tester', outcome: 'all-passed' },
    { state: 'run-test', action: 'tester', outcome: 'failures' },
    { state: 'review-code', action: 'reviewer', outcome: 'approved' },
    { state: 'review-code', action: 'reviewer', outcome: 'changes-requested' },
    { state: 'search-code', action: 'researcher', outcome: 'found' },
    { state: 'search-code', action: 'researcher', outcome: 'no-results' },
    { state: 'spawn-agent', action: 'planner', outcome: 'completed' },
    { state: 'deploy', action: 'coder', outcome: 'success' },
    { state: 'deploy', action: 'coder', outcome: 'rollback' },
    { state: 'create-file', action: 'coder', outcome: 'created' },
    { state: 'read-file', action: 'researcher', outcome: 'cached' },
    { state: 'read-file', action: 'researcher', outcome: 'loaded' },
    { state: 'run-test', action: 'coder', outcome: 'coverage-drop' },
  ];
  const now = nowSec();
  const rows = [];
  for (let i = 0; i < count; i++) {
    const w = pick(workflows);
    const isGood = !['syntax-error', 'failures', 'changes-requested', 'no-results', 'rollback', 'coverage-drop'].includes(w.outcome);
    rows.push({
      id: `traj_stress_${now - randomInt(0, 172800)}_${rid(6)}`,
      state: w.state,
      action: w.action,
      outcome: w.outcome,
      reward: +(isGood ? randomFloat(0.2, 1.0) : randomFloat(-1.0, 0.0)).toFixed(3),
      timestamp: now - randomInt(0, 172800), // last 48h
    });
  }
  return rows;
}

function generateErrors() {
  const now = nowSec();
  return [
    {
      key: 'typescript_compilation_error',
      data: JSON.stringify({
        message: 'TypeScript compilation error',
        details: "TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.",
        file: 'src/services/auth.ts',
        line: 42,
        count: 7,
        lastSeen: now - 1200,
        severity: 'error',
      }),
    },
    {
      key: 'test_failure',
      data: JSON.stringify({
        message: 'Test failure',
        details: 'Expected 200 but received 401 in auth.test.ts',
        suite: 'AuthService',
        count: 3,
        lastSeen: now - 3600,
        severity: 'error',
      }),
    },
    {
      key: 'build_timeout',
      data: JSON.stringify({
        message: 'Build timeout',
        details: 'Build exceeded 120s limit during TypeScript compilation',
        threshold: 120,
        actual: 147,
        count: 2,
        lastSeen: now - 7200,
        severity: 'warning',
      }),
    },
    {
      key: 'import_resolution',
      data: JSON.stringify({
        message: 'Import resolution error',
        details: "Cannot find module '@/utils/crypto' or its corresponding type declarations.",
        file: 'src/controllers/user.controller.ts',
        count: 5,
        lastSeen: now - 900,
        severity: 'error',
      }),
    },
    {
      key: 'memory_limit',
      data: JSON.stringify({
        message: 'Memory limit exceeded',
        details: 'Agent worker exceeded 512MB heap limit during large file analysis',
        heapUsed: 537919488,
        heapLimit: 536870912,
        count: 1,
        lastSeen: now - 14400,
        severity: 'critical',
      }),
    },
    {
      key: 'lint_violation',
      data: JSON.stringify({
        message: 'ESLint critical violation',
        details: 'no-eval rule violation detected in dynamically generated code',
        file: 'src/utils/template.ts',
        rule: 'no-eval',
        count: 1,
        lastSeen: now - 5400,
        severity: 'warning',
      }),
    },
  ];
}

function generateFileSequences() {
  const pairs = [
    ['server.js', 'DashboardPanels.ts'],
    ['main-three.ts', 'index.html'],
    ['auth.service.ts', 'auth.controller.ts'],
    ['auth.controller.ts', 'auth.test.ts'],
    ['user.model.ts', 'user.repository.ts'],
    ['user.repository.ts', 'user.service.ts'],
    ['user.service.ts', 'user.controller.ts'],
    ['package.json', 'tsconfig.json'],
    ['docker-compose.yml', 'Dockerfile'],
    ['README.md', 'CONTRIBUTING.md'],
    ['routes/index.ts', 'middleware/auth.ts'],
    ['middleware/auth.ts', 'utils/jwt.ts'],
    ['utils/jwt.ts', 'config/keys.ts'],
    ['migrations/001_init.sql', 'migrations/002_users.sql'],
    ['components/App.tsx', 'components/Dashboard.tsx'],
    ['components/Dashboard.tsx', 'hooks/useData.ts'],
    ['hooks/useData.ts', 'api/client.ts'],
    ['api/client.ts', 'types/api.d.ts'],
  ];
  return pairs.map(([from_file, to_file]) => ({
    from_file,
    to_file,
    count: randomInt(1, 20),
  }));
}

function generateAgents() {
  const now = nowSec();
  const agents = [
    { name: 'coder', specialization: 'code-generation', tasksCompleted: randomInt(30, 120) },
    { name: 'tester', specialization: 'test-automation', tasksCompleted: randomInt(20, 80) },
    { name: 'reviewer', specialization: 'code-review', tasksCompleted: randomInt(15, 60) },
    { name: 'researcher', specialization: 'information-retrieval', tasksCompleted: randomInt(25, 90) },
    { name: 'architect', specialization: 'system-design', tasksCompleted: randomInt(5, 30) },
    { name: 'planner', specialization: 'task-decomposition', tasksCompleted: randomInt(10, 40) },
    { name: 'security-auditor', specialization: 'security-analysis', tasksCompleted: randomInt(5, 25) },
    { name: 'devops', specialization: 'infrastructure', tasksCompleted: randomInt(8, 35) },
  ];
  return agents.map((a) => ({
    name: a.name,
    data: JSON.stringify({
      tasksCompleted: a.tasksCompleted,
      avgReward: +randomFloat(0.4, 0.92).toFixed(3),
      lastActive: now - randomInt(0, 7200),
      specialization: a.specialization,
      status: pick(['idle', 'active', 'idle', 'idle']),
      memoryUsageMB: randomInt(64, 256),
      uptime: randomInt(600, 86400),
    }),
  }));
}

function generateEdges() {
  const rows = [];
  const now = nowSec();

  // Memory-to-memory edges (semantic similarity)
  for (let i = 0; i < 8; i++) {
    rows.push({
      source: `mem-stress-${i}-src`,
      target: `mem-stress-${i + 10}-tgt`,
      weight: +randomFloat(0.3, 1.0).toFixed(3),
      data: JSON.stringify({
        type: 'semantic-similarity',
        score: +randomFloat(0.5, 0.98).toFixed(3),
        created: now - randomInt(0, 3600),
      }),
    });
  }

  // Memory-to-pattern edges
  const patterns = [
    'edit-file|coder', 'run-test|tester', 'review-code|reviewer',
    'search-code|researcher', 'spawn-agent|planner',
  ];
  for (let i = 0; i < 5; i++) {
    rows.push({
      source: `mem-stress-${i}-link`,
      target: `pattern:${patterns[i]}`,
      weight: +randomFloat(0.4, 0.9).toFixed(3),
      data: JSON.stringify({
        type: 'memory-pattern',
        relevance: +randomFloat(0.5, 0.95).toFixed(3),
        created: now - randomInt(0, 7200),
      }),
    });
  }

  // File-to-file edges (dependency graph)
  const filePairs = [
    ['auth.service.ts', 'auth.controller.ts'],
    ['auth.controller.ts', 'auth.test.ts'],
    ['user.model.ts', 'user.repository.ts'],
    ['user.repository.ts', 'user.service.ts'],
    ['user.service.ts', 'user.controller.ts'],
    ['server.js', 'routes/index.ts'],
    ['routes/index.ts', 'middleware/auth.ts'],
    ['middleware/auth.ts', 'utils/jwt.ts'],
  ];
  for (const [from, to] of filePairs) {
    rows.push({
      source: `file:${from}`,
      target: `file:${to}`,
      weight: +randomFloat(0.5, 1.0).toFixed(3),
      data: JSON.stringify({
        type: 'file-dependency',
        direction: 'imports',
        created: now - randomInt(0, 14400),
      }),
    });
  }

  return rows;
}

function generateStats() {
  return [
    { key: 'total_hook_fires', value: String(randomInt(50, 500)) },
    { key: 'avg_reward', value: randomFloat(0.4, 0.85).toFixed(4) },
    { key: 'total_q_updates', value: String(randomInt(100, 1000)) },
    { key: 'total_agents_spawned', value: String(randomInt(10, 80)) },
    { key: 'cache_hit_rate', value: randomFloat(0.5, 0.95).toFixed(4) },
    { key: 'avg_response_time_ms', value: randomFloat(50, 400).toFixed(1) },
  ];
}

function generateNeuralPatterns(count) {
  const categories = ['routing', 'optimization', 'security', 'testing', 'deployment'];
  const contentByCategory = {
    routing: [
      'Route edit requests for .ts files to coder agent with 0.85 confidence',
      'Route security-related changes to security-auditor before merge',
      'Prefer researcher agent for documentation tasks over coder',
    ],
    optimization: [
      'Batch small file reads into single operation when within same directory',
      'Cache frequently accessed config files for 5-minute TTL',
      'Use streaming for files larger than 1MB instead of full read',
    ],
    security: [
      'Flag any file containing process.env access for review',
      'Reject agent spawns requesting filesystem write to /etc/',
      'Require 2-agent consensus for any production deployment action',
    ],
    testing: [
      'Run related test files after any source edit automatically',
      'Prioritize integration tests over unit tests for API changes',
      'Skip snapshot tests during rapid iteration cycles',
    ],
    deployment: [
      'Require green CI status before any deploy action proceeds',
      'Roll back automatically if error rate exceeds 5% post-deploy',
      'Stage canary deployment to 10% traffic before full rollout',
    ],
  };

  const now = nowSec();
  const rows = [];
  for (let i = 0; i < count; i++) {
    const category = pick(categories);
    const content = pick(contentByCategory[category]);
    rows.push({
      id: `np-stress-${i}-${rid(6)}`,
      content,
      category,
      embedding: makeEmbedding(),
      confidence: +randomFloat(0.3, 0.95).toFixed(3),
      usage: randomInt(0, 100),
      created_at: now - randomInt(3600, 86400),
      updated_at: now - randomInt(0, 3600),
      metadata: JSON.stringify({
        source: pick(['auto-discovered', 'user-defined', 'agent-learned']),
        version: randomInt(1, 5),
      }),
    });
  }
  return rows;
}

function buildLearningData(existingJson) {
  const existing = JSON.parse(existingJson);

  // Merge additional algorithm q-table entries
  const algorithmEntries = {
    'sarsa': {
      'edit-file|coder': +randomFloat(0.3, 0.8).toFixed(3),
      'run-test|tester': +randomFloat(0.4, 0.9).toFixed(3),
      'review-code|reviewer': +randomFloat(0.3, 0.7).toFixed(3),
      'search-code|researcher': +randomFloat(0.2, 0.6).toFixed(3),
      'deploy|coder': +randomFloat(0.1, 0.5).toFixed(3),
    },
    'actor-critic': {
      'edit-file|coder': +randomFloat(0.4, 0.85).toFixed(3),
      'spawn-agent|planner': +randomFloat(0.5, 0.9).toFixed(3),
      'run-test|tester': +randomFloat(0.3, 0.8).toFixed(3),
      'create-file|coder': +randomFloat(0.2, 0.7).toFixed(3),
    },
    'ppo': {
      'edit-file|coder': +randomFloat(0.5, 0.9).toFixed(3),
      'run-test|tester': +randomFloat(0.5, 0.95).toFixed(3),
      'review-code|reviewer': +randomFloat(0.4, 0.85).toFixed(3),
      'deploy|coder': +randomFloat(0.3, 0.7).toFixed(3),
      'search-code|researcher': +randomFloat(0.4, 0.8).toFixed(3),
      'spawn-agent|planner': +randomFloat(0.3, 0.75).toFixed(3),
    },
    'td-lambda': {
      'read-file|researcher': +randomFloat(0.3, 0.7).toFixed(3),
      'search-code|researcher': +randomFloat(0.4, 0.8).toFixed(3),
      'edit-file|coder': +randomFloat(0.5, 0.85).toFixed(3),
    },
    'monte-carlo': {
      'run-test|tester': +randomFloat(0.4, 0.9).toFixed(3),
      'deploy|coder': +randomFloat(0.2, 0.6).toFixed(3),
      'review-code|reviewer': +randomFloat(0.5, 0.85).toFixed(3),
      'edit-file|coder': +randomFloat(0.4, 0.8).toFixed(3),
      'create-file|coder': +randomFloat(0.3, 0.7).toFixed(3),
    },
    'dqn': {
      'edit-file|coder': +randomFloat(0.5, 0.9).toFixed(3),
      'run-test|tester': +randomFloat(0.5, 0.85).toFixed(3),
      'spawn-agent|planner': +randomFloat(0.4, 0.8).toFixed(3),
      'search-code|researcher': +randomFloat(0.3, 0.75).toFixed(3),
      'deploy|coder': +randomFloat(0.2, 0.65).toFixed(3),
      'review-code|reviewer': +randomFloat(0.4, 0.8).toFixed(3),
      'create-file|coder': +randomFloat(0.3, 0.7).toFixed(3),
      'read-file|researcher': +randomFloat(0.3, 0.65).toFixed(3),
    },
    'q-learning': {
      'edit-file|coder': +randomFloat(0.5, 0.9).toFixed(3),
      'run-test|tester': +randomFloat(0.4, 0.85).toFixed(3),
      'search-code|researcher': +randomFloat(0.3, 0.7).toFixed(3),
      'deploy|coder': +randomFloat(0.2, 0.6).toFixed(3),
      'review-code|reviewer': +randomFloat(0.4, 0.8).toFixed(3),
      'spawn-agent|planner': +randomFloat(0.3, 0.7).toFixed(3),
    },
  };

  // Merge into qTables — add new state-action pairs without overwriting existing
  for (const [algo, entries] of Object.entries(algorithmEntries)) {
    for (const [stateAction, qVal] of Object.entries(entries)) {
      if (!existing.qTables[stateAction]) {
        existing.qTables[stateAction] = {};
      }
      // Only set if not already present
      if (existing.qTables[stateAction][algo] === undefined) {
        existing.qTables[stateAction][algo] = qVal;
      }
    }
  }

  // Update stats for algorithms that had zero updates
  const now = Date.now();
  for (const algo of Object.keys(algorithmEntries)) {
    if (existing.stats[algo]) {
      if (existing.stats[algo].updates === 0) {
        existing.stats[algo].updates = randomInt(5, 30);
        existing.stats[algo].avgReward = +randomFloat(0.3, 0.8).toFixed(3);
        existing.stats[algo].convergenceScore = +randomFloat(0.1, 0.6).toFixed(3);
        existing.stats[algo].lastUpdate = now - randomInt(0, 3600000);
      }
    }
  }

  // Add synthetic trajectories to the combined learning data
  const trajSamples = [];
  for (let i = 0; i < 10; i++) {
    trajSamples.push({
      state: pick(['edit-file', 'run-test', 'review-code', 'deploy', 'search-code']),
      action: pick(['coder', 'tester', 'reviewer', 'researcher', 'planner']),
      reward: +randomFloat(-0.5, 1.0).toFixed(3),
      timestamp: now - randomInt(0, 86400000),
    });
  }
  existing.trajectories = (existing.trajectories || []).concat(trajSamples);

  // Add more reward history samples
  for (let i = 0; i < 15; i++) {
    existing.rewardHistory.push(+randomFloat(0.1, 5.0).toFixed(2));
  }

  return JSON.stringify(existing);
}

function generateKvEntries() {
  const now = nowSec();
  const hookFires = [];
  for (let i = 0; i < 12; i++) {
    hookFires.push({
      hook: pick(['route', 'remember', 'recall', 'verify', 'build_agents', 'pretrain']),
      timestamp: now - randomInt(0, 7200),
      duration_ms: randomInt(5, 350),
      success: Math.random() > 0.1,
    });
  }

  return [
    {
      key: 'hook_fire_log',
      value: JSON.stringify(hookFires),
    },
    {
      key: 'last_export',
      value: JSON.stringify({ timestamp: now - 3600, format: 'json', sizeBytes: 245760 }),
    },
    {
      key: 'stress_test_run',
      value: JSON.stringify({ timestamp: now, script: 'stress-test.cjs', status: 'completed' }),
    },
  ];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('Stress Test for intelligence.db');
  console.log('================================');
  console.log(`Database: ${DB_PATH}\n`);

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Collect before counts
  const tableNames = [
    'memories', 'patterns', 'trajectories', 'errors', 'file_sequences',
    'agents', 'edges', 'stats', 'learning_data', 'kv_store', 'neural_patterns',
  ];
  const beforeCounts = {};
  for (const t of tableNames) {
    beforeCounts[t] = db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get().c;
  }

  // ---- memories ----
  {
    const rows = generateMemories(25);
    const stmt = db.prepare(
      'INSERT OR IGNORE INTO memories (id, memory_type, content, embedding, metadata, timestamp) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const insertMany = db.transaction((items) => {
      for (const r of items) stmt.run(r.id, r.memory_type, r.content, r.embedding, r.metadata, r.timestamp);
    });
    insertMany(rows);
    console.log(`memories: inserted ${rows.length} rows`);
  }

  // ---- patterns ----
  {
    const rows = generatePatterns();
    const stmt = db.prepare(
      'INSERT OR IGNORE INTO patterns (key, state, action, q_value, visits, last_update) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const insertMany = db.transaction((items) => {
      for (const r of items) stmt.run(r.key, r.state, r.action, r.q_value, r.visits, r.last_update);
    });
    insertMany(rows);
    console.log(`patterns: inserted ${rows.length} rows`);
  }

  // ---- trajectories ----
  {
    const rows = generateTrajectories(35);
    const stmt = db.prepare(
      'INSERT OR IGNORE INTO trajectories (id, state, action, outcome, reward, timestamp) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const insertMany = db.transaction((items) => {
      for (const r of items) stmt.run(r.id, r.state, r.action, r.outcome, r.reward, r.timestamp);
    });
    insertMany(rows);
    console.log(`trajectories: inserted ${rows.length} rows`);
  }

  // ---- errors ----
  {
    const rows = generateErrors();
    const stmt = db.prepare('INSERT OR IGNORE INTO errors (key, data) VALUES (?, ?)');
    const insertMany = db.transaction((items) => {
      for (const r of items) stmt.run(r.key, r.data);
    });
    insertMany(rows);
    console.log(`errors: inserted ${rows.length} rows`);
  }

  // ---- file_sequences ----
  {
    const rows = generateFileSequences();
    const stmt = db.prepare(
      'INSERT OR IGNORE INTO file_sequences (from_file, to_file, count) VALUES (?, ?, ?)'
    );
    const insertMany = db.transaction((items) => {
      for (const r of items) stmt.run(r.from_file, r.to_file, r.count);
    });
    insertMany(rows);
    console.log(`file_sequences: inserted ${rows.length} rows`);
  }

  // ---- agents ----
  {
    const rows = generateAgents();
    const stmt = db.prepare('INSERT OR IGNORE INTO agents (name, data) VALUES (?, ?)');
    const insertMany = db.transaction((items) => {
      for (const r of items) stmt.run(r.name, r.data);
    });
    insertMany(rows);
    console.log(`agents: inserted ${rows.length} rows`);
  }

  // ---- edges ----
  {
    const rows = generateEdges();
    const stmt = db.prepare(
      'INSERT INTO edges (source, target, weight, data) VALUES (?, ?, ?, ?)'
    );
    const insertMany = db.transaction((items) => {
      for (const r of items) stmt.run(r.source, r.target, r.weight, r.data);
    });
    insertMany(rows);
    console.log(`edges: inserted ${rows.length} rows`);
  }

  // ---- stats ----
  {
    const rows = generateStats();
    const stmt = db.prepare('INSERT OR REPLACE INTO stats (key, value) VALUES (?, ?)');
    const insertMany = db.transaction((items) => {
      for (const r of items) stmt.run(r.key, r.value);
    });
    insertMany(rows);
    console.log(`stats: inserted/updated ${rows.length} rows`);
  }

  // ---- learning_data ----
  {
    const existing = db.prepare("SELECT q_table FROM learning_data WHERE algorithm = 'combined'").get();
    if (existing) {
      const merged = buildLearningData(existing.q_table);
      db.prepare("UPDATE learning_data SET q_table = ? WHERE algorithm = 'combined'").run(merged);
      console.log('learning_data: merged additional algorithms into combined entry');
    } else {
      console.log('learning_data: no existing combined entry found -- skipped');
    }

    // Also add individual algorithm rows
    const algorithms = ['sarsa', 'actor-critic', 'ppo', 'td-lambda', 'monte-carlo', 'dqn', 'q-learning'];
    const stmt = db.prepare('INSERT OR IGNORE INTO learning_data (algorithm, q_table) VALUES (?, ?)');
    const insertMany = db.transaction((algos) => {
      for (const algo of algos) {
        const table = {};
        const states = ['edit-file', 'run-test', 'review-code', 'deploy', 'search-code', 'create-file'];
        const actions = ['coder', 'tester', 'reviewer', 'researcher', 'planner'];
        const numEntries = randomInt(3, 10);
        for (let i = 0; i < numEntries; i++) {
          const key = `${pick(states)}|${pick(actions)}`;
          table[key] = +randomFloat(0.1, 0.9).toFixed(3);
        }
        stmt.run(algo, JSON.stringify({
          algorithm: algo,
          qTable: table,
          stats: {
            updates: randomInt(5, 50),
            avgReward: +randomFloat(0.2, 0.8).toFixed(3),
            convergenceScore: +randomFloat(0.1, 0.7).toFixed(3),
            lastUpdate: Date.now() - randomInt(0, 3600000),
          },
        }));
      }
    });
    insertMany(algorithms);
    console.log(`learning_data: inserted ${algorithms.length} individual algorithm rows`);
  }

  // ---- kv_store ----
  {
    const rows = generateKvEntries();
    const stmt = db.prepare('INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)');
    const insertMany = db.transaction((items) => {
      for (const r of items) stmt.run(r.key, r.value);
    });
    insertMany(rows);

    // Update sona_stats with non-zero values
    const sonaRow = db.prepare("SELECT value FROM kv_store WHERE key = 'sona_stats'").get();
    if (sonaRow) {
      const sona = JSON.parse(sonaRow.value);
      sona.trajectories_buffered = randomInt(20, 80);
      sona.patterns_stored = randomInt(5, 30);
      sona.ewc_tasks = randomInt(2, 10);
      sona.buffer_success_rate = +randomFloat(0.7, 0.98).toFixed(3);
      sona.trajectories_dropped = randomInt(0, 5);
      db.prepare("UPDATE kv_store SET value = ? WHERE key = 'sona_stats'").run(JSON.stringify(sona));
      console.log('kv_store: updated sona_stats with non-zero values');
    }
    console.log(`kv_store: inserted/updated ${rows.length} rows`);
  }

  // ---- neural_patterns ----
  {
    const rows = generateNeuralPatterns(12);
    const stmt = db.prepare(
      'INSERT OR IGNORE INTO neural_patterns (id, content, category, embedding, confidence, usage, created_at, updated_at, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const insertMany = db.transaction((items) => {
      for (const r of items) {
        stmt.run(r.id, r.content, r.category, r.embedding, r.confidence, r.usage, r.created_at, r.updated_at, r.metadata);
      }
    });
    insertMany(rows);
    console.log(`neural_patterns: inserted ${rows.length} rows`);
  }

  // ---- Summary ----
  console.log('\n================================');
  console.log('Summary: Before / After Row Counts');
  console.log('================================');
  console.log(
    'Table'.padEnd(20) +
    'Before'.padStart(8) +
    'After'.padStart(8) +
    'Added'.padStart(8)
  );
  console.log('-'.repeat(44));
  for (const t of tableNames) {
    const after = db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get().c;
    const before = beforeCounts[t];
    const added = after - before;
    console.log(
      t.padEnd(20) +
      String(before).padStart(8) +
      String(after).padStart(8) +
      String(added).padStart(8)
    );
  }
  console.log('-'.repeat(44));

  // Verify embeddings
  const memEmbCount = db.prepare('SELECT COUNT(*) as c FROM memories WHERE embedding IS NOT NULL').get().c;
  const npEmbCount = db.prepare('SELECT COUNT(*) as c FROM neural_patterns WHERE embedding IS NOT NULL').get().c;
  console.log(`\nEmbedding verification: ${memEmbCount} memories, ${npEmbCount} neural_patterns have embeddings`);

  // Verify embedding dimensions
  const sampleEmb = db.prepare('SELECT embedding FROM memories WHERE id LIKE ? LIMIT 1').get('mem-stress-%');
  if (sampleEmb && sampleEmb.embedding) {
    const dims = sampleEmb.embedding.length / 4;
    console.log(`Embedding dimensions: ${dims} (${sampleEmb.embedding.length} bytes per vector)`);
  }

  db.close();
  console.log('\nStress test completed successfully.');
}

main();
