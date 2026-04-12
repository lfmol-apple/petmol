"""Endpoints para cofre documental de pets."""
from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
import os
import re
import uuid
import zipfile
from datetime import date as date_type
from pathlib import Path
from typing import Optional
from urllib.parse import urljoin, urlparse, urlunparse

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..user_auth.deps import get_current_user
from ..user_auth.models import User
from .document_models import PetDocument, PetDocumentImport
from .document_schemas import (
    AddLinkRequest,
    DiscoveredItem,
    ImportItemsRequest,
    ImportLinkRequest,
    ImportLinkResponse,
    PetDocumentOut,
)
from .models import Pet

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Pet Documents"])


# ── Category → Event type mapping ────────────────────────────────────────────
_CATEGORY_TO_EVENT_TYPE = {
    "exam":         "vet_appointment",
    "vaccine":      "vaccine",
    "prescription": "medication",
    "report":       "vet_appointment",
    "photo":        "other",
    "other":        "other",
}


def _maybe_create_timeline_event(
    db, doc: PetDocument, user_id: str, create_timeline_event: bool
) -> None:
    """Se create_timeline_event=True, cria evento na tabela events e vincula ao doc."""
    if not create_timeline_event:
        return
    try:
        from ..events.models import Event
        from datetime import datetime, timezone
        import json

        event_type = _CATEGORY_TO_EVENT_TYPE.get(doc.category or "other", "other")
        occurred_at = (
            datetime.combine(doc.document_date, datetime.min.time()).replace(tzinfo=timezone.utc)
            if doc.document_date
            else datetime.now(timezone.utc)
        )
        event = Event(
            user_id=user_id,
            pet_id=doc.pet_id,
            type=event_type,
            status="completed",
            scheduled_at=occurred_at,
            completed_at=occurred_at,
            title=doc.title or doc.category or "Documento",
            notes=doc.notes,
            source="document",
            extra_data=json.dumps({"document_id": doc.id}, ensure_ascii=False),
        )
        db.add(event)
        db.flush()  # get event.id
        doc.event_id = event.id
        # no commit here — caller commits
    except Exception as exc:
        logger.warning("[doc_router] _maybe_create_timeline_event failed: %s", exc)

# ── Storage ──────────────────────────────────────────────────────────────────
# Absolute path: resolve relative to project root (2 levels up from src/pets/)
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DOCS_UPLOAD_DIR = _PROJECT_ROOT / "uploads" / "pet_documents"
MAX_FILE_SIZE = 20 * 1024 * 1024   # 20 MB  – individual files / files inside ZIP
MAX_ZIP_SIZE  = 100 * 1024 * 1024  # 100 MB – whole ZIP archive

# ── Limits ────────────────────────────────────────────────────────────────────
IMPORT_MAX_ITEMS = 200
IMPORT_TIMEOUT = 60.0


# ── Auth helper ──────────────────────────────────────────────────────────────

def _get_pet_or_404(db: Session, user_id: str, pet_id: str) -> Pet:
    pet = db.query(Pet).filter(Pet.id == pet_id, Pet.user_id == user_id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="Pet não encontrado")
    return pet


# ── URL masking ───────────────────────────────────────────────────────────────

def _mask_token_value(val: str) -> str:
    """Mantém primeiros 6 e últimos 4 chars; oculta o meio."""
    if len(val) <= 10:
        return "***"
    return f"{val[:6]}...{val[-4:]}"


def _mask_url(url: str) -> str:
    """
    Substitui valores de parâmetros sensíveis mantendo os 6+4 chars visíveis.
    NUNCA loga a URL completa.
    """
    try:
        parsed = urlparse(url)

        def _replace(m: re.Match) -> str:
            return f"{m.group(1)}={_mask_token_value(m.group(2))}"

        masked_qs = re.sub(
            r"(access_token|token|key|secret|auth|api_key|apikey|senha|password)=([^&]*)",
            _replace,
            parsed.query,
            flags=re.IGNORECASE,
        )
        return urlunparse(parsed._replace(query=masked_qs))
    except Exception:
        return "[url mascarada]"


# ── Provider detection ────────────────────────────────────────────────────────

def _detect_provider(url: str) -> str:
    try:
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()
        path = parsed.path or ""
        if "max.cfaz.net" in host and "/requests_with_token/" in path:
            return "cfaz_max"
    except Exception:
        pass
    return "generic"


# ── HTML parsers ─────────────────────────────────────────────────────────────

def _discover_cfaz_max(html: str, base_url: str) -> list[dict]:
    """
    Parser específico para max.cfaz.net.
    Estratégia 1: localiza <a> cujo texto contém 'Baixar PDF' ou 'Baixar jpg/imagem'.
    Estratégia 2: fallback — qualquer href com extensão de arquivo.
    """
    found: list[dict] = []
    seen: set[str] = set()

    href_pat = re.compile(r'href=["\']([^"\']+)["\']', re.IGNORECASE)
    anchor_pat = re.compile(r'<a\b([^>]*)>([\s\S]{0,200}?)</a>', re.IGNORECASE)

    for m in anchor_pat.finditer(html):
        tag_attrs = m.group(1)
        tag_text = re.sub(r'<[^>]+>', '', m.group(2)).strip()
        low = tag_text.lower()

        is_pdf = "baixar" in low and "pdf" in low
        is_img = "baixar" in low and any(w in low for w in ("jpg", "jpeg", "imagem", "foto", "png", "image"))

        if not (is_pdf or is_img):
            continue

        href_m = href_pat.search(tag_attrs)
        if not href_m:
            continue

        full_url = urljoin(base_url, href_m.group(1))
        if full_url in seen:
            continue
        seen.add(full_url)

        kind = "pdf" if is_pdf else "jpg"
        found.append({
            "url_real": full_url,
            "url_masked": _mask_url(full_url),
            "title": tag_text[:80] or f"Documento.{kind}",
            "kind": kind,
        })

    if found:
        return found

    return _discover_generic(html, base_url)


def _discover_generic(html: str, base_url: str) -> list[dict]:
    """Extrai links para PDF/imagens de qualquer HTML."""
    found: list[dict] = []
    seen: set[str] = set()

    ext_pattern = re.compile(
        r'href=["\']([^"\']+\.(?:pdf|jpg|jpeg|png|webp)(?:\?[^"\']*)?)["\']',
        re.IGNORECASE,
    )
    baixar_pattern = re.compile(
        r'<a\b([^>]*)>([\s\S]{0,100}?(?:baixar|download)[^<]{0,60})</a>',
        re.IGNORECASE,
    )
    href_pat = re.compile(r'href=["\']([^"\']+)["\']', re.IGNORECASE)

    for m in ext_pattern.finditer(html):
        full_url = urljoin(base_url, m.group(1))
        if full_url in seen:
            continue
        seen.add(full_url)
        ext = Path(urlparse(full_url).path).suffix.lower().lstrip(".")
        kind = "pdf" if ext == "pdf" else "jpg"
        title = Path(urlparse(full_url).path).name[:80] or "Documento"
        found.append({"url_real": full_url, "url_masked": _mask_url(full_url), "title": title, "kind": kind})

    for m in baixar_pattern.finditer(html):
        tag_attrs = m.group(1)
        tag_text = re.sub(r'<[^>]+>', '', m.group(2)).strip()
        href_m = href_pat.search(tag_attrs)
        if not href_m:
            continue
        full_url = urljoin(base_url, href_m.group(1))
        if full_url in seen:
            continue
        seen.add(full_url)
        ext = Path(urlparse(full_url).path).suffix.lower().lstrip(".")
        kind = "pdf" if ext == "pdf" else "file"
        found.append({"url_real": full_url, "url_masked": _mask_url(full_url), "title": tag_text[:80] or "Documento", "kind": kind})

    return found


