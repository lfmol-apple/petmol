"""Endpoints para lembretes mensais de saúde pet.

GET  /api/checkins/monthly?month_ref=YYYY-MM[&pet_id=xxx]
POST /api/checkins/monthly
     body: { month_ref, status, pet_id?, snooze_until? }
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..user_auth.deps import get_current_user
from ..user_auth.models import User
from .models import UserMonthlyCheckin

router = APIRouter(prefix="/api/checkins", tags=["Checkins"])


class CheckinBody(BaseModel):
    month_ref: str            # "YYYY-MM"
    status: str               # 'registered' | 'nothing' | 'snoozed'
    pet_id: Optional[str] = None
    snooze_until: Optional[date] = None  # ISO date string → date


class CheckinOut(BaseModel):
    id: str
    user_id: str
    pet_id: Optional[str]
    month_ref: str
    status: str
    snooze_until: Optional[date]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


def _current_month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


@router.get("/monthly")
def get_monthly_checkin(
    month_ref: Optional[str] = None,
    pet_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retorna o(s) checkin(s) do mês especificado (default: mês atual).
    Se pet_id fornecido, filtra por pet.
    """
    ref = month_ref or _current_month()

    q = db.query(UserMonthlyCheckin).filter(
        UserMonthlyCheckin.user_id == current_user.id,
        UserMonthlyCheckin.month_ref == ref,
    )
    if pet_id:
        q = q.filter(UserMonthlyCheckin.pet_id == pet_id)

    checkins = q.order_by(UserMonthlyCheckin.created_at.desc()).all()

    today = date.today()
    result = []
    for c in checkins:
        # Se snoozed e snooze_until já passou, tratar como pendente
        effective_status = c.status
        if c.status == "snoozed" and c.snooze_until and c.snooze_until <= today:
            effective_status = "pending"
        result.append({
            "id": c.id,
            "user_id": c.user_id,
            "pet_id": c.pet_id,
            "month_ref": c.month_ref,
            "status": effective_status,
            "snooze_until": c.snooze_until.isoformat() if c.snooze_until else None,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        })

    return {"checkins": result, "month_ref": ref, "count": len(result)}


@router.post("/monthly", status_code=201)
def upsert_monthly_checkin(
    body: CheckinBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Cria ou atualiza o checkin mensal.
    Faz upsert: se já existe (user_id + pet_id + month_ref), atualiza status.
    """
    if body.status not in ("registered", "nothing", "snoozed"):
        raise HTTPException(status_code=422, detail="status inválido")

    existing = db.query(UserMonthlyCheckin).filter(
        UserMonthlyCheckin.user_id == current_user.id,
        UserMonthlyCheckin.month_ref == body.month_ref,
        UserMonthlyCheckin.pet_id == body.pet_id,
    ).first()

    if existing:
        existing.status = body.status
        existing.snooze_until = body.snooze_until
        db.commit()
        db.refresh(existing)
        return _out(existing)

    checkin = UserMonthlyCheckin(
        user_id=current_user.id,
        pet_id=body.pet_id,
        month_ref=body.month_ref,
        status=body.status,
        snooze_until=body.snooze_until,
    )
    db.add(checkin)
    db.commit()
    db.refresh(checkin)
    return _out(checkin)


def _out(c: UserMonthlyCheckin) -> dict:
    return {
        "id": c.id,
        "user_id": c.user_id,
        "pet_id": c.pet_id,
        "month_ref": c.month_ref,
        "status": c.status,
        "snooze_until": c.snooze_until.isoformat() if c.snooze_until else None,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }
