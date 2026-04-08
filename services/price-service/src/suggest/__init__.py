"""
GET /api/suggest?domain=vaccine&q=antirrabica&species=dog
GET /api/suggest?domain=food&q=formula+natural
GET /api/suggest?domain=provider&q=vet+sao+bento
"""

from __future__ import annotations

from typing import List, Literal, Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel

from ..services.suggest_canonical import suggest, Candidate

router = APIRouter(prefix="/api/suggest", tags=["Canonicalization"])


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------

class CandidateOut(BaseModel):
    canonical: str
    code: Optional[str] = None
    confidence: float
    method: str
    matched_alias: str


class SuggestResponse(BaseModel):
    raw: str
    canonical: Optional[str] = None
    code: Optional[str] = None
    confidence: float
    method: str
    auto_apply: bool
    candidates: List[CandidateOut]


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.get("", response_model=SuggestResponse, summary="Sugerir forma canônica")
async def suggest_canonical(
    q: str = Query(..., min_length=1, max_length=200, description="Texto a normalizar"),
    domain: Literal["vaccine", "food", "provider"] = Query(..., description="Domínio"),
    species: Optional[Literal["dog", "cat"]] = Query(None, description="Espécie (obrigatório para vaccine)"),
    country: Optional[str] = Query(None, description="Código do país (ex: BR)"),
):
    """
    Dada uma string livre, retorna a melhor sugestão canônica do catálogo
    com grau de confiança.

    - **confidence ≥ 0.95** → `auto_apply: true` (pode ser aplicado automaticamente)
    - **confidence 0.70–0.94** → exibir sugestão, aguardar confirmação do usuário
    - **confidence < 0.70** → sem sugestão (`canonical: null`)

    ### Exemplos de teste
    | Input               | Domain   | Canonical esperado        |
    |---------------------|----------|---------------------------|
    | antirrabica         | vaccine  | Antirrábica Canina        |
    | V10                 | vaccine  | Polivalente V10           |
    | Vet sao bento       | provider | Clínica Veterinária       |
    | formula natural 7kg | food     | Fórmula Natural           |
    """
    result = suggest(q, domain=domain, species=species, country=country)
    return SuggestResponse(
        raw=result.raw,
        canonical=result.canonical,
        code=result.code,
        confidence=result.confidence,
        method=result.method,
        auto_apply=result.auto_apply,
        candidates=[
            CandidateOut(
                canonical=c.canonical,
                code=c.code,
                confidence=c.confidence,
                method=c.method,
                matched_alias=c.matched_alias,
            )
            for c in result.candidates
        ],
    )
