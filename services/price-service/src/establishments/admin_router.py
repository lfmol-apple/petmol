"""
SLICE 3.4: Sistema de Aprovação de Estabelecimentos (Admin)
"""
from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ..db import get_db
from ..services.models import Establishment, Partner
from ..admin.deps import get_current_admin as require_admin

router = APIRouter(prefix="/admin/establishments", tags=["admin-establishments"])


# === SCHEMAS ===

class EstablishmentListItem(BaseModel):
    """Item da lista de estabelecimentos"""
    id: str
    display_name: str
    email: str
    phone: str
    claim_status: str
    plan: str
    phone_verified: bool
    created_at: datetime
    claimed_place_id: Optional[str] = None
    
    model_config = {"from_attributes": True}


class ApprovalAction(BaseModel):
    """Ação de aprovação/rejeição"""
    action: str  # approve, reject
    reason: Optional[str] = None
    partner_level: Optional[int] = 1  # Para aprovados: 1 ou 2


# === ENDPOINTS ===

@router.get("/pending", response_model=List[EstablishmentListItem])
async def list_pending_establishments(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    _admin = Depends(require_admin)
):
    """
    Listar estabelecimentos pendentes de aprovação.
    Apenas admins podem acessar.
    """
    
    establishments = (
        db.query(Establishment)
        .filter(Establishment.claim_status == "pending")
        .order_by(Establishment.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    
    return [EstablishmentListItem.model_validate(e) for e in establishments]


@router.get("/all", response_model=List[EstablishmentListItem])
async def list_all_establishments(
    status_filter: Optional[str] = Query(None, regex="^(pending|verified|rejected)$"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    _admin = Depends(require_admin)
):
    """
    Listar todos os estabelecimentos com filtro opcional.
    """
    
    query = db.query(Establishment)
    
    if status_filter:
        query = query.filter(Establishment.claim_status == status_filter)
    
    establishments = (
        query
        .order_by(Establishment.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    
    return [EstablishmentListItem.model_validate(e) for e in establishments]


@router.post("/{establishment_id}/approve")
async def approve_establishment(
    establishment_id: str,
    action: ApprovalAction,
    db: Session = Depends(get_db),
    _admin = Depends(require_admin)
):
    """
    Aprovar ou rejeitar estabelecimento.
    
    - approve: Ativa o Partner associado (se existir) e muda status para "verified"
    - reject: Muda status para "rejected"
    """
    
    establishment = db.query(Establishment).filter(Establishment.id == establishment_id).first()
    
    if not establishment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Estabelecimento não encontrado"
        )
    
    if action.action == "approve":
        # Aprovar
        establishment.claim_status = "verified"
        establishment.plan = "verified"
        
        # Ativar Partner associado (se existir)
        if establishment.claimed_place_id:
            partner = db.query(Partner).filter(
                Partner.google_place_id == establishment.claimed_place_id
            ).first()
            
            if partner:
                partner.is_active = True
                partner.is_verified = True
                partner.partner_level = action.partner_level or 1
        
        db.commit()
        
        # TODO: Enviar email de aprovação
        
        return {
            "status": "approved",
            "establishment_id": establishment_id,
            "message": "Estabelecimento aprovado com sucesso"
        }
    
    elif action.action == "reject":
        # Rejeitar
        establishment.claim_status = "rejected"
        
        db.commit()
        
        # TODO: Enviar email de rejeição com motivo
        
        return {
            "status": "rejected",
            "establishment_id": establishment_id,
            "reason": action.reason,
            "message": "Estabelecimento rejeitado"
        }
    
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ação inválida. Use 'approve' ou 'reject'"
        )


@router.get("/{establishment_id}/partner")
async def get_establishment_partner(
    establishment_id: str,
    db: Session = Depends(get_db),
    _admin = Depends(require_admin)
):
    """
    Ver Partner associado ao estabelecimento (se existir).
    """
    
    establishment = db.query(Establishment).filter(Establishment.id == establishment_id).first()
    
    if not establishment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Estabelecimento não encontrado"
        )
    
    if not establishment.claimed_place_id:
        return {"partner": None, "message": "Estabelecimento sem Google Place ID"}
    
    partner = db.query(Partner).filter(
        Partner.google_place_id == establishment.claimed_place_id
    ).first()
    
    if not partner:
        return {"partner": None, "message": "Partner não encontrado"}
    
    return {
        "partner": {
            "id": partner.id,
            "name": partner.name,
            "service_type": partner.service_type,
            "partner_level": partner.partner_level,
            "is_active": partner.is_active,
            "is_verified": partner.is_verified,
            "lat": partner.lat,
            "lng": partner.lng,
            "formatted_address": partner.formatted_address
        }
    }
