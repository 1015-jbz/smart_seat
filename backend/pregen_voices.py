"""预生成常用语音文件 — 8 个角色 × 常用语句 = 即时响应"""
import os
import sys
import hashlib
import edge_tts
import asyncio
import logging

logging.basicConfig(level=logging.INFO, format='%(levelname)s | %(message)s')
logger = logging.getLogger("pregen")

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "voice_cache")
os.makedirs(OUTPUT_DIR, exist_ok=True)

EDGE_VOICE_MAP = {
    0: {"voice": "zh-CN-XiaoyiNeural",              "rate": "+12%", "pitch": "+5Hz",  "volume": "+0%"},
    1: {"voice": "zh-CN-XiaohanNeural",             "rate": "+8%",  "pitch": "+2Hz",  "volume": "+0%"},
    2: {"voice": "zh-CN-XiaoxiaoNeural",             "rate": "-5%",  "pitch": "-2Hz",  "volume": "+0%"},
    3: {"voice": "zh-CN-YunxiNeural",                "rate": "+0%",  "pitch": "+0Hz",  "volume": "+0%"},
    4: {"voice": "zh-CN-YunjianNeural",              "rate": "+8%",  "pitch": "-2Hz",  "volume": "+8%"},
    5: {"voice": "zh-CN-YunyangNeural",              "rate": "-8%",  "pitch": "-5Hz",  "volume": "+0%"},
    6: {"voice": "zh-CN-liaoning-XiaobeiNeural",     "rate": "+3%",  "pitch": "-3Hz",  "volume": "+0%"},
    7: {"voice": "zh-CN-shaanxi-XiaoniNeural",       "rate": "-2%",  "pitch": "-2Hz",  "volume": "+0%"},
}

# 常用语句
COMMON_PHRASES = [
    "在呢，说吧。",
    "好嘞。",
    "好的。",
    "嗯，明白了。",
    "帮你弄好了。",
    "收到，马上处理。",
    "不好意思，没听清，再说一遍？",
    "我在这儿呢，路上注意安全哈。",
    "空调调好了。",
    "音乐暂停了。",
    "切到下一首了。",
    "车窗关好了。",
    "风量调大了。",
    "风量调小了。",
    "电话接通了。",
    "电话挂了。",
    "路线规划好了。",
    "音量调大了。",
    "音量调小了。",
    "马上帮你看看。",
]

ROLE_NAMES = ["晓伊", "小梦", "晓晓", "云希", "云健", "云扬", "晓北", "晓妮"]


async def generate_one(text, role_id):
    """生成一条语音文件"""
    vp = EDGE_VOICE_MAP[role_id]
    voice = vp["voice"]
    rate = vp["rate"]
    pitch = vp["pitch"]
    volume = vp["volume"]

    # 文件名 = hash(text + role)
    key = f"{role_id}_{text}"
    filename = hashlib.md5(key.encode()).hexdigest() + ".mp3"
    filepath = os.path.join(OUTPUT_DIR, filename)

    if os.path.exists(filepath) and os.path.getsize(filepath) > 1000:
        return False  # 已存在，跳过

    try:
        communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch, volume=volume)
        await communicate.save(filepath)
        return True
    except Exception as e:
        logger.warning(f"  角色{role_id} 生成失败: {text[:15]}... - {e}")
        return False


async def main():
    logger.info(f"预生成语音文件 → {OUTPUT_DIR}")
    logger.info(f"共 {len(COMMON_PHRASES)} 条语句 × 8 角色 = {len(COMMON_PHRASES) * 8} 个文件")

    total = 0
    new = 0
    for role_id in range(8):
        for phrase in COMMON_PHRASES:
            total += 1
            created = await generate_one(phrase, role_id)
            if created:
                new += 1
                logger.info(f"  [{ROLE_NAMES[role_id]}] {phrase}")

    logger.info(f"完成: {new}/{total} 新生成, {total - new} 已存在")


if __name__ == "__main__":
    asyncio.run(main())
