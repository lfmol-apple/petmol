"""
Push Notifications Router for PETMOL
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, Tuple, List
import json
import logging
import os
from datetime import datetime, timedelta
from pywebpush import webpush, WebPushException

from ..db import SessionLocal
from urllib.parse import quote
from ..user_auth.deps import get_current_user
from ..user_auth.models import User
from ..events.models import Event
from ..config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/notifications", tags=["Notifications"])

# Subscriptions file: use env var or fall back to a local path that works in dev
_DEFAULT_SUBS_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "push_subscriptions.json")
SUBSCRIPTIONS_FILE = os.environ.get("PUSH_SUBSCRIPTIONS_FILE", "/opt/petmol/logs/push_subscriptions.json")

# If production path not accessible, fall back to local path
if not os.path.exists(os.path.dirname(SUBSCRIPTIONS_FILE)):
    SUBSCRIPTIONS_FILE = os.path.abspath(_DEFAULT_SUBS_FILE)


class SubscriptionRequest(BaseModel):
    subscription: dict


class NotificationPayload(BaseModel):
    title: str
    body: str
    icon: Optional[str] = None
    badge: Optional[str] = None
    url: Optional[str] = None
    tag: Optional[str] = None
    require_interaction: bool = False
    auto_close_ms: int = 4000


class SendNotificationRequest(BaseModel):
    title: str
    body: str
    url: Optional[str] = "/home"
    tag: Optional[str] = "petmol"
    icon: Optional[str] = None


def _load_subscriptions() -> dict:
    if os.path.exists(SUBSCRIPTIONS_FILE):
        try:
            with open(SUBSCRIPTIONS_FILE, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def _save_subscriptions(data: dict) -> None:
    os.makedirs(os.path.dirname(SUBSCRIPTIONS_FILE), exist_ok=True)
    with open(SUBSCRIPTIONS_FILE, "w") as f:
        json.dump(data, f)


def _send_push(subscription: dict, payload: dict) -> bool:
    """Returns True on success, False if subscription is expired."""
    settings = get_settings()
    if not settings.vapid_private_key or not settings.vapid_public_key:
        logger.warning("VAPID keys nao configuradas")
        return True
    try:
        webpush(
            subscription_info={
                "endpoint": subscription["endpoint"],
                "keys": {"p256dh": subscription["p256dh"], "auth": subscription["auth"]},
            },
            data=json.dumps(payload),
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_claims_email},
        )
        return True
    except WebPushException as e:
        if e.response is not None and e.response.status_code in (404, 410):
            return False
        logger.error(f"WebPushException: {e}")
        return True
    except Exception as e:
        logger.error(f"Erro ao enviar push: {e}")
        return True


def _parasite_modal_for_type(type_key: str) -> str:
    normalized = (type_key or "").lower().strip()
    if normalized == "flea_tick":
        return "antipulgas"
    if normalized == "collar":
        return "coleira"
    return "vermifugo"


def send_checkin_pushes() -> None:
    """Called every minute by APScheduler. Sends push at configured day+hour+minute (Brasilia time)."""
    from datetime import timezone, timedelta
    brt = timezone(timedelta(hours=-3))
    now = datetime.now(brt)
    today_day = now.day
    today_hour = now.hour
    today_minute = now.minute
    subscriptions = _load_subscriptions()
    if not subscriptions:
        return
    try:
        db = SessionLocal()
        try:
            users = (
                db.query(User)
                .filter(
                    User.monthly_checkin_day == today_day,
                    User.monthly_checkin_hour == today_hour,
                    User.monthly_checkin_minute == today_minute,
                )
                .all()
            )
            expired_ids = []
            for user in users:
                sub = subscriptions.get(str(user.id))
                if not sub:
                    continue
                name = getattr(user, "name", None) or "tutor"
                payload = {
                    "title": "Lembrete mensal PETMOL",
                    "body": f"Hora de registrar a saude dos seus pets, {name}!",
                    "icon": "/icons/icon-192x192.png",
                    "badge": "/icons/badge-mono.png",

                    "image": "/brand/notification-banner.png",
                    "tag": "petmol-monthly-checkin",
                    "data": {"url": "/home?checkin=1"},
                    "requireInteraction": True,
                    "autoCloseMs": 0,
                }
                ok = _send_push(sub, payload)
                if not ok:
                    expired_ids.append(str(user.id))
                else:
                    logger.info(f"Push mensal enviado -> user {user.id}")
            if expired_ids:
                for uid in expired_ids:
                    subscriptions.pop(uid, None)
                _save_subscriptions(subscriptions)
        finally:
            db.close()
    except Exception as e:
        logger.error(f"send_checkin_pushes erro: {e}")


def _parse_hhmm(value: str) -> Optional[Tuple[int, int]]:
    try:
        hh, mm = str(value).strip().split(":")
        hour = int(hh)
        minute = int(mm)
        if 0 <= hour <= 23 and 0 <= minute <= 59:
            return hour, minute
    except Exception:
        return None
    return None


def _expand_times(base_time: str, frequency: Optional[str]) -> List[str]:
    base = _parse_hhmm(base_time)
    if not base:
        return []
    base_minutes = base[0] * 60 + base[1]
    freq = (frequency or "").strip().lower()
    if freq in ("2x_dia", "12h"):
        slots = [base_minutes, (base_minutes + 12 * 60) % (24 * 60)]
    elif freq in ("3x_dia", "8h"):
        slots = [
            base_minutes,
            (base_minutes + 8 * 60) % (24 * 60),
            (base_minutes + 16 * 60) % (24 * 60),
        ]
    else:
        slots = [base_minutes]
    return [f"{m // 60:02d}:{m % 60:02d}" for m in sorted(set(slots))]


def send_medication_pushes() -> None:
    """Called every minute by APScheduler. Sends medication reminder pushes by schedule (Brasilia time)."""
    from datetime import timezone

    brt = timezone(timedelta(hours=-3))
    now = datetime.now(brt)
    today = now.date()
    subscriptions = _load_subscriptions()
    if not subscriptions:
        return

    try:
        db = SessionLocal()
        try:
            user_ids = [uid for uid in subscriptions.keys() if uid]
            if not user_ids:
                return

            events = (
                db.query(Event)
                .filter(
                    Event.user_id.in_(user_ids),
                    Event.type.in_(["medicacao", "medication"]),
                    Event.status != "cancelled",
                )
                .all()
            )

            for event in events:
                sub = subscriptions.get(str(event.user_id))
                if not sub:
                    continue

                try:
                    extra = json.loads(event.extra_data or "{}")
                except Exception:
                    extra = {}

                reminder_time = extra.get("reminder_time")
                if not reminder_time:
                    continue

                try:
                    start_dt = event.next_due_date or event.scheduled_at
                    start_date = start_dt.astimezone(brt).date() if start_dt else today
                except Exception:
                    start_date = today
                if today < start_date:
                    continue

                treatment_days = extra.get("treatment_days")
                applied_dates = extra.get("applied_dates") or []
                skipped_dates = extra.get("skipped_dates") or []
                applied_slots = extra.get("applied_slots") or {}
                skipped_slots = extra.get("skipped_slots") or {}
                if treatment_days is not None:
                    try:
                        if len(applied_dates) >= int(treatment_days):
                            continue
                    except Exception:
                        pass

                offset_min = 0
                try:
                    offset_min = max(0, int(extra.get("reminder_offset_minutes", 0)))
                except Exception:
                    offset_min = 0

                frequency = extra.get("frequency")
                reminder_times = extra.get("reminder_times")
                if isinstance(reminder_times, list) and reminder_times:
                    slots = [str(t) for t in reminder_times if _parse_hhmm(str(t))]
                else:
                    slots = _expand_times(str(reminder_time), str(frequency) if frequency else None)

                if not slots:
                    continue

                for slot in slots:
                    hm = _parse_hhmm(slot)
                    if not hm:
                        continue

                    today_key = today.isoformat()
                    if today_key in applied_dates or today_key in skipped_dates:
                        continue

                    day_applied_slots = [str(s) for s in (applied_slots.get(today_key) or [])]
                    day_skipped_slots = [str(s) for s in (skipped_slots.get(today_key) or [])]
                    if slot in day_applied_slots or slot in day_skipped_slots:
                        continue

                    due_dt = datetime(
                        year=today.year,
                        month=today.month,
                        day=today.day,
                        hour=hm[0],
                        minute=hm[1],
                        tzinfo=brt,
                    ) - timedelta(minutes=offset_min)

                    if due_dt.hour != now.hour or due_dt.minute != now.minute:
                        continue

                    from urllib.parse import quote
                    item_name_encoded = quote(event.title or "")
                    payload = {
                        "title": f"💊 {event.title}",
                        "body": (
                            f"{offset_min} min para aplicar em {slot}" if offset_min > 0 else f"Hora de aplicar ({slot})"
                        ),
                        "icon": "/icons/icon-192x192.png",
                        "badge": "/icons/badge-mono.png",

                        "image": "/brand/notification-banner.png",
                        "tag": f"petmol-med-{event.id}-{today.isoformat()}-{slot}",
                        "data": {"url": f"/home?modal=medication&petId={event.pet_id}&eventId={event.id}&itemName={item_name_encoded}"},
                        "requireInteraction": True,
                        "autoCloseMs": 0,
                    }

                    ok = _send_push(sub, payload)
                    if not ok:
                        subscriptions.pop(str(event.user_id), None)
                        _save_subscriptions(subscriptions)
                        break
        finally:
            db.close()
    except Exception as e:
        logger.error(f"send_medication_pushes erro: {e}")


def send_care_pushes() -> None:
    """Daily at 08:00 BRT — sends pushes ONLY when something is overdue/today OR
    when today is exactly the tutor-configured advance reminder day.

    Rules:
    - Overdue (days_left < 0): push every day at 08:00 until resolved
    - Today (days_left == 0): push at 08:00
    - Advance reminder (days_left > 0): push only when days_left == alert_days_before
      (or reminder_days_before for grooming). No generic X-day window.

    Applies latest-by-type rule: only the most recent record per type per pet drives urgency.
    Dedup: tag includes pet_id + category + type + today_date → one push per item per day.
    """
    from datetime import timezone

    brt = timezone(timedelta(hours=-3))
    now = datetime.now(brt)
    if now.hour != 9 or now.minute != 0:
        return

    today = now.date()
    today_str = today.isoformat()

    subscriptions = _load_subscriptions()
    if not subscriptions:
        return

    user_ids = list(subscriptions.keys())

    try:
        db = SessionLocal()
        try:
            from ..pets.models import Pet
            from ..pets.vaccine_models import VaccineRecord
            from ..pets.parasite_models import ParasiteControlRecord
            from ..pets.grooming_models import GroomingRecord

            pets = db.query(Pet).filter(Pet.user_id.in_(user_ids)).all()

            for pet in pets:
                sub = subscriptions.get(str(pet.user_id))
                if not sub:
                    continue

                payloads: list[dict] = []

                # ── Vacinas: latest por grupo canônico ────────────────────────────────
                # Fire when: overdue OR today OR exactly 10 days before due.
                # 10-day advance is fixed (no per-vaccine config needed).
                #
                # Dedup key priority:
                #   1. vaccine_code (canonical e.g. "DOG_RABIES") — avoids name-variant splits
                #   2. Normalised vaccine_name — strips "(Múltipla)", "anual", etc. so
                #      "V10", "V10 (Múltipla)", "V10 anual" collapse to the same group.
                _VACCINE_ADVANCE_DAYS = 10
                import re as _re_v, unicodedata as _ud_v

                def _vgroup_key(vr) -> str:
                    if getattr(vr, "vaccine_code", None):
                        return vr.vaccine_code
                    n = (getattr(vr, "vaccine_name", None) or getattr(vr, "vaccine_type", None) or "").lower().strip()
                    n = "".join(c for c in _ud_v.normalize("NFD", n) if _ud_v.category(c) != "Mn")
                    n = _re_v.sub(r"\(.*?\)", "", n)
                    n = _re_v.sub(r"\b(anual|annual|booster|reforco|dose\s*\d+|\d+[a]\s*dose)\b", "", n)
                    n = _re_v.sub(r"[-\u2013\u2014]", " ", n)
                    return _re_v.sub(r"\s+", " ", n).strip()

                vaccines = db.query(VaccineRecord).filter(
                    VaccineRecord.pet_id == pet.id,
                    VaccineRecord.deleted == False,
                ).all()
                _latest_v: dict = {}
                for v in vaccines:
                    key = _vgroup_key(v)
                    prev = _latest_v.get(key)
                    if not prev or v.applied_date > prev.applied_date:
                        _latest_v[key] = v
                for key, v in _latest_v.items():
                    if not v.next_dose_date:
                        continue
                    due = v.next_dose_date.astimezone(brt).date() if hasattr(v.next_dose_date, "astimezone") else v.next_dose_date.date()
                    days_left = (due - today).days
                    # Skip if future AND not the exact 10-day advance window
                    if days_left > 0 and days_left != _VACCINE_ADVANCE_DAYS:
                        continue
                    if days_left < 0:
                        title = f"💉 {pet.name} — vacina atrasada"
                        body = f"Vacina {v.vaccine_name} venceu há {abs(days_left)} dia{'s' if abs(days_left) != 1 else ''}"
                    elif days_left == 0:
                        title = f"💉 {pet.name} — vacina vence hoje"
                        body = f"Hoje vence a vacina {v.vaccine_name}"
                    else:
                        title = f"💉 {pet.name} — reforço de vacina em breve"
                        body = f"Vacina {v.vaccine_name} vence em {days_left} dias — agende o reforço"
                    from urllib.parse import quote as _quote
                    _vname = _quote(v.vaccine_name or "")
                    payloads.append({
                        "title": title,
                        "body": body,
                        "icon": "/icons/icon-192x192.png",
                        "badge": "/icons/badge-mono.png",

                        "image": "/brand/notification-banner.png",
                        "tag": f"petmol-care-vaccine-{pet.id}-{key}-{today_str}",
                        "data": {"url": f"/home?modal=vaccines&petId={pet.id}&itemName={_vname}&buy=1"},
                        "requireInteraction": True,
                        "autoCloseMs": 0,
                    })

                # ── Antiparasitários: latest por type ─────────────────────────────────
                # Fire when: overdue OR today OR days_left == alert_days_before (tutor-set).
                parasite_type_labels: dict[str, str] = {
                    "flea_tick": "Antipulgas",
                    "dewormer": "Vermífugo",
                    "collar": "Coleira antiparasitária",
                    "heartworm": "Antiparasitário cardíaco",
                    "leishmaniasis": "Leishmaniose",
                }
                parasites = db.query(ParasiteControlRecord).filter(
                    ParasiteControlRecord.pet_id == pet.id,
                    ParasiteControlRecord.deleted == False,
                ).all()
                _latest_p: dict = {}
                for c in parasites:
                    key = (c.type or "").lower().strip()
                    prev = _latest_p.get(key)
                    if not prev or c.date_applied > prev.date_applied:
                        _latest_p[key] = c
                for key, c in _latest_p.items():
                    if not c.next_due_date:
                        continue
                    due = c.next_due_date.astimezone(brt).date() if hasattr(c.next_due_date, "astimezone") else c.next_due_date.date()
                    days_left = (due - today).days
                    advance = c.alert_days_before or c.reminder_days or 0
                    # Fire if overdue/today OR on the exact advance-reminder day
                    if days_left > 0 and days_left != advance:
                        continue
                    label = parasite_type_labels.get(key) or c.product_name or key
                    if days_left < 0:
                        body = f"{label} venceu há {abs(days_left)} dia{'s' if abs(days_left) != 1 else ''}"
                    elif days_left == 0:
                        body = f"Hoje vence o {label.lower()} de {pet.name}"
                    else:
                        body = f"{label} de {pet.name} vence em {days_left} dia{'s' if days_left != 1 else ''} — hora de comprar"
                    from urllib.parse import quote as _pquote
                    _plabel = _pquote(label or "")
                    _pmodal = _parasite_modal_for_type(key)
                    payloads.append({
                        "title": f"🛡️ {pet.name}" + (" — atrasado" if days_left < 0 else ""),
                        "body": body,
                        "icon": "/icons/icon-192x192.png",
                        "badge": "/icons/badge-mono.png",

                        "image": "/brand/notification-banner.png",
                        "tag": f"petmol-care-parasite-{pet.id}-{key}-{today_str}",
                        "data": {"url": f"/home?modal={_pmodal}&petId={pet.id}&itemName={_plabel}&buy=1"},
                        "requireInteraction": True,
                        "autoCloseMs": 0,
                    })

                # ── Banho/Tosa: latest por type ───────────────────────────────────────
                # Fire when: overdue OR today OR days_left == reminder_days_before (tutor-set).
                groom_type_labels: dict[str, str] = {
                    "bath": "Banho",
                    "grooming": "Tosa",
                    "bath_grooming": "Banho & Tosa",
                }
                groomings = db.query(GroomingRecord).filter(
                    GroomingRecord.pet_id == pet.id,
                    GroomingRecord.deleted == False,
                    GroomingRecord.reminder_enabled == True,
                ).all()
                _latest_g: dict = {}
                for r in groomings:
                    key = (r.type or "").lower().strip()
                    prev = _latest_g.get(key)
                    if not prev or r.date > prev.date:
                        _latest_g[key] = r
                for key, r in _latest_g.items():
                    if not r.next_recommended_date:
                        continue
                    due = r.next_recommended_date.astimezone(brt).date() if hasattr(r.next_recommended_date, "astimezone") else r.next_recommended_date.date()
                    days_left = (due - today).days
                    advance = r.reminder_days_before or r.alert_days_before or 0
                    # Fire if overdue/today OR on the exact advance-reminder day
                    if days_left > 0 and days_left != advance:
                        continue
                    label = groom_type_labels.get(key, key)
                    if days_left < 0:
                        body = f"{label} de {pet.name} está em atraso há {abs(days_left)} dia{'s' if abs(days_left) != 1 else ''}"
                    elif days_left == 0:
                        body = f"Hoje é dia de {label.lower()} para {pet.name}"
                    else:
                        body = f"{label} de {pet.name} em {days_left} dia{'s' if days_left != 1 else ''} — hora de agendar"
                    from urllib.parse import quote as _gquote
                    _glabel = _gquote(label or "")
                    payloads.append({
                        "title": f"🛁 {pet.name}" + (" — atrasado" if days_left < 0 else ""),
                        "body": body,
                        "icon": "/icons/icon-192x192.png",
                        "badge": "/icons/badge-mono.png",

                        "image": "/brand/notification-banner.png",
                        "tag": f"petmol-care-grooming-{pet.id}-{key}-{today_str}",
                        "data": {"url": f"/home?modal=grooming&petId={pet.id}&itemName={_glabel}"},
                        "requireInteraction": False,
                        "autoCloseMs": 4000,
                    })

                # ── Enviar tudo para este pet ─────────────────────────────────────────
                for payload in payloads:
                    ok = _send_push(sub, payload)
                    if not ok:
                        subscriptions.pop(str(pet.user_id), None)
                        _save_subscriptions(subscriptions)
                        break  # subscription expired — skip remaining pushes for this user
                    else:
                        logger.info(f"Push cuidado enviado: {payload['tag']}")

        finally:
            db.close()
    except Exception as e:
        logger.error(f"send_care_pushes erro: {e}")


@router.get("/vapid-public-key")
def get_vapid_public_key():
    """Return VAPID public key for frontend push subscription."""
    settings = get_settings()
    if not settings.vapid_public_key:
        raise HTTPException(status_code=503, detail="Push nao configurado")
    return {"publicKey": settings.vapid_public_key}


@router.post("/subscribe")
async def subscribe_to_push(
    request: SubscriptionRequest,
    current_user: User = Depends(get_current_user),
):
    sub = request.subscription
    endpoint = sub.get("endpoint")
    keys = sub.get("keys", {})
    p256dh = keys.get("p256dh")
    auth = keys.get("auth")
    if not all([endpoint, p256dh, auth]):
        raise HTTPException(status_code=400, detail="Subscription invalida")
    subscriptions = _load_subscriptions()
    subscriptions[str(current_user.id)] = {"endpoint": endpoint, "p256dh": p256dh, "auth": auth}
    _save_subscriptions(subscriptions)
    return {"success": True}


@router.delete("/subscribe")
async def unsubscribe_from_push(current_user: User = Depends(get_current_user)):
    subscriptions = _load_subscriptions()
    subscriptions.pop(str(current_user.id), None)
    _save_subscriptions(subscriptions)
    return {"success": True}


@router.post("/test")
async def send_test_notification(current_user: User = Depends(get_current_user)):
    """Send a test push to the current user (useful during setup)."""
    subscriptions = _load_subscriptions()
    sub = subscriptions.get(str(current_user.id))
    if not sub:
        raise HTTPException(status_code=404, detail="Nenhuma subscription encontrada")
    payload = {
        "title": "Teste PETMOL",
        "body": "Push funcionando! Clique para abrir os lembretes.",
        "icon": "/icons/icon-192x192.png",
        "badge": "/icons/badge-mono.png",

        "image": "/brand/notification-banner.png",
        "tag": "petmol-test",
        "data": {"url": "/home"},
        "requireInteraction": False,
        "autoCloseMs": 4000,
    }
    ok = _send_push(sub, payload)
    if not ok:
        subscriptions.pop(str(current_user.id), None)
        _save_subscriptions(subscriptions)
        raise HTTPException(status_code=410, detail="Subscription expirada")
    return {"success": True, "message": "Notificacao de teste enviada"}


@router.post("/send")
async def send_notification(
    request: SendNotificationRequest,
    current_user: User = Depends(get_current_user),
):
    """Envia push para o dispositivo assinado do usuário atual."""
    subscriptions = _load_subscriptions()
    sub = subscriptions.get(str(current_user.id))
    if not sub:
        return {"success": False, "reason": "no_subscription"}
    payload = {
        "title": request.title,
        "body": request.body,
        "icon": request.icon or "/icons/icon-192x192.png",
        "badge": "/icons/badge-mono.png",

        "image": "/brand/notification-banner.png",
        "tag": request.tag or "petmol",
        "data": {"url": request.url or "/home"},
        "requireInteraction": True,
        "autoCloseMs": 0,
    }
    ok = _send_push(sub, payload)
    if not ok:
        subscriptions.pop(str(current_user.id), None)
        _save_subscriptions(subscriptions)
    return {"success": ok}


@router.post("/send-on-open")
async def send_on_open(current_user: User = Depends(get_current_user)):
    """Chamado quando o usuário abre o app. Envia push para cada item VENCIDO (não apenas hoje).
    Cooldown de 1 hora por usuário para evitar spam.
    Retorna {"sent": N} com quantos pushs foram disparados."""
    from datetime import timezone
    import re as _re
    import unicodedata as _ud

    subscriptions = _load_subscriptions()
    sub = subscriptions.get(str(current_user.id))
    if not sub:
        return {"sent": 0, "reason": "no_subscription"}

    # ── Cooldown: 1 h entre chamadas do mesmo usuário ────────────────────────
    cooldown_key = f"_on_open_last_{current_user.id}"
    subs_meta = _load_subscriptions()
    last_str = subs_meta.get(cooldown_key)
    brt = timezone(timedelta(hours=-3))
    now = datetime.now(brt)
    if last_str:
        try:
            last_dt = datetime.fromisoformat(last_str)
            if (now - last_dt).total_seconds() < 3600:
                return {"sent": 0, "reason": "cooldown"}
        except Exception:
            pass
    # NÃO salvar cooldown ainda — só salva se realmente enviar

    today = now.date()
    payloads: list[dict] = []

    try:
        db = SessionLocal()
        try:
            from ..pets.models import Pet
            from ..pets.vaccine_models import VaccineRecord
            from ..pets.parasite_models import ParasiteControlRecord
            from ..pets.grooming_models import GroomingRecord

            pets = db.query(Pet).filter(Pet.user_id == current_user.id).all()

            for pet in pets:
                # ── Vacinas vencidas ──────────────────────────────────────────
                def _vkey(vr) -> str:
                    if getattr(vr, "vaccine_code", None):
                        return vr.vaccine_code
                    n = (getattr(vr, "vaccine_name", None) or getattr(vr, "vaccine_type", None) or "").lower().strip()
                    n = "".join(c for c in _ud.normalize("NFD", n) if _ud.category(c) != "Mn")
                    n = _re.sub(r"\(.*?\)", "", n)
                    n = _re.sub(r"\b(anual|annual|booster|reforco|dose\s*\d+|\d+[a]\s*dose)\b", "", n)
                    n = _re.sub(r"[-\u2013\u2014]", " ", n)
                    return _re.sub(r"\s+", " ", n).strip()

                vaccines = db.query(VaccineRecord).filter(
                    VaccineRecord.pet_id == pet.id,
                    VaccineRecord.deleted == False,
                ).all()
                _latest_v: dict = {}
                for v in vaccines:
                    k = _vkey(v)
                    prev = _latest_v.get(k)
                    if not prev or v.applied_date > prev.applied_date:
                        _latest_v[k] = v
                for k, v in _latest_v.items():
                    if not v.next_dose_date:
                        continue
                    due = v.next_dose_date.astimezone(brt).date() if hasattr(v.next_dose_date, "astimezone") else v.next_dose_date.date()
                    days_late = (today - due).days
                    if days_late <= 0:
                        continue  # não vencido
                    from urllib.parse import quote as _q
                    payloads.append({
                        "title": f"💉 {pet.name} — vacina em atraso",
                        "body": f"{v.vaccine_name} venceu há {days_late} dia{'s' if days_late != 1 else ''}",
                        "icon": "/icons/icon-192x192.png",
                        "badge": "/icons/badge-mono.png",

                        "image": "/brand/notification-banner.png",
                        "tag": f"petmol-open-vaccine-{pet.id}-{k}",
                        "data": {"url": f"/home?modal=vaccines&petId={pet.id}&itemName={_q(v.vaccine_name or '')}"},
                        "requireInteraction": True,
                        "autoCloseMs": 0,
                    })

                # ── Antiparasitários vencidos ─────────────────────────────────
                parasite_labels = {
                    "flea_tick": "Antipulgas",
                    "dewormer": "Vermífugo",
                    "collar": "Coleira antiparasitária",
                    "heartworm": "Antiparasitário cardíaco",
                    "leishmaniasis": "Leishmaniose",
                }
                parasites = db.query(ParasiteControlRecord).filter(
                    ParasiteControlRecord.pet_id == pet.id,
                    ParasiteControlRecord.deleted == False,
                ).all()
                _latest_p: dict = {}
                for c in parasites:
                    k = (c.type or "").lower().strip()
                    prev = _latest_p.get(k)
                    if not prev or c.date_applied > prev.date_applied:
                        _latest_p[k] = c
                for k, c in _latest_p.items():
                    if not c.next_due_date:
                        continue
                    due = c.next_due_date.astimezone(brt).date() if hasattr(c.next_due_date, "astimezone") else c.next_due_date.date()
                    days_late = (today - due).days
                    if days_late <= 0:
                        continue
                    label = parasite_labels.get(k) or c.product_name or k
                    from urllib.parse import quote as _q2
                    _pmodal = _parasite_modal_for_type(k)
                    payloads.append({
                        "title": f"🛡️ {pet.name} — {label.lower()} em atraso",
                        "body": f"Venceu há {days_late} dia{'s' if days_late != 1 else ''}",
                        "icon": "/icons/icon-192x192.png",
                        "badge": "/icons/badge-mono.png",

                        "image": "/brand/notification-banner.png",
                        "tag": f"petmol-open-parasite-{pet.id}-{k}",
                        "data": {"url": f"/home?modal={_pmodal}&petId={pet.id}&itemName={_q2(label)}"},
                        "requireInteraction": True,
                        "autoCloseMs": 0,
                    })

                # ── Grooming vencido ──────────────────────────────────────────
                groom_labels = {
                    "bath": "Banho",
                    "grooming": "Tosa",
                    "bath_grooming": "Banho & Tosa",
                }
                groomings = db.query(GroomingRecord).filter(
                    GroomingRecord.pet_id == pet.id,
                    GroomingRecord.deleted == False,
                    GroomingRecord.reminder_enabled == True,
                ).all()
                _latest_g: dict = {}
                for r in groomings:
                    gk = (r.type or "").lower().strip()
                    prev = _latest_g.get(gk)
                    if not prev or r.date > prev.date:
                        _latest_g[gk] = r
                for gk, r in _latest_g.items():
                    if not r.next_recommended_date:
                        continue
                    due = r.next_recommended_date.astimezone(brt).date() if hasattr(r.next_recommended_date, "astimezone") else r.next_recommended_date.date()
                    days_late = (today - due).days
                    if days_late <= 0:
                        continue
                    label = groom_labels.get(gk, gk)
                    from urllib.parse import quote as _q3
                    payloads.append({
                        "title": f"🛁 {pet.name} — {label.lower()} em atraso",
                        "body": f"Está em atraso há {days_late} dia{'s' if days_late != 1 else ''}",
                        "icon": "/icons/icon-192x192.png",
                        "badge": "/icons/badge-mono.png",
                        "image": "/brand/notification-banner.png",
                        "tag": f"petmol-open-grooming-{pet.id}-{gk}",
                        "data": {"url": f"/home?modal=grooming&petId={pet.id}&itemName={_q3(label)}"},
                        "requireInteraction": True,
                        "autoCloseMs": 0,
                    })

        finally:
            db.close()
    except Exception as e:
        logger.error(f"send_on_open erro: {e}")
        return {"sent": 0, "reason": "error"}

    if not payloads:
        return {"sent": 0, "reason": "nothing_overdue", "overdue": []}

    overdue_items = [
        {"title": p["title"], "body": p["body"], "url": p["data"]["url"]}
        for p in payloads
    ]

    sent = 0
    for payload in payloads:
        ok = _send_push(sub, payload)
        if not ok:
            subscriptions.pop(str(current_user.id), None)
            _save_subscriptions(subscriptions)
            break
        sent += 1
        logger.warning(f"[on_open] Push enviado: {payload['tag']}")

    # Salva cooldown só se processou (com ou sem pushes enviados)
    subs_meta[cooldown_key] = now.isoformat()
    _save_subscriptions(subs_meta)

    return {"sent": sent, "overdue": overdue_items}
