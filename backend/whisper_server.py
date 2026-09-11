"""
Whisper 语音识别服务 (STT)
端口: 8767
优先使用 faster-whisper（更轻量），回退到 openai-whisper
"""
import io
import os
import sys
import time
import tempfile
import argparse
import traceback

# ---------- Flask ----------
from flask import Flask, request, jsonify

app = Flask(__name__)

# ---------- 模型加载 ----------
_model = None
_model_type = None  # 'faster' | 'whisper'
_MODEL_SIZE = os.environ.get("WHISPER_MODEL", "small")


def _load_model():
    global _model, _model_type
    if _model is not None:
        return

    print(f"[whisper] 加载模型: {_MODEL_SIZE}")

    # 优先 faster-whisper（不需要完整 PyTorch）
    try:
        from faster_whisper import WhisperModel
        _model = WhisperModel(_MODEL_SIZE, device="cpu", compute_type="int8")
        _model_type = "faster"
        print("[whisper] 使用 faster-whisper ✓")
        return
    except Exception as e:
        print(f"[whisper] faster-whisper 不可用: {e}")

    # 回退 openai-whisper
    try:
        import whisper
        _model = whisper.load_model(_MODEL_SIZE)
        _model_type = "whisper"
        print("[whisper] 使用 openai-whisper ✓")
        return
    except Exception as e:
        print(f"[whisper] openai-whisper 不可用: {e}")

    print("[whisper] 警告: 无可用 Whisper 引擎，STT 功能不可用")


def _transcribe_faster(audio_path, language=None):
    """faster-whisper 转写"""
    segments, info = _model.transcribe(
        audio_path,
        language=language,
        beam_size=5,
        vad_filter=True,
    )
    text_parts = []
    for seg in segments:
        text_parts.append(seg.text.strip())
    return " ".join(text_parts), getattr(info, "language", language or "zh")


def _transcribe_whisper(audio_path, language=None):
    """openai-whisper 转写"""
    result = _model.transcribe(audio_path, language=language)
    return result.get("text", "").strip(), result.get("language", language or "zh")


# ---------- API ----------

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "model": _MODEL_SIZE,
        "engine": _model_type or "not_loaded",
        "model_loaded": _model is not None,
    })


@app.route("/api/transcribe", methods=["POST"])
def transcribe():
    """音频转文字

    请求:
      - multipart/form-data: field "file" (wav/mp3/m4a/ogg/webm...)
      - 或 raw body: audio bytes, Content-Type: audio/wav 等
    查询参数:
      - language: 可选，指定语言 (zh/en/ja 等)
    """
    if _model is None:
        return jsonify({"error": "Whisper 模型未加载"}), 503

    language = request.args.get("language") or request.form.get("language")

    # 获取音频数据
    audio_bytes = None
    content_type = request.content_type or ""

    if "multipart/form-data" in content_type:
        f = request.files.get("file")
        if f is None:
            return jsonify({"error": "缺少 file 字段"}), 400
        audio_bytes = f.read()
        filename = f.filename or "audio.wav"
    elif request.data:
        audio_bytes = request.data
        filename = "audio.wav"
    else:
        return jsonify({"error": "无音频数据"}), 400

    if not audio_bytes or len(audio_bytes) < 100:
        return jsonify({"error": "音频数据过小"}), 400

    # 保存到临时文件
    suffix = os.path.splitext(filename)[1] or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        t0 = time.time()
        if _model_type == "faster":
            text, lang = _transcribe_faster(tmp_path, language)
        else:
            text, lang = _transcribe_whisper(tmp_path, language)
        elapsed = round(time.time() - t0, 2)
        print(f"[whisper] 转写完成 ({elapsed}s, lang={lang}): {text[:80]}...")
        return jsonify({
            "text": text,
            "language": lang,
            "duration_sec": elapsed,
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


@app.route("/api/transcribe_url", methods=["POST"])
def transcribe_url():
    """通过 URL 转写音频

    请求: {"url": "https://...", "language": "zh"}
    """
    if _model is None:
        return jsonify({"error": "Whisper 模型未加载"}), 503

    data = request.get_json(silent=True) or {}
    url = data.get("url")
    language = data.get("language")

    if not url:
        return jsonify({"error": "缺少 url"}), 400

    try:
        import httpx
        resp = httpx.get(url, timeout=30)
        resp.raise_for_status()
        audio_bytes = resp.content
    except Exception as e:
        return jsonify({"error": f"下载音频失败: {e}"}), 400

    suffix = os.path.splitext(url.split("?")[0])[1] or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        t0 = time.time()
        if _model_type == "faster":
            text, lang = _transcribe_faster(tmp_path, language)
        else:
            text, lang = _transcribe_whisper(tmp_path, language)
        elapsed = round(time.time() - t0, 2)
        return jsonify({"text": text, "language": lang, "duration_sec": elapsed})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


# ---------- 启动 ----------
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8767)
    parser.add_argument("--host", default="0.0.0.0")
    args = parser.parse_args()

    _load_model()
    print(f"[whisper] 启动服务: http://{args.host}:{args.port}")
    app.run(host=args.host, port=args.port, debug=False)
