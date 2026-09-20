from datetime import date, datetime

from sqlalchemy import JSON, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin


class PickupRequest(TimestampMixin, Base):
    __tablename__ = "pickup_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    household_id: Mapped[int | None] = mapped_column(ForeignKey("households.id", ondelete="SET NULL"), index=True)
    address_id: Mapped[int | None] = mapped_column(ForeignKey("addresses.id", ondelete="SET NULL"))
    # Snapshot so later address edits don't rewrite history.
    address_text: Mapped[str] = mapped_column(Text)
    landmark: Mapped[str | None] = mapped_column(String(120))
    city: Mapped[str] = mapped_column(String(80), index=True)
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    purpose: Mapped[str] = mapped_column(String(16), default="recycle")
    scheduled_date: Mapped[date] = mapped_column(Date, index=True)
    slot: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(16), index=True)
    partner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    notes: Mapped[str | None] = mapped_column(Text)
    cancel_reason: Mapped[str | None] = mapped_column(Text)
    estimated_total_kg: Mapped[float] = mapped_column(Float, default=0)
    actual_total_kg: Mapped[float | None] = mapped_column(Float)
    proof_url: Mapped[str | None] = mapped_column(String(500))
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    items: Mapped[list["PickupItem"]] = relationship(back_populates="pickup", cascade="all, delete-orphan")
    events: Mapped[list["PickupStatusEvent"]] = relationship(
        back_populates="pickup", cascade="all, delete-orphan", order_by="PickupStatusEvent.id"
    )
    verification: Mapped["WasteVerification | None"] = relationship(back_populates="pickup", uselist=False)


class PickupItem(Base):
    __tablename__ = "pickup_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    pickup_id: Mapped[int] = mapped_column(ForeignKey("pickup_requests.id", ondelete="CASCADE"), index=True)
    category_slug: Mapped[str] = mapped_column(String(32), index=True)
    estimated_kg: Mapped[float] = mapped_column(Float)
    actual_kg: Mapped[float | None] = mapped_column(Float)
    # Warehouse-verified weight; this is what points, impact and recycler allocation use.
    verified_kg: Mapped[float | None] = mapped_column(Float)
    allocated_kg: Mapped[float] = mapped_column(Float, default=0)

    pickup: Mapped[PickupRequest] = relationship(back_populates="items")


class PickupStatusEvent(TimestampMixin, Base):
    __tablename__ = "pickup_status_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    pickup_id: Mapped[int] = mapped_column(ForeignKey("pickup_requests.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(16))
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    note: Mapped[str | None] = mapped_column(Text)

    pickup: Mapped[PickupRequest] = relationship(back_populates="events")


class PickupAssignment(TimestampMixin, Base):
    __tablename__ = "pickup_assignments"

    id: Mapped[int] = mapped_column(primary_key=True)
    pickup_id: Mapped[int] = mapped_column(ForeignKey("pickup_requests.id", ondelete="CASCADE"), index=True)
    partner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[str] = mapped_column(String(16), index=True)
    distance_km: Mapped[float | None] = mapped_column(Float)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reject_reason: Mapped[str | None] = mapped_column(Text)


class WasteVerification(TimestampMixin, Base):
    __tablename__ = "waste_verifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    pickup_id: Mapped[int] = mapped_column(ForeignKey("pickup_requests.id", ondelete="CASCADE"), unique=True)
    verified_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    total_kg: Mapped[float] = mapped_column(Float)
    segregation_quality: Mapped[str] = mapped_column(String(8))
    notes: Mapped[str | None] = mapped_column(Text)

    pickup: Mapped[PickupRequest] = relationship(back_populates="verification")


class Rating(TimestampMixin, Base):
    __tablename__ = "ratings"

    id: Mapped[int] = mapped_column(primary_key=True)
    pickup_id: Mapped[int] = mapped_column(ForeignKey("pickup_requests.id", ondelete="CASCADE"), index=True)
    rater_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    ratee_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    stars: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str | None] = mapped_column(Text)


