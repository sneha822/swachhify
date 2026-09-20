from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.models import CollectionPartner, Payment, PickupRequest, User
from app.models.enums import PickupStatus, VerificationStatus
from app.schemas import LocationIn, PartnerUpdate, RespondIn, StatusIn
from app.services import pickups, storage
from app.services.common import now_ist, today_ist
from app.services.geo import eta_minutes, haversine_km
from app.services.realtime import hub
from app.api.v1.serializers import partner_view

router = APIRouter(prefix="/partners", tags=["partners"])
partner_only = require_roles("partner")


def _profile(db: Session, user: User) -> CollectionPartner:
    cp = db.get(CollectionPartner, user.id)
    if not cp:
        raise HTTPException(404, "Partner profile missing")
    return cp


def _verified(db: Session, user: User) -> CollectionPartner:
    cp = _profile(db, user)
    if cp.verification_status != VerificationStatus.VERIFIED:
        raise HTTPException(403, "Your account is awaiting verification")
    return cp


def _profile_view(cp: CollectionPartner, user: User) -> dict:
    return {"code": user.public_code, "full_name": user.full_name, "vehicle_type": cp.vehicle_type,
            "vehicle_number": cp.vehicle_number, "service_radius_km": cp.service_radius_km,
            "base_lat": cp.base_lat, "base_lng": cp.base_lng, "is_available": cp.is_available,
            "verification_status": cp.verification_status, "rating_avg": round(cp.rating_avg, 2),
            "rating_count": cp.rating_count}


@router.get("/me")
def me(user: User = Depends(partner_only), db: Session = Depends(get_db)):
    cp = _profile(db, user)
    today = today_ist()
    mine = PickupRequest.partner_id == user.id

    def count(*conds):
        return db.scalar(select(func.count(PickupRequest.id)).where(mine, *conds)) or 0

    earned_today = db.scalar(select(func.coalesce(func.sum(Payment.amount), 0)).where(
        Payment.payee_id == user.id, func.date(Payment.created_at) == today)) or 0
    return {
        **_profile_view(cp, user),
        "stats": {
            "today": count(PickupRequest.scheduled_date == today, PickupRequest.status != PickupStatus.CANCELLED),
            "pending": count(PickupRequest.status.in_(pickups.ACTIVE)),
            "completed": count(PickupRequest.status.in_([PickupStatus.COLLECTED, PickupStatus.VERIFIED,
                                                         PickupStatus.COMPLETED])),
            "earnings_today": round(earned_today, 2),
            "earnings_total": round(db.scalar(select(func.coalesce(func.sum(Payment.amount), 0))
                                              .where(Payment.payee_id == user.id)) or 0, 2),
        },
    }


@router.patch("/me")
def update_me(body: PartnerUpdate, user: User = Depends(partner_only), db: Session = Depends(get_db)):
    cp = _profile(db, user)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(cp, k, v)
    db.commit()
    return _profile_view(cp, user)


@router.post("/me/location")
def update_location(body: LocationIn, user: User = Depends(partner_only), db: Session = Depends(get_db)):
    cp = _profile(db, user)
    cp.current_lat, cp.current_lng, cp.location_updated_at = body.lat, body.lng, now_ist()
    # Push live distance/ETA to customers whose partner is en route.
    for p in db.scalars(select(PickupRequest).where(PickupRequest.partner_id == user.id,
                                                    PickupRequest.status == PickupStatus.ON_THE_WAY)):
        d = haversine_km(body.lat, body.lng, p.lat, p.lng)
        hub.publish(p.customer_id, "partner_location", {"code": p.code, "lat": body.lat, "lng": body.lng,
                                                        "distance_km": round(d, 1), "eta_min": eta_minutes(d)})
    db.commit()
    return {"ok": True}


