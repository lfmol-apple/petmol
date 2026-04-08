"""
Sistema de Score de Confiança Aprimorado
Calcula métricas detalhadas de confiabilidade para cada campo extraído

Fatores considerados:
1. Concordância entre múltiplas IAs
2. Qualidade da imagem
3. Consistência dos dados (sanidade)
4. Histórico de acertos do sistema
5. Características do campo (manuscrito vs impresso)
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import logging
import re

logger = logging.getLogger(__name__)


class ConfidenceScorer:
    """Sistema avançado de scoring de confiança"""
    
    def __init__(self):
        # Pesos para diferentes fatores
        self.weights = {
            "ai_agreement": 0.40,      # 40% - Concordância entre IAs
            "data_consistency": 0.25,  # 25% - Consistência dos dados
            "image_quality": 0.20,     # 20% - Qualidade da imagem
            "field_clarity": 0.15      # 15% - Clareza do campo específico
        }
        
        # Thresholds
        self.good_confidence = 0.85
        self.medium_confidence = 0.70
        self.low_confidence = 0.50
    
    def calculate_overall_confidence(
        self,
        vaccines: List[Dict[str, Any]],
        image_metadata: Optional[Dict] = None,
        cross_validation_metadata: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Calcula confiança geral e por campo para todos os registros
        
        Returns:
            Dict com scores, categorização e recomendações
        """
        
        if not vaccines:
            return self._empty_confidence_result()
        
        # Calcular scores individuais
        field_scores = []
        needs_review = []
        high_confidence_count = 0
        
        for idx, vaccine in enumerate(vaccines):
            vaccine_score = self._score_vaccine_record(
                vaccine,
                image_metadata,
                cross_validation_metadata
            )
            
            field_scores.append(vaccine_score)
            
            # Verificar se precisa revisão
            if vaccine_score["overall"] < self.medium_confidence:
                needs_review.append({
                    "index": idx,
                    "name": vaccine.get("name", "Vacina desconhecida"),
                    "score": vaccine_score["overall"],
                    "issues": vaccine_score["issues"]
                })
            elif vaccine_score["overall"] >= self.good_confidence:
                high_confidence_count += 1
        
        # Score geral (média ponderada)
        overall_score = sum(v["overall"] for v in field_scores) / len(field_scores)
        
        # Categorizar qualidade
        quality_category = self._categorize_quality(overall_score)
        
        # Gerar recomendações
        recommendations = self._generate_recommendations(
            overall_score,
            needs_review,
            cross_validation_metadata
        )
        
        result = {
            "overall_confidence": overall_score,
            "quality_category": quality_category,
            "total_records": len(vaccines),
            "high_confidence_count": high_confidence_count,
            "needs_review_count": len(needs_review),
            "needs_review": needs_review,
            "field_scores": field_scores,
            "recommendations": recommendations,
            "breakdown": self._calculate_confidence_breakdown(field_scores)
        }
        
        logger.info(
            f"📊 Confiança calculada: {overall_score:.1%} "
            f"({quality_category}) - {len(needs_review)} precisam revisão"
        )
        
        return result
    
    def _score_vaccine_record(
        self,
        vaccine: Dict[str, Any],
        image_metadata: Optional[Dict],
        cross_validation_metadata: Optional[Dict]
    ) -> Dict[str, Any]:
        """Calcula score de confiança para um registro de vacina individual"""
        
        scores = {
            "ai_agreement": 0.0,
            "data_consistency": 0.0,
            "image_quality": 0.0,
            "field_clarity": 0.0
        }
        
        issues = []
        
        # 1. CONCORDÂNCIA ENTRE IAs (40%)
        ai_agreement_score = self._calculate_ai_agreement(
            vaccine,
            cross_validation_metadata
        )
        scores["ai_agreement"] = ai_agreement_score
        
        if ai_agreement_score < 0.7:
            issues.append({
                "type": "low_ai_agreement",
                "severity": "high",
                "message": "Baixa concordância entre IAs"
            })
        
        # 2. CONSISTÊNCIA DOS DADOS (25%)
        data_consistency_score, data_issues = self._check_data_consistency(vaccine)
        scores["data_consistency"] = data_consistency_score
        issues.extend(data_issues)
        
        # 3. QUALIDADE DA IMAGEM (20%)
        image_quality_score = self._assess_image_quality(image_metadata)
        scores["image_quality"] = image_quality_score
        
        if image_quality_score < 0.6:
            issues.append({
                "type": "low_image_quality",
                "severity": "medium",
                "message": "Qualidade da imagem pode afetar precisão"
            })
        
        # 4. CLAREZA DOS CAMPOS (15%)
        field_clarity_score = self._assess_field_clarity(vaccine)
        scores["field_clarity"] = field_clarity_score
        
        # Calcular score geral ponderado
        overall = sum(
            scores[key] * self.weights[key]
            for key in scores.keys()
        )
        
        return {
            "overall": overall,
            "scores": scores,
            "issues": issues,
            "category": self._categorize_quality(overall)
        }
    
    def _calculate_ai_agreement(
        self,
        vaccine: Dict[str, Any],
        cross_validation_metadata: Optional[Dict]
    ) -> float:
        """Calcula score baseado na concordância entre IAs"""
        
        # Se tem score de concordância individual
        if "cross_validation_agreement" in vaccine:
            return vaccine["cross_validation_agreement"]
        
        # Se tem metadados de validação cruzada
        if cross_validation_metadata:
            cross_val_used = cross_validation_metadata.get("cross_validation_used", False)
            
            if cross_val_used:
                # Verificar se vacina foi encontrada por ambas IAs
                source = vaccine.get("field_confidence", {}).get("source", "")
                
                if source == "consensus":
                    return 0.95  # Alta confiança - consenso entre IAs
                elif source in ["gemini_only", "gpt4_only"]:
                    return 0.60  # Média-baixa - apenas uma IA detectou
            
            # Fallback: usar confiança geral da validação cruzada
            return cross_validation_metadata.get("overall_confidence", 0.80)
        
        # Confiança individual por campo
        field_conf = vaccine.get("field_confidence", {})
        if field_conf:
            # Média das confianças disponíveis
            conf_values = [
                field_conf.get("name", 0.8),
                field_conf.get("date", 0.8),
                field_conf.get("next_date", 0.8),
                field_conf.get("veterinarian", 0.7)
            ]
            return sum(conf_values) / len(conf_values)
        
        # Fallback padrão
        return 0.75
    
    def _check_data_consistency(
        self,
        vaccine: Dict[str, Any]
    ) -> tuple[float, List[Dict]]:
        """
        Verifica consistência dos dados extraídos
        
        Returns:
            Tuple de (score, lista_de_issues)
        """
        
        score = 1.0
        issues = []
        
        current_date = datetime.now().date()
        
        # 1. Verificar datas
        date_str = vaccine.get("date")
        next_date_str = vaccine.get("next_date")
        
        if date_str:
            try:
                date_obj = datetime.fromisoformat(date_str).date()
                
                # Data de aplicação no futuro (muito distante)?
                if date_obj > current_date + timedelta(days=7):
                    score -= 0.3
                    issues.append({
                        "type": "future_date",
                        "severity": "high",
                        "message": f"Data de aplicação no futuro: {date_str}",
                        "field": "date"
                    })
                
                # Data muito antiga (> 20 anos)?
                if date_obj < current_date - timedelta(days=20*365):
                    score -= 0.1
                    issues.append({
                        "type": "very_old_date",
                        "severity": "low",
                        "message": f"Data muito antiga: {date_str}",
                        "field": "date"
                    })
                
                # Comparar com data de revacina
                if next_date_str:
                    try:
                        next_date_obj = datetime.fromisoformat(next_date_str).date()
                        
                        # Revacina antes da aplicação?
                        if next_date_obj < date_obj:
                            score -= 0.4
                            issues.append({
                                "type": "inverted_dates",
                                "severity": "high",
                                "message": "Data revacina < data aplicação",
                                "field": "next_date"
                            })
                        
                        # Intervalo muito curto (< 7 dias)?
                        elif (next_date_obj - date_obj).days < 7:
                            score -= 0.2
                            issues.append({
                                "type": "short_interval",
                                "severity": "medium",
                                "message": "Intervalo muito curto entre aplicação e revacina",
                                "field": "next_date"
                            })
                        
                        # Intervalo muito longo (> 5 anos)?
                        elif (next_date_obj - date_obj).days > 5*365:
                            score -= 0.1
                            issues.append({
                                "type": "long_interval",
                                "severity": "low",
                                "message": "Intervalo muito longo até revacina",
                                "field": "next_date"
                            })
                    
                    except (ValueError, TypeError):
                        score -= 0.2
                        issues.append({
                            "type": "invalid_next_date",
                            "severity": "medium",
                            "message": "Data de revacina inválida",
                            "field": "next_date"
                        })
            
            except (ValueError, TypeError):
                score -= 0.3
                issues.append({
                    "type": "invalid_date",
                    "severity": "high",
                    "message": "Data de aplicação inválida",
                    "field": "date"
                })
        else:
            # Sem data de aplicação
            score -= 0.2
            issues.append({
                "type": "missing_date",
                "severity": "medium",
                "message": "Data de aplicação não encontrada",
                "field": "date"
            })
        
        # 2. Verificar nome/tipo da vacina
        name = vaccine.get("name", "").strip()
        if not name or len(name) < 3:
            score -= 0.3
            issues.append({
                "type": "invalid_name",
                "severity": "high",
                "message": "Nome da vacina inválido ou muito curto",
                "field": "name"
            })
        
        # 3. Verificar marca comercial
        brand = vaccine.get("commercial_brand", "").strip()
        if brand:
            # Se marca contém "ou" pode indicar incerteza
            if " ou " in brand.lower():
                score -= 0.1
                issues.append({
                    "type": "uncertain_brand",
                    "severity": "low",
                    "message": "Marca comercial incerta",
                    "field": "commercial_brand"
                })
        
        # 4. Verificar flags de problemas
        validation_issues = vaccine.get("validation_issues", [])
        if validation_issues:
            score -= 0.15 * min(len(validation_issues), 3)  # Máximo -0.45
            for issue in validation_issues:
                issues.append({
                    "type": "validation_flag",
                    "severity": "medium",
                    "message": f"Flag de validação: {issue}",
                    "field": "various"
                })
        
        # Garantir que score não fique negativo
        score = max(score, 0.0)
        
        return score, issues
    
    def _assess_image_quality(self, image_metadata: Optional[Dict]) -> float:
        """Avalia qualidade da imagem baseado em metadados"""
        
        if not image_metadata:
            return 0.75  # Score padrão sem metadados
        
        score = 1.0
        
        # Verificar resolução
        original_size = image_metadata.get("original_size", (0, 0))
        if original_size:
            width, height = original_size
            pixels = width * height
            
            # Imagem muito pequena (< 500k pixels)?
            if pixels < 500_000:
                score -= 0.3
            # Imagem pequena (< 1M pixels)?
            elif pixels < 1_000_000:
                score -= 0.15
        
        # Verificar se houve muitos passos de processamento (indica problemas)
        steps_applied = image_metadata.get("steps_applied", [])
        if len(steps_applied) > 6:
            score -= 0.1  # Muitas correções = imagem problemática
        
        # Verificar se houve erro no processamento
        if "error" in image_metadata:
            score -= 0.2
        
        return max(score, 0.2)  # Mínimo 0.2
    
    def _assess_field_clarity(self, vaccine: Dict[str, Any]) -> float:
        """Avalia clareza dos campos específicos"""
        
        # Usar confiança por campo se disponível
        field_conf = vaccine.get("field_confidence", {})
        if field_conf:
            # Calcular média ponderada das confianças
            weights = {
                "name": 0.30,
                "date": 0.35,
                "next_date": 0.20,
                "veterinarian": 0.15
            }
            
            weighted_sum = 0.0
            total_weight = 0.0
            
            for field, weight in weights.items():
                conf = field_conf.get(field)
                if conf is not None and isinstance(conf, (int, float)):
                    weighted_sum += conf * weight
                    total_weight += weight
            
            if total_weight > 0:
                return weighted_sum / total_weight
        
        # Fallback: análise heurística
        score = 0.8
        
        # Penalizar campos vazios importantes
        if not vaccine.get("date"):
            score -= 0.15
        if not vaccine.get("name"):
            score -= 0.20
        
        return max(score, 0.3)
    
    def _categorize_quality(self, score: float) -> str:
        """Categoriza score em níveis de qualidade"""
        
        if score >= self.good_confidence:
            return "excelente"
        elif score >= self.medium_confidence:
            return "boa"
        elif score >= self.low_confidence:
            return "regular"
        else:
            return "baixa"
    
    def _generate_recommendations(
        self,
        overall_score: float,
        needs_review: List[Dict],
        cross_validation_metadata: Optional[Dict]
    ) -> List[str]:
        """Gera recomendações baseadas no score"""
        
        recommendations = []
        
        # Score baixo
        if overall_score < self.medium_confidence:
            recommendations.append(
                "⚠️ Confiança baixa - revisão manual OBRIGATÓRIA antes de importar"
            )
            
            if cross_validation_metadata and not cross_validation_metadata.get("cross_validation_used"):
                recommendations.append(
                    "💡 Considere reprocessar com validação cruzada ativada"
                )
        
        # Score médio
        elif overall_score < self.good_confidence:
            recommendations.append(
                "👀 Confiança média - revisar campos destacados antes de importar"
            )
        
        # Score alto
        else:
            recommendations.append(
                "✅ Alta confiança - pode importar com segurança"
            )
        
        # Recomendações específicas
        if needs_review:
            recommendations.append(
                f"🔍 {len(needs_review)} registro(s) precisam de atenção especial"
            )
            
            # Analisar tipos de problemas comuns
            common_issues = {}
            for item in needs_review:
                for issue in item.get("issues", []):
                    issue_type = issue["type"]
                    common_issues[issue_type] = common_issues.get(issue_type, 0) + 1
            
            # Sugerir ações para problemas comuns
            if common_issues.get("low_ai_agreement", 0) > 2:
                recommendations.append(
                    "📸 Múltiplas divergências entre IAs - considere foto com melhor qualidade"
                )
            
            if common_issues.get("future_date", 0) > 0:
                recommendations.append(
                    "📅 Datas futuras detectadas - verificar anos manuscritos (ex: 2026 pode ser 2016)"
                )
            
            if common_issues.get("inverted_dates", 0) > 0:
                recommendations.append(
                    "🔄 Datas invertidas detectadas - revisar datas de aplicação vs revacina"
                )
        
        # Qualidade da imagem
        if cross_validation_metadata:
            image_meta = cross_validation_metadata.get("image_metadata", {})
            if image_meta.get("original_size"):
                width, height = image_meta["original_size"]
                if width * height < 1_000_000:
                    recommendations.append(
                        "📱 Imagem de baixa resolução - foto com mais qualidade pode melhorar precisão"
                    )
        
        return recommendations
    
    def _calculate_confidence_breakdown(
        self,
        field_scores: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Calcula breakdown detalhado das confianças por categoria"""
        
        if not field_scores:
            return {}
        
        # Agregar scores por categoria
        ai_agreement_scores = [s["scores"]["ai_agreement"] for s in field_scores]
        data_consistency_scores = [s["scores"]["data_consistency"] for s in field_scores]
        image_quality_scores = [s["scores"]["image_quality"] for s in field_scores]
        field_clarity_scores = [s["scores"]["field_clarity"] for s in field_scores]
        
        return {
            "ai_agreement": {
                "average": sum(ai_agreement_scores) / len(ai_agreement_scores),
                "weight": self.weights["ai_agreement"]
            },
            "data_consistency": {
                "average": sum(data_consistency_scores) / len(data_consistency_scores),
                "weight": self.weights["data_consistency"]
            },
            "image_quality": {
                "average": sum(image_quality_scores) / len(image_quality_scores),
                "weight": self.weights["image_quality"]
            },
            "field_clarity": {
                "average": sum(field_clarity_scores) / len(field_clarity_scores),
                "weight": self.weights["field_clarity"]
            }
        }
    
    def _empty_confidence_result(self) -> Dict[str, Any]:
        """Resultado para quando não há vacinas"""
        return {
            "overall_confidence": 0.0,
            "quality_category": "nenhuma",
            "total_records": 0,
            "high_confidence_count": 0,
            "needs_review_count": 0,
            "needs_review": [],
            "field_scores": [],
            "recommendations": [
                "❌ Nenhuma vacina detectada - verifique a qualidade da imagem"
            ],
            "breakdown": {}
        }
