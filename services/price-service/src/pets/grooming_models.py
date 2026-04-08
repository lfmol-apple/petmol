"""SQLAlchemy models for grooming records."""
from datetime import datetime
from typing import Optional, TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base

if TYPE_CHECKING:
    from .models import Pet


class GroomingRecord(Base):
    """Registros de banho e tosa dos pets.

    Substitui o blob health_data.grooming_records.
    Suporta: bath | grooming | bath_grooming.
    """
    __tablename__ = "grooming_records"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid4()))
    pet_id: Mapped[str] = mapped_column(String(36), ForeignKey("pets.id", ondelete="CASCADE"), index=True, nullable=False)

    # Dados do serviço
    type: Mapped[str] = mapped_column(String(20), nullable=False)             # bath | grooming | bath_grooming
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    scheduled_time: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)   # HH:MM

    # Estabelecimento
    location: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    location_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    location_phone: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    location_place_id: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    # Profissional
    groomer: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    # Custo e notas
    cost: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Frequência e próxima visita
    next_recommended_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    frequency_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    original_frequency_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    last_completed_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Lembretes
    reminder_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    alert_days_before: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    reminder_days_before: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Reagendamentos
    rescheduled_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reschedule_history: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON list

    # Soft delete + sync
    deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    pet: Mapped["Pet"] = relationship("Pet", back_populates="grooming_records")
