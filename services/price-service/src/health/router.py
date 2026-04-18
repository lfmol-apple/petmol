"""
PETMOL Health Module - API Router

Health endpoints with authentication and pet ownership validation.
Integrates with existing backend structure.
"""
from datetime import date, datetime, timedelta
from typing import List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..user_auth.models import User
from ..user_auth.deps import get_current_user
from ..pets.models import Pet
from ..pets.vaccine_models import VaccineRecord
from ..events.models import Event
from .models import FeedingPlan
from .catalog import VACCINE_CATALOG, COUNTRY_CONFIG, lookup_vaccine_code
from .schemas import (
    BulkConfirmRequest,
    BulkConfirmResponse,
    VaccineResponse,
    VaccinePayload,
    AlertsSummary,
    HealthSnapshotResponse,
    SnapshotAlerts,
    FeedingPlanCreateRequest,
    FeedingPlanResponse,
    FeedingPlanData,
    FeedingEstimate,
    FeedingSnapshot,
    CountriesResponse,
    CountryInfo,
    VaccineCodeInfo,
)
from .services import (
    calculate_food_stock_estimates,
    is_food_stock_low,
    calculate_days_until_out,
)

router = APIRouter(prefix="/api/health", tags=["health"])


# ============================================================================
# Helper Functions
# ============================================================================

def _check_pet_ownership(pet_id: str, user: User, db: Session) -> Pet:
    """Validate that pet belongs to current user."""
    pet = db.query(Pet).filter(Pet.id == pet_id, Pet.user_id == user.id).first()
    if not pet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pet não encontrado ou não pertence ao usuário"
        )
    return pet


def _vaccine_record_to_response(record: VaccineRecord) -> VaccineResponse:
    """Convert ORM VaccineRecord to response schema."""
    # Resolve canonical_name from catalog if vaccine_code is known
    canonical_name: Optional[str] = None
    if record.vaccine_code and record.vaccine_code in VACCINE_CATALOG:
        entry = VACCINE_CATALOG[record.vaccine_code]
        canon_country = record.country_code or "BR"
        canonical_name = entry.display_name.get(canon_country) or entry.display_name.get("BR") or record.vaccine_code

    return VaccineResponse(
        id=record.id,
        vaccine_code=record.vaccine_code,
        country_code=record.country_code,
        code=record.vaccine_code,            # backward-compat alias
        canonical_name=canonical_name,
        display_name=record.vaccine_name,
        brand=None,
        dose_number=record.dose_number,
        applied_on=record.applied_date.date().isoformat(),
        next_due_on=record.next_dose_date.date().isoformat() if record.next_dose_date else None,
        next_due_source=record.next_due_source or "unknown",
        notes=record.notes,
        source="manual",
        confirmed_by_user=True,
        record_type=record.record_type or "confirmed_application",
        alert_days_before=record.alert_days_before,
        reminder_time=record.reminder_time,
    )


def _ensure_vaccine_reminders(
    db: Session,
    *,
    user_id: str,
    pet_id: str,
    vaccine_id: str,
    vaccine_name: str,
    next_due_date: datetime,
) -> None:
    """Create lightweight vaccine reminders at D-30, D-7 and D-1 if missing."""
    for days_before in (30, 7, 1):
        scheduled_at = next_due_date - timedelta(days=days_before)
        if scheduled_at < datetime.utcnow():
            continue
        title = f"Reforço previsto: {vaccine_name}"
        existing = (
            db.query(Event)
            .filter(
                Event.user_id == user_id,
                Event.pet_id == pet_id,
                Event.type == "vaccine",
                Event.title == title,
                Event.scheduled_at == scheduled_at,
                Event.status == "pending",
            )
            .first()
        )
        if existing:
            continue
        db.add(Event(
            id=str(uuid4()),
            user_id=user_id,
            pet_id=pet_id,
            type="vaccine",
            status="pending",
            scheduled_at=scheduled_at,
            title=title,
            description=f"Lembrete automático de vacina ({days_before} dia(s) antes).",
            notes=f"vaccine_id={vaccine_id}",
            next_due_date=next_due_date,
            reminder_days_before=days_before,
            reminder_sent=False,
            source="manual",
        ))


