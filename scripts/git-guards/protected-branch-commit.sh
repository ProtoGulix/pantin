#!/usr/bin/env sh
# Protected branches (ADR 0044): no commit on master; on develop only to finish
# an integration of a reviewed work branch (PANTIN_INTEGRATION=1).
# lefthook skips pre-commit jobs when nothing is staged (an empty commit), so
# commit-msg runs this script too, with --allow-merge: commit-msg also runs
# for merges, and a conflict-free merge must pass (ADR 0044 point 8).
if [ "${1:-}" = "--allow-merge" ] && [ -f "$(git rev-parse --git-path MERGE_HEAD)" ]; then
  exit 0
fi
branch=$(git symbolic-ref --short -q HEAD || echo "")
case "$branch" in
  master)
    if [ "${PANTIN_RELEASE:-}" != 1 ]; then
      echo "Direct commit on master refused (ADR 0044): master receives releases only." >&2
      exit 1
    fi ;;
  develop)
    if [ "${PANTIN_INTEGRATION:-}" != 1 ]; then
      echo "Direct commit on develop refused (ADR 0044): work on a feat/, fix/, docs/... branch." >&2
      echo "To finish a reviewed integration: PANTIN_INTEGRATION=1 git commit" >&2
      exit 1
    fi ;;
esac
exit 0
