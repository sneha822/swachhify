from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import random_code
from app.models import AuditLog

# Swacchify operates in India; "today" for streaks and slots is IST.
IST = timezone(timedelta(hours=5, minutes=30))

CODE_PREFIX = {"customer": "SWC", "partner": "SWP", "recycler": "SWR", "admin": "SWA"}


def now_ist() -> datetime:
    return datetime.now(IST)


def today_ist() -> date:
    return now_ist().date()


def unique_code(db: Session, model, column: str, prefix: str, length: int = 6) -> str:
    col = getattr(model, column)
    while True:
        code = f"{prefix}-{random_code(length)}"
        if db.scalar(select(model.id).where(col == code)) is None:
            return code


def audit(db: Session, actor_id: int | None, action: str, entity: str, entity_id=None, data=None, ip=None):
    db.add(AuditLog(actor_id=actor_id, action=action, entity=entity,
                    entity_id=str(entity_id) if entity_id is not None else None, data=data, ip=ip))
