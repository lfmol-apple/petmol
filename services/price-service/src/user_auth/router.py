"""Auth routes for local user accounts."""
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status, Cookie, Header
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from .models import User
from .schemas import UserCreate, LoginRequest, UserOut, LoginResponse, TokenData
from .security import create_access_token, decode_token, hash_password, verify_password

settings = get_settings()

router = APIRouter(prefix="/auth", tags=["Auth"])

COOKIE_NAME = "petmol_session"


def _cookie_settings():
    # Em dev (localhost), lax funciona sem https
    # Em prod com HTTPS, usar Lax (same-origin já funciona)
    # Se frontend e backend estiverem no mesmo domínio (via proxy nginx)
    is_prod = settings.env == "prod"
    return {
        "httponly": True,
        "secure": is_prod,
        "samesite": "lax",  # Lax funciona quando frontend e backend estão no mesmo domínio
        "max_age": settings.jwt_access_token_expire_minutes * 60,
        "path": "/",
        "domain": None,  # Deixar None para usar o domínio atual automaticamente
    }


@router.post("/signup", response_model=UserOut)
def signup(payload: UserCreate, response: Response, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email já cadastrado")

    # Validar terms_accepted
    if not payload.terms_accepted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Você deve aceitar os termos de uso")

    from datetime import datetime
    
    user = User(
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        name=payload.name,
        phone=payload.phone,
        terms_accepted=payload.terms_accepted,
        terms_version="2026-02-03",
        terms_accepted_at=datetime.utcnow() if payload.terms_accepted else None,
        postal_code=payload.postal_code,
        street=payload.street,
        number=str(payload.number) if payload.number else None,
        complement=payload.complement,
        neighborhood=payload.neighborhood,
        city=payload.city,
        state=payload.state,
        country=payload.country or 'Brasil',
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user_id=str(user.id))
    response.set_cookie(COOKIE_NAME, token, **_cookie_settings())

    return user


# Alias para compatibilidade com frontend existente
@router.post("/register", response_model=UserOut)
def register(payload: UserCreate, response: Response, db: Session = Depends(get_db)):
    """Alias para /signup - mantém compatibilidade com frontend existente"""
    return signup(payload, response, db)


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    from ..utils.logging_utils import setup_logger, hash_email

    logger = setup_logger(__name__)
    logger.info(f"Login attempt - User: {hash_email(payload.email)}")

    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user:
        logger.warning(f"Login failed - User not found: {hash_email(payload.email)}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais inválidas")

    if not verify_password(payload.password, user.password_hash):
        logger.warning(f"Login failed - Wrong password: {hash_email(payload.email)}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais inválidas")

    token = create_access_token(user_id=str(user.id))
    response.set_cookie(COOKIE_NAME, token, **_cookie_settings())
    logger.info(f"Login success - User: {hash_email(payload.email)}")
    return LoginResponse(id=user.id, email=user.email, created_at=user.created_at, access_token=token)


@router.get("/me", response_model=UserOut)
def me(
    authorization: Optional[str] = Header(default=None),
    token: Optional[str] = Cookie(default=None, alias=COOKIE_NAME),
    db: Session = Depends(get_db),
):
    # Aceita token do header Authorization (Bearer token) ou do cookie
    auth_token = None
    if authorization and authorization.startswith('Bearer '):
        auth_token = authorization[7:]  # Remove "Bearer " prefix
    elif token:
        auth_token = token
    
    if not auth_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Não autenticado")

    token_data = decode_token(auth_token)
    if not token_data or not token_data.user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")

    user = db.query(User).filter(User.id == token_data.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário não encontrado")
    
    return user


@router.patch("/me", response_model=UserOut)
def update_me(
    payload: dict,
    authorization: Optional[str] = Header(default=None),
    token: Optional[str] = Cookie(default=None, alias=COOKIE_NAME),
    db: Session = Depends(get_db),
):
    # Aceita token do header Authorization (Bearer token) ou do cookie
    auth_token = None
    if authorization and authorization.startswith('Bearer '):
        auth_token = authorization[7:]  # Remove "Bearer " prefix
    elif token:
        auth_token = token
    
    if not auth_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Não autenticado")

    token_data = decode_token(auth_token)
    if not token_data or not token_data.user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")

    user = db.query(User).filter(User.id == token_data.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário não encontrado")
    
    # Atualiza apenas os campos permitidos
    allowed_fields = ['name', 'phone', 'whatsapp', 'postal_code', 'street', 'number',
                      'complement', 'neighborhood', 'city', 'state', 'country',
                      'monthly_checkin_day', 'monthly_checkin_hour', 'monthly_checkin_minute']

    for field in allowed_fields:
        if field not in payload:
            continue
        # Validação especial para dia do lembrete mensal
        if field == 'monthly_checkin_day':
            try:
                day = int(payload[field])
            except (TypeError, ValueError):
                raise HTTPException(status_code=422, detail="monthly_checkin_day deve ser um inteiro")
            if day not in range(0, 29):  # 0 = último dia, 1–28 = dia fixo
                raise HTTPException(status_code=422, detail="monthly_checkin_day deve ser 0 (último dia) ou 1–28")
            setattr(user, field, day)
        elif field == 'monthly_checkin_hour':
            try:
                hour = int(payload[field])
            except (TypeError, ValueError):
                raise HTTPException(status_code=422, detail="monthly_checkin_hour deve ser um inteiro")
            if hour not in range(0, 24):
                raise HTTPException(status_code=422, detail="monthly_checkin_hour deve ser 0–23")
            setattr(user, field, hour)
        elif field == 'monthly_checkin_minute':
            try:
                minute = int(payload[field])
            except (TypeError, ValueError):
                raise HTTPException(status_code=422, detail="monthly_checkin_minute deve ser um inteiro")
            if minute not in range(0, 60):
                raise HTTPException(status_code=422, detail="monthly_checkin_minute deve ser 0–59")
            setattr(user, field, minute)
        else:
            setattr(user, field, payload[field])
    
    db.commit()
    db.refresh(user)
    
    return user


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


class DeleteAccountRequest(BaseModel):
    password: str


@router.delete("/me")
def delete_account(
    payload: DeleteAccountRequest,
    response: Response,
    authorization: Optional[str] = Header(default=None),
    token: Optional[str] = Cookie(default=None, alias=COOKIE_NAME),
    db: Session = Depends(get_db),
):
    """Deleta a conta do usuario autenticado e todos os dados relacionados."""
    auth_token = None
    if authorization and authorization.startswith("Bearer "):
        auth_token = authorization[7:]
    elif token:
        auth_token = token

    if not auth_token:
        raise HTTPException(status_code=401, detail="Nao autenticado")

    token_data = decode_token(auth_token)
    if not token_data:
        raise HTTPException(status_code=401, detail="Token invalido")

    user = db.query(User).filter(User.id == token_data.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario nao encontrado")

    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Senha incorreta")

    # Deleta dados relacionados via SQL direto para evitar problemas de relacionamento
    from sqlalchemy import text
    uid = str(user.id)
    # Tabelas com pet_id (ordem importa: filhas antes de pets)
    pet_child_tables = [
        'analytics_events',
        'care_plans',
        'events',
        'feeding_plans',
        'grooming_records',
        'parasite_control_records',
        'pet_document_imports',
        'pet_documents',
        'rg_public',
        'user_monthly_checkins',
        'vaccine_records',
    ]
    for t in pet_child_tables:
        db.execute(text(f"DELETE FROM {t} WHERE pet_id IN (SELECT id FROM pets WHERE user_id = :uid)"), {"uid": uid})
    db.execute(text("DELETE FROM pets WHERE user_id = :uid"), {"uid": uid})
    db.delete(user)
    db.commit()

    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}
