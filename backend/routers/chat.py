"""对话 API 路由 — POST /api/v1/chat"""
from fastapi import APIRouter
from pydantic import BaseModel
from config import LLM_API_KEY
from services.chat_agent import chat as deepseek_chat

router = APIRouter(prefix="/chat", tags=["智能对话"])


class ChatRequest(BaseModel):
    message: str
    context: dict | None = None


@router.post("")
async def chat_endpoint(req: ChatRequest):
    if not req.message or not req.message.strip():
        return {"reply": "请问有什么可以帮您的？", "source": "fallback"}

    reply = await deepseek_chat(req.message.strip(), req.context)
    if reply:
        return {"reply": reply, "source": "deepseek"}

    if not LLM_API_KEY:
        hint = "AI 对话未配置 API Key（请在 backend/.env 中填写 LLM_API_KEY 或 DEEPSEEK_API_KEY）。您可以先使用语音指令控制车辆功能和点歌。"
    else:
        hint = "AI 服务调用失败（可能是账户余额不足或网络问题），请前往 platform.deepseek.com 检查。您仍可以使用语音指令控制车辆功能和点歌。"
    return {"reply": hint, "source": "fallback"}
