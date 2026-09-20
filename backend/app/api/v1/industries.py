from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.models import IndustryOrder, IndustryTransaction, RecyclingIndustry, User
from app.models.enums import OrderStatus
from app.schemas import IndustryUpdate, OrderIn
from app.services import industry
from app.services.common import now_ist

router = APIRouter(prefix="/industries", tags=["industries"])
recycler_only = require_roles("recycler")


def _profile_view(p: RecyclingIndustry, user: User) -> dict:
    return {"code": user.public_code, "org_name": p.org_name, "authorization_number": p.authorization_number,
            "accepted_categories": p.accepted_categories, "address": p.address, "city": p.city,
            "lat": p.lat, "lng": p.lng, "verification_status": p.verification_status,
            "contact_name": user.full_name, "email": user.email, "phone": user.phone}


def order_view(o: IndustryOrder, invoice: IndustryTransaction | None = None) -> dict:
    return {"code": o.code, "category": o.category_slug, "quantity_kg": o.quantity_kg,
            "allocated_kg": o.allocated_kg, "price_per_kg": o.price_per_kg, "processing_method": o.processing_method,
            "status": o.status, "notes": o.notes, "admin_note": o.admin_note, "created_at": o.created_at,
            "updated_at": o.updated_at, "source_pickups": len({a.pickup_item.pickup_id for a in o.allocations}),
            "invoice_number": invoice.invoice_number if invoice else None}


def invoice_view(t: IndustryTransaction) -> dict:
    return {"invoice_number": t.invoice_number, "order_code": t.order.code, "category": t.order.category_slug,
            "quantity_kg": t.quantity_kg, "rate": t.rate, "amount": t.amount, "tax": t.tax,
            "total": round(t.amount + t.tax, 2), "status": t.status, "created_at": t.created_at, "paid_at": t.paid_at}


@router.get("/me")
def me(user: User = Depends(recycler_only), db: Session = Depends(get_db)):
    return _profile_view(db.get(RecyclingIndustry, user.id), user)


@router.patch("/me")
def update_me(body: IndustryUpdate, user: User = Depends(recycler_only), db: Session = Depends(get_db)):
    p = db.get(RecyclingIndustry, user.id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(p, k, v)
    db.commit()
    return _profile_view(p, user)


@router.get("/materials")
def materials(user: User = Depends(recycler_only), db: Session = Depends(get_db)):
    return industry.inventory(db)


@router.post("/orders", status_code=201)
def create_order(body: OrderIn, user: User = Depends(recycler_only), db: Session = Depends(get_db)):
    o = industry.create_order(db, user, body.category, body.quantity_kg, body.price_per_kg,
                              body.processing_method, body.notes)
    db.commit()
    return order_view(o)


def _invoices(db: Session, order_ids: list[int]) -> dict[int, IndustryTransaction]:
    if not order_ids:
        return {}
    return {t.order_id: t for t in db.scalars(select(IndustryTransaction)
                                              .where(IndustryTransaction.order_id.in_(order_ids)))}


@router.get("/orders")
def list_orders(user: User = Depends(recycler_only), db: Session = Depends(get_db)):
    rows = db.scalars(select(IndustryOrder).where(IndustryOrder.industry_id == user.id)
                      .order_by(IndustryOrder.id.desc())).all()
    inv = _invoices(db, [o.id for o in rows])
    return [order_view(o, inv.get(o.id)) for o in rows]


def _own_order(db: Session, user: User, code: str) -> IndustryOrder:
    o = db.scalar(select(IndustryOrder).where(IndustryOrder.code == code))
    if not o or o.industry_id != user.id:
        raise HTTPException(404, "Order not found")
    return o


@router.post("/orders/{code}/advance")
def advance(code: str, user: User = Depends(recycler_only), db: Session = Depends(get_db)):
    o = _own_order(db, user, code)
    industry.recycler_advance(db, user, o)
    db.commit()
    return order_view(o, _invoices(db, [o.id]).get(o.id))


@router.post("/orders/{code}/cancel")
def cancel(code: str, user: User = Depends(recycler_only), db: Session = Depends(get_db)):
    o = _own_order(db, user, code)
    if o.status != OrderStatus.REQUESTED:
        raise HTTPException(409, "Only pending requests can be cancelled")
    o.status, o.updated_at = OrderStatus.CANCELLED, now_ist()
    db.commit()
    return order_view(o)


@router.get("/transactions")
def transactions(user: User = Depends(recycler_only), db: Session = Depends(get_db)):
    rows = db.scalars(select(IndustryTransaction).where(IndustryTransaction.industry_id == user.id)
                      .order_by(IndustryTransaction.id.desc())).all()
    return [invoice_view(t) for t in rows]


@router.get("/invoices/{number}")
def invoice(number: str, user: User = Depends(require_roles("recycler", "admin")), db: Session = Depends(get_db)):
    t = db.scalar(select(IndustryTransaction).where(IndustryTransaction.invoice_number == number))
    if not t or (user.role == "recycler" and t.industry_id != user.id):
        raise HTTPException(404, "Invoice not found")
    buyer = db.get(RecyclingIndustry, t.industry_id)
    return {**invoice_view(t), "gst_rate": industry.GST_RATE,
            "buyer": {"org_name": buyer.org_name, "authorization_number": buyer.authorization_number,
                      "address": buyer.address, "city": buyer.city},
            "seller": {"name": "Swacchify Material Recovery Hub", "city": "Jaipur"}}