# ── Storage helpers ───────────────────────────────────────────────────────────

def _save_bytes_to_disk(content: bytes, filename: str) -> str:
    DOCS_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = f"{uuid.uuid4().hex}_{Path(filename).name}"
    filepath = DOCS_UPLOAD_DIR / safe_name
    with open(filepath, "wb") as f:
        f.write(content)
    # Salvar apenas o nome do arquivo (sem path absoluto) para portabilidade entre ambientes
    return safe_name


def _ext_from_mime(mime: str) -> str:
    return {
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "application/pdf": ".pdf",
    }.get(mime, ".bin")


def _detect_category_from_mime(mime: str) -> str:
    return "photo" if (mime and mime.startswith("image/")) else "other"


# ── Category classifier ───────────────────────────────────────────────────────
#
# Ordem de prioridade: keywords no nome > extensão
_CAT_KEYWORDS: list[tuple[str, list[str]]] = [
    ("vaccine",      ["vacin", "vacc", "carteira", "imuniza", "antirabic", "antirrábic"]),
    ("prescription", ["receita", "prescri", "recipe", "dr_", "dr.", "antibiot", "medic"]),
    ("exam",         ["exame", "exam", "hemogram", "sangue", "urina", "fezes", "ultras",
                      "raio", "xray", "x-ray", "ecocard", "laborat", "result", "colest"]),
    ("report",       ["laudo", "report", "histopatol", "biopsia", "labocat", "atestado",
                      "certif", "declarac"]),
    ("photo",        ["foto", "photo", "image", "imagem", "pic_", "pic.", "retrato"]),
]

_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tiff", ".tif", ".heic"}
_PDF_EXT   = ".pdf"
_DOC_EXTS  = {".doc", ".docx", ".odt", ".rtf", ".txt"}
_SKIP_EXTS = {".ds_store", ".thumbs.db", ".ithmb"}


def _category_from_filename(name: str) -> str:
    """Classifica categoria pelo nome/extensão do arquivo."""
    low = name.lower().replace("-", "_").replace(" ", "_")
    for category, keywords in _CAT_KEYWORDS:
        if any(kw in low for kw in keywords):
            return category
    # Fallback por extensão
    ext = Path(name).suffix.lower()
    if ext in _IMAGE_EXTS:
        return "photo"
    if ext in _DOC_EXTS:
        return "report"
    return "other"


# ── Content-based classification (IA simples) ─────────────────────────────────

# Palavras-chave adicionais para análise de conteúdo do documento
# (mais abrangentes que o nome do arquivo)
_CONTENT_KEYWORDS: list[tuple[str, list[str]]] = [
    ("vaccine", [
        "vacina", "vacinação", "vaccine", "imunização", "dose aplicada",
        "próxima dose", "lote:", "via subcutânea", "via intramuscular",
        "antirrábica", "v8", "v10", "tricat", "leucofelina", "giárdia",
        "título vacinal", "sorologia",
    ]),
    ("prescription", [
        "receituário", "receita veterinária", "prescrição", "posologia",
        "dose:", "mg/kg", "ml/dia", "antibiótico", "antiparasitário",
        "aplicar", "administrar", "por via oral", "semanalmente",
        "nome do animal", "proprietário:", "tutor:", "medicamento",
        "comprimido", "injetável", "crmv", "médico veterinário",
    ]),
    ("exam", [
        "hemograma", "leucócitos", "eritrócitos", "plaquetas", "hematócrito",
        "hemoglobina", "colesterol", "triglicérides", "glicose", "creatinina",
        "ureia", "alt", "ast", "bilirrubina", "proteína total", "albumina",
        "exame de urina", "urocultura", "antibiograma", "parasitologia",
        "ultrassonografia", "ultrassom", "radiografia", "ecocardiograma",
        "tomografia", "ressonância", "endoscopia", "bioquímica sérica",
        "valor de referência", "resultado:", "laudo laboratorial",
    ]),
    ("report", [
        "laudo", "histopatológico", "histopatologia", "biópsia", "citologia",
        "anatomia patológica", "patologia", "atestado de saúde", "atestado",
        "declaração", "certificado", "conclusão:", "diagnóstico:",
        "macroscopia:", "microscopia:", "impressão diagnóstica",
    ]),
    ("other", [
        "nota fiscal", "nf-e", "comprovante", "orçamento", "fatura",
        "recibo", "pagamento", "valor total", "consulta", "serviço prestado",
        "honorários", "pet shop",
    ]),
]

# Regex para detectar datas comuns em documentos brasileiros
_DATE_PATTERNS = [
    re.compile(r'\b(\d{2})/(\d{2})/(\d{4})\b'),   # DD/MM/AAAA
    re.compile(r'\b(\d{2})-(\d{2})-(\d{4})\b'),   # DD-MM-AAAA
    re.compile(r'\b(\d{4})-(\d{2})-(\d{2})\b'),   # AAAA-MM-DD
]

_MONTH_PT = {
    "janeiro": "01", "fevereiro": "02", "março": "03",  "marco": "03",
    "abril": "04",   "maio": "05",      "junho": "06",
    "julho": "07",   "agosto": "08",    "setembro": "09",
    "outubro": "10", "novembro": "11",  "dezembro": "12",
}
_DATE_TEXT_RE = re.compile(
    r'\b(\d{1,2})\s+de\s+(' + '|'.join(_MONTH_PT) + r')\s+de\s+(\d{4})\b',
    re.IGNORECASE,
)


def _extract_pdf_text(content: bytes) -> str:
    """Extrai texto de um PDF usando pypdf. Retorna string vazia se falhar."""
    try:
        import pypdf  # lazy import
        reader = pypdf.PdfReader(io.BytesIO(content))
        parts = []
        for page in reader.pages[:8]:  # máx 8 páginas para performance
            try:
                parts.append(page.extract_text() or "")
            except Exception:
                pass
        return "\n".join(parts)
    except Exception:
        return ""


def _extract_image_text(content: bytes) -> str:
    """Extrai texto de imagens via Tesseract quando disponível."""
    try:
        from PIL import Image, ImageFilter, ImageOps
        import pytesseract

        img = Image.open(io.BytesIO(content))
        img = ImageOps.exif_transpose(img)
        img = img.convert("L")
        img = ImageOps.autocontrast(img)
        img = img.filter(ImageFilter.MedianFilter(size=3))
        img = img.resize((img.size[0] * 2, img.size[1] * 2))

        text = pytesseract.image_to_string(img, lang="por+eng", config="--psm 6")
        return "\n".join(line.strip() for line in text.splitlines() if line.strip())
    except Exception as exc:
        logger.info("[document-classify] image OCR unavailable/failed: %s", exc)
        return ""


