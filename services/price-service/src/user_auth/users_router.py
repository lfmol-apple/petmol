"""Router for /api/users compatibility with frontend."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Header, Cookie
from sqlalchemy.orm import Session

from ..db import get_db
from .models import User
from .schemas import UserOut
from .security import decode_token

router = APIRouter(prefix="/users", tags=["Users API"])

COOKIE_NAME = "petmol_session"


@router.get("/me", response_model=UserOut)
def api_users_me(
    authorization: Optional[str] = Header(default=None),
    token: Optional[str] = Cookie(default=None, alias=COOKIE_NAME),
    db: Session = Depends(get_db),
):
    """Alias para /auth/me - mantém compatibilidade com frontend existente"""
    # Reutiliza a mesma lógica do /auth/me
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
def api_users_update_me(
    payload: dict,
    authorization: Optional[str] = Header(default=None),
    token: Optional[str] = Cookie(default=None, alias=COOKIE_NAME),
    db: Session = Depends(get_db),
):
    """Alias para /auth/me PATCH - mantém compatibilidade com frontend existente"""
    # Reutiliza a mesma lógica do /auth/me PATCH
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
                      'complement', 'neighborhood', 'city', 'state', 'country']
    
    for field in allowed_fields:
        if field in payload:
            setattr(user, field, payload[field])
    
    db.commit()
    db.refresh(user)
    
    return user