#!/usr/bin/env bash
# Fetch the Temporal CLI (embedded dev server) for linux/amd64 on Render; skipped when TEMPORAL_MODE=cloud or already present.
set -e
[ "${TEMPORAL_MODE:-embedded}" = "cloud" ] && exit 0
[ -x bin/temporal ] && exit 0
mkdir -p bin; V="${TEMPORAL_CLI_VERSION:-1.4.1}"
curl -fsSL "https://github.com/temporalio/cli/releases/download/v${V}/temporal_cli_${V}_linux_amd64.tar.gz" | tar -xz -C bin temporal || curl -fsSL "https://temporal.download/cli/archive/latest?platform=linux&arch=amd64" | tar -xz -C bin temporal
chmod +x bin/temporal; ./bin/temporal --version
