"""Pydantic schemas for grooming records."""
from typing import Optional, Any, List
from pydantic import BaseModel, Field

from ..serialization.utc_instant import OptionalUtcInstant, UtcInstant


class GroomingRecordBase(BaseModel):
    type: str = Field(..., description="bath | grooming | bath_grooming")
    date: UtcInstant
    scheduled_time: Optional[str] = Field(None, max_length=5)
    location: Optional[str] = Field(None, max_length=200)
    location_address: Optional[str] = None
    location_phone: Optional[str] = Field(None, max_length=40)
    location_place_id: Optional[str] = Field(None, max_length=200)
    groomer: Optional[str] = Field(None, max_length=200)
    cost: Optional[float] = None
    notes: Optional[str] = None
    next_recommended_date: OptionalUtcInstant = None
    frequency_days: Optional[int] = None
    original_frequency_days: Optional[int] = None
    last_completed_date: OptionalUtcInstant = None
    reminder_enabled: bool = True
    alert_days_before: Optional[int] = None
    reminder_days_before: Optional[int] = None
    rescheduled_count: int = 0
    reschedule_history: Optional[Any] = None  # JSON list, se vier como string ou list aceita ambos


class GroomingRecordCreate(GroomingRecordBase):
    id: Optional[str] = None  # permite o frontend enviar seu próprio ID (migração)


class GroomingRecordUpdate(BaseModel):
    type: Optional[str] = None
    date: OptionalUtcInstant = None
    scheduled_time: Optional[str] = None
    location: Optional[str] = None
    location_address: Optional[str] = None
    location_phone: Optional[str] = None
    location_place_id: Optional[str] = None
    groomer: Optional[str] = None
    cost: Optional[float] = None
    notes: Optional[str] = None
    next_recommended_date: OptionalUtcInstant = None
    frequency_days: Optional[int] = None
    original_frequency_days: Optional[int] = None
    last_completed_date: OptionalUtcInstant = None
    reminder_enabled: Optional[bool] = None
    alert_days_before: Optional[int] = None
    reminder_days_before: Optional[int] = None
    rescheduled_count: Optional[int] = None
    reschedule_history: Optional[Any] = None
    deleted: Optional[bool] = None


class GroomingRecordOut(GroomingRecordBase):
    id: str
    pet_id: str
    deleted: bool = False
    created_at: UtcInstant
    updated_at: UtcInstant

    class Config:
        from_attributes = True
