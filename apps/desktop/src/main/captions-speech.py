"""One-shot speech transcription for captions.

Prints a single JSON object: {"language", "languageProbability", "words": [{"word","start","end"}]}.
Tries the GPU first and quietly falls back to the CPU, so it works on any computer.
"""
import argparse
import json
import sys

from faster_whisper import WhisperModel


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--audio", required=True)
    parser.add_argument("--language", default="")
    parser.add_argument("--device", default="cuda")
    parser.add_argument("--compute-type", default="int8_float16")
    parser.add_argument("--detect-only", action="store_true")
    return parser.parse_args()


def run(args, device, compute_type):
    model = WhisperModel(args.model, device=device, compute_type=compute_type)
    language = args.language or None
    if args.detect_only:
        _segments, info = model.transcribe(args.audio, language=language, beam_size=1, vad_filter=True, without_timestamps=True)
        return {"language": info.language, "languageProbability": info.language_probability, "words": []}
    segments, info = model.transcribe(
        args.audio,
        language=language,
        beam_size=5,
        word_timestamps=True,
        vad_filter=True,
        condition_on_previous_text=False,
    )
    words = []
    for segment in segments:
        for word in segment.words or []:
            words.append({"word": word.word, "start": word.start, "end": word.end})
    return {"language": info.language, "languageProbability": info.language_probability, "words": words}


def main():
    args = parse_args()
    try:
        result = run(args, args.device, args.compute_type)
    except Exception as error:  # GPU libraries missing or out of memory: use the CPU instead.
        if args.device == "cpu":
            raise
        print(f"gpu unavailable ({type(error).__name__}), using cpu", file=sys.stderr)
        result = run(args, "cpu", "int8")
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
