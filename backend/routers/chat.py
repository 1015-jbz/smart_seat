"""对话 API 路由 — POST /api/v1/chat, GET /api/v1/chat/history, DELETE /api/v1/chat/history"""
from datetime import datetime
from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import desc
from config import LLM_API_KEY
from database import get_db
from models import ChatMessage
from services.chat_agent import chat as deepseek_chat

router = APIRouter(prefix="/chat", tags=["智能对话"])


class ChatRequest(BaseModel):
    message: str
    context: dict | None = None
    source: str = "text"  # 'voice' | 'text'


@router.post("")
async def chat_endpoint(req: ChatRequest):
    if not req.message or not req.message.strip():
        return {"reply": "请问有什么可以帮您的？", "source": "fallback"}

    db = next(get_db())
    try:
        # 加载最近 10 轮历史
        recent_msgs = db.query(ChatMessage)\
            .order_by(desc(ChatMessage.timestamp))\
            .limit(20)\
            .all()
        recent_msgs.reverse()  # 按时间正序
        history = [{"role": m.role, "content": m.content} for m in recent_msgs]

        # 调用 LLM
        reply = await deepseek_chat(req.message.strip(), req.context, history)
        
        if not reply:
            if not LLM_API_KEY:
                hint = "AI 对话未配置 API Key（请在 backend/.env 中填写 LLM_API_KEY 或 DEEPSEEK_API_KEY）。您可以先使用语音指令控制车辆功能和点歌。"
            else:
                hint = "AI 服务调用失败（可能是账户余额不足或网络问题），请前往 platform.deepseek.com 检查。您仍可以使用语音指令控制车辆功能和点歌。"
            return {"reply": hint, "source": "fallback"}

        # 存储对话记录
        now = datetime.utcnow()
        user_msg = ChatMessage(
            role="user",
            content=req.message.strip(),
            source=req.source,
            timestamp=now,
        )
        assistant_msg = ChatMessage(
            role="assistant",
            content=reply,
            source="deepseek",
            timestamp=now,
        )
        db.add(user_msg)
        db.add(assistant_msg)
        db.commit()

        return {"reply": reply, "source": "deepseek"}
    except Exception as e:
        print(f"[chat] 错误: {e}")
        db.rollback()
        return {"reply": "服务暂时不可用，请稍后再试。", "source": "fallback"}


@router.get("/history")
async def get_history(limit: int = 50):
    """获取对话历史"""
    db = next(get_db())
    try:
        msgs = db.query(ChatMessage)\
            .order_by(desc(ChatMessage.timestamp))\
            .limit(limit)\
            .all()
        msgs.reverse()  # 按时间正序返回
        return {
            "messages": [
                {
                    "id": m.id,
                    "role": m.role,
                    "content": m.content,
                    "source": m.source,
                    "timestamp": m.timestamp.isoformat(),
                }
                for m in msgs
            ]
        }
    except Exception as e:
        print(f"[chat] 获取历史失败: {e}")
        return {"messages": []}


@router.delete("/history")
async def clear_history():
    """清空对话历史"""
    db = next(get_db())
    try:
        db.query(ChatMessage).delete()
        db.commit()
        return {"success": True}
    except Exception as e:
        print(f"[chat] 清空历史失败: {e}")
        db.rollback()
        return {"success": False}
