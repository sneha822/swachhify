from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.models import CustomerProfile, Household, ImpactRecord, PickupRequest, User
from app.models.enums import PickupStatus
from app.services import impact
from app.services.impact import METHODOLOGY

router = APIRouter(prefix="/impact", tags=["impact"])


@router.get("/me")
def my_impact(user: User = Depends(require_roles("customer")), db: Session = Depends(get_db)):
    prof = db.get(CustomerProfile, user.id)
    hh = db.get(Household, prof.household_id) if prof and prof.household_id else None
    return {
        "me": impact.summary(db, user_id=user.id),
        "household": {"name": hh.name, **impact.summary(db, household_id=hh.id)} if hh else None,
    }


@router.get("/platform")
def platform(db: Session = Depends(get_db)):
    """Public, aggregate-only numbers for the landing page."""
    by_cat = dict(db.execute(select(ImpactRecord.category_slug, func.sum(ImpactRecord.kg))
                             .group_by(ImpactRecord.category_slug)).all())
    return {
        "total_kg": round(sum(by_cat.values()), 1),
        "by_category": {k: round(v, 1) for k, v in by_cat.items()},
        "pickups": db.scalar(select(func.count(PickupRequest.id))
                             .where(PickupRequest.status == PickupStatus.COMPLETED)) or 0,
        "households": db.scalar(select(func.count(Household.id))) or 0,
        "co2e_kg_est": round(db.scalar(select(func.coalesce(func.sum(ImpactRecord.co2e_kg_est), 0))) or 0, 1),
        "methodology": METHODOLOGY,
    }
