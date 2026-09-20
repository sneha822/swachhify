from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin, utcnow


class WasteCategory(Base):
    __tablename__ = "waste_categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(60))
    name_hi: Mapped[str] = mapped_column(String(60))
    emoji: Mapped[str] = mapped_column(String(8))
    color: Mapped[str] = mapped_column(String(16))
    short: Mapped[str] = mapped_column(String(200))
    short_hi: Mapped[str] = mapped_column(String(200))
    # Whether Swacchify partners collect this stream (Other/Household is guidance-only).
    collectable: Mapped[bool] = mapped_column(Boolean, default=True)
    donatable: Mapped[bool] = mapped_column(Boolean, default=False)
    points_per_kg: Mapped[int] = mapped_column(Integer, default=0)
    partner_rate_per_kg: Mapped[float] = mapped_column(Float, default=0.0)
    # Indicative kg CO2e avoided per kg diverted. Estimates only — see docs/IMPACT_METHODOLOGY.md.
    co2e_factor: Mapped[float] = mapped_column(Float, default=0.0)
    # {"en": {"do": [...], "dont": [...], "why": str, "prep": [...]}, "hi": {...}}
    guidance: Mapped[dict] = mapped_column(JSON, default=dict)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    subcategories: Mapped[list["WasteSubcategory"]] = relationship(back_populates="category")


class WasteSubcategory(Base):
    __tablename__ = "waste_subcategories"

    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("waste_categories.id", ondelete="CASCADE"), index=True)
    slug: Mapped[str] = mapped_column(String(48), unique=True)
    name: Mapped[str] = mapped_column(String(80))

    category: Mapped[WasteCategory] = relationship(back_populates="subcategories")


class WasteItem(Base):
    """The curated knowledge base. The AI assistant may only state disposal rules found here."""

    __tablename__ = "waste_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    name_hi: Mapped[str | None] = mapped_column(String(100))
    emoji: Mapped[str] = mapped_column(String(8), default="♻️")
    aliases: Mapped[list] = mapped_column(JSON, default=list)
    category_id: Mapped[int] = mapped_column(ForeignKey("waste_categories.id"), index=True)
    subcategory_id: Mapped[int | None] = mapped_column(ForeignKey("waste_subcategories.id"))
    collectable: Mapped[bool] = mapped_column(Boolean, default=True)
    donatable: Mapped[bool] = mapped_column(Boolean, default=False)
    what_to_do: Mapped[str] = mapped_column(Text)
    why: Mapped[str] = mapped_column(Text)
    what_not_to_do: Mapped[str] = mapped_column(Text)
    prep_tips: Mapped[str | None] = mapped_column(Text)
    safety_notes: Mapped[str | None] = mapped_column(Text)
    common_mistakes: Mapped[str | None] = mapped_column(Text)
    reuse_tip: Mapped[str | None] = mapped_column(Text)
    local_note: Mapped[str | None] = mapped_column(Text)
    # Ambiguous items ("toy", "bulb") ask first: {"question": str, "question_hi": str,
    # "options": [{"label": str, "label_hi": str, "emoji": str, "item": slug}]}
    clarify: Mapped[dict | None] = mapped_column(JSON)
    related: Mapped[list] = mapped_column(JSON, default=list)
    lesson_slug: Mapped[str | None] = mapped_column(String(64))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    category: Mapped[WasteCategory] = relationship()
    subcategory: Mapped[WasteSubcategory | None] = relationship()


class DropOffPoint(TimestampMixin, Base):
    __tablename__ = "dropoff_points"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    # recycling_center | ewaste_bin | donation_box | swacchify_hub
    kind: Mapped[str] = mapped_column(String(32), index=True)
    accepted_categories: Mapped[list] = mapped_column(JSON, default=list)
    address: Mapped[str] = mapped_column(Text)
    city: Mapped[str] = mapped_column(String(80))
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    hours: Mapped[str | None] = mapped_column(String(120))
    phone: Mapped[str | None] = mapped_column(String(20))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
