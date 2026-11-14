import hashlib
import os

from sqlalchemy import JSON, String, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker


class Base(DeclarativeBase):
    pass


class ProfileRecord(Base):
    __tablename__ = "player_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner: Mapped[str] = mapped_column(String(64), index=True)
    data: Mapped[dict] = mapped_column(JSON)


class SessionRecord(Base):
    __tablename__ = "game_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner: Mapped[str] = mapped_column(String(64), index=True)
    revision: Mapped[int] = mapped_column(default=1)
    data: Mapped[dict] = mapped_column(JSON)

    __mapper_args__ = {"version_id_col": revision}


class AiUsageRecord(Base):
    __tablename__ = "ai_usage"

    bucket: Mapped[str] = mapped_column(String(80), primary_key=True)
    window_start: Mapped[int]
    calls: Mapped[int]


def database_engine(url: str):
    if url.startswith(("postgres://", "postgresql://")):
        url = "postgresql+psycopg://" + url.split("://", 1)[1]
    options = {"connect_args": {"check_same_thread": False}} if url.startswith("sqlite") else {"pool_pre_ping": True}
    return create_engine(url, **options)


def open_database(url: str | None = None):
    destination = None if url else os.environ.get("PLAYER_DATABASE_URL")
    source_url = url or os.environ.get("DATABASE_URL") or "sqlite:///./parallel-life.sqlite"
    engine = database_engine(destination or source_url)
    Base.metadata.create_all(engine)
    if destination and os.environ.get("MIGRATE_RENDER_SAVES") == "1":
        from app.models.cutover import migrate_once

        source = database_engine(source_url)
        try:
            migrate_once(source, engine)
        finally:
            source.dispose()
    return sessionmaker(bind=engine, expire_on_commit=False)


def owner_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
