from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.core.security import random_code
from app.models import CustomerProfile, HabitStreak, Household, HouseholdMember, PickupRequest, User
from app.models.enums import PickupStatus
from app.schemas import HouseholdIn, JoinHouseholdIn, MemberIn
from app.services import impact
from app.services.common import audit
from app.services.habits import current_streak

router = APIRouter(prefix="/households", tags=["households"])
customer_only = require_roles("customer")


def _profile(db: Session, user: User) -> CustomerProfile:
    prof = db.get(CustomerProfile, user.id)
    if not prof:
        prof = CustomerProfile(user_id=user.id)
        db.add(prof)
        db.flush()
    return prof


def _view(db: Session, hh: Household, me: User) -> dict:
    member_user_ids = [m.user_id for m in hh.members if m.user_id]
    streaks = db.scalars(select(HabitStreak).where(HabitStreak.user_id.in_(member_user_ids))).all() \
        if member_user_ids else []
    summary = impact.summary(db, household_id=hh.id)
    return {
        "id": hh.id, "name": hh.name, "invite_code": hh.invite_code, "city": hh.city,
        "is_owner": hh.owner_id == me.id,
        "members": [{"id": m.id, "display_name": m.display_name, "relation": m.relation, "is_admin": m.is_admin,
                     "has_app": m.user_id is not None, "is_me": m.user_id == me.id} for m in hh.members],
        "stats": {
            "waste_diverted_kg": summary["total_kg"],
            "pickups": db.scalar(select(func.count(PickupRequest.id)).where(
                PickupRequest.household_id == hh.id, PickupRequest.status == PickupStatus.COMPLETED)) or 0,
            "current_streak": max((current_streak(s) for s in streaks), default=0),
            "by_category": summary["by_category"],
            "learning_progress_pct": impact.learning_progress_pct(db, member_user_ids),
            "co2e_kg_est": summary["co2e_kg_est"],
        },
    }


@router.get("/me")
def my_household(user: User = Depends(customer_only), db: Session = Depends(get_db)):
    prof = _profile(db, user)
    if not prof.household_id:
        return None
    return _view(db, db.get(Household, prof.household_id), user)


@router.post("", status_code=201)
def create_household(body: HouseholdIn, user: User = Depends(customer_only), db: Session = Depends(get_db)):
    prof = _profile(db, user)
    if prof.household_id:
        raise HTTPException(409, "You're already part of a household")
    hh = Household(name=body.name.strip(), owner_id=user.id, invite_code=random_code(8))
    db.add(hh)
    db.flush()
    db.add(HouseholdMember(household_id=hh.id, user_id=user.id, display_name=user.full_name.split()[0],
                           relation="Me", is_admin=True))
    prof.household_id = hh.id
    # Existing pickups count towards the new household.
    for p in db.scalars(select(PickupRequest).where(PickupRequest.customer_id == user.id,
                                                    PickupRequest.household_id.is_(None))):
        p.household_id = hh.id
    audit(db, user.id, "household.create", "household", hh.id)
    db.commit()
    db.refresh(hh)
    return _view(db, hh, user)


@router.post("/join")
def join_household(body: JoinHouseholdIn, user: User = Depends(customer_only), db: Session = Depends(get_db)):
    prof = _profile(db, user)
    if prof.household_id:
        raise HTTPException(409, "Leave your current household first")
    hh = db.scalar(select(Household).where(Household.invite_code == body.invite_code.strip().upper()))
    if not hh:
        raise HTTPException(404, "No household found with that code")
    db.add(HouseholdMember(household_id=hh.id, user_id=user.id, display_name=user.full_name.split()[0]))
    prof.household_id = hh.id
    db.commit()
    db.refresh(hh)
    return _view(db, hh, user)


@router.post("/me/leave", status_code=204)
def leave_household(user: User = Depends(customer_only), db: Session = Depends(get_db)):
    prof = _profile(db, user)
    if not prof.household_id:
        return
    hh = db.get(Household, prof.household_id)
    if hh.owner_id == user.id and len([m for m in hh.members if m.user_id]) > 1:
        raise HTTPException(409, "Owners can leave once other app members have left")
    for m in hh.members:
        if m.user_id == user.id:
            db.delete(m)
    prof.household_id = None
    db.commit()


@router.post("/me/members", status_code=201)
def add_member(body: MemberIn, user: User = Depends(customer_only), db: Session = Depends(get_db)):
    prof = _profile(db, user)
    if not prof.household_id:
        raise HTTPException(404, "Create a household first")
    db.add(HouseholdMember(household_id=prof.household_id, display_name=body.display_name.strip(),
                           relation=body.relation))
    db.commit()
    return _view(db, db.get(Household, prof.household_id), user)


@router.delete("/me/members/{member_id}", status_code=204)
def remove_member(member_id: int, user: User = Depends(customer_only), db: Session = Depends(get_db)):
    prof = _profile(db, user)
    m = db.get(HouseholdMember, member_id)
    if not m or m.household_id != prof.household_id:
        raise HTTPException(404, "Member not found")
    hh = db.get(Household, prof.household_id)
    if hh.owner_id != user.id or m.user_id == user.id:
        raise HTTPException(403, "Only the household owner can remove other members")
    if m.user_id:
        other = db.get(CustomerProfile, m.user_id)
        if other:
            other.household_id = None
    db.delete(m)
    db.commit()
