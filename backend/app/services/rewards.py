from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import CustomerProfile, Reward, RewardTransaction, User
from app.models.enums import TxnStatus, TxnType
from app.services.notifications import notify

LESSON_POINTS = 5
QUIZ_PASS_POINTS = 10
CHALLENGE_POINTS = 2
STREAK_BONUS = {7: 20, 30: 100}


def _profile(db: Session, user_id: int) -> CustomerProfile | None:
    return db.get(CustomerProfile, user_id)


def credit(db: Session, user: User, points: int, source: str, description: str, reference: str | None = None,
           notify_user: bool = True) -> RewardTransaction | None:
    """Credit points once per (user, source, reference)."""
    if points <= 0:
        return None
    if reference:
        exists = db.scalar(select(RewardTransaction.id).where(
            RewardTransaction.user_id == user.id, RewardTransaction.source == source,
            RewardTransaction.reference == reference, RewardTransaction.type == TxnType.EARN,
            RewardTransaction.status == TxnStatus.CREDITED))
        if exists:
            return None
    txn = RewardTransaction(user_id=user.id, type=TxnType.EARN, source=source, points=points,
                            status=TxnStatus.CREDITED, reference=reference, description=description)
    db.add(txn)
    prof = _profile(db, user.id)
    if prof:
        prof.points_balance += points
    if notify_user:
        notify(db, user, "reward", f"+{points} Swacchify Points", description, {"points": points})
    return txn


def add_pending(db: Session, user: User, points: int, source: str, description: str, reference: str) -> None:
    """Shown as 'pending' until warehouse verification confirms the weight."""
    db.add(RewardTransaction(user_id=user.id, type=TxnType.EARN, source=source, points=points,
                             status=TxnStatus.PENDING, reference=reference, description=description))


def settle_pending(db: Session, user: User, source: str, reference: str, final_points: int, description: str):
    pending = db.scalars(select(RewardTransaction).where(
        RewardTransaction.user_id == user.id, RewardTransaction.source == source,
        RewardTransaction.reference == reference, RewardTransaction.status == TxnStatus.PENDING)).all()
    for p in pending:
        p.status = TxnStatus.CANCELLED
        p.description = p.description + " (replaced by verified amount)"
    return credit(db, user, final_points, source, description, reference)


def redeem(db: Session, user: User, reward_id: int) -> RewardTransaction:
    reward = db.get(Reward, reward_id)
    if not reward or not reward.is_active:
        raise HTTPException(404, "Reward not found")
    prof = _profile(db, user.id)
    if not prof or prof.points_balance < reward.points_cost:
        raise HTTPException(400, "Not enough points yet")
    if reward.stock is not None:
        if reward.stock <= 0:
            raise HTTPException(400, "This reward is out of stock")
        reward.stock -= 1
    prof.points_balance -= reward.points_cost
    txn = RewardTransaction(user_id=user.id, type=TxnType.REDEEM, source="redeem", points=-reward.points_cost,
                            status=TxnStatus.PENDING, reference=f"reward:{reward.id}",
                            description=f"Redeemed: {reward.title}")
    db.add(txn)
    notify(db, user, "reward", "Redemption received", f"We'll arrange your {reward.title} soon.")
    return txn


def summary(db: Session, user_id: int) -> dict:
    def total(*conds):
        return int(db.scalar(select(func.coalesce(func.sum(RewardTransaction.points), 0))
                             .where(RewardTransaction.user_id == user_id, *conds)) or 0)

    prof = _profile(db, user_id)
    return {
        "balance": prof.points_balance if prof else 0,
        "total_earned": total(RewardTransaction.type == TxnType.EARN, RewardTransaction.status == TxnStatus.CREDITED),
        "redeemed": -total(RewardTransaction.type == TxnType.REDEEM,
                           RewardTransaction.status.in_([TxnStatus.PENDING, TxnStatus.FULFILLED])),
        "pending": total(RewardTransaction.type == TxnType.EARN, RewardTransaction.status == TxnStatus.PENDING),
    }
