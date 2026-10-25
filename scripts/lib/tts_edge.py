#!/usr/bin/env python3
"""用 edge-tts 合成一句中文/英文旁白，并输出词级时间戳。

edge-tts 是微软 Edge 朗读接口的非官方封装：免费、无需账号，但需要联网。
CLI 默认只给句级边界；这里显式请求 WordBoundary，拿词级 offset/duration。

用法：
  python tts_edge.py --text "..." --voice zh-CN-XiaoxiaoNeural --rate +10% \
    --out l1.mp3 --words-out l1.words.json
"""
from __future__ import annotations

import argparse
import asyncio
import json
import subprocess
import sys
from pathlib import Path

try:
    import edge_tts
except ImportError:  # pragma: no cover
    print("缺少 edge-tts。安装：python3 -m venv .venv-tts && .venv-tts/bin/pip install edge-tts", file=sys.stderr)
    raise SystemExit(2)


def ffprobe_duration(path: Path) -> float:
    out = subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", str(path)],
        text=True,
    )
    return round(float(out.strip()), 3)


async def synthesize(args: argparse.Namespace) -> dict:
    last_error: Exception | None = None
    for attempt in range(1, args.retries + 1):
        try:
            communicate = edge_tts.Communicate(
                args.text,
                args.voice,
                rate=args.rate,
                pitch=args.pitch,
                volume=args.volume,
                boundary="WordBoundary",
                connect_timeout=15,
                receive_timeout=90,
                proxy=args.proxy or None,
            )
            audio = bytearray()
            words: list[dict] = []
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio.extend(chunk["data"])
                elif chunk["type"] == "WordBoundary":
                    start = chunk["offset"] / 10_000_000
                    end = start + chunk["duration"] / 10_000_000
                    words.append({
                        "text": chunk["text"],
                        "start": round(start, 4),
                        "end": round(end, 4),
                    })
            if not audio:
                raise RuntimeError("接口返回了空音频")
            if not words:
                raise RuntimeError("接口没有返回词级边界")

            out = Path(args.out)
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(bytes(audio))

            duration = ffprobe_duration(out)
            speech_end = min(words[-1]["end"], duration)
            payload = {
                "ok": True,
                "provider": "edge",
                "voice": args.voice,
                "rate": args.rate,
                "pitch": args.pitch,
                "volume": args.volume,
                "text": args.text,
                "duration": duration,
                "speechEnd": round(speech_end, 3),
                "words": words,
                "attempt": attempt,
            }
            Path(args.words_out).write_text(
                json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            return payload
        except Exception as error:  # noqa: BLE001 - 网络错误种类很多，统一重试
            last_error = error
            if attempt < args.retries:
                delay = min(8.0, 1.5 * attempt)
                print(
                    f"edge-tts 第 {attempt}/{args.retries} 次失败：{type(error).__name__}: {error}；"
                    f"{delay:.1f}s 后重试",
                    file=sys.stderr,
                )
                await asyncio.sleep(delay)
    raise RuntimeError(f"edge-tts 连续 {args.retries} 次失败：{last_error}")


def main() -> None:
    parser = argparse.ArgumentParser(description="edge-tts 单句合成 + 词级时间戳")
    parser.add_argument("--text", required=True)
    parser.add_argument("--voice", default="zh-CN-XiaoxiaoNeural")
    parser.add_argument("--rate", default="+0%")
    parser.add_argument("--pitch", default="+0Hz")
    parser.add_argument("--volume", default="+0%")
    parser.add_argument("--out", required=True, help="输出 mp3")
    parser.add_argument("--words-out", required=True, help="输出词级 JSON")
    parser.add_argument("--retries", type=int, default=5)
    parser.add_argument("--proxy", default="", help="可选 HTTP 代理，例如 http://127.0.0.1:1082")
    args = parser.parse_args()

    try:
        result = asyncio.run(synthesize(args))
    except Exception as error:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(2)

    print(json.dumps({
        "ok": True,
        "duration": result["duration"],
        "speechEnd": result["speechEnd"],
        "words": len(result["words"]),
        "attempt": result["attempt"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
