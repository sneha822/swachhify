from datetime import date, datetime, time, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import (
    Address,
    CollectionPartner,
    CustomerProfile,
    ImpactRecord,
    Payment,
    PickupAssignment,
    PickupItem,
    PickupRequest,
    PickupStatusEvent,
    User,
    WasteCategory,
    WasteVerification,
)
from app.models.enums import AssignmentStatus, PickupStatus, SegregationQuality, VerificationStatus
from app.services import badges, habits, rewards
from app.services.common import IST, audit, now_ist, today_ist, unique_code
from app.services.geo import haversine_km
from app.services.notifications import notify
from app.services.realtime import hub

SLOTS = [("08-10", "8–10 AM", 8), ("10-12", "10 AM–12 PM", 10), ("12-14", "12–2 PM", 12),
         ("14-16", "2–4 PM", 14), ("16-18", "4–6 PM", 16)]
SLOT_START = {s[0]: s[2] for s in SLOTS}
MAX_DAYS_AHEAD = 14
MAX_ACTIVE_PER_PARTNER_PER_DAY = 12
ACTIVE = [PickupStatus.ASSIGNED, PickupStatus.ACCEPTED, PickupStatus.ON_THE_WAY, PickupStatus.ARRIVED]
CANCELLABLE = [PickupStatus.REQUESTED, *ACTIVE]

# Partner-driven transitions (verification happens at the warehouse, by admins).
PARTNER_NEXT = {
    PickupStatus.ACCEPTED: PickupStatus.ON_THE_WAY,
    PickupStatus.ON_THE_WAY: PickupStatus.ARRIVED,
    PickupStatus.ARRIVED: PickupStatus.COLLECTED,
}

MESSAGES = {
    PickupStatus.REQUESTED: ("Pickup requested", "We've received your pickup request {code}.",
                             "पिकअप अनुरोध मिला", "आपका पिकअप अनुरोध {code} मिल गया है।"),
    PickupStatus.ASSIGNED: ("Partner assigned", "Collection partner {partner} has been assigned to {code}.",
                            "साथी नियुक्त", "संग्रह साथी {partner} को {code} सौंपा गया है।"),
    PickupStatus.ACCEPTED: ("Pickup confirmed", "Partner {partner} accepted your pickup {code}.",
                            "पिकअप पक्का", "साथी {partner} ने आपका पिकअप {code} स्वीकार किया।"),
    PickupStatus.ON_THE_WAY: ("Partner on the way", "Partner {partner} is on the way for {code}.",
                              "साथी रास्ते में", "साथी {partner} {code} के लिए रास्ते में हैं।"),
    PickupStatus.ARRIVED: ("Partner has arrived", "Partner {partner} is at your address. Please hand over your "
                           "segregated waste.", "साथी पहुँच गए", "साथी {partner} आपके पते पर हैं।"),
    PickupStatus.COLLECTED: ("Waste collected", "Thanks! {code} has been collected and is going to our hub for "
                             "verification.", "कचरा उठा लिया गया", "धन्यवाद! {code} सत्यापन के लिए हब जा रहा है।"),
    PickupStatus.VERIFIED: ("Waste verified", "{code} was verified at the hub: {kg} kg.",
                            "कचरा सत्यापित", "{code} हब पर सत्यापित हुआ: {kg} किलो।"),
    PickupStatus.COMPLETED: ("Pickup completed", "{code} is complete. Thank you for segregating!",
                             "पिकअप पूरा", "{code} पूरा हुआ। कचरा अलग करने के लिए धन्यवाद!"),
    PickupStatus.CANCELLED: ("Pickup cancelled", "{code} was cancelled.", "पिकअप रद्द", "{code} रद्द किया गया।"),
}


# ── Slots ─────────────────────────────────────────────────────────────────────────────────────
def available_slots(db: Session, day: date) -> list[dict]:
    counts = dict(db.execute(
        select(PickupRequest.slot, func.count(PickupRequest.id))
        .where(PickupRequest.scheduled_date == day, PickupRequest.status != PickupStatus.CANCELLED)
        .group_by(PickupRequest.slot)).all())
    now = now_ist()
    out = []
    for key, label, start in SLOTS:
        # Same-day slots close an hour before they start.
        past = day < now.date() or (day == now.date() and now >= datetime.combine(day, time(start), IST) - timedelta(hours=1))
        remaining = settings.SLOT_CAPACITY - counts.get(key, 0)
        out.append({"slot": key, "label": label, "remaining": max(remaining, 0), "available": not past and remaining > 0})
    return out


