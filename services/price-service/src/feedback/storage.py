"""Armazenamento de correções e feedback"""
import json
import hashlib
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional
from collections import defaultdict, Counter


class FeedbackStorage:
    """
    Armazenamento local de correções de usuários
    
    Estrutura:
    - corrections.json: Lista de todas as correções
    - patterns.json: Padrões de erro identificados
    - analytics.json: Estatísticas agregadas
    """
    
    def __init__(self, storage_dir: str = "feedback_data"):
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(exist_ok=True)
        
        self.corrections_file = self.storage_dir / "corrections.json"
        self.patterns_file = self.storage_dir / "patterns.json"
        self.analytics_file = self.storage_dir / "analytics.json"
        
        # Inicializar arquivos se não existirem
        for file in [self.corrections_file, self.patterns_file, self.analytics_file]:
            if not file.exists():
                file.write_text("[]" if file != self.analytics_file else "{}")
    
    def save_correction(self, correction: Dict[str, Any]) -> str:
        """Salvar correção e retornar ID"""
        
        # Gerar ID único
        correction_id = hashlib.sha256(
            f"{correction['pet_id']}{correction['timestamp']}{correction['field_corrected']}".encode()
        ).hexdigest()[:16]
        
        correction['id'] = correction_id
        
        # Carregar correções existentes
        corrections = self._load_corrections()
        corrections.append(correction)
        
        # Salvar
        self.corrections_file.write_text(
            json.dumps(corrections, indent=2, ensure_ascii=False, default=str)
        )
        
        # Atualizar analytics
        self._update_analytics()
        
        # Detectar padrões
        self._detect_patterns()
        
        return correction_id
    
    def get_corrections(
        self,
        field: Optional[str] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Recuperar correções com filtros"""
        
        corrections = self._load_corrections()
        
        if field:
            corrections = [c for c in corrections if c.get('field_corrected') == field]
        
        return corrections[-limit:]
    
    def get_patterns(self) -> List[Dict[str, Any]]:
        """Recuperar padrões de erro detectados"""
        return json.loads(self.patterns_file.read_text())
    
    def get_analytics(self) -> Dict[str, Any]:
        """Recuperar estatísticas agregadas"""
        return json.loads(self.analytics_file.read_text())
    
    def _load_corrections(self) -> List[Dict[str, Any]]:
        """Carregar todas as correções"""
        return json.loads(self.corrections_file.read_text())
    
    def _update_analytics(self):
        """Atualizar estatísticas agregadas"""
        
        corrections = self._load_corrections()
        
        if not corrections:
            return
        
        # Contar por campo
        by_field = Counter(c['field_corrected'] for c in corrections)
        
        # Calcular melhoria média de confiança
        confidence_improvements = [
            c.get('ocr_confidence', 0) for c in corrections
            if c.get('ocr_confidence') is not None
        ]
        avg_confidence = sum(confidence_improvements) / len(confidence_improvements) if confidence_improvements else 0
        
        analytics = {
            'total_corrections': len(corrections),
            'corrections_by_field': dict(by_field),
            'avg_confidence_before_correction': avg_confidence,
            'last_updated': datetime.now().isoformat(),
            'most_corrected_field': by_field.most_common(1)[0][0] if by_field else None,
        }
        
        self.analytics_file.write_text(
            json.dumps(analytics, indent=2, ensure_ascii=False)
        )
    
    def _detect_patterns(self):
        """Detectar padrões de erro recorrentes"""
        
        corrections = self._load_corrections()
        
        # Agrupar por campo e padrão
        patterns_map = defaultdict(lambda: defaultdict(list))
        
        for c in corrections:
            field = c['field_corrected']
            orig = c['original_value'].lower().strip()
            corr = c['corrected_value'].lower().strip()
            
            if orig and corr and orig != corr:
                patterns_map[field][f"{orig}→{corr}"].append(c)
        
        # Criar lista de padrões
        patterns = []
        
        for field, transformations in patterns_map.items():
            for transform, examples in transformations.items():
                if len(examples) >= 2:  # Padrão aparece pelo menos 2x
                    orig, corr = transform.split('→')
                    
                    # Calcular impacto médio na confiança
                    confidences = [e.get('ocr_confidence', 0) for e in examples if e.get('ocr_confidence')]
                    avg_conf = sum(confidences) / len(confidences) if confidences else 0
                    
                    patterns.append({
                        'field': field,
                        'original_pattern': orig,
                        'corrected_pattern': corr,
                        'frequency': len(examples),
                        'avg_confidence': avg_conf,
                        'examples': [
                            {
                                'pet_id': e['pet_id'],
                                'timestamp': e['timestamp'],
                                'comment': e.get('user_comment', '')
                            }
                            for e in examples[:3]  # Máximo 3 exemplos
                        ]
                    })
        
        # Ordenar por frequência
        patterns.sort(key=lambda p: p['frequency'], reverse=True)
        
        self.patterns_file.write_text(
            json.dumps(patterns, indent=2, ensure_ascii=False, default=str)
        )
    
    def generate_suggestions(self) -> List[Dict[str, Any]]:
        """Gerar sugestões de melhoria baseadas em padrões"""
        
        patterns = self.get_patterns()
        suggestions = []
        
        for pattern in patterns[:10]:  # Top 10 padrões
            if pattern['frequency'] >= 3:  # Aparece 3+ vezes
                
                field = pattern['field']
                orig = pattern['original_pattern']
                corr = pattern['corrected_pattern']
                freq = pattern['frequency']
                
                # Gerar sugestão específica
                if field == 'type':
                    suggestions.append({
                        'type': 'prompt_improvement',
                        'priority': 'high',
                        'description': f"OCR frequentemente confunde '{orig}' com '{corr}'",
                        'affected_field': field,
                        'frequency': freq,
                        'recommendation': f"Adicionar ao prompt: 'Se detectar \"{orig}\", verifique se não é \"{corr}\"'",
                    })
                
                elif field == 'name' or field == 'brand':
                    suggestions.append({
                        'type': 'post_processing',
                        'priority': 'medium',
                        'description': f"Nome comercial '{orig}' deve ser '{corr}'",
                        'affected_field': field,
                        'frequency': freq,
                        'recommendation': f"Adicionar regra de auto-correção: {orig} → {corr}",
                    })
                
                elif field in ['date_administered', 'next_dose_date']:
                    suggestions.append({
                        'type': 'validation_rule',
                        'priority': 'high',
                        'description': f"Datas frequentemente detectadas como '{orig}' ao invés de '{corr}'",
                        'affected_field': field,
                        'frequency': freq,
                        'recommendation': 'Melhorar validação de datas e OCR de números manuscritos',
                    })
        
        return suggestions


# Singleton global
_storage = None

def get_feedback_storage() -> FeedbackStorage:
    """Obter instância singleton do storage"""
    global _storage
    if _storage is None:
        _storage = FeedbackStorage()
    return _storage
