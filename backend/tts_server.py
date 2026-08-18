"""
智能 TTS 服务 — 多引擎 + 情绪切音 + 文本预处理

架构:
  1. Edge TTS（微软 Azure 神经网络语音，8 种中文音色）— 优先
  2. WinRT SpeechSynthesizer（Windows 本地语音，3 声道）— 离线兜底
  3. pyttsx3（SAPI5 基础语音）— 最终兜底

特性:
  - 8 种语音角色（动漫风/温柔日常/专业播报/方言趣味）
  - EMOTION_VOICE_MAP：摄像头检测到表情后自动切换音色参数
  - _preprocess_tts_text：文本预处理消除 AI 感
  - 熔断器：Edge TTS 连续失败 3 次后自动降级到 WinRT，5 分钟后重试

端点:
  GET /api/tts?text=xxx&role=0&emotion=neutral   生成音频
  GET /api/voices                                  获取可用音色列表
  GET /api/health                                  健康检查
"""
import io
import os
import hashlib as _hashlib

VOICE_CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "voice_cache")
import re
import time
import asyncio
import logging
import threading
import random
import html
from flask import Flask, Response, request, jsonify

logging.basicConfig(level=logging.INFO, format='%(levelname)s | %(message)s')
logger = logging.getLogger("tts_server")

app = Flask(__name__)

