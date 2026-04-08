"""
otp.py - OTP (One-Time Password) management for PETMOL 2FA via SMS
Uses in-memory storage (no DB migration needed) with TTL expiry.
SMS provider: Twilio (configurable). Falls back to console log in dev.
"""
import random
import time
import logging
from typing import Dict, Tuple, Optional
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

# In-memory OTP store: user_id -> (code, expires_at_timestamp)
_otp_store: Dict[int, Tuple[str, float]] = {}

OTP_TTL_SECONDS = 300  # 5 minutes
OTP_LENGTH = 6


def _generate_code() -> str:
    return str(random.randint(10 ** (OTP_LENGTH - 1), 10 ** OTP_LENGTH - 1))


def create_otp(user_id: int) -> str:
    """Generate and store an OTP for the given user. Returns the code."""
    code = _generate_code()
    expires_at = time.time() + OTP_TTL_SECONDS
    _otp_store[user_id] = (code, expires_at)
    return code


def verify_otp(user_id: int, code: str) -> bool:
    """Verify an OTP code. Returns True if valid and not expired. Clears on success."""
    entry = _otp_store.get(user_id)
    if not entry:
        return False
    stored_code, expires_at = entry
    if time.time() > expires_at:
        _otp_store.pop(user_id, None)
        return False
    if stored_code != code.strip():
        return False
    _otp_store.pop(user_id, None)
    return True


def clear_otp(user_id: int) -> None:
    _otp_store.pop(user_id, None)


# ── SMS Sender ──────────────────────────────────────────────────────────────


def send_sms_otp(phone: str, code: str) -> bool:
    """
    Send OTP via SMS.
    Uses Twilio if TWILIO_ACCOUNT_SID env var is set.
    Falls back to console log for local development.
    Returns True if sent successfully.
    """
    import os
    twilio_sid = os.environ.get("TWILIO_ACCOUNT_SID")
    twilio_token = os.environ.get("TWILIO_AUTH_TOKEN")
    twilio_from = os.environ.get("TWILIO_FROM_NUMBER")

    # Normalize phone to E.164 format for Brazil
    normalized = _normalize_phone_br(phone)

    message = f"Seu código de verificação PETMOL: {code}\nVálido por {OTP_TTL_SECONDS // 60} minutos."

    if twilio_sid and twilio_token and twilio_from:
        return _send_via_twilio(twilio_sid, twilio_token, twilio_from, normalized, message)

    # Dev fallback: print to console
    logger.warning(
        f"[OTP DEV] SMS para {normalized}: {message!r} "
        f"(configure TWILIO_ACCOUNT_SID para envio real)"
    )
    print(f"\n{'='*50}")
    print(f"[PETMOL OTP] Para: {normalized}")
    print(f"[PETMOL OTP] Código: {code}")
    print(f"{'='*50}\n")
    return True  # In dev we always return success so login/logout can be tested


def _send_via_twilio(sid: str, token: str, from_: str, to: str, body: str) -> bool:
    try:
        from twilio.rest import Client  # type: ignore
        client = Client(sid, token)
        client.messages.create(body=body, from_=from_, to=to)
        logger.info(f"SMS OTP enviado para {to}")
        return True
    except ImportError:
        logger.error("twilio não instalado. Execute: pip install twilio")
        return False
    except Exception as e:
        logger.error(f"Erro ao enviar SMS via Twilio: {e}")
        return False


def _normalize_phone_br(phone: str) -> str:
    """Normaliza número para formato E.164 (+55 11 99999-9999)."""
    digits = "".join(c for c in phone if c.isdigit())
    if not digits:
        return phone
    if digits.startswith("55") and len(digits) >= 12:
        return f"+{digits}"
    if len(digits) == 11 or len(digits) == 10:
        return f"+55{digits}"
    if digits.startswith("+"):
        return phone
    return f"+{digits}"
