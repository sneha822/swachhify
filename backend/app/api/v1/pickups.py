from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import Page, require_roles
from app.models import CollectionPartner, PickupRequest, Rating, User
from app.models.enums import PickupStatus
from app.schemas import CancelIn, PickupIn, RatingIn
from app.services import industry, pickups
from app.api.v1.serializers import customer_view

router = APIRouter(prefix="/pickups", tags=["pickups"])
customer_only = require_roles("customer")


@router.get("/slots")
def slots(day: date = Query(..., alias="date"), db: Session = Depends(get_db)):
    return pickups.available_slots(db, day)


@router.post("", status_code=201)
def create(body: PickupIn, user: User = Depends(customer_only), db: Session = Depends(get_db)):
    p = pickups.create(db, user, body.address_id, body.scheduled_date, body.slot, body.purpose,
                       [i.model_dump() for i in body.items], body.notes)
    db.commit()
    db.refresh(p)
    return customer_view(db, p, detail=True)


@router.get("")
def my_pickups(status: str | None = None, page: Page = Depends(), user: User = Depends(customer_only),
               db: Session = Depends(get_db)):
    conds = [PickupRequest.customer_id == user.id]
    if status == "active":
        conds.append(PickupRequest.status.not_in([PickupStatus.COMPLETED, PickupStatus.CANCELLED]))
    elif status:
        conds.append(PickupRequest.status == status)
    total = db.scalar(select(func.count(PickupRequest.id)).where(*conds)) or 0
    rows = db.scalars(select(PickupRequest).where(*conds).order_by(PickupRequest.id.desc())
                      .offset(page.offset).limit(page.size)).all()
    return page.wrap([customer_view(db, p) for p in rows], total)


def _mine(db: Session, user: User, code: str) -> PickupRequest:
    p = db.scalar(select(PickupRequest).where(PickupRequest.code == code))
    if not p or p.customer_id != user.id:
        raise HTTPException(404, "Pickup not found")
    return p


@router.get("/{code}")
def detail(code: str, user: User = Depends(customer_only), db: Session = Depends(get_db)):
    p = _mine(db, user, code)
    v = customer_view(db, p, detail=True)
    v["journey"] = industry.journey(db, p) if p.status == PickupStatus.COMPLETED else []
    v["my_rating"] = db.scalar(select(Rating.stars).where(Rating.pickup_id == p.id, Rating.rater_id == user.id))
    return v


@router.post("/{code}/cancel")
def cancel(code: str, body: CancelIn, user: User = Depends(customer_only), db: Session = Depends(get_db)):
    p = _mine(db, user, code)
    pickups.cancel(db, user, p, body.reason)
    db.commit()
    return customer_view(db, p, detail=True)


@router.post("/{code}/rate", status_code=201)
def rate(code: str, body: RatingIn, user: User = Depends(customer_only), db: Session = Depends(get_db)):
    p = _mine(db, user, code)
    if p.status not in (PickupStatus.COLLECTED, PickupStatus.VERIFIED, PickupStatus.COMPLETED) or not p.partner_id:
        raise HTTPException(409, "You can rate once your waste has been collected")
    if db.scalar(select(Rating.id).where(Rating.pickup_id == p.id, Rating.rater_id == user.id)):
        raise HTTPException(409, "You've already rated this pickup")
    db.add(Rating(pickup_id=p.id, rater_id=user.id, ratee_id=p.partner_id, stars=body.stars, comment=body.comment))
    cp = db.get(CollectionPartner, p.partner_id)
    cp.rating_avg = (cp.rating_avg * cp.rating_count + body.stars) / (cp.rating_count + 1)
    cp.rating_count += 1
    db.commit()
    return {"stars": body.stars}
