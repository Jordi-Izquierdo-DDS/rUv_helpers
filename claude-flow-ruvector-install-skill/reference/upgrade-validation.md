# Upgrade Validation Reference

> **Version:** v0.7 | **Generated:** 2026-01-31 | **Ecosystem:** claude-flow v3.0.0-alpha.190 + ruvector 0.1.96

## Contents
- Pre-Upgrade Snapshot
- Upgrade Intelligence (Version Diff Analysis)
- FOX Patch Obsolescence Check
- Upgrade Execution
- Post-Upgrade Re-Init
- Rollback

---

## Pre-Upgrade Snapshot

Always run before any upgrade:

```bash
bash scripts/pre-upgrade.sh
```

This creates `.upgrade-snapshot-TIMESTAMP/` with:
- settings.json backup
- intelligence.json backup
- memory.db backup (if exists)
- package versions snapshot

---

## Upgrade Intelligence (Version Diff Analysis)

Before upgrading, analyze what the new version changes and whether it could
break your current setup or fix known bugs.

### Check Available Versions

```bash
npm view ruvector versions --json 2>/dev/null | tail -5
npm view claude-flow versions --json 2>/dev/null | tail -5
npm view ruvector dist-tags --json
npm view claude-flow dist-tags --json
```

### Analyze What Changed

```bash
# Compare current vs latest
CURRENT=$(npx ruvector --version 2>/dev/null)
LATEST=$(npm view ruvector version)
echo "Current: $CURRENT → Latest: $LATEST"

# Check changelog/commits
npm view ruvector repository.url
# Then use gh or git to check commits between versions

# Check if package.json dependencies changed
npm view ruvector@latest dependencies --json
```

### Detect Potential Breaks

Before upgrading, check if the new version:

1. **Changed settings.json format** — Would hooks init --force break your config?
```bash
# Compare what current init writes vs what new version writes:
# (in a temp directory)
mkdir /tmp/upgrade-test && cd /tmp/upgrade-test && npm init -y && git init
npm install ruvector@latest
npx ruvector hooks init --fast
# Compare .claude/settings.json with your current one
diff .claude/settings.json /path/to/your/project/.claude/settings.json
```

2. **Changed intelligence.json format** — Would pretrain overwrite learned data?
3. **Changed env var names** — Would existing config stop working?
4. **Removed or renamed commands** — Would scripts break?

### FOX Patch Obsolescence Check

If you have FOX method local fixes (in the `fixes/` directory for upstream bugs), check if
the new version resolves them:

```bash
# List your FOX local fixes
ls -la fixes/ 2>/dev/null || echo "No fixes directory"

# For each fix, check if it is resolved in the new version:
# 1. Read the fix to understand what it addresses
# 2. Check the new version's source for the same fix
# 3. If fixed upstream, remove the local fix

# Example: check if ruvector-extensions SQLite adapter is implemented
npm view ruvector-extensions@latest description
# Download and inspect:
npm pack ruvector-extensions@latest --dry-run
```

---

## Upgrade Execution

### claude-flow v2 → v3

```bash
bash scripts/pre-upgrade.sh
npx @claude-flow/cli@latest migrate run --backup
npx @claude-flow/cli@latest migrate verify
# If failed:
npx @claude-flow/cli@latest migrate rollback
```

### ruvector (no migration system)

> **WARNING:** `hooks init --force` OVERWRITES settings.json entries. Claude-flow
> entries will be preserved only if claude-flow init ran first. The safe path
> (recommended) re-runs claude-flow init before ruvector init:

**Safe path (recommended):**
```bash
bash scripts/pre-upgrade.sh
npx ruvector hooks export -o .upgrade-snapshot/intelligence-export.json --include-all
npm update ruvector @ruvector/core @ruvector/sona @ruvector/gnn \
  @ruvector/attention @ruvector/router @ruvector/graph-node ruvector-extensions
npx ruvector doctor --verbose                    # Check new version health
npx @claude-flow/cli@latest init --full --start-all --with-embeddings
npx ruvector hooks init --force --fast --build-agents quality
bash scripts/post-init-fix.sh                    # MANDATORY
npx ruvector hooks pretrain --verbose            # Re-pretrain with semantic
claude mcp add claude-flow -- npx -y @claude-flow/cli@latest
claude mcp add ruvector -- npx -y ruvector mcp start
bash scripts/validate-setup.sh                   # Deep validation
```

**Minimal path** (only if claude-flow was NOT modified):
```bash
bash scripts/pre-upgrade.sh
npx ruvector hooks export -o .upgrade-snapshot/intelligence-export.json --include-all
npm update ruvector @ruvector/core @ruvector/sona @ruvector/gnn \
  @ruvector/attention @ruvector/router @ruvector/graph-node ruvector-extensions
npx ruvector doctor --verbose                    # Check new version health
npx ruvector hooks init --force                  # Re-init with new version
bash scripts/post-init-fix.sh                    # MANDATORY
npx ruvector hooks pretrain --verbose            # Re-pretrain with semantic
bash scripts/validate-setup.sh                   # Deep validation
```

---

## Post-Upgrade Checklist

After any upgrade:

1. `npx ruvector doctor --verbose` — Check bindings still load
2. `npx ruvector hooks verify --verbose` — Check hooks still run
3. `bash scripts/validate-setup.sh` — Deep validation
4. `npx ruvector hooks recall "project" -k 1 --semantic` — Check memories survived
5. `npx ruvector hooks learning-stats` — Check Q-tables survived
6. Check FOX local fixes (`fixes/`) — Are they still needed?
7. If memories or Q-tables were lost: `npx ruvector hooks import .upgrade-snapshot/intelligence-export.json --merge`
8. If claude-flow memory commands fail after upgrade, run `npx @claude-flow/cli@latest memory init --force`

---

## Rollback

### claude-flow

```bash
npx @claude-flow/cli@latest migrate rollback
```

### ruvector (manual)

```bash
# Restore from pre-upgrade snapshot
SNAPSHOT=$(ls -d .upgrade-snapshot-* | tail -1)
cp "$SNAPSHOT/settings.json" .claude/settings.json
cp "$SNAPSHOT/intelligence.json" .ruvector/intelligence.json
[ -f "$SNAPSHOT/memory.db" ] && cp "$SNAPSHOT/memory.db" .swarm/memory.db

# Restore previous version
npm install ruvector@PREVIOUS_VERSION
npx ruvector hooks verify --verbose
```

If snapshot doesn't exist:
```bash
echo '{}' > .ruvector/intelligence.json
npx ruvector hooks init --fast --build-agents quality
bash scripts/post-init-fix.sh
npx ruvector hooks pretrain --verbose
```