class Reward(TimestampMixin, Base):
    """Redeemable catalogue item."""

    __tablename__ = "rewards"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(120))
    title_hi: Mapped[str | None] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text)
    emoji: Mapped[str] = mapped_column(String(8))
    points_cost: Mapped[int] = mapped_column(Integer)
    stock: Mapped[int | None] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(default=True)


class RewardTransaction(TimestampMixin, Base):
    __tablename__ = "reward_transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(12))
    source: Mapped[str] = mapped_column(String(24), index=True)  # pickup|lesson|quiz|challenge|badge|redeem|admin
    points: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(12), index=True)
    reference: Mapped[str | None] = mapped_column(String(64), index=True)
    description: Mapped[str] = mapped_column(String(255))


class Payment(TimestampMixin, Base):
    """Money owed/paid: partner earnings per pickup."""

    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    payee_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    kind: Mapped[str] = mapped_column(String(24))  # partner_earning
    amount: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(12), default="pending")  # pending | paid
    reference: Mapped[str | None] = mapped_column(String(64), index=True)
    description: Mapped[str | None] = mapped_column(String(255))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Notification(TimestampMixin, Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(32), index=True)
    title: Mapped[str] = mapped_column(String(160))
    body: Mapped[str] = mapped_column(Text)
    data: Mapped[dict | None] = mapped_column(JSON)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class IndustryOrder(TimestampMixin, Base):
    __tablename__ = "industry_orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    industry_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    category_slug: Mapped[str] = mapped_column(String(32), index=True)
    quantity_kg: Mapped[float] = mapped_column(Float)
    allocated_kg: Mapped[float] = mapped_column(Float, default=0)
    price_per_kg: Mapped[float] = mapped_column(Float)
    processing_method: Mapped[str | None] = mapped_column(String(80))  # recycling, co-processing, refurbishing…
    status: Mapped[str] = mapped_column(String(16), index=True)
    notes: Mapped[str | None] = mapped_column(Text)
    admin_note: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    allocations: Mapped[list["LotAllocation"]] = relationship(back_populates="order", cascade="all, delete-orphan")


class LotAllocation(Base):
    """Links verified household material to the recycler order it went to (traceability)."""

    __tablename__ = "lot_allocations"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("industry_orders.id", ondelete="CASCADE"), index=True)
    pickup_item_id: Mapped[int] = mapped_column(ForeignKey("pickup_items.id"), index=True)
    kg: Mapped[float] = mapped_column(Float)

    order: Mapped[IndustryOrder] = relationship(back_populates="allocations")
    pickup_item: Mapped[PickupItem] = relationship()


class IndustryTransaction(TimestampMixin, Base):
    """Invoice raised against a recycler when material is dispatched."""

    __tablename__ = "industry_transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("industry_orders.id", ondelete="CASCADE"), index=True)
    industry_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    invoice_number: Mapped[str] = mapped_column(String(24), unique=True)
    quantity_kg: Mapped[float] = mapped_column(Float)
    rate: Mapped[float] = mapped_column(Float)
    amount: Mapped[float] = mapped_column(Float)
    tax: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(12), default="issued")  # issued | paid
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    order: Mapped[IndustryOrder] = relationship()


class ImpactRecord(TimestampMixin, Base):
    """Written once per verified pickup item; the single source for impact dashboards."""

    __tablename__ = "impact_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    household_id: Mapped[int | None] = mapped_column(ForeignKey("households.id", ondelete="SET NULL"), index=True)
    pickup_id: Mapped[int] = mapped_column(ForeignKey("pickup_requests.id", ondelete="CASCADE"), index=True)
    category_slug: Mapped[str] = mapped_column(String(32), index=True)
    purpose: Mapped[str] = mapped_column(String(16), default="recycle")
    kg: Mapped[float] = mapped_column(Float)
    co2e_kg_est: Mapped[float] = mapped_column(Float)


class AuditLog(TimestampMixin, Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    action: Mapped[str] = mapped_column(String(64), index=True)
    entity: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[str | None] = mapped_column(String(40))
    data: Mapped[dict | None] = mapped_column(JSON)
    ip: Mapped[str | None] = mapped_column(String(64))
