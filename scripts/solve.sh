#!/usr/bin/env bash
set -e

if [ $# -lt 1 ]; then
  echo "Usage: $0 <seed> [additional arguments...]" >&2
  exit 1
fi

npm run solve -- "$@"
