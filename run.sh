#!/usr/bin/env bash
# YTShare launcher: checks Node, asks for the API key once, starts the server.
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 18+ is required. Install it from https://nodejs.org or your package manager"
  echo "(e.g. Debian/Ubuntu: sudo apt install nodejs   |   Fedora: sudo dnf install nodejs)"
  exit 1
fi
if [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  echo "Node.js 18 or newer is required (found $(node -v))."; exit 1
fi

if ! grep -qE '^YOUTUBE_API_KEY=.{20,}' .env 2>/dev/null && [ -z "$YOUTUBE_API_KEY" ]; then
  echo "Paste your YouTube Data API key (input is hidden), then press Enter:"
  read -rs KEY; echo
  [ -n "$KEY" ] || { echo "No key entered."; exit 1; }
  printf 'YOUTUBE_API_KEY=%s\nPORT=%s\n' "$KEY" "${PORT:-3000}" > .env
  chmod 600 .env
  echo "Saved to $(pwd)/.env"
fi

exec node server.js