def _vaccine_group_key(v) -> str:
    """Canonical dedup key for a VaccineRecord.

    Priority:
      1. vaccine_code — set by catalog lookup (e.g. "DOG_RABIES").
         Groups all name variants ("Antirrábica", "Raiva", ...) sharing the same code.
      2. Normalised vaccine_name — strips parenthetical qualifiers, common modifiers
         (anual, booster, reforço, dose N) and combining accents so that
         "V10", "V10 (Múltipla)", "V10 anual" all collapse to "v10".
    """
    import re as _re
    import unicodedata as _ud

    if getattr(v, "vaccine_code", None):
        return v.vaccine_code

    name = (getattr(v, "vaccine_name", None) or getattr(v, "vaccine_type", None) or "").lower().strip()
    # Strip combining accents
    name = "".join(c for c in _ud.normalize("NFD", name) if _ud.category(c) != "Mn")
    # Remove parenthetical qualifiers: (Múltipla), (Anual), etc.
    name = _re.sub(r"\(.*?\)", "", name)
    # Remove common qualifier words
    name = _re.sub(r"\b(anual|annual|booster|reforco|dose\s*\d+|\d+[a]\s*dose)\b", "", name)
    # Normalise separators and collapse whitespace
    name = _re.sub(r"[-\u2013\u2014]", " ", name)
    return _re.sub(r"\s+", " ", name).strip()


def _calculate_vaccine_alerts(vaccines: List[VaccineRecord], today: date) -> SnapshotAlerts:
    """Calculate vaccine alerts (overdue and upcoming).

    Uses only the most-recent record per vaccine name so that old booster
    reminders are not counted after a new dose has been administered.
    """
    # Deduplicate: keep only the latest (most recent applied_date) per vaccine group.
    # Groups are identified by vaccine_code (canonical) or normalised name as fallback.
    latest: dict = {}
    for v in vaccines:
        if v.deleted:
            continue
        key = _vaccine_group_key(v)
        prev = latest.get(key)
        if not prev or v.applied_date > prev.applied_date:
            latest[key] = v

    overdue_vaccines = []
    upcoming_count = 0
    alert_window_days = 30

    for v in latest.values():
        if not v.next_dose_date:
            continue

        next_due = v.next_dose_date.date()

        # Overdue check
        if next_due < today:
            overdue_vaccines.append(v.vaccine_name)
        # Upcoming check (within 30 days)
        elif (next_due - today).days <= alert_window_days:
            upcoming_count += 1
    
    return SnapshotAlerts(
        vaccine_overdue_count=len(overdue_vaccines),
        vaccine_overdue_names=overdue_vaccines,
        parasite_overdue_count=0,  # Not implemented yet
        parasite_overdue_names=[],
        upcoming_vaccines_count=upcoming_count,
        upcoming_vaccines_within_days=alert_window_days,
    )


# ============================================================================
# Vaccine Endpoints
# ============================================================================