@app.after_request
def _add_cors(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = '*'
    response.headers['Access-Control-Allow-Methods'] = '*'
    return response


# ============================================================
# 1. 文本预处理 — 消除 AI 感
# ============================================================
# 正式用语 → 口语化替换表
FORMAL_TO_CASUAL = [
    # 长匹配优先（避免短匹配吃掉长匹配的子串）
    (r'智能座舱为您服务', '我在这儿呢'),
    (r'祝您一路平安', '路上注意安全哈'),
    (r'请说您的需求', '说吧'),
    (r'风量已调至', '风量调到'),
    (r'温度设置为', '温度调到'),
    (r'开启制冷模式', '制冷开着呢'),
    (r'开启制热模式', '暖和点了'),
    (r'已为您', '帮你'),
    (r'已将', '帮把'),
    (r'为您', '给你'),
    (r'请稍后再试', '等下再试试'),
    (r'非常抱歉', '不好意思'),
    (r'暂时不可用', '暂时用不了'),
    (r'已调低', '调低了'),
    (r'已调高', '调高了'),
    (r'已切换', '切过去了'),
    (r'已暂停', '暂停了'),
    (r'已关闭', '关了'),
    (r'已打开', '打开了'),
    (r'已接通', '接通了'),
    (r'已结束', '结束了'),
]


def _preprocess_tts_text(text):
    """合成前对文本做处理，让语音更像真人说话"""
    if not text:
        return text

    # ① 正式用语 → 口语化（最重要的一步）
    for pattern, replacement in FORMAL_TO_CASUAL:
        text = re.sub(pattern, replacement, text)

    # ② 标点简化：多个感叹号/问号压缩为单个
    text = re.sub(r'[！!]{2,}', '！', text)
    text = re.sub(r'[？?]{2,}', '？', text)
    text = re.sub(r'[。…]{2,}', '。', text)

    # ③ 句尾软化（25% 概率，不太频繁避免刻意感）
    if text.endswith('。') and random.random() < 0.25:
        softeners = ['呀。', '呢。', '吧。', '啦。', '嘛。']
        text = text[:-1] + random.choice(softeners)

    return text


# ============================================================
# 2. 八种音色角色
# ============================================================
# Edge TTS 神经网络语音
EDGE_VOICE_MAP = {
    0: {"voice": "zh-CN-XiaoyiNeural",              "rate": "+12%", "pitch": "+5Hz",  "volume": "+0%"},   # 晓伊 - 活泼少女（提速+提调，更灵动）
    1: {"voice": "zh-CN-XiaohanNeural",             "rate": "+8%",  "pitch": "+2Hz",  "volume": "+0%"},   # 小梦 - 可爱少女（晓墨声线，略快+略高）
    2: {"voice": "zh-CN-XiaoxiaoNeural",             "rate": "-5%",  "pitch": "-2Hz",  "volume": "+0%"},   # 晓晓 - 温柔姐姐（略慢+略低，更柔）
    3: {"voice": "zh-CN-YunxiNeural",                "rate": "+0%",  "pitch": "+0Hz",  "volume": "+0%"},   # 云希 - 阳光少年（自然语速）
    4: {"voice": "zh-CN-YunjianNeural",              "rate": "+8%",  "pitch": "-2Hz",  "volume": "+8%"},   # 云健 - 热血青年（快+有力）
    5: {"voice": "zh-CN-YunyangNeural",              "rate": "-8%",  "pitch": "-5Hz",  "volume": "+0%"},   # 云扬 - 专业播报（沉稳）
    6: {"voice": "zh-CN-liaoning-XiaobeiNeural",     "rate": "+3%",  "pitch": "-3Hz",  "volume": "+0%"},   # 晓北 - 东北话（自然+略低）
    7: {"voice": "zh-CN-shaanxi-XiaoniNeural",       "rate": "-2%",  "pitch": "-2Hz",  "volume": "+0%"},   # 晓妮 - 陕西话（略慢+柔）
}

# WinRT 本地语音兜底映射（3 个声道 × 不同参数模拟 8 种角色）
WINRT_VOICE_MAP = {
    0: {"voice_idx": 0, "rate": "+25%", "pitch": "+15%"},   # 晓伊 → Huihui 快+高
    1: {"voice_idx": 0, "rate": "+15%", "pitch": "+8%"},    # 小梦 → Huihui 中快+中高
    2: {"voice_idx": 1, "rate": "-5%",  "pitch": "+3%"},    # 晓晓 → Yaoyao 略慢
    3: {"voice_idx": 2, "rate": "+10%", "pitch": "+5%"},    # 云希 → Kangkang 略快
    4: {"voice_idx": 2, "rate": "+18%", "pitch": "+0%"},    # 云健 → Kangkang 快+大声
    5: {"voice_idx": 2, "rate": "-8%",  "pitch": "-12%"},   # 云扬 → Kangkang 慢+低
    6: {"voice_idx": 0, "rate": "-10%", "pitch": "-8%"},    # 晓北 → Huihui 慢+低（模拟方言）
    7: {"voice_idx": 1, "rate": "+5%",  "pitch": "-5%"},    # 晓妮 → Yaoyao 略快+低（模拟方言）
}

ROLE_INFO = [
    {"id": 0, "name": "晓伊", "gender": "female", "desc": "活泼少女", "category": "动漫风"},
    {"id": 1, "name": "小梦", "gender": "female", "desc": "甜美少女", "category": "动漫风"},
    {"id": 2, "name": "晓晓", "gender": "female", "desc": "温柔姐姐", "category": "温柔日常"},
    {"id": 3, "name": "云希", "gender": "male",   "desc": "阳光少年", "category": "温柔日常"},
    {"id": 4, "name": "云健", "gender": "male",   "desc": "热血青年", "category": "温柔日常"},
    {"id": 5, "name": "云扬", "gender": "male",   "desc": "专业播报", "category": "专业播报"},
    {"id": 6, "name": "晓北", "gender": "female", "desc": "东北话",   "category": "方言趣味"},
    {"id": 7, "name": "晓妮", "gender": "female", "desc": "陕西话",   "category": "方言趣味"},
]


# ============================================================
# 3. 情绪 → 音色参数自动切换
# ============================================================
EMOTION_VOICE_MAP = {
"happy":     {"rate_adj": "+8%",  "pitch_adj": "+5%",  "volume": "+3%"},   # 开心
"sad":       {"rate_adj": "-10%", "pitch_adj": "-3%",  "volume": "-5%"},   # 悲伤
"angry":     {"rate_adj": "+3%",  "pitch_adj": "-2%",  "volume": "+8%"},   # 愤怒
"surprised": {"rate_adj": "+10%", "pitch_adj": "+8%",  "volume": "+3%"},   # 惊讶
"fearful":   {"rate_adj": "-3%",  "pitch_adj": "+3%",  "volume": "-3%"},   # 恐惧
    "neutral":   {"rate_adj": "+0%",  "pitch_adj": "+0%",  "volume": "+0%"},   # 平静 → 默认
"disgusted": {"rate_adj": "-8%",  "pitch_adj": "-2%",  "volume": "-3%"},   # 厌恶
    # 疲劳状态（由摄像头安全检测触发）
"fatigue":   {"rate_adj": "-8%",  "pitch_adj": "-3%",  "volume": "-5%"},   # 疲劳
}

def _combine_pct(base, adj):
    """合并两个百分比字符串: '+10%' + '+5%' = '+15%'"""
    try:
        base_val = int(base.replace('%', '').replace('+', ''))
        adj_val = int(adj.replace('%', '').replace('+', ''))
        result = base_val + adj_val
        return f"{'+' if result >= 0 else ''}{result}%"
    except (ValueError, AttributeError):
        return base


# ============================================================
# 4. Edge TTS 引擎（带熔断器）
# ============================================================
_edge_tts_available = False
try:
    import edge_tts
    _edge_tts_available = True
    logger.info("Edge TTS 库已加载")
except ImportError:
    logger.warning("Edge TTS 未安装")

# 熔断器状态
_edge_failures = 0
_edge_disabled_until = 0
_edge_lock = threading.Lock()
_EDGE_MAX_FAILURES = 3
_EDGE_DISABLE_DURATION = 300  # 5 分钟

def _edge_tts_ready():
    """检查 Edge TTS 是否可用（未被熔断）"""
    if not _edge_tts_available:
        return False
    with _edge_lock:
        return time.time() > _edge_disabled_until

def _edge_tts_record_failure():
    """记录 Edge TTS 失败，触发熔断"""
    global _edge_failures, _edge_disabled_until
    with _edge_lock:
        _edge_failures += 1
        if _edge_failures >= _EDGE_MAX_FAILURES:
            _edge_disabled_until = time.time() + _EDGE_DISABLE_DURATION
            logger.warning(f"Edge TTS 连续失败 {_edge_failures} 次，熔断 {_EDGE_DISABLE_DURATION}s")

def _edge_tts_record_success():
    """记录 Edge TTS 成功，重置熔断计数"""
    global _edge_failures
    with _edge_lock:
        if _edge_failures > 0:
            _edge_failures = 0
            logger.info("Edge TTS 恢复正常，熔断器重置")

def _pct_to_hz(pct_str):
    """将百分比音高转为 Edge TTS 的 Hz 格式: '+8%' → '+8Hz'"""
    try:
        val = int(pct_str.replace('%', '').replace('+', ''))
        return f"{'+' if val >= 0 else ''}{val}Hz"
    except (ValueError, AttributeError):
        return "+0Hz"

async def _generate_edge_tts(text, role, emotion):
    """使用 Edge TTS 生成语音"""
    profile = EDGE_VOICE_MAP.get(role, EDGE_VOICE_MAP[2])
    emo = EMOTION_VOICE_MAP.get(emotion, EMOTION_VOICE_MAP["neutral"])

    voice = profile["voice"]
    rate = _combine_pct(profile["rate"], emo["rate_adj"])
    pitch_pct = _combine_pct(profile["pitch"], emo["pitch_adj"])
    pitch = _pct_to_hz(pitch_pct)  # Edge TTS 需要 Hz 格式
    volume = _combine_pct(profile["volume"], emo["volume"])

    communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch, volume=volume)
    audio_data = io.BytesIO()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_data.write(chunk["data"])
    return audio_data.getvalue(), "audio/mpeg"


