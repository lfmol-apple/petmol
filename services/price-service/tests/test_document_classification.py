from pathlib import Path
import sys


SERVICE_DIR = Path(__file__).resolve().parents[1]

if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

from src.pets import document_router


def test_document_ai_classify_enabled_defaults_to_api_key(monkeypatch):
    monkeypatch.delenv("DOCUMENT_AI_CLASSIFY_ENABLED", raising=False)

    assert document_router._document_ai_classify_enabled("secret") is True
    assert document_router._document_ai_classify_enabled(None) is False


def test_document_ai_classify_enabled_respects_explicit_disable(monkeypatch):
    monkeypatch.setenv("DOCUMENT_AI_CLASSIFY_ENABLED", "false")

    assert document_router._document_ai_classify_enabled("secret") is False


def test_local_image_classification_uses_ocr_text(monkeypatch):
    monkeypatch.setattr(
        document_router,
        "_extract_image_text",
        lambda _content: "Receituário veterinário\nAdministrar 1 comprimido a cada 12 horas\nCRMV",
    )

    category, doc_date, establishment = document_router._classify_local(
        b"image-bytes",
        "image/jpeg",
        "IMG_001.jpg",
    )

    assert category == "prescription"
    assert doc_date is None
    assert establishment == "Receituário veterinário"
