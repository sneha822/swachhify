from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    AIConversation,
    CustomerProfile,
    HabitStreak,
    ImpactRecord,
    LearningProgress,
    Lesson,
    PickupRequest,
    User,
    UserBadge,
)
from app.models.enums import PickupStatus
from app.seed.learning_content import BADGES
from app.services.common import now_ist
from app.services.notifications import notify


def _stats(db: Session, user: User) -> dict:
    prof = db.get(CustomerProfile, user.id)
    hh_id = prof.household_id if prof else None
    kg_filter = ImpactRecord.household_id == hh_id if hh_id else ImpactRecord.user_id == user.id
    return {
        "asked": db.scalar(select(func.count(AIConversation.id)).where(AIConversation.user_id == user.id)) or 0,
        "lessons": db.scalar(select(func.count(LearningProgress.id)).where(
            LearningProgress.user_id == user.id, LearningProgress.completed.is_(True))) or 0,
        "total_lessons": db.scalar(select(func.count(Lesson.id)).where(Lesson.is_published.is_(True))) or 0,
        "pickups": db.scalar(select(func.count(PickupRequest.id)).where(
            PickupRequest.customer_id == user.id, PickupRequest.status == PickupStatus.COMPLETED)) or 0,
        "ewaste_kg": db.scalar(select(func.coalesce(func.sum(ImpactRecord.kg), 0)).where(
            ImpactRecord.user_id == user.id, ImpactRecord.category_slug == "ewaste")) or 0,
        "household_kg": db.scalar(select(func.coalesce(func.sum(ImpactRecord.kg), 0)).where(kg_filter)) or 0,
        "best_streak": db.scalar(select(func.coalesce(func.max(HabitStreak.longest), 0)).where(
            HabitStreak.user_id == user.id)) or 0,
    }


def _progress(slug: str, s: dict) -> tuple[float, str]:
    """Returns (0..1 progress, short hint)."""
    match slug:
        case "waste-beginner":
            return (1.0 if s["asked"] or s["lessons"] else 0.0), "Ask Swacchify AI or finish a lesson"
        case "green-starter":
            return min(s["pickups"], 1), "Complete your first pickup"
        case "habit-builder":
            return min(s["best_streak"] / 7, 1), f"{min(s['best_streak'], 7)}/7 day streak"
        case "ewaste-responsible":
            return (1.0 if s["ewaste_kg"] > 0 else 0.0), "Hand over e-waste in a pickup"
        case "eco-household":
            return min(s["household_kg"] / 25, 1), f"{s['household_kg']:.1f}/25 kg"
        case "champion":
            return min(s["pickups"] / 10, 1), f"{s['pickups']}/10 pickups"
        case "earth-guardian":
            lessons = s["lessons"] / s["total_lessons"] if s["total_lessons"] else 0
            return min((min(lessons, 1) + min(s["household_kg"] / 50, 1)) / 2, 1), "All lessons + 50 kg"
    return 0.0, ""


def evaluate(db: Session, user: User) -> list[dict]:
    """Compute badge progress and award newly earned badges."""
    s = _stats(db, user)
    owned = {b.badge_slug: b for b in db.scalars(select(UserBadge).where(UserBadge.user_id == user.id))}
    out = []
    for b in BADGES:
        prog, hint = _progress(b["slug"], s)
        earned = b["slug"] in owned
        if not earned and prog >= 1:
            ub = UserBadge(user_id=user.id, badge_slug=b["slug"], awarded_at=now_ist())
            db.add(ub)
            owned[b["slug"]] = ub
            earned = True
            notify(db, user, "badge", f"{b['emoji']} New badge: {b['name']}", b["description"], {"badge": b["slug"]})
        out.append({**b, "earned": earned, "progress": round(prog, 3), "hint": hint,
                    "awarded_at": owned[b["slug"]].awarded_at if earned else None})
    return out
