"""SQLAlchemy model for user monthly checkins."""
from datetime import date, datetime
from typing import Optional
from uuid import uuid4

from sqlalchemy import Date, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base


class UserMonthlyCheckin(Base):
    """
    Controle de lembrete mensal por pet.
    month_ref = "YYYY-MM" (ex: "2026-02")
    status: 'registered' | 'nothing' | 'snoozed'
    """
    __tablename__ = "user_monthly_checkins"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    pet_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    month_ref: Mapped[str] = mapped_column(String(7), nullable=False)   # "YYYY-MM"
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="nothing")
    # 'registered' | 'nothing' | 'snoozed'
    snooze_until: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
