"""Database setup for PETMOL backend.

Suporta SQLite (dev/local) e PostgreSQL (produção).
Troca automática via DATABASE_URL:
  sqlite:///./petmol.db         → SQLite com WAL + pragmas
  postgresql+psycopg2://...     → Postgres com pool_pre_ping
"""
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from .config import get_settings

settings = get_settings()

DATABASE_URL = settings.database_url

_is_sqlite = DATABASE_URL.startswith("sqlite")

# ── SQLite ──────────────────────────────────────────────────────────────
if _is_sqlite:
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},  # necessário para SQLite multi-thread
        pool_size=20,
        max_overflow=40,
        pool_pre_ping=True,
    )

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_conn, _record):
        """WAL mode + tuning para melhor concorrência no SQLite."""
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA cache_size=-64000")   # 64 MB
        cursor.execute("PRAGMA synchronous=NORMAL")  # seguro com WAL
        cursor.execute("PRAGMA optimize")
        cursor.close()

# ── PostgreSQL ───────────────────────────────────────────────────────────
else:
    engine = create_engine(
        DATABASE_URL,
        pool_size=20,
        max_overflow=40,
        pool_pre_ping=True,        # recicla conexões mortas automaticamente
        pool_timeout=30,
        pool_recycle=1800,         # recicla conexões a cada 30 min
    )

# ── Session & Base ────────────────────────────────────────────────────────
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def is_sqlite() -> bool:
    """Retorna True se o backend atual for SQLite."""
    return _is_sqlite