def _extract_establishment_name(text: str) -> str | None:
    """
    Extrai o nome do estabelecimento do cabeçalho OU rodapé do documento.
    Estratégia:
      1. CNPJ próximo → linha anterior é o nome
      2. Palavras-chave de estabelecimento (cabeçalho + rodapé)
      3. Primeira linha não-trivial do cabeçalho (heurística de título)
    """
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    if not lines:
        return None

    # ── Estratégia 1: linha antes do CNPJ ─────────────────────────────────
    _CNPJ_LINE = re.compile(r"CNPJ[\s:.\-]*\d", re.IGNORECASE)
    for i, line in enumerate(lines[:30]):          # checar primeiras 30 linhas
        if _CNPJ_LINE.search(line):
            # a própria linha pode ter "Nome – CNPJ XX.XXX..."
            before = re.split(r"CNPJ", line, flags=re.IGNORECASE)[0].strip(" -–|•")
            if len(before) > 4:
                return before[:120]
            # ou linha anterior
            if i > 0:
                candidate = lines[i - 1].strip(" -–|•")
                if 4 < len(candidate) < 120:
                    return candidate
    # também checar rodapé
    for i, line in enumerate(lines[-15:]):
        if _CNPJ_LINE.search(line):
            before = re.split(r"CNPJ", line, flags=re.IGNORECASE)[0].strip(" -–|•")
            if len(before) > 4:
                return before[:120]
            idx = len(lines) - 15 + i
            if idx > 0:
                candidate = lines[idx - 1].strip(" -–|•")
                if 4 < len(candidate) < 120:
                    return candidate

    # ── Estratégia 2: palavras-chave de estabelecimento ───────────────────
    _KEYWORDS_PAT = re.compile(
        r"\b(?:clín[i]?ca|hospital|pet\s*shop|petshop|veterinár[ia]|centro\s+veterinário|"
        r"centro\s+veterinario|consultório|consultorio|instituto|pronto\s+socorro|"
        r"hvet|policlínica|policlinica)\b",
        re.IGNORECASE,
    )
    # checar cabeçalho (primeiras 15 linhas) e rodapé (últimas 10 linhas)
    candidates = lines[:15] + lines[-10:]
    for line in candidates:
        if _KEYWORDS_PAT.search(line):
            clean = line.strip(" -–|•")
            if 4 < len(clean) < 150:
                return clean[:120]

    # ── Estratégia 3: heurística — primeiro título do cabeçalho ───────────
    # Documentos profissionais normalmente começam com o nome do estabelecimento:
    # linha curta, inicial maiúscula, sem dígitos iniciais, antes do endereço/telefone
    _TRIVIAL = re.compile(r"^(data|date|hora|tel|fone|fax|email|e-mail|cep|end|rua|av\.|avenida|página|page|\d)", re.IGNORECASE)
    _HAS_ALPHA = re.compile(r"[A-Za-zÀ-ÿ]{3}")
    for line in lines[:8]:
        if _TRIVIAL.match(line):
            continue
        if not _HAS_ALPHA.search(line):
            continue
        if 5 < len(line) < 100:
            return line.strip(" -–|•")[:120]

    return None


def _classify_local(content: bytes, mime: str, filename: str) -> tuple[str, date_type | None, str | None]:
    """
    Analisa o conteúdo do arquivo e retorna (categoria, data_ou_None, estabelecimento_ou_None).
    Prioridade: conteúdo > nome do arquivo > extensão.
    Para imagens sem texto, retorna (categoria, None, None) — deixar o caller propagar
    o contexto do batch (PDF companheiro).
    """
    text = ""
    if mime == "application/pdf" or filename.lower().endswith(".pdf"):
        text = _extract_pdf_text(content)
    elif mime.startswith("image/") or filename.lower().endswith((".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic")):
        text = _extract_image_text(content)

    detected_date: date_type | None = None
    establishment: str | None = None

    def _parse_date(iso: str) -> date_type | None:
        try:
            from datetime import datetime
            return datetime.strptime(iso, "%Y-%m-%d").date()
        except Exception:
            return None

    if text:
        low = text.lower()

        # ── Detectar data com prioridade em rótulos conhecidos ────────────────
        # 1ª passagem: datas precedidas de rótulo ("Data:", "Atendimento:", …)
        _LABELED_DATE = re.compile(
            r"(?:data|date|atendimento|emiss[aã]o|emitido|laudo|consulta|exame|realizado\s+em)"
            r"\s*:?\s*"
            r"(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{2,4})",
            re.IGNORECASE,
        )
        m_lbl = _LABELED_DATE.search(text)
        if m_lbl:
            d, mo, y = m_lbl.groups()
            y = y if len(y) == 4 else f"20{y}"
            detected_date = _parse_date(f"{y}-{mo.zfill(2)}-{d.zfill(2)}")

        # 2ª passagem: qualquer data no cabeçalho (primeiras 400 chars) ou rodapé (últimas 400)
        if not detected_date:
            for region in (text[:400], text[-400:]):
                for pat in _DATE_PATTERNS:
                    m = pat.search(region)
                    if m:
                        try:
                            g = m.groups()
                            if len(g[0]) == 4:
                                detected_date = _parse_date(f"{g[0]}-{g[1]}-{g[2]}")
                            else:
                                detected_date = _parse_date(f"{g[2]}-{g[1]}-{g[0]}")
                            if detected_date:
                                break
                        except Exception:
                            pass
                if detected_date:
                    break

        # 3ª passagem: qualquer data no corpo inteiro
        if not detected_date:
            for pat in _DATE_PATTERNS:
                m = pat.search(text)
                if m:
                    try:
                        g = m.groups()
                        if len(g[0]) == 4:
                            detected_date = _parse_date(f"{g[0]}-{g[1]}-{g[2]}")
                        else:
                            detected_date = _parse_date(f"{g[2]}-{g[1]}-{g[0]}")
                        if detected_date:
                            break
                    except Exception:
                        pass

        # 4ª passagem: data por extenso ("15 de março de 2024")
        if not detected_date:
            m2 = _DATE_TEXT_RE.search(low)
            if m2:
                day, month_name, year = m2.groups()
                month = _MONTH_PT.get(month_name.lower(), "01")
                detected_date = _parse_date(f"{year}-{month}-{day.zfill(2)}")

        # Extrair nome do estabelecimento
        establishment = _extract_establishment_name(text)

        # Score por categoria com base no conteúdo
        scores: dict[str, int] = {}
        for category, keywords in _CONTENT_KEYWORDS:
            hits = sum(1 for kw in keywords if kw in low)
            if hits:
                scores[category] = hits

        if scores:
            best = max(scores, key=lambda c: scores[c])
            if scores[best] >= 2:
                return best, detected_date, establishment

    # Fallback: classificação por nome do arquivo
    return _category_from_filename(filename), detected_date, establishment


