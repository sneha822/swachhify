import logging

from sqlalchemy.orm import Session

from app.models import Notification, User
from app.services import channels
from app.services.realtime import hub

log = logging.getLogger("swacchify.notify")

# notification type → preference key the user can switch off
PREF_FOR_TYPE = {
    "pickup": "pickup_updates",
    "reward": "rewards",
    "badge": "rewards",
    "learning": "learning_reminders",
    "streak": "learning_reminders",
    "daily_tip": "daily_tip",
    "content": "learning_reminders",
    "campaign": "campaigns",
}


def notify(db: Session, user: User, type_: str, title: str, body: str, data: dict | None = None) -> None:
    """Store an in-app notification, push it over WebSocket, and fan out to opted-in channels."""
    prefs = user.notification_prefs or {}
    pref_key = PREF_FOR_TYPE.get(type_)
    if pref_key and prefs.get(pref_key) is False and type_ != "pickup":
        return
    n = Notification(user_id=user.id, type=type_, title=title, body=body, data=data or {})
    db.add(n)
    db.flush()
    hub.publish(user.id, "notification", {"id": n.id, "type": type_, "title": title, "body": body,
                                          "data": data or {}})
    ch = prefs.get("channels", {})
    try:
        if ch.get("email"):
            channels.send_email(user.email, title, body)
        if ch.get("sms"):
            channels.send_sms(user.phone, f"{title}: {body}")
        if ch.get("whatsapp"):
            channels.send_whatsapp(user.phone, f"*{title}*\n{body}")
    except NotImplementedError as exc:
        log.warning("channel not configured: %s", exc)