# ── Status helper ─────────────────────────────────────────────────────────────────────────────
def _set_status(db: Session, p: PickupRequest, status: str, actor_id: int | None, note: str | None = None,
                notify_customer: bool = True) -> None:
    p.status = status
    p.updated_at = now_ist()
    db.add(PickupStatusEvent(pickup_id=p.id, status=status, actor_id=actor_id, note=note))
    customer = db.get(User, p.customer_id)
    partner = db.get(User, p.partner_id) if p.partner_id else None
    if notify_customer and customer and status in MESSAGES:
        t_en, b_en, t_hi, b_hi = MESSAGES[status]
        fmt = {"code": p.code, "partner": partner.public_code if partner else "",
               "kg": f"{p.actual_total_kg or 0:.1f}"}
        hindi = customer.language == "hi"
        notify(db, customer, "pickup", (t_hi if hindi else t_en), (b_hi if hindi else b_en).format(**fmt),
               {"pickup_code": p.code, "status": status})
    payload = {"code": p.code, "status": status}
    hub.publish(p.customer_id, "pickup_update", payload)
    if p.partner_id:
        hub.publish(p.partner_id, "pickup_update", payload)


# ── Create ────────────────────────────────────────────────────────────────────────────────────
def create(db: Session, customer: User, address_id: int, scheduled_date: date, slot: str, purpose: str,
           items: list[dict], notes: str | None) -> PickupRequest:
    address = db.get(Address, address_id)
    if not address or address.user_id != customer.id:
        raise HTTPException(404, "Address not found")
    if slot not in SLOT_START:
        raise HTTPException(422, "Unknown time slot")
    if scheduled_date < today_ist() or scheduled_date > today_ist() + timedelta(days=MAX_DAYS_AHEAD):
        raise HTTPException(422, f"Choose a date within the next {MAX_DAYS_AHEAD} days")
    slot_info = next(s for s in available_slots(db, scheduled_date) if s["slot"] == slot)
    if not slot_info["available"]:
        raise HTTPException(409, "That time slot is no longer available")
    if not items:
        raise HTTPException(422, "Add at least one waste category")

    cats = {c.slug: c for c in db.scalars(select(WasteCategory))}
    merged: dict[str, float] = {}
    for it in items:
        cat = cats.get(it["category"])
        if not cat:
            raise HTTPException(422, f"Unknown category {it['category']}")
        if not cat.collectable:
            raise HTTPException(422, f"{cat.name} isn't collected by Swacchify. Ask Swacchify AI what to do with it.")
        merged[cat.slug] = merged.get(cat.slug, 0) + float(it["estimated_kg"])

    prof = db.get(CustomerProfile, customer.id)
    p = PickupRequest(
        code=unique_code(db, PickupRequest, "code", "PU", 7), customer_id=customer.id,
        household_id=prof.household_id if prof else None, address_id=address.id,
        address_text=", ".join(x for x in [address.line1, address.line2, address.city, address.pincode] if x),
        landmark=address.landmark, city=address.city, lat=address.lat, lng=address.lng, purpose=purpose,
        scheduled_date=scheduled_date, slot=slot, status=PickupStatus.REQUESTED, notes=notes,
        estimated_total_kg=round(sum(merged.values()), 2), updated_at=now_ist(),
    )
    db.add(p)
    db.flush()
    for slug, kg in merged.items():
        db.add(PickupItem(pickup_id=p.id, category_slug=slug, estimated_kg=round(kg, 2)))
    _set_status(db, p, PickupStatus.REQUESTED, customer.id)
    audit(db, customer.id, "pickup.create", "pickup", p.code)
    auto_assign(db, p)
    return p


# ── Assignment ────────────────────────────────────────────────────────────────────────────────
def _partner_load(db: Session, partner_id: int, day: date) -> int:
    return db.scalar(select(func.count(PickupRequest.id)).where(
        PickupRequest.partner_id == partner_id, PickupRequest.scheduled_date == day,
        PickupRequest.status.in_(ACTIVE))) or 0


def candidate_partners(db: Session, p: PickupRequest) -> list[tuple[CollectionPartner, float]]:
    tried = set(db.scalars(select(PickupAssignment.partner_id).where(PickupAssignment.pickup_id == p.id)))
    rows = db.scalars(select(CollectionPartner).join(User).where(
        CollectionPartner.verification_status == VerificationStatus.VERIFIED,
        CollectionPartner.is_available.is_(True), User.is_active.is_(True))).all()
    out = []
    for cp in rows:
        if cp.user_id in tried:
            continue
        d = haversine_km(cp.base_lat, cp.base_lng, p.lat, p.lng)
        if d <= min(cp.service_radius_km, settings.PARTNER_SEARCH_RADIUS_KM) and \
                _partner_load(db, cp.user_id, p.scheduled_date) < MAX_ACTIVE_PER_PARTNER_PER_DAY:
            out.append((cp, d))
    return sorted(out, key=lambda x: x[1])


