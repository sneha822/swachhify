"""Seed reference data (always) and demo data (when SEED_DEMO_DATA=true).

    python -m app.seed.run          # seed an empty database
"""

import logging
import random
from datetime import datetime, timedelta, UTC

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password, random_code
from app.models import (
    AIConversation,
    AIMessage,
    Address,
    CollectionPartner,
    CustomerProfile,
    DailyActivity,
    DailyContent,
    DropOffPoint,
    HabitStreak,
    Household,
    HouseholdMember,
    ImpactRecord,
    LearningProgress,
    Lesson,
    Notification,
    Payment,
    Quiz,
    QuizQuestion,
    RecyclingIndustry,
    Reward,
    RewardTransaction,
    User,
    WasteCategory,
    WasteItem,
    WasteSubcategory,
)
from app.models.enums import PickupStatus
from app.seed import knowledge_base as kb
from app.seed import learning_content as lc
from app.services import ai_assistant, industry, knowledge, pickups
from app.services.common import CODE_PREFIX, today_ist, unique_code

log = logging.getLogger("swacchify.seed")

DEMO_PASSWORD = "Swacchify@123"


def seed_reference(db: Session) -> None:
    if db.scalar(select(WasteCategory.id)):
        return
    log.info("Seeding reference data")
    cats = {}
    for c in kb.CATEGORIES:
        cats[c["slug"]] = WasteCategory(**c)
        db.add(cats[c["slug"]])
    db.flush()
    subs = {}
    for cat_slug, rows in kb.SUBCATEGORIES.items():
        for slug, name in rows:
            subs[slug] = WasteSubcategory(category_id=cats[cat_slug].id, slug=slug, name=name)
            db.add(subs[slug])
    db.flush()
    for it in kb.ITEMS:
        data = dict(it)
        cat = cats[data.pop("category")]
        sub = subs.get(data.pop("subcategory"))
        data.setdefault("collectable", cat.collectable)
        data.setdefault("donatable", False)
        db.add(WasteItem(category_id=cat.id, subcategory_id=sub.id if sub else None, **data))

    for order, les in enumerate(lc.LESSONS):
        data = dict(les)
        quiz = data.pop("quiz", [])
        lesson = Lesson(sort_order=order, **data)
        db.add(lesson)
        db.flush()
        if quiz:
            qz = Quiz(lesson_id=lesson.id, title=lesson.title)
            db.add(qz)
            db.flush()
            for i, q in enumerate(quiz):
                db.add(QuizQuestion(quiz_id=qz.id, sort_order=i, **q))
    for text, text_hi, cat in lc.TIPS:
        db.add(DailyContent(kind="tip", text=text, text_hi=text_hi, category_slug=cat))
    for text, text_hi in lc.CHALLENGES:
        db.add(DailyContent(kind="challenge", text=text, text_hi=text_hi))
    for r in lc.REWARDS:
        db.add(Reward(**r))
    for d in kb.DROPOFF_POINTS:
        db.add(DropOffPoint(**d))
    db.commit()


def _user(db: Session, role: str, name: str, email: str, phone: str, lang: str = "en", created_days_ago: int = 0):
    u = User(public_code=unique_code(db, User, "public_code", CODE_PREFIX[role]), role=role, full_name=name,
             email=email, phone=phone, password_hash=hash_password(DEMO_PASSWORD), language=lang,
             last_active_on=today_ist())
    db.add(u)
    db.flush()
    u.created_at = datetime.now(UTC) - timedelta(days=created_days_ago)
    return u


def seed_admin_from_env(db: Session) -> None:
    email, password = settings.ADMIN_EMAIL, settings.ADMIN_PASSWORD
    if email and password and not db.scalar(select(User.id).where(User.email == email.lower())):
        db.add(User(public_code=unique_code(db, User, "public_code", "SWA"), role="admin", full_name="Administrator",
                    email=email.lower(), password_hash=hash_password(password)))
        db.commit()


