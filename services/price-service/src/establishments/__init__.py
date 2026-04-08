"""
SLICE 3: Portal de Estabelecimentos - Endpoints de Cadastro e Gestão
"""
from datetime import datetime, timedelta
from typing import Optional, List
from uuid import uuid4
import hashlib
import re

import httpx

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, field_validator

from ..db import get_db
from ..services.models import Establishment, Partner
from ..user_auth.deps import get_current_user
from ..providers import google_places_provider

router = APIRouter(prefix="/establishments", tags=["establishments"])


ESTABLISHMENT_TERMS_VERSION = "2026-02-03"


def _normalize_cnpj(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def _is_valid_cnpj(value: str) -> bool:
    cnpj = _normalize_cnpj(value)
    if len(cnpj) != 14:
        return False
    if cnpj == cnpj[0] * 14:
        return False

    def calc_digit(cnpj_base: str, weights: List[int]) -> str:
        total = sum(int(d) * w for d, w in zip(cnpj_base, weights))
        mod = total % 11
        return "0" if mod < 2 else str(11 - mod)

    w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    w2 = [6] + w1
    d1 = calc_digit(cnpj[:12], w1)
    d2 = calc_digit(cnpj[:12] + d1, w2)
    return cnpj[-2:] == (d1 + d2)


# === SCHEMAS ===

class EstablishmentRegister(BaseModel):
    """Dados para cadastro de estabelecimento"""
    cnpj: str
    display_name: str
    email: EmailStr
    phone: str
    
    # Tipo de serviço
    service_type: str  # banho_tosa, vet_clinic, emergencia, petshop
    
    # Localização
    lat: float
    lng: float
    formatted_address: str
    
    # Opcional: vincular com Google Places
    google_place_id: Optional[str] = None
    
    # Dados extras
    website: Optional[str] = None
    whatsapp: Optional[str] = None
    description: Optional[str] = None

    # Termos
    terms_accepted: bool

    @field_validator('cnpj')
    @classmethod
    def validate_cnpj(cls, v: str) -> str:
        if not _is_valid_cnpj(v):
            raise ValueError('CNPJ inválido')
        return _normalize_cnpj(v)
    
    @field_validator('phone', 'whatsapp')
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return v
        # Remove caracteres não numéricos
        phone = re.sub(r'\D', '', v)
        if len(phone) < 10 or len(phone) > 15:
            raise ValueError('Telefone inválido')
        return phone
    
    @field_validator('service_type')
    @classmethod
    def validate_service_type(cls, v: str) -> str:
        valid_types = ['banho_tosa', 'vet_clinic', 'emergencia', 'petshop', 'hotel', 'adestramento']
        if v not in valid_types:
            raise ValueError(f'Tipo de serviço inválido. Opções: {", ".join(valid_types)}')
        return v


class EstablishmentResponse(BaseModel):
    """Resposta com dados do estabelecimento"""
    id: str
    display_name: str
    email: str
    phone: str
    service_type: str
    claim_status: str
    plan: str
    qr_id: str
    qr_url: str
    phone_verified: bool
    created_at: datetime
    
    model_config = {"from_attributes": True}


class EstablishmentUpdate(BaseModel):
    """Atualização de dados do estabelecimento"""
    display_name: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    website: Optional[str] = None
    description: Optional[str] = None


# === HELPERS ===

def generate_qr_id(establishment_name: str, email: str) -> str:
    """Gera ID único para QR code do estabelecimento"""
    base = f"{establishment_name}{email}{uuid4()}"
    return hashlib.sha256(base.encode()).hexdigest()[:16]


# === ENDPOINTS ===

class PlaceCandidate(BaseModel):
    place_id: str
    name: str
    address: str
    types: List[str] = []


class CNPJLookupRequest(BaseModel):
    cnpj: str

    @field_validator('cnpj')
    @classmethod
    def validate_cnpj(cls, v: str) -> str:
        if not _is_valid_cnpj(v):
            raise ValueError('CNPJ inválido')
        return _normalize_cnpj(v)


class CNPJLookupResponse(BaseModel):
    cnpj: str
    razao_social: Optional[str] = None
    nome_fantasia: Optional[str] = None
    municipio: Optional[str] = None
    uf: Optional[str] = None
    bairro: Optional[str] = None
    logradouro: Optional[str] = None
    numero: Optional[str] = None
    cep: Optional[str] = None
    places_available: bool
    place_candidates: List[PlaceCandidate] = []


@router.post("/cnpj/lookup", response_model=CNPJLookupResponse)
async def lookup_cnpj_and_suggest_places(data: CNPJLookupRequest):
    """Resolve CNPJ via BrasilAPI e sugere possíveis `place_id` via Google Places.

    Observação: a sugestão de Places é heurística (nome + cidade/UF).
    """

    url = f"https://brasilapi.com.br/api/cnpj/v1/{data.cnpj}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
    except Exception:
        raise HTTPException(status_code=502, detail="Falha ao consultar serviço de CNPJ")

    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail="CNPJ não encontrado")
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail="Falha ao consultar serviço de CNPJ")

    payload = resp.json() or {}
    razao_social = payload.get("razao_social")
    nome_fantasia = payload.get("nome_fantasia")
    municipio = payload.get("municipio")
    uf = payload.get("uf")
    bairro = payload.get("bairro")
    logradouro = payload.get("logradouro")
    numero = payload.get("numero")
    cep = payload.get("cep")

    places_available = bool(getattr(google_places_provider, "is_available", False))
    candidates: List[PlaceCandidate] = []
    if places_available:
        base_name = (nome_fantasia or razao_social or "").strip()
        location_hint = " ".join([p for p in [municipio, uf] if p]).strip()
        query = " ".join([p for p in [base_name, location_hint] if p]).strip()
        if len(query) >= 2:
            try:
                preds = await google_places_provider.autocomplete(
                    query=query,
                    country="BR",
                    lat=None,
                    lng=None,
                    limit=5,
                )
                candidates = [
                    PlaceCandidate(
                        place_id=p.place_id,
                        name=p.name,
                        address=p.address,
                        types=p.types,
                    )
                    for p in preds
                ]
            except Exception:
                candidates = []

    return CNPJLookupResponse(
        cnpj=data.cnpj,
        razao_social=razao_social,
        nome_fantasia=nome_fantasia,
        municipio=municipio,
        uf=uf,
        bairro=bairro,
        logradouro=logradouro,
        numero=numero,
        cep=cep,
        places_available=places_available,
        place_candidates=candidates,
    )

