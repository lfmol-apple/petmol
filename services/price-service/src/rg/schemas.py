"""
Pydantic schemas for RG (Pet ID Card) API.
SLICE 2 - Schemas
"""
from typing import Optional, Literal
from pydantic import BaseModel, Field

from ..serialization.utc_instant import OptionalUtcInstant, UtcInstant


class RGCreateRequest(BaseModel):
    """Request para criar RG público."""
    pet_id: str = Field(..., description="ID do pet")
    template: str = Field(default="default", description="Template do RG (default, premium, minimal)")
    is_public: bool = Field(default=True, description="Se o RG é público")
    contact_mode: Literal["qr_only", "handoff_only"] = Field(
        default="handoff_only",
        description="Modo de contato (qr_only para QR no RG, handoff_only para link)"
    )


class RGCreateResponse(BaseModel):
    """Response da criação de RG."""
    pet_public_id: str = Field(..., description="ID público curto (8 chars)")
    public_url: str = Field(..., description="URL compartilhável (petmol.com/p/<id>)")


class RGPublicOut(BaseModel):
    """Dados públicos do RG para exibição."""
    pet_public_id: str
    pet_name: str
    pet_species: str
    pet_photo_url: Optional[str] = None
    template: str
    view_count: int
    created_at: UtcInstant

    class Config:
        from_attributes = True


class RGUpdateRequest(BaseModel):
    """Request para atualizar RG."""
    is_public: Optional[bool] = None
    contact_mode: Optional[Literal["qr_only", "handoff_only"]] = None
    template: Optional[str] = None


class RGStatsResponse(BaseModel):
    """Estatísticas do RG."""
    pet_public_id: str
    view_count: int
    share_count: int
    last_viewed_at: OptionalUtcInstant = None
    created_at: UtcInstant
