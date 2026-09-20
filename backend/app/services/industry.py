"""Recycler orders, warehouse inventory and household→recycler traceability."""

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    IndustryOrder,
    IndustryTransaction,
    LotAllocation,
    PickupItem,
    PickupRequest,
    RecyclingIndustry,
    User,
    WasteCategory,
)
from app.models.enums import OrderStatus, PickupStatus, VerificationStatus
from app.services.common import audit, now_ist, unique_code
from app.services.notifications import notify

GST_RATE = 0.18
RECYCLER_FLOW = {OrderStatus.DISPATCHED: OrderStatus.RECEIVED, OrderStatus.RECEIVED: OrderStatus.PROCESSED}


def inventory(db: Session) -> list[dict]:
    """Verified, unallocated recyclable material at the hub, per category. Donations are excluded."""
    rows = db.execute(
        select(PickupItem.category_slug,
               func.coalesce(func.sum(PickupItem.verified_kg - PickupItem.allocated_kg), 0))
        .join(PickupRequest)
        .where(PickupRequest.status == PickupStatus.COMPLETED, PickupRequest.purpose == "recycle",
               PickupItem.verified_kg.is_not(None))
        .group_by(PickupItem.category_slug)).all()
    avail = {slug: round(kg, 2) for slug, kg in rows}
    reserved = dict(db.execute(
        select(IndustryOrder.category_slug, func.coalesce(func.sum(IndustryOrder.quantity_kg), 0))
        .where(IndustryOrder.status.in_([OrderStatus.REQUESTED]))
        .group_by(IndustryOrder.category_slug)).all())
    cats = db.scalars(select(WasteCategory).where(WasteCategory.collectable.is_(True))
                      .order_by(WasteCategory.sort_order)).all()
    return [{"category": c.slug, "name": c.name, "emoji": c.emoji, "color": c.color,
             "available_kg": avail.get(c.slug, 0.0), "requested_kg": round(reserved.get(c.slug, 0.0), 2)}
            for c in cats]


def create_order(db: Session, user: User, category: str, quantity_kg: float, price_per_kg: float,
                 processing_method: str | None, notes: str | None) -> IndustryOrder:
    prof = db.get(RecyclingIndustry, user.id)
    if not prof or prof.verification_status != VerificationStatus.VERIFIED:
        raise HTTPException(403, "Your organisation must be verified before placing orders")
    if prof.accepted_categories and category not in prof.accepted_categories:
        raise HTTPException(422, "This category isn't in your accepted materials. Update your profile first.")
    cat = db.scalar(select(WasteCategory).where(WasteCategory.slug == category))
    if not cat or not cat.collectable:
        raise HTTPException(422, "Unknown material category")
    order = IndustryOrder(code=unique_code(db, IndustryOrder, "code", "IO", 6), industry_id=user.id,
                          category_slug=category, quantity_kg=quantity_kg, price_per_kg=price_per_kg,
                          processing_method=processing_method, notes=notes, status=OrderStatus.REQUESTED,
                          updated_at=now_ist())
    db.add(order)
    db.flush()
    audit(db, user.id, "order.create", "industry_order", order.code)
    for admin in db.scalars(select(User).where(User.role == "admin", User.is_active.is_(True))):
        notify(db, admin, "campaign", "New material request",
               f"{prof.org_name} requested {quantity_kg:g} kg of {cat.name} ({order.code}).", {"order": order.code})
    return order


