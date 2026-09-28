#!/usr/bin/env bash
# Every check of the STEP converter, through its virtual environment (setup.sh):
# format, lint, strict type check, tests. Stops at the first failure.
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -x .venv/bin/python ]]; then
  echo "Missing .venv: run packages/step-converter/setup.sh first." >&2
  exit 1
fi

.venv/bin/ruff format --check .
.venv/bin/ruff check .
.venv/bin/mypy
.venv/bin/pytest --quiet
