#!/usr/bin/env bash
set -euo pipefail
TEST_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd -- "$TEST_DIR/.." && pwd)"
cd "$REPO_DIR"
TEST_PYTHON="${CLAUDE_CLASH_PYTHON:-$REPO_DIR/.venv/bin/python3}"
if [[ ! -x "$TEST_PYTHON" ]]; then TEST_PYTHON=python3; fi
node --require ./tests/deny-network.cjs --test tests/template.test.js
"$TEST_PYTHON" -m unittest discover -s tests -p 'test_*.py' -v