# ============================================================
# 5. WinRT 本地语音引擎
# ============================================================
_winrt_available = False
_winrt_voices = []

try:
    from winsdk.windows.media.speechsynthesis import SpeechSynthesizer
    from winsdk.windows.storage.streams import DataReader

    _winrt_voices = list(SpeechSynthesizer.all_voices)
    _winrt_available = True
    logger.info(f"WinRT TTS 就绪，共 {len(_winrt_voices)} 个语音")
    for v in _winrt_voices:
        logger.info(f"  - {v.display_name} | {v.language} | gender={v.gender}")
except Exception as e:
    logger.warning(f"WinRT TTS 不可用: {e}")

_tls = threading.local()

def _get_synthesizer():
    if not hasattr(_tls, 'synth'):
        _tls.synth = SpeechSynthesizer()
    return _tls.synth

async def _generate_winrt_tts(text, role, emotion):
    """使用 WinRT SpeechSynthesizer 生成语音"""
    profile = WINRT_VOICE_MAP.get(role, WINRT_VOICE_MAP[2])
    emo = EMOTION_VOICE_MAP.get(emotion, EMOTION_VOICE_MAP["neutral"])

    voice_idx = profile["voice_idx"]
    rate = _combine_pct(profile["rate"], emo["rate_adj"])
    pitch = _combine_pct(profile["pitch"], emo["pitch_adj"])

    # 音量: 100 为默认，情绪调整映射到 0-100
    vol_base = 100
    try:
        vol_adj = int(emo["volume"].replace('%', '').replace('+', ''))
        volume = max(0, min(100, vol_base + vol_adj))
    except (ValueError, AttributeError):
        volume = 100

    synth = _get_synthesizer()
    if voice_idx < len(_winrt_voices):
        synth.voice = _winrt_voices[voice_idx]

    safe_text = html.escape(text)
    ssml = f'''<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
  <prosody rate="{rate}" pitch="{pitch}" volume="{volume}">{safe_text}</prosody>
</speak>'''

    result = await synth.synthesize_ssml_to_stream_async(ssml)
    input_stream = result.get_input_stream_at(0)
    reader = DataReader(input_stream)
    await reader.load_async(10 * 1024 * 1024)
    byte_count = reader.unconsumed_buffer_length
    if byte_count == 0:
        return b"", "audio/wav"
    buffer = reader.read_buffer(byte_count)
    return bytes(buffer), "audio/wav"


