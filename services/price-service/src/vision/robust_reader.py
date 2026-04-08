"""
Serviço Integrado de Leitura de Cartões de Vacina
Combina todos os componentes para máxima confiabilidade:

1. Pré-processamento de imagem
2. Validação cruzada entre múltiplas IAs
3. Sistema de score de confiança avançado
4. Validações de sanidade automáticas

Este é o ponto de entrada principal do sistema robusto.
"""

import os
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime

from .cross_validation_service import CrossValidationService
from .image_preprocessing import ImagePreprocessor
from .confidence_scorer import ConfidenceScorer

logger = logging.getLogger(__name__)


class RobustVaccineCardReader:
    """
    Sistema robusto e confiável de leitura de cartões de vacina
    """
    
    def __init__(
        self,
        google_api_key: str,
        openai_api_key: Optional[str] = None,
        enable_preprocessing: bool = True,
        enable_cross_validation: bool = True
    ):
        """
        Inicializa o leitor robusto
        
        Args:
            google_api_key: Chave da Google AI (obrigatória)
            openai_api_key: Chave da OpenAI (opcional, para validação cruzada)
            enable_preprocessing: Se True, pré-processa imagens antes da leitura
            enable_cross_validation: Se True, usa múltiplas IAs para validação
        """
        
        # Inicializar componentes
        self.cross_validator = CrossValidationService(google_api_key, openai_api_key)
        self.preprocessor = ImagePreprocessor() if enable_preprocessing else None
        self.scorer = ConfidenceScorer()
        
        self.enable_preprocessing = enable_preprocessing
        self.enable_cross_validation = enable_cross_validation and openai_api_key is not None
        
        logger.info("🚀 RobustVaccineCardReader inicializado")
        logger.info(f"   ✅ Pré-processamento: {'Ativado' if enable_preprocessing else 'Desativado'}")
        logger.info(f"   ✅ Validação cruzada: {'Ativada' if self.enable_cross_validation else 'Desativada'}")
    
    async def extract_vaccines_from_image(
        self,
        image_bytes: bytes,
        pet_id: str,
        options: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Extrai vacinas de uma imagem com máxima confiabilidade
        
        Args:
            image_bytes: Imagem em bytes
            pet_id: ID do pet
            options: Opções adicionais:
                - aggressive_preprocessing: bool (usar processamento agressivo)
                - force_cross_validation: bool (forçar validação cruzada)
                - skip_preprocessing: bool (pular pré-processamento)
        
        Returns:
            Dict com:
                - vaccines: Lista de vacinas extraídas
                - confidence: Score de confiança geral
                - confidence_details: Detalhamento do score
                - metadata: Metadados do processamento
                - recommendations: Recomendações de ação
        """
        
        start_time = datetime.now()
        options = options or {}
        
        try:
            logger.info(f"📝 Iniciando extração para pet_id={pet_id}")
            
            # ETAPA 1: Pré-processamento de imagem
            preprocessed_bytes = image_bytes
            preprocessing_metadata = {}
            
            if self.enable_preprocessing and not options.get("skip_preprocessing"):
                logger.info("🖼️  Pré-processando imagem...")
                
                aggressive = options.get("aggressive_preprocessing", False)
                preprocessed_bytes, preprocessing_metadata = self.preprocessor.preprocess_for_ocr(
                    image_bytes,
                    aggressive=aggressive
                )
                
                logger.info(
                    f"✅ Pré-processamento concluído: "
                    f"{len(preprocessing_metadata.get('steps_applied', []))} etapas"
                )
            
            # ETAPA 2: Extração com validação cruzada (se habilitada)
            use_cross_validation = (
                self.enable_cross_validation or 
                options.get("force_cross_validation", False)
            )
            
            extraction_result = await self.cross_validator.extract_with_cross_validation(
                preprocessed_bytes,
                pet_id,
                use_cross_validation=use_cross_validation
            )
            
            vaccines = extraction_result.get("vaccines", [])
            
            logger.info(f"✅ Extração concluída: {len(vaccines)} vacinas encontradas")
            
            # ETAPA 3: Calcular scores de confiança detalhados
            logger.info("📊 Calculando scores de confiança...")
            
            confidence_result = self.scorer.calculate_overall_confidence(
                vaccines,
                image_metadata=preprocessing_metadata,
                cross_validation_metadata=extraction_result
            )
            
            # ETAPA 4: Compilar resultado final
            processing_time = (datetime.now() - start_time).total_seconds()
            
            result = {
                # Dados principais
                "vaccines": vaccines,
                "confidence": confidence_result["overall_confidence"],
                
                # Detalhes de confiança
                "confidence_details": {
                    "quality_category": confidence_result["quality_category"],
                    "breakdown": confidence_result["breakdown"],
                    "needs_review_count": confidence_result["needs_review_count"],
                    "needs_review": confidence_result["needs_review"],
                    "high_confidence_count": confidence_result["high_confidence_count"],
                    "field_scores": confidence_result["field_scores"]
                },
                
                # Recomendações
                "recommendations": confidence_result["recommendations"],
                
                # Metadados técnicos
                "metadata": {
                    "pet_id": pet_id,
                    "processing_time_seconds": processing_time,
                    "timestamp": datetime.now().isoformat(),
                    "preprocessing_enabled": self.enable_preprocessing,
                    "preprocessing_metadata": preprocessing_metadata,
                    "cross_validation_enabled": use_cross_validation,
                    "cross_validation_metadata": {
                        "engines_used": extraction_result.get("engines_compared", []),
                        "gemini_count": extraction_result.get("gemini_count"),
                        "gpt4_count": extraction_result.get("gpt4_count"),
                        "consensus_count": extraction_result.get("consensus_count")
                    } if use_cross_validation else None,
                    "engine": extraction_result.get("engine", "unknown"),
                    "version": "2.0-robust"
                },
                
                # Flag de qualidade
                "is_reliable": confidence_result["overall_confidence"] >= 0.70,
                "needs_human_review": confidence_result["needs_review_count"] > 0
            }
            
            # Log resumo
            logger.info(
                f"✅ Processamento completo em {processing_time:.2f}s "
                f"- Confiança: {result['confidence']:.1%} "
                f"({result['confidence_details']['quality_category']})"
            )
            
            return result
            
        except Exception as e:
            logger.error(f"❌ Erro na extração de vacinas: {e}", exc_info=True)
            
            return {
                "vaccines": [],
                "confidence": 0.0,
                "confidence_details": {
                    "quality_category": "erro",
                    "breakdown": {},
                    "needs_review_count": 0,
                    "needs_review": [],
                    "high_confidence_count": 0,
                    "field_scores": []
                },
                "recommendations": [
                    f"❌ Erro ao processar imagem: {str(e)}",
                    "💡 Tente com uma foto de melhor qualidade"
                ],
                "metadata": {
                    "pet_id": pet_id,
                    "processing_time_seconds": 0,
                    "timestamp": datetime.now().isoformat(),
                    "error": str(e),
                    "version": "2.0-robust"
                },
                "is_reliable": False,
                "needs_human_review": True,
                "error": str(e)
            }
    
    async def extract_from_multiple_images(
        self,
        images: List[bytes],
        pet_id: str,
        options: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Extrai vacinas de múltiplas imagens do mesmo cartão
        Consolida resultados e remove duplicatas
        
        Args:
            images: Lista de imagens em bytes
            pet_id: ID do pet
            options: Opções de processamento
        
        Returns:
            Resultado consolidado de todas as imagens
        """
        
        logger.info(f"📚 Processando {len(images)} imagens do cartão...")
        
        all_results = []
        
        # Processar cada imagem
        for idx, image_bytes in enumerate(images):
            logger.info(f"📄 Processando imagem {idx + 1}/{len(images)}")
            
            result = await self.extract_vaccines_from_image(
                image_bytes,
                pet_id,
                options
            )
            
            all_results.append(result)
        
        # Consolidar resultados
        consolidated = self._consolidate_multiple_results(all_results, pet_id)
        
        logger.info(
            f"✅ Consolidação completa: {len(consolidated['vaccines'])} vacinas únicas"
        )
        
        return consolidated
    
    def _consolidate_multiple_results(
        self,
        results: List[Dict[str, Any]],
        pet_id: str
    ) -> Dict[str, Any]:
        """Consolida resultados de múltiplas imagens"""
        
        if not results:
            return self._empty_result(pet_id)
        
        if len(results) == 1:
            return results[0]
        
        # Coletar todas as vacinas
        all_vaccines = []
        for result in results:
            all_vaccines.extend(result.get("vaccines", []))
        
        # Remover duplicatas (mesma vacina + data de aplicação)
        unique_vaccines = self._deduplicate_vaccines(all_vaccines)
        
        # Recalcular confiança para o conjunto consolidado
        # Usar a maior confiança entre as imagens como baseline
        max_confidence = max(r.get("confidence", 0) for r in results)
        
        # Bonus por consistência entre imagens
        if len(unique_vaccines) < len(all_vaccines):
            # Houve vacinas duplicadas = consistência entre imagens
            consistency_bonus = 0.05
            max_confidence = min(max_confidence + consistency_bonus, 1.0)
        
        # Calcular confiança detalhada
        confidence_result = self.scorer.calculate_overall_confidence(
            unique_vaccines,
            image_metadata=None,
            cross_validation_metadata={"overall_confidence": max_confidence}
        )
        
        return {
            "vaccines": unique_vaccines,
            "confidence": confidence_result["overall_confidence"],
            "confidence_details": {
                "quality_category": confidence_result["quality_category"],
                "breakdown": confidence_result["breakdown"],
                "needs_review_count": confidence_result["needs_review_count"],
                "needs_review": confidence_result["needs_review"],
                "high_confidence_count": confidence_result["high_confidence_count"],
                "field_scores": confidence_result["field_scores"]
            },
            "recommendations": confidence_result["recommendations"],
            "metadata": {
                "pet_id": pet_id,
                "images_processed": len(results),
                "total_vaccines_found": len(all_vaccines),
                "unique_vaccines": len(unique_vaccines),
                "duplicates_removed": len(all_vaccines) - len(unique_vaccines),
                "timestamp": datetime.now().isoformat(),
                "version": "2.0-robust-multi"
            },
            "is_reliable": confidence_result["overall_confidence"] >= 0.70,
            "needs_human_review": confidence_result["needs_review_count"] > 0
        }
    
    def _deduplicate_vaccines(self, vaccines: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Remove duplicatas de vacinas baseado em nome + data de aplicação"""
        
        seen = {}
        unique = []
        
        for vaccine in vaccines:
            # Criar chave única: nome + data de aplicação
            name = vaccine.get("name", "").lower().strip()
            date = vaccine.get("date", "")
            
            key = f"{name}|{date}"
            
            if key not in seen:
                seen[key] = vaccine
                unique.append(vaccine)
            else:
                # Já existe - manter o com maior confiança
                existing = seen[key]
                
                existing_conf = existing.get("field_confidence", {})
                new_conf = vaccine.get("field_confidence", {})
                
                existing_avg = sum(existing_conf.values()) / max(len(existing_conf), 1)
                new_avg = sum(new_conf.values()) / max(len(new_conf), 1)
                
                if new_avg > existing_avg:
                    # Substituir por versão com maior confiança
                    seen[key] = vaccine
                    unique[unique.index(existing)] = vaccine
        
        return unique
    
    def _empty_result(self, pet_id: str) -> Dict[str, Any]:
        """Resultado vazio"""
        return {
            "vaccines": [],
            "confidence": 0.0,
            "confidence_details": {
                "quality_category": "nenhuma",
                "breakdown": {},
                "needs_review_count": 0,
                "needs_review": [],
                "high_confidence_count": 0,
                "field_scores": []
            },
            "recommendations": [
                "❌ Nenhuma vacina detectada",
                "💡 Verifique se a imagem está focada e bem iluminada"
            ],
            "metadata": {
                "pet_id": pet_id,
                "timestamp": datetime.now().isoformat(),
                "version": "2.0-robust"
            },
            "is_reliable": False,
            "needs_human_review": True
        }


# ========== FUNÇÃO DE CONVENIÊNCIA ==========

async def extract_vaccines_robust(
    image_bytes: bytes,
    pet_id: str,
    google_api_key: str,
    openai_api_key: Optional[str] = None,
    **options
) -> Dict[str, Any]:
    """
    Função de conveniência para extrair vacinas com sistema robusto
    
    Args:
        image_bytes: Imagem em bytes
        pet_id: ID do pet
        google_api_key: Chave da Google AI
        openai_api_key: Chave da OpenAI (opcional)
        **options: Opções adicionais
    
    Returns:
        Resultado da extração
    """
    
    reader = RobustVaccineCardReader(
        google_api_key=google_api_key,
        openai_api_key=openai_api_key,
        enable_preprocessing=options.get("enable_preprocessing", True),
        enable_cross_validation=options.get("enable_cross_validation", True)
    )
    
    return await reader.extract_vaccines_from_image(image_bytes, pet_id, options)