@router.post("/register", response_model=EstablishmentResponse, status_code=status.HTTP_201_CREATED)
async def register_establishment(
    data: EstablishmentRegister,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Cadastro de estabelecimento no portal self-serve.
    Cria conta gratuita (free plan) e gera QR code único.
    """
    
    # Termos obrigatórios
    if not data.terms_accepted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="É necessário aceitar os termos para continuar"
        )

    # Verificar se email já cadastrado
    existing = db.query(Establishment).filter(Establishment.email == data.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email já cadastrado"
        )

    # Verificar se CNPJ já cadastrado (se a coluna existir no DB)
    try:
        existing_cnpj = db.query(Establishment).filter(Establishment.cnpj == data.cnpj).first()
    except Exception:
        existing_cnpj = None
    if existing_cnpj:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Este CNPJ já foi cadastrado"
        )
    
    # Verificar se Google Place ID já reivindicado
    if data.google_place_id:
        existing_place = db.query(Establishment).filter(
            Establishment.claimed_place_id == data.google_place_id
        ).first()
        if existing_place:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Este estabelecimento já foi cadastrado"
            )
    
    # Gerar QR ID único
    qr_id = generate_qr_id(data.display_name, data.email)
    
    # Criar estabelecimento
    establishment = Establishment(
        id=str(uuid4()),
        display_name=data.display_name,
        cnpj=data.cnpj,
        email=data.email,
        phone=data.phone,
        claimed_place_id=data.google_place_id,
        claim_status="pending",
        plan="free",
        qr_id=qr_id,
        phone_verified=False,
        created_at=datetime.utcnow(),
        terms_version=ESTABLISHMENT_TERMS_VERSION,
        terms_accepted_at=datetime.utcnow(),
        terms_accepted_ip=(request.client.host if request.client else None),
        terms_accepted_user_agent=request.headers.get("user-agent"),
    )
    
    db.add(establishment)
    db.commit()
    db.refresh(establishment)
    
    # Se tem Google Place ID, criar Partner associado (aprovação manual depois)
    if data.google_place_id:
        from ..services.geohash import encode_geohash
        
        partner = Partner(
            id=str(uuid4()),
            name=data.display_name,
            display_name=data.display_name,
            lat=data.lat,
            lng=data.lng,
            geohash=encode_geohash(data.lat, data.lng, precision=8),
            service_type=data.service_type,
            partner_level=1,
            is_active=False,  # Aprovação manual
            is_verified=False,
            google_place_id=data.google_place_id,
            phone=data.phone,
            whatsapp=data.whatsapp,
            website=data.website,
            formatted_address=data.formatted_address
        )
        
        db.add(partner)
        db.commit()
    
    # Montar resposta
    response_data = EstablishmentResponse(
        id=establishment.id,
        display_name=establishment.display_name,
        email=establishment.email,
        phone=establishment.phone,
        service_type=data.service_type,
        claim_status=establishment.claim_status,
        plan=establishment.plan,
        qr_id=establishment.qr_id,
        qr_url=f"https://petmol.com/qr/{establishment.qr_id}",
        phone_verified=establishment.phone_verified,
        created_at=establishment.created_at
    )
    
    return response_data


@router.get("/me", response_model=EstablishmentResponse)
async def get_my_establishment(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Obter dados do estabelecimento do usuário logado.
    """
    
    # Buscar estabelecimento pelo email do usuário
    establishment = db.query(Establishment).filter(
        Establishment.email == current_user.email
    ).first()
    
    if not establishment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Estabelecimento não encontrado"
        )
    
    # Buscar service_type do partner associado
    partner = db.query(Partner).filter(
        Partner.google_place_id == establishment.claimed_place_id
    ).first()
    
    service_type = partner.service_type if partner else "outros"
    
    response_data = EstablishmentResponse(
        id=establishment.id,
        display_name=establishment.display_name,
        email=establishment.email,
        phone=establishment.phone,
        service_type=service_type,
        claim_status=establishment.claim_status,
        plan=establishment.plan,
        qr_id=establishment.qr_id,
        qr_url=f"https://petmol.com/qr/{establishment.qr_id}",
        phone_verified=establishment.phone_verified,
        created_at=establishment.created_at
    )
    
    return response_data


