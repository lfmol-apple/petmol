"""Family push notification utilities."""
import logging
from sqlalchemy.orm import Session

from ..notifications import _load_subscriptions, _send_push, _save_subscriptions

logger = logging.getLogger(__name__)


def get_family_user_ids_for_pet(pet_id: str, actor_user_id: str, db: Session):
    """Return all user IDs that share access to a pet (owner + family members), excluding the actor."""
    from ..pets.models import Pet
    from .models import FamilyGroup, FamilyMember

    pet = db.query(Pet).filter(Pet.id == pet_id).first()
    if not pet:
        return []

    owner_id = pet.user_id
    all_user_ids: set[str] = {owner_id}

    # Find groups owned by the pet's owner — get all member user_ids
    groups = db.query(FamilyGroup).filter(FamilyGroup.owner_id == owner_id).all()
    for group in groups:
        for member in group.members:
            all_user_ids.add(member.user_id)

    # Also: if the actor is a member (not the owner), find the owner's other members
    # (already covered above since we start from pet.user_id = owner_id)

    # Exclude the actor themselves
    all_user_ids.discard(actor_user_id)
    return list(all_user_ids)


def send_family_push(
    pet_id: str,
    actor_user_id: str,
    payload: dict,
    db: Session,
) -> None:
    """Send push notification to all family members of a pet except the actor."""
    recipients = get_family_user_ids_for_pet(pet_id, actor_user_id, db)
    if not recipients:
        return

    subscriptions = _load_subscriptions()
    expired = []

    for uid in recipients:
        sub = subscriptions.get(uid)
        if not sub:
            continue
        ok = _send_push(sub, payload)
        if not ok:
            expired.append(uid)
            logger.info(f"Subscription expirada removida: {uid}")

    if expired:
        for uid in expired:
            subscriptions.pop(uid, None)
        _save_subscriptions(subscriptions)
        logger.info(f"Family push enviado para {len(recipients) - len(expired)} dispositivo(s)")
