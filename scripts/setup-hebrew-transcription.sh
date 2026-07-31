#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="$ROOT_DIR/.venv-transcription"
MODEL_LINK="$ROOT_DIR/.transcription-model"
MODEL_ID="${ROUGH_CUT_FASTER_WHISPER_MODEL_ID:-ivrit-ai/faster-whisper-v2-d4}"

uv venv --python python3.12 "$VENV_DIR"
uv pip install \
  --python "$VENV_DIR/bin/python" \
  --requirement "$ROOT_DIR/requirements-transcription.txt"

MODEL_PATH="$(
  "$VENV_DIR/bin/python" - "$MODEL_ID" <<'PY'
import sys
from huggingface_hub import snapshot_download

print(snapshot_download(sys.argv[1]))
PY
)"

if [[ ! -s "$MODEL_PATH/model.bin" ]]; then
  printf 'Hebrew transcription model is incomplete: %s\n' "$MODEL_PATH" >&2
  exit 1
fi

ln -sfn "$MODEL_PATH" "$MODEL_LINK"
"$VENV_DIR/bin/python" -c 'from faster_whisper import WhisperModel'

printf 'Hebrew transcription ready: %s\n' "$MODEL_PATH"
