"""
Pré-processamento Inteligente de Imagens para OCR
Melhora qualidade das imagens antes de enviar para as IAs

Técnicas aplicadas:
1. Correção automática de brilho/contraste
2. Redução de ruído
3. Aumento de nitidez
4. Correção de perspectiva (dewarping)
5. Binarização adaptativa para texto manuscrito
6. Remoção de sombras
"""

import cv2
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter
import io
from typing import Tuple, Optional, List, Dict, Any
import logging

logger = logging.getLogger(__name__)


class ImagePreprocessor:
    """Pré-processador inteligente de imagens para OCR"""
    
    def __init__(self):
        self.target_size = (2048, 2048)  # Tamanho ideal para IAs
        self.min_confidence = 0.7  # Confiança mínima para aplicar correções
    
    def preprocess_for_ocr(
        self, 
        image_bytes: bytes,
        aggressive: bool = False
    ) -> Tuple[bytes, Dict[str, Any]]:
        """
        Pré-processa imagem para melhorar leitura OCR
        
        Args:
            image_bytes: Imagem original em bytes
            aggressive: Se True, aplica processamento mais agressivo
        
        Returns:
            Tuple de (imagem_processada_bytes, metadados_processamento)
        """
        
        try:
            # Converter bytes para PIL Image
            image = Image.open(io.BytesIO(image_bytes))
            
            # Converter RGBA para RGB se necessário
            if image.mode == 'RGBA':
                background = Image.new('RGB', image.size, (255, 255, 255))
                background.paste(image, mask=image.split()[3])
                image = background
            elif image.mode != 'RGB':
                image = image.convert('RGB')
            
            original_size = image.size
            metadata = {
                "original_size": original_size,
                "original_format": image.format,
                "steps_applied": []
            }
            
            # Converter para OpenCV para processamentos avançados
            cv_image = self._pil_to_cv2(image)
            
            # ETAPA 1: Redimensionar se muito grande ou muito pequeno
            if max(original_size) > 3000 or min(original_size) < 800:
                cv_image = self._smart_resize(cv_image)
                metadata["steps_applied"].append("resize")
            
            # ETAPA 2: Correção de perspectiva (se detectar documento inclinado)
            if aggressive:
                cv_image, skew_angle = self._deskew(cv_image)
                if abs(skew_angle) > 0.5:
                    metadata["steps_applied"].append(f"deskew_{skew_angle:.1f}deg")
            
            # ETAPA 3: Remoção de sombras
            cv_image = self._remove_shadows(cv_image)
            metadata["steps_applied"].append("shadow_removal")
            
            # ETAPA 4: Correção de brilho e contraste adaptativo
            cv_image = self._auto_adjust_brightness_contrast(cv_image)
            metadata["steps_applied"].append("auto_brightness_contrast")
            
            # ETAPA 5: Redução de ruído
            cv_image = self._denoise(cv_image)
            metadata["steps_applied"].append("denoise")
            
            # ETAPA 6: Aumento de nitidez
            cv_image = self._sharpen(cv_image)
            metadata["steps_applied"].append("sharpen")
            
            # ETAPA 7: Melhorar contraste de texto (CLAHE)
            cv_image = self._enhance_text_contrast(cv_image)
            metadata["steps_applied"].append("clahe")
            
            # Converter de volta para PIL
            processed_image = self._cv2_to_pil(cv_image)
            
            # ETAPA 8: Ajuste final de nitidez com PIL
            processed_image = processed_image.filter(ImageFilter.UnsharpMask(radius=1, percent=120))
            
            # Converter para bytes
            output = io.BytesIO()
            processed_image.save(output, format='JPEG', quality=95, optimize=True)
            processed_bytes = output.getvalue()
            
            metadata["final_size"] = processed_image.size
            metadata["size_reduction"] = f"{len(image_bytes) / 1024:.1f}KB → {len(processed_bytes) / 1024:.1f}KB"
            
            logger.info(
                f"✅ Imagem pré-processada: {len(metadata['steps_applied'])} etapas aplicadas"
            )
            
            return processed_bytes, metadata
            
        except Exception as e:
            logger.error(f"❌ Erro no pré-processamento: {e}")
            # Retornar imagem original em caso de erro
            return image_bytes, {"error": str(e), "steps_applied": []}
    
    def create_multiple_versions(
        self,
        image_bytes: bytes
    ) -> List[Tuple[bytes, str, Dict]]:
        """
        Cria múltiplas versões da imagem com diferentes processamentos
        Útil para enviar várias versões para a IA e escolher a melhor
        
        Returns:
            Lista de (imagem_bytes, nome_versao, metadados)
        """
        
        versions = []
        
        try:
            # Versão 1: Original
            versions.append((
                image_bytes,
                "original",
                {"description": "Imagem original sem processamento"}
            ))
            
            # Versão 2: Processamento padrão
            processed_std, meta_std = self.preprocess_for_ocr(image_bytes, aggressive=False)
            versions.append((
                processed_std,
                "standard",
                meta_std
            ))
            
            # Versão 3: Processamento agressivo
            processed_agg, meta_agg = self.preprocess_for_ocr(image_bytes, aggressive=True)
            versions.append((
                processed_agg,
                "aggressive",
                meta_agg
            ))
            
            # Versão 4: Alta nitidez (para texto pequeno)
            high_sharp, meta_sharp = self._create_high_sharpness_version(image_bytes)
            versions.append((
                high_sharp,
                "high_sharpness",
                meta_sharp
            ))
            
            # Versão 5: Alto contraste (para manuscrito)
            high_contrast, meta_contrast = self._create_high_contrast_version(image_bytes)
            versions.append((
                high_contrast,
                "high_contrast",
                meta_contrast
            ))
            
            logger.info(f"✅ Criadas {len(versions)} versões da imagem")
            
            return versions
            
        except Exception as e:
            logger.error(f"❌ Erro ao criar múltiplas versões: {e}")
            return [(image_bytes, "original", {"error": str(e)})]
    
    # ========== MÉTODOS DE PROCESSAMENTO ==========
    
    def _smart_resize(self, cv_image: np.ndarray) -> np.ndarray:
        """Redimensiona mantendo proporção e qualidade"""
        
        height, width = cv_image.shape[:2]
        
        # Calcular novo tamanho mantendo aspect ratio
        if width > height:
            new_width = min(width, 2048)
            new_height = int(height * (new_width / width))
        else:
            new_height = min(height, 2048)
            new_width = int(width * (new_height / height))
        
        # Usar interpolação de alta qualidade
        resized = cv2.resize(
            cv_image,
            (new_width, new_height),
            interpolation=cv2.INTER_LANCZOS4
        )
        
        return resized
    
    def _deskew(self, cv_image: np.ndarray) -> Tuple[np.ndarray, float]:
        """
        Detecta e corrige inclinação da imagem (deskew)
        
        Returns:
            Tuple de (imagem_corrigida, angulo_correcao)
        """
        
        try:
            # Converter para escala de cinza
            gray = cv2.cvtColor(cv_image, cv2.COLOR_BGR2GRAY)
            
            # Binarização
            thresh = cv2.threshold(
                gray, 0, 255, 
                cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
            )[1]
            
            # Detectar linhas com transformada de Hough
            coords = np.column_stack(np.where(thresh > 0))
            angle = cv2.minAreaRect(coords)[2]
            
            # Ajustar ângulo
            if angle < -45:
                angle = 90 + angle
            elif angle > 45:
                angle = angle - 90
            
            # Se inclinação insignificante, não corrigir
            if abs(angle) < 0.5:
                return cv_image, 0.0
            
            # Aplicar rotação
            (h, w) = cv_image.shape[:2]
            center = (w // 2, h // 2)
            M = cv2.getRotationMatrix2D(center, angle, 1.0)
            rotated = cv2.warpAffine(
                cv_image, M, (w, h),
                flags=cv2.INTER_CUBIC,
                borderMode=cv2.BORDER_REPLICATE
            )
            
            logger.info(f"🔧 Correção de inclinação: {angle:.1f}°")
            
            return rotated, angle
            
        except Exception as e:
            logger.warning(f"⚠️ Erro ao corrigir inclinação: {e}")
            return cv_image, 0.0
    
    def _remove_shadows(self, cv_image: np.ndarray) -> np.ndarray:
        """Remove sombras usando técnica de dilatação"""
        
        try:
            # Converter para escala de cinza
            gray = cv2.cvtColor(cv_image, cv2.COLOR_BGR2GRAY)
            
            # Dilatar para criar background
            dilated = cv2.dilate(
                gray, 
                np.ones((7, 7), np.uint8),
                iterations=1
            )
            
            # Blur do background
            bg = cv2.medianBlur(dilated, 21)
            
            # Subtrair background do original
            diff = 255 - cv2.absdiff(gray, bg)
            
            # Normalizar
            norm = cv2.normalize(
                diff, None, 
                alpha=0, beta=255,
                norm_type=cv2.NORM_MINMAX,
                dtype=cv2.CV_8UC1
            )
            
            # Converter de volta para BGR
            result = cv2.cvtColor(norm, cv2.COLOR_GRAY2BGR)
            
            return result
            
        except Exception as e:
            logger.warning(f"⚠️ Erro ao remover sombras: {e}")
            return cv_image
    
    def _auto_adjust_brightness_contrast(self, cv_image: np.ndarray) -> np.ndarray:
        """Ajusta brilho e contraste automaticamente"""
        
        try:
            # Converter para LAB
            lab = cv2.cvtColor(cv_image, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            
            # Calcular estatísticas do canal L (luminância)
            mean_l = np.mean(l)
            std_l = np.std(l)
            
            # Ajustar se muito escuro ou muito claro
            if mean_l < 100:  # Imagem escura
                alpha = 1.3  # Aumentar contraste
                beta = 30    # Aumentar brilho
            elif mean_l > 180:  # Imagem clara demais
                alpha = 1.2
                beta = -20
            else:  # Balanceada
                alpha = 1.1
                beta = 0
            
            # Aplicar ajuste
            adjusted_l = cv2.convertScaleAbs(l, alpha=alpha, beta=beta)
            
            # Recombinar
            adjusted_lab = cv2.merge([adjusted_l, a, b])
            result = cv2.cvtColor(adjusted_lab, cv2.COLOR_LAB2BGR)
            
            return result
            
        except Exception as e:
            logger.warning(f"⚠️ Erro ao ajustar brilho/contraste: {e}")
            return cv_image
    
    def _denoise(self, cv_image: np.ndarray) -> np.ndarray:
        """Reduz ruído preservando bordas"""
        
        try:
            # Usar filtro bilateral (preserva bordas)
            denoised = cv2.bilateralFilter(cv_image, d=9, sigmaColor=75, sigmaSpace=75)
            return denoised
        except Exception as e:
            logger.warning(f"⚠️ Erro ao reduzir ruído: {e}")
            return cv_image
    
    def _sharpen(self, cv_image: np.ndarray) -> np.ndarray:
        """Aumenta nitidez da imagem"""
        
        try:
            # Kernel de sharpening
            kernel = np.array([
                [-1, -1, -1],
                [-1,  9, -1],
                [-1, -1, -1]
            ])
            
            sharpened = cv2.filter2D(cv_image, -1, kernel)
            
            # Blend com original (70% processado + 30% original)
            result = cv2.addWeighted(sharpened, 0.7, cv_image, 0.3, 0)
            
            return result
            
        except Exception as e:
            logger.warning(f"⚠️ Erro ao aumentar nitidez: {e}")
            return cv_image
    
    def _enhance_text_contrast(self, cv_image: np.ndarray) -> np.ndarray:
        """Melhora contraste de texto usando CLAHE"""
        
        try:
            # Converter para LAB
            lab = cv2.cvtColor(cv_image, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            
            # Aplicar CLAHE (Contrast Limited Adaptive Histogram Equalization)
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            cl = clahe.apply(l)
            
            # Recombinar
            enhanced_lab = cv2.merge([cl, a, b])
            result = cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2BGR)
            
            return result
            
        except Exception as e:
            logger.warning(f"⚠️ Erro ao aplicar CLAHE: {e}")
            return cv_image
    
    def _create_high_sharpness_version(
        self,
        image_bytes: bytes
    ) -> Tuple[bytes, Dict]:
        """Cria versão com nitidez extrema para texto pequeno"""
        
        try:
            image = Image.open(io.BytesIO(image_bytes))
            
            if image.mode != 'RGB':
                image = image.convert('RGB')
            
            # Aplicar múltiplos filtros de nitidez
            enhancer = ImageEnhance.Sharpness(image)
            sharp = enhancer.enhance(2.5)  # Nitidez 2.5x
            
            # Aumentar contraste
            contrast_enhancer = ImageEnhance.Contrast(sharp)
            final = contrast_enhancer.enhance(1.3)
            
            # Aplicar UnsharpMask
            final = final.filter(ImageFilter.UnsharpMask(radius=2, percent=150))
            
            output = io.BytesIO()
            final.save(output, format='JPEG', quality=95)
            
            return output.getvalue(), {
                "description": "Alta nitidez para texto pequeno",
                "steps_applied": ["sharpen_2.5x", "contrast_1.3x", "unsharp_mask"]
            }
            
        except Exception as e:
            return image_bytes, {"error": str(e)}
    
    def _create_high_contrast_version(
        self,
        image_bytes: bytes
    ) -> Tuple[bytes, Dict]:
        """Cria versão com alto contraste para manuscrito"""
        
        try:
            image = Image.open(io.BytesIO(image_bytes))
            
            if image.mode != 'RGB':
                image = image.convert('RGB')
            
            # Converter para OpenCV
            cv_image = self._pil_to_cv2(image)
            
            # Converter para escala de cinza
            gray = cv2.cvtColor(cv_image, cv2.COLOR_BGR2GRAY)
            
            # Binarização adaptativa (ótima para manuscrito)
            binary = cv2.adaptiveThreshold(
                gray, 255,
                cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY,
                blockSize=11,
                C=2
            )
            
            # Converter de volta para BGR
            result_cv = cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR)
            
            # Converter para PIL
            result_pil = self._cv2_to_pil(result_cv)
            
            output = io.BytesIO()
            result_pil.save(output, format='JPEG', quality=95)
            
            return output.getvalue(), {
                "description": "Alto contraste para manuscrito",
                "steps_applied": ["grayscale", "adaptive_threshold"]
            }
            
        except Exception as e:
            return image_bytes, {"error": str(e)}
    
    # ========== UTILITÁRIOS ==========
    
    def _pil_to_cv2(self, pil_image: Image.Image) -> np.ndarray:
        """Converte PIL Image para OpenCV format"""
        return cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
    
    def _cv2_to_pil(self, cv_image: np.ndarray) -> Image.Image:
        """Converte OpenCV format para PIL Image"""
        return Image.fromarray(cv2.cvtColor(cv_image, cv2.COLOR_BGR2RGB))
