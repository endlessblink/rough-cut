#!/usr/bin/env bash
set -euo pipefail

echo "== /proc/self/status sandbox fields =="
grep -E 'NoNewPrivs|Seccomp|Cap' /proc/self/status

echo
echo "== current shell process =="
ps -p "$$" -o pid,ppid,cmd

echo
echo "== virtualization/container detection =="
systemd-detect-virt || true
