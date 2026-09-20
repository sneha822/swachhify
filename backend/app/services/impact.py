from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import ImpactRecord, LearningProgress, Lesson, PickupRequest, WasteCategory
from app.models.enums import PickupStatus
from app.services.common import today_ist

METHODOLOGY = (
    "Weights are measured at the Swacchify hub after each pickup (verified weight, not the estimate you "
    "entered). CO₂e figures are rough, indicative estimates: verified kg × a per-category factor for "
    "emissions avoided by recycling instead of landfilling. Real savings depend on the material, the "
    "recycling process and transport, so treat them as a guide, not a measurement."
)


def summary(db: Session, *, user_id: int | None = None, household_id: int | None = None) -> dict:
    cond = ImpactRecord.household_id == household_id if household_id else ImpactRecord.user_id == user_id
    by_cat = dict(db.execute(select(ImpactRecord.category_slug, func.sum(ImpactRecord.kg))
                             .where(cond).group_by(ImpactRecord.category_slug)).all())
    donated = db.scalar(select(func.coalesce(func.sum(ImpactRecord.kg), 0))
                        .where(cond, ImpactRecord.purpose == "donate")) or 0
    co2 = db.scalar(select(func.coalesce(func.sum(ImpactRecord.co2e_kg_est), 0)).where(cond)) or 0
    pcond = PickupRequest.household_id == household_id if household_id else PickupRequest.customer_id == user_id
    pickups = db.scalar(select(func.count(PickupRequest.id))
                        .where(pcond, PickupRequest.status == PickupStatus.COMPLETED)) or 0

    start = today_ist().replace(day=1)
    months = []
    for i in range(5, -1, -1):
        m = (start - timedelta(days=31 * i)).replace(day=1)
        nxt = (m + timedelta(days=32)).replace(day=1)
        kg = db.scalar(select(func.coalesce(func.sum(ImpactRecord.kg), 0)).where(
            cond, func.date(ImpactRecord.created_at) >= m, func.date(ImpactRecord.created_at) < nxt)) or 0
        months.append({"month": m.strftime("%b"), "kg": round(kg, 2)})

    cats = db.scalars(select(WasteCategory).order_by(WasteCategory.sort_order)).all()
    total = round(sum(by_cat.values()), 2)
    return {
        "total_kg": total,
        "recycled_kg": round(total - donated, 2),
        "donated_kg": round(donated, 2),
        "pickups": pickups,
        "co2e_kg_est": round(co2, 1),
        "by_category": [{"category": c.slug, "name": c.name, "name_hi": c.name_hi, "emoji": c.emoji,
                         "color": c.color, "kg": round(by_cat.get(c.slug, 0), 2)} for c in cats if c.collectable],
        "monthly": months,
        "methodology": METHODOLOGY,
    }


def learning_progress_pct(db: Session, user_ids: list[int]) -> int:
    total = db.scalar(select(func.count(Lesson.id)).where(Lesson.is_published.is_(True))) or 0
    if not total or not user_ids:
        return 0
    done = db.scalar(select(func.count(LearningProgress.id)).where(
        LearningProgress.user_id.in_(user_ids), LearningProgress.completed.is_(True))) or 0
    return round(100 * done / (total * len(user_ids)))
