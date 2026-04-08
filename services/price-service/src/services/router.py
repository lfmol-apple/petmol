"""
FastAPI router for services (search, handoff, analytics).
SLICE 1 - Services Router
"""
import hashlib
import secrets
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..db import get_db
from .schemas import (
    ServiceSearchRequest,
    ServiceSearchResponse,
    PlaceContactResponse,
    HandoffRequest,
    HandoffResponse,
    AnalyticsClickCreate
)
from .service import (
    search_services,
    get_place_contact,
    track_analytics_click
)

router = APIRouter(prefix="/services", tags=["Services"])


@router.post("/search", response_model=ServiceSearchResponse)
async def search_pet_services(
    request: ServiceSearchRequest,
    db: Session = Depends(get_db)
):
    """
    Busca serviços para pets com priorização de partners.
    
    **Ordem de prioridade:**
    1. Partners Level 2 (verificados)
    2. Partners Level 1 (básicos)
    3. Google Places (cache ou API)
    
    **Tipos de serviço:**
    - `banho_tosa`: Banho e tosa
    - `vet_clinic`: Clínicas veterinárias
    - `emergencia`: Emergências 24h
    - `petshop`: Pet shops
    
    **Cache:**
    - TTL: 30 dias
    - Tiers: near (<1km), mid (1-3km), far (>3km)
    - Por célula geohash + tier
    
    **FieldMask:**
    - Apenas campos essenciais (sem fotos)
    - Contatos buscados on-demand
    """
    try:
        result = await search_services(
            db=db,
            lat=request.lat,
            lng=request.lng,
            service=request.service,
            radius_meters=request.radius_meters,
            limit=request.limit
        )
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error searching services: {str(e)}"
        )


@router.get("/contact/{place_id}", response_model=PlaceContactResponse)
async def get_contact(
    place_id: str,
    db: Session = Depends(get_db)
):
    """
    Busca contatos de um lugar específico (on-demand).
    
    **Cache:**
    - TTL: 30 dias
    - Somente phone e website
    
    **FieldMask:**
    - `nationalPhoneNumber`
    - `formattedPhoneNumber`
    - `websiteUri`
    - `businessStatus`
    
    Chamado quando usuário abre card ou toca em "Contato".
    """
    try:
        contact = await get_place_contact(db=db, place_id=place_id)
        return contact
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching contact: {str(e)}"
        )


@router.get("/handoff", response_model=HandoffResponse)
async def handoff(
    place_id: str = Query(None, description="Google Place ID"),
    place_name: str = Query(None, description="Nome do lugar"),
    action: str = Query(..., description="whatsapp|call|directions|website"),
    source: str = Query("google", description="partner|google|qr"),
    service: str = Query(None, description="Tipo de serviço"),
    target_url: str = Query(..., description="URL de destino"),
    app_version: str = Query(None, description="Versão do app"),
    platform: str = Query("web", description="web|ios|android"),
    db: Session = Depends(get_db)
):
    """
    Gera lead_id e registra click de handoff (SEM PII).
    
    **Lead ID:**
    - Hash SHA256 aleatório (64 chars)
    - Não contém informações pessoais
    - Usado apenas para analytics
    
    **Analytics:**
    - Rastreia: action, source, service, platform
    - NÃO rastreia: user_id, email, IP, localização exata
    
    **Actions:**
    - `whatsapp`: wa.me/5511999999999
    - `call`: tel:+5511999999999
    - `directions`: google.com/maps/dir/?api=1&destination=...
    - `website`: https://exemplo.com
    
    **Redirect:**
    - Retorna URL de destino para frontend fazer o redirect
    - Frontend não precisa esperar resposta da analytics
    """
    try:
        # Gerar lead_id único
        random_bytes = secrets.token_bytes(32)
        lead_id = hashlib.sha256(random_bytes).hexdigest()
        
        # Registrar analytics (sem PII)
        click_data = AnalyticsClickCreate(
            lead_id=lead_id,
            place_id=place_id,
            place_name=place_name,
            action=action,
            source=source,
            service=service,
            country_code="BR",  # Hardcoded por enquanto
            app_version=app_version,
            platform=platform
        )
        
        track_analytics_click(db, click_data)
        
        return HandoffResponse(
            lead_id=lead_id,
            redirect_url=target_url
        )
    
    except Exception as e:
        # Não falhar o handoff por erro de analytics
        # Gerar lead_id mesmo assim
        random_bytes = secrets.token_bytes(32)
        lead_id = hashlib.sha256(random_bytes).hexdigest()
        
        return HandoffResponse(
            lead_id=lead_id,
            redirect_url=target_url
        )