# ── Gemini AI classification ──────────────────────────────────────────────────

_GEMINI_PROMPT = """\
Você é um especialista em análise de documentos veterinários. Sua tarefa é olhar a imagem/PDF inteiro e extrair três informações deste documento.

Retorne APENAS JSON válido, sem markdown:
{"categoria": "...", "data": "YYYY-MM-DD ou null", "estabelecimento": "nome ou null"}

═══ CATEGORIA ═══
Escolha UMA opção pelo CONTEXTO VISUAL e pelo texto principal, não pelo nome do arquivo:
- "vaccine"      → carteirinha/tabela de vacinação, adesivos de vacinas, colunas de data/lote/próxima dose, V8, V10, V4, antirrábica, imunização
- "prescription" → receita/receituário: medicamento, dose, posologia, frequência, via oral/tópica/injetável, duração, assinatura/CRMV
- "exam"         → exame ou resultado laboratorial/imagem: hemograma, bioquímico, urina, fezes, ultrassonografia, radiografia, ecocardiograma, cultura, antibiograma, valores de referência, resultado
- "report"       → laudo/relatório/prontuário/atestado: texto narrativo clínico, diagnóstico, conclusão, evolução, histopatológico, anátomo-patológico; também use "report" para laudo de imagem quando o foco for o texto do laudo e não uma tabela de resultados
- "photo"        → foto clínica pura, lesão, ferida, dente, pele, cirurgia, antes/depois, sem estrutura de documento, sem cabeçalho formal e sem texto suficiente para ser exame/receita/laudo
- "other"        → nota fiscal, recibo, orçamento, comprovante, contrato ou documento que não seja clínico

Regras de desempate:
- Se a imagem parece uma folha/documento com cabeçalho, corpo textual e assinatura, NÃO classifique como "photo"; escolha exam, prescription, vaccine ou report.
- Se houver tabela com valores e referência, prefira "exam".
- Se houver instruções de medicamento ao tutor, prefira "prescription".
- Se houver adesivos/selos de vacinas ou carteira de vacinação, prefira "vaccine".
- Se houver laudo narrativo com conclusão/diagnóstico, prefira "report".

═══ DATA ═══
Procure pela data de REALIZAÇÃO ou EMISSÃO do documento (não validade).
Formatos a reconhecer: dd/mm/aaaa, dd-mm-aaaa, dd.mm.aaaa, dd/mm/aa.
Retorne sempre em formato YYYY-MM-DD. Se não encontrar, retorne null.
Dê prioridade a rótulos como: "Data:", "Realizado em:", "Emitido em:", "Data do exame:", "Data de atendimento:".

═══ ESTABELECIMENTO ═══
Procure o nome da clínica, hospital veterinário ou laboratório.
Ele normalmente está: no cabeçalho (topo da página, geralmente em negrito ou maior), no rodapé, ao lado do CRMV ou CNPJ.
Exemplos de padrões: "Clínica Veterinária Tal", "Hospital Veterinário Tal", "Lab. Tal", "Pet Center Tal".
Ignore nomes de tutores ou pacientes. Se não encontrar, retorne null.

Responda SOMENTE o JSON.\
"""

_GEMINI_SUPPORTED_MIMES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
}


def _gemini_classify_sync(
    content: bytes, mime: str, filename: str, api_key: str
) -> tuple[str, date_type | None, str | None] | None:
    """Blocking Gemini call — run via asyncio.to_thread."""
    try:
        import google.generativeai as genai
        from datetime import datetime as _dt

        genai.configure(api_key=api_key)
        model_name = (os.environ.get("GEMINI_MODEL") or "gemini-2.0-flash").strip()
        model = genai.GenerativeModel(model_name)

        # Cap to 4 MB for inline data
        data_to_send = content[: 4 * 1024 * 1024]
        encoded = base64.b64encode(data_to_send).decode()

        part = {"inline_data": {"mime_type": mime, "data": encoded}}
        response = model.generate_content([_GEMINI_PROMPT, part])

        raw = response.text.strip()
        # Strip markdown fences if Gemini wraps in ```json ... ```
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw.strip())

        data = json.loads(raw)

        categoria = str(data.get("categoria", "other")).lower()
        if categoria not in ("exam", "vaccine", "prescription", "report", "photo", "other"):
            categoria = "other"

        doc_date: date_type | None = None
        raw_date = data.get("data")
        if raw_date and str(raw_date).lower() not in ("null", "none", ""):
            try:
                doc_date = _dt.strptime(str(raw_date), "%Y-%m-%d").date()
            except Exception:
                pass

        est: str | None = data.get("estabelecimento")
        if not est or str(est).lower() in ("null", "none", ""):
            est = None

        logger.info(
            "[gemini-classify] file=%s → cat=%s date=%s est=%s",
            filename, categoria, doc_date, est,
        )
        return categoria, doc_date, est

    except Exception as exc:
        logger.warning("[gemini-classify] failed for %s: %s", filename, exc)
        return None


def _document_ai_classify_enabled(api_key: str | None) -> bool:
    """IA fica ativa quando há chave, salvo desativação explícita por env."""
    raw = os.environ.get("DOCUMENT_AI_CLASSIFY_ENABLED")
    if raw is None:
        return bool(api_key)
    return raw.strip().lower() not in ("false", "0", "no", "off")


async def _classify_from_content(
    content: bytes, mime: str, filename: str
) -> tuple[str, date_type | None, str | None]:
    """
    Classifica documento com Gemini (se disponível) e fallback para pypdf+regex.
    """
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    ai_enabled = _document_ai_classify_enabled(api_key)
    if ai_enabled and api_key and mime in _GEMINI_SUPPORTED_MIMES:
        try:
            result = await asyncio.wait_for(
                asyncio.to_thread(_gemini_classify_sync, content, mime, filename, api_key),
                timeout=15.0,
            )
            if result is not None:
                logger.info("[gemini-classify] success file=%s", filename)
                return result
        except asyncio.TimeoutError:
            logger.warning("[gemini-classify] timeout for %s, falling back to local", filename)
        except Exception as exc:
            logger.warning("[gemini-classify] error for %s: %s, falling back to local", filename, exc)

    return _classify_local(content, mime, filename)


def _mime_from_ext(ext: str) -> str:
    return {
        ".pdf":  "application/pdf",
        ".jpg":  "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png":  "image/png",
        ".webp": "image/webp",
        ".gif":  "image/gif",
        ".doc":  "application/msword",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }.get(ext, "application/octet-stream")


