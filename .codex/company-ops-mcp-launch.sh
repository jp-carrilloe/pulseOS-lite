#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CLI_DIR="${REPO_ROOT}/cli"
TSX_LOADER="${CLI_DIR}/node_modules/tsx/dist/esm/index.mjs"
MCP_ENTRY="${CLI_DIR}/mcp-server.ts"

if [[ ! -f "${TSX_LOADER}" ]]; then
  echo "Missing local tsx loader at ${TSX_LOADER}. Run 'cd ${CLI_DIR} && npm install' first." >&2
  exit 1
fi

cd "${CLI_DIR}"
exec node --import "${TSX_LOADER}" "${MCP_ENTRY}"
