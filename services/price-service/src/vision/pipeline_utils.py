"""
Pipeline Utils - Funções auxiliares para processamento avançado de dados de vacinas
Sistema de normalização, ontologia, validação e deduplicação
"""

from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, date, timedelta
import re
import logging

logger = logging.getLogger(__name__)

# Configuração de threshold de confiança
CONFIDENCE_THRESHOLD = 0.65  # Threshold balanceado: aceita leituras razoáveis mas rejeita muito incertas
REQUIRED_FIELDS = ["produto", "data_aplicacao"]  # Campos essenciais


def validate_field_confidence(field_value: Any, confidence: float, threshold: float = CONFIDENCE_THRESHOLD) -> bool:
    """Valida se um campo deve ser aceito baseado na confiança.
    
    Args:
        field_value: Valor do campo
        confidence: Confiança do campo (0-1) 
        threshold: Threshold mínimo de confiança
    
    Returns:
        True se o campo deve ser aceito, False caso contrário
    """
    if not field_value or field_value in ["", "null", "N/A"]:
        return False
    
    # Se não há score de confiança informado (0.0), mas o campo tem valor,
    # assumimos que a IA retornou com confiança implícita - ACEITAR
    if confidence == 0.0:
        return True
    
    # Se há score explícito, aplicar o threshold
    return confidence >= threshold


def get_missing_fields(record: dict, confidence_scores: dict) -> List[str]:
    """Identifica campos em branco ou com confiança insuficiente.
    
    Args:
        record: Registro de vacina
        confidence_scores: Score de confiança por campo (0-1)
    
    Returns:
        Lista de nomes de campos que estão em branco ou não confiáveis
    """
    missing = []
    
    # Verificar campos essenciais
    field_mapping = {
        "produto": [record.get("produto")],
        "data_aplicacao": [record.get("data_aplicacao")],
        "data_revacina": [record.get("data_revacina")],
        "veterinario": [record.get("veterinario")],
        "clinica": [record.get("clinica")],
        "lote": [record.get("lote")]
    }
    
    for field_key, field_values in field_mapping.items():
        # Buscar valor válido
        field_value = next((v for v in field_values if v), None)
        
        # Verificar confiança
        confidence = confidence_scores.get(field_key, 0.0)
        
        if not validate_field_confidence(field_value, confidence):
            missing.append(field_key)
    
    return missing

# Threshold já definido no topo do arquivo - esta duplicação será removida

