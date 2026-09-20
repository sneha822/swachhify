from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import hash_password, verify_password
from app.models import Address, User
from app.models.user import DEFAULT_NOTIFICATION_PREFS
from app.schemas import AddressIn, AddressOut, PasswordChange, UserOut, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserOut)
def update_me(body: UserUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    data = body.model_dump(exclude_unset=True)
    if "notification_prefs" in data:
        prefs = {**DEFAULT_NOTIFICATION_PREFS, **(user.notification_prefs or {})}
        incoming = data.pop("notification_prefs") or {}
        for k, v in incoming.items():
            if k == "channels" and isinstance(v, dict):
                prefs["channels"] = {**prefs.get("channels", {}), **{ck: bool(cv) for ck, cv in v.items()}}
            elif k in DEFAULT_NOTIFICATION_PREFS:
                prefs[k] = bool(v)
        user.notification_prefs = prefs
    for k, v in data.items():
        setattr(user, k, v)
    db.commit()
    return user


@router.post("/me/password", status_code=204)
def change_password(body: PasswordChange, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    user.password_hash = hash_password(body.new_password)
    db.commit()


@router.get("/me/addresses", response_model=list[AddressOut])
def list_addresses(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(select(Address).where(Address.user_id == user.id)
                      .order_by(Address.is_default.desc(), Address.id)).all()


def _set_default(db: Session, user_id: int, address_id: int) -> None:
    db.execute(update(Address).where(Address.user_id == user_id, Address.id != address_id).values(is_default=False))


@router.post("/me/addresses", response_model=AddressOut, status_code=201)
def add_address(body: AddressIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    first = db.scalar(select(Address.id).where(Address.user_id == user.id)) is None
    a = Address(user_id=user.id, **body.model_dump())
    a.is_default = body.is_default or first
    db.add(a)
    db.flush()
    if a.is_default:
        _set_default(db, user.id, a.id)
    db.commit()
    return a


def _own_address(db: Session, user: User, address_id: int) -> Address:
    a = db.get(Address, address_id)
    if not a or a.user_id != user.id:
        raise HTTPException(404, "Address not found")
    return a


@router.put("/me/addresses/{address_id}", response_model=AddressOut)
def edit_address(address_id: int, body: AddressIn, user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    a = _own_address(db, user, address_id)
    for k, v in body.model_dump().items():
        setattr(a, k, v)
    if a.is_default:
        _set_default(db, user.id, a.id)
    db.commit()
    return a


@router.delete("/me/addresses/{address_id}", status_code=204)
def delete_address(address_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = _own_address(db, user, address_id)
    db.delete(a)
    db.commit()
