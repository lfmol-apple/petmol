"""
Vision AI Service - Gemini Integration
Handles communication with Google Gemini AI for image analysis
"""

import google.generativeai as genai
from typing import List, Dict, Any, Optional
import json
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


class VisionService:
    """Serviço de visão AI usando Gemini"""
    
    def __init__(self, api_key: str):
        """
        Inicializa o serviço com a chave API do Google
        
        Args:
            api_key: Chave da Google AI (GOOGLE_API_KEY)
        """
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-1.5-flash')

    @staticmethod
    def _detect_mime_type(image_bytes: bytes) -> str:
        if image_bytes.startswith(b'\x89PNG\r\n\x1a\n'):
            return "image/png"
        if image_bytes.startswith(b'\xff\xd8\xff'):
            return "image/jpeg"
        if image_bytes[:4] == b'RIFF' and image_bytes[8:12] == b'WEBP':
            return "image/webp"
        return "image/jpeg"

    @staticmethod
    def _strip_json_fences(response_text: str) -> str:
        text = response_text.strip()
        if text.startswith("```json"):
            return text.replace("```json", "").replace("```", "").strip()
        if text.startswith("```"):
            return text.replace("```", "").strip()
        return text

    async def identify_product_from_image(
        self,
        image_bytes: bytes,
        pet_id: str,
        hint: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Identifica um produto pet a partir de uma foto da embalagem.

        Retorna um payload estruturado para o frontend preencher o sheet atual.
        """
        category_hint = (hint or "other").strip().lower()
        category_guidance = {
            "food": "Para ração/alimento: (1) leia a MARCA exata na embalagem (ex: Royal Canin, Premier, Hills, Purina, Farmina, Guabi); (2) leia a LINHA específica do produto — geralmente abaixo da marca (ex: Veterinary Diet, Urinary, Digestive, Starter, Light, Indoor); (3) extraia espécie (cão/gato), faixa etária (filhote/adulto/sênior) e peso da embalagem. O name DEVE ser marca + linha, ex: 'Royal Canin Veterinary Diet Urinary Small Dog 1,5kg'.",
            "medication": "Para medicamento, procure nome comercial, princípio ativo, concentração, laboratório/fabricante e apresentação. Exemplos: Apoquel, Prediderm, Amoxicilina, Simparic, Otomax, Dermotrat.",
            "antiparasite": "Para antiparasitário, procure marca comercial, faixa de peso e apresentação. Exemplos: Bravecto, NexGard, Simparica, Frontline, Revolution.",
            "dewormer": "Para vermífugo, procure nome comercial e apresentação. Exemplos: Drontal, Milbemax, Canex, Panacur.",
            "collar": "Para coleira, procure marca e tamanho/faixa de peso. Exemplos: Seresto, Scalibor, Foresto.",
            "hygiene": "Para higiene, procure nome do produto, marca e volume/peso. Exemplos: shampoo, tapete higiênico, areia, lenço umedecido.",
            "other": "Se não houver categoria clara, identifique o produto pet mais provável lendo marca, nome e apresentação.",
        }.get(category_hint, "Se houver categoria esperada, use-a para desempatar o produto mais provável.")

        prompt = f"""
Você é um especialista em identificar produtos pet por imagem de embalagem.

Objetivo:
- Ler visualmente a foto da embalagem.
- Identificar o produto mais provável.
- Priorizar produtos pet reais, especialmente ração, antipulgas, vermífugo, coleira, medicamento e higiene.
- Se a imagem estiver ambígua ou ilegível, diga que não encontrou.

Contexto:
- Pet ID: {pet_id}
- Categoria esperada: {hint or 'não informada'}
- Diretriz específica: {category_guidance}

Regras:
1. O frontend precisa de um candidato para confirmação. Se você conseguir ler QUALQUER nome plausível de produto, marca ou linha da embalagem, prefira retornar um melhor palpite em vez de found=false.
2. Use nomes comerciais claros, por exemplo: "Royal Canin Veterinary Diet Urinary Small Dog".
3. Se conseguir, separe brand e name.
4. A categoria deve ser uma destas: food, medication, antiparasite, dewormer, collar, hygiene, other.
5. Se houver peso/apresentação visível, extraia em weight e presentation.
6. Leia texto visível da embalagem como OCR visual: marca, linha, concentração, peso, espécie, faixa etária, indicação veterinária.
7. Se a categoria esperada estiver informada, use isso para priorizar candidatos dessa categoria e evitar cair em other.
8. Para medication: se houver nome comercial OU princípio ativo legível, retorne esse texto em name mesmo com confiança moderada.
9. Só retorne found=false quando a imagem estiver realmente ilegível, cortada demais ou sem embalagem útil.
10. Responda APENAS JSON válido.

Formato JSON obrigatório:
{{
  "found": true,
  "name": "Nome completo do produto",
  "brand": "Marca",
  "category": "food",
  "weight": "4 kg",
  "manufacturer": "Fabricante ou marca",
  "presentation": "Saco 4 kg",
  "species": "dog",
  "life_stage": "adult",
  "confidence": 0.92,
  "reason": "Resumo curto do que foi lido na embalagem"
}}

Valores válidos para species: "dog", "cat", "other", null
Valores válidos para life_stage: "puppy", "adult", "senior", "all", null

Se não encontrar:
{{
  "found": false,
  "name": null,
  "brand": null,
  "category": null,
  "weight": null,
  "manufacturer": null,
  "presentation": null,
  "species": null,
  "life_stage": null,
  "confidence": 0.0,
  "reason": "Não foi possível identificar com segurança"
}}
"""

        try:
            logger.info("Enviando imagem de produto para Gemini AI (pet_id=%s, hint=%s)", pet_id, hint)

            image_part = {
                "mime_type": self._detect_mime_type(image_bytes),
                "data": image_bytes,
            }

            response = self.model.generate_content(
                [prompt, image_part],
                request_options={"timeout": 20},
            )
            response_text = self._strip_json_fences(response.text)
            result = json.loads(response_text)

            allowed_categories = {"food", "medication", "antiparasite", "dewormer", "collar", "hygiene", "other"}
            category = result.get("category")
            if category not in allowed_categories:
                result["category"] = hint if hint in allowed_categories else "other"

            result["found"] = bool(result.get("found") and result.get("name"))
            result["confidence"] = float(result.get("confidence") or 0.0)
            result["name"] = result.get("name") or None
            result["brand"] = result.get("brand") or None
            result["weight"] = result.get("weight") or None
            result["manufacturer"] = result.get("manufacturer") or result.get("brand") or None
            result["presentation"] = result.get("presentation") or result.get("weight") or None
            result["reason"] = result.get("reason") or None

            valid_species = {"dog", "cat", "other"}
            species = result.get("species")
            result["species"] = species if species in valid_species else None

            valid_stages = {"puppy", "adult", "senior", "all"}
            life_stage = result.get("life_stage")
            result["life_stage"] = life_stage if life_stage in valid_stages else None

            if not result["found"] and result["name"]:
                # O scanner precisa de um candidato para confirmação.
                # Se a IA leu um nome minimamente útil, preferimos promover isso.
                result["found"] = True

            if not result["confidence"] and result["name"]:
                result["confidence"] = 0.65

            if hint in allowed_categories and (result.get("category") == "other" or not result.get("category")):
                result["category"] = hint

            logger.info(
                "Gemini produto: found=%s category=%s confidence=%.2f name=%s",
                result["found"],
                result.get("category"),
                result["confidence"],
                result.get("name"),
            )
            return result
        except json.JSONDecodeError as e:
            logger.error("Erro ao fazer parse da resposta do Gemini para produto: %s", e)
            return {
                "found": False,
                "name": None,
                "brand": None,
                "category": hint or "other",
                "weight": None,
                "manufacturer": None,
                "presentation": None,
                "confidence": 0.0,
                "reason": "Resposta inválida da IA",
            }
        except Exception as e:
            err_str = str(e)
            if "timeout" in err_str.lower() or "deadline" in err_str.lower():
                logger.warning("Timeout Gemini ao identificar produto (pet_id=%s): %s", pet_id, err_str)
                return {
                    "found": False,
                    "name": None,
                    "brand": None,
                    "category": hint or "other",
                    "weight": None,
                    "manufacturer": None,
                    "presentation": None,
                    "confidence": 0.0,
                    "reason": "Tempo limite da IA esgotado",
                }
            logger.error("Erro ao identificar produto com Gemini: %s", err_str, exc_info=True)
            raise
    
    async def extract_vaccine_data(self, image_bytes: bytes, pet_id: str) -> Dict[str, Any]:
        """
        Extrai dados de vacinas de uma imagem de carteirinha com precisão global.
        
        Args:
            image_bytes: Imagem em bytes
            pet_id: ID do pet (para contexto)
        
        Returns:
            Dict com: vaccines (lista), confidence (float), raw_text (str)
        """
        
        # Prompt refatorado com lógica de ancoragem e PRIORIDADE NOBIVAC
        prompt = """
Você é um Especialista Veterinário Global em OCR de Carteirinhas de Vacinação.

🎯 MISSÃO: Extrair TODAS as vacinas desta imagem com precisão de 100%.

🌟 PRIORIDADE MÁXIMA NOBIVAC:
- Se encontrar texto "NOBIVAC" em QUALQUER adesivo, marca = "NOBIVAC"
- NUNCA substituir "Nobivac" por "Vanguard", "Duramune" ou outras marcas
- Variações Nobivac: "Nobivac Raiva", "Nobivac 1-Cv", "Nobivac DAPPv+L4", "Nobivac Canine"
- Se há adesivo com "NOBIVAC" e texto ilegível, ainda reportar com confiança 0.7

⚓ ETAPA 1 - LÓGICA DE ANCORAGEM (Conte Primeiro):
Antes de extrair qualquer dado, faça uma VARREDURA COMPLETA da imagem e conte:
- Quantos adesivos/etiquetas de vacina você vê? (conte visualmente)
- Quantos números de série/lote você detecta?
- Quantas marcas comerciais diferentes identifica?
- Liste as coordenadas aproximadas (topo-esquerda, topo-centro, topo-direita, meio-esquerda, etc.)

Se você contar 8 adesivos, deve retornar EXATAMENTE 8 registros no JSON.

📋 ETAPA 2 - CLASSIFICAÇÃO SEMÂNTICA GLOBAL:
Em vez de apenas buscar marcas fixas, CLASSIFIQUE a vacina pelos COMPONENTES visíveis:

CÓDIGOS DE COMPONENTES:
- "D" ou "Distemper" ou "Cinomose" → Distemper (Cinomose)
- "H" ou "Hepatitis" ou "Hepatite" → Hepatite/Adenovírus
- "P" ou "Parvo" → Parvovirose  
- "Pi" ou "Parainfluenza" → Parainfluenza
- "L" ou "Lepto" → Leptospirose
- "R" ou "Rabies" ou "Raiva" ou "Antirrábica" → Raiva (Antirrábica)
- "C" ou "Corona" → Coronavírus
- "B" ou "Bordetella" → Bordetelose (Tosse dos Canis)
- "G" ou "Giardia" → Giárdia
- "Leish" → Leishmaniose

EXEMPLOS DE CLASSIFICAÇÃO:
- Se ler "DHPPI + L" → "Vacina Múltipla (V8) - Cinomose, Hepatite, Parvo, Parainfluenza, Leptospirose"
- Se ler "Nobivac Lepto" → "Leptospirose (Nobivac)"
- Se ler "Nobivac DAPPv+L4" → "Vacina Múltipla (V10) - Nobivac DAPPv+L4"
- Se ler "Nobivac Canine 1-DAPPv+L4" → "Vacina Múltipla (V10) - Nobivac Canine"
- Se ler "Nobivac 1-Cv" → "Coronavírus (Nobivac 1-Cv)"
- Se ler "Nobivac Raiva" → "Raiva (Nobivac Raiva)"
- Se ler "Duramune Max" → "Vacina Múltipla (V10) - Duramune"
- Se ler apenas "R" no selo → "Raiva (Antirrábica)"

⚠️ REGRA CRÍTICA NOBIVAC: Se encontrar QUALQUER texto com "NOBIVAC", preserve na marca comercial EXATA, mesmo se difícil de ler.

📅 ETAPA 3 - LEITURA DE DATAS MANUSCRITAS:

FORMATOS ACEITOS:
- dd/mm/aa ou dd/mm/aaaa (Brasil: 15/03/24)
- dd.mm.aa ou dd-mm-aa (Europa: 15.03.24)
- ddmmaa ou ddmmaaaa SEM separadores (150324)
- dd Mon aa (15 Mar 24, 15 Marzo 24, 15 March 24)
- Mon dd aa (Mar 15 24, Marzo 15 24)

CORREÇÃO DE ANOS AMBÍGUOS:
⚠️ REGRA CRÍTICA: Se você ler um ano MAIOR que 2027 em uma data de aplicação:
  - Verifique se o segundo dígito pode ser um "1" mal escrito
  - Exemplo: "2026" → pode ser "2016" (dígito "2" confundido com "1")
  - Exemplo: "2029" → pode ser "2019" 
  - Exemplo: "2030" → pode ser "2010"
  - Use o contexto: vacinas antigas (5+ anos) provavelmente têm ano mal lido

CORREÇÃO DE CARACTERES MANUSCRITOS:
- "l" ou "I" ou "|" → número "1"
- "O" ou "o" → número "0" (zero)
- "S" → número "5" (quando em contexto de data)
- "G" → número "6"
- "g" minúsculo → número "9"
- "Z" → número "2"
- "B" → número "8"

🌍 MESES MULTILÍNGUE:
Português: Janeiro, Fevereiro, Março, Abril, Maio, Junho, Julho, Agosto, Setembro, Outubro, Novembro, Dezembro
Espanhol: Enero, Febrero, Marzo, Abril, Mayo, Junio, Julio, Agosto, Septiembre, Octubre, Noviembre, Diciembre  
Inglês: January, February, March, April, May, June, July, August, September, October, November, December
Abreviações: Jan, Feb/Fev, Mar, Apr/Abr, May/Mai, Jun, Jul, Aug/Ago, Sep/Set, Oct/Out, Nov, Dec/Dez

✅ ETAPA 4 - FORMATO DE SAÍDA (JSON Estrito):

{
  "total_encontrado": 8,  // DEVE bater com número de adesivos contados
  "vaccines": [
    {
      "name": "Leptospirose (Nobivac Lepto)",  // Nome classificado semanticamente
      "commercial_brand": "Nobivac Lepto",  // Marca exata do adesivo
      "components": ["Leptospirose"],  // Componentes identificados
      "date": "2024-03-15",  // YYYY-MM-DD (null se ilegível)
      "next_date": "2025-03-15",  // YYYY-MM-DD (null se não houver)
      "veterinarian": "Dr. João Silva",  // Nome do carimbo (null se ilegível)
      "notes": "Lote ABC123",  // Opcional
      "field_confidence": {  // NOVO: Confiança por campo
        "name": 0.95,
        "date": 0.80,  // Baixa se manuscrito ilegível
        "next_date": 0.90,
        "veterinarian": 0.70
      }
    }
  ],
  "overall_confidence": 0.85,
  "raw_text": "Texto OCR bruto detectado"
}

🚫 REGRAS DE SANIDADE:
1. Se total_encontrado != len(vaccines), REVISE a imagem
2. NUNCA invente datas - use null se ilegível
3. NUNCA pule colunas - varra linha por linha, esquerda→direita
4. Se data_aplicacao > data_revacina, INVERTA (erro de leitura)
5. Datas de aplicação não podem ser futuro (>hoje + 7 dias)
6. field_confidence < 0.7 em qualquer campo = marcar para revisão humana

Retorne APENAS o JSON, sem texto adicional.
"""
        
        try:
            # Enviar para Gemini
            logger.info(f"Enviando imagem para Gemini AI (pet_id={pet_id})")
            
            # Preparar imagem
            image_part = {
                "mime_type": self._detect_mime_type(image_bytes),
                "data": image_bytes
            }
            
            # Gerar resposta
            response = self.model.generate_content([prompt, image_part])
            
            # Parse da resposta
            response_text = self._strip_json_fences(response.text)
            
            # Parse JSON
            result = json.loads(response_text)
            
            # Validar estrutura
            if "vaccines" not in result:
                result["vaccines"] = []
            if "confidence" not in result:
                result["confidence"] = 0.5
            
            # Normalizar datas
            for vaccine in result["vaccines"]:
                # Garantir que datas estejam no formato correto
                if vaccine.get("date"):
                    vaccine["date"] = self._normalize_date(vaccine["date"])
                if vaccine.get("next_date"):
                    vaccine["next_date"] = self._normalize_date(vaccine["next_date"])
            
            logger.info(f"Gemini retornou {len(result['vaccines'])} vacinas com confiança {result['confidence']}")
            
            return result
            
        except json.JSONDecodeError as e:
            logger.error(f"Erro ao fazer parse da resposta do Gemini: {response_text[:200]}")
            # Retornar resposta vazia mas válida
            return {
                "vaccines": [],
                "confidence": 0.0,
                "raw_text": f"Erro ao processar resposta da IA: {str(e)}"
            }
        except Exception as e:
            logger.error(f"Erro ao chamar Gemini AI: {str(e)}", exc_info=True)
            raise
    
    def _normalize_date(self, date_str: str, kind: str = "unknown") -> str:
        """
        Normaliza diferentes formatos de data para YYYY-MM-DD (suporte global).
        
        Args:
            date_str: Data em string (vários formatos possíveis)
            kind: "aplicacao" ou "revacina" (para validação de ano ambíguo)
        
        Returns:
            Data no formato YYYY-MM-DD ou None se inválida
        """
        import re
        from datetime import date, timedelta
        
        if not date_str:
            return None
        
        s = str(date_str).strip()
        if not s:
            return None
        
        # Correção de caracteres manuscritos mal lidos
        char_fixes = {
            'l': '1', 'I': '1', '|': '1',  # l, I, pipe → 1
            'O': '0', 'o': '0',             # O → 0
            'S': '5', 's': '5',             # S → 5
            'G': '6', 'g': '9',             # G→6, g→9
            'Z': '2', 'z': '2',             # Z → 2
            'B': '8',                       # B → 8
        }
        
        # Aplicar correções se houver separadores ou números
        if any(sep in s for sep in ['/', '.', '-']) or any(c.isdigit() for c in s):
            for old_char, new_char in char_fixes.items():
                s = s.replace(old_char, new_char)
        
        today = date.today()
        current_year = today.year
        
        # Já está no formato ISO
        if len(s) == 10 and s[4] == '-' and s[7] == '-':
            try:
                y, m, d = int(s[0:4]), int(s[5:7]), int(s[8:10])
                y = self._adjust_ambiguous_year(y, kind, current_year)
                return date(y, m, d).strftime("%Y-%m-%d")
            except ValueError:
                pass
        
        # Meses por extenso (português, espanhol, inglês)
        months = {
            # Português
            "jan": 1, "janeiro": 1,
            "fev": 2, "fevereiro": 2,
            "mar": 3, "março": 3, "marco": 3,
            "abr": 4, "abril": 4,
            "mai": 5, "maio": 5,
            "jun": 6, "junho": 6,
            "jul": 7, "julho": 7,
            "ago": 8, "agosto": 8,
            "set": 9, "setembro": 9,
            "out": 10, "outubro": 10,
            "nov": 11, "novembro": 11,
            "dez": 12, "dezembro": 12,
            # Espanhol
            "ene": 1, "enero": 1,
            "feb": 2, "febrero": 2,
            "marzo": 3,
            "mayo": 5,
            "junio": 6,
            "julio": 7,
            "septiembre": 9,
            "octubre": 10,
            "noviembre": 11,
            "diciembre": 12,
            # Inglês
            "january": 1,
            "february": 2,
            "march": 3,
            "april": 4,
            "may": 5,
            "june": 6,
            "july": 7,
            "august": 8,
            "september": 9,
            "october": 10,
            "november": 11,
            "december": 12,
        }
        
        s_lower = s.lower().replace('.', ' ').replace(',', ' ')
        
        # Formato: dd Mon aa (15 Mar 24)
        m_dmy = re.search(r'\b(\d{1,2})\s+(\w{3,})\s+(\d{2,4})\b', s_lower)
        if m_dmy:
            d = int(m_dmy.group(1))
            mon = m_dmy.group(2).strip()
            y_raw = int(m_dmy.group(3))
            if mon in months:
                y = self._adjust_year(y_raw, kind, current_year)
                try:
                    return date(y, months[mon], d).strftime("%Y-%m-%d")
                except ValueError:
                    pass
        
        # Formato: Mon dd aa (Mar 15 24)
        m_mdy = re.search(r'\b(\w{3,})\s+(\d{1,2})\s+(\d{2,4})\b', s_lower)
        if m_mdy:
            mon = m_mdy.group(1).strip()
            d = int(m_mdy.group(2))
            y_raw = int(m_mdy.group(3))
            if mon in months:
                y = self._adjust_year(y_raw, kind, current_year)
                try:
                    return date(y, months[mon], d).strftime("%Y-%m-%d")
                except ValueError:
                    pass
        
        # Formato: dd/mm/aa ou dd.mm.aa ou dd-mm-aa
        m = re.search(r'\b(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{2,4})\b', s)
        if m:
            a = int(m.group(1))
            b = int(m.group(2))
            y_raw = int(m.group(3))
            y = self._adjust_year(y_raw, kind, current_year)
            
            # Tentar dd/mm (brasileiro) primeiro
            try:
                return date(y, b, a).strftime("%Y-%m-%d")
            except ValueError:
                # Tentar mm/dd (americano)
                try:
                    return date(y, a, b).strftime("%Y-%m-%d")
                except ValueError:
                    pass
        
        # Formato compacto SEM separadores: ddmmaa ou ddmmaaaa
        m_compact = re.search(r'\b(\d{6}|\d{8})\b', s)
        if m_compact:
            compact = m_compact.group(1)
            if len(compact) == 6:  # ddmmaa
                try:
                    d = int(compact[0:2])
                    m = int(compact[2:4])
                    y_raw = int(compact[4:6])
                    y = self._adjust_year(y_raw, kind, current_year)
                    return date(y, m, d).strftime("%Y-%m-%d")
                except ValueError:
                    pass
            elif len(compact) == 8:  # ddmmaaaa
                try:
                    d = int(compact[0:2])
                    m = int(compact[2:4])
                    y_raw = int(compact[4:8])
                    y = self._adjust_ambiguous_year(y_raw, kind, current_year)
                    return date(y, m, d).strftime("%Y-%m-%d")
                except ValueError:
                    pass
        
        logger.warning(f"Não foi possível normalizar data: {date_str}")
        return None
    
    def _adjust_year(self, y: int, kind: str, current_year: int) -> int:
        """Ajusta ano de 2 dígitos para 4 dígitos."""
        if y < 100:
            y = 2000 + y
        return self._adjust_ambiguous_year(y, kind, current_year)
    
    def _adjust_ambiguous_year(self, y: int, kind: str, current_year: int) -> int:
        """Corrige anos ambíguos (ex: 2026→2016, 2029→2019)."""
        # Regra de sanidade: se ano for muito futuro e for data de aplicação, corrigir
        if kind == "aplicacao" and y > current_year + 1:
            # Tenta subtrair 10, 20, 30 anos para ver se faz sentido
            for delta in [10, 20, 30]:
                candidate = y - delta
                if 2000 <= candidate <= current_year:
                    logger.info(f"Ano ambíguo corrigido: {y} → {candidate} (contexto: {kind})")
                    return candidate
        
        # Para revacina, permitir até +5 anos no futuro
        if kind == "revacina" and y > current_year + 5:
            for delta in [10, 20]:
                candidate = y - delta
                if 2000 <= candidate <= current_year + 5:
                    logger.info(f"Ano ambíguo corrigido: {y} → {candidate} (contexto: {kind})")
                    return candidate
        
        return y
