from datetime import date, datetime, timezone
from pathlib import Path
from types import SimpleNamespace
import sys


SERVICE_DIR = Path(__file__).resolve().parents[1]

if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

from src.notifications import send_food_reminder_pushes  # noqa: E402
import src.notifications as notifications  # noqa: E402


class FrozenDateTime(datetime):
    @classmethod
    def now(cls, tz=None):
        # 14:00 UTC -> 11:00 BRT (UTC-3)
        base = cls(2026, 4, 22, 14, 0, tzinfo=timezone.utc)
        return base.astimezone(tz) if tz is not None else base


class FakeQuery:
    def __init__(self, rows):
        self._rows = rows

    def filter(self, *_args, **_kwargs):
        return self

    def all(self):
        return list(self._rows)

    def first(self):
        return self._rows[0] if self._rows else None


class FakeSession:
    def __init__(self, mapping):
        self._mapping = mapping
        self.commit_calls = 0

    def query(self, model):
        return FakeQuery(self._mapping.get(model.__name__, []))

    def commit(self):
        self.commit_calls += 1

    def close(self):
        return None


def test_send_food_pushes_includes_manual_duration_mode(monkeypatch):
    plan = SimpleNamespace(
        id="plan-1",
        pet_id="pet-1",
        next_reminder_date=date(2026, 4, 22),
        enabled=True,
        no_consumption_control=True,   # manual/duration mode
        deleted_at=None,
        last_food_push_date=None,
        estimated_end_date=None,
        next_purchase_date=date(2026, 4, 24),
        food_brand="Ração X",
    )
    pet = SimpleNamespace(id="pet-1", user_id="user-1", name="Thor")
    fake_session = FakeSession({"FeedingPlan": [plan], "Pet": [pet]})
    sent_payloads = []

    monkeypatch.setattr(notifications, "datetime", FrozenDateTime)
    monkeypatch.setattr(
        notifications,
        "_load_subscriptions",
        lambda: {"user-1": {"endpoint": "https://example.test/push", "p256dh": "k", "auth": "a"}},
    )
    monkeypatch.setattr(notifications, "SessionLocal", lambda: fake_session)
    monkeypatch.setattr(notifications, "_has_active_blocker", lambda *_args, **_kwargs: False)
    monkeypatch.setattr(notifications, "_upsert_pend", lambda **_kwargs: None)
    monkeypatch.setattr(notifications, "_save_subscriptions", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        notifications,
        "_send_push",
        lambda subscription, payload: sent_payloads.append((subscription, payload)) or True,
    )

    send_food_reminder_pushes()

    assert len(sent_payloads) == 1
    _subscription, payload = sent_payloads[0]
    assert payload["data"]["url"] == "/home?modal=food&petId=pet-1&action=buy"
    assert payload["tag"] == "petmol-food-pet-1-2026-04-22"
    assert fake_session.commit_calls == 1
    assert plan.last_food_push_date == date(2026, 4, 22)


def test_send_food_pushes_respects_daily_dedup(monkeypatch):
    plan = SimpleNamespace(
        id="plan-2",
        pet_id="pet-2",
        next_reminder_date=date(2026, 4, 22),
        enabled=True,
        no_consumption_control=False,
        deleted_at=None,
        last_food_push_date=date(2026, 4, 22),  # already sent today
        estimated_end_date=date(2026, 4, 20),
        next_purchase_date=None,
        food_brand="Ração Y",
    )
    pet = SimpleNamespace(id="pet-2", user_id="user-2", name="Luna")
    fake_session = FakeSession({"FeedingPlan": [plan], "Pet": [pet]})
    sent_payloads = []

    monkeypatch.setattr(notifications, "datetime", FrozenDateTime)
    monkeypatch.setattr(
        notifications,
        "_load_subscriptions",
        lambda: {"user-2": {"endpoint": "https://example.test/push", "p256dh": "k", "auth": "a"}},
    )
    monkeypatch.setattr(notifications, "SessionLocal", lambda: fake_session)
    monkeypatch.setattr(notifications, "_has_active_blocker", lambda *_args, **_kwargs: False)
    monkeypatch.setattr(notifications, "_upsert_pend", lambda **_kwargs: None)
    monkeypatch.setattr(notifications, "_save_subscriptions", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        notifications,
        "_send_push",
        lambda subscription, payload: sent_payloads.append((subscription, payload)) or True,
    )

    send_food_reminder_pushes()

    assert sent_payloads == []
    assert fake_session.commit_calls == 0

