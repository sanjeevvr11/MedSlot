from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import get_current_user, utcnow
from app.models import ROLE_PATIENT, User, UserSession
from app.schemas import LoginIn, RegisterIn, UserOut
from app.security import (
    hash_password,
    hash_token,
    login_throttle,
    new_session_token,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _start_session(db: Session, response: Response, user: User) -> None:
    settings = get_settings()
    now = utcnow()
    token = new_session_token()
    db.execute(delete(UserSession).where(UserSession.expires_at <= now))
    db.add(
        UserSession(
            user_id=user.id,
            token_hash=hash_token(token),
            expires_at=now + timedelta(hours=settings.session_ttl_hours),
        )
    )
    db.commit()
    response.set_cookie(
        settings.session_cookie_name,
        token,
        max_age=settings.session_ttl_hours * 3600,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(body: RegisterIn, response: Response, db: Session = Depends(get_db)) -> User:
    if db.scalar(select(User.id).where(User.username == body.username)):
        raise HTTPException(status.HTTP_409_CONFLICT, "That username is already taken.")
    user = User(
        username=body.username,
        full_name=body.full_name,
        password_hash=hash_password(body.password),
        role=ROLE_PATIENT,
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError:  # lost a race for the same username
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "That username is already taken.") from None
    _start_session(db, response, user)
    return user


@router.post("/login", response_model=UserOut)
def login(body: LoginIn, response: Response, db: Session = Depends(get_db)) -> User:
    settings = get_settings()
    username = body.username.strip().lower()
    key = f"login:{username}"
    window = settings.login_window_minutes * 60
    if login_throttle.is_blocked(key, settings.login_max_failures, window):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Too many failed attempts. Try again in {settings.login_window_minutes} minutes.",
        )
    user = db.scalar(select(User).where(User.username == username))
    if not verify_password(user.password_hash if user else None, body.password):
        login_throttle.record_failure(key)
        # Same message whether the username or the password was wrong.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect username or password.")
    login_throttle.reset(key)
    _start_session(db, response, user)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response, db: Session = Depends(get_db)) -> None:
    settings = get_settings()
    token = request.cookies.get(settings.session_cookie_name)
    if token:
        db.execute(delete(UserSession).where(UserSession.token_hash == hash_token(token)))
        db.commit()
    response.delete_cookie(
        settings.session_cookie_name, path="/", secure=settings.cookie_secure, samesite="lax"
    )


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user
