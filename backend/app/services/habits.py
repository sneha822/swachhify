from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import DailyActivity, DailyContent, HabitStreak, LearningProgress, PickupRequest, User
from app.models.enums import PickupStatus, StreakKind
from app.services import rewards
from app.services.common import today_ist
from app.services.notifications import notify

# Which daily activities keep which streak alive.
STREAK_FOR = {
    "learned": StreakKind.LEARNING,
    "tip_read": StreakKind.LEARNING,
    "quiz": StreakKind.LEARNING,
    "challenge_done": StreakKind.SEGREGATION,
}


def _streak(db: Session, user_id: int, kind: str) -> HabitStreak:
    s = db.scalar(select(HabitStreak).where(HabitStreak.user_id == user_id, HabitStreak.kind == kind))
    if not s:
        s = HabitStreak(user_id=user_id, kind=kind, current=0, longest=0)
        db.add(s)
        db.flush()
    return s


def current_streak(s: HabitStreak) -> int:
    """A streak survives until the end of the day after its last activity."""
    if not s.last_date:
        return 0
    return s.current if (today_ist() - s.last_date).days <= 1 else 0


def record(db: Session, user: User, kind: str) -> bool:
    """Log a daily activity. Returns True if this is the first of its kind today."""
    today = today_ist()
    user.last_active_on = today
    exists = db.scalar(select(DailyActivity.id).where(
        DailyActivity.user_id == user.id, DailyActivity.day == today, DailyActivity.kind == kind))
    if exists:
        return False
    db.add(DailyActivity(user_id=user.id, day=today, kind=kind))
    streak_kind = STREAK_FOR.get(kind)
    if streak_kind:
        s = _streak(db, user.id, streak_kind)
        if s.last_date != today:
            s.current = s.current + 1 if s.last_date == today - timedelta(days=1) else 1
            s.last_date = today
            s.longest = max(s.longest, s.current)
            bonus = rewards.STREAK_BONUS.get(s.current)
            if bonus:
                rewards.credit(db, user, bonus, "streak", f"{s.current}-day {streak_kind} streak bonus",
                               reference=f"{streak_kind}:{today.isoformat()}")
            if s.current in (3, 7, 14, 30):
                notify(db, user, "streak", f"{s.current}-day streak!",
                       f"You're on a {s.current}-day {streak_kind} streak. Keep it going!")
    return True


def break_segregation_streak(db: Session, user: User) -> None:
    s = _streak(db, user.id, StreakKind.SEGREGATION)
    s.current = 0


def daily(db: Session, kind: str) -> DailyContent | None:
    rows = db.scalars(select(DailyContent).where(DailyContent.kind == kind).order_by(DailyContent.id)).all()
    if not rows:
        return None
    return rows[today_ist().toordinal() % len(rows)]


def overview(db: Session, user: User) -> dict:
    today = today_ist()
    week_start = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)

    def days_with(kinds, since):
        return db.scalar(select(func.count(func.distinct(DailyActivity.day))).where(
            DailyActivity.user_id == user.id, DailyActivity.kind.in_(kinds), DailyActivity.day >= since)) or 0

    lessons_week = db.scalar(select(func.count(LearningProgress.id)).where(
        LearningProgress.user_id == user.id, LearningProgress.completed.is_(True),
        func.date(LearningProgress.completed_at) >= week_start)) or 0
    pickups_month = db.scalar(select(func.count(PickupRequest.id)).where(
        PickupRequest.customer_id == user.id, PickupRequest.status == PickupStatus.COMPLETED,
        func.date(PickupRequest.completed_at) >= month_start)) or 0
    done_today = set(db.scalars(select(DailyActivity.kind).where(
        DailyActivity.user_id == user.id, DailyActivity.day == today)).all())

    tip, challenge = daily(db, "tip"), daily(db, "challenge")
    learning, segregation = _streak(db, user.id, StreakKind.LEARNING), _streak(db, user.id, StreakKind.SEGREGATION)
    return {
        "tip": {"id": tip.id, "text": tip.text, "text_hi": tip.text_hi, "category": tip.category_slug} if tip else None,
        "challenge": {"id": challenge.id, "text": challenge.text, "text_hi": challenge.text_hi} if challenge else None,
        "tip_read": "tip_read" in done_today,
        "challenge_done": "challenge_done" in done_today,
        "streaks": {
            "learning": {"current": current_streak(learning), "longest": learning.longest},
            "segregation": {"current": current_streak(segregation), "longest": segregation.longest},
        },
        "goals": {
            "weekly": [
                {"key": "lessons", "label": "Finish 3 lessons", "label_hi": "3 पाठ पूरे करें",
                 "progress": min(lessons_week, 3), "target": 3},
                {"key": "challenges", "label": "Do the daily challenge on 5 days",
                 "label_hi": "5 दिन रोज़ की चुनौती पूरी करें",
                 "progress": min(days_with(["challenge_done"], week_start), 5), "target": 5},
            ],
            "monthly": [
                {"key": "pickups", "label": "Complete 2 pickups", "label_hi": "2 पिकअप पूरे करें",
                 "progress": min(pickups_month, 2), "target": 2},
                {"key": "active_days", "label": "Be active on 15 days", "label_hi": "15 दिन सक्रिय रहें",
                 "progress": min(days_with(list(STREAK_FOR), month_start), 15), "target": 15},
            ],
        },
    }
