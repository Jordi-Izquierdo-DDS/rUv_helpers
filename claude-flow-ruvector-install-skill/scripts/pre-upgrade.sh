#!/bin/bash
# Pre-upgrade snapshot and safety check
SNAP=".upgrade-snapshot-$(date +%Y%m%d%H%M%S)"
echo "=== Pre-Upgrade Validation ==="
echo "Snapshot dir: $SNAP"
mkdir -p "$SNAP"

echo ""
echo "--- Capturing current state ---"
npm ls --depth=0 > "$SNAP/versions.txt" 2>&1
npx @claude-flow/cli@latest --version >> "$SNAP/versions.txt" 2>&1
npx ruvector --version >> "$SNAP/versions.txt" 2>&1
echo "  Versions saved"

cp .claude/settings.json "$SNAP/" 2>/dev/null && echo "  settings.json backed up"
cp claude-flow.config.json "$SNAP/" 2>/dev/null && echo "  claude-flow config backed up"
cp -r .ruvector/ "$SNAP/ruvector-backup/" 2>/dev/null && echo "  .ruvector/ backed up"
cp .swarm/memory.db "$SNAP/" 2>/dev/null && echo "  memory.db backed up"
cp -r .rvlite/ "$SNAP/rvlite-backup/" 2>/dev/null && echo "  .rvlite/ backed up"

# Export intelligence/hooks state before upgrade (ACTION:UPGRADE in SKILL.md).
# This captures learned patterns, trajectories, and neural weights so they
# survive a major-version upgrade or can be re-imported after rollback.
echo ""
echo "--- Exporting hooks intelligence snapshot ---"
npx ruvector hooks export -o "$SNAP/intelligence-export.json" --include-all 2>&1 && \
  echo "  intelligence export saved" || \
  echo "  WARN: hooks export failed (ruvector may not be installed yet)"

echo ""
echo "--- Available updates ---"
npm outdated claude-flow ruvector @ruvector/core @ruvector/sona @ruvector/gnn @ruvector/attention @ruvector/router @ruvector/tiny-dancer ruvector-extensions @ruvector/rvlite @ruvector/postgres-cli @ruvector/ruvllm @ruvector/graph-node @ruvector/edge @ruvector/edge-full @ruvector/edge-net @ruvector/wasm @ruvector/router-wasm 2>&1

echo ""
echo "--- Dry run ---"
npm update --dry-run 2>&1 | head -20

echo ""
echo "=== Ready to upgrade ==="
echo "To proceed: npm update claude-flow ruvector @ruvector/core @ruvector/sona ..."
echo "To rollback: cp $SNAP/settings.json .claude/settings.json && cp $SNAP/memory.db .swarm/memory.db"
