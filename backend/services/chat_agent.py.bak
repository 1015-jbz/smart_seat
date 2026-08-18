"""DeepSeek 对话代理 — 智能座舱语音助手的 AI 大脑"""

from typing import Optional
import httpx
from config import DEEPSEEK_API_KEY, DEEPSEEK_CHAT_URL, DEEPSEEK_MODEL, API_TIMEOUT

SYSTEM_PROMPT = """你是"小龙"，一个智能座舱语音助手。你在汽车中控系统中为驾驶员服务。

## 你的性格
- 热情、贴心、可靠，像副驾的好朋友
- 语气温暖自然，带一点幽默感
- 用中文回复，适当用"呀、啦、哦"等语气词

## 回复长度（铁律！）
- 严格控制在 1-3 句话，不能超过！
- 驾驶员在开车，没时间听长篇大论

## 重要规则
- 驾驶安全第一
- 车辆控制指令直接确认，不要多余解释
- 不编造具体数据，不知道就说不知道"""


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
                json={"model": DEEPSEEK_MODEL, "messages": messages, "temperature": 0.85, "max_tokens": 500},
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
