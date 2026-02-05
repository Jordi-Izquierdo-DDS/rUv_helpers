# V3+RV Skill - Quick Start (v0.9.9)

**For AI Agents:** Execute these commands in sequence. No modifications needed.

**15-Phase Install** - See [INSTALL.md](INSTALL.md) for full details.

---

## Prerequisites (Verify First)

```bash
node --version | grep -qE "^v2[0-9]" && echo "OK" || echo "FAIL: Need Node 20+"
npm --version | grep -qE "^(9|[1-9][0-9])" && echo "OK" || echo "FAIL: Need npm 9+"
git --version >/dev/null && echo "OK" || echo "FAIL: Need git"
```

**IF ANY FAIL:** Stop. Install prerequisites first.

---

## Install (6 Commands)

```bash
# 1. Create project with git
mkdir my-project && cd my-project && npm init -y && git init && echo "# Project" > README.md && git add . && git commit -m "init"

# 2. Create .env + install deps
cat > .env << 'EOF'
RUVECTOR_MEMORY_BACKEND=sqlite
RUVECTOR_EMBEDDING_DIM=384
RUVECTOR_ONNX_ENABLED=true
RUVECTOR_SEMANTIC_EMBEDDINGS=true
RUVECTOR_LEARNING_ENABLED=true
RUVECTOR_SONA_ENABLED=true
RUVECTOR_HOOK_TIMEOUT=10000
EOF
set -a && source .env && set +a
npm install better-sqlite3 ruvector --legacy-peer-deps

# 3. Initialize + copy skill
npx @claude-flow/cli@latest init --with-embeddings
npx @claude-flow/cli@latest memory init --force
npx ruvector hooks init --fast
SKILL="/mnt/data/dev/CFV3/howto_V3+RV_Skill/v0.9.9"
cp -r "$SKILL/packages" "$SKILL/scripts" "$SKILL/fixes" ./
find scripts -name "*.sh" -exec sed -i 's/\r$//' {} \; 2>/dev/null || true

# 4. Setup + pretrain + consolidate (CORRECT ORDER!)
chmod +x scripts/*.sh && bash scripts/setup.sh
npx ruvector hooks pretrain --verbose
node -e "require('./packages/ruvector-storage').createStorage().importFromJson()"
node scripts/post-process.js --event consolidate 2>/dev/null || true

# 5. Patch auto-sync
cat > .claude/ruvector-fast.sh << 'WRAP'
#!/bin/bash
node "${PWD}/node_modules/ruvector/bin/cli.js" "$@"; node -e "try{require('./packages/ruvector-storage').createStorage().importFromJson()}catch(e){}" &
WRAP
chmod +x .claude/ruvector-fast.sh

# 6. MCP + Daemon (Phase 14-15)
claude mcp add claude-flow -- npx -y @claude-flow/cli@latest 2>/dev/null && \
claude mcp add ruvector -- npx -y ruvector mcp start 2>/dev/null || \
cat > .claude.json << 'MCP'
{"mcpServers":{"claude-flow":{"command":"npx","args":["-y","@claude-flow/cli@latest"]},"ruvector":{"command":"npx","args":["-y","ruvector","mcp","start"]}}}
MCP
npx claude-flow daemon start
npx claude-flow doctor --fix 2>/dev/null || true
```

---

## Verify (Must Output "HEALTHY")

```bash
node -e "const D=require('better-sqlite3');const db=new D('.ruvector/intelligence.db');const m=db.prepare('SELECT COUNT(*) c FROM memories').get().c;const e=db.prepare('SELECT COUNT(*) c FROM memories WHERE length(embedding)=1536').get().c;console.log(m>0&&e===m?'HEALTHY':'BROKEN');db.close()"
```

---

## If BROKEN

```bash
# Most common fix: re-run setup (fixes embedding dimensions)
bash scripts/setup.sh

# Still broken? Full diagnostics
bash scripts/diagnose-db.sh
```

---

## Full Guide

For detailed 15-phase install with explanations: [INSTALL.md](INSTALL.md)

For troubleshooting decision trees: [SKILL.md](SKILL.md#troubleshoot)