@router.patch("/me", response_model=EstablishmentResponse)
async def update_my_establishment(
    data: EstablishmentUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Atualizar dados do estabelecimento.
    """
    
    establishment = db.query(Establishment).filter(
        Establishment.email == current_user.email
    ).first()
    
    if not establishment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Estabelecimento não encontrado"
        )
    
    # Atualizar campos fornecidos
    if data.display_name is not None:
        establishment.display_name = data.display_name
    if data.phone is not None:
        establishment.phone = data.phone
    
    db.commit()
    db.refresh(establishment)
    
    # Buscar service_type
    partner = db.query(Partner).filter(
        Partner.google_place_id == establishment.claimed_place_id
    ).first()
    service_type = partner.service_type if partner else "outros"
    
    response_data = EstablishmentResponse(
        id=establishment.id,
        display_name=establishment.display_name,
        email=establishment.email,
        phone=establishment.phone,
        service_type=service_type,
        claim_status=establishment.claim_status,
        plan=establishment.plan,
        qr_id=establishment.qr_id,
        qr_url=f"https://petmol.com/qr/{establishment.qr_id}",
        phone_verified=establishment.phone_verified,
        created_at=establishment.created_at
    )
    
    return response_data


@router.get("/analytics/clicks")
async def get_establishment_analytics(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Analytics de clicks no estabelecimento (handoffs + QR scans).
    """
    from ..services.models import AnalyticsClick, QRScan
    
    establishment = db.query(Establishment).filter(
        Establishment.email == current_user.email
    ).first()
    
    if not establishment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Estabelecimento não encontrado"
        )
    
    # Buscar partner associado
    partner = db.query(Partner).filter(
        Partner.google_place_id == establishment.claimed_place_id
    ).first()
    
    if not partner:
        return {
            "handoff_clicks": 0,
            "qr_scans": 0,
            "total_interactions": 0,
            "last_30_days": []
        }
    
    # Clicks de handoff
    handoff_clicks = db.query(AnalyticsClick).filter(
        AnalyticsClick.action == "handoff",
        AnalyticsClick.source == "partner"
    ).count()
    
    # QR scans
    qr_scans = db.query(QRScan).filter(
        QRScan.qr_id == establishment.qr_id
    ).count()
    
    return {
        "handoff_clicks": handoff_clicks,
        "qr_scans": qr_scans,
        "total_interactions": handoff_clicks + qr_scans,
        "partner_id": partner.id,
        "last_30_days": []  # TODO: implementar agregação diária
    }