@router.get("/pickups")
def list_pickups(scope: str = "assigned", user: User = Depends(partner_only), db: Session = Depends(get_db)):
    cp = _profile(db, user)
    if scope == "nearby":
        if cp.verification_status != VerificationStatus.VERIFIED:
            return []
        rows = db.scalars(select(PickupRequest).where(PickupRequest.status == PickupStatus.REQUESTED,
                                                      PickupRequest.scheduled_date >= today_ist())
                          .order_by(PickupRequest.scheduled_date)).all()
        out = [partner_view(db, p, cp) for p in rows]
        return sorted([v for v in out if v["distance_km"] <= cp.service_radius_km * 1.5],
                      key=lambda v: v["distance_km"])
    if scope == "history":
        rows = db.scalars(select(PickupRequest).where(
            PickupRequest.partner_id == user.id,
            PickupRequest.status.in_([PickupStatus.COLLECTED, PickupStatus.VERIFIED, PickupStatus.COMPLETED,
                                      PickupStatus.CANCELLED]))
            .order_by(PickupRequest.updated_at.desc()).limit(100)).all()
        return [partner_view(db, p, cp) for p in rows]
    rows = db.scalars(select(PickupRequest).where(PickupRequest.partner_id == user.id,
                                                  PickupRequest.status.in_(pickups.ACTIVE))
                      .order_by(PickupRequest.scheduled_date, PickupRequest.slot)).all()
    return [partner_view(db, p, cp) for p in rows]


def _get(db: Session, code: str) -> PickupRequest:
    p = db.scalar(select(PickupRequest).where(PickupRequest.code == code))
    if not p:
        raise HTTPException(404, "Pickup not found")
    return p


@router.get("/pickups/{code}")
def pickup_detail(code: str, user: User = Depends(partner_only), db: Session = Depends(get_db)):
    cp = _profile(db, user)
    p = _get(db, code)
    if p.partner_id != user.id and p.status != PickupStatus.REQUESTED:
        raise HTTPException(404, "Pickup not found")
    return partner_view(db, p, cp)


@router.post("/pickups/{code}/respond")
def respond(code: str, body: RespondIn, user: User = Depends(partner_only), db: Session = Depends(get_db)):
    cp = _verified(db, user)
    p = _get(db, code)
    pickups.respond(db, user, p, body.accept, body.reason)
    db.commit()
    return partner_view(db, p, cp)


@router.post("/pickups/{code}/claim")
def claim(code: str, user: User = Depends(partner_only), db: Session = Depends(get_db)):
    cp = _verified(db, user)
    p = _get(db, code)
    pickups.claim(db, user, p)
    db.commit()
    return partner_view(db, p, cp)


@router.post("/pickups/{code}/status")
def update_status(code: str, body: StatusIn, user: User = Depends(partner_only), db: Session = Depends(get_db)):
    cp = _verified(db, user)
    p = _get(db, code)
    pickups.advance(db, user, p, body.status, body.actual, note=body.note)
    db.commit()
    db.refresh(p)
    return partner_view(db, p, cp)


@router.post("/pickups/{code}/proof")
def upload_proof(code: str, photo: UploadFile = File(...), user: User = Depends(partner_only),
                 db: Session = Depends(get_db)):
    cp = _verified(db, user)
    p = _get(db, code)
    if p.partner_id != user.id:
        raise HTTPException(403, "This pickup isn't assigned to you")
    p.proof_url = storage.save_image(photo, f"proofs/{p.code}")
    db.commit()
    return partner_view(db, p, cp)


@router.get("/earnings")
def earnings(user: User = Depends(partner_only), db: Session = Depends(get_db)):
    rows = db.scalars(select(Payment).where(Payment.payee_id == user.id).order_by(Payment.id.desc()).limit(200)).all()
    total = sum(r.amount for r in rows)
    paid = sum(r.amount for r in rows if r.status == "paid")
    return {"total": round(total, 2), "paid": round(paid, 2), "pending": round(total - paid, 2),
            "items": [{"id": r.id, "amount": r.amount, "status": r.status, "reference": r.reference,
                       "description": r.description, "created_at": r.created_at, "paid_at": r.paid_at}
                      for r in rows]}
