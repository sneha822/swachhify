from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import Page, require_roles
from app.models import Reward, RewardTransaction, User
from app.services import badges, rewards

router = APIRouter(prefix="/rewards", tags=["rewards"])
customer_only = require_roles("customer")


@router.get("/summary")
def summary(user: User = Depends(customer_only), db: Session = Depends(get_db)):
    return rewards.summary(db, user.id)


@router.get("/catalog")
def catalog(db: Session = Depends(get_db)):
    rows = db.scalars(select(Reward).where(Reward.is_active.is_(True)).order_by(Reward.points_cost)).all()
    return [{"id": r.id, "title": r.title, "title_hi": r.title_hi, "description": r.description, "emoji": r.emoji,
             "points_cost": r.points_cost, "in_stock": r.stock is None or r.stock > 0} for r in rows]


@router.post("/redeem/{reward_id}", status_code=201)
def redeem(reward_id: int, user: User = Depends(customer_only), db: Session = Depends(get_db)):
    txn = rewards.redeem(db, user, reward_id)
    db.commit()
    return {"id": txn.id, "points": txn.points, "status": txn.status, **rewards.summary(db, user.id)}


@router.get("/transactions")
def transactions(page: Page = Depends(), user: User = Depends(customer_only), db: Session = Depends(get_db)):
    cond = RewardTransaction.user_id == user.id
    total = db.scalar(select(func.count(RewardTransaction.id)).where(cond)) or 0
    rows = db.scalars(select(RewardTransaction).where(cond).order_by(RewardTransaction.id.desc())
                      .offset(page.offset).limit(page.size)).all()
    return page.wrap([{"id": t.id, "type": t.type, "source": t.source, "points": t.points, "status": t.status,
                       "description": t.description, "created_at": t.created_at} for t in rows], total)


@router.get("/badges")
def my_badges(user: User = Depends(customer_only), db: Session = Depends(get_db)):
    out = badges.evaluate(db, user)
    db.commit()
    return out
