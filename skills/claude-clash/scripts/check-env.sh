#!/usr/bin/env bash
# 默认仅离线检查文件，不联网、不启动 Claude/Clash，不修改配置。
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/../../.." && pwd)"
if [[ -n "${CLAUDE_CLASH_PYTHON:-}" ]]; then
  PYTHON_BIN="$CLAUDE_CLASH_PYTHON"
elif [[ -x "$PROJECT_ROOT/.venv/bin/python3" ]]; then
  PYTHON_BIN="$PROJECT_ROOT/.venv/bin/python3"
else
  PYTHON_BIN="python3"
fi
exec "$PYTHON_BIN" "$SCRIPT_DIR/check_env.py" "$@"
