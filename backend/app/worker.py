"""Background jobs (Celery + Redis). Without REDIS_URL, tasks run eagerly in-process.

Run in production:
    celery -A app.worker worker -l info
    celery -A app.worker beat -l info
"""

from datetime import timedelta

from celery import Celery
from celery.schedules import crontab
from sqlalchemy import select

from app.core.config import settings
from app.core.database import SessionLocal
from app.models import DropOffPoint, HabitStreak, Notification, PickupAssignment, PickupRequest, User
from app.models.enums import AssignmentStatus, PickupStatus
from app.services import habits, pickups
from app.services.common import now_ist, today_ist
from app.services.geo import haversine_km
from app.services.notifications import notify

celery = Celery("swacchify", broker=settings.REDIS_URL or "memory://", backend=settings.REDIS_URL or "cache+memory://")
celery.conf.update(
    task_always_eager=not settings.REDIS_URL,
    timezone="Asia/Kolkata",
    beat_schedule={
        "daily-tips": {"task": "app.worker.send_daily_tips", "schedule": crontab(hour=8, minute=0)},
        "pickup-reminders": {"task": "app.worker.pickup_reminders", "schedule": crontab(hour=18, minute=0)},
        "streak-reminders": {"task": "app.worker.streak_reminders", "schedule": crontab(hour=19, minute=30)},
        "stale-offers": {"task": "app.worker.reassign_stale_offers", "schedule": crontab(minute="*/15")},
    },
)


@celery.task
def send_daily_tips() -> int:
    with SessionLocal() as db:
        tip = habits.daily(db, "tip")
        if not tip:
            return 0
        start = now_ist().replace(hour=0, minute=0, second=0, microsecond=0)
        already = set(db.scalars(select(Notification.user_id).where(
            Notification.type == "daily_tip", Notification.created_at >= start)))
        sent = 0
        for u in db.scalars(select(User).where(User.role == "customer", User.is_active.is_(True))):
            if u.id in already:
                continue
            text = (tip.text_hi or tip.text) if u.language == "hi" else tip.text
            notify(db, u, "daily_tip", "Today's 30-second tip" if u.language != "hi" else "आज की टिप", text)
            sent += 1
        db.commit()
        return sent


@celery.task
def pickup_reminders() -> int:
    with SessionLocal() as db:
        tomorrow = today_ist() + timedelta(days=1)
        rows = db.scalars(select(PickupRequest).where(
            PickupRequest.scheduled_date == tomorrow,
            PickupRequest.status.in_([PickupStatus.REQUESTED, *pickups.ACTIVE]))).all()
        for p in rows:
            label = dict((s[0], s[1]) for s in pickups.SLOTS).get(p.slot, p.slot)
            notify(db, db.get(User, p.customer_id), "pickup", "Pickup tomorrow",
                   f"{p.code} is scheduled for tomorrow, {label}. Keep your segregated waste ready!",
                   {"pickup_code": p.code})
            if p.partner_id:
                notify(db, db.get(User, p.partner_id), "pickup", "Pickup tomorrow", f"{p.code} · {label}",
                       {"pickup_code": p.code})
        db.commit()
        return len(rows)


@celery.task
def streak_reminders() -> int:
    with SessionLocal() as db:
        yesterday = today_ist() - timedelta(days=1)
        rows = db.scalars(select(HabitStreak).where(HabitStreak.last_date == yesterday,
                                                    HabitStreak.current >= 2)).all()
        for s in rows:
            notify(db, db.get(User, s.user_id), "streak", f"Keep your {s.current}-day streak",
                   "Read today's tip or finish a 1-minute lesson to keep it going.")
        db.commit()
        return len(rows)


@celery.task
def reassign_stale_offers(max_age_minutes: int = 120) -> int:
    """Offers nobody answered go to the next partner; unassigned pickups get a drop-off alternative."""
    with SessionLocal() as db:
        cutoff = now_ist() - timedelta(minutes=max_age_minutes)
        moved = 0
        for a in db.scalars(select(PickupAssignment).where(PickupAssignment.status == AssignmentStatus.OFFERED,
                                                           PickupAssignment.created_at < cutoff)):
            p = db.get(PickupRequest, a.pickup_id)
            a.status, a.responded_at, a.reject_reason = AssignmentStatus.REJECTED, now_ist(), "No response"
            if p.status == PickupStatus.ASSIGNED:
                p.partner_id = None
                p.status = PickupStatus.REQUESTED
                if not pickups.auto_assign(db, p):
                    _suggest_dropoff(db, p)
                moved += 1
        tomorrow = today_ist() + timedelta(days=1)
        for p in db.scalars(select(PickupRequest).where(PickupRequest.status == PickupStatus.REQUESTED,
                                                        PickupRequest.scheduled_date <= tomorrow)):
            if not pickups.auto_assign(db, p):
                _suggest_dropoff(db, p)
        db.commit()
        return moved


def _suggest_dropoff(db, p: PickupRequest) -> None:
    already = db.scalar(select(Notification.id).where(Notification.user_id == p.customer_id,
                                                      Notification.type == "pickup",
                                                      Notification.title == "Still finding a partner"))
    if already:
        return
    cats = {i.category_slug for i in p.items}
    points = [d for d in db.scalars(select(DropOffPoint).where(DropOffPoint.is_active.is_(True)))
              if cats & set(d.accepted_categories or [])]
    if not points:
        return
    nearest = min(points, key=lambda d: haversine_km(p.lat, p.lng, d.lat, d.lng))
    dist = haversine_km(p.lat, p.lng, nearest.lat, nearest.lng)
    notify(db, db.get(User, p.customer_id), "pickup", "Still finding a partner",
           f"We're still looking for a partner for {p.code}. If you're in a hurry, {nearest.name} is "
           f"{dist:.1f} km away ({nearest.hours or 'see hours in app'}).",
           {"pickup_code": p.code, "dropoff_id": nearest.id})
