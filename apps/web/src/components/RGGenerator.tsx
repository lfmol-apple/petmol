'use client';
import { getToken } from '@/lib/auth-token';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE_URL } from '@/lib/api';
import type { PetHealthProfile } from '@/lib/petHealth';

interface RGTemplate {
  id: string;
  name: string;
  aspectRatio: string;
  width: number;
  height: number;
  description: string;
}

const TEMPLATES: RGTemplate[] = [
  {
    id: 'story',
    name: 'Instagram Story',
    aspectRatio: '9:16',
    width: 1080,
    height: 1920,
    description: 'Vertical para Stories'
  },
  {
    id: 'feed',
    name: 'Instagram Feed',
    aspectRatio: '4:5',
    width: 1080,
    height: 1350,
    description: 'Quadrado para Feed'
  },
  {
    id: 'sticker',
    name: 'Sticker PNG',
    aspectRatio: '1:1',
    width: 800,
    height: 800,
    description: 'Transparente para compartilhar'
  }
];

interface RGGeneratorProps {
  pet: PetHealthProfile;
  onClose?: () => void;
}

export default function RGGenerator({ pet, onClose }: RGGeneratorProps) {
  const auth = useAuth();
  const [selectedTemplate, setSelectedTemplate] = useState<RGTemplate>(TEMPLATES[0]);
  const [rgCreated, setRgCreated] = useState(false);
  const [publicUrl, setPublicUrl] = useState('');
  const [petPublicId, setPetPublicId] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Best-effort analytics — nunca quebra UX
  const trackIntent = async (cta_type: string, target?: string, rg_public_id?: string) => {
    try {
      await fetch(`${API_BASE_URL}/analytics/click`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'rg_generator', cta_type, target, rg_public_id }),
      });
    } catch {
      // silencioso
    }
  };

  // Gerar RG no canvas - DESIGN PROFISSIONAL inspirado em carteirinhas reais
  const generateRGImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    canvas.width = selectedTemplate.width;
    canvas.height = selectedTemplate.height;

    // === FUNDO COM GRADIENTE SUTIL ===
    const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bgGradient.addColorStop(0, '#f8f9fa');
    bgGradient.addColorStop(1, '#e9ecef');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // === CARTEIRINHA PRINCIPAL (estilo documento oficial) ===
    const cardPadding = canvas.width * 0.06;
    const cardX = cardPadding;
    const cardY = canvas.height * 0.08;
    const cardWidth = canvas.width - (cardPadding * 2);
    const cardHeight = canvas.height * 0.84;
    const radius = 24;

    // Sombra do card
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 8;

    // Card branco com cantos arredondados
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(cardX + radius, cardY);
    ctx.lineTo(cardX + cardWidth - radius, cardY);
    ctx.arcTo(cardX + cardWidth, cardY, cardX + cardWidth, cardY + radius, radius);
    ctx.lineTo(cardX + cardWidth, cardY + cardHeight - radius);
    ctx.arcTo(cardX + cardWidth, cardY + cardHeight, cardX + cardWidth - radius, cardY + cardHeight, radius);
    ctx.lineTo(cardX + radius, cardY + cardHeight);
    ctx.arcTo(cardX, cardY + cardHeight, cardX, cardY + cardHeight - radius, radius);
    ctx.lineTo(cardX, cardY + radius);
    ctx.arcTo(cardX, cardY, cardX + radius, cardY, radius);
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // === HEADER COM BARRA COLORIDA ===
    const headerHeight = canvas.height * 0.15;
    const headerGradient = ctx.createLinearGradient(cardX, cardY, cardX + cardWidth, cardY);
    headerGradient.addColorStop(0, '#4F46E5'); // Indigo
    headerGradient.addColorStop(1, '#7C3AED'); // Purple
    ctx.fillStyle = headerGradient;
    ctx.beginPath();
    ctx.moveTo(cardX + radius, cardY);
    ctx.lineTo(cardX + cardWidth - radius, cardY);
    ctx.arcTo(cardX + cardWidth, cardY, cardX + cardWidth, cardY + radius, radius);
    ctx.lineTo(cardX + cardWidth, cardY + headerHeight);
    ctx.lineTo(cardX, cardY + headerHeight);
    ctx.lineTo(cardX, cardY + radius);
    ctx.arcTo(cardX, cardY, cardX + radius, cardY, radius);
    ctx.closePath();
    ctx.fill();

    // Logo/Ícone PETMOL no header
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.font = `bold ${canvas.width * 0.12}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText('🐾', cardX + cardWidth - 20, cardY + headerHeight - 20);

    // Título "CARTEIRINHA PET"
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${canvas.width * 0.055}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText('CARTEIRINHA', cardX + 30, cardY + 40);
    ctx.font = `${canvas.width * 0.04}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.fillText('Documento Digital', cardX + 30, cardY + 70);

    // === FOTO DO PET (círculo à esquerda) ===
    const photoSize = canvas.width * 0.28;
    const photoX = cardX + 40;
    const photoY = cardY + headerHeight + 40;
    const photoRadius = photoSize / 2;

    // Círculo com borda
    ctx.save();
    ctx.beginPath();
    ctx.arc(photoX + photoRadius, photoY + photoRadius, photoRadius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    
    // Placeholder da foto (gradiente)
    const photoGradient = ctx.createRadialGradient(
      photoX + photoRadius, photoY + photoRadius, 0,
      photoX + photoRadius, photoY + photoRadius, photoRadius
    );
    photoGradient.addColorStop(0, '#E0E7FF');
    photoGradient.addColorStop(1, '#C7D2FE');
    ctx.fillStyle = photoGradient;
    ctx.fillRect(photoX, photoY, photoSize, photoSize);
    
    // Ícone de pet no centro (temporário)
    ctx.fillStyle = 'rgba(79, 70, 229, 0.3)';
    ctx.font = `${photoSize * 0.5}px -apple-system`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const petIcon = pet.species === 'dog' ? '🐕' : pet.species === 'cat' ? '🐱' : '🐾';
    ctx.fillText(petIcon, photoX + photoRadius, photoY + photoRadius);
    
    ctx.restore();

    // Borda dourada ao redor da foto
    ctx.strokeStyle = '#FBBF24';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(photoX + photoRadius, photoY + photoRadius, photoRadius + 2, 0, Math.PI * 2);
    ctx.stroke();

    // === INFORMAÇÕES DO PET (à direita da foto) ===
    const infoX = photoX + photoSize + 40;
    let currentY = photoY + 20;

    // Nome do pet (destaque)
    ctx.fillStyle = '#1F2937';
    ctx.font = `bold ${canvas.width * 0.07}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(pet.pet_name.toUpperCase(), infoX, currentY);
    currentY += canvas.width * 0.08;

    // Linha divisória
    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(infoX, currentY);
    ctx.lineTo(cardX + cardWidth - 40, currentY);
    ctx.stroke();
    currentY += 20;

    // Espécie
    ctx.fillStyle = '#6B7280';
    ctx.font = `${canvas.width * 0.038}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.fillText('ESPÉCIE:', infoX, currentY);
    ctx.fillStyle = '#1F2937';
    ctx.font = `600 ${canvas.width * 0.042}px -apple-system, BlinkMacSystemFont, sans-serif`;
    const speciesName = pet.species === 'dog' ? 'Canino (Cachorro)' : pet.species === 'cat' ? 'Felino (Gato)' : 'Pet';
    ctx.fillText(speciesName, infoX + 120, currentY);
    currentY += 35;

    // Raça (se houver)
    if (pet.breed) {
      ctx.fillStyle = '#6B7280';
      ctx.font = `${canvas.width * 0.038}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.fillText('RAÇA:', infoX, currentY);
      ctx.fillStyle = '#1F2937';
      ctx.font = `600 ${canvas.width * 0.042}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.fillText(pet.breed, infoX + 120, currentY);
      currentY += 35;
    }

    // Data de nascimento
    if (pet.birth_date) {
      ctx.fillStyle = '#6B7280';
      ctx.font = `${canvas.width * 0.038}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.fillText('NASCIMENTO:', infoX, currentY);
      ctx.fillStyle = '#1F2937';
      ctx.font = `600 ${canvas.width * 0.042}px -apple-system, BlinkMacSystemFont, sans-serif`;
      const birthDate = new Date(pet.birth_date);
      const formattedDate = birthDate.toLocaleDateString('pt-BR');
      ctx.fillText(formattedDate, infoX + 120, currentY);
      currentY += 35;
    }

    // === QR CODE (centralizado na parte inferior) ===
    const qrSize = canvas.width * 0.22;
    const qrX = cardX + (cardWidth / 2) - (qrSize / 2);
    const qrY = cardY + cardHeight - qrSize - 80;

    // Background do QR
    ctx.fillStyle = '#F9FAFB';
    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = 2;
    const qrRadius = 12;
    ctx.beginPath();
    ctx.moveTo(qrX + qrRadius, qrY);
    ctx.lineTo(qrX + qrSize - qrRadius, qrY);
    ctx.arcTo(qrX + qrSize, qrY, qrX + qrSize, qrY + qrRadius, qrRadius);
    ctx.lineTo(qrX + qrSize, qrY + qrSize - qrRadius);
    ctx.arcTo(qrX + qrSize, qrY + qrSize, qrX + qrSize - qrRadius, qrY + qrSize, qrRadius);
    ctx.lineTo(qrX + qrRadius, qrY + qrSize);
    ctx.arcTo(qrX, qrY + qrSize, qrX, qrY + qrSize - qrRadius, qrRadius);
    ctx.lineTo(qrX, qrY + qrRadius);
    ctx.arcTo(qrX, qrY, qrX + qrRadius, qrY, qrRadius);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Texto "Escaneie para ver perfil"
    ctx.fillStyle = '#6B7280';
    ctx.font = `${canvas.width * 0.032}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('📱 Escaneie para ver', cardX + cardWidth / 2, qrY + qrSize / 2 - 10);
    ctx.fillText('o perfil completo', cardX + cardWidth / 2, qrY + qrSize / 2 + 15);

    // === FOOTER ===
    const footerY = cardY + cardHeight - 35;
    ctx.fillStyle = '#9CA3AF';
    ctx.font = `${canvas.width * 0.032}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('petmol.com • Sua carteirinha digital', cardX + cardWidth / 2, footerY);

    // Selo "DIGITAL" no canto
    ctx.save();
    ctx.translate(cardX + cardWidth - 70, cardY + cardHeight - 70);
    ctx.rotate(-Math.PI / 6);
    ctx.fillStyle = 'rgba(79, 70, 229, 0.1)';
    ctx.strokeStyle = '#4F46E5';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 35, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#4F46E5';
    ctx.font = `bold ${canvas.width * 0.028}px -apple-system`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('DIGITAL', 0, 0);
    ctx.restore();

    return canvas.toDataURL('image/png');
  };

  // Criar RG no backend
  const createRG = async () => {
    if (!auth.isAuthenticated) return;

    setIsGenerating(true);

    try {
      const token = getToken();
      const response = await fetch(`${API_BASE_URL}/rg/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          pet_id: pet.pet_id,
          template: selectedTemplate.id,
          is_public: true,
          contact_mode: 'handoff_only'
        })
      });

      if (response.ok) {
        const data = await response.json();
        setPetPublicId(data.pet_public_id);
        setPublicUrl(data.public_url);
        setRgCreated(true);
        // Analytics best-effort
        trackIntent('rg_created', 'internal', data.pet_public_id);
      }
    } catch (error) {
      console.error('Erro ao criar RG:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  // Compartilhar com Web Share API ou fallback
  const shareRG = async (platform: string) => {
    // Gerar imagem
    const imageData = generateRGImage();
    if (!imageData) return;

    // Track analytics (share)
    if (petPublicId) {
      try {
        await fetch(`${API_BASE_URL}/rg/${petPublicId}/share?platform=${platform}`, {
          method: 'POST'
        });
      } catch (error) {
        console.error('Erro ao rastrear share:', error);
      }
      // Motor de Intenção — best-effort
      trackIntent('rg_share', platform, petPublicId);
    }

    // Converter dataURL para Blob
    const blob = await (await fetch(imageData)).blob();
    const file = new File([blob], `${pet.pet_name}-rg.png`, { type: 'image/png' });

    // Tentar Web Share API (funciona em mobile)
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `RG de ${pet.pet_name}`,
          text: `Conheça ${pet.pet_name}! 🐾\nVeja o perfil completo: ${publicUrl || ''}`,
          url: publicUrl
        });
        
        // Track download após compartilhamento bem-sucedido
        if (petPublicId) {
          await fetch(`${API_BASE_URL}/rg/${petPublicId}/share?platform=downloaded`, {
            method: 'POST'
          });
        }
        return;
      } catch (error: unknown) {
        if (!(error instanceof Error && error.name === 'AbortError')) {
          console.error('Erro no Web Share:', error);
        }
      }
    }

    // Fallback: Download + copiar link
    const link = document.createElement('a');
    link.download = `${pet.pet_name.toLowerCase().replace(/\s/g, '-')}-rg-${selectedTemplate.id}.png`;
    link.href = imageData;
    link.click();

    // Track download
    if (petPublicId) {
      await fetch(`${API_BASE_URL}/rg/${petPublicId}/share?platform=downloaded`, {
        method: 'POST'
      });
      trackIntent('rg_download', 'png', petPublicId);
    }

    // Copiar link público
    if (publicUrl && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(publicUrl);
        alert(`✅ Imagem baixada!\n📋 Link copiado: ${publicUrl}\n\nAgora abra o Instagram e cole!`);
      } catch (error) {
        console.error('Erro ao copiar link:', error);
      }
    }
  };

  // Gerar preview ao mudar template
  useEffect(() => {
    generateRGImage();
  }, [selectedTemplate, pet]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">RG do {pet.pet_name}</h2>
            <p className="text-sm text-gray-600 mt-1">
              Crie e compartilhe no Instagram
            </p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Templates */}
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Escolha o formato:</h3>
          <div className="grid grid-cols-3 gap-3">
            {TEMPLATES.map((template) => (
              <button
                key={template.id}
                onClick={() => setSelectedTemplate(template)}
                className={`p-4 rounded-xl border-2 transition-all ${
                  selectedTemplate.id === template.id
                    ? 'border-purple-600 bg-purple-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="text-center">
                  <div className="text-2xl mb-2">
                    {template.id === 'story' && '📱'}
                    {template.id === 'feed' && '📷'}
                    {template.id === 'sticker' && '✨'}
                  </div>
                  <div className="text-sm font-semibold text-gray-900">{template.name}</div>
                  <div className="text-xs text-gray-500 mt-1">{template.aspectRatio}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Preview:</h3>
          <div className="bg-gray-100 rounded-xl p-4 flex items-center justify-center">
            <canvas
              ref={canvasRef}
              className="max-w-full h-auto rounded-lg shadow-lg"
              style={{
                maxHeight: '400px',
                width: 'auto'
              }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="p-6 bg-gray-50 rounded-b-2xl">
          {!rgCreated ? (
            <button
              onClick={createRG}
              disabled={isGenerating}
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-4 rounded-xl font-semibold hover:from-purple-700 hover:to-indigo-700 transition-all disabled:opacity-50"
            >
              {isGenerating ? 'Gerando...' : '✨ Gerar RG'}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                <div className="text-green-600 font-semibold mb-2">✅ RG Criado!</div>
                <div className="text-sm text-gray-600 break-all">{publicUrl}</div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => shareRG('instagram_story')}
                  className="bg-gradient-to-br from-purple-600 to-pink-600 text-white py-3 rounded-xl font-semibold hover:shadow-lg transition-all"
                >
                  📱 Story
                </button>
                <button
                  onClick={() => shareRG('instagram_feed')}
                  className="bg-gradient-to-br from-orange-500 to-pink-500 text-white py-3 rounded-xl font-semibold hover:shadow-lg transition-all"
                >
                  📷 Feed
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => shareRG('whatsapp')}
                  className="bg-gradient-to-br from-green-500 to-green-600 text-white py-3 rounded-xl font-semibold hover:shadow-lg transition-all"
                >
                  💬 WhatsApp
                </button>
                <button
                  onClick={async () => {
                    if (publicUrl && navigator.clipboard) {
                      await navigator.clipboard.writeText(publicUrl);
                      alert('✅ Link copiado!');
                      trackIntent('rg_link_copy', 'internal', petPublicId || undefined);
                    }
                  }}
                  className="bg-gradient-to-br from-[#0066ff] to-[#0056D2] text-white py-3 rounded-xl font-semibold hover:shadow-lg transition-all"
                >
                  🔗 Copiar Link
                </button>
              </div>

              <p className="text-xs text-center text-gray-500 mt-4">
                No celular: compartilhe direto. No desktop: baixa imagem + copia link
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
