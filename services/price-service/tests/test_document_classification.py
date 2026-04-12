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

    classification = document_router._classify_local(
        b"image-bytes",
        "image/jpeg",
        "IMG_001.jpg",
    )

    assert classification.category == "prescription"
    assert classification.document_date is None
    assert classification.establishment == "Receituário veterinário"
    assert classification.suggested_title == "Receita veterinária"


def test_local_image_classification_identifies_ultrasound_date_and_place(monkeypatch):
    monkeypatch.setattr(
        document_router,
        "_extract_image_text",
        lambda _content: (
            "Hospital Veterinário São Lucas\n"
            "Laudo ultrassonográfico abdominal\n"
            "Data do exame: 11/04/2026\n"
            "Conclusão: alterações compatíveis com gastrite."
        ),
    )

    classification = document_router._classify_local(
        b"image-bytes",
        "image/jpeg",
        "scan.jpg",
    )

    assert classification.category == "exam"
    assert classification.suggested_title == "Ultrassonografia"
    assert classification.document_date.isoformat() == "2026-04-11"
    assert classification.establishment == "Hospital Veterinário São Lucas"
