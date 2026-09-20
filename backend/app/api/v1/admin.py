from collections import Counter, defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import Page, require_roles
from app.models import (
    AIConversation,
    AIMessage,
    AuditLog,
    CollectionPartner,
    Household,
    ImpactRecord,
    IndustryOrder,
    IndustryTransaction,
    LearningProgress,
    Lesson,
    Payment,
    PickupRequest,
    QuizAttempt,
    QuizQuestion,
    RecyclingIndustry,
    RewardTransaction,
    User,
    WasteCategory,
    WasteItem,
)
from app.models.enums import OrderStatus, PickupStatus, TxnStatus, TxnType, VerificationStatus
from app.schemas import (
    AssignIn,
    LessonIn,
    OrderDecision,
    UserAdminUpdate,
    VerifyAccountIn,
    VerifyIn,
    WasteItemIn,
)
from app.services import industry, knowledge, pickups
from app.services.common import audit, now_ist, today_ist
from app.services.geo import haversine_km
from app.services.notifications import notify
from app.api.v1.industries import order_view
from app.api.v1.serializers import partner_view

router = APIRouter(prefix="/admin", tags=["admin"])
admin_only = require_roles("admin")


def _months(n: int = 6) -> list:
    start = today_ist().replace(day=1)
    out = []
    for _ in range(n):
        out.append(start)
        start = (start - timedelta(days=1)).replace(day=1)
    return list(reversed(out))


def _bucket(rows, months) -> dict:
    """rows: iterable of (datetime, value) → {YYYY-MM: sum}. Aggregated in Python to stay DB-portable."""
    keys = {m.strftime("%Y-%m") for m in months}
    acc: dict[str, float] = defaultdict(float)
    for ts, val in rows:
        if ts is None:
            continue
        k = ts.strftime("%Y-%m")
        if k in keys:
            acc[k] += val or 0
    return acc


