#!/usr/bin/env sh
# Pushing to master is kept for releases (ADR 0044): PANTIN_RELEASE=1 git push.
# Tags and other branches pass. Git gives the pushed refs on stdin.
while read -r local_ref local_sha remote_ref remote_sha; do
  if [ "$remote_ref" = "refs/heads/master" ] && [ "${PANTIN_RELEASE:-}" != 1 ]; then
    echo "Push to master refused (ADR 0044): master receives releases only." >&2
    echo "To publish a release the user approved: PANTIN_RELEASE=1 git push origin master" >&2
    exit 1
  fi
done
exit 0
