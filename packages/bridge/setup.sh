#!/usr/bin/env bash
# Creates the bridge's virtual environment in .venv (git ignored) with the
# pinned runtime and development requirements. Run again after a requirement change.
set -euo pipefail
cd "$(dirname "$0")"

PYTHON="${PYTHON:-python3}"
"$PYTHON" -m venv .venv
.venv/bin/python -m pip install --quiet --requirement requirements-dev.txt

# Makes `.venv/bin/python -m pantin_bridge` work from any directory without a
# build backend: the package is not published, only run from this checkout.
site_packages="$(.venv/bin/python -c 'import sysconfig; print(sysconfig.get_path("purelib"))')"
echo "$PWD/src" > "$site_packages/pantin_bridge.pth"
echo "Bridge ready: $PWD/.venv/bin/python -m pantin_bridge"
