from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Generator

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker


class Base(DeclarativeBase):
    pass


def _default_auth_db_url() -> str:
    curr = Path(__file__).resolve().parent
    for _ in range(5):
        if (curr / "exhibitions.json").exists():
            return f"sqlite:///{curr / 'data' / 'exhibeat_auth.db'}"
        curr = curr.parent
    return f"sqlite:///{Path(__file__).resolve().parent / 'exhibeat_auth.db'}"


DATABASE_URL = os.environ.get("AUTH_DATABASE_URL", _default_auth_db_url())
JWT_SECRET = os.environ.get("AUTH_JWT_SECRET", "replace-this-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(os.environ.get("AUTH_JWT_EXPIRE_MINUTES", "60"))


PREFERENCE_OPTIONS: list[dict[str, str]] = [
    {"id": "art",          "label": "當代藝術",      "emoji": "🎨"},
    {"id": "photogenic",   "label": "攝影／視覺",    "emoji": "📷"},
    {"id": "digital",      "label": "數位／互動",    "emoji": "🕹️"},
    {"id": "history",      "label": "歷史人文",      "emoji": "🏛️"},
    {"id": "culture",      "label": "文化展演",      "emoji": "🪔"},
    {"id": "indigenous",   "label": "原民文化",      "emoji": "🪶"},
    {"id": "music",        "label": "音樂現場",      "emoji": "🎵"},
    {"id": "performance",  "label": "表演藝術",      "emoji": "🎭"},
    {"id": "family",       "label": "親子友善",      "emoji": "👨‍👩‍👧"},
    {"id": "free",         "label": "限時免費",      "emoji": "🎟️"},
    {"id": "night",        "label": "夜間光影",      "emoji": "🌃"},
    {"id": "outdoor",      "label": "戶外體驗",      "emoji": "🌿"},
]
VALID_PREFERENCE_IDS = {p["id"] for p in PREFERENCE_OPTIONS}


engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(128))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    preference_tags: Mapped[str] = mapped_column(Text, default="[]")
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True, index=True)
    google_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Favorite(Base):
    __tablename__ = "favorites"
    __table_args__ = (UniqueConstraint("user_id", "exhibition_id", name="uq_user_exhibition"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    exhibition_id: Mapped[str] = mapped_column(String(128), index=True)
    payload: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RegisterRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=128)
    preference_tags: list[str] = Field(default_factory=list)

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Username cannot be blank")
        if len(trimmed) > 128:
            raise ValueError("Username cannot exceed 128 characters")
        return trimmed


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class PreferenceUpdateRequest(BaseModel):
    preference_tags: list[str]


class PreferenceOption(BaseModel):
    id: str
    label: str
    emoji: str


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    display_name: str
    is_active: bool
    preference_tags: list[str] = Field(default_factory=list)
    google_sub: str | None = None
    google_email: str | None = None
    created_at: datetime

    @classmethod
    def from_orm_user(cls, user: "User") -> "UserResponse":
        tags: list[str] = []
        try:
            tags = json.loads(user.preference_tags or "[]")
            if not isinstance(tags, list):
                tags = []
        except json.JSONDecodeError:
            tags = []
        return cls(
            id=user.id,
            email=user.email,
            display_name=user.display_name,
            is_active=user.is_active,
            preference_tags=[str(t) for t in tags],
            google_sub=user.google_sub,
            google_email=user.google_email,
            created_at=user.created_at,
        )


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse


class FavoriteCreateRequest(BaseModel):
    exhibition_id: str = Field(min_length=1, max_length=128)
    payload: dict[str, Any] = Field(default_factory=dict)


class FavoriteResponse(BaseModel):
    exhibition_id: str
    payload: dict[str, Any]
    created_at: datetime


def ensure_database_ready() -> None:
    if DATABASE_URL.startswith("sqlite:///"):
        db_file = Path(DATABASE_URL.replace("sqlite:///", "", 1))
        db_file.parent.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def normalize_email(email: str) -> str:
    return email.strip().lower()


def normalize_display_name(display_name: str) -> str:
    return display_name.strip()


def sanitize_preference_tags(tags: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for raw in tags or []:
        if not isinstance(raw, str):
            continue
        tag = raw.strip()
        if tag and tag in VALID_PREFERENCE_IDS and tag not in seen:
            seen.add(tag)
            result.append(tag)
    return result


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def create_access_token(user_id: str) -> tuple[str, int]:
    expires_delta = timedelta(minutes=JWT_EXPIRE_MINUTES)
    expires_at = datetime.now(tz=timezone.utc) + expires_delta
    payload = {
        "sub": user_id,
        "exp": expires_at,
        "iat": datetime.now(tz=timezone.utc),
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return token, int(expires_delta.total_seconds())


def decode_token(token: str) -> str:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise ValueError("missing user id")
        return str(user_id)
    except (JWTError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if not creds:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

    user_id = decode_token(creds.credentials)
    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    return user
