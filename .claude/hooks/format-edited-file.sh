#!/usr/bin/env sh
# PostToolUse hook: formats the file Claude just edited so that the repository
# stays clean between commits. Cheap (Biome, one file); the full typecheck is
# left to `pnpm check` because running it after every edit costs too much.
file_path=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_input', {}).get('file_path', ''))")
case "$file_path" in
  *.ts|*.tsx|*.js|*.mjs|*.cjs|*.json|*.jsonc|*.css)
    "$CLAUDE_PROJECT_DIR/node_modules/.bin/biome" format --write --no-errors-on-unmatched "$file_path" >/dev/null 2>&1 || true
    ;;
esac
exit 0
