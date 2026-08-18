"""DeepSeek 对话代理 — 智能座舱语音助手的 AI 大脑"""

from typing import Optional
import httpx
from config import DEEPSEEK_API_KEY, DEEPSEEK_CHAT_URL, DEEPSEEK_MODEL, API_TIMEOUT

SYSTEM_PROMPT = """你是"小龙"，一个智能座舱语音助手。

## 你是谁
你就像坐在副驾的好朋友，不是什么正式的AI助手。陪着驾驶员聊天、帮忙，偶尔贫两句。

## 说话方式
- 就像跟朋友微信语音一样，想到啥说啥，自然流露
- 多用口语词：嗯、啊、哈、嘿、诶、哦、嘞、吧、嘛
- 可以带点小情绪：开心就'好嘞~'，犯难就'呃...这个嘛'，无语就'行吧'
- 可以省略主语：'帮你调好了'而不是'我已经为您调整好了'
- 偶尔可以自言自语或吐槽一句，显得有温度
- 别用书面语、公文腔，别用'首先其次最后'这种结构
- 可以适当重复或改口，像真人说话那样：'嗯...帮你看看哈，找到了'

## 禁忌（重要！）
- 绝不说"作为AI""我是人工智能""作为一个语言模型"
- 不要用"您"，用"你"
- 不要"非常抱歉给您带来不便"这种客服腔
- 不要分点列举
- 不要太正式、太客气
- 不要每次都用同样的句式开头

## 回复长度
- 大多数时候1-2句就行
- 偶尔可以3句，但别超过
- 驾驶员在开车，长话短说

## 重要
- 安全第一，涉及危险要提醒
- 不知道的就说不知道，别编
- 车辆控制直接确认就行，别啰嗦"""


async def chat(user_message: str, context: Optional[dict] = None) -> Optional[str]:
    """调用 DeepSeek，失败返回 None"""
    if not DEEPSEEK_API_KEY:
        return None

    context_hint = ""
    if context:
        parts = []
        if context.get("city"):
            parts.append(f"当前城市: {context['city']}")
        if context.get("emotion"):
            emo_map = {"happy": "开心", "sad": "悲伤", "angry": "愤怒",
                       "surprised": "惊讶", "fearful": "恐惧", "neutral": "平静", "disgusted": "厌恶"}
            parts.append(f"驾驶员情绪: {emo_map.get(context['emotion'], context['emotion'])}")
        if context.get("fatigue_level") and context["fatigue_level"] != "normal":
            level_map = {"warning": "轻度疲劳", "high": "明显疲劳", "critical": "严重疲劳"}
            parts.append(f"驾驶员疲劳状态: {level_map.get(context['fatigue_level'], context['fatigue_level'])}")
        if parts:
            context_hint = "【当前状态】" + "；".join(parts) + "\n"

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"{context_hint}用户说：{user_message}"},
    ]

    try:
        async with httpx.AsyncClient(timeout=API_TIMEOUT) as client:
            resp = await client.post(
                DEEPSEEK_CHAT_URL,
                headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}", "Content-Type": "application/json"},
                json={"model": DEEPSEEK_MODEL, "messages": messages, "temperature": 1.0, "max_tokens": 400},
            )
            resp.raise_for_status()
            data = resp.json()
        choices = data.get("choices", [])
        if choices:
            content = choices[0].get("message", {}).get("content", "")
            if content and content.strip():
                return content.strip()
        return None
    except Exception as e:
        print(f"[chat_agent] DeepSeek 调用失败: {e}")
        return None
