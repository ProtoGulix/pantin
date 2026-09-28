#!/usr/bin/env bash
# Creates the converter's virtual environment in .venv (git ignored) with the
# pinned runtime and development requirements. Run again after a requirement change.
set -euo pipefail
cd "$(dirname "$0")"

PYTHON="${PYTHON:-python3}"
"$PYTHON" -m venv .venv
.venv/bin/python -m pip install --quiet --requirement requirements-dev.txt

# Makes `.venv/bin/python -m pantin_step_converter` work from any directory, as
# the core runs it (ADR 0009), without a build backend: the package is not
# published, only run from this checkout.
site_packages="$(.venv/bin/python -c 'import sysconfig; print(sysconfig.get_path("purelib"))')"
echo "$PWD/src" > "$site_packages/pantin_step_converter.pth"
echo "Converter ready: $PWD/.venv/bin/python -m pantin_step_converter"