def auto_assign(db: Session, p: PickupRequest) -> bool:
    """Offer the pickup to the nearest eligible partner. Stays REQUESTED (visible as 'nearby') if none."""
    cands = candidate_partners(db, p)
    if not cands:
        return False
    cp, dist = cands[0]
    _offer(db, p, cp.user_id, dist, actor_id=None)
    return True


def _offer(db: Session, p: PickupRequest, partner_id: int, dist: float | None, actor_id: int | None) -> None:
    db.add(PickupAssignment(pickup_id=p.id, partner_id=partner_id, status=AssignmentStatus.OFFERED,
                            distance_km=round(dist, 2) if dist is not None else None))
    p.partner_id = partner_id
    _set_status(db, p, PickupStatus.ASSIGNED, actor_id)
    partner = db.get(User, partner_id)
    notify(db, partner, "pickup", "New pickup offered",
           f"{p.code} · {p.scheduled_date:%d %b} {p.slot} · ~{p.estimated_total_kg:g} kg", {"pickup_code": p.code})


def admin_assign(db: Session, admin: User, p: PickupRequest, partner_id: int) -> None:
    if p.status not in (PickupStatus.REQUESTED, PickupStatus.ASSIGNED):
        raise HTTPException(409, "Only unaccepted pickups can be reassigned")
    cp = db.get(CollectionPartner, partner_id)
    if not cp or cp.verification_status != VerificationStatus.VERIFIED:
        raise HTTPException(422, "Partner is not verified")
    _cancel_open_offers(db, p)
    _offer(db, p, partner_id, haversine_km(cp.base_lat, cp.base_lng, p.lat, p.lng), admin.id)
    audit(db, admin.id, "pickup.assign", "pickup", p.code, {"partner_id": partner_id})


def _cancel_open_offers(db: Session, p: PickupRequest) -> None:
    for a in db.scalars(select(PickupAssignment).where(
            PickupAssignment.pickup_id == p.id, PickupAssignment.status == AssignmentStatus.OFFERED)):
        a.status = AssignmentStatus.CANCELLED
        a.responded_at = now_ist()


def _open_offer(db: Session, p: PickupRequest, partner_id: int) -> PickupAssignment | None:
    return db.scalar(select(PickupAssignment).where(
        PickupAssignment.pickup_id == p.id, PickupAssignment.partner_id == partner_id,
        PickupAssignment.status == AssignmentStatus.OFFERED))


def respond(db: Session, partner: User, p: PickupRequest, accept: bool, reason: str | None) -> None:
    offer = _open_offer(db, p, partner.id)
    if p.status != PickupStatus.ASSIGNED or not offer:
        raise HTTPException(409, "This pickup is not waiting for your response")
    offer.responded_at = now_ist()
    if accept:
        offer.status = AssignmentStatus.ACCEPTED
        _set_status(db, p, PickupStatus.ACCEPTED, partner.id)
    else:
        offer.status = AssignmentStatus.REJECTED
        offer.reject_reason = reason
        p.partner_id = None
        _set_status(db, p, PickupStatus.REQUESTED, partner.id, note="Partner declined; finding another partner",
                    notify_customer=False)
        auto_assign(db, p)


def claim(db: Session, partner: User, p: PickupRequest) -> None:
    """Partner takes an unassigned pickup from the 'nearby' list."""
    if p.status != PickupStatus.REQUESTED:
        raise HTTPException(409, "Someone else already took this pickup")
    cp = db.get(CollectionPartner, partner.id)
    dist = haversine_km(cp.base_lat, cp.base_lng, p.lat, p.lng)
    db.add(PickupAssignment(pickup_id=p.id, partner_id=partner.id, status=AssignmentStatus.ACCEPTED,
                            distance_km=round(dist, 2), responded_at=now_ist()))
    p.partner_id = partner.id
    _set_status(db, p, PickupStatus.ACCEPTED, partner.id)