# ============================================================
# 6. pyttsx3 最终兜底
# ============================================================
_pyttsx3_engine = None
_pyttsx3_lock = threading.Lock()

def _generate_pyttsx3_tts(text, role, emotion):
    """使用 pyttsx3 生成语音（最终兜底）"""
    global _pyttsx3_engine
    with _pyttsx3_lock:
        if _pyttsx3_engine is None:
            import pyttsx3
            _pyttsx3_engine = pyttsx3.init()

        rate_adj = {
            0: 50, 1: 30, 2: -20, 3: 20,
            4: 40, 5: -30, 6: -10, 7: 10,
        }
        emo_adj = {
            "happy": 20, "sad": -30, "angry": 10, "surprised": 30,
            "neutral": 0, "fatigue": -20,
        }
        base_rate = _pyttsx3_engine.getProperty('rate')
        _pyttsx3_engine.setProperty('rate', base_rate + rate_adj.get(role, 0) + emo_adj.get(emotion, 0))

        wav_buf = io.BytesIO()
        _pyttsx3_engine.save_to_file(text, wav_buf)
        _pyttsx3_engine.runAndWait()
        return wav_buf.getvalue(), "audio/wav"


# ============================================================
# 7. 统一 TTS 入口
# ============================================================

# ============================================================
# 6.5 TTS 内存缓存（避免重复生成相同文本）
# ============================================================
import hashlib
from collections import OrderedDict

_TTS_CACHE_MAX = 50
_tts_cache = OrderedDict()
_tts_cache_lock = threading.Lock()

def _cache_key(text, role, emotion):
    raw = f"{text}|{role}|{emotion}"
    return hashlib.md5(raw.encode('utf-8')).hexdigest()

def _cache_get(key):
    with _tts_cache_lock:
        if key in _tts_cache:
            _tts_cache.move_to_end(key)
            return _tts_cache[key]
    return None

def _cache_put(key, value):
    with _tts_cache_lock:
        _tts_cache[key] = value
        _tts_cache.move_to_end(key)
        if len(_tts_cache) > _TTS_CACHE_MAX:
            _tts_cache.popitem(last=False)


