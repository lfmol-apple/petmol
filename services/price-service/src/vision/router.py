"""
Vision AI Router - Vaccine Card OCR
Extracts vaccine data from pet vaccination card images using Gemini AI
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
import base64
import os
import logging

from ..user_auth.deps import get_current_user
from ..user_auth.models import User
from .service import VisionService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/vision", tags=["vision"])


# Schemas
class VaccineExtractedData(BaseModel):
    name: str = Field(..., description="Nome da vacina (ex: V10, Antirrábica)")
    date: Optional[str] = Field(None, description="Data de aplicação (YYYY-MM-DD)")
    next_date: Optional[str] = Field(None, description="Próxima dose (YYYY-MM-DD)")
    veterinarian: Optional[str] = Field(None, description="Veterinário ou clínica")
    notes: Optional[str] = Field(None, description="Observações adicionais")


class ExtractVaccineCardRequest(BaseModel):
    image: str = Field(..., description="Imagem em base64 (jpeg, png)")
    pet_id: str = Field(..., description="ID do pet")


class ExtractVaccineCardResponse(BaseModel):
    vaccines: List[VaccineExtractedData]
    confidence: float = Field(..., description="Confiança da extração (0-1)")
    raw_text: Optional[str] = Field(None, description="Texto bruto extraído (debug)")


@router.post("/extract-vaccine-card", response_model=ExtractVaccineCardResponse)
async def extract_vaccine_card(
    request: ExtractVaccineCardRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Extrai dados de vacinas de uma foto da carteirinha
    
    **Feature flag:** FEATURE_AI_VACCINE_SCAN (deve estar habilitada)
    
    **Fluxo:**
    1. Recebe imagem em base64
    2. Envia para Gemini AI com prompt especializado
    3. Retorna dados estruturados (NÃO salva automaticamente)
    4. Frontend mostra preview e usuário confirma antes de salvar
    
    **Limitações:**
    - Máximo 4MB por imagem
    - Formatos: JPEG, PNG
    - Requer chave GOOGLE_API_KEY ou GEMINI_API_KEY configurada
    """
    
    # Verificar feature flag
    feature_enabled = os.getenv("FEATURE_AI_VACCINE_SCAN", "false").lower() == "true"
    if not feature_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Feature AI de leitura de carteirinha não está habilitada. Configure FEATURE_AI_VACCINE_SCAN=true"
        )
    
    # Verificar chave API
    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.error("GOOGLE_API_KEY ou GEMINI_API_KEY não configuradas")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Serviço de IA não configurado corretamente"
        )
    
    try:
        # Validar tamanho da imagem (máximo 4MB em base64)
        image_data = request.image
        if image_data.startswith("data:image"):
            # Remove o prefixo data:image/jpeg;base64,
            image_data = image_data.split(",")[1]
        
        image_bytes = base64.b64decode(image_data)
        image_size_mb = len(image_bytes) / (1024 * 1024)
        
        if image_size_mb > 4:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Imagem muito grande ({image_size_mb:.1f}MB). Máximo: 4MB"
            )
        
        logger.info(f"Processando imagem de vacina para pet_id={request.pet_id}, tamanho={image_size_mb:.2f}MB")
        
        # Processar com Gemini AI
        vision_service = VisionService(api_key)
        result = await vision_service.extract_vaccine_data(image_bytes, request.pet_id)
        
        logger.info(f"Extração concluída: {len(result['vaccines'])} vacinas encontradas, confiança={result['confidence']:.2f}")
        
        return ExtractVaccineCardResponse(
            vaccines=[VaccineExtractedData(**v) for v in result["vaccines"]],
            confidence=result["confidence"],
            raw_text=result.get("raw_text")
        )
        
    except base64.binascii.Error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Imagem inválida. Esperado base64 válido"
        )
    except Exception as e:
        logger.error(f"Erro ao processar imagem: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Falha ao processar a imagem. Tente novamente."
        )


@router.get("/health")
async def vision_health():
    """Healthcheck do serviço de visão AI"""
    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    feature_enabled = os.getenv("FEATURE_AI_VACCINE_SCAN", "false").lower() == "true"
    
    return {
        "status": "ok",
        "feature_enabled": feature_enabled,
        "api_configured": bool(api_key),
        "service": "vision-ai"
    }

from .document_classifier import DocumentClassifier

class DocumentClassificationRequest(BaseModel):
    image_base64: str = Field(..., description="Imagem em base64 (preferencialmente JPEG)")
    pet_id: str = Field(..., description="ID do pet dono do documento")

class ClinicInfo(BaseModel):
    nome: Optional[str]
    endereco: Optional[str]
    telefone: Optional[str]
    cnpj: Optional[str]

class VetInfo(BaseModel):
    nome: Optional[str]
    crmv: Optional[str]

class DocumentClassificationResponse(BaseModel):
    tipo_documento: Optional[str]
    categoria_aba: str
    titulo_identificado: Optional[str]
    data_documento: Optional[str]
    clinica_laboratorio: Optional[ClinicInfo]
    medico_veterinario: Optional[VetInfo]
    conteudo_resumo: Optional[str]
    contem_selo_vacina: bool = False
    contem_assinatura: bool = False
    confianca_leitura: float

@router.post(
    "/documents/classify",
    response_model=DocumentClassificationResponse,
    summary="OCR & Classificação de Documentos Pet",
    description="Analisa a imagem (receita, laudo, exame) e extrai o que é, data, clínica, vet e contexto geral."
)
async def classify_document_ocr(
    request: DocumentClassificationRequest,
    current_user: User = Depends(get_current_user)
):
    try:
        # 1. Decode base64
        try:
            image_data = base64.b64decode(request.image_base64)
        except Exception:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Imagem em formato base64 inválido.")
        
        # 2. Get API key
        api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Configuração do servidor incorreta: GOOGLE_API_KEY não definida."
            )
            
        # 3. Classify Document
        classifier = DocumentClassifier(api_key=api_key)
        classification_result = await classifier.classify_document(image_data)
        
        # O resultado já vem no formato compatível com o Pydantic model
        return classification_result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro no processamento OCR de documento: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Falha ao usar IA para classificar o documento: {str(e)}"
        )