async def _extract_zip(
    zip_bytes: bytes,
    pet_id: str,
    default_category: str | None,
    document_date,
    db: Session,
    default_establishment: str | None = None,
) -> tuple[list[PetDocument], list[str]]:
    """
    Descompacta um ZIP e cria um PetDocument por arquivo válido.
    Retorna (lista de docs criados, lista de erros/avisos).
    Ignora entradas que sejam:
      - diretórios
      - arquivos ocultos (__MACOSX, .DS_Store, Thumbs.db)
      - arquivos > MAX_FILE_SIZE
    Classifica a categoria automaticamente pelo nome de cada arquivo.
    """
    created: list[PetDocument] = []
    errors: list[str] = []
    _IMAGE_EXTS_SET = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic"}

    def _safe_filename(entry: zipfile.ZipInfo) -> str:
        """Decode ZIP entry name handling CP437 (Windows) vs UTF-8 (macOS/modern)."""
        name = entry.filename
        # If UTF-8 flag is set (bit 11), Python already decoded it correctly
        if not (entry.flag_bits & 0x800):
            # Try CP437 fallback for Windows ZIPs
            try:
                name = entry.filename.encode('cp437').decode('utf-8')
            except (UnicodeDecodeError, UnicodeEncodeError):
                try:
                    name = entry.filename.encode('latin-1').decode('utf-8')
                except (UnicodeDecodeError, UnicodeEncodeError):
                    pass  # keep original
        return name

    try:
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            entries = zf.infolist()
            valid = []
            for e in entries:
                safe_name = _safe_filename(e)
                if not e.is_dir() and not _zip_entry_is_junk(safe_name):
                    valid.append((e, safe_name))

            if not valid:
                errors.append("ZIP vazio ou contém apenas entradas ignoradas.")
                return created, errors

            # Deduplicate basenames (files from different subfolders with same name)
            seen_names: dict[str, int] = {}
            deduped: list[tuple[zipfile.ZipInfo, str]] = []
            for entry, safe_name in valid[:200]:  # allow up to 200 files
                basename = Path(safe_name).name
                if basename in seen_names:
                    seen_names[basename] += 1
                    stem = Path(basename).stem
                    ext  = Path(basename).suffix
                    basename = f"{stem}_{seen_names[basename]}{ext}"
                else:
                    seen_names[basename] = 0
                deduped.append((entry, safe_name, basename))  # type: ignore[arg-type]

            # ── 1ª passagem: ler, classificar ─────────────────────────────────
            zip_items: list[dict] = []
            for entry, safe_name, fname in deduped:  # type: ignore[misc]
                try:
                    data = zf.read(entry.filename)
                except Exception as exc:
                    errors.append(f"{fname}: erro ao ler ({type(exc).__name__})")
                    continue
                if len(data) > MAX_FILE_SIZE:
                    errors.append(f"{fname}: muito grande (> 20 MB), ignorado")
                    continue
                ext_lower = Path(fname).suffix.lower()
                mime = _mime_from_ext(ext_lower)
                try:
                    cat, detected_date, establishment = await _classify_from_content(data, mime, fname)
                except Exception:
                    cat, detected_date, establishment = "other", None, None
                if default_category:
                    cat = default_category
                zip_items.append({
                    "data": data, "fname": fname, "ext": ext_lower, "mime": mime,
                    "cat": cat,
                    "doc_date": document_date or detected_date,
                    "establishment": establishment,
                })


            # Determinar contexto do batch a partir dos PDFs
            zip_batch_date: date_type | None = document_date
            zip_batch_est: str | None = default_establishment
            for item in zip_items:
                if item["ext"] == ".pdf" or item["mime"] == "application/pdf":
                    if item["doc_date"] and not zip_batch_date:
                        zip_batch_date = item["doc_date"]
                    if item["establishment"] and not zip_batch_est:
                        zip_batch_est = item["establishment"]
                if zip_batch_date and zip_batch_est:
                    break

            # Propagar contexto para imagens sem dados
            if zip_batch_date or zip_batch_est:
                for item in zip_items:
                    if item["ext"] in _IMAGE_EXTS_SET:
                        if not item["doc_date"] and zip_batch_date:
                            item["doc_date"] = zip_batch_date
                        if not item["establishment"] and zip_batch_est:
                            item["establishment"] = zip_batch_est

            # ── 2ª passagem: persistir ────────────────────────────────────────
            for item in zip_items:
                storage_key = _save_bytes_to_disk(item["data"], item["fname"])
                doc = PetDocument(
                    pet_id=pet_id,
                    kind="file",
                    title=Path(item["fname"]).stem[:255],
                    source="upload",
                    storage_key=storage_key,
                    mime_type=item["mime"],
                    size_bytes=len(item["data"]),
                    category=item["cat"],
                    document_date=item["doc_date"],
                    establishment_name=item["establishment"],
                )
                db.add(doc)
                created.append(doc)

    except zipfile.BadZipFile:
        errors.append("Arquivo ZIP inválido ou corrompido")
    except Exception as exc:
        errors.append(f"Erro ao processar ZIP: {type(exc).__name__}")

    if created:
        db.commit()
        for doc in created:
            db.refresh(doc)

    return created, errors


def _zip_entry_is_junk(filename: str) -> bool:
    """True para entradas ocultas ou de metadados do SO."""
    low = filename.lower()
    return (
        "__macosx" in low
        or low.startswith(".")
        or low.endswith(".ds_store")
        or "thumbs.db" in low
        or low.endswith(".ithmb")
    )


def _title_from_url(url: str) -> str:
    try:
        name = Path(urlparse(url).path).stem
        return name[:80] if name else "Documento"
    except Exception:
        return "Documento"


# ── Import session store ──────────────────────────────────────────────────────
# Mantém URLs reais em memória: import_id → [{url_real, title, kind}]
# Nunca serializado para o cliente — o cliente usa índices (__idx__:N).
_import_sessions: dict[str, list[dict]] = {}