@router.get("/overview")
def overview(user: User = Depends(admin_only), db: Session = Depends(get_db)):
    today = today_ist()
    months = _months()
    since = datetime.combine(months[0], datetime.min.time())
    count = lambda model, *c: db.scalar(select(func.count(model.id if hasattr(model, "id") else model.user_id)).where(*c)) or 0  # noqa: E731

    by_cat = dict(db.execute(select(ImpactRecord.category_slug, func.sum(ImpactRecord.kg))
                             .group_by(ImpactRecord.category_slug)).all())
    cats = db.scalars(select(WasteCategory).order_by(WasteCategory.sort_order)).all()

    pickup_rows = db.execute(select(PickupRequest.created_at, PickupRequest.status)
                             .where(PickupRequest.created_at >= since)).all()
    impact_rows = db.execute(select(ImpactRecord.created_at, ImpactRecord.kg, ImpactRecord.category_slug,
                                    ImpactRecord.household_id).where(ImpactRecord.created_at >= since)).all()
    user_rows = db.execute(select(User.created_at).where(User.created_at >= since, User.role == "customer")).all()
    learn_rows = db.execute(select(LearningProgress.completed_at).where(LearningProgress.completed_at >= since)).all()
    quiz_rows = db.execute(select(QuizAttempt.created_at).where(QuizAttempt.created_at >= since)).all()
    reward_rows = db.execute(select(RewardTransaction.created_at, RewardTransaction.points).where(
        RewardTransaction.created_at >= since, RewardTransaction.type == TxnType.EARN,
        RewardTransaction.status == TxnStatus.CREDITED)).all()

    trend = []
    requested = _bucket(((r[0], 1) for r in pickup_rows), months)
    completed = _bucket(((r[0], 1) for r in pickup_rows if r[1] == PickupStatus.COMPLETED), months)
    kg = _bucket(((r[0], r[1]) for r in impact_rows), months)
    ewaste = _bucket(((r[0], r[1]) for r in impact_rows if r[2] == "ewaste"), months)
    new_users = _bucket(((r[0], 1) for r in user_rows), months)
    lessons = _bucket(((r[0], 1) for r in learn_rows), months)
    quizzes = _bucket(((r[0], 1) for r in quiz_rows), months)
    pts = _bucket(((r[0], r[1]) for r in reward_rows), months)
    hh_active: dict[str, set] = defaultdict(set)
    for ts, _, _, hh in impact_rows:
        if hh:
            hh_active[ts.strftime("%Y-%m")].add(hh)
    for m in months:
        k = m.strftime("%Y-%m")
        trend.append({"month": m.strftime("%b"), "pickups": int(requested.get(k, 0)),
                      "completed": int(completed.get(k, 0)), "kg": round(kg.get(k, 0), 1),
                      "ewaste_kg": round(ewaste.get(k, 0), 1), "new_users": int(new_users.get(k, 0)),
                      "lessons": int(lessons.get(k, 0)), "quizzes": int(quizzes.get(k, 0)),
                      "points": int(pts.get(k, 0)), "active_households": len(hh_active.get(k, ()))})

    started = count(LearningProgress)
    finished = count(LearningProgress, LearningProgress.completed.is_(True))
    week_ago = today - timedelta(days=7)
    cohort = count(User, User.role == "customer", User.created_at < datetime.combine(week_ago, datetime.min.time()))
    retained = count(User, User.role == "customer",
                     User.created_at < datetime.combine(week_ago, datetime.min.time()),
                     User.last_active_on >= week_ago)
    cities = db.execute(select(PickupRequest.city, func.count(PickupRequest.id), func.avg(PickupRequest.lat),
                               func.avg(PickupRequest.lng)).group_by(PickupRequest.city)).all()
    top_items = db.execute(select(AIMessage.matched_item_slug, func.count(AIMessage.id))
                           .where(AIMessage.role == "assistant", AIMessage.matched_item_slug.is_not(None))
                           .group_by(AIMessage.matched_item_slug).order_by(func.count(AIMessage.id).desc())
                           .limit(5)).all()
    names = {i.slug: i.name for i in db.scalars(select(WasteItem))}

    return {
        "kpis": {
            "total_users": count(User),
            "customers": count(User, User.role == "customer"),
            "active_users_30d": count(User, User.last_active_on >= today - timedelta(days=30)),
            "households": count(Household),
            "partners": count(CollectionPartner),
            "partners_pending": count(CollectionPartner, CollectionPartner.verification_status == "pending"),
            "recyclers": count(RecyclingIndustry),
            "recyclers_pending": count(RecyclingIndustry, RecyclingIndustry.verification_status == "pending"),
            "pickups_total": count(PickupRequest),
            "pickups_completed": count(PickupRequest, PickupRequest.status == PickupStatus.COMPLETED),
            "pickups_pending": count(PickupRequest, PickupRequest.status.not_in(
                [PickupStatus.COMPLETED, PickupStatus.CANCELLED])),
            "awaiting_verification": count(PickupRequest, PickupRequest.status == PickupStatus.COLLECTED),
            "waste_collected_kg": round(sum(by_cat.values()), 1),
            "rewards_distributed": int(db.scalar(select(func.coalesce(func.sum(RewardTransaction.points), 0)).where(
                RewardTransaction.type == TxnType.EARN, RewardTransaction.status == TxnStatus.CREDITED)) or 0),
            "ai_questions": count(AIMessage, AIMessage.role == "user"),
            "lessons_completed": finished,
            "video_completion_rate": round(100 * finished / started) if started else 0,
            "retention_7d": round(100 * retained / cohort) if cohort else 0,
            "orders_pending": count(IndustryOrder, IndustryOrder.status == OrderStatus.REQUESTED),
        },
        "waste_by_category": [{"category": c.slug, "name": c.name, "color": c.color, "emoji": c.emoji,
                               "kg": round(by_cat.get(c.slug, 0), 1)} for c in cats if c.collectable],
        "trend": trend,
        "cities": [{"city": c, "pickups": n, "lat": lat, "lng": lng} for c, n, lat, lng in cities],
        "top_questions": [{"item": s, "name": names.get(s, s), "count": n} for s, n in top_items],
    }


