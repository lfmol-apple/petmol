"""CRUD router for parasite control records."""
import json
from uuid import uuid4
from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..db import get_db
from ..user_auth.deps import get_current_user
from ..user_auth.models import User
from .models import Pet
from .parasite_models import ParasiteControlRecord
from .parasite_schemas import ParasiteControlCreate, ParasiteControlUpdate, ParasiteControlOut
from ..family.utils import send_family_push

router = APIRouter(prefix="/pets/{pet_id}/parasites", tags=["Parasite Controls"])


def _get_pet_owned(db: Session, pet_id: str, user: User) -> Pet:
    pet = db.query(Pet).filter(Pet.id == pet_id, Pet.user_id == user.id).first()
    if not pet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pet não encontrado")
    return pet


@router.get("", response_model=List[ParasiteControlOut])
def list_parasite_controls(
    pet_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Lista controles parasitários ativos do pet."""
    _get_pet_owned(db, pet_id, user)
    return (
        db.query(ParasiteControlRecord)
        .filter(ParasiteControlRecord.pet_id == pet_id, ParasiteControlRecord.deleted == False)
        .order_by(ParasiteControlRecord.date_applied.desc())
        .all()
    )


@router.post("", response_model=ParasiteControlOut, status_code=status.HTTP_201_CREATED)
def create_parasite_control(
    pet_id: str,
    payload: ParasiteControlCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Cria novo registro de controle parasitário."""
    _get_pet_owned(db, pet_id, user)
    record_id = payload.id or str(uuid4())
    # Evita duplicata na migração (upsert)
    existing = db.query(ParasiteControlRecord).filter(ParasiteControlRecord.id == record_id).first()
    if existing:
        return existing
    record = ParasiteControlRecord(
        id=record_id,
        pet_id=pet_id,
        **{k: v for k, v in payload.model_dump(exclude={"id"}).items()},
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    # Notificar família
    pet_obj = db.query(Pet).filter(Pet.id == pet_id).first()
    pet_name = pet_obj.name if pet_obj else "pet"
    actor_name = (user.name or user.email).split()[0]
    product = getattr(record, 'product_name', None) or getattr(record, 'type', '')
    send_family_push(pet_id, user.id, {
        "title": f"🦟 Antiparasitário de {pet_name}",
        "body": f"{actor_name} registrou {product} em {pet_name}",
        "icon": "/icons/icon-192x192.png",
        "badge": "/icons/icon-96x96.png",
        "tag": f"parasite-{record.id}",
        "data": {"url": f"/home?modal=parasites&petId={pet_id}"},
    }, db)
    return record


@router.patch("/{record_id}", response_model=ParasiteControlOut)
def update_parasite_control(
    pet_id: str,
    record_id: str,
    payload: ParasiteControlUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Atualiza registro de controle parasitário."""
    _get_pet_owned(db, pet_id, user)
    record = db.query(ParasiteControlRecord).filter(
        ParasiteControlRecord.id == record_id,
        ParasiteControlRecord.pet_id == pet_id,
    ).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro não encontrado")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(record, field, value)
    db.commit()
    db.refresh(record)
    return record


@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_parasite_control(
    pet_id: str,
    record_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Soft-delete de registro de controle parasitário."""
    _get_pet_owned(db, pet_id, user)
    record = db.query(ParasiteControlRecord).filter(
        ParasiteControlRecord.id == record_id,
        ParasiteControlRecord.pet_id == pet_id,
    ).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro não encontrado")
    record.deleted = True
    db.commit()
