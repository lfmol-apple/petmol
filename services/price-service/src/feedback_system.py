"""
Sistema de Feedback e Aprendizado para OCR de Vacinas

Permite coletar correções dos usuários e usar para:
1. Melhorar prompts automaticamente
2. Fine-tuning futuro do modelo
3. Análise de padrões de erro
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/feedback", tags=["feedback"])

# Diretório para armazenar feedbacks
FEEDBACK_DIR = Path("data/feedback")
FEEDBACK_DIR.mkdir(parents=True, exist_ok=True)


class VaccineFeedback(BaseModel):
    """Feedback de correção de uma vacina"""
    image_id: str
    pet_id: Optional[str] = None
    
    # O que a IA detectou
    detected: Dict[str, Any]  # {name, commercial_brand, date, type, etc}
    
    # O que o usuário corrigiu
    corrected: Dict[str, Any]  # {name, commercial_brand, date, type, etc}
    
    # Metadados
    user_id: Optional[str] = None
    timestamp: Optional[datetime] = None
    confidence_score: Optional[float] = None
    
    # Tipo de erro
    error_type: Optional[str] = None  # "name", "date", "type", "brand", "missing", "extra"


class FeedbackStats(BaseModel):
    """Estatísticas de feedback"""
    total_feedbacks: int
    common_errors: Dict[str, int]
    accuracy_by_brand: Dict[str, float]
    improvement_suggestions: List[str]


@router.post("/vaccine-correction")
async def submit_vaccine_correction(feedback: VaccineFeedback):
    """
    Endpoint para usuário enviar correção de vacina detectada
    
    Exemplo de uso:
    ```
    POST /feedback/vaccine-correction
    {
        "image_id": "abc123",
        "detected": {
            "commercial_brand": "Nobivac Canine 1-Dx",
            "type": "Vacina Múltipla",
            "date": "2021-11-05"
        },
        "corrected": {
            "commercial_brand": "Canigen R",
            "type": "Raiva (Antirrábica)",
            "date": "2021-11-05"
        },
        "error_type": "brand"
    }
    ```
    """
    
    try:
        # Adicionar timestamp
        if not feedback.timestamp:
            feedback.timestamp = datetime.now()
        
        # Determinar tipo de erro automaticamente se não fornecido
        if not feedback.error_type:
            feedback.error_type = _determine_error_type(
                feedback.detected, 
                feedback.corrected
            )
        
        # Salvar feedback em arquivo JSON
        feedback_file = FEEDBACK_DIR / f"feedback_{feedback.timestamp.strftime('%Y%m%d_%H%M%S')}_{feedback.image_id}.json"
        
        with open(feedback_file, 'w', encoding='utf-8') as f:
            json.dump(feedback.dict(), f, indent=2, default=str, ensure_ascii=False)
        
        logger.info(f"✅ Feedback salvo: {feedback_file.name}")
        logger.info(f"   Erro tipo: {feedback.error_type}")
        logger.info(f"   Detectado: {feedback.detected.get('commercial_brand', 'N/A')}")
        logger.info(f"   Corrigido: {feedback.corrected.get('commercial_brand', 'N/A')}")
        
        # Analisar e sugerir melhorias
        suggestions = _analyze_feedback_and_suggest(feedback)
        
        return {
            "success": True,
            "message": "Feedback recebido com sucesso!",
            "feedback_id": feedback_file.stem,
            "suggestions": suggestions,
            "thank_you": "Obrigado por ajudar a melhorar o sistema! 🙏"
        }
        
    except Exception as e:
        logger.error(f"❌ Erro ao salvar feedback: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats", response_model=FeedbackStats)
async def get_feedback_stats():
    """
    Retorna estatísticas agregadas dos feedbacks
    """
    
    try:
        feedbacks = _load_all_feedbacks()
        
        if not feedbacks:
            return FeedbackStats(
                total_feedbacks=0,
                common_errors={},
                accuracy_by_brand={},
                improvement_suggestions=[]
            )
        
        # Contar erros comuns
        error_counts = {}
        brand_corrections = {}
        
        for fb in feedbacks:
            error_type = fb.get('error_type', 'unknown')
            error_counts[error_type] = error_counts.get(error_type, 0) + 1
            
            # Rastrear correções por marca
            detected_brand = fb.get('detected', {}).get('commercial_brand', '')
            corrected_brand = fb.get('corrected', {}).get('commercial_brand', '')
            
            if detected_brand and corrected_brand and detected_brand != corrected_brand:
                key = f"{detected_brand} → {corrected_brand}"
                brand_corrections[key] = brand_corrections.get(key, 0) + 1
        
        # Gerar sugestões de melhoria
        suggestions = _generate_improvement_suggestions(error_counts, brand_corrections)
        
        return FeedbackStats(
            total_feedbacks=len(feedbacks),
            common_errors=error_counts,
            accuracy_by_brand=brand_corrections,
            improvement_suggestions=suggestions
        )
        
    except Exception as e:
        logger.error(f"❌ Erro ao gerar estatísticas: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/training-data")
async def get_training_data(limit: int = 100):
    """
    Retorna dados formatados para treinamento/fine-tuning
    
    Formato adequado para fine-tuning do Gemini
    """
    
    try:
        feedbacks = _load_all_feedbacks()
        
        if not feedbacks:
            return {"training_examples": [], "count": 0}
        
        training_examples = []
        
        for fb in feedbacks[:limit]:
            # Formatar como par input/output para treinamento
            example = {
                "input": {
                    "image_description": "Cartão de vacina veterinária",
                    "detected_by_model": fb.get('detected', {})
                },
                "expected_output": fb.get('corrected', {}),
                "error_type": fb.get('error_type', ''),
                "feedback_date": fb.get('timestamp', '')
            }
            training_examples.append(example)
        
        return {
            "training_examples": training_examples,
            "count": len(training_examples),
            "total_available": len(feedbacks),
            "ready_for_finetune": len(feedbacks) >= 100,
            "note": "Recomenda-se 1000+ exemplos para fine-tuning efetivo"
        }
        
    except Exception as e:
        logger.error(f"❌ Erro ao gerar dados de treino: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _determine_error_type(detected: Dict, corrected: Dict) -> str:
    """Determina o tipo de erro com base na diferença entre detectado e corrigido"""
    
    if detected.get('commercial_brand') != corrected.get('commercial_brand'):
        return "brand"
    
    if detected.get('type') != corrected.get('type'):
        return "type"
    
    if detected.get('date') != corrected.get('date'):
        return "date"
    
    if detected.get('veterinarian') != corrected.get('veterinarian'):
        return "veterinarian"
    
    return "other"


def _analyze_feedback_and_suggest(feedback: VaccineFeedback) -> List[str]:
    """Analisa feedback e sugere melhorias no prompt"""
    
    suggestions = []
    
    detected_brand = feedback.detected.get('commercial_brand', '').lower()
    corrected_brand = feedback.corrected.get('commercial_brand', '').lower()
    
    # Confusão Canigen vs Nobivac
    if 'nobivac' in detected_brand and 'canigen' in corrected_brand:
        suggestions.append(
            "⚠️ Confusão detectada: Nobivac ↔ Canigen. "
            "Sugestão: Adicionar validação de logo e texto específico da marca."
        )
    
    # Confusão de letra (B vs R)
    if 'canigen b' in detected_brand and 'canigen r' in corrected_brand:
        suggestions.append(
            "⚠️ Confusão B/R em Canigen. "
            "Sugestão: Melhorar prompt para distinguir 'B' de 'R' em logos circulares."
        )
    
    # Data incorreta
    if feedback.error_type == 'date':
        suggestions.append(
            "⚠️ Erro de data detectado. "
            "Sugestão: Adicionar validação de formato e contexto temporal."
        )
    
    return suggestions


def _load_all_feedbacks() -> List[Dict]:
    """Carrega todos os feedbacks salvos"""
    
    feedbacks = []
    
    for feedback_file in FEEDBACK_DIR.glob("feedback_*.json"):
        try:
            with open(feedback_file, 'r', encoding='utf-8') as f:
                feedback = json.load(f)
                feedbacks.append(feedback)
        except Exception as e:
            logger.warning(f"⚠️ Erro ao carregar {feedback_file.name}: {e}")
            continue
    
    # Ordenar por timestamp (mais recente primeiro)
    feedbacks.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
    
    return feedbacks


def _generate_improvement_suggestions(
    error_counts: Dict[str, int], 
    brand_corrections: Dict[str, int]
) -> List[str]:
    """Gera sugestões de melhoria com base nos padrões de erro"""
    
    suggestions = []
    
    # Erro mais comum
    if error_counts:
        most_common = max(error_counts, key=error_counts.get)
        count = error_counts[most_common]
        suggestions.append(
            f"📊 Erro mais comum: '{most_common}' ({count}x). "
            f"Priorize melhorias nesta área."
        )
    
    # Correções de marca mais frequentes
    if brand_corrections:
        for correction, count in sorted(brand_corrections.items(), key=lambda x: x[1], reverse=True)[:3]:
            suggestions.append(
                f"🔄 Correção frequente: {correction} ({count}x)"
            )
    
    # Sugestão de fine-tuning
    total = sum(error_counts.values())
    if total >= 100:
        suggestions.append(
            f"✅ Você tem {total} feedbacks! "
            f"Considere fazer fine-tuning do modelo para melhorar drasticamente."
        )
    elif total >= 10:
        suggestions.append(
            f"📈 {total} feedbacks coletados. "
            f"Continue coletando para atingir 100+ e fazer fine-tuning."
        )
    
    return suggestions