# ── Users & verification ──────────────────────────────────────────────────────────────────────
@router.get("/users")
def users(role: str | None = None, q: str | None = None, status: str | None = None, page: Page = Depends(),
          user: User = Depends(admin_only), db: Session = Depends(get_db)):
    conds = []
    if role:
        conds.append(User.role == role)
    if q:
        like = f"%{q.lower()}%"
        conds.append(or_(func.lower(User.full_name).like(like), func.lower(User.email).like(like),
                         func.lower(User.public_code).like(like)))
    stmt = select(User).where(*conds)
    if status in ("pending", "verified", "rejected"):
        stmt = stmt.outerjoin(CollectionPartner).outerjoin(RecyclingIndustry).where(
            or_(CollectionPartner.verification_status == status, RecyclingIndustry.verification_status == status))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(User.id.desc()).offset(page.offset).limit(page.size)).all()
    out = []
    for u in rows:
        v = {"id": u.id, "public_code": u.public_code, "role": u.role, "full_name": u.full_name, "email": u.email,
             "phone": u.phone, "is_active": u.is_active, "created_at": u.created_at,
             "last_active_on": u.last_active_on, "verification_status": None, "details": None}
        if u.partner_profile:
            cp = u.partner_profile
            v["verification_status"] = cp.verification_status
            v["details"] = f"{cp.vehicle_type} {cp.vehicle_number or ''} · ★ {cp.rating_avg:.1f} ({cp.rating_count})"
        if u.industry_profile:
            ip = u.industry_profile
            v["verification_status"] = ip.verification_status
            v["details"] = f"{ip.org_name} · Auth: {ip.authorization_number or '—'} · " \
                           f"{', '.join(ip.accepted_categories or [])}"
        out.append(v)
    return page.wrap(out, total)


