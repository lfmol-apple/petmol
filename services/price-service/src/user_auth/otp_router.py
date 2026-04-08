"""
OTP routes for SMS 2FA on logout.
Kept separate from router.py to avoid circular imports with deps.py.
"""
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session

from ..db import get_db
from .deps import get_current_user
from .models import User

# COOKIE_NAME duplicated here to avoid circular import
COOKIE_NAME = "petmol_session"

router = APIRouter(prefix="/auth", tags=["Auth 2FA"])


class OTPSendResponse(BaseModel):
    ok: bool
    masked_phone: str
    message: str
    test_code: Optional[str] = None  # Returned only in dev (no Twilio configured)


class OTPVerifyRequest(BaseModel):
    code: str


class LoginOTPVerifyRequest(BaseModel):
    email: str
    code: str


@router.post("/logout-otp/send", response_model=OTPSendResponse)
def send_logout_otp(
    current_user: User = Depends(get_current_user),
):
    """Generate and send an email OTP to confirm logout (2FA)."""
    from ..otp import create_otp
    from ..email_otp import send_email_otp, mask_email
    import os

    code = create_otp(current_user.id)
    sent = send_email_otp(current_user.email, code)
    if not sent:
        raise HTTPException(status_code=503, detail="Falha ao enviar e-mail. Tente novamente.")

    masked = mask_email(current_user.email)
    is_smtp = bool(os.environ.get("SMTP_HOST"))
    return OTPSendResponse(ok=True, masked_phone=masked, message="sent", test_code=None if is_smtp else code)


@router.post("/logout-otp/verify")
def verify_logout_otp(
    body: OTPVerifyRequest,
    response: Response,
    current_user: User = Depends(get_current_user),
):
    """Verify SMS OTP and complete logout."""
    from ..otp import verify_otp

    if not body.code or body.code == "no_phone":
        response.delete_cookie(COOKIE_NAME, path="/")
        return {"ok": True}

    if not verify_otp(current_user.id, body.code):
        raise HTTPException(status_code=400, detail="Código inválido ou expirado.")

    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@router.post("/login-otp/verify")
def verify_login_otp(
    body: LoginOTPVerifyRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    """Verify SMS OTP after password check and establish session cookie."""
    from ..otp import verify_otp
    from .security import create_access_token
    from ..config import get_settings

    user = db.query(User).filter(User.email == body.email.lower()).first()
    if not user:
        raise HTTPException(status_code=400, detail="Usuário não encontrado.")

    if not verify_otp(user.id, body.code):
        raise HTTPException(status_code=400, detail="Código inválido ou expirado.")

    settings = get_settings()
    is_prod = settings.env == "prod"
    cookie_kwargs = {
        "httponly": True,
        "secure": is_prod,
        "samesite": "lax",
        "max_age": settings.jwt_access_token_expire_minutes * 60,
        "path": "/",
        "domain": None,
    }

    token = create_access_token(user_id=str(user.id))
    response.set_cookie(COOKIE_NAME, token, **cookie_kwargs)

    return {
        "status": "ok",
        "id": str(user.id),
        "email": user.email,
        "access_token": token,
    }
