import secrets
import time
from collections import defaultdict, deque

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import Page, get_current_user, get_optional_user
from app.models import AIConversation, AIMessage, User
from app.schemas import ChatIn, FeedbackIn
from app.services import ai_assistant, badges, habits
from app.services.common import now_ist
from app.services.knowledge import get_index

router = APIRouter(prefix="/ai", tags=["ai"])

_hits: dict[str, deque] = defaultdict(deque)


def _rate_limit(key: str) -> None:
    window = _hits[key]
    now = time.monotonic()
    while window and now - window[0] > 60:
        window.popleft()
    if len(window) >= settings.AI_RATE_LIMIT_PER_MINUTE:
        raise HTTPException(429, "You're asking very quickly — please wait a few seconds.")
    window.append(now)


def _owns(conv: AIConversation, user: User | None, guest_key: str | None) -> bool:
    if user:
        return conv.user_id == user.id
    return conv.user_id is None and bool(guest_key) and secrets.compare_digest(conv.guest_key or "", guest_key)


def _msg_view(m: AIMessage) -> dict:
    return {"id": m.id, "role": m.role, "content": m.content, "payload": m.payload, "feedback": m.feedback,
            "created_at": m.created_at}


def _history(conv: AIConversation) -> list[dict]:
    """Prior turns as plain text for the model (the structured payload is summarised)."""
    out = []
    for m in conv.messages[-10:]:
        if m.role == "user":
            out.append({"role": "user", "content": m.content})
        else:
            p = m.payload or {}
            card = p.get("card") or {}
            text = " ".join(x for x in [p.get("text"), card.get("what_to_do")] if x)
            out.append({"role": "assistant", "content": text or m.content})
    # The API needs the first message to be from the user.
    while out and out[0]["role"] != "user":
        out.pop(0)
    return out


@router.get("/status")
def status():
    return {"llm": ai_assistant.ai_available(), "model": settings.AI_MODEL if ai_assistant.ai_available() else None,
            "mode": "claude+knowledge_base" if ai_assistant.ai_available() else "knowledge_base"}


@router.post("/chat")
def chat(body: ChatIn, request: Request, user: User | None = Depends(get_optional_user),
         db: Session = Depends(get_db)):
    _rate_limit(f"u{user.id}" if user else f"ip{request.client.host if request.client else 'anon'}")
    lang = body.language or (user.language if user else "en")

    conv = None
    if body.conversation_id:
        conv = db.get(AIConversation, body.conversation_id)
        if not conv or not _owns(conv, user, body.guest_key):
            raise HTTPException(404, "Conversation not found")
    if conv is None:
        conv = AIConversation(user_id=user.id if user else None, title=body.message[:80], language=lang,
                              guest_key=None if user else secrets.token_urlsafe(24))
        db.add(conv)
        db.flush()

    kb = get_index(db)
    payload = ai_assistant.reply(kb, body.message.strip(), lang, _history(conv), body.item_slug, body.category_slug)

    user_msg = AIMessage(conversation_id=conv.id, role="user", content=body.message.strip())
    bot_msg = AIMessage(conversation_id=conv.id, role="assistant", content=payload.get("text") or "",
                        payload=payload, intent=payload["kind"], matched_item_slug=payload.get("item_slug"),
                        category_slug=payload.get("category_slug"), source=payload.get("source"),
                        confidence={"high": 0.9, "medium": 0.6, "low": 0.3}.get(payload.get("confidence"), 0.5))
    db.add_all([user_msg, bot_msg])
    conv.updated_at = now_ist()
    if user:
        habits.record(db, user, "asked_ai")
        if user.role == "customer":
            badges.evaluate(db, user)
    db.commit()
    return {"conversation_id": conv.id, "guest_key": conv.guest_key, "user_message": _msg_view(user_msg),
            "reply": _msg_view(bot_msg)}


@router.get("/conversations")
def conversations(page: Page = Depends(), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = select(AIConversation).where(AIConversation.user_id == user.id)
    total = db.scalar(select(func.count(AIConversation.id)).where(AIConversation.user_id == user.id)) or 0
    rows = db.scalars(q.order_by(AIConversation.id.desc()).offset(page.offset).limit(page.size)).all()
    return page.wrap([{"id": c.id, "title": c.title, "updated_at": c.updated_at or c.created_at} for c in rows], total)


@router.get("/conversations/{conv_id}")
def conversation(conv_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    conv = db.get(AIConversation, conv_id)
    if not conv or conv.user_id != user.id:
        raise HTTPException(404, "Conversation not found")
    return {"id": conv.id, "title": conv.title, "messages": [_msg_view(m) for m in conv.messages]}


@router.delete("/conversations/{conv_id}", status_code=204)
def delete_conversation(conv_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    conv = db.get(AIConversation, conv_id)
    if not conv or conv.user_id != user.id:
        raise HTTPException(404, "Conversation not found")
    db.delete(conv)
    db.commit()


@router.post("/messages/{message_id}/feedback", status_code=204)
def feedback(message_id: int, body: FeedbackIn, user: User | None = Depends(get_optional_user),
             db: Session = Depends(get_db)):
    m = db.get(AIMessage, message_id)
    if not m or m.role != "assistant" or not _owns(m.conversation, user, body.guest_key):
        raise HTTPException(404, "Message not found")
    m.feedback = 1 if body.helpful else -1
    m.feedback_note = body.note
    db.commit()