def seed_demo(db: Session) -> None:
    if db.scalar(select(User.id).where(User.email == "admin@swacchify.demo")):
        return
    log.info("Seeding demo data")
    rnd = random.Random(42)
    lat0, lng0 = settings.DEFAULT_LAT, settings.DEFAULT_LNG

    admin = _user(db, "admin", "Swacchify Admin", "admin@swacchify.demo", "9000000001", created_days_ago=200)

    partner_spots = [("Ramesh Kumar", 26.8600, 75.8000, "RJ14 ER 2231"), ("Sunita Devi", 26.9150, 75.7500,
                                                                          "RJ14 ER 7810"),
                     ("Mohd. Arif", 26.9000, 75.8200, "RJ14 ER 4402")]
    partners = []
    for i, (name, lat, lng, vno) in enumerate(partner_spots):
        u = _user(db, "partner", name, f"partner{i + 1}@swacchify.demo", f"98000000{i + 10}", "hi",
                  created_days_ago=180)
        db.add(CollectionPartner(user_id=u.id, vehicle_type="e-rickshaw", vehicle_number=vno,
                                 service_radius_km=12, base_lat=lat, base_lng=lng, verification_status="verified",
                                 rating_avg=4.6 + i * 0.1, rating_count=10 + i * 4))
        partners.append(u)
    pending_partner = _user(db, "partner", "Vikas Meena", "partner.pending@swacchify.demo", "9800000099",
                            created_days_ago=2)
    db.add(CollectionPartner(user_id=pending_partner.id, vehicle_type="tempo", vehicle_number="RJ14 GB 1190",
                             base_lat=26.88, base_lng=75.77, verification_status="pending"))

    recycler = _user(db, "recycler", "Anil Sharma", "recycler@swacchify.demo", "9811111111", created_days_ago=150)
    db.add(RecyclingIndustry(user_id=recycler.id, org_name="GreenLoop Polymers (demo)",
                             authorization_number="RSPCB/PWM/2024/0412", city="Jaipur",
                             accepted_categories=["plastic", "paper", "metal"],
                             address="Plot 18, VKI Area, Jaipur", lat=26.9700, lng=75.7700,
                             verification_status="verified"))
    ew = _user(db, "recycler", "Neha Gupta", "ewaste.recycler@swacchify.demo", "9822222222", created_days_ago=140)
    db.add(RecyclingIndustry(user_id=ew.id, org_name="SafeCircuit E-Recyclers (demo)",
                             authorization_number="CPCB/EW/2023/1177", city="Jaipur", accepted_categories=["ewaste"],
                             address="Sitapura Industrial Area, Jaipur", lat=26.7800, lng=75.8400,
                             verification_status="verified"))
    pending_rec = _user(db, "recycler", "Karan Jain", "recycler.pending@swacchify.demo", "9833333333",
                        created_days_ago=1)
    db.add(RecyclingIndustry(user_id=pending_rec.id, org_name="Jain Textile Recovery (demo)",
                             authorization_number="RSPCB/TX/2025/0021", city="Jaipur",
                             accepted_categories=["textile"], verification_status="pending"))

    # Customers
    main = _user(db, "customer", "Priya Kumari", "priya@swacchify.demo", "9876543210", created_days_ago=170)
    others = [_user(db, "customer", n, e, p, lang, created_days_ago=d) for n, e, p, lang, d in [
        ("Rahul Kumari", "rahul@swacchify.demo", "9876543211", "en", 160),
        ("Asha Verma", "asha@swacchify.demo", "9876543212", "hi", 120),
        ("Imran Khan", "imran@swacchify.demo", "9876543213", "en", 90),
        ("Meera Joshi", "meera@swacchify.demo", "9876543214", "hi", 60),
        ("Deepak Singh", "deepak@swacchify.demo", "9876543215", "en", 25),
    ]]
    hh = Household(name="Kumari Household", owner_id=main.id, invite_code=random_code(8), city="Jaipur")
    db.add(hh)
    db.flush()
    db.add_all([
        HouseholdMember(household_id=hh.id, user_id=main.id, display_name="Priya", relation="Me", is_admin=True),
        HouseholdMember(household_id=hh.id, user_id=others[0].id, display_name="Rahul", relation="Husband"),
        HouseholdMember(household_id=hh.id, display_name="Anya", relation="Daughter"),
        HouseholdMember(household_id=hh.id, display_name="Dadi", relation="Grandmother"),
    ])
    customers = [main, *others]
    addresses = {}
    for idx, c in enumerate(customers):
        db.add(CustomerProfile(user_id=c.id, household_id=hh.id if idx < 2 else None))
        lat, lng = lat0 + rnd.uniform(-0.05, 0.05), lng0 + rnd.uniform(-0.05, 0.05)
        a = Address(user_id=c.id, label="Home", line1=f"{rnd.randint(10, 400)}, Shanti Nagar",
                    landmark="Near Hanuman Mandir", city="Jaipur", pincode="302006", lat=lat, lng=lng, is_default=True)
        db.add(a)
        addresses[c.id] = a
    db.commit()

    # Historical pickups across the last ~5 months, run through the real lifecycle, then back-dated.
    mix = [("plastic", 2, 5), ("paper", 3, 9), ("metal", 0.5, 2), ("glass", 1, 3), ("textile", 1, 4),
           ("ewaste", 0.3, 2)]
    tomorrow = today_ist() + timedelta(days=1)
    history = []
    for n in range(30):
        c = main if n % 3 == 0 else rnd.choice(customers)
        chosen = rnd.sample(mix, rnd.randint(1, 3))
        items = [{"category": s, "estimated_kg": round(rnd.uniform(lo, hi), 1)} for s, lo, hi in chosen]
        purpose = "donate" if n % 9 == 4 else "recycle"
        if purpose == "donate":
            items = [{"category": "textile", "estimated_kg": 4.0}, {"category": "paper", "estimated_kg": 3.0}]
        p = pickups.create(db, c, addresses[c.id].id, tomorrow, pickups.SLOTS[n % 5][0], purpose, items, None)
        partner = db.get(User, p.partner_id)
        pickups.respond(db, partner, p, True, None)
        for st in (PickupStatus.ON_THE_WAY, PickupStatus.ARRIVED):
            pickups.advance(db, partner, p, st)
        actual = {i.category_slug: round(i.estimated_kg * rnd.uniform(0.85, 1.1), 1) for i in p.items}
        pickups.advance(db, partner, p, PickupStatus.COLLECTED, actual)
        quality = rnd.choices(["good", "fair", "poor"], [6, 3, 1])[0]
        pickups.verify(db, admin, p, actual, quality,
                       "Food residue found in plastic." if quality == "poor" else None)
        db.commit()
        history.append(p)

    for n, p in enumerate(history):
        when = datetime.now(UTC) - timedelta(days=150 - n * 5 + rnd.randint(0, 2), hours=rnd.randint(0, 8))
        p.created_at = when
        p.scheduled_date = (when + timedelta(days=1)).date()
        p.completed_at = when + timedelta(days=1, hours=5)
        p.updated_at = p.completed_at
        for i, e in enumerate(p.events):
            e.created_at = when + timedelta(hours=i * 3)
        for r in db.scalars(select(ImpactRecord).where(ImpactRecord.pickup_id == p.id)):
            r.created_at = p.completed_at
        for t in db.scalars(select(RewardTransaction).where(RewardTransaction.reference == p.code)):
            t.created_at = p.completed_at
        for pay in db.scalars(select(Payment).where(Payment.reference == p.code)):
            pay.created_at = p.completed_at
            if n < 24:
                pay.status, pay.paid_at = "paid", p.completed_at + timedelta(days=7)
    db.commit()

    # Recycler orders: one fully processed (traceability), one waiting for admin approval.
    o1 = industry.create_order(db, recycler, "plastic", 15, 18.0, "mechanical recycling into PET flakes", None)
    industry.approve_and_dispatch(db, admin, o1, True, "Dispatched from Malviya Nagar hub")
    industry.recycler_advance(db, recycler, o1)
    industry.recycler_advance(db, recycler, o1)
    o2 = industry.create_order(db, ew, "ewaste", 5, 42.0, "authorised dismantling & metal recovery", None)
    industry.approve_and_dispatch(db, admin, o2, True, None)
    industry.create_order(db, recycler, "paper", 25, 9.5, "pulping into recycled board", "Weekly requirement")
    db.commit()

    # Learning, streaks and AI conversations
    lessons = db.scalars(select(Lesson).order_by(Lesson.sort_order)).all()
    for c, n_done in [(main, 6), (others[0], 3), (others[1], 8), (others[2], 2), (others[3], 11)]:
        for les in lessons[:n_done]:
            done_at = datetime.now(UTC) - timedelta(days=rnd.randint(1, 60))
            db.add(LearningProgress(user_id=c.id, lesson_id=les.id, progress_pct=100, completed=True,
                                    completed_at=done_at, last_viewed_at=done_at))
            db.add(RewardTransaction(user_id=c.id, type="earn", source="lesson", points=les.points,
                                     status="credited", reference=les.slug, description=f"Finished lesson: {les.title}",
                                     created_at=done_at))
            db.get(CustomerProfile, c.id).points_balance += les.points
        for les in lessons[n_done:n_done + 1]:
            db.add(LearningProgress(user_id=c.id, lesson_id=les.id, progress_pct=40, completed=False))
    today = today_ist()
    for kind, cur, longest in (("learning", 6, 12), ("segregation", 4, 9)):
        s = db.scalar(select(HabitStreak).where(HabitStreak.user_id == main.id, HabitStreak.kind == kind))
        if not s:
            s = HabitStreak(user_id=main.id, kind=kind)
            db.add(s)
        s.current, s.longest, s.last_date = cur, longest, today - timedelta(days=1)
    for d in range(1, 7):
        db.add(DailyActivity(user_id=main.id, day=today - timedelta(days=d), kind="tip_read"))
        if d <= 4:
            db.add(DailyActivity(user_id=main.id, day=today - timedelta(days=d), kind="challenge_done"))

    knowledge.invalidate()
    idx = knowledge.get_index(db)
    questions = ["What do I do with thermocol?", "How do I dispose of batteries?", "I have an old robot toy",
                 "Can I put a pizza box in paper recycling?", "What should I do with old clothes?",
                 "Where should I throw a toy?", "thermocol plates after a party", "used batteries from remote",
                 "Is an old charger e-waste?", "Can I put a milk packet with plastic?", "CFL bulb broke",
                 "what to do with thermocol box", "old phone", "bulb", "wet wipes", "mixer grinder not working",
                 "How do I dispose of e-waste?", "coconut shell", "thermocol", "batteries", "pizza box",
                 "old saree", "broken glass", "doodh ki thaili", "बैटरी कहाँ डालें", "expired medicines"]
    for i, q in enumerate(questions):
        c = customers[i % len(customers)]
        lang = "hi" if any("ऀ" <= ch <= "ॿ" for ch in q) else "en"
        conv = AIConversation(user_id=c.id, title=q[:80], language=lang)
        db.add(conv)
        db.flush()
        payload = ai_assistant.kb_reply(idx, q, lang)
        at = datetime.now(UTC) - timedelta(days=rnd.randint(0, 25), hours=rnd.randint(0, 20))
        db.add(AIMessage(conversation_id=conv.id, role="user", content=q, created_at=at))
        db.add(AIMessage(conversation_id=conv.id, role="assistant", content=payload["text"], payload=payload,
                         intent=payload["kind"], matched_item_slug=payload.get("item_slug"),
                         category_slug=payload.get("category_slug"), source="knowledge_base",
                         confidence={"high": 0.9, "medium": 0.6, "low": 0.3}[payload["confidence"]],
                         feedback=(1 if i % 4 else -1) if i % 3 == 0 else None,
                         feedback_note="Didn't cover my city" if i % 12 == 0 else None, created_at=at))

    # Start clean: drop the notifications generated while replaying history, then add a few fresh ones.
    db.execute(delete(Notification))
    db.commit()

    # Active pickups in different states so every dashboard has something live.
    p1 = pickups.create(db, main, addresses[main.id].id, today + timedelta(days=1), "10-12", "recycle",
                        [{"category": "ewaste", "estimated_kg": 1.5}, {"category": "plastic", "estimated_kg": 3}],
                        "Old robot toy and two chargers")
    partner = db.get(User, p1.partner_id)
    pickups.respond(db, partner, p1, True, None)
    pickups.advance(db, partner, p1, PickupStatus.ON_THE_WAY)
    cp = db.get(CollectionPartner, partner.id)
    cp.current_lat, cp.current_lng = p1.lat + 0.012, p1.lng - 0.01
    pickups.create(db, others[1], addresses[others[1].id].id, today + timedelta(days=2), "08-10", "donate",
                        [{"category": "textile", "estimated_kg": 5}], "School uniforms and sweaters")
    p3 = pickups.create(db, others[2], addresses[others[2].id].id, today + timedelta(days=1), "14-16", "recycle",
                        [{"category": "paper", "estimated_kg": 12}, {"category": "metal", "estimated_kg": 2}], None)
    partner3 = db.get(User, p3.partner_id)
    pickups.respond(db, partner3, p3, True, None)
    for st in (PickupStatus.ON_THE_WAY, PickupStatus.ARRIVED):
        pickups.advance(db, partner3, p3, st)
    pickups.advance(db, partner3, p3, PickupStatus.COLLECTED, {"paper": 11.4, "metal": 2.2})
    db.commit()
    log.info("Demo data ready. Password for all demo accounts: %s", DEMO_PASSWORD)


def run(db: Session) -> None:
    seed_reference(db)
    seed_admin_from_env(db)
    if settings.SEED_DEMO_DATA:
        seed_demo(db)
    knowledge.invalidate()


if __name__ == "__main__":
    from app.core.database import Base, SessionLocal, engine
    import app.models  # noqa: F401

    logging.basicConfig(level=logging.INFO)
    Base.metadata.create_all(engine)
    with SessionLocal() as s:
        run(s)