@router.post("/pets/{pet_id}/vaccines/bulk-confirm", response_model=BulkConfirmResponse)
async def bulk_confirm_vaccines(
    pet_id: str,
    request: BulkConfirmRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Bulk confirm vaccines (e.g., from OCR card reading).

    Catalog enrichment logic per vaccine:
    1. Try to map display_name → vaccine_code via country+species aliases.
    2. If caller provides next_due_on → respect it, mark next_due_source="manual".
    3. If no next_due_on but catalog entry has interval_days → calculate,
       mark next_due_source="protocol".
    4. If no mapping and no next_due_on → fallback 1 year,
       mark next_due_source="unknown".
    """
    # Validate pet belongs to user
    pet = _check_pet_ownership(pet_id, current_user, db)

    country = request.country_code.upper()
    species = request.species.lower()

    created_vaccines: List[VaccineRecord] = []

    for vac in request.vaccines:
        # --- Date parsing ---
        try:
            applied_date = datetime.strptime(vac.applied_on, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid date format for vaccine '{vac.display_name}'. Use YYYY-MM-DD",
            )

        next_due_date: Optional[datetime] = None
        next_due_source: str = "unknown"

        if vac.next_due_on:
            # Caller explicitly provided a next dose date → manual source
            try:
                next_due_date = datetime.strptime(vac.next_due_on, "%Y-%m-%d")
                next_due_source = "manual"
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid date format for next_due_on of '{vac.display_name}'. Use YYYY-MM-DD",
                )

        # --- Catalog lookup ---
        resolved_code: Optional[str] = lookup_vaccine_code(
            display_name=vac.display_name,
            country_code=country,
            species=species,
        )

        if not vac.next_due_on:
            # Try protocol interval if we found a match
            if resolved_code and resolved_code in VACCINE_CATALOG:
                entry = VACCINE_CATALOG[resolved_code]
                if entry.interval_days:
                    next_due_date = applied_date + timedelta(days=entry.interval_days)
                    next_due_source = "protocol"
                else:
                    # Catalog match but no interval defined → 1-year safety fallback
                    next_due_date = applied_date.replace(year=applied_date.year + 1)
                    next_due_source = "unknown"
            else:
                # No catalog match → 1-year safety fallback
                next_due_date = applied_date.replace(year=applied_date.year + 1)
                next_due_source = "unknown"

        # Ensure next_due_date always has a value (safety net)
        if not next_due_date:
            next_due_date = applied_date.replace(year=applied_date.year + 1)
            next_due_source = "unknown"

        # --- Deduplication ---
        # Rule 1 (strongest): same vaccine_code within ±45 days → same vaccination event
        #   (OCR often misreads the day/month by a few weeks on the same card)
        # Rule 2: same normalized name on exact same date
        import re as _re
        existing = None
        DEDUP_WINDOW_DAYS = 45

        if resolved_code:
            window_start = applied_date - timedelta(days=DEDUP_WINDOW_DAYS)
            window_end   = applied_date + timedelta(days=DEDUP_WINDOW_DAYS)
            existing = (
                db.query(VaccineRecord)
                .filter(
                    VaccineRecord.pet_id == pet_id,
                    VaccineRecord.vaccine_code == resolved_code,
                    VaccineRecord.applied_date >= window_start,
                    VaccineRecord.applied_date <= window_end,
                    VaccineRecord.deleted == False,
                )
                .order_by(VaccineRecord.applied_date)
                .first()
            )

        if not existing:
            normalized_input = _re.sub(r'[^A-Z0-9 ]', '', vac.display_name.upper().strip())
            same_date_records = db.query(VaccineRecord).filter(
                VaccineRecord.pet_id == pet_id,
                VaccineRecord.applied_date == applied_date,
                VaccineRecord.deleted == False,
            ).all()
            for rec in same_date_records:
                normalized_existing = _re.sub(r'[^A-Z0-9 ]', '', rec.vaccine_name.upper().strip())
                if normalized_input == normalized_existing:
                    existing = rec
                    break

        if existing:
            created_vaccines.append(existing)
            continue

        # --- Persist ---
        # Use canonical display name from catalog if resolved; fall back to user input
        canonical_vaccine_name = vac.display_name
        if resolved_code and resolved_code in VACCINE_CATALOG:
            catalog_entry = VACCINE_CATALOG[resolved_code]
            canonical_vaccine_name = (
                catalog_entry.display_name.get(country)
                or catalog_entry.display_name.get("BR")
                or vac.display_name
            )

        vaccine_record = VaccineRecord(
            id=str(uuid4()),
            pet_id=pet_id,
            vaccine_name=canonical_vaccine_name,
            applied_date=applied_date,
            next_dose_date=next_due_date,
            dose_number=vac.dose_number,
            notes=vac.notes,
            clinic_name=vac.clinic_name,
            veterinarian_name=vac.veterinarian,
            deleted=False,
            vaccine_code=resolved_code,
            country_code=country,
            next_due_source=next_due_source,
            record_type=vac.record_type,
            alert_days_before=vac.alert_days_before,
            reminder_time=vac.reminder_time,
        )

        db.add(vaccine_record)
        created_vaccines.append(vaccine_record)
        _ensure_vaccine_reminders(
            db,
            user_id=str(current_user.id),
            pet_id=pet_id,
            vaccine_id=vaccine_record.id,
            vaccine_name=vaccine_record.vaccine_name,
            next_due_date=vaccine_record.next_dose_date,
        )

    db.commit()

    for v in created_vaccines:
        db.refresh(v)

    vaccine_responses = [_vaccine_record_to_response(v) for v in created_vaccines]

    # Calculate alerts across all pet vaccines
    all_vaccines = db.query(VaccineRecord).filter(
        VaccineRecord.pet_id == pet_id,
        VaccineRecord.deleted == False,
    ).all()

    today = date.today()
    alerts_summary = AlertsSummary(
        overdue_count=sum(
            1 for v in all_vaccines
            if v.next_dose_date and v.next_dose_date.date() < today
        ),
        overdue_names=[
            v.vaccine_name for v in all_vaccines
            if v.next_dose_date and v.next_dose_date.date() < today
        ],
        upcoming_count=sum(
            1 for v in all_vaccines
            if v.next_dose_date and 0 <= (v.next_dose_date.date() - today).days <= 30
        ),
        upcoming_within_days=30,
    )

    return BulkConfirmResponse(
        status="ok",
        pet_id=pet_id,
        country_code=country,
        species=species,
        vaccines=vaccine_responses,
        alerts=alerts_summary,
    )


@router.get("/pets/{pet_id}/snapshot", response_model=HealthSnapshotResponse)
async def get_health_snapshot(
    pet_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get complete health snapshot for a pet.
    
    Includes:
    - All vaccine records
    - Alerts (overdue/upcoming)
    - Feeding plan and estimates (if exists)
    """
    # Validate pet belongs to user
    pet = _check_pet_ownership(pet_id, current_user, db)
    
    # Get all vaccines
    vaccines = db.query(VaccineRecord).filter(
        VaccineRecord.pet_id == pet_id,
        VaccineRecord.deleted == False
    ).order_by(VaccineRecord.applied_date.desc()).all()
    
    vaccine_responses = [_vaccine_record_to_response(v) for v in vaccines]
    
    # Calculate alerts
    today = date.today()
    alerts = _calculate_vaccine_alerts(vaccines, today)
    
    # Get feeding plan if exists
    feeding_snapshot = None
    feeding_plan = db.query(FeedingPlan).filter(FeedingPlan.pet_id == pet_id).first()
    
    if feeding_plan:
        # Calculate estimates
        estimated_end, _, days_total = calculate_food_stock_estimates(
            package_size_kg=feeding_plan.package_size_kg,
            daily_amount_g=feeding_plan.daily_amount_g,
            last_refill_date=feeding_plan.last_refill_date,
            safety_buffer_days=feeding_plan.safety_buffer_days,
            enabled=feeding_plan.enabled,
            no_consumption_control=feeding_plan.no_consumption_control,
        )
        
        days_left = calculate_days_until_out(estimated_end, today) if estimated_end else None
        low_stock = is_food_stock_low(estimated_end, feeding_plan.next_reminder_date, today)
        
        feeding_snapshot = FeedingSnapshot(
            estimated_end_date=estimated_end.isoformat() if estimated_end else None,
            estimated_days_left=days_left,
            low_stock=low_stock,
            recommended_alert_date=feeding_plan.next_reminder_date.isoformat() if feeding_plan.next_reminder_date else None,
            food_brand=feeding_plan.food_brand,
            mode=feeding_plan.mode,
            enabled=feeding_plan.enabled,
        )
    
    return HealthSnapshotResponse(
        status="ok",
        pet_id=pet_id,
        vaccines=vaccine_responses,
        alerts=alerts,
        feeding=feeding_snapshot,
        snapshot_at=datetime.now().isoformat(),
    )


# ============================================================================
# Feeding Plan Endpoints
# ============================================================================

@router.post("/pets/{pet_id}/feeding/plan", response_model=FeedingPlanResponse)
async def create_or_update_feeding_plan(
    pet_id: str,
    request: FeedingPlanCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create or update feeding plan for a pet.
    
    Features:
    - Can save incomplete (missing food_brand, package_size_kg, etc.)
    - enabled=False: no calculations
    - no_consumption_control=True: user managing manually
    - safety_buffer_days=0 is respected (no forced minimum)
    """
    # Validate pet belongs to user
    pet = _check_pet_ownership(pet_id, current_user, db)
    
    # Parse last_refill_date if provided
    last_refill_date_obj = None
    if request.last_refill_date:
        try:
            last_refill_date_obj = datetime.strptime(request.last_refill_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid date format for last_refill_date. Use YYYY-MM-DD"
            )

    # Parse next_purchase_date if provided (manual mode)
    next_purchase_date_obj = None
    if request.next_purchase_date:
        try:
            next_purchase_date_obj = datetime.strptime(request.next_purchase_date, "%Y-%m-%d").date()
        except ValueError:
            pass  # ignore invalid date, field is optional
    
    # Calculate estimates if possible
    estimated_end, next_reminder, _ = calculate_food_stock_estimates(
        package_size_kg=request.package_size_kg,
        daily_amount_g=request.daily_amount_g,
        last_refill_date=last_refill_date_obj,
        safety_buffer_days=request.safety_buffer_days,
        enabled=request.enabled,
        no_consumption_control=request.no_consumption_control,
    )
    
    # Check if plan already exists
    existing_plan = db.query(FeedingPlan).filter(FeedingPlan.pet_id == pet_id, FeedingPlan.deleted_at.is_(None)).first()
    
    if existing_plan:
        # Update existing plan
        existing_plan.species = request.species
        existing_plan.country_code = request.country_code
        existing_plan.food_brand = request.food_brand
        existing_plan.package_size_kg = request.package_size_kg
        existing_plan.daily_amount_g = request.daily_amount_g
        existing_plan.last_refill_date = last_refill_date_obj
        existing_plan.safety_buffer_days = request.safety_buffer_days
        existing_plan.meals_per_day = request.meals_per_day
        existing_plan.mode = request.mode
        existing_plan.notes = request.notes
        existing_plan.enabled = request.enabled
        existing_plan.no_consumption_control = request.no_consumption_control
        existing_plan.estimated_end_date = estimated_end
        existing_plan.next_reminder_date = next_reminder
        existing_plan.next_purchase_date = next_purchase_date_obj
        existing_plan.manual_reminder_days_before = request.manual_reminder_days_before
        
        plan = existing_plan
    else:
        # Create new plan
        plan = FeedingPlan(
            id=str(uuid4()),
            pet_id=pet_id,
            species=request.species,
            country_code=request.country_code,
            food_brand=request.food_brand,
            package_size_kg=request.package_size_kg,
            daily_amount_g=request.daily_amount_g,
            last_refill_date=last_refill_date_obj,
            safety_buffer_days=request.safety_buffer_days,
            meals_per_day=request.meals_per_day,
            mode=request.mode,
            notes=request.notes,
            enabled=request.enabled,
            no_consumption_control=request.no_consumption_control,
            estimated_end_date=estimated_end,
            next_reminder_date=next_reminder,
            next_purchase_date=next_purchase_date_obj,
            manual_reminder_days_before=request.manual_reminder_days_before,
        )
        db.add(plan)
    
    db.commit()
    db.refresh(plan)
    
    # Build response
    plan_data = FeedingPlanData(
        pet_id=plan.pet_id,
        species=plan.species,
        country_code=plan.country_code,
        food_brand=plan.food_brand,
        package_size_kg=plan.package_size_kg,
        daily_amount_g=plan.daily_amount_g,
        last_refill_date=plan.last_refill_date.isoformat() if plan.last_refill_date else None,
        safety_buffer_days=plan.safety_buffer_days,
        meals_per_day=plan.meals_per_day,
        mode=plan.mode,
        notes=plan.notes,
        enabled=plan.enabled,
        no_consumption_control=plan.no_consumption_control,
        next_purchase_date=plan.next_purchase_date.isoformat() if plan.next_purchase_date else None,
        manual_reminder_days_before=plan.manual_reminder_days_before,
        created_at=plan.created_at.isoformat(),
        updated_at=plan.updated_at.isoformat(),
    )
    
    # Build estimate (only if enabled and not manual mode)
    estimate = None
    if plan.enabled and not plan.no_consumption_control and estimated_end:
        days_left = calculate_days_until_out(estimated_end, date.today())
        estimate = FeedingEstimate(
            estimated_end_date=estimated_end.isoformat(),
            estimated_days_left=days_left,
            low_stock=is_food_stock_low(estimated_end, next_reminder, date.today()),
            recommended_alert_date=next_reminder.isoformat() if next_reminder else None,
            calculated_at=datetime.now().isoformat(),
        )
    
    return FeedingPlanResponse(
        status="ok",
        pet_id=pet_id,
        plan=plan_data,
        estimate=estimate,
    )


@router.get("/pets/{pet_id}/feeding/plan", response_model=FeedingPlanResponse)
async def get_feeding_plan(
    pet_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get feeding plan for a pet."""
    # Validate pet belongs to user
    pet = _check_pet_ownership(pet_id, current_user, db)
    
    # Get plan
    plan = db.query(FeedingPlan).filter(FeedingPlan.pet_id == pet_id, FeedingPlan.deleted_at.is_(None)).first()
    
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plano de alimentação não encontrado para este pet"
        )
    
    # Build response
    plan_data = FeedingPlanData(
        pet_id=plan.pet_id,
        species=plan.species,
        country_code=plan.country_code,
        food_brand=plan.food_brand,
        package_size_kg=plan.package_size_kg,
        daily_amount_g=plan.daily_amount_g,
        last_refill_date=plan.last_refill_date.isoformat() if plan.last_refill_date else None,
        safety_buffer_days=plan.safety_buffer_days,
        meals_per_day=plan.meals_per_day,
        mode=plan.mode,
        notes=plan.notes,
        enabled=plan.enabled,
        no_consumption_control=plan.no_consumption_control,
        next_purchase_date=plan.next_purchase_date.isoformat() if plan.next_purchase_date else None,
        manual_reminder_days_before=plan.manual_reminder_days_before,
        created_at=plan.created_at.isoformat(),
        updated_at=plan.updated_at.isoformat(),
    )
    
    # Recalculate estimate with fresh data
    today = date.today()
    estimated_end, next_reminder, _ = calculate_food_stock_estimates(
        package_size_kg=plan.package_size_kg,
        daily_amount_g=plan.daily_amount_g,
        last_refill_date=plan.last_refill_date,
        safety_buffer_days=plan.safety_buffer_days,
        enabled=plan.enabled,
        no_consumption_control=plan.no_consumption_control,
    )
    
    estimate = None
    if plan.enabled and not plan.no_consumption_control and estimated_end:
        days_left = calculate_days_until_out(estimated_end, today)
        estimate = FeedingEstimate(
            estimated_end_date=estimated_end.isoformat(),
            estimated_days_left=days_left,
           low_stock=is_food_stock_low(estimated_end, next_reminder, today),
            recommended_alert_date=next_reminder.isoformat() if next_reminder else None,
            calculated_at=datetime.now().isoformat(),
        )
    
    return FeedingPlanResponse(
        status="ok",
        pet_id=pet_id,
        plan=plan_data,
        estimate=estimate,
    )


@router.delete("/pets/{pet_id}/feeding/plan", status_code=status.HTTP_204_NO_CONTENT)
async def delete_feeding_plan(
    pet_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Soft delete feeding plan for quick correction."""
    _check_pet_ownership(pet_id, current_user, db)
    plan = db.query(FeedingPlan).filter(FeedingPlan.pet_id == pet_id, FeedingPlan.deleted_at.is_(None)).first()
    if not plan:
      raise HTTPException(
          status_code=status.HTTP_404_NOT_FOUND,
          detail="Plano de alimentação não encontrado para este pet"
      )
    plan.deleted_at = datetime.utcnow()
    plan.updated_at = datetime.utcnow()
    db.commit()
    return None


class SnoozeFeedingPlanRequest(BaseModel):
    snooze_days: int = 7


@router.patch("/pets/{pet_id}/feeding/plan/snooze")
async def snooze_feeding_plan(
    pet_id: str,
    body: SnoozeFeedingPlanRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Adiar lembrete de ração por N dias.

    Incrementa next_reminder_date pelo número de dias informado e persiste.
    Retorna a nova next_reminder_date para o frontend atualizar o estado.
    """
    _check_pet_ownership(pet_id, current_user, db)
    plan = db.query(FeedingPlan).filter(
        FeedingPlan.pet_id == pet_id,
        FeedingPlan.deleted_at.is_(None),
    ).first()

    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plano de alimentação não encontrado para este pet",
        )

    if not plan.next_reminder_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Plano não possui data de lembrete configurada",
        )

    plan.next_reminder_date = plan.next_reminder_date + timedelta(days=body.snooze_days)
    plan.updated_at = datetime.utcnow()
    db.commit()

    return {
        "status": "ok",
        "next_reminder_date": plan.next_reminder_date.isoformat(),
        "snooze_days": body.snooze_days,
    }


