#!/usr/bin/env bash
set -euo pipefail

cd /media/endlessblink/data/my-projects/ai-development/content-creation/rough-cut-mvp

export DISPLAY="${DISPLAY:-:0}"
export XAUTHORITY="${XAUTHORITY:-/run/user/1000/xauth_Mqgwcs}"

pnpm smoke:experimental-headless-runtime-export
