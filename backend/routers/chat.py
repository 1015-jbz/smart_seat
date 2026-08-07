"""对话 API 路由 — POST /api/v1/chat"""
from fastapi import APIRouter
from pydantic import BaseModel
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

    return {"reply": "抱歉，AI 服务暂时不可用。您可以使用语音指令控制车辆功能。", "source": "fallback"}
