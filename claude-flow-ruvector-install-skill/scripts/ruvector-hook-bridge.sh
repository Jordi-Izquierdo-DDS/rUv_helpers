#!/bin/bash
# ruvector-hook-bridge.sh — Reads Claude Code stdin JSON, extracts fields, calls ruvector.
# v0.9.9 - Session tracking, agent registration, SONA pipeline
#
# Claude Code sends JSON on stdin for hook events:
#   {"hook_event_name":"PostToolUse","tool_name":"Write","tool_input":{...},"tool_response":{...}}
#
# Fixes in v0.9.9:
#   - FIX-028: Added pre-command handler (was missing, fell through to wildcard)
#   - FIX-029: Added session-end handler with consolidate + SONA dream cycle
#   - FIX-030: Session tracking with last_session timestamp and session_count++
#   - FIX-031: Stop hook now triggers full consolidation pipeline
#   - Agent registration now handles both new and legacy table schemas
#
# v0.9.8: PreToolUse timeout increased to 5000ms for reliable operation.
# v0.9.6: Calls post-process.js in background after post-edit/post-command for
#          neural pattern extraction, edge creation, semantic edges, and learning pipeline enrichment.

set -euo pipefail

INPUT="$(cat)"
HOOK_CMD="${1:-}"; shift 2>/dev/null || true

if [ -x ".claude/ruvector-fast.sh" ]; then
  RV_CMD=".claude/ruvector-fast.sh"
else
  RV_CMD="npx ruvector"
fi

extract() {
  echo "$INPUT" | node -e "
    let d='';
    process.stdin.on('data', c => d += c);
    process.stdin.on('end', () => {
      try {
        const j = JSON.parse(d);
        const val = $1;
        process.stdout.write(String(val || ''));
      } catch(e) {
        process.stdout.write('');
      }
    });
  " 2>/dev/null
}

case "$HOOK_CMD" in
  pre-edit)
    FILE=$(extract "j.tool_input?.file_path")
    [ -n "$FILE" ] && exec $RV_CMD hooks pre-edit "$FILE" "$@" || exit 0
    ;;

  post-edit)
    FILE=$(extract "j.tool_input?.file_path")
    if [ -n "$FILE" ]; then
      # v0.9.6: Run post-process.js in background for learning pipeline + semantic edges
      if [ -f "scripts/post-process.js" ]; then
        node scripts/post-process.js --event post-edit --file "$FILE" --success true --train-neural true 2>/dev/null &
      fi
      exec $RV_CMD hooks post-edit "$FILE" --success "$@"
    fi
    exit 0
    ;;

  pre-command)
    # FIX-028: Added pre-command handler (was missing in v0.9.8)
    CMD=$(extract "j.tool_input?.command")
    if [ -n "$CMD" ]; then
      # Run pre-command learning if post-process.js exists
      if [ -f "scripts/post-process.js" ]; then
        node scripts/post-process.js --event pre-command --command "$CMD" 2>/dev/null &
      fi
      exec $RV_CMD hooks pre-command "$CMD" "$@"
    fi
    exit 0
    ;;

  post-command)
    CMD=$(extract "j.tool_input?.command")
    if [ -n "$CMD" ]; then
      # v0.9.6: Run post-process.js in background for learning pipeline
      if [ -f "scripts/post-process.js" ]; then
        node scripts/post-process.js --event post-command --command "$CMD" --success true 2>/dev/null &
      fi
      exec $RV_CMD hooks post-command "$CMD" --success "$@"
    fi
    exit 0
    ;;

  session-start)
    # v0.9.6: Register agent in intelligence.db (SSOT)
    AGENT=$(extract "j.tool_input?.agent_name || j.agent_name")
    SESSION=$(extract "j.tool_input?.session_id || j.session_id")
    if [ -f "scripts/post-process.js" ]; then
      node scripts/post-process.js --event session-start --agent-name "${AGENT:-claude-code}" --session-id "${SESSION:-auto}" 2>/dev/null &
    fi
    exec $RV_CMD hooks session-start "$@" || exit 0
    ;;

  session-end)
    # v0.9.9: session-end handler with consolidate + SONA dream cycle + stats sync
    # This is the critical fix - session-end must trigger full consolidation pipeline

    # Step 1: Run session-end handler (which includes consolidate + stats sync)
    if [ -f "scripts/post-process.js" ]; then
      node scripts/post-process.js --event session-end 2>/dev/null || true
    fi

    # Step 2: Trigger SONA dream cycle compression (neural_patterns → compressed_patterns)
    if [ -f "scripts/sona-consolidate.js" ]; then
      node scripts/sona-consolidate.js 2>/dev/null || true
    fi

    # Step 3: Call learning-hooks.sh session-end if available (for additional consolidation)
    if [ -f ".claude/helpers/learning-hooks.sh" ]; then
      bash .claude/helpers/learning-hooks.sh session-end 2>/dev/null || true
    fi

    # Step 4: Call ruvector session-end
    exec $RV_CMD hooks session-end "$@" || exit 0
    ;;

  remember-read)
    FILE=$(extract "j.tool_input?.file_path")
    if [ -n "$FILE" ]; then
      BNAME=$(basename "$FILE")
      PDIR=$(basename "$(dirname "$FILE")")
      exec $RV_CMD hooks remember "Reading: $BNAME in $PDIR/" -t file_access --semantic --silent "$@"
    fi
    exit 0
    ;;

  remember-search)
    PATTERN=$(extract "j.tool_input?.pattern")
    [ -n "$PATTERN" ] && exec $RV_CMD hooks remember "Search: $PATTERN" -t search_pattern --semantic --silent "$@" || exit 0
    ;;

  remember-agent)
    TYPE=$(extract "j.tool_input?.subagent_type")
    DESC=$(extract "j.tool_input?.description")
    if [ -n "$TYPE" ]; then
      LABEL="Agent: $TYPE"
      [ -n "$DESC" ] && LABEL="Agent: $TYPE — $DESC"
      exec $RV_CMD hooks remember "$LABEL" -t agent_spawn --semantic --silent "$@"
    fi
    exit 0
    ;;

  coedit-suggest)
    FILE=$(extract "j.tool_input?.file_path")
    [ -n "$FILE" ] && exec $RV_CMD hooks coedit-suggest "$FILE" "$@" || exit 0
    ;;

  consolidate)
    # FIX-031: Direct consolidate command support
    # Can be called manually or by daemon workers
    if [ -f "scripts/post-process.js" ]; then
      node scripts/post-process.js --event consolidate 2>/dev/null || true
    fi
    if [ -f "scripts/sona-consolidate.js" ]; then
      node scripts/sona-consolidate.js 2>/dev/null || true
    fi
    exit 0
    ;;

  *)
    exec $RV_CMD hooks "$HOOK_CMD" "$@" || exit 0
    ;;
esac