@router.patch("/users/{user_id}")
def update_user(user_id: int, body: UserAdminUpdate, request: Request, admin: User = Depends(admin_only),
                db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    if u.id == admin.id:
        raise HTTPException(400, "You can't deactivate yourself")
    u.is_active = body.is_active
    audit(db, admin.id, "user.active" if body.is_active else "user.deactivate", "user", u.id,
          ip=request.client.host if request.client else None)
    db.commit()
    return {"id": u.id, "is_active": u.is_active}


@router.post("/users/{user_id}/verify")
def verify_account(user_id: int, body: VerifyAccountIn, admin: User = Depends(admin_only),
                   db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    prof = (u.partner_profile or u.industry_profile) if u else None
    if not prof:
        raise HTTPException(404, "Partner or recycler not found")
    prof.verification_status = body.status
    if body.status == VerificationStatus.VERIFIED:
        notify(db, u, "campaign", "Your account is verified",
               "You can now receive pickups." if u.role == "partner" else "You can now request material.")
    elif body.status == VerificationStatus.REJECTED:
        notify(db, u, "campaign", "Verification unsuccessful", "Please contact support to update your details.")
    audit(db, admin.id, f"account.{body.status}", "user", u.id)
    db.commit()
    return {"id": u.id, "verification_status": prof.verification_status}


# ── Pickups ───────────────────────────────────────────────────────────────────────────────────
@router.get("/pickups")
def list_pickups(status: str | None = None, q: str | None = None, page: Page = Depends(),
                 user: User = Depends(admin_only), db: Session = Depends(get_db)):
    conds = []
    if status == "active":
        conds.append(PickupRequest.status.not_in([PickupStatus.COMPLETED, PickupStatus.CANCELLED]))
    elif status:
        conds.append(PickupRequest.status == status)
    if q:
        conds.append(PickupRequest.code.ilike(f"%{q}%"))
    total = db.scalar(select(func.count(PickupRequest.id)).where(*conds)) or 0
    rows = db.scalars(select(PickupRequest).where(*conds).order_by(PickupRequest.id.desc())
                      .offset(page.offset).limit(page.size)).all()
    items = []
    for p in rows:
        v = partner_view(db, p)
        partner = db.get(User, p.partner_id) if p.partner_id else None
        v["partner"] = {"id": partner.id, "code": partner.public_code} if partner else None
        items.append(v)
    return page.wrap(items, total)


def _pickup(db: Session, code: str) -> PickupRequest:
    p = db.scalar(select(PickupRequest).where(PickupRequest.code == code))
    if not p:
        raise HTTPException(404, "Pickup not found")
    return p


@router.get("/pickups/{code}/partners")
def assignable_partners(code: str, user: User = Depends(admin_only), db: Session = Depends(get_db)):
    p = _pickup(db, code)
    rows = db.scalars(select(CollectionPartner).where(
        CollectionPartner.verification_status == VerificationStatus.VERIFIED)).all()
    out = [{"id": cp.user_id, "code": cp.user.public_code, "vehicle": cp.vehicle_type,
            "available": cp.is_available, "rating": round(cp.rating_avg, 1),
            "distance_km": round(haversine_km(cp.base_lat, cp.base_lng, p.lat, p.lng), 1)} for cp in rows]
    return sorted(out, key=lambda x: x["distance_km"])


@router.post("/pickups/{code}/assign")
def assign(code: str, body: AssignIn, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    p = _pickup(db, code)
    pickups.admin_assign(db, admin, p, body.partner_id)
    db.commit()
    return {"code": p.code, "status": p.status}


@router.post("/pickups/{code}/verify")
def verify(code: str, body: VerifyIn, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    p = _pickup(db, code)
    pickups.verify(db, admin, p, body.verified, body.quality, body.notes)
    db.commit()
    return {"code": p.code, "status": p.status, "total_kg": p.actual_total_kg}


@router.post("/pickups/{code}/cancel")
def cancel(code: str, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    p = _pickup(db, code)
    pickups.cancel(db, admin, p, "Cancelled by Swacchify support")
    db.commit()
    return {"code": p.code, "status": p.status}


# ── AI analytics ──────────────────────────────────────────────────────────────────────────────
@router.get("/ai/analytics")
def ai_analytics(days: int = 30, user: User = Depends(admin_only), db: Session = Depends(get_db)):
    since = datetime.combine(today_ist() - timedelta(days=days), datetime.min.time())
    bots = db.scalars(select(AIMessage).where(AIMessage.role == "assistant", AIMessage.created_at >= since)).all()
    names = {i.slug: i.name for i in db.scalars(select(WasteItem))}
    cat_names = {c.slug: c.name for c in db.scalars(select(WasteCategory))}

    # Pair each assistant reply with the user question right before it.
    conv_ids = {b.conversation_id for b in bots}
    questions: dict[int, str] = {}
    if conv_ids:
        msgs = db.scalars(select(AIMessage).where(AIMessage.conversation_id.in_(conv_ids))
                          .order_by(AIMessage.conversation_id, AIMessage.id)).all()
        last_q: dict[int, str] = {}
        for m in msgs:
            if m.role == "user":
                last_q[m.conversation_id] = m.content
            else:
                questions[m.id] = last_q.get(m.conversation_id, "")

    top = Counter(b.matched_item_slug for b in bots if b.matched_item_slug and b.intent == "answer")
    cats = Counter(b.category_slug for b in bots if b.category_slug)
    confused = Counter(b.matched_item_slug for b in bots if b.intent == "clarify" and b.matched_item_slug)
    unknown = [{"question": questions.get(b.id, ""), "at": b.created_at} for b in bots
               if (b.confidence or 1) < 0.5][-15:]
    negative = [{"question": questions.get(b.id, ""), "answer": b.content, "note": b.feedback_note,
                 "at": b.created_at} for b in bots if b.feedback == -1][-15:]
    rated = [b for b in bots if b.feedback is not None]

    # Where do learners get quiz questions wrong?
    struggles: dict[int, list[int]] = defaultdict(lambda: [0, 0])
    for a in db.scalars(select(QuizAttempt).where(QuizAttempt.created_at >= since)):
        for ans in a.answers or []:
            s = struggles[ans["question_id"]]
            s[0] += 0 if ans["correct"] else 1
            s[1] += 1
    qtext = {q.id: q for q in db.scalars(select(QuizQuestion).where(QuizQuestion.id.in_(list(struggles) or [0])))}
    hardest = sorted(({"question": qtext[qid].question, "wrong_pct": round(100 * w / n), "attempts": n}
                      for qid, (w, n) in struggles.items() if qid in qtext and n), key=lambda x: -x["wrong_pct"])[:6]

    return {
        "total_questions": len(bots),
        "conversations": db.scalar(select(func.count(AIConversation.id))
                                   .where(AIConversation.created_at >= since)) or 0,
        "by_source": dict(Counter(b.source or "knowledge_base" for b in bots)),
        "helpful_rate": round(100 * sum(1 for b in rated if b.feedback == 1) / len(rated)) if rated else None,
        "rated": len(rated),
        "top_items": [{"item": s, "name": names.get(s, s), "count": n} for s, n in top.most_common(10)],
        "top_categories": [{"category": s, "name": cat_names.get(s, s), "count": n} for s, n in cats.most_common()],
        "confused_items": [{"item": s, "name": names.get(s, s), "count": n} for s, n in confused.most_common(8)],
        "unanswered": list(reversed(unknown)),
        "negative_feedback": list(reversed(negative)),
        "quiz_struggles": hardest,
    }


# ── Knowledge base ────────────────────────────────────────────────────────────────────────────
def _kb_item_view(i: WasteItem) -> dict:
    return {"id": i.id, "slug": i.slug, "name": i.name, "name_hi": i.name_hi, "emoji": i.emoji,
            "aliases": i.aliases, "category": i.category.slug, "collectable": i.collectable,
            "donatable": i.donatable, "what_to_do": i.what_to_do, "why": i.why,
            "what_not_to_do": i.what_not_to_do, "prep_tips": i.prep_tips, "safety_notes": i.safety_notes,
            "common_mistakes": i.common_mistakes, "reuse_tip": i.reuse_tip, "local_note": i.local_note,
            "lesson_slug": i.lesson_slug, "related": i.related, "is_active": i.is_active,
            "has_clarify": bool(i.clarify), "updated_at": i.updated_at}


@router.get("/knowledge/items")
def kb_items(q: str | None = None, category: str | None = None, user: User = Depends(admin_only),
             db: Session = Depends(get_db)):
    stmt = select(WasteItem).join(WasteCategory)
    if category:
        stmt = stmt.where(WasteCategory.slug == category)
    if q:
        stmt = stmt.where(or_(WasteItem.name.ilike(f"%{q}%"), WasteItem.slug.ilike(f"%{q}%")))
    return [_kb_item_view(i) for i in db.scalars(stmt.order_by(WasteCategory.sort_order, WasteItem.name))]


def _apply_item(db: Session, it: WasteItem, body: WasteItemIn) -> None:
    cat = db.scalar(select(WasteCategory).where(WasteCategory.slug == body.category))
    if not cat:
        raise HTTPException(422, "Unknown category")
    data = body.model_dump(exclude={"category"})
    for k, v in data.items():
        setattr(it, k, v)
    it.category_id = cat.id


@router.post("/knowledge/items", status_code=201)
def kb_create(body: WasteItemIn, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    if db.scalar(select(WasteItem.id).where(WasteItem.slug == body.slug)):
        raise HTTPException(409, "An item with this slug already exists")
    it = WasteItem()
    _apply_item(db, it, body)
    db.add(it)
    audit(db, admin.id, "kb.create", "waste_item", body.slug)
    db.commit()
    knowledge.invalidate()
    db.refresh(it)
    return _kb_item_view(it)


@router.put("/knowledge/items/{item_id}")
def kb_update(item_id: int, body: WasteItemIn, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    it = db.get(WasteItem, item_id)
    if not it:
        raise HTTPException(404, "Item not found")
    _apply_item(db, it, body)
    audit(db, admin.id, "kb.update", "waste_item", it.slug)
    db.commit()
    knowledge.invalidate()
    db.refresh(it)
    return _kb_item_view(it)


@router.delete("/knowledge/items/{item_id}", status_code=204)
def kb_delete(item_id: int, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    """Soft-delete so past AI answers and analytics keep resolving."""
    it = db.get(WasteItem, item_id)
    if not it:
        raise HTTPException(404, "Item not found")
    it.is_active = False
    audit(db, admin.id, "kb.deactivate", "waste_item", it.slug)
    db.commit()
    knowledge.invalidate()


# ── Learning content ──────────────────────────────────────────────────────────────────────────
@router.get("/lessons")
def lessons(user: User = Depends(admin_only), db: Session = Depends(get_db)):
    rows = db.scalars(select(Lesson).order_by(Lesson.sort_order, Lesson.id)).all()
    stats = {lid: (n, c) for lid, n, c in db.execute(
        select(LearningProgress.lesson_id, func.count(LearningProgress.id),
               func.sum(case((LearningProgress.completed.is_(True), 1), else_=0)))
        .group_by(LearningProgress.lesson_id)).all()}
    return [{"id": l.id, "slug": l.slug, "title": l.title, "title_hi": l.title_hi, "category_slug": l.category_slug,
             "description": l.description, "description_hi": l.description_hi, "duration_sec": l.duration_sec,
             "emoji": l.emoji, "video_url": l.video_url, "slides": l.slides, "is_published": l.is_published,
             "views": stats.get(l.id, (0, 0))[0], "completions": int(stats.get(l.id, (0, 0))[1] or 0)}
            for l in rows]


@router.post("/lessons", status_code=201)
def create_lesson(body: LessonIn, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    if db.scalar(select(Lesson.id).where(Lesson.slug == body.slug)):
        raise HTTPException(409, "A lesson with this slug already exists")
    l = Lesson(**body.model_dump(), sort_order=100)
    db.add(l)
    audit(db, admin.id, "lesson.create", "lesson", body.slug)
    db.commit()
    knowledge.invalidate()
    if body.is_published:
        for u in db.scalars(select(User).where(User.role == "customer", User.is_active.is_(True))):
            notify(db, u, "content", "New lesson", f"{body.title} — {body.duration_sec} sec")
        db.commit()
    return {"id": l.id, "slug": l.slug}


@router.put("/lessons/{lesson_id}")
def update_lesson(lesson_id: int, body: LessonIn, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    l = db.get(Lesson, lesson_id)
    if not l:
        raise HTTPException(404, "Lesson not found")
    for k, v in body.model_dump().items():
        setattr(l, k, v)
    audit(db, admin.id, "lesson.update", "lesson", l.slug)
    db.commit()
    knowledge.invalidate()
    return {"id": l.id, "slug": l.slug}


# ── Industry orders ───────────────────────────────────────────────────────────────────────────
@router.get("/orders")
def orders(status: str | None = None, user: User = Depends(admin_only), db: Session = Depends(get_db)):
    stmt = select(IndustryOrder).order_by(IndustryOrder.id.desc())
    if status:
        stmt = stmt.where(IndustryOrder.status == status)
    out = []
    for o in db.scalars(stmt.limit(200)):
        rec = db.get(RecyclingIndustry, o.industry_id)
        inv = db.scalar(select(IndustryTransaction).where(IndustryTransaction.order_id == o.id))
        out.append({**order_view(o, inv), "org_name": rec.org_name if rec else None})
    return {"orders": out, "inventory": industry.inventory(db)}


@router.post("/orders/{code}/decision")
def decide(code: str, body: OrderDecision, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    o = db.scalar(select(IndustryOrder).where(IndustryOrder.code == code))
    if not o:
        raise HTTPException(404, "Order not found")
    industry.approve_and_dispatch(db, admin, o, body.approve, body.note)
    db.commit()
    return order_view(o)


@router.post("/invoices/{number}/paid")
def invoice_paid(number: str, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    t = db.scalar(select(IndustryTransaction).where(IndustryTransaction.invoice_number == number))
    if not t:
        raise HTTPException(404, "Invoice not found")
    t.status, t.paid_at = "paid", now_ist()
    audit(db, admin.id, "invoice.paid", "invoice", number)
    db.commit()
    return {"invoice_number": number, "status": t.status}


# ── Payouts & redemptions ─────────────────────────────────────────────────────────────────────
@router.get("/payouts")
def payouts(user: User = Depends(admin_only), db: Session = Depends(get_db)):
    pays = db.scalars(select(Payment).where(Payment.status == "pending").order_by(Payment.id)).all()
    reds = db.scalars(select(RewardTransaction).where(RewardTransaction.type == TxnType.REDEEM,
                                                      RewardTransaction.status == TxnStatus.PENDING)).all()
    codes = {u.id: u.public_code for u in db.scalars(select(User).where(
        User.id.in_({p.payee_id for p in pays} | {r.user_id for r in reds} or {0})))}
    return {
        "partner_payments": [{"id": p.id, "partner": codes.get(p.payee_id), "amount": p.amount,
                              "reference": p.reference, "created_at": p.created_at} for p in pays],
        "redemptions": [{"id": r.id, "customer": codes.get(r.user_id), "points": -r.points,
                         "description": r.description, "created_at": r.created_at} for r in reds],
    }


@router.post("/payments/{payment_id}/pay")
def pay(payment_id: int, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    p = db.get(Payment, payment_id)
    if not p or p.status != "pending":
        raise HTTPException(404, "Pending payment not found")
    p.status, p.paid_at = "paid", now_ist()
    audit(db, admin.id, "payment.paid", "payment", p.id, {"amount": p.amount})
    db.commit()
    return {"id": p.id, "status": p.status}


@router.post("/redemptions/{txn_id}/fulfill")
def fulfill(txn_id: int, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    t = db.get(RewardTransaction, txn_id)
    if not t or t.type != TxnType.REDEEM or t.status != TxnStatus.PENDING:
        raise HTTPException(404, "Pending redemption not found")
    t.status = TxnStatus.FULFILLED
    notify(db, db.get(User, t.user_id), "reward", "Reward on its way", t.description)
    audit(db, admin.id, "redemption.fulfill", "reward_txn", t.id)
    db.commit()
    return {"id": t.id, "status": t.status}


# ── Audit & jobs ──────────────────────────────────────────────────────────────────────────────
@router.get("/audit")
def audit_log(action: str | None = None, page: Page = Depends(), user: User = Depends(admin_only),
              db: Session = Depends(get_db)):
    conds = [AuditLog.action.like(f"{action}%")] if action else []
    total = db.scalar(select(func.count(AuditLog.id)).where(*conds)) or 0
    rows = db.scalars(select(AuditLog).where(*conds).order_by(AuditLog.id.desc())
                      .offset(page.offset).limit(page.size)).all()
    codes = {u.id: u.public_code for u in db.scalars(select(User).where(
        User.id.in_({r.actor_id for r in rows if r.actor_id} or {0})))}
    return page.wrap([{"id": r.id, "actor": codes.get(r.actor_id), "action": r.action, "entity": r.entity,
                       "entity_id": r.entity_id, "data": r.data, "ip": r.ip, "at": r.created_at} for r in rows], total)


@router.post("/jobs/daily-tips")
def run_daily_tips(admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    """Manually trigger what the Celery beat schedule runs each morning."""
    from app.worker import send_daily_tips

    sent = send_daily_tips.apply().get()
    return {"sent": sent}
