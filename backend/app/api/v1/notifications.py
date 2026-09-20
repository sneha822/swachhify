from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import Page, get_current_user
from app.models import Notification, User
from app.services.common import now_ist

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
def list_notifications(unread: bool = False, page: Page = Depends(), user: User = Depends(get_current_user),
                       db: Session = Depends(get_db)):
    conds = [Notification.user_id == user.id]
    if unread:
        conds.append(Notification.read_at.is_(None))
    total = db.scalar(select(func.count(Notification.id)).where(*conds)) or 0
    rows = db.scalars(select(Notification).where(*conds).order_by(Notification.id.desc())
                      .offset(page.offset).limit(page.size)).all()
    out = page.wrap([{"id": n.id, "type": n.type, "title": n.title, "body": n.body, "data": n.data,
                      "read": n.read_at is not None, "created_at": n.created_at} for n in rows], total)
    out["unread"] = db.scalar(select(func.count(Notification.id)).where(
        Notification.user_id == user.id, Notification.read_at.is_(None))) or 0
    return out


@router.post("/{notification_id}/read", status_code=204)
def mark_read(notification_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    n = db.get(Notification, notification_id)
    if not n or n.user_id != user.id:
        raise HTTPException(404, "Notification not found")
    n.read_at = n.read_at or now_ist()
    db.commit()


@router.post("/read-all", status_code=204)
def mark_all_read(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.execute(update(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))
               .values(read_at=now_ist()))
    db.commit()
