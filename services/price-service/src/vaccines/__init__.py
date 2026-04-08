"""
Vaccine Suggestions API - PETMOL
Sugere vacinas baseadas em espécie do pet e idioma do usuário
"""
import json
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

router = APIRouter(prefix="/vaccines", tags=["Vaccines"])

# Carregar base de vacinas
VACCINES_FILE = Path(__file__).parent.parent.parent.parent.parent / "shared" / "vaccines" / "vaccine_names.json"


class VaccineSuggestion(BaseModel):
    """Sugestão de vacina traduzida."""
    canonical: str = Field(..., description="Nome canônico/identificador")
    display_name: str = Field(..., description="Nome traduzido para exibição")
    species: List[str] = Field(..., description="Espécies aplicáveis")
    common_interval_days: Optional[int] = Field(None, description="Intervalo comum em dias")
    description: Optional[str] = Field(None, description="Descrição da vacina")
    regional: Optional[bool] = Field(False, description="Se é vacina regional")
    regions: Optional[List[str]] = Field(None, description="Regiões onde é comum")


def load_vaccines():
    """Carrega base de vacinas do JSON."""
    if not VACCINES_FILE.exists():
        return []
    
    with open(VACCINES_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)


def get_translation(vaccine_data: dict, locale: str) -> str:
    """Retorna tradução da vacina para o locale especificado.
    
    Fallback: locale específico → idioma base → canonical
    Exemplo: pt-BR → pt → canonical
    """
    translations = vaccine_data.get('translations', {})
    
    if not translations:
        # Marcas comerciais não têm tradução
        return vaccine_data.get('canonical', 'Unknown')
    
    # Tentar locale específico (pt-BR)
    if locale in translations:
        return translations[locale]
    
    # Tentar idioma base (pt)
    base_locale = locale.split('-')[0] if '-' in locale else locale
    if base_locale in translations:
        return translations[base_locale]
    
    # Fallback para inglês
    if 'en' in translations:
        return translations['en']
    
    # Último fallback: canonical
    return vaccine_data.get('canonical', 'Unknown')


def get_description(vaccine_data: dict, locale: str) -> Optional[str]:
    """Retorna descrição traduzida da vacina."""
    descriptions = vaccine_data.get('description', {})
    
    if not descriptions:
        return None
    
    # Tentar locale específico
    if locale in descriptions:
        return descriptions[locale]
    
    # Tentar idioma base
    base_locale = locale.split('-')[0] if '-' in locale else locale
    if base_locale in descriptions:
        return descriptions[base_locale]
    
    # Fallback para inglês
    if 'en' in descriptions:
        return descriptions['en']
    
    return None


@router.get("/suggestions", response_model=List[VaccineSuggestion])
def get_vaccine_suggestions(
    species: str = Query(..., description="Espécie do pet (dog, cat)"),
    locale: str = Query("en", description="Idioma para tradução (pt-BR, en, es, fr, de, is, etc)"),
    region: Optional[str] = Query(None, description="Código do país (BR, US, IS, etc) para vacinas regionais")
) -> List[VaccineSuggestion]:
    """
    Retorna lista de vacinas sugeridas para a espécie e idioma especificados.
    
    **Funciona globalmente:**
    - Brasil: `locale=pt-BR, region=BR` → Raiva, Múltipla, Leptospirose, Leishmaniose...
    - Islândia: `locale=is, region=IS` → Hundaæði, Margfaldar...
    - EUA: `locale=en, region=US` → Rabies, DHPP, Lyme...
    
    **Entrada livre:**
    - Sistema aceita QUALQUER vacina digitada pelo usuário
    - Sugestões são apenas para facilitar, não são obrigatórias
    """
    vaccines_data = load_vaccines()
    suggestions = []
    
    for vaccine in vaccines_data:
        # Filtrar por espécie
        vaccine_species = vaccine.get('species', [])
        if species not in vaccine_species:
            continue
        
        # Ignorar marcas comerciais antigas (sem tradução)
        if not vaccine.get('translations'):
            continue
        
        # Filtrar vacinas regionais se necessário
        is_regional = vaccine.get('regional', False)
        if is_regional and region:
            allowed_regions = vaccine.get('regions', [])
            if region not in allowed_regions:
                continue  # Vacina não é comum nesta região
        
        # Traduzir nome
        display_name = get_translation(vaccine, locale)
        description = get_description(vaccine, locale)
        
        suggestions.append(VaccineSuggestion(
            canonical=vaccine['canonical'],
            display_name=display_name,
            species=vaccine_species,
            common_interval_days=vaccine.get('common_interval_days'),
            description=description,
            regional=is_regional,
            regions=vaccine.get('regions')
        ))
    
    # Ordenar: vacinas comuns primeiro, depois regionais
    suggestions.sort(key=lambda v: (v.regional or False, v.display_name))
    
    return suggestions