def _create_import_record(db: Session, pet_id: str, url: str, provider: str) -> PetDocumentImport:
    rec = PetDocumentImport(
        pet_id=pet_id,
        provider=provider,
        status="queued",
        url_masked=_mask_url(url),
        url_raw=url,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


def _update_import(
    db: Session,
    rec: PetDocumentImport,
    status: str,
    discovered_count: int | None = None,
    imported_count: int | None = None,
    last_error: str | None = None,
) -> None:
    rec.status = status
    if discovered_count is not None:
        rec.discovered_count = discovered_count
    if imported_count is not None:
        rec.imported_count = imported_count
    if last_error is not None:
        rec.last_error = last_error[:500]  # truncar — NUNCA incluir URL aqui
    db.commit()


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/pets/{pet_id}/documents", response_model=list[PetDocumentOut])
def list_documents(
    pet_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_pet_or_404(db, user.id, pet_id)
    from sqlalchemy import case, nulls_last
    return (
        db.query(PetDocument)
        .filter(PetDocument.pet_id == pet_id)
        .order_by(
            nulls_last(PetDocument.document_date.desc()),
            PetDocument.created_at.desc(),
        )
        .all()
    )


@router.get("/pets/{pet_id}/documents/{doc_id}/file")
def serve_document_file(
    pet_id: str,
    doc_id: str,
    request: Request,
    token: Optional[str] = Query(None),
    dl: int = Query(0, description="1 = forçar download, 0 = exibir inline"),
    db: Session = Depends(get_db),
):
    """Serve o arquivo armazenado. Aceita JWT via query param OU Authorization header.
    Por padrão serve inline (para visualização). Use ?dl=1 para forçar download.
    """
    import urllib.parse as _urlparse
    from ..user_auth.security import decode_token

    # Aceitar token via query param OU Authorization: Bearer header
    raw_token = token or ""
    if not raw_token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            raw_token = auth_header[7:]

    if not raw_token:
        raise HTTPException(status_code=401, detail="Token não fornecido")

    token_data = decode_token(raw_token)
    if not token_data or not token_data.user_id:
        raise HTTPException(status_code=401, detail="Token inválido")

    user = db.query(User).filter(User.id == token_data.user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Usuário não encontrado")

    _get_pet_or_404(db, user.id, pet_id)
    doc = (
        db.query(PetDocument)
        .filter(PetDocument.id == doc_id, PetDocument.pet_id == pet_id)
        .first()
    )
    if not doc or not doc.storage_key:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")

    # Suporta: (1) só filename, (2) path absoluto correto, (3) path absoluto errado (outro env)
    candidate = Path(doc.storage_key)
    if candidate.is_absolute() and candidate.is_file():
        # Path absoluto válido no ambiente atual
        fpath = candidate
    else:
        # Extrair apenas o nome do arquivo e buscar em DOCS_UPLOAD_DIR
        fpath = DOCS_UPLOAD_DIR / candidate.name

    if not fpath.is_file():
        raise HTTPException(status_code=404, detail="Arquivo removido do disco")

    filename = doc.title or fpath.name
    ext = fpath.suffix
    if ext and not filename.endswith(ext):
        filename = filename + ext

    mime = doc.mime_type or "application/octet-stream"
    # Tipos visíveis inline: imagens e PDF
    viewable = mime.startswith("image/") or mime == "application/pdf"

    if dl or not viewable:
        # Forçar download
        return FileResponse(
            path=str(fpath),
            media_type=mime,
            filename=filename,
        )
    else:
        # Servir inline para visualização no iframe/img
        safe_name = _urlparse.quote(filename)
        return FileResponse(
            path=str(fpath),
            media_type=mime,
            headers={"Content-Disposition": f"inline; filename*=UTF-8''{safe_name}"},
        )


class BulkDeleteRequest(BaseModel):
    ids: list[str]


@router.delete("/pets/{pet_id}/documents/bulk", status_code=200)
def delete_documents_bulk(
    pet_id: str,
    body: BulkDeleteRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Exclui uma lista de documentos pelo ID."""
    _get_pet_or_404(db, user.id, pet_id)
    docs = (
        db.query(PetDocument)
        .filter(PetDocument.pet_id == pet_id, PetDocument.id.in_(body.ids))
        .all()
    )
    deleted = 0
    for doc in docs:
        if doc.storage_key and os.path.isfile(doc.storage_key):
            try:
                os.remove(doc.storage_key)
            except Exception:
                pass
        db.delete(doc)
        deleted += 1
    db.commit()
    return {"deleted": deleted}


@router.delete("/pets/{pet_id}/documents/{doc_id}", status_code=204)
def delete_document(
    pet_id: str,
    doc_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_pet_or_404(db, user.id, pet_id)
    doc = (
        db.query(PetDocument)
        .filter(PetDocument.id == doc_id, PetDocument.pet_id == pet_id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    if doc.storage_key and os.path.isfile(doc.storage_key):
        try:
            os.remove(doc.storage_key)
        except Exception:
            pass
    db.delete(doc)
    db.commit()


@router.delete("/pets/{pet_id}/documents", status_code=200)
def delete_all_documents(
    pet_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Exclui todos os documentos do pet de uma vez."""
    _get_pet_or_404(db, user.id, pet_id)
    docs = db.query(PetDocument).filter(PetDocument.pet_id == pet_id).all()
    deleted = 0
    for doc in docs:
        if doc.storage_key and os.path.isfile(doc.storage_key):
            try:
                os.remove(doc.storage_key)
            except Exception:
                pass
        db.delete(doc)
        deleted += 1
    db.commit()
    return {"deleted": deleted}


# ── Patch (update date / establishment) ──────────────────────────────────────

class PatchDocumentRequest(BaseModel):
    document_date: Optional[date_type] = None
    establishment_name: Optional[str] = None
    category: Optional[str] = None
    title: Optional[str] = None
    notes: Optional[str] = None


@router.patch("/pets/{pet_id}/documents/{doc_id}", response_model=PetDocumentOut)
def patch_document(
    pet_id: str,
    doc_id: str,
    body: PatchDocumentRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Atualiza metadados de um documento (data, estabelecimento, categoria, título, notas)."""
    _get_pet_or_404(db, user.id, pet_id)
    doc = (
        db.query(PetDocument)
        .filter(PetDocument.id == doc_id, PetDocument.pet_id == pet_id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado")

    if body.document_date is not None:
        doc.document_date = body.document_date
    if body.establishment_name is not None:
        doc.establishment_name = body.establishment_name
    if body.category is not None:
        doc.category = body.category
    if body.title is not None:
        doc.title = body.title[:255]
    if body.notes is not None:
        doc.notes = body.notes

    db.commit()
    db.refresh(doc)
    return doc


class BulkPatchRequest(BaseModel):
    doc_ids: list[str]
    document_date: Optional[date_type] = None
    establishment_name: Optional[str] = None
    category: Optional[str] = None
    title_prefix: Optional[str] = None  # optional rename all docs with prefix


@router.patch("/pets/{pet_id}/documents")
def bulk_patch_documents(
    pet_id: str,
    body: BulkPatchRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Aplica os mesmos metadados a vários documentos de uma só vez."""
    _get_pet_or_404(db, user.id, pet_id)
    updated = []
    for doc_id in body.doc_ids:
        doc = (
            db.query(PetDocument)
            .filter(PetDocument.id == doc_id, PetDocument.pet_id == pet_id)
            .first()
        )
        if not doc:
            continue
        if body.document_date is not None:
            doc.document_date = body.document_date
        if body.establishment_name is not None:
            doc.establishment_name = body.establishment_name
        if body.category is not None:
            doc.category = body.category
        updated.append(doc.id)
    db.commit()
    return {"updated": updated, "count": len(updated)}


@router.post("/pets/{pet_id}/documents/upload", status_code=201)
async def upload_documents(
    pet_id: str,
    files: list[UploadFile] = File(...),
    create_timeline_event: bool = Form(default=False),
    title: Optional[str] = Form(default=None),
    category: Optional[str] = Form(default=None),
    document_date: Optional[str] = Form(default=None),
    establishment_name: Optional[str] = Form(default=None),
    event_id: Optional[str] = Form(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Upload de arquivos individuais ou ZIPs com propagação de contexto batch.
    Quando um PDF é enviado junto de imagens, as imagens herdam automaticamente
    a data e o estabelecimento extraídos do PDF.
    Retorna {created: [PetDocumentOut], errors: [], zip_extracted: int}.
    """
    _get_pet_or_404(db, user.id, pet_id)
    if not files:
        raise HTTPException(status_code=400, detail="Nenhum arquivo enviado")

    # ── Parsear campos do form antes de qualquer loop ─────────────────────
    _form_date: date_type | None = None
    if document_date:
        try:
            _form_date = date_type.fromisoformat(document_date)
        except ValueError:
            pass
    _VALID_CATEGORIES = {"exam", "vaccine", "prescription", "report", "photo", "other"}
    _form_category  = category if category in _VALID_CATEGORIES else None
    _form_establish = establishment_name.strip() if establishment_name and establishment_name.strip() else None
    _form_title     = title.strip()[:255] if title and title.strip() else None

    created: list[PetDocument] = []
    errors: list[str] = []
    zip_extracted = 0

    # ── 1ª passagem: ler todos os arquivos e classificar ─────────────────
    _IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/heic"}
    batch_items: list[dict] = []   # {content, fname, mime, ext, category, doc_date, establishment}

    for f in files:
        content = await f.read()
        fname = f.filename or "arquivo"
        mime  = f.content_type or "application/octet-stream"
        ext   = Path(fname).suffix.lower()

        # ZIP: descompactar imediatamente (não participa do contexto batch)
        is_zip = ext == ".zip" or mime in ("application/zip", "application/x-zip-compressed")
        limit       = MAX_ZIP_SIZE if is_zip else MAX_FILE_SIZE
        limit_label = "100 MB" if is_zip else "20 MB"
        if len(content) > limit:
            errors.append(f"{fname}: arquivo muito grande (máx {limit_label})")
            continue

        if is_zip:
            zip_docs, zip_errs = await _extract_zip(
                content, pet_id,
                default_category=_form_category,
                document_date=_form_date,
                db=db,
                default_establishment=_form_establish,
            )
            created.extend(zip_docs)
            errors.extend(zip_errs)
            zip_extracted += len(zip_docs)
            continue

        category, doc_date, establishment = await _classify_from_content(content, mime, fname)
        batch_items.append({
            "content": content,
            "fname": fname,
            "mime": mime,
            "ext": ext,
            "category": category,
            "doc_date": doc_date,
            "establishment": establishment,
        })

    # ── 2ª passagem: propagar contexto do PDF para imagens do batch ───────
    # Pegar a melhor data/estabelecimento de qualquer PDF no batch
    batch_date: date_type | None = None
    batch_establishment: str | None = None
    for item in batch_items:
        if item["mime"] == "application/pdf" or item["ext"] == ".pdf":
            if item["doc_date"] and not batch_date:
                batch_date = item["doc_date"]
            if item["establishment"] and not batch_establishment:
                batch_establishment = item["establishment"]
        if batch_date and batch_establishment:
            break

    # Aplicar contexto às imagens do batch que não têm data/estabelecimento
    if batch_date or batch_establishment:
        for item in batch_items:
            is_image = item["mime"] in _IMAGE_MIMES or item["ext"] in {".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic"}
            if is_image:
                if not item["doc_date"] and batch_date:
                    item["doc_date"] = batch_date
                if not item["establishment"] and batch_establishment:
                    item["establishment"] = batch_establishment

    # ── 3ª passagem: persistir ────────────────────────────────────────────
    for item in batch_items:
        storage_key = _save_bytes_to_disk(item["content"], item["fname"])
        final_title     = _form_title or Path(item["fname"]).stem[:255]
        final_category  = _form_category or item["category"]
        final_date      = _form_date or item["doc_date"]
        final_establish = _form_establish or item["establishment"]
        doc = PetDocument(
            pet_id=pet_id, kind="file",
            title=final_title,
            source="upload", storage_key=storage_key,
            mime_type=item["mime"], size_bytes=len(item["content"]),
            category=final_category,
            document_date=final_date,
            establishment_name=final_establish,
        )
        db.add(doc)
        created.append(doc)

    if created:
        for doc in created:
            if event_id:
                doc.event_id = event_id
            else:
                _maybe_create_timeline_event(db, doc, user.id, create_timeline_event)
        db.commit()
        for doc in created:
            try:
                db.refresh(doc)
            except Exception:
                pass

    return {
        "created": [PetDocumentOut.model_validate(d).model_dump(mode="json") for d in created],
        "errors": errors,
        "zip_extracted": zip_extracted,
        "timeline_events_created": sum(1 for d in created if d.event_id) if create_timeline_event else 0,
    }


@router.post("/pets/{pet_id}/documents/link", response_model=PetDocumentOut, status_code=201)
def add_link(
    pet_id: str,
    body: AddLinkRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_pet_or_404(db, user.id, pet_id)
    masked = _mask_url(body.url)
    doc = PetDocument(
        pet_id=pet_id, kind="link",
        title=body.title or masked[:80],
        category=body.category or "other",
        document_date=body.document_date,
        notes=body.notes, source="link",
        url_masked=masked, url_raw=body.url,
    )
    db.add(doc)
    db.flush()
    _maybe_create_timeline_event(db, doc, user.id, body.create_timeline_event)
    db.commit()
    db.refresh(doc)
    return doc


@router.post("/pets/{pet_id}/documents/import-link", response_model=ImportLinkResponse)
async def import_link(
    pet_id: str,
    body: ImportLinkRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Passo 1 — Descoberta.
    GET na URL → detecta tipo → parseia HTML ou baixa direto.
    Falha → best-effort salva como link (link_saved=True).
    """
    _get_pet_or_404(db, user.id, pet_id)

    try:
        import httpx
    except ImportError:
        raise HTTPException(status_code=503, detail="httpx não instalado no servidor")

    provider = _detect_provider(body.url)
    masked = _mask_url(body.url)
    import_rec = _create_import_record(db, pet_id, body.url, provider)

    # ── GET ───────────────────────────────────────────────────────────────────
    try:
        async with httpx.AsyncClient(
            timeout=IMPORT_TIMEOUT, follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (compatible; PETMOL-Importer/2.0)"},
        ) as client:
            resp = await client.get(body.url)
            resp.raise_for_status()
    except Exception as exc:
        err_type = type(exc).__name__
        logger.warning("[doc-import] GET falhou provider=%s err=%s masked=%s", provider, err_type, masked)
        _update_import(db, import_rec, "failed", last_error=f"Falha ao acessar: {err_type}")
        link_doc = _save_link_fallback(db, pet_id, body)
        return ImportLinkResponse(
            import_id=import_rec.id, provider=provider,
            link_saved=True, link_doc=PetDocumentOut.model_validate(link_doc),
            status="link_saved",
            error="Não foi possível importar automaticamente. Link guardado.",
        )

    content_type = resp.headers.get("content-type", "").split(";")[0].strip().lower()

    # ── Arquivo direto ────────────────────────────────────────────────────────
    if content_type.startswith("image/") or content_type == "application/pdf":
        content = resp.content
        if len(content) > MAX_FILE_SIZE:
            _update_import(db, import_rec, "failed", last_error="arquivo_muito_grande")
            link_doc = _save_link_fallback(db, pet_id, body)
            return ImportLinkResponse(
                import_id=import_rec.id, provider=provider,
                link_saved=True, link_doc=PetDocumentOut.model_validate(link_doc),
                status="link_saved",
                error="Arquivo muito grande (> 20 MB). Link guardado.",
            )
# ── ZIP direto ────────────────────────────────────────────────────
        if content_type in ("application/zip", "application/x-zip-compressed") or \
           (content_type == "application/octet-stream" and _title_from_url(body.url).endswith(".zip")):
            zip_docs, zip_errs = await _extract_zip(
                content, pet_id,
                default_category=body.category,
                document_date=body.document_date,
                db=db,
            )
            _update_import(db, import_rec, "imported", imported_count=len(zip_docs))
            return ImportLinkResponse(
                import_id=import_rec.id, provider=provider,
                imported=[PetDocumentOut.model_validate(d) for d in zip_docs],
                status="imported",
                error=(zip_errs[0] if zip_errs and not zip_docs else None),
            )

        ext = _ext_from_mime(content_type)
        storage_key = _save_bytes_to_disk(content, f"import{ext}")
        title = _title_from_url(body.url)
        ai_cat, ai_date, ai_est = await _classify_from_content(content, content_type, title + ext)
        doc = PetDocument(
            pet_id=pet_id, kind="file",
            title=title,
            category=body.category or ai_cat,
            document_date=body.document_date or ai_date, source="import",
            storage_key=storage_key, mime_type=content_type, size_bytes=len(content),
            establishment_name=ai_est,
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)
        _update_import(db, import_rec, "imported", imported_count=1)
        return ImportLinkResponse(
            import_id=import_rec.id, provider=provider,
            imported=[PetDocumentOut.model_validate(doc)],
            status="imported",
        )

    # ── HTML → descoberta ─────────────────────────────────────────────────────
    if "text/html" in content_type:
        html = resp.text
        raw_items = (
            _discover_cfaz_max(html, str(resp.url))
            if provider == "cfaz_max"
            else _discover_generic(html, str(resp.url))
        )
        raw_items = raw_items[:200]

        if not raw_items:
            _update_import(db, import_rec, "discovered", discovered_count=0)
            link_doc = _save_link_fallback(db, pet_id, body)
            return ImportLinkResponse(
                import_id=import_rec.id, provider=provider,
                link_saved=True, link_doc=PetDocumentOut.model_validate(link_doc),
                status="link_saved",
                error="Nenhum arquivo encontrado na página. Link guardado.",
            )

        # URLs reais ficam em memória — frontend recebe apenas url_masked
        _import_sessions[import_rec.id] = raw_items
        _update_import(db, import_rec, "discovered", discovered_count=len(raw_items))

        return ImportLinkResponse(
            import_id=import_rec.id, provider=provider,
            discovered=[
                DiscoveredItem(url_masked=it["url_masked"], title=it["title"], kind=it["kind"])
                for it in raw_items
            ],
            status="discovered",
        )

    # ── Tipo desconhecido ─────────────────────────────────────────────────────
    _update_import(db, import_rec, "failed", last_error=f"content-type: {content_type}")
    link_doc = _save_link_fallback(db, pet_id, body)
    return ImportLinkResponse(
        import_id=import_rec.id, provider=provider,
        link_saved=True, link_doc=PetDocumentOut.model_validate(link_doc),
        status="link_saved",
        error=f"Tipo não suportado ({content_type}). Link guardado.",
    )


@router.post("/pets/{pet_id}/documents/import-items", status_code=201)
async def import_items(
    pet_id: str,
    body: ImportItemsRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Passo 2 — Download dos itens selecionados pelo usuário.
    items[].url deve ser '__idx__:N' (índice na sessão) ou URL direta (fallback).
    """
    _get_pet_or_404(db, user.id, pet_id)

    try:
        import httpx
    except ImportError:
        raise HTTPException(status_code=503, detail="httpx não instalado no servidor")

    if not body.items:
        return {"imported": [], "errors": []}

    session_items: list[dict] = []
    if body.import_id and body.import_id in _import_sessions:
        session_items = _import_sessions[body.import_id]

    imported: list[dict] = []
    errors: list[str] = []

    async with httpx.AsyncClient(
        timeout=IMPORT_TIMEOUT, follow_redirects=True,
        headers={"User-Agent": "Mozilla/5.0 (compatible; PETMOL-Importer/2.0)"},
    ) as client:
        for req_item in body.items:
            # Resolver URL real
            url_real: str | None = None
            if req_item.url.startswith("__idx__:") and session_items:
                try:
                    idx = int(req_item.url.split(":")[1])
                    url_real = session_items[idx]["url_real"]
                except (ValueError, IndexError):
                    pass
            else:
                url_real = req_item.url  # fallback direto

            if not url_real:
                errors.append(f"{req_item.title or 'item'}: sessão expirada")
                continue

            item_masked = _mask_url(url_real)
            try:
                resp = await client.get(url_real)
                resp.raise_for_status()
                content_type = resp.headers.get("content-type", "").split(";")[0].strip().lower()
                content = resp.content

                if len(content) > MAX_FILE_SIZE:
                    errors.append(f"{item_masked}: muito grande (> 20 MB)")
                    continue

                # ZIP recebido via import-items
                if content_type in ("application/zip", "application/x-zip-compressed"):
                    zip_docs, zip_errs = await _extract_zip(
                        content, pet_id,
                        default_category=body.category,
                        document_date=body.document_date,
                        db=db,
                    )
                    imported.extend([PetDocumentOut.model_validate(d).model_dump(mode="json") for d in zip_docs])
                    errors.extend(zip_errs)
                    continue

                ext = _ext_from_mime(content_type)
                storage_key = _save_bytes_to_disk(content, f"import{ext}")
                title = req_item.title or _title_from_url(url_real)
                ai_cat, ai_date, ai_est = await _classify_from_content(content, content_type, title + ext)
                doc = PetDocument(
                    pet_id=pet_id, kind="file", title=title,
                    category=body.category or ai_cat,
                    document_date=body.document_date or ai_date, source="import",
                    storage_key=storage_key, mime_type=content_type, size_bytes=len(content),
                    establishment_name=ai_est,
                )
                db.add(doc)
                db.commit()
                db.refresh(doc)
                imported.append(PetDocumentOut.model_validate(doc).model_dump(mode="json"))
            except Exception as exc:
                logger.warning("[doc-import-items] Falha masked=%s err=%s", item_masked, type(exc).__name__)
                errors.append(f"{item_masked}: erro ({type(exc).__name__})")

    # Atualizar registro de importação
    if body.import_id:
        rec = db.query(PetDocumentImport).filter(PetDocumentImport.id == body.import_id).first()
        if rec:
            _update_import(
                db, rec,
                "imported" if imported else "failed",
                imported_count=len(imported),
                last_error=("; ".join(errors[:3]) if errors and not imported else None),
            )
        _import_sessions.pop(body.import_id, None)

    return {"imported": imported, "errors": errors}


# ── Link fallback ─────────────────────────────────────────────────────────────

def _save_link_fallback(db: Session, pet_id: str, body: ImportLinkRequest) -> PetDocument:
    masked = _mask_url(body.url)
    doc = PetDocument(
        pet_id=pet_id, kind="link",
        title=_title_from_url(body.url),
        category=body.category or "other",
        document_date=body.document_date,
        source="import", url_masked=masked, url_raw=body.url,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc
