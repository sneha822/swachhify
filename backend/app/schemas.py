"""Request/response schemas."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

Lang = Literal["en", "hi"]
PHONE_HELP = "10-digit mobile number"


def normalize_phone(v: str | None) -> str | None:
    if not v:
        return None
    digits = "".join(c for c in v if c.isdigit())
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    if len(digits) != 10:
        raise ValueError("Enter a valid 10-digit mobile number")
    return digits


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ── Auth ──────────────────────────────────────────────────────────────────────────────────────
class RegisterIn(BaseModel):
    role: Literal["customer", "partner", "recycler"] = "customer"
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: str | None = Field(None, description=PHONE_HELP)
    password: str = Field(min_length=8, max_length=128)
    language: Lang = "en"
    # partner
    vehicle_type: str | None = None
    vehicle_number: str | None = None
    # recycler
    org_name: str | None = None
    authorization_number: str | None = None
    accepted_categories: list[str] | None = None
    city: str | None = None

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str | None) -> str | None:
        return normalize_phone(v)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class RefreshIn(BaseModel):
    refresh_token: str


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=128)


class UserOut(ORM):
    id: int
    public_code: str
    role: str
    full_name: str
    email: str
    phone: str | None
    language: str
    notification_prefs: dict
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


class UserUpdate(BaseModel):
    full_name: str | None = Field(None, min_length=2, max_length=120)
    phone: str | None = None
    language: Lang | None = None
    notification_prefs: dict | None = None

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str | None) -> str | None:
        return normalize_phone(v)


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


# ── Addresses & households ────────────────────────────────────────────────────────────────────
class AddressIn(BaseModel):
    label: str = Field("Home", max_length=40)
    line1: str = Field(min_length=3, max_length=200)
    line2: str | None = Field(None, max_length=200)
    landmark: str | None = Field(None, max_length=120)
    city: str = Field(min_length=2, max_length=80)
    pincode: str | None = Field(None, pattern=r"^\d{6}$")
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    is_default: bool = False


class AddressOut(ORM):
    id: int
    label: str
    line1: str
    line2: str | None
    landmark: str | None
    city: str
    pincode: str | None
    lat: float
    lng: float
    is_default: bool


class HouseholdIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)


class JoinHouseholdIn(BaseModel):
    invite_code: str


class MemberIn(BaseModel):
    display_name: str = Field(min_length=1, max_length=80)
    relation: str | None = Field(None, max_length=40)


# ── AI ────────────────────────────────────────────────────────────────────────────────────────
class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=600)
    conversation_id: int | None = None
    item_slug: str | None = None
    category_slug: str | None = None
    language: Lang | None = None
    guest_key: str | None = None


class FeedbackIn(BaseModel):
    helpful: bool
    note: str | None = Field(None, max_length=500)
    guest_key: str | None = None


# ── Learning ──────────────────────────────────────────────────────────────────────────────────
class ProgressIn(BaseModel):
    progress_pct: int = Field(ge=0, le=100)


class QuizSubmit(BaseModel):
    answers: dict[int, int]  # question_id → selected option index


# ── Pickups ───────────────────────────────────────────────────────────────────────────────────
class PickupItemIn(BaseModel):
    category: str
    estimated_kg: float = Field(gt=0, le=500)


class PickupIn(BaseModel):
    address_id: int
    scheduled_date: date
    slot: str
    purpose: Literal["recycle", "donate"] = "recycle"
    items: list[PickupItemIn] = Field(min_length=1, max_length=7)
    notes: str | None = Field(None, max_length=500)


class CancelIn(BaseModel):
    reason: str | None = Field(None, max_length=300)


class RatingIn(BaseModel):
    stars: int = Field(ge=1, le=5)
    comment: str | None = Field(None, max_length=500)


class RespondIn(BaseModel):
    accept: bool
    reason: str | None = Field(None, max_length=300)


class StatusIn(BaseModel):
    status: Literal["on_the_way", "arrived", "collected"]
    actual: dict[str, float] | None = None  # category → kg, required for "collected"
    note: str | None = Field(None, max_length=300)


class LocationIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class PartnerUpdate(BaseModel):
    vehicle_type: str | None = None
    vehicle_number: str | None = None
    service_radius_km: float | None = Field(None, gt=0, le=50)
    base_lat: float | None = None
    base_lng: float | None = None
    is_available: bool | None = None


class VerifyIn(BaseModel):
    verified: dict[str, float]
    quality: Literal["good", "fair", "poor"]
    notes: str | None = Field(None, max_length=500)


class AssignIn(BaseModel):
    partner_id: int


# ── Industry ──────────────────────────────────────────────────────────────────────────────────
class IndustryUpdate(BaseModel):
    org_name: str | None = None
    authorization_number: str | None = None
    accepted_categories: list[str] | None = None
    address: str | None = None
    city: str | None = None
    lat: float | None = None
    lng: float | None = None


class OrderIn(BaseModel):
    category: str
    quantity_kg: float = Field(gt=0, le=100000)
    price_per_kg: float = Field(ge=0, le=10000)
    processing_method: str | None = Field(None, max_length=80)
    notes: str | None = Field(None, max_length=500)


class OrderDecision(BaseModel):
    approve: bool
    note: str | None = Field(None, max_length=500)


# ── Admin ─────────────────────────────────────────────────────────────────────────────────────
class VerifyAccountIn(BaseModel):
    status: Literal["verified", "rejected", "pending"]


class UserAdminUpdate(BaseModel):
    is_active: bool


class WasteItemIn(BaseModel):
    slug: str = Field(pattern=r"^[a-z0-9-]{2,64}$")
    name: str
    name_hi: str | None = None
    emoji: str = "♻️"
    aliases: list[str] = []
    category: str
    collectable: bool = True
    donatable: bool = False
    what_to_do: str
    why: str
    what_not_to_do: str
    prep_tips: str | None = None
    safety_notes: str | None = None
    common_mistakes: str | None = None
    reuse_tip: str | None = None
    local_note: str | None = None
    lesson_slug: str | None = None
    related: list[str] = []
    is_active: bool = True


class LessonIn(BaseModel):
    slug: str = Field(pattern=r"^[a-z0-9-]{2,64}$")
    title: str
    title_hi: str | None = None
    category_slug: str
    description: str
    description_hi: str | None = None
    duration_sec: int = Field(45, ge=10, le=600)
    emoji: str = "🎬"
    video_url: str | None = None
    slides: list[dict] = []
    is_published: bool = True