# ── Partner progress ──────────────────────────────────────────────────────────────────────────
def advance(db: Session, partner: User, p: PickupRequest, target: str, actual: dict[str, float] | None = None,
            proof_url: str | None = None, note: str | None = None) -> None:
    if p.partner_id != partner.id:
        raise HTTPException(403, "This pickup isn't assigned to you")
    if PARTNER_NEXT.get(p.status) != target:
        raise HTTPException(409, f"Can't move from {p.status} to {target}")
    if target == PickupStatus.COLLECTED:
        if not actual:
            raise HTTPException(422, "Record the collected weight for each category")
        items = {i.category_slug: i for i in p.items}
        for slug, kg in actual.items():
            if kg < 0:
                raise HTTPException(422, "Weight can't be negative")
            if slug in items:
                items[slug].actual_kg = round(kg, 2)
            elif kg > 0:  # partner found a category the customer didn't list
                db.add(PickupItem(pickup_id=p.id, category_slug=slug, estimated_kg=0, actual_kg=round(kg, 2)))
        db.flush()
        db.refresh(p)
        p.actual_total_kg = round(sum(i.actual_kg or 0 for i in p.items), 2)
        p.proof_url = proof_url or p.proof_url
        customer = db.get(User, p.customer_id)
        cats = {c.slug: c for c in db.scalars(select(WasteCategory))}
        est = sum(round((i.actual_kg or 0) * cats[i.category_slug].points_per_kg) for i in p.items
                  if i.category_slug in cats)
        if est > 0 and p.purpose != "donate":
            rewards.add_pending(db, customer, est, "pickup", f"Pickup {p.code} (awaiting verification)", p.code)
    _set_status(db, p, target, partner.id, note=note)


def cancel(db: Session, actor: User, p: PickupRequest, reason: str | None) -> None:
    if p.status not in CANCELLABLE:
        raise HTTPException(409, "This pickup can no longer be cancelled")
    _cancel_open_offers(db, p)
    p.cancel_reason = reason
    was_partner = p.partner_id
    _set_status(db, p, PickupStatus.CANCELLED, actor.id, note=reason)
    if was_partner and actor.id != was_partner:
        partner = db.get(User, was_partner)
        notify(db, partner, "pickup", "Pickup cancelled", f"{p.code} was cancelled.", {"pickup_code": p.code})
    audit(db, actor.id, "pickup.cancel", "pickup", p.code, {"reason": reason})


# ── Warehouse verification ────────────────────────────────────────────────────────────────────
def verify(db: Session, admin: User, p: PickupRequest, verified: dict[str, float], quality: str,
           notes: str | None) -> None:
    if p.status != PickupStatus.COLLECTED:
        raise HTTPException(409, "Only collected pickups can be verified")
    if quality not in SegregationQuality.__members__.values():
        raise HTTPException(422, "Invalid segregation quality")
    cats = {c.slug: c for c in db.scalars(select(WasteCategory))}
    for item in p.items:
        item.verified_kg = round(max(verified.get(item.category_slug, item.actual_kg or 0), 0), 2)
    total = round(sum(i.verified_kg or 0 for i in p.items), 2)
    p.actual_total_kg = total
    db.add(WasteVerification(pickup_id=p.id, verified_by=admin.id, total_kg=total, segregation_quality=quality,
                             notes=notes))
    _set_status(db, p, PickupStatus.VERIFIED, admin.id, note=notes)

    customer = db.get(User, p.customer_id)
    # Impact & points use verified weight only. Donations earn a flat thank-you instead of per-kg points.
    points = 0
    for item in p.items:
        cat = cats.get(item.category_slug)
        if not cat or not item.verified_kg:
            continue
        db.add(ImpactRecord(user_id=customer.id, household_id=p.household_id, pickup_id=p.id,
                            category_slug=cat.slug, purpose=p.purpose, kg=item.verified_kg,
                            co2e_kg_est=round(item.verified_kg * cat.co2e_factor, 3)))
        points += round(item.verified_kg * cat.points_per_kg)
    if p.purpose == "donate":
        points = 25 if total > 0 else 0
    if quality == SegregationQuality.GOOD:
        points = round(points * 1.1)  # 10% well-segregated bonus
    rewards.settle_pending(db, customer, "pickup", p.code, points,
                           f"Pickup {p.code}: {total:g} kg verified" + (" (well segregated +10%)"
                                                                         if quality == "good" else ""))
    if quality == SegregationQuality.POOR:
        habits.break_segregation_streak(db, customer)
        notify(db, customer, "learning", "A tip from our hub",
               (notes or "Some items in your pickup were mixed or dirty.")
               + " Watch '5 common segregation mistakes' to earn full points next time.",
               {"lesson": "segregation-mistakes"})

    if p.partner_id:
        earning = settings.PARTNER_BASE_FEE + sum(
            (i.verified_kg or 0) * cats[i.category_slug].partner_rate_per_kg for i in p.items if i.category_slug in cats)
        db.add(Payment(payee_id=p.partner_id, kind="partner_earning", amount=round(earning, 2), status="pending",
                       reference=p.code, description=f"Pickup {p.code} · {total:g} kg"))

    p.completed_at = now_ist()
    _set_status(db, p, PickupStatus.COMPLETED, admin.id)
    badges.evaluate(db, customer)
    audit(db, admin.id, "pickup.verify", "pickup", p.code, {"kg": total, "quality": quality})
