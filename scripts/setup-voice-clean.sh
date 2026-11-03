#!/usr/bin/env bash
# Sets up "Clean voice" (NVIDIA RE-USE speech enhancement) for local use.
#
# Dev/local only for now: the result is about 5 GB (PyTorch + CUDA libraries),
# needs an NVIDIA graphics card, and is not packaged with the app. The app looks
# for it at ~/.local/share/rough-cut/voice-clean (override with
# ROUGH_CUT_VOICE_CLEAN_HOME) and shows "needs setup" when it is missing.
#
# Optional inputs (to reuse things that were already downloaded):
#   ROUGH_CUT_VOICE_CLEAN_WHEELS     folder holding the two prebuilt wheels
#   ROUGH_CUT_VOICE_CLEAN_MODEL_SRC  an existing clone of the model repo
#
# Model: https://huggingface.co/nvidia/NVIDIA-NemotronLabs-RE-USE (OpenMDW-1.1).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOME_DIR="${ROUGH_CUT_VOICE_CLEAN_HOME:-$HOME/.local/share/rough-cut/voice-clean}"
VENV_DIR="$HOME_DIR/venv"
MODEL_DIR="$HOME_DIR/model"
WHEEL_DIR="$HOME_DIR/wheels"
MODEL_REPO="https://huggingface.co/nvidia/NVIDIA-NemotronLabs-RE-USE"
MODEL_COMMIT="31f82f2efad1095034492f236e8dac9239ba713b"
WEIGHTS_SHA256="06badaf4029b297f97f7fe48d62990b48d5482608210df577354e0d4e0ed70e1"
MAMBA_WHEEL="mamba_ssm-2.2.4+cu12torch2.5cxx11abiFALSE-cp312-cp312-linux_x86_64.whl"
CONV_WHEEL="causal_conv1d-1.5.0.post8+cu12torch2.5cxx11abiFALSE-cp312-cp312-linux_x86_64.whl"
MAMBA_URL="https://github.com/state-spaces/mamba/releases/download/v2.2.4/$MAMBA_WHEEL"
CONV_URL="https://github.com/Dao-AILab/causal-conv1d/releases/download/v1.5.0.post8/$CONV_WHEEL"
export UV_HTTP_TIMEOUT="${UV_HTTP_TIMEOUT:-600}"

if ! command -v nvidia-smi >/dev/null 2>&1 || ! nvidia-smi -L >/dev/null 2>&1; then
  printf 'Clean voice needs an NVIDIA graphics card (nvidia-smi found none).\n' >&2
  exit 1
fi

mkdir -p "$HOME_DIR" "$WHEEL_DIR"

fetch_wheel() {
  local name="$1" url="$2"
  if [[ -s "$WHEEL_DIR/$name" ]]; then return; fi
  if [[ -n "${ROUGH_CUT_VOICE_CLEAN_WHEELS:-}" && -s "$ROUGH_CUT_VOICE_CLEAN_WHEELS/$name" ]]; then
    cp "$ROUGH_CUT_VOICE_CLEAN_WHEELS/$name" "$WHEEL_DIR/$name"
    return
  fi
  curl -fL --retry 3 -o "$WHEEL_DIR/$name.part" "$url"
  mv "$WHEEL_DIR/$name.part" "$WHEEL_DIR/$name"
}
fetch_wheel "$MAMBA_WHEEL" "$MAMBA_URL"
fetch_wheel "$CONV_WHEEL" "$CONV_URL"

if [[ ! -x "$VENV_DIR/bin/python" ]]; then
  uv venv --python python3.12 "$VENV_DIR"
fi
uv pip install \
  --python "$VENV_DIR/bin/python" \
  --index-strategy unsafe-best-match \
  --requirement "$ROOT_DIR/requirements-voice-clean.txt" \
  "$WHEEL_DIR/$MAMBA_WHEEL" \
  "$WHEEL_DIR/$CONV_WHEEL"

if [[ ! -d "$MODEL_DIR/models" ]]; then
  if [[ -n "${ROUGH_CUT_VOICE_CLEAN_MODEL_SRC:-}" && -d "$ROUGH_CUT_VOICE_CLEAN_MODEL_SRC/models" ]]; then
    mkdir -p "$MODEL_DIR"
    # Code, recipe and weights only; never copy test audio.
    cp -r "$ROUGH_CUT_VOICE_CLEAN_MODEL_SRC/models" "$ROUGH_CUT_VOICE_CLEAN_MODEL_SRC/utils" \
      "$ROUGH_CUT_VOICE_CLEAN_MODEL_SRC/recipes" "$MODEL_DIR/"
    for file in config.json LICENSE README.md model.safetensors; do
      [[ -f "$ROUGH_CUT_VOICE_CLEAN_MODEL_SRC/$file" ]] && cp "$ROUGH_CUT_VOICE_CLEAN_MODEL_SRC/$file" "$MODEL_DIR/"
    done
  else
    GIT_LFS_SKIP_SMUDGE=1 git clone "$MODEL_REPO" "$MODEL_DIR"
    git -C "$MODEL_DIR" checkout --quiet "$MODEL_COMMIT"
  fi
fi

if ! printf '%s  %s\n' "$WEIGHTS_SHA256" "$MODEL_DIR/model.safetensors" | sha256sum --check --status 2>/dev/null; then
  curl -fL --retry 3 -o "$MODEL_DIR/model.safetensors.part" \
    "$MODEL_REPO/resolve/$MODEL_COMMIT/model.safetensors"
  mv "$MODEL_DIR/model.safetensors.part" "$MODEL_DIR/model.safetensors"
  printf '%s  %s\n' "$WEIGHTS_SHA256" "$MODEL_DIR/model.safetensors" | sha256sum --check
fi

# Import check only (no GPU work): the worker needs these modules.
HF_HUB_OFFLINE=1 "$VENV_DIR/bin/python" - "$MODEL_DIR" <<'PY'
import sys
sys.path.insert(0, sys.argv[1])
import torch, soundfile  # noqa: F401
from models.generator_SEMamba_time_d4 import SEMamba  # noqa: F401
print("torch", torch.__version__, "cuda", torch.cuda.is_available())
PY

printf 'Clean voice ready: %s\n' "$HOME_DIR"