@router.get("/pets/{pet_id}/feeding/estimate", response_model=FeedingEstimate)
async def get_feeding_estimate(
    pet_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get feeding stock estimate for a pet.
    
    Calculates fresh estimates based on current plan.
    Returns 404 if plan doesn't exist or cannot calculate.
    """
    # Validate pet belongs to user
    pet = _check_pet_ownership(pet_id, current_user, db)
    
    # Get plan
    plan = db.query(FeedingPlan).filter(FeedingPlan.pet_id == pet_id, FeedingPlan.deleted_at.is_(None)).first()
    
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plano de alimentação não encontrado para este pet"
        )
    
    # Calculate estimate
    today = date.today()
    estimated_end, next_reminder, _ = calculate_food_stock_estimates(
        package_size_kg=plan.package_size_kg,
        daily_amount_g=plan.daily_amount_g,
        last_refill_date=plan.last_refill_date,
        safety_buffer_days=plan.safety_buffer_days,
        enabled=plan.enabled,
        no_consumption_control=plan.no_consumption_control,
    )
    
    if not estimated_end:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Não foi possível calcular estimativas. Verifique se enabled=true, no_consumption_control=false e todos os campos necessários estão preenchidos."
        )
    
    days_left = calculate_days_until_out(estimated_end, today)
    
    return FeedingEstimate(
        estimated_end_date=estimated_end.isoformat(),
        estimated_days_left=days_left,
        low_stock=is_food_stock_low(estimated_end, next_reminder, today),
        recommended_alert_date=next_reminder.isoformat() if next_reminder else None,
        calculated_at=datetime.now().isoformat(),
    )


# ============================================================================
# Test Endpoints (no authentication required for testing)
# ============================================================================

@router.get("/test-vaccine-calculation")
async def test_vaccine_calculation():
    """
    Test endpoint to verify vaccine calculation logic.
    Returns example vaccine schedule calculations.
    """
    from datetime import timedelta
    
    example_date = date.today() - timedelta(days=30)
    next_due = example_date + timedelta(days=365)  # Annual vaccine
    
    return {
        "status": "ok",
        "message": "Vaccine calculation logic available",
        "example": {
            "vaccine_name": "V10",
            "applied_on": example_date.isoformat(),
            "next_due_on": next_due.isoformat(),
            "interval_days": 365,
            "calculation_method": "protocol_based",
        },
        "supported_protocols": [
            "annual_vaccines",
            "puppy_series",
            "kitten_series",
            "rabies",
        ],
    }


@router.get("/test-parasite-calculation")
async def test_parasite_calculation():
    """
    Test endpoint to verify parasite control calculation logic.
    Returns example parasite control schedule.
    """
    from datetime import timedelta
    
    example_date = date.today() - timedelta(days=15)
    next_due = example_date + timedelta(days=30)  # Monthly control
    
    return {
        "status": "ok",
        "message": "Parasite calculation logic available",
        "example": {
            "product_name": "NexGard",
            "type": "external",  # internal | external | combined
            "last_applied": example_date.isoformat(),
            "next_due": next_due.isoformat(),
            "interval_days": 30,
            "calculation_method": "interval_based",
        },
        "supported_intervals": [30, 60, 90, 180],
    }


@router.get("/countries", response_model=CountriesResponse)
async def get_supported_countries():
    """
    Return supported countries and their core vaccine codes.

    Does not require authentication – used by the frontend to populate
    country selectors and inform the user which protocols are available.
    """
    country_list: List[CountryInfo] = []

    for code, cfg in COUNTRY_CONFIG.items():
        if not cfg.get("supported"):
            continue

        core_by_species: dict = {}
        for spc, codes in cfg.get("core_species", {}).items():
            entries: List[VaccineCodeInfo] = []
            for vcode in codes:
                entry = VACCINE_CATALOG.get(vcode)
                if entry:
                    entries.append(
                        VaccineCodeInfo(
                            vaccine_code=vcode,
                            display_name=entry.display_name.get(code, vcode),
                            category=entry.category,
                            interval_days=entry.interval_days,
                        )
                    )
            core_by_species[spc] = entries

        country_list.append(
            CountryInfo(
                country_code=code,
                label=cfg["label"],
                name_pt=cfg.get("name_pt", cfg["label"]),
                locale=cfg["locale"],
                supported=True,
                coverage_level=cfg.get("coverage_level", "BETA"),
                core_vaccines=core_by_species,
            )
        )

    return CountriesResponse(status="ok", countries=country_list)