def approve_and_dispatch(db: Session, admin: User, order: IndustryOrder, approve: bool, note: str | None) -> None:
    """Approve → allocate verified material FIFO → dispatch → raise invoice. Or reject."""
    if order.status != OrderStatus.REQUESTED:
        raise HTTPException(409, "Order is not awaiting approval")
    recycler = db.get(User, order.industry_id)
    order.admin_note = note
    order.updated_at = now_ist()
    if not approve:
        order.status = OrderStatus.REJECTED
        notify(db, recycler, "campaign", "Order not approved", f"{order.code}: {note or 'Please contact us.'}")
        audit(db, admin.id, "order.reject", "industry_order", order.code)
        return

    items = db.scalars(
        select(PickupItem).join(PickupRequest)
        .where(PickupItem.category_slug == order.category_slug, PickupRequest.status == PickupStatus.COMPLETED,
               PickupRequest.purpose == "recycle", PickupItem.verified_kg > PickupItem.allocated_kg)
        .order_by(PickupRequest.completed_at, PickupItem.id)).all()
    need = order.quantity_kg
    for it in items:
        if need <= 0:
            break
        take = round(min(need, it.verified_kg - it.allocated_kg), 3)
        if take <= 0:
            continue
        it.allocated_kg = round(it.allocated_kg + take, 3)
        db.add(LotAllocation(order_id=order.id, pickup_item_id=it.id, kg=take))
        need = round(need - take, 3)
    allocated = round(order.quantity_kg - max(need, 0), 3)
    if allocated <= 0:
        raise HTTPException(409, "No verified material available in this category yet")
    order.allocated_kg = allocated
    order.status = OrderStatus.DISPATCHED

    amount = round(allocated * order.price_per_kg, 2)
    db.add(IndustryTransaction(order_id=order.id, industry_id=order.industry_id,
                               invoice_number=unique_code(db, IndustryTransaction, "invoice_number", "INV", 8),
                               quantity_kg=allocated, rate=order.price_per_kg, amount=amount,
                               tax=round(amount * GST_RATE, 2)))
    notify(db, recycler, "campaign", "Material dispatched",
           f"{order.code}: {allocated:g} kg dispatched. Invoice raised for ₹{amount:,.2f} + GST.",
           {"order": order.code})
    _notify_households(db, order, "dispatched")
    audit(db, admin.id, "order.dispatch", "industry_order", order.code, {"allocated_kg": allocated})


def recycler_advance(db: Session, user: User, order: IndustryOrder) -> None:
    if order.industry_id != user.id:
        raise HTTPException(403, "Not your order")
    nxt = RECYCLER_FLOW.get(order.status)
    if not nxt:
        raise HTTPException(409, "Nothing to update on this order")
    order.status = nxt
    order.updated_at = now_ist()
    if nxt == OrderStatus.PROCESSED:
        _notify_households(db, order, "processed")
    audit(db, user.id, f"order.{nxt}", "industry_order", order.code)


def _notify_households(db: Session, order: IndustryOrder, stage: str) -> None:
    recycler = db.get(RecyclingIndustry, order.industry_id)
    method = order.processing_method or "recycling"
    customers: dict[int, float] = {}
    for a in order.allocations:
        pickup = a.pickup_item.pickup
        customers[pickup.customer_id] = customers.get(pickup.customer_id, 0) + a.kg
    for cid, kg in customers.items():
        user = db.get(User, cid)
        if stage == "dispatched":
            notify(db, user, "pickup", "Your waste is on its way",
                   f"{kg:.1f} kg of your material was sent to {recycler.org_name} for {method}.")
        else:
            notify(db, user, "pickup", "Your waste was processed",
                   f"{recycler.org_name} has processed your material ({method}). Thank you for segregating!")


def journey(db: Session, pickup: PickupRequest) -> list[dict]:
    """Where each part of a pickup went after verification."""
    out = []
    for item in pickup.items:
        allocs = db.scalars(select(LotAllocation).where(LotAllocation.pickup_item_id == item.id)).all()
        for a in allocs:
            order = a.order
            rec = db.get(RecyclingIndustry, order.industry_id)
            out.append({"category": item.category_slug, "kg": a.kg, "recycler": rec.org_name if rec else "Recycler",
                        "city": rec.city if rec else None, "method": order.processing_method or "recycling",
                        "status": order.status, "order_code": order.code})
        remaining = (item.verified_kg or 0) - item.allocated_kg
        if item.verified_kg and remaining > 0.001:
            out.append({"category": item.category_slug, "kg": round(remaining, 2),
                        "recycler": None, "status": "at_hub",
                        "method": "donation to partner schools & NGOs" if pickup.purpose == "donate" else None})
    return out
