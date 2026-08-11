#!/usr/bin/env bash
# Install Bun for the workshop container. Idempotent: re-running is a no-op.
set -euo pipefail

if command -v unzip >/dev/null 2>&1; then
	: # the base image ships unzip; nothing to do
else
	sudo apt-get update && sudo apt-get install -y --no-install-recommends unzip
fi

if [ -x "$HOME/.bun/bin/bun" ]; then
	echo "bun already installed: $("$HOME/.bun/bin/bun" --version)"
	exit 0
fi

curl -fsSL https://bun.sh/install | bash
echo "bun installed: $("$HOME/.bun/bin/bun" --version)"