def normalize_date_to_iso(value: Optional[str], *, kind: str = "unknown") -> Optional[str]:
    """Normalize various handwritten/ocr date formats to ISO (YYYY-MM-DD).

    Heuristics:
    - Prefer pt-BR ordering (dd/mm/yyyy) when ambiguous.
    - Accept mm/dd/yyyy when dd/mm is invalid.
    - Fix common OCR year drift (e.g. 2029 instead of 2019).
    - For application dates, avoid far-future results.
    - Handle common OCR errors in handwritten dates (1→l, 5→S, 0→O, etc.)
    """

    if not value:
        return None
    s = str(value).strip()
    if not s:
        return None
    
    # Pre-process: fix common OCR errors in handwritten dates
    # Replace common letter misreads with numbers
    char_fixes = {
        'l': '1', 'I': '1', '|': '1',  # lowercase L, uppercase i, pipe → 1
        'O': '0', 'o': '0',             # letter O → zero
        'S': '5', 's': '5',             # letter S → 5 (when in date context)
        'G': '6', 'g': '9',             # G can be 6, lowercase g can be 9
        'Z': '2', 'z': '2',             # Z → 2
        'B': '8',                       # B → 8
    }
    
    # Only fix if pattern looks like a date (has separators or is numeric-ish)
    if any(sep in s for sep in ['/', '.', '-']) or any(c.isdigit() for c in s):
        for old_char, new_char in char_fixes.items():
            s = s.replace(old_char, new_char)

    from datetime import date, datetime, timedelta
    import re
    import unicodedata

    today = date.today()
    max_future = today + (timedelta(days=7) if kind == "aplicacao" else timedelta(days=365 * 5))
    min_year = 1900
    max_year = today.year + (1 if kind == "aplicacao" else 5)

    def _adjust_year(y: int) -> Optional[int]:
        if y < 100:
            y = 2000 + y
        if y < min_year:
            return None
        if y > max_year:
            for delta in (10, 20, 30):
                cand = y - delta
                if min_year <= cand <= max_year:
                    return cand
            return None
        return y

    def _try_dt(y: int, m: int, d: int) -> Optional[date]:
        try:
            return date(y, m, d)
        except Exception:
            return None

    # Already ISO-ish
    m_iso = re.search(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b", s)
    if m_iso:
        try:
            y = _adjust_year(int(m_iso.group(1)))
            if y is None:
                return None
            dt = _try_dt(y, int(m_iso.group(2)), int(m_iso.group(3)))
            if not dt:
                return None
            if dt > max_future:
                return None
            return dt.strftime("%Y-%m-%d")
        except Exception:
            return None

    # dd/mm/yyyy or mm/dd/yyyy (and variations with . or -)
    m = re.search(r"\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b", s)
    if not m:
        # Try compact format without separators: ddmmyy or ddmmyyyy
        # Examples: "150324" → 15/03/24, "15032024" → 15/03/2024
        m_compact = re.search(r"\b(\d{6}|\d{8})\b", s)
        if m_compact:
            compact = m_compact.group(1)
            if len(compact) == 6:  # ddmmyy
                try:
                    d, m_val, y_raw = int(compact[0:2]), int(compact[2:4]), int(compact[4:6])
                    y = _adjust_year(y_raw)
                    if y is not None:
                        dt = _try_dt(y, m_val, d)
                        if dt and dt <= max_future:
                            return dt.strftime("%Y-%m-%d")
                except Exception:
                    pass
            elif len(compact) == 8:  # ddmmyyyy
                try:
                    d, m_val, y_raw = int(compact[0:2]), int(compact[2:4]), int(compact[4:8])
                    y = _adjust_year(y_raw)
                    if y is not None:
                        dt = _try_dt(y, m_val, d)
                        if dt and dt <= max_future:
                            return dt.strftime("%Y-%m-%d")
                except Exception:
                    pass
        return None

    a = int(m.group(1))
    b = int(m.group(2))
    y_raw = int(m.group(3))
    y = _adjust_year(y_raw)
    if y is None:
        return None

    # Candidate interpretations
    candidates: List[date] = []
    # pt-BR: dd/mm
    dt_br = _try_dt(y, b, a)
    if dt_br:
        candidates.append(dt_br)
    # US: mm/dd
    dt_us = _try_dt(y, a, b)
    if dt_us and dt_us not in candidates:
        candidates.append(dt_us)

    if not candidates:
        return None

    # Filter out clearly impossible futures
    candidates = [dt for dt in candidates if dt <= max_future]
    if not candidates:
        return None

    # If ambiguous (both valid), prefer BR unless it looks like a future drift
    if dt_br in candidates and dt_us in candidates:
        # For application, prefer a date not in the future (if possible)
        if kind == "aplicacao":
            past = [dt for dt in candidates if dt <= today]
            if past:
                # pick the most recent past date
                best = sorted(past)[-1]
                return best.strftime("%Y-%m-%d")
        # Default BR
        return dt_br.strftime("%Y-%m-%d")

    return candidates[0].strftime("%Y-%m-%d")


def format_category_display(categoria: str, subtipo: str = None) -> str:
    """Formata categoria e subtipo para exibição no frontend."""
    display_mapping = {
        "RAIVA": "Antirrábica",
        "POLIVALENTE": "Polivalente",
        "CORONAVIRUS": "Coronavírus",
        "LEPTO": "Leptospirose", 
        "GIARDIA": "Giardia",
        "GRIPE": "Gripe Canina",
        "LEISH": "Leishmaniose",
        "OUTRO": "Outras"
    }
    
    categoria_display = display_mapping.get(categoria, categoria)
    
    if subtipo:
        return f"{categoria_display} ({subtipo})"
    else:
        return categoria_display


def classify_record(produto: str, raw_text: str = "", hint: str = "") -> tuple[str, str]:
    """Classifica registro retornando (categoria, subtipo).
    
    Args:
        produto: Nome do produto/marca da vacina
        raw_text: Texto bruto extraído da imagem (não usado atualmente)
        hint: Contexto adicional (não usado atualmente)
    
    Returns:
        tuple: (categoria, subtipo) onde categoria é uma das constantes e subtipo pode ser None
    """
    if not produto:
        return "OUTRO", None
    
    produto_lower = str(produto).lower().strip()
    
    # RAIVA - Primeira prioridade
    if any(term in produto_lower for term in [
        "rabisin", "canigen r", "canigen® r", "nobivac raiva", "nobivac rabies", "nobivac r", 
        "antirrábica", "raiva", "rabies", "defensor", "rabvac"
    ]):
        return "RAIVA", None
    
    # POLIVALENTE - Segunda prioridade com detecção de subtipo
    if any(term in produto_lower for term in [
        "vanguard", "duramune", "nobivac dhpp", "nobivac dapp", "recombitek", "eurican",
        "dhpp", "dapp", "dhp", "parvo", "cinomose", "adenovirus", "parainfluenza",
        "v8", "v10", "v12", "polivalente", "múltipla", "octuple", "quintuple"
    ]):
        # Detectar subtipos
        if "l4" in produto_lower or "lepto" in produto_lower:
            if "v10" in produto_lower or "dapp" in produto_lower:
                return "POLIVALENTE", "DAPPv+L4"
            return "POLIVALENTE", "L4"
        elif "v10" in produto_lower or "dapp" in produto_lower:
            return "POLIVALENTE", "V10"
        elif "v8" in produto_lower or "dhpp" in produto_lower:
            return "POLIVALENTE", "V8"
        elif "v12" in produto_lower:
            return "POLIVALENTE", "V12"
        elif "5-cvk" in produto_lower:
            return "POLIVALENTE", "5-CvK/4L"
        else:
            return "POLIVALENTE", None
    
    # CORONAVIRUS
    if any(term in produto_lower for term in ["1-cv", "coronavirus", "corona", "ccov"]):
        return "CORONAVIRUS", None
    
    # LEPTOSPIROSE isolada
    if any(term in produto_lower for term in ["lepto", "leptospir"]) and not any(term in produto_lower for term in ["polivalente", "múltipla", "v10", "dapp"]):
        return "LEPTO", None
    
    # GIARDIA
    if any(term in produto_lower for term in ["giardia", "giárdia"]):
        return "GIARDIA", None
    
    # GRIPE/INFLUENZA
    if any(term in produto_lower for term in ["influenza", "gripe", "flu", "h3n2", "h3n8"]):
        return "GRIPE", None
    
    # LEISHMANIOSE
    if any(term in produto_lower for term in ["leish", "leishmani"]):
        return "LEISH", None
    
    return "OUTRO", None


def normalize_vaccine_records(raw_records: List[dict]) -> List[dict]:
    """Normaliza registros de vacina aplicando ontologia, validação e flags.
    
    NOVA REGRA: "Se não leu, deixa em branco" - NUNCA inventar dados
    
    - Classifica vacinas apenas com confiança >= threshold
    - Normaliza datas manuscritas apenas se confiáveis
    - Detecta campos em branco e os marca como missing_fields
    - Adiciona flags de revisão quando há campos faltando
    - Remove qualquer fallback ou "invenção" de dados
    - Mantém compatibilidade com frontend (campos legados)
    """
    normalized = []
    from datetime import timezone
    
    for r in raw_records:
        # NOVA LÓGICA: Extract confidence scores
        confidence_scores = {
            "produto": float(r.get("confianca_produto", r.get("confianca_score", 0.0))),
            "data_aplicacao": float(r.get("confianca_data_aplicacao", r.get("confianca_score", 0.0))), 
            "data_revacina": float(r.get("confianca_data_revacina", r.get("confianca_score", 0.0))),
            "veterinario": float(r.get("confianca_veterinario", r.get("confianca_score", 0.0))),
            "clinica": float(r.get("confianca_clinica", 0.0)),
            "lote": float(r.get("confianca_lote", r.get("confianca_score", 0.0)))
        }
        
        # Normalizar campos básicos APENAS se confiança suficiente
        produto_raw = (r.get("marca_comercial") or r.get("marca_vacina") or r.get("tipo_vacina") or 
                      r.get("produto") or r.get("vaccine_name") or r.get("nome_comercial"))
        produto = produto_raw if validate_field_confidence(produto_raw, confidence_scores["produto"]) else None
        
        data_aplicacao_raw = (r.get("data_aplicacao") or r.get("date") or r.get("data_aplicacao_iso") or 
                             r.get("applied_date") or r.get("date_applied"))
        data_aplicacao = None
        if validate_field_confidence(data_aplicacao_raw, confidence_scores["data_aplicacao"]):
            data_aplicacao = normalize_date_to_iso(data_aplicacao_raw, kind="aplicacao")
        
        data_revacina_raw = (r.get("data_revacina") or r.get("next_date") or r.get("data_revacina_iso") or 
                            r.get("revaccination_date") or r.get("next_dose"))
        data_revacina = None
        if validate_field_confidence(data_revacina_raw, confidence_scores["data_revacina"]):
            data_revacina = normalize_date_to_iso(data_revacina_raw, kind="revacina")
        
        veterinario_raw = (r.get("crmv_veterinario") or r.get("veterinario_responsavel") or r.get("veterinario") or 
                          r.get("vet") or r.get("veterinarian"))
        veterinario = veterinario_raw if validate_field_confidence(veterinario_raw, confidence_scores["veterinario"]) else None
        
        lote_raw = r.get("lote") or r.get("batch") or r.get("lot")
        lote = lote_raw if validate_field_confidence(lote_raw, confidence_scores["lote"]) else None
        
        # Classificar vacina APENAS se produto foi identificado
        categoria = None
        subtipo = None
        if produto:
            categoria, subtipo = classify_record(produto)
        
        # Identificar missing_fields
        current_record = {
            "produto": produto,
            "data_aplicacao": data_aplicacao,
            "data_revacina": data_revacina,
            "veterinario": veterinario,
            "clinica": None,  # Sempre None por enquanto
            "lote": lote
        }
        missing_fields = get_missing_fields(current_record, confidence_scores)
        missing_fields = get_missing_fields(current_record, confidence_scores)
        
        # Inicializar flags
        flags = {
            "revisar": False,
            "inconsistente": False,
            "aplicacao_futura": False,
            "aplicacao_revacina_iguais": False
        }
        
        # NOVA REGRA: Marcar para revisão se há campos essenciais em branco
        if any(field in missing_fields for field in REQUIRED_FIELDS):
            flags["revisar"] = True
        
        # REGRA PRINCIPAL: NUNCA copiar data_aplicacao para data_revacina automaticamente
        # Se são iguais, é um erro que deve ser sinalizado
        if data_aplicacao and data_revacina and data_aplicacao == data_revacina:
            flags["aplicacao_revacina_iguais"] = True
            flags["revisar"] = True
            data_revacina = None  # Limpar data_revacina duplicada
        
        # Detectar inconsistências de data
        if data_aplicacao:
            # Verificar data futura
            try:
                data_app_obj = datetime.fromisoformat(str(data_aplicacao).replace("Z", "+00:00"))
                if data_app_obj > datetime.now(timezone.utc):
                    flags["aplicacao_futura"] = True
                    flags["revisar"] = True
            except:
                pass
        
        if data_revacina and data_aplicacao:
            try:
                data_app_obj = datetime.fromisoformat(str(data_aplicacao).replace("Z", "+00:00"))
                data_rev_obj = datetime.fromisoformat(str(data_revacina).replace("Z", "+00:00"))
                if data_rev_obj < data_app_obj:
                    flags["inconsistente"] = True
                    flags["revisar"] = True
            except:
                pass
        
        # Marcar para revisão se não foi classificado
        if categoria == "OUTRO":
            flags["revisar"] = True

        # NOVA LÓGICA: Incluir registros mesmo com campos vazios (não pular mais)
        normalized.append({
            "produto": produto,
            "categoria": categoria,
            "subtipo": subtipo,
            "data_aplicacao": data_aplicacao,
            "data_revacina": data_revacina,
            "lote": lote,
            "vet": veterinario,
            "clinica": None,
            "confianca_score": float(r.get("confianca_score", 0.0)),  # 0-1 scale
            "missing_fields": missing_fields,  # NOVO CAMPO
            "confidence_scores": confidence_scores,  # NOVO CAMPO
            "fonte": r.get("fonte", "ai"),
            "pagina": int(r.get("pagina", 1)),
            "texto_origem": str(r.get("texto_origem", ""))[:100] if r.get("texto_origem") else None,
            "flags": flags,
            
            # Compatibilidade com frontend existente (campos legados)
            "nome_comercial": produto,  # produto vai para nome_comercial
            "tipo_vacina": format_category_display(categoria, subtipo) if categoria else None,  # categoria semântica para tipo_vacina
            "marca_comercial": produto  # manter referência de marca também
        })
    return normalized


def apply_ontology_mapping(records: List[dict]) -> List[dict]:
    """Aplica ontologia global de marcas veterinárias - DESABILITADA.
    
    IMPORTANTE: Desabilitado o mapeamento para prevenir dados inventados!
    O sistema estava "corrigindo" VANGUARD para outras marcas incorretamente.
    """
    # FUNÇÃO DESABILITADA para prevenir invenção de dados
    logger.info("Ontologia: Mapeamento DESABILITADO para prevenir miss-classification")
    return records


def apply_post_ai_validation(records: List[dict], threshold: float = 0.75) -> List[dict]:
    """Aplica validação pós-IA com fuzzy matching."""
    try:
        from fuzzywuzzy import process as fuzzy_process, fuzz
        
        VALID_BRANDS = [
            "Vanguard Plus", "Nobivac", "Nobivac Raiva", "Nobivac DHPPi", 
            "Duramune Max", "Rabisin", "Canigen R", "Defensor", "Recombitek",
            "Eurican", "Feligen CRP", "Purevax RCP", "LeishTec"
        ]
        
        for record in records:
            produto = record.get("produto", "")
            if produto and len(produto) >= 3:
                # Fuzzy match contra marcas válidas
                best_match, score = fuzzy_process.extractOne(
                    produto, VALID_BRANDS, scorer=fuzz.ratio
                )
                if score >= (threshold * 100):  # fuzzywuzzy usa 0-100, não 0-1
                    record["produto"] = best_match
                    record["confianca_score"] = min(record.get("confianca_score", 0.8), score / 100)
    except ImportError:
        # Fallback sem fuzzy matching - usar similaridade baseada em sequência
        logger.info("FuzzyWuzzy não disponível, usando fallback de similaridade")
        pass
    return records


def dedupe_and_sort_records(records: List[dict]) -> List[dict]:
    """Remove duplicados e ordena por data com lógica avançada de merge."""
    from collections import defaultdict
    
    # Agrupar por chave de produto + data_aplicacao
    groups = defaultdict(list)
    
    for record in records:
        # Chave principal: produto + data_aplicacao
        key = (
            str(record.get("produto", "")).lower().strip(),
            record.get("data_aplicacao")
        )
        groups[key].append(record)
    
    unique_records = []
    
    for key, group in groups.items():
        if len(group) == 1:
            # Registro único, adicionar diretamente
            unique_records.append(group[0])
        else:
            # Múltiplos registros - aplicar lógica de merge
            best_record = merge_duplicate_records(group)
            unique_records.append(best_record)
    
    # Ordenar por data_aplicacao (nulas vão para o final)
    def sort_key(r):
        data = r.get("data_aplicacao")
        return (data is None, data or "9999-12-31")  # None = True, vai para o final
    
    return sorted(unique_records, key=sort_key)


def merge_duplicate_records(duplicates: List[dict]) -> dict:
    """Merge registros duplicados escolhendo os melhores valores por campo."""
    # 1. Preferir registro com maior confiança
    best_by_confidence = max(duplicates, key=lambda r: r.get("confianca_score", 0.0))
    
    # 2. Para data_revacina, preferir registro que tenha valor não-nulo e não igual a data_aplicacao
    best_revacina = None
    for r in duplicates:
        revacina = r.get("data_revacina")
        aplicacao = r.get("data_aplicacao")
        if revacina and revacina != aplicacao:
            best_revacina = revacina
            break
    
    # 3. Completar campos vazios com valores de outros registros
    merged = best_by_confidence.copy()
    
    # Se o melhor registro tem data_revacina igual a data_aplicacao, usar a melhor encontrada
    if best_revacina and (not merged.get("data_revacina") or merged.get("data_revacina") == merged.get("data_aplicacao")):
        merged["data_revacina"] = best_revacina
        # Atualizar flags se corrigimos o problema
        if merged.get("flags", {}).get("aplicacao_revacina_iguais"):
            merged["flags"]["aplicacao_revacina_iguais"] = False
    
    # Completar outros campos vazios
    for field in ["lote", "vet", "clinica"]:
        if not merged.get(field):
            for r in duplicates:
                if r.get(field):
                    merged[field] = r[field]
                    break
    
    return merged


def apply_advanced_pipeline(raw_records: List[dict]) -> List[dict]:
    """Aplica pipeline completo de processamento."""
    logger.info(f"🔄 Pipeline iniciado com {len(raw_records)} registros brutos")
    logger.info(f"📝 Raw records primeiros 2: {raw_records[:2]}")
    
    if not raw_records:
        return []
    
    # Etapa 1: Normalizar schema
    records = normalize_vaccine_records(raw_records)
    logger.info(f"✅ Normalizados: {len(records)} registros")
    logger.info(f"📝 Primeiros 2 normalizados: {records[:2]}")
    
    # Etapa 2: Aplicar ontologia
    records = apply_ontology_mapping(records)
    logger.info(f"✅ Ontologia aplicada: {len(records)} registros")
    
    # Etapa 3: Validação pós-IA
    records = apply_post_ai_validation(records, threshold=0.75)
    logger.info(f"✅ Validação aplicada: {len(records)} registros")
    
    # Etapa 4: Dedupe e sort
    records = dedupe_and_sort_records(records)
    logger.info(f"✅ Pipeline finalizado: {len(records)} registros únicos")
    
    return records


def evaluate_need_ai(local_records: List[dict]) -> tuple[bool, List[str]]:
    """Avalia se é necessário usar IA com base na qualidade dos registros locais."""
    motivos = []
    
    if not local_records:
        motivos.append("no_local_records")
        return True, motivos
    
    # Contar registros sem data
    registros_sem_data = sum(
        1 for r in local_records 
        if not r.get("data_aplicacao") and not r.get("data_revacina")
    )
    
    # Heurística de confiabilidade
    leitura_local_confiavel = (
        len(local_records) >= 3 and registros_sem_data == 0
    )
    
    if not leitura_local_confiavel:
        if len(local_records) < 3:
            motivos.append("insufficient_records")
        if registros_sem_data > 0:
            motivos.append("missing_dates")
    
    return not leitura_local_confiavel, motivos


def convert_to_legacy_schema(advanced_records: List[dict]) -> List[dict]:
    """Converte registros do schema avançado para o schema legacy do endpoint."""
    legacy_records = []
    
    for record in advanced_records:
        # IMPORTANTE: NUNCA inventar dados - sempre pode ser None
        legacy_records.append({
            "tipo_vacina": record.get("categoria"),  # Pode ser None - sem fallback
            "nome_comercial": record.get("produto"),
            "data_aplicacao": record.get("data_aplicacao"),
            "data_revacina": record.get("data_revacina"),
            "lote": record.get("lote"),
            "veterinario_responsavel": record.get("vet"),
        })
    
    return legacy_records