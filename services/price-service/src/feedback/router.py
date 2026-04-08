"""Router para sistema de feedback e aprendizado contínuo"""
from fastapi import APIRouter, HTTPException, Body
from typing import List, Dict, Any
import logging

from .models import (
    VaccineCorrectionCreate,
    VaccineCorrectionResponse,
    LearningAnalytics,
    FeedbackSuggestion,
    CorrectionPattern
)
from .storage import get_feedback_storage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/feedback", tags=["Feedback"])


@router.post("/vaccine-correction", response_model=VaccineCorrectionResponse)
async def submit_vaccine_correction(
    correction: VaccineCorrectionCreate = Body(...)
):
    """
    Receber correção de vacina do usuário
    
    Permite que usuários corrijam:
    - Nomes de vacinas detectados incorretamente
    - Tipos de vacinas (Raiva vs Múltipla, etc.)
    - Datas de aplicação
    - Datas de reforço
    - Nomes de veterinários
    - Marcas comerciais
    """
    try:
        storage = get_feedback_storage()
        
        # Salvar correção
        correction_data = correction.dict()
        correction_id = storage.save_correction(correction_data)
        
        # Calcular impacto
        patterns = storage.get_patterns()
        matching_patterns = [
            p for p in patterns
            if p['field'] == correction.field_corrected
            and p['original_pattern'].lower() == correction.original_value.lower()
        ]
        
        impact = {
            'correction_id': correction_id,
            'similar_corrections': len(matching_patterns),
            'pattern_detected': len(matching_patterns) > 0,
        }
        
        # Se padrão frequente, sugerir melhoria
        if matching_patterns and matching_patterns[0]['frequency'] >= 3:
            impact['suggestion'] = (
                f"Este erro aparece {matching_patterns[0]['frequency']}x. "
                f"Considere ajustar o sistema de detecção."
            )
        
        logger.info(
            f"Correção salva: {correction.field_corrected} "
            f"'{correction.original_value}' → '{correction.corrected_value}' "
            f"(pet_id={correction.pet_id})"
        )
        
        return VaccineCorrectionResponse(
            success=True,
            message="Correção salva com sucesso! Obrigado por ajudar a melhorar o sistema.",
            correction_id=correction_id,
            impact=impact
        )
    
    except Exception as e:
        logger.error(f"Erro ao salvar correção: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro ao salvar correção: {str(e)}")


@router.get("/analytics", response_model=LearningAnalytics)
async def get_learning_analytics():
    """
    Obter estatísticas do sistema de aprendizado
    
    Retorna:
    - Total de correções recebidas
    - Correções por campo
    - Padrões de erro mais comuns
    - Melhoria média de confiança
    """
    try:
        storage = get_feedback_storage()
        analytics = storage.get_analytics()
        patterns = storage.get_patterns()
        
        # Converter patterns para modelo
        pattern_models = [
            CorrectionPattern(
                field=p['field'],
                original_pattern=p['original_pattern'],
                corrected_pattern=p['corrected_pattern'],
                frequency=p['frequency'],
                confidence_drop=1.0 - p.get('avg_confidence', 0.5),
                examples=[
                    {
                        'pet_id': ex['pet_id'],
                        'timestamp': ex['timestamp'],
                        'comment': ex.get('comment', '')
                    }
                    for ex in p.get('examples', [])
                ]
            )
            for p in patterns[:10]  # Top 10
        ]
        
        return LearningAnalytics(
            total_corrections=analytics.get('total_corrections', 0),
            corrections_by_field=analytics.get('corrections_by_field', {}),
            common_patterns=pattern_models,
            avg_confidence_improvement=analytics.get('avg_confidence_before_correction', 0.0),
            last_updated=analytics.get('last_updated', None)
        )
    
    except Exception as e:
        logger.error(f"Erro ao buscar analytics: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro ao buscar analytics: {str(e)}")


@router.get("/suggestions", response_model=List[FeedbackSuggestion])
async def get_improvement_suggestions():
    """
    Obter sugestões de melhoria baseadas em padrões de erro
    
    Analisa correções recebidas e sugere:
    - Melhorias no prompt de IA
    - Regras de pós-processamento
    - Ajustes de validação
    """
    try:
        storage = get_feedback_storage()
        suggestions_data = storage.generate_suggestions()
        
        # Converter para modelo
        suggestions = [
            FeedbackSuggestion(
                suggestion_type=s['type'],
                description=s['description'],
                affected_field=s['affected_field'],
                expected_impact=min(s['frequency'] / 10.0, 1.0),  # Normalizar
                priority=s['priority'],
                implementation_notes=s.get('recommendation', '')
            )
            for s in suggestions_data
        ]
        
        return suggestions
    
    except Exception as e:
        logger.error(f"Erro ao gerar sugestões: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro ao gerar sugestões: {str(e)}")


@router.get("/patterns", response_model=List[CorrectionPattern])
async def get_correction_patterns(
    field: str = None,
    min_frequency: int = 2
):
    """
    Obter padrões de erro detectados
    
    Args:
        field: Filtrar por campo específico (name, type, date_administered, etc.)
        min_frequency: Frequência mínima para considerar um padrão
    """
    try:
        storage = get_feedback_storage()
        patterns = storage.get_patterns()
        
        # Filtrar
        if field:
            patterns = [p for p in patterns if p['field'] == field]
        
        patterns = [p for p in patterns if p['frequency'] >= min_frequency]
        
        # Converter para modelo
        pattern_models = [
            CorrectionPattern(
                field=p['field'],
                original_pattern=p['original_pattern'],
                corrected_pattern=p['corrected_pattern'],
                frequency=p['frequency'],
                confidence_drop=1.0 - p.get('avg_confidence', 0.5),
                examples=[
                    {
                        'pet_id': ex['pet_id'],
                        'timestamp': ex['timestamp'],
                        'comment': ex.get('comment', '')
                    }
                    for ex in p.get('examples', [])
                ]
            )
            for p in patterns
        ]
        
        return pattern_models
    
    except Exception as e:
        logger.error(f"Erro ao buscar padrões: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro ao buscar padrões: {str(e)}")


@router.get("/corrections", response_model=List[Dict[str, Any]])
async def get_corrections_history(
    field: str = None,
    limit: int = 50
):
    """
    Obter histórico de correções
    
    Args:
        field: Filtrar por campo específico
        limit: Número máximo de correções a retornar
    """
    try:
        storage = get_feedback_storage()
        corrections = storage.get_corrections(field=field, limit=limit)
        return corrections
    
    except Exception as e:
        logger.error(f"Erro ao buscar correções: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro ao buscar correções: {str(e)}")
