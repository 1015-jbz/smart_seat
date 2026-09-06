"""本地演示音轨生成器

用纯 Python 合成 12 首轻量 WAV 演示曲目，写入 backend/music/ 目录。
相比在线 SoundHelix 音源（海外服务器，国内加载极慢导致"没声音"），
本地文件通过 /music/stream 接口即时播放，且完全离线可用。

用法：python generate_demo_tracks.py（重复执行会跳过已存在的文件）
"""
import math
import random
import wave
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
MUSIC_DIR = BASE_DIR / "music"
MUSIC_DIR.mkdir(parents=True, exist_ok=True)

SAMPLE_RATE = 22050
NOTES_PER_TRACK = 40

# 12 首曲目：编号、风格、基频、音阶（半音偏移）、音符时长
TRACKS = [
    ("01", "电子",   220.0, [0, 3, 5, 7, 10], 0.30),
    ("02", "流行",   262.0, [0, 2, 4, 7, 9],  0.36),
    ("03", "轻音乐", 294.0, [0, 2, 4, 7, 9],  0.45),
    ("04", "摇滚",   165.0, [0, 3, 5, 7, 10], 0.26),
    ("05", "爵士",   233.0, [0, 2, 3, 5, 7, 9, 10], 0.40),
    ("06", "民谣",   196.0, [0, 2, 4, 7, 9],  0.42),
    ("07", "电子",   247.0, [0, 3, 5, 7, 10], 0.28),
    ("08", "流行",   220.0, [0, 2, 4, 7, 9],  0.34),
    ("09", "轻音乐", 330.0, [0, 2, 4, 7, 9],  0.50),
    ("10", "摇滚",   147.0, [0, 3, 5, 7, 10], 0.24),
    ("11", "爵士",   262.0, [0, 2, 3, 5, 7, 9, 10], 0.38),
    ("12", "古典",   294.0, [0, 2, 4, 7, 9],  0.46),
]


def note_freq(base: float, scale: list[int], degree: int) -> float:
    """按音阶度数计算频率（跨八度）。"""
    octave, idx = divmod(degree, len(scale))
    return base * (2 ** ((scale[idx] + 12 * octave) / 12))


def render_note(freq: float, dur: float, gain: float = 0.5) -> list[float]:
    """合成单个音符：基频 + 泛音，带起音/释放包络。"""
    n = int(SAMPLE_RATE * dur)
    attack = int(SAMPLE_RATE * 0.02)
    release = int(SAMPLE_RATE * 0.06)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        # 简单泛音叠加，音色更饱满
        v = (math.sin(2 * math.pi * freq * t)
             + 0.45 * math.sin(2 * math.pi * freq * 2 * t)
             + 0.2 * math.sin(2 * math.pi * freq * 3 * t))
        env = gain
        if i < attack:
            env *= i / attack
        if i > n - release:
            env *= (n - i) / release
        samples.append(v * env / 1.65)
    return samples


def synthesize(seed: int, base: float, scale: list[int], note_dur: float) -> list[float]:
    """随机游走生成旋律 + 低音伴奏。"""
    rng = random.Random(seed)
    total = []
    degree = len(scale)  # 从中间音区开始
    for step in range(NOTES_PER_TRACK):
        degree = max(0, min(len(scale) * 2 - 1, degree + rng.randint(-2, 2)))
        mel = render_note(note_freq(base, scale, degree), note_dur)
        # 每 4 拍叠一个低八度根音作伴奏
        if step % 4 == 0:
            bass = render_note(base / 2, note_dur * 3.6, gain=0.3)
            for i, s in enumerate(bass):
                if i < len(mel):
                    mel[i] += s
                else:
                    mel.append(s)
        total.extend(mel)
    # 整体淡入淡出
    fade = int(SAMPLE_RATE * 0.15)
    for i in range(min(fade, len(total))):
        total[i] *= i / fade
        total[-1 - i] *= i / fade
    return total


def write_wav(path: Path, samples: list[float]) -> None:
    peak = max(abs(s) for s in samples) or 1.0
    frames = bytearray()
    for s in samples:
        v = int(max(-1.0, min(1.0, s / peak * 0.9)) * 32767)
        frames += v.to_bytes(2, "little", signed=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(bytes(frames))


def main() -> None:
    for idx, genre, base, scale, note_dur in TRACKS:
        name = f"小龙座舱 - 演示音轨 {idx}（{genre}）.wav"
        path = MUSIC_DIR / name
        if path.exists():
            print(f"[跳过] {name}（已存在）")
            continue
        samples = synthesize(int(idx), base, scale, note_dur)
        write_wav(path, samples)
        dur = len(samples) / SAMPLE_RATE
        print(f"[生成] {name}（{dur:.1f}s，{path.stat().st_size // 1024}KB）")
    print("完成。刷新曲库或重启后端即可看到本地演示曲目。")


if __name__ == "__main__":
    main()
