import argparse
import json
import sys

from faster_whisper import WhisperModel


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--device", default="cuda")
    parser.add_argument("--compute-type", default="int8_float16")
    return parser.parse_args()


def transcribe_once(model, request, *, vad_filter):
    segments, info = model.transcribe(
        request["audioPath"],
        language=request.get("language") or "he",
        beam_size=5,
        word_timestamps=True,
        vad_filter=vad_filter,
        condition_on_previous_text=False,
        hotwords=request.get("hotwords"),
    )
    return {
        "language": info.language,
        "languageProbability": info.language_probability,
        "segments": [
            {
                "start": segment.start,
                "end": segment.end,
                "text": segment.text,
                "words": [
                    {
                        "word": word.word,
                        "start": word.start,
                        "end": word.end,
                        "probability": word.probability,
                    }
                    for word in (segment.words or [])
                ],
            }
            for segment in segments
        ],
    }


def transcribe(model, request):
    try:
        return transcribe_once(model, request, vad_filter=False)
    except IndexError as error:
        if "boolean index did not match indexed array" not in str(error):
            raise
        return transcribe_once(model, request, vad_filter=True)


def main():
    args = parse_args()
    model = WhisperModel(
        args.model,
        device=args.device,
        compute_type=args.compute_type,
    )
    for line in sys.stdin:
        try:
            request = json.loads(line)
            result = transcribe(model, request)
            response = {"id": request["id"], "result": result}
        except Exception as error:
            response = {
                "id": request.get("id") if "request" in locals() else None,
                "error": f"{type(error).__name__}: {error}",
            }
        print(json.dumps(response, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
