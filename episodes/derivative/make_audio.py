"""Original 10-second ambient bed for the derivative short.

A slow A-major pad, filtered air, a low swell and one soft bell as the secant
settles into the tangent. No samples, no third-party material.
"""

import wave

import numpy as np

SR = 48_000
DURATION = 10.0
N = int(SR * DURATION)
T = np.arange(N) / SR
RNG = np.random.default_rng(23)

BELL_START = 6.05
TARGET_PEAK = 0.72
LOUDNESS_TRIM = 0.624


def smoothstep(x: np.ndarray) -> np.ndarray:
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3.0 - 2.0 * x)


def fade_envelope(n: int, attack: float, release: float) -> np.ndarray:
    env = np.ones(n)
    a = int(attack * SR)
    r = int(release * SR)
    env[:a] = smoothstep(np.linspace(0.0, 1.0, a))
    env[-r:] = smoothstep(np.linspace(1.0, 0.0, r))
    return env


def one_pole(x: np.ndarray, alpha: float) -> np.ndarray:
    y = np.empty_like(x)
    y[0] = x[0]
    for i in range(1, len(x)):
        y[i] = alpha * x[i] + (1.0 - alpha) * y[i - 1]
    return y


def make_pad() -> tuple[np.ndarray, np.ndarray]:
    # A2, E3, A3, C#4, E4: open, resolved, never triumphant.
    notes = [
        (110.00, 0.34, -0.32),
        (164.81, 0.26, 0.22),
        (220.00, 0.20, -0.14),
        (277.18, 0.15, 0.30),
        (329.63, 0.10, -0.24),
    ]
    left = np.zeros(N)
    right = np.zeros(N)
    for i, (freq, amp, pan) in enumerate(notes):
        for channel, sign in ((left, -1), (right, 1)):
            detune = sign * (0.045 + 0.012 * i)
            phase = RNG.uniform(0.0, 2.0 * np.pi)
            w = 2.0 * np.pi * (freq + detune) * T + phase
            tone = (
                np.sin(w)
                + 0.26 * np.sin(2.0 * w + 0.7)
                + 0.09 * np.sin(3.0 * w + 1.3)
                + 0.035 * np.sin(4.0 * w + 2.1)
            )
            lfo = 1.0 + 0.10 * np.sin(2.0 * np.pi * 0.065 * T + i * 1.7)
            channel += (
                amp
                * tone
                * lfo
                * (1.0 - 0.35 * abs(pan))
                * (1.0 + 0.12 * pan * sign)
            )

    # A little air, low-passed; it keeps the pad from sounding like a test tone.
    noise = RNG.normal(0.0, 1.0, N)
    air = one_pole(noise, 0.035) * 0.014
    left += air * 1.03
    right += air * 0.97
    return left, right


def make_bell() -> tuple[int, np.ndarray]:
    length = min(N - int(BELL_START * SR), int(3.2 * SR))
    tt = np.arange(length) / SR
    attack = smoothstep(np.clip(tt / 0.025, 0.0, 1.0))
    decay = np.exp(-tt / 0.95)
    body = (
        np.sin(2.0 * np.pi * 880.0 * tt)
        + 0.42 * np.sin(2.0 * np.pi * 880.0 * 2.01 * tt + 0.4)
        + 0.20 * np.sin(2.0 * np.pi * 880.0 * 3.01 * tt + 1.1)
        + 0.09 * np.sin(2.0 * np.pi * 880.0 * 4.98 * tt + 2.2)
    )
    return int(BELL_START * SR), 0.24 * body * attack * decay


def main() -> None:
    left, right = make_pad()

    # Duck the bed a little so the bell has room, then let it breathe back.
    duck = 1.0 - 0.30 * smoothstep((T - 5.65) / 0.4) * (
        1.0 - smoothstep((T - 7.4) / 1.2)
    )
    left *= duck
    right *= duck

    i0, bell = make_bell()
    length = len(bell)
    left[i0 : i0 + length] += bell * 0.94
    right[i0 : i0 + length] += bell * 1.00

    # Three quiet reflections, panned slightly apart.
    for delay, gain in ((0.11, 0.34), (0.23, 0.20), (0.37, 0.12)):
        d = int(delay * SR)
        m = max(0, min(length, N - (i0 + d)))
        left[i0 + d : i0 + d + m] += bell[:m] * gain * (1.0 if d % 2 else 0.92)
        right[i0 + d : i0 + d + m] += bell[:m] * gain * (0.92 if d % 2 else 1.0)

    # A 55 Hz swell under the answer, almost felt rather than heard.
    swell = (
        0.055
        * np.sin(2.0 * np.pi * 55.0 * T)
        * smoothstep((T - 5.5) / 0.8)
        * np.exp(-np.maximum(T - 6.3, 0.0) / 1.6)
    )
    left += swell
    right += swell

    master = fade_envelope(N, attack=1.35, release=1.45)
    left = one_pole(left * master, 0.45)
    right = one_pole(right * master, 0.45)

    peak = max(np.max(np.abs(left)), np.max(np.abs(right)))
    left *= TARGET_PEAK / peak
    right *= TARGET_PEAK / peak

    # Trim to the series' bed level (measured: the peak-normalised mix sits
    # around -11.9 LUFS, and the house standard for a pad is -16).
    left *= LOUDNESS_TRIM
    right *= LOUDNESS_TRIM

    pcm = (np.clip(np.stack([left, right], axis=1), -1.0, 1.0) * 32767).astype(
        np.int16
    )
    with wave.open("derivative-audio.wav", "wb") as f:
        f.setnchannels(2)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes(pcm.tobytes())
    print(f"wrote derivative-audio.wav ({DURATION:.1f}s, {SR} Hz, stereo)")


if __name__ == "__main__":
    main()
