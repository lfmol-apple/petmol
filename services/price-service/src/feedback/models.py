"""Modelos de dados para sistema de feedback e aprendizado"""
from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field


class VaccineCorrectionCreate(BaseModel):
    """Correção enviada pelo usuário"""
    pet_id: str = Field(..., description="ID do pet")
    vaccine_id: Optional[str] = Field(None, description="ID da vacina (se já salva)")
    
    # Campo corrigido
    field_corrected: str = Field(..., description="Campo corrigido (name, type, date_administered, next_dose_date, veterinarian, brand)")
    original_value: str = Field(..., description="Valor original detectado pelo OCR")
    corrected_value: str = Field(..., description="Valor correto fornecido pelo usuário")
    
    # Contexto
    image_hash: Optional[str] = Field(None, description="Hash da imagem analisada")
    ocr_confidence: Optional[float] = Field(None, description="Confiança original do OCR")
    user_comment: Optional[str] = Field(None, description="Comentário adicional do usuário")
    
    # Metadados
    timestamp: datetime = Field(default_factory=datetime.now, description="Data/hora da correção")


class VaccineCorrectionResponse(BaseModel):
    """Resposta após salvar correção"""
    success: bool
    message: str
    correction_id: str
    impact: Dict[str, Any]  # Impacto da correção no sistema


class CorrectionPattern(BaseModel):
    """Padrão de erro identificado"""
    field: str
    original_pattern: str
    corrected_pattern: str
    frequency: int
    confidence_drop: float
    examples: List[Dict[str, str]]


class LearningAnalytics(BaseModel):
    """Analytics do sistema de aprendizado"""
    total_corrections: int
    corrections_by_field: Dict[str, int]
    common_patterns: List[CorrectionPattern]
    avg_confidence_improvement: float
    last_updated: datetime


class FeedbackSuggestion(BaseModel):
    """Sugestão de melhoria baseada em feedback"""
    suggestion_type: str  # prompt_improvement, preprocessing_change, validation_rule
    description: str
    affected_field: str
    expected_impact: float
    priority: str  # high, medium, low
    implementation_notes: str
