"""Pydantic schemas for tutors and pets."""
from datetime import date
from typing import Optional, Any, List
import json

from pydantic import BaseModel, Field, field_validator

from ..serialization.utc_instant import OptionalUtcInstant, UtcInstant
from .vaccine_schemas import VaccineRecordOut
from .parasite_schemas import ParasiteControlOut
from .grooming_schemas import GroomingRecordOut


class TutorBase(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    phone: Optional[str] = Field(default=None, max_length=40)
    email: Optional[str] = Field(default=None, max_length=320)
    whatsapp: Optional[bool] = True
    postal_code: Optional[str] = Field(default=None, max_length=20)
    street: Optional[str] = Field(default=None, max_length=160)
    number: Optional[str] = Field(default=None, max_length=40)
    complement: Optional[str] = Field(default=None, max_length=120)
    neighborhood: Optional[str] = Field(default=None, max_length=120)
    city: Optional[str] = Field(default=None, max_length=120)
    state: Optional[str] = Field(default=None, max_length=40)
    country: Optional[str] = Field(default=None, max_length=40)


class TutorCreate(TutorBase):
    pass


class TutorUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    phone: Optional[str] = Field(default=None, max_length=40)
    email: Optional[str] = Field(default=None, max_length=320)
    whatsapp: Optional[bool] = None
    postal_code: Optional[str] = Field(default=None, max_length=20)
    street: Optional[str] = Field(default=None, max_length=160)
    number: Optional[str] = Field(default=None, max_length=40)
    complement: Optional[str] = Field(default=None, max_length=120)
    neighborhood: Optional[str] = Field(default=None, max_length=120)
    city: Optional[str] = Field(default=None, max_length=120)
    state: Optional[str] = Field(default=None, max_length=40)
    country: Optional[str] = Field(default=None, max_length=40)


class TutorOut(TutorBase):
    id: str
    user_id: str
    created_at: OptionalUtcInstant = None
    updated_at: OptionalUtcInstant = None

    class Config:
        from_attributes = True


class PetBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    species: str = Field(min_length=2, max_length=24)
    breed: Optional[str] = Field(default=None, max_length=120)
    birth_date: Optional[date] = None
    sex: Optional[str] = Field(default=None, max_length=10)  # 'male' or 'female'
    weight_value: Optional[float] = None
    weight_unit: Optional[str] = Field(default=None, max_length=8)
    photo: Optional[str] = None  # Base64 image (no length limit, stored as Text)
    neutered: Optional[bool] = None
    health_data: Optional[Any] = None  # JSON com vacinas, controle parasitário, etc
    insurance_provider: Optional[str] = None  # e.g. 'petlove' | 'doglife' | custom name


class PetCreate(PetBase):
    id: Optional[str] = Field(default=None, max_length=36)
    
    @field_validator('birth_date')
    @classmethod
    def validate_birth_date(cls, value):
        """Validar que birth_date não é no futuro."""
        if value and value > date.today():
            raise ValueError('Data de nascimento não pode ser no futuro')
        return value


class PetUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    species: Optional[str] = Field(default=None, min_length=2, max_length=24)
    breed: Optional[str] = Field(default=None, max_length=120)
    birth_date: Optional[date] = None
    sex: Optional[str] = Field(default=None, max_length=10)  # 'male' or 'female'
    weight_value: Optional[float] = None
    weight_unit: Optional[str] = Field(default=None, max_length=8)
    photo: Optional[str] = None  # Base64 image (no length limit, stored as Text)
    neutered: Optional[bool] = None
    health_data: Optional[Any] = None  # JSON com vacinas, controle parasitário, etc
    insurance_provider: Optional[str] = None  # e.g. 'petlove' | 'doglife' | custom name


class PetOut(PetBase):
    id: str
    user_id: str
    sex: Optional[str] = None  # Adicionar explicitamente aqui também
    created_at: OptionalUtcInstant = None
    updated_at: OptionalUtcInstant = None
    # Dados de tabelas próprias (fontes de verdade)
    vaccine_records: List[VaccineRecordOut] = []
    parasite_control_records: List[ParasiteControlOut] = []
    grooming_records: List[GroomingRecordOut] = []

    @field_validator('health_data', mode='before')
    @classmethod
    def parse_health_data(cls, value):
        """Deserializar health_data de JSON string para dict."""
        if isinstance(value, str):
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return None
        return value

    class Config:
        from_attributes = True