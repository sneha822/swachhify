"""Pickup views. Privacy rule: each side sees the other's Swacchify ID, never their name.
A contact number is shared only while a pickup is actively in progress."""

from sqlalchemy.orm import Session

from app.models import CollectionPartner, PickupRequest, User
from app.models.enums import PICKUP_FLOW, PickupStatus
from app.services.geo import eta_minutes, haversine_km

IN_PROGRESS = {PickupStatus.ACCEPTED, PickupStatus.ON_THE_WAY, PickupStatus.ARRIVED}


def _items(p: PickupRequest) -> list[dict]:
    return [{"category": i.category_slug, "estimated_kg": i.estimated_kg, "actual_kg": i.actual_kg,
             "verified_kg": i.verified_kg} for i in p.items]


def _timeline(p: PickupRequest) -> list[dict]:
    return [{"status": e.status, "note": e.note, "at": e.created_at} for e in p.events]


def _base(p: PickupRequest) -> dict:
    return {
        "code": p.code, "status": p.status, "purpose": p.purpose, "scheduled_date": p.scheduled_date,
        "slot": p.slot, "items": _items(p), "estimated_total_kg": p.estimated_total_kg,
        "actual_total_kg": p.actual_total_kg, "notes": p.notes, "created_at": p.created_at,
        "updated_at": p.updated_at, "completed_at": p.completed_at, "cancel_reason": p.cancel_reason,
        "timeline": _timeline(p), "flow": list(PICKUP_FLOW), "proof_url": p.proof_url,
        "verification": {"total_kg": p.verification.total_kg, "quality": p.verification.segregation_quality,
                         "notes": p.verification.notes} if p.verification else None,
    }


def partner_live(db: Session, p: PickupRequest) -> dict | None:
    if not p.partner_id:
        return None
    cp = db.get(CollectionPartner, p.partner_id)
    if not cp:
        return None
    lat, lng = (cp.current_lat, cp.current_lng) if cp.current_lat is not None else (cp.base_lat, cp.base_lng)
    d = haversine_km(lat, lng, p.lat, p.lng)
    return {"lat": lat, "lng": lng, "distance_km": round(d, 1), "eta_min": eta_minutes(d),
            "live": cp.current_lat is not None and p.status == PickupStatus.ON_THE_WAY,
            "updated_at": cp.location_updated_at}


def customer_view(db: Session, p: PickupRequest, detail: bool = False) -> dict:
    v = _base(p)
    v["address"] = {"text": p.address_text, "landmark": p.landmark, "lat": p.lat, "lng": p.lng}
    partner = db.get(User, p.partner_id) if p.partner_id else None
    if partner:
        cp = db.get(CollectionPartner, partner.id)
        v["partner"] = {"code": partner.public_code, "vehicle": cp.vehicle_type if cp else None,
                        "rating": round(cp.rating_avg, 1) if cp and cp.rating_count else None,
                        "phone": partner.phone if p.status in IN_PROGRESS else None}
    else:
        v["partner"] = None
    if detail:
        v["tracking"] = partner_live(db, p) if p.status in IN_PROGRESS else None
    return v


def partner_view(db: Session, p: PickupRequest, me: CollectionPartner | None = None) -> dict:
    v = _base(p)
    customer = db.get(User, p.customer_id)
    v["customer"] = {"code": customer.public_code,
                     "phone": customer.phone if p.status in IN_PROGRESS else None}
    v["address"] = {"text": p.address_text, "landmark": p.landmark, "lat": p.lat, "lng": p.lng, "city": p.city}
    if me:
        lat, lng = (me.current_lat, me.current_lng) if me.current_lat is not None else (me.base_lat, me.base_lng)
        v["distance_km"] = round(haversine_km(lat, lng, p.lat, p.lng), 1)
    return v
