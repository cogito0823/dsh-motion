#!/usr/bin/env python3
"""把逐句人声、可选音乐铺底合成 48 kHz 立体声母带。

人声按 timing.json 的 start 放置；音乐自动对齐人声电平，
并在人声出现时只压中高频（保留低频），最后写 24-bit WAV。

用法：
  python mix_audio.py --timing audio/edge/timing.json --out audio/premaster.wav \
    --music audio/bed.wav --duck 0.35
"""
from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

SR = 48_000


def decode(path: Path, channels: int) -> np.ndarray:
    command = [
        "ffmpeg", "-v", "error", "-i", str(path),
        "-f", "f32le", "-ac", str(channels), "-ar", str(SR), "-",
    ]
    raw = subprocess.run(command, check=True, stdout=subprocess.PIPE).stdout
    data = np.frombuffer(raw, dtype="<f4").astype(np.float64)
    if channels == 1:
        return data
    return data.reshape(-1, channels)


def write_wav24(path: Path, stereo: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    stereo = np.clip(stereo, -1.0, 1.0)
    ints = np.round(stereo * 8_388_607.0).astype("<i4")
    raw = ints.view(np.uint8).reshape(-1, 4)[:, :3].tobytes()
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(3)
        wav.setframerate(SR)
        wav.writeframes(raw)


def rms(x: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(x)))) if x.size else 0.0


def fir_lowpass(x: np.ndarray, cutoff: float, taps: int = 129) -> np.ndarray:
    n = np.arange(taps) - (taps - 1) / 2
    kernel = np.sinc(2.0 * cutoff / SR * n) * np.hamming(taps)
    kernel /= kernel.sum()
    if x.ndim == 1:
        return np.convolve(x, kernel, mode="same")
    return np.column_stack([
        np.convolve(x[:, channel], kernel, mode="same")
        for channel in range(x.shape[1])
    ])


def smooth_envelope(x: np.ndarray, attack: float = 0.015, release: float = 0.25) -> np.ndarray:
    attack_coeff = math.exp(-1.0 / (SR * attack))
    release_coeff = math.exp(-1.0 / (SR * release))
    envelope = np.empty_like(x)
    level = 0.0
    for index, value in enumerate(np.abs(x)):
        coeff = attack_coeff if value > level else release_coeff
        level = (1.0 - coeff) * value + coeff * level
        envelope[index] = level
    return envelope


def fit_music(music: np.ndarray, length: int) -> np.ndarray:
    if len(music) >= length:
        return music[:length].copy()
    repeats = math.ceil(length / len(music))
    return np.tile(music, (repeats, 1))[:length]


def main() -> None:
    parser = argparse.ArgumentParser(description="旁白人声 + 音乐混音")
    parser.add_argument("--timing", required=True)
    parser.add_argument("--out", required=True, help="输出 premaster WAV")
    parser.add_argument("--music", default="", help="可选音乐 WAV/MP3")
    parser.add_argument("--duck", type=float, default=0.35, help="人声期间中高频压低比例，0–0.8")
    parser.add_argument("--music-db", type=float, default=-18.0, help="音乐 RMS 相对人声 RMS 的 dB")
    parser.add_argument("--duration", type=float, default=0.0)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    timing_path = Path(args.timing).resolve()
    timing = json.loads(timing_path.read_text(encoding="utf-8"))
    lines = timing.get("lines") or []
    if not lines:
        raise SystemExit(f"{timing_path} 里没有 lines")

    duration = args.duration or float(timing.get("duration") or 0)
    if not duration:
        duration = max(float(line.get("audioEnd") or line["end"]) for line in lines) + 0.5
    length = int(round(duration * SR))

    voice = np.zeros(length, dtype=np.float64)
    stems_dir = timing_path.parent
    warnings: list[str] = []
    used = 0
    for line in lines:
        stem = stems_dir / f"l{line['id']}.mp3"
        if not stem.exists():
            raise SystemExit(f"缺少人声文件: {stem}")
        segment = decode(stem, 1)
        peak = float(np.max(np.abs(segment))) if segment.size else 0.0
        if peak > 0:
            segment = segment / peak * 0.8
        fade = min(len(segment), int(0.008 * SR))
        if fade:
            ramp = np.linspace(0.0, 1.0, fade)
            segment[:fade] *= ramp ** 2
            segment[-fade:] *= (ramp[::-1]) ** 2
        start = max(0, int(round(float(line["start"]) * SR)))
        if start >= length:
            warnings.append(f"L{line['id']} 起点 {line['start']}s 超出成片时长")
            continue
        stop = min(length, start + len(segment))
        voice[start:stop] += segment[: stop - start]
        used += 1

    music = np.zeros((length, 2), dtype=np.float64)
    music_rms = 0.0
    if args.music:
        source = Path(args.music).resolve()
        if not source.exists():
            raise SystemExit(f"找不到音乐: {source}")
        music = fit_music(decode(source, 2), length)
        music_rms = rms(music)
        voice_rms = rms(voice)
        if music_rms > 0 and voice_rms > 0:
            target = voice_rms * 10 ** (args.music_db / 20.0)
            music *= target / music_rms
            music_rms = rms(music)
        duck = min(0.8, max(0.0, args.duck))
        envelope = smooth_envelope(voice)
        peak = float(np.max(envelope)) if envelope.size else 0.0
        if peak > 0:
            envelope /= peak
        low = fir_lowpass(music, 260.0)
        high = music - low
        music = low + high * (1.0 - duck * envelope[:, None])

    mix = voice[:, None] + music
    fade_in = min(length, int(0.25 * SR))
    fade_out = min(length, int(0.45 * SR))
    if fade_in:
        mix[:fade_in] *= np.linspace(0.0, 1.0, fade_in)[:, None] ** 0.6
    if fade_out:
        mix[-fade_out:] *= np.linspace(1.0, 0.0, fade_out)[:, None] ** 0.7
    peak = float(np.max(np.abs(mix))) if mix.size else 0.0
    if peak > 0:
        mix = mix / peak * 0.72

    out = Path(args.out).resolve()
    write_wav24(out, mix)

    summary = {
        "ok": True,
        "duration": duration,
        "stems": used,
        "voiceRms": round(rms(voice), 6),
        "musicRms": round(music_rms, 6),
        "duck": args.duck,
        "warnings": warnings,
        "out": str(out),
    }
    if args.json:
        print(json.dumps(summary, ensure_ascii=False))
    else:
        print(f"premaster {out}  {duration:.2f}s  stems={used}  voiceRMS={summary['voiceRms']:.4f}")
        for warning in warnings:
            print(f"warn {warning}", file=sys.stderr)


if __name__ == "__main__":
    main()
