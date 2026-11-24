#!/usr/bin/env sh
set -eu
site_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec node "$site_root/preview.mjs" --port "${PORT:-8090}"
