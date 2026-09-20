from datetime import datetime, timedelta, UTC

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    hash_token,
    new_reset_token,
    verify_password,
)
from app.models import CollectionPartner, CustomerProfile, PasswordReset, RecyclingIndustry, RefreshToken, User
from app.schemas import ForgotIn, LoginIn, RefreshIn, RegisterIn, ResetIn, TokenOut, UserOut
from app.services import channels
from app.services.common import CODE_PREFIX, audit, unique_code
from app.services.notifications import notify

router = APIRouter(prefix="/auth", tags=["auth"])


def _issue(db: Session, user: User) -> TokenOut:
    refresh, jti, expires = create_refresh_token(user.id)
    db.add(RefreshToken(user_id=user.id, jti=jti, expires_at=expires))
    return TokenOut(access_token=create_access_token(user.id, user.role), refresh_token=refresh,
                    user=UserOut.model_validate(user))


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def register(body: RegisterIn, request: Request, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(409, "An account with this email already exists")
    if body.role == "recycler" and not body.org_name:
        raise HTTPException(422, "Organisation name is required for recycling partners")

    user = User(public_code=unique_code(db, User, "public_code", CODE_PREFIX[body.role]), role=body.role,
                full_name=body.full_name.strip(), email=email, phone=body.phone,
                password_hash=hash_password(body.password), language=body.language)
    db.add(user)
    db.flush()
    if body.role == "customer":
        db.add(CustomerProfile(user_id=user.id))
        notify(db, user, "campaign", "Welcome to Swacchify",
               f"Your Swacchify ID is {user.public_code}. Collection partners see this ID, not your name.")
    elif body.role == "partner":
        db.add(CollectionPartner(user_id=user.id, vehicle_type=body.vehicle_type or "e-rickshaw",
                                 vehicle_number=body.vehicle_number, base_lat=settings.DEFAULT_LAT,
                                 base_lng=settings.DEFAULT_LNG))
        notify(db, user, "campaign", "Registration received",
               "Our team will verify your details before you start receiving pickups.")
    else:
        db.add(RecyclingIndustry(user_id=user.id, org_name=body.org_name,
                                 authorization_number=body.authorization_number,
                                 accepted_categories=body.accepted_categories or [], city=body.city))
        notify(db, user, "campaign", "Registration received",
               "We'll verify your organisation's authorisation before you can request material.")
    audit(db, user.id, "auth.register", "user", user.id, {"role": body.role},
          request.client.host if request.client else None)
    out = _issue(db, user)
    db.commit()
    return out


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Email or password is incorrect")
    if not user.is_active:
        raise HTTPException(403, "This account has been deactivated")
    user.last_login_at = datetime.now(UTC)
    audit(db, user.id, "auth.login", "user", user.id, ip=request.client.host if request.client else None)
    out = _issue(db, user)
    db.commit()
    return out


@router.post("/refresh", response_model=TokenOut)
def refresh(body: RefreshIn, db: Session = Depends(get_db)):
    try:
        payload = decode_token(body.refresh_token, "refresh")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Please sign in again")
    rt = db.scalar(select(RefreshToken).where(RefreshToken.jti == payload["jti"]))
    if not rt or rt.revoked:
        # Reuse of a rotated token: revoke the whole family for safety.
        if rt:
            for t in db.scalars(select(RefreshToken).where(RefreshToken.user_id == rt.user_id)):
                t.revoked = True
            db.commit()
        raise HTTPException(401, "Please sign in again")
    user = db.get(User, rt.user_id)
    if not user or not user.is_active:
        raise HTTPException(401, "Please sign in again")
    rt.revoked = True  # rotation
    out = _issue(db, user)
    db.commit()
    return out


@router.post("/logout", status_code=204)
def logout(body: RefreshIn, db: Session = Depends(get_db)):
    try:
        payload = decode_token(body.refresh_token, "refresh")
    except jwt.InvalidTokenError:
        return
    rt = db.scalar(select(RefreshToken).where(RefreshToken.jti == payload["jti"]))
    if rt:
        rt.revoked = True
        db.commit()


@router.post("/forgot-password")
def forgot_password(body: ForgotIn, db: Session = Depends(get_db)):
    """Always returns the same message so emails can't be enumerated."""
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    resp = {"message": "If that email is registered, a reset link has been sent."}
    if user:
        raw, hashed = new_reset_token()
        db.add(PasswordReset(user_id=user.id, token_hash=hashed,
                             expires_at=datetime.now(UTC) + timedelta(minutes=30)))
        link = f"{settings.FRONTEND_URL}/reset-password?token={raw}"
        channels.send_email(user.email, "Reset your Swacchify password",
                            f"Use this link within 30 minutes to reset your password:\n{link}")
        db.commit()
        if settings.DEBUG:  # no real email provider in dev — surface the link
            resp["dev_reset_url"] = link
    return resp


@router.post("/reset-password")
def reset_password(body: ResetIn, db: Session = Depends(get_db)):
    pr = db.scalar(select(PasswordReset).where(PasswordReset.token_hash == hash_token(body.token)))
    expires = pr.expires_at if pr else None
    if expires and expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if not pr or pr.used or expires < datetime.now(UTC):
        raise HTTPException(400, "This reset link is invalid or has expired")
    user = db.get(User, pr.user_id)
    user.password_hash = hash_password(body.password)
    pr.used = True
    for t in db.scalars(select(RefreshToken).where(RefreshToken.user_id == user.id)):
        t.revoked = True
    audit(db, user.id, "auth.reset_password", "user", user.id)
    db.commit()
    return {"message": "Password updated. You can sign in now."}