def _do_tts(text, role, emotion):
    """多引擎 TTS：Edge TTS → WinRT → pyttsx3（带缓存）"""
    # 缓存检查
    ckey = _cache_key(text, role, emotion)
    cached = _cache_get(ckey)
    if cached:
        audio, mime, engine = cached
        logger.info(f"TTS CACHE HIT: role={role}, emotion={emotion}, text='{text[:20]}...'")
        return audio, mime, engine + "-cached"

    # 文本预处理
    processed_text = _preprocess_tts_text(text)
    logger.info(f"TTS: role={role}, emotion={emotion}, text='{text[:30]}...' → '{processed_text[:30]}...'")

    # ① Edge TTS（优先，带熔断器）
    if _edge_tts_ready():
        try:
            loop = asyncio.new_event_loop()
            try:
                audio, mime = loop.run_until_complete(
                    asyncio.wait_for(
                        _generate_edge_tts(processed_text, role, emotion),
                        timeout=8.0
                    )
                )
                if audio and len(audio) > 0:
                    _edge_tts_record_success()
                    _cache_put(ckey, (audio, mime, "edge-tts"))
                    return audio, mime, "edge-tts"
            finally:
                loop.close()
        except asyncio.TimeoutError:
            logger.warning("Edge TTS 超时（8s），降级到 WinRT")
        except Exception as e:
            logger.warning(f"Edge TTS 失败: {e}")
        _edge_tts_record_failure()

    # ② WinRT（离线兜底）
    if _winrt_available:
        try:
            loop = asyncio.new_event_loop()
            try:
                audio, mime = loop.run_until_complete(
                    _generate_winrt_tts(processed_text, role, emotion)
                )
                if audio and len(audio) > 0:
                    _cache_put(ckey, (audio, mime, "winrt"))
                    return audio, mime, "winrt"
            finally:
                loop.close()
        except Exception as e:
            logger.warning(f"WinRT TTS 失败: {e}")

    # ③ pyttsx3（最终兜底）
    try:
        audio, mime = _generate_pyttsx3_tts(processed_text, role, emotion)
        if audio and len(audio) > 0:
            return audio, mime, "pyttsx3"
    except Exception as e:
        logger.error(f"pyttsx3 TTS 失败: {e}")

    return b"", "audio/wav", "none"


# ============================================================
# 8. API 端点
# ============================================================
@app.route('/api/tts')
def tts():
    text = request.args.get('text', '')
    role = int(request.args.get('role', '2'))
    emotion = request.args.get('emotion', 'neutral')
    if not text:
        return jsonify({'error': 'text is required'}), 400

    # 钳制参数
    role = max(0, min(7, role))

    # ① 先查预生成文件（即时响应，零延迟）
    cache_key = f"{role}_{text}"
    cache_filename = _hashlib.md5(cache_key.encode()).hexdigest() + ".mp3"
    cache_filepath = os.path.join(VOICE_CACHE_DIR, cache_filename)
    if os.path.exists(cache_filepath) and os.path.getsize(cache_filepath) > 1000:
        logger.info(f"TTS PREGEN HIT: role={role}, text='{text[:20]}...'")
        with open(cache_filepath, 'rb') as f:
            audio_data = f.read()
        return Response(audio_data, mimetype='audio/mpeg',
                        headers={'X-TTS-Engine': 'pregen', 'Cache-Control': 'public, max-age=300'})

    try:
        audio_bytes, mime, engine = _do_tts(text, role, emotion)
        if not audio_bytes or len(audio_bytes) == 0:
            return jsonify({'error': 'empty audio'}), 500

        # 浏览器缓存 5 分钟（相同 URL 不重复请求）
        cache_max_age = 300 if 'cached' not in engine else 600
        return Response(audio_bytes, mimetype=mime, headers={
            'Cache-Control': f'public, max-age={cache_max_age}',
            'Content-Length': str(len(audio_bytes)),
            'X-TTS-Engine': engine,
        })
    except Exception as e:
        logger.error(f"TTS failed: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@app.route('/api/voices')
def voices():
    return jsonify({
        'voices': ROLE_INFO,
        'engine': 'edge-tts' if _edge_tts_ready() else ('winrt' if _winrt_available else 'pyttsx3'),
    })


@app.route('/api/health')
def health():
    engine = 'edge-tts' if _edge_tts_ready() else ('winrt' if _winrt_available else 'pyttsx3')
    return jsonify({
        'status': 'ok',
        'engine': engine,
        'edge_tts_available': _edge_tts_available,
        'edge_tts_ready': _edge_tts_ready(),
        'winrt_available': _winrt_available,
        'winrt_voices': len(_winrt_voices),
        'voices_count': 8,
        'emotions': list(EMOTION_VOICE_MAP.keys()),
    })


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=7862)
    parser.add_argument('--host', default='0.0.0.0')
    args = parser.parse_args()
    logger.info(f"TTS Server: http://{args.host}:{args.port}")
    logger.info(f"  Edge TTS: {'available' if _edge_tts_available else 'not installed'}")
    logger.info(f"  WinRT:    {'available' if _winrt_available else 'not available'} ({len(_winrt_voices)} voices)")
    logger.info(f"  Voices:   {len(ROLE_INFO)} roles, {len(EMOTION_VOICE_MAP)} emotions")
    app.run(host=args.host, port=args.port, debug=False, threaded=True)
