#!/usr/bin/env python3
"""把 manimgx 的 raw 渲成 CFR 成片；raw 是中间片，不直接进剪辑软件。

用法：
  python assemble.py --raw out/raw.mp4 --out out/final.mp4 --fps 30 [--audio audio/master.wav]
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import time
from pathlib import Path


def acquire_lock() -> Path:
    directory = Path(".dsh-motion")
    directory.mkdir(exist_ok=True)
    lock = directory / "project.lock"
    try:
        fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError as error:
        raise SystemExit(f"项目被占用：{lock}（等它结束或删除该文件）") from error
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write(json.dumps({"pid": os.getpid(), "command": "assemble",
                                 "startedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}))
    return lock


def record(duration: float, out: str) -> None:
    ledger = Path(".dsh-motion")
    ledger.mkdir(exist_ok=True)
    event = {"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
             "phase": "assemble", "activeSec": round(duration, 3),
             "wallSec": round(duration, 3), "output": out}
    with (ledger / "metrics.jsonl").open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, ensure_ascii=False) + "\n")


def main() -> None:
    started = time.time()
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--fps", type=int, default=30)
    parser.add_argument("--audio", default="")
    args = parser.parse_args()

    command = [
        "ffmpeg", "-v", "error", "-y", "-i", args.raw,
        "-vf", f"fps={args.fps}",
        "-fps_mode", "cfr", "-r", str(args.fps),
        "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p",
    ]
    if args.audio:
        command += ["-i", args.audio, "-map", "0:v:0", "-map", "1:a:0",
                    "-c:a", "aac", "-b:a", "192k", "-shortest"]
    else:
        command += ["-an"]
    command += ["-movflags", "+faststart", args.out]
    lock = acquire_lock()
    try:
        subprocess.run(command, check=True)
        record(time.time() - started, args.out)
    finally:
        lock.unlink(missing_ok=True)
    print(f"assemble {args.raw} -> {args.out} (CFR {args.fps})")


if __name__ == "__main__":
    main()
