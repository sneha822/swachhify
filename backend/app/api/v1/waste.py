from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import DropOffPoint
from app.services.geo import haversine_km
from app.services.knowledge import get_index

router = APIRouter(prefix="/waste", tags=["waste"])


def _item_view(it) -> dict:
    return {"slug": it.slug, "name": it.name, "name_hi": it.name_hi, "emoji": it.emoji,
            "category": it.category.slug, "collectable": it.collectable and it.category.collectable,
            "donatable": it.donatable, "what_to_do": it.what_to_do, "why": it.why,
            "what_not_to_do": it.what_not_to_do, "prep_tips": it.prep_tips, "safety_notes": it.safety_notes,
            "common_mistakes": it.common_mistakes, "reuse_tip": it.reuse_tip, "local_note": it.local_note,
            "lesson_slug": it.lesson_slug, "has_clarify": bool(it.clarify)}


def _cat_view(c) -> dict:
    return {"slug": c.slug, "name": c.name, "name_hi": c.name_hi, "emoji": c.emoji, "color": c.color,
            "short": c.short, "short_hi": c.short_hi, "collectable": c.collectable, "donatable": c.donatable,
            "points_per_kg": c.points_per_kg, "guidance": c.guidance}


@router.get("/categories")
def categories(db: Session = Depends(get_db)):
    return [_cat_view(c) for c in get_index(db).categories.values()]


@router.get("/categories/{slug}")
def category(slug: str, db: Session = Depends(get_db)):
    kb = get_index(db)
    c = kb.categories.get(slug)
    if not c:
        raise HTTPException(404, "Category not found")
    items = [_item_view(i) for i in kb.items.values() if i.category.slug == slug and not i.clarify]
    return {**_cat_view(c), "items": sorted(items, key=lambda i: i["name"])}


@router.get("/items")
def search_items(q: str = Query("", max_length=100), db: Session = Depends(get_db)):
    kb = get_index(db)
    if not q.strip():
        return [_item_view(i) for i in kb.items.values() if not i.clarify]
    return [_item_view(m.item) for m in kb.search(q, limit=8)]


@router.get("/items/{slug}")
def item(slug: str, db: Session = Depends(get_db)):
    it = get_index(db).items.get(slug)
    if not it:
        raise HTTPException(404, "Item not found")
    return _item_view(it)


@router.get("/dropoffs")
def dropoffs(category: str | None = None, kind: str | None = None, lat: float | None = None,
             lng: float | None = None, db: Session = Depends(get_db)):
    rows = db.scalars(select(DropOffPoint).where(DropOffPoint.is_active.is_(True))).all()
    out = []
    for d in rows:
        if kind and d.kind != kind:
            continue
        if category and category not in (d.accepted_categories or []):
            continue
        dist = round(haversine_km(lat, lng, d.lat, d.lng), 1) if lat is not None and lng is not None else None
        out.append({"id": d.id, "name": d.name, "kind": d.kind, "accepted_categories": d.accepted_categories,
                    "address": d.address, "city": d.city, "lat": d.lat, "lng": d.lng, "hours": d.hours,
                    "phone": d.phone, "distance_km": dist})
    return sorted(out, key=lambda x: (x["distance_km"] is None, x["distance_km"] or 0))
