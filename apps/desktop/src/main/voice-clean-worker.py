"""Clean voice worker: NVIDIA RE-USE speech enhancement, chunked, offline.

Reads one mono/stereo WAV, writes a same-length, same-rate 16-bit stereo WAV
whose channel 0 is the original voice and channel 1 the cleaned voice. The
chunk/overlap-add loop follows the model repo's inference_chunk.py (OpenMDW-1.1,
NVIDIA) so results match what was listened to, but it loads the weights from the
local model folder (never the network) and prints JSON progress lines on stdout:

  {"event": "progress", "progress": 0.42}
  {"event": "done", "samples": 960000, "sampleRate": 48000}
  {"event": "error", "code": "no-gpu", "message": "..."}

Dev/local only: needs the env made by scripts/setup-voice-clean.sh.
"""

import argparse
import json
import math
import os
import sys


def emit(payload):
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def make_even(value):
    value = int(round(value))
    return value if value % 2 == 0 else value + 1


def lay_on_media_clock(signal, time_map, fade=240):
    """Place decoded samples on the <video>'s clock (see buildVoiceCleanTimeMap).

    time_map["segments"] = [[start, offset], ...]: from `start` on, clock[k] =
    decoded[k - offset]. Samples stay continuous (speed 1) inside a segment;
    each step between segments is crossfaded over `fade` samples (5 ms at 48 kHz).
    Clock positions with no decoded sound are silence.
    """
    import numpy as np

    total = int(time_map["end"])
    segments = [(int(at), int(offset)) for at, offset in time_map["segments"]]
    n = len(signal)
    out = np.zeros(total, dtype=np.float32)

    def take(k, offset):
        idx = k - offset
        valid = (idx >= 0) & (idx < n)
        values = np.zeros(len(k), dtype=np.float32)
        values[valid] = signal[idx[valid]]
        return values

    for j, (at, offset) in enumerate(segments):
        start = 0 if j == 0 else at
        stop = total if j + 1 == len(segments) else min(total, segments[j + 1][0])
        k0, k1 = max(start, offset), min(stop, n + offset)
        if k1 > k0:
            out[k0:k1] = signal[k0 - offset:k1 - offset]
    for j in range(1, len(segments)):
        at, offset = segments[j]
        previous = segments[j - 1][1]
        lo, hi = max(0, at - fade // 2), min(total, at + fade // 2)
        if hi <= lo:
            continue
        k = np.arange(lo, hi)
        weight = ((k - lo + 0.5) / (hi - lo)).astype(np.float32)
        out[lo:hi] = (1 - weight) * take(k, previous) + weight * take(k, offset)
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--config", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--chunk-seconds", type=float, default=5.0)
    parser.add_argument("--hop-portion", type=float, default=0.5)
    parser.add_argument("--time-map", default=None)
    # Testing only: skip the model (cleaned = original) to check timing fast.
    parser.add_argument("--passthrough", action="store_true")
    args = parser.parse_args()

    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    sys.path.insert(0, args.model_dir)

    import soundfile as sf

    if args.passthrough:
        audio, sample_rate = sf.read(args.input, dtype="float32", always_2d=True)
        mono = audio.mean(axis=1)
        write_pair(sf, args.output, mono, mono, sample_rate, args.time_map)
        emit({"event": "progress", "progress": 1.0})
        emit({"event": "done", "samples": int(len(mono)), "sampleRate": int(sample_rate)})
        return 0

    import torch
    import torch.nn as nn
    from models.generator_SEMamba_time_d4 import SEMamba
    from models.stfts import mag_phase_istft, mag_phase_stft
    from utils.util import load_config, pad_or_trim_to_match

    if not torch.cuda.is_available():
        emit({"event": "error", "code": "no-gpu", "message": "No NVIDIA graphics card is available"})
        return 3
    device = torch.device("cuda")
    relu = nn.ReLU()

    cfg = load_config(args.config)
    n_fft = cfg["stft_cfg"]["n_fft"]
    hop_size = cfg["stft_cfg"]["hop_size"]
    win_size = cfg["stft_cfg"]["win_size"]
    compress_factor = cfg["model_cfg"]["compress_factor"]
    sampling_rate = cfg["stft_cfg"]["sampling_rate"]

    # A local folder: from_pretrained reads model.safetensors from it, no hub call.
    model = SEMamba.from_pretrained(args.model_dir, cfg=cfg).to(device)
    model.eval()

    audio, sample_rate = sf.read(args.input, dtype="float32", always_2d=True)
    noisy = torch.from_numpy(audio.T.copy()).to(device)  # [channels, samples]
    total = noisy.shape[1]
    if total == 0:
        emit({"event": "error", "code": "empty", "message": "The recording has no sound"})
        return 4

    chunk_size = int(args.chunk_seconds * sample_rate)
    hop_length = int(args.hop_portion * chunk_size)
    window = torch.clamp(torch.hann_window(chunk_size).to(device), min=1e-7)
    n_fft_scaled = make_even(n_fft * sample_rate // sampling_rate)
    hop_size_scaled = make_even(hop_size * sample_rate // sampling_rate)
    win_size_scaled = make_even(win_size * sample_rate // sampling_rate)

    enhanced = torch.zeros_like(noisy)
    window_sum = torch.zeros_like(noisy)
    num_chunks = max(1, math.ceil((total - chunk_size) / hop_length) + 1)
    steps = num_chunks * noisy.shape[0]
    done = 0
    with torch.no_grad():
        for channel in range(noisy.shape[0]):
            wav = noisy[channel:channel + 1, :]
            for index in range(num_chunks):
                last = index == num_chunks - 1
                piece = wav[:, -chunk_size:] if last else wav[:, index * hop_length:index * hop_length + chunk_size]
                mag, pha, _ = mag_phase_stft(
                    piece,
                    n_fft=n_fft_scaled,
                    hop_size=hop_size_scaled,
                    win_size=win_size_scaled,
                    compress_factor=compress_factor,
                    center=True,
                    addeps=False,
                )
                amp_g, pha_g, _ = model(mag, pha)
                # Same "strange sweep artifact" guard as the reference script.
                lin = torch.expm1(relu(amp_g))
                zero_portion = torch.sum(lin == 0, 1) / lin.shape[1]
                amp_g[:, :, (zero_portion > 0.5)[0]] = 0
                out = mag_phase_istft(amp_g, pha_g, n_fft_scaled, hop_size_scaled, win_size_scaled, compress_factor)
                out = pad_or_trim_to_match(piece.detach(), out, pad_value=1e-8)
                weights = window[0:out.shape[1]]
                if last:
                    enhanced[channel:channel + 1, -chunk_size:] += out * weights
                    window_sum[channel:channel + 1, -chunk_size:] += weights
                else:
                    start = index * hop_length
                    enhanced[channel:channel + 1, start:start + chunk_size] += out * weights
                    window_sum[channel:channel + 1, start:start + chunk_size] += weights
                done += 1
                emit({"event": "progress", "progress": done / steps})

    enhanced = (enhanced / window_sum).clamp(-1.0, 1.0)
    if enhanced.shape != noisy.shape:
        emit({"event": "error", "code": "length", "message": "Cleaned sound length changed"})
        return 5
    write_pair(sf, args.output, noisy.mean(dim=0).cpu().numpy(), enhanced.mean(dim=0).cpu().numpy(), sample_rate, args.time_map)
    emit({"event": "done", "samples": int(total), "sampleRate": int(sample_rate)})
    return 0


def write_pair(sf, output, original, cleaned, sample_rate, time_map_path):
    """Channel 0 = the original voice, channel 1 = the cleaned voice, sample for
    sample. The preview mixes the two from ONE element, so a half-way Amount can
    never comb-filter from two players drifting a few ms apart."""
    import numpy as np

    if time_map_path:
        with open(time_map_path, "r", encoding="utf-8") as handle:
            time_map = json.load(handle)
        if int(time_map.get("sampleRate", sample_rate)) != int(sample_rate):
            raise ValueError("time map sample rate does not match the audio")
        original = lay_on_media_clock(original, time_map)
        cleaned = lay_on_media_clock(cleaned, time_map)
    pair = np.stack([original, cleaned], axis=1)
    sf.write(output, pair, sample_rate, subtype="PCM_16", format="WAV")


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:  # noqa: BLE001 - reported to the app as one line
        emit({"event": "error", "code": "failed", "message": str(error)})
        sys.exit(1)
