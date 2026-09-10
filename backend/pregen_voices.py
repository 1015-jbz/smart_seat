"""预生成常用语音文件 — 8 个角色 × 常用语句 = 即时响应

声线配置直接从 tts_server 导入，避免两边各写一份 EDGE_VOICE_MAP 导致跑偏
（历史上就因为这里写了个不存在的声线名，整整一个角色全是空文件）。

用法：
    python pregen_voices.py            # 增量生成，已存在的跳过
    python pregen_voices.py --force    # 全部重生成
"""
import os
import sys
import hashlib
import asyncio
import logging

import edge_tts

# 单一数据源：角色声线与基准参数以服务端为准
from tts_server import EDGE_VOICE_MAP, ROLE_INFO

logging.basicConfig(level=logging.INFO, format='%(levelname)s | %(message)s')
logger = logging.getLogger("pregen")

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "voice_cache")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 小于这个体积的文件视为生成失败的残留（服务端命中缓存时也用同一阈值）
MIN_VALID_BYTES = 1000
# 偶发的 “No audio was received” 属于网络抖动，重试即可
MAX_RETRY = 3

# 常用语句
COMMON_PHRASES = [
    "在呢，说吧。",
    "好嘞。",
    "好的。",
    "嗯，明白了。",
    "帮你弄好了。",
    "收到，马上处理。",
    "不好意思，没听清，再说一遍？",
    "路上注意安全。",
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

ROLE_NAMES = [r["name"] for r in ROLE_INFO]


async def generate_one(text, role_id, force=False):
    """生成一条语音文件，返回 'new' / 'skip' / 'fail'"""
    vp = EDGE_VOICE_MAP[role_id]

    # 文件名 = hash(role + text)，必须与 tts_server 的预生成命中逻辑一致
    key = f"{role_id}_{text}"
    filename = hashlib.md5(key.encode()).hexdigest() + ".mp3"
    filepath = os.path.join(OUTPUT_DIR, filename)

    if os.path.exists(filepath):
        if os.path.getsize(filepath) > MIN_VALID_BYTES and not force:
            return "skip"
        # 失败残留的空文件：清掉重生成，否则永远补不上
        try:
            os.remove(filepath)
        except OSError:
            pass

    for attempt in range(1, MAX_RETRY + 1):
        try:
            communicate = edge_tts.Communicate(
                text, vp["voice"], rate=vp["rate"], pitch=vp["pitch"], volume=vp["volume"])
            await communicate.save(filepath)
            if os.path.exists(filepath) and os.path.getsize(filepath) > MIN_VALID_BYTES:
                return "new"
            raise RuntimeError("生成的文件为空")
        except Exception as e:
            if attempt < MAX_RETRY:
                await asyncio.sleep(0.8 * attempt)
                continue
            logger.warning(f"  角色{role_id}（{ROLE_NAMES[role_id]}）生成失败: {text[:15]}... - {e}")
            return "fail"
    return "fail"


async def main():
    force = '--force' in sys.argv
    logger.info(f"预生成语音文件 → {OUTPUT_DIR}")
    logger.info(f"共 {len(COMMON_PHRASES)} 条语句 × {len(ROLE_NAMES)} 角色 = {len(COMMON_PHRASES) * len(ROLE_NAMES)} 个文件")

    total = new = skip = fail = 0
    for role_id in sorted(EDGE_VOICE_MAP):
        for phrase in COMMON_PHRASES:
            total += 1
            result = await generate_one(phrase, role_id, force)
            if result == "new":
                new += 1
                logger.info(f"  [{ROLE_NAMES[role_id]}] {phrase}")
            elif result == "skip":
                skip += 1
            else:
                fail += 1

    logger.info(f"完成: 新生成 {new}, 已存在 {skip}, 失败 {fail}, 合计 {total}")
    if fail:
        logger.warning(f"有 {fail} 条失败，可重跑本脚本补齐（已存在的会自动跳过）")


if __name__ == "__main__":
    asyncio.run(main())
