/**
 * PlaceActionButtons - Botões de ação para um place
 * 
 * NOVIDADE WHATSAPP:
 * - Detecta automaticamente celulares brasileiros (11) 9xxxx-xxxx
 * - Converte para WhatsApp quando possível
 * - Mensagem promocional: "Olá! Encontrei vocês através da PETMOL"
 */

'use client';

import { useState } from 'react';

interface Place {
  place_id: string;
  name: string;
  lat: number;
  lng: number;
  phone?: string;
}

interface Props {
  place: Place;
  isPartner?: boolean;
  service: string;
  onAction?: (action: string) => void;
}

// Detecta se é celular brasileiro (formato WhatsApp)
function isBrazilianMobile(phone: string): boolean {
  if (!phone) return false;
  // Remove todos os caracteres não numéricos
  const numbers = phone.replace(/\D/g, '');
  
  // Celular BR: 11 dígitos (com código país 55) ou 11 dígitos (DDD + 9 + 8 dígitos)
  // Exemplos: 5511999998888, 11999998888, (11) 99999-8888
  if (numbers.length === 13 && numbers.startsWith('55')) {
    const withoutCountry = numbers.substring(2); // Remove 55
    return withoutCountry.length === 11 && withoutCountry.substring(2, 3) === '9';
  }
  if (numbers.length === 11) {
    return numbers.substring(2, 3) === '9'; // 3º dígito é 9 (celular)
  }
  if (numbers.length === 10) {
    return numbers.substring(2, 3) === '9'; // Para números sem o 9 extra
  }
  
  return false;
}

// Converte telefone para WhatsApp
function formatWhatsAppNumber(phone: string): string {
  const numbers = phone.replace(/\D/g, '');
  
  // Se já tem código do país
  if (numbers.length === 13 && numbers.startsWith('55')) {
    return numbers;
  }
  
  // Adiciona código do país Brasil
  if (numbers.length === 11) {
    return '55' + numbers;
  }
  
  if (numbers.length === 10) {
    // Adiciona o 9 se não tiver (formato antigo)
    const ddd = numbers.substring(0, 2);
    const resto = numbers.substring(2);
    return '55' + ddd + '9' + resto;
  }
  
  return numbers;
}

async function logClick(placeId: string, action: string, isPartner: boolean, service: string, lat: number, lng: number) {
  try {
    await fetch('/api/log-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        placeId,
        action,
        isPartner,
        service,
        lat,
        lng,
        tsClient: Date.now()
      })
    });
  } catch (error) {
    console.error('[logClick] Error:', error);
  }
}

export function PlaceActionButtons({ place, isPartner = false, service, onAction }: Props) {
  const [showContactMenu, setShowContactMenu] = useState(false);
  const [showNavMenu, setShowNavMenu] = useState(false);

  const hasPhone = !!place.phone;
  const isMobile = place.phone ? isBrazilianMobile(place.phone) : false;
  const whatsappNumber = isMobile ? formatWhatsAppNumber(place.phone!) : null;

  const handleCallClick = async () => {
    if (!place.phone) return;

    await logClick(place.place_id, 'call', isPartner, service, place.lat, place.lng);
    onAction?.('call');
    
    // Para mobile, usar location.href é mais confiável que window.open
    if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
      location.href = `tel:${place.phone}`;
    } else {
      window.open(`tel:${place.phone}`, '_blank');
    }
  };

  const handleWhatsAppClick = async () => {
    if (!whatsappNumber) return;

    await logClick(place.place_id, 'whatsapp', isPartner, service, place.lat, place.lng);
    onAction?.('whatsapp');
    setShowContactMenu(false);
    
    // Mensagem promocional da PETMOL
    const message = `Olá! Encontrei vocês através da PETMOL 🐾 Gostaria de saber mais sobre os serviços para pets.`;
    const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
    
    // Para mobile, usar location.href é mais confiável
    if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
      location.href = url;
    } else {
      window.open(url, '_blank');
    }
  };

  const handleContactClick = () => {
    // Se só tem telefone fixo, liga direto
    if (hasPhone && !isMobile) {
      handleCallClick();
      return;
    }
    
    // Se tem WhatsApp, abre o menu
    if (isMobile) {
      setShowContactMenu(!showContactMenu);
      return;
    }
  };

  const handleNavigationClick = () => {
    setShowNavMenu(!showNavMenu);
  };

  const handleWaze = async () => {
    await logClick(place.place_id, 'waze', isPartner, service, place.lat, place.lng);
    onAction?.('waze');
    setShowNavMenu(false);
    
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    // Tenta obter localização atual para origem
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          // Waze com origem e destino específicos
          const url = `https://waze.com/ul?ll=${place.lat},${place.lng}&from=${latitude},${longitude}&navigate=yes`;
          
          if (isMobile) {
            location.href = url;
          } else {
            window.open(url, '_blank');
          }
        },
        () => {
          // Fallback: apenas destino (funciona no mobile)
          const url = `https://waze.com/ul?ll=${place.lat},${place.lng}&navigate=yes`;
          
          if (isMobile) {
            location.href = url;
          } else {
            window.open(url, '_blank');
          }
        },
        { timeout: 3000 }
      );
    } else {
      // Sem GPS: apenas destino
      const url = `https://waze.com/ul?ll=${place.lat},${place.lng}&navigate=yes`;
      
      if (isMobile) {
        location.href = url;
      } else {
        window.open(url, '_blank');
      }
    }
  };

  const handleGoogleMaps = async () => {
    await logClick(place.place_id, 'gmaps', isPartner, service, place.lat, place.lng);
    onAction?.('gmaps');
    setShowNavMenu(false);
    
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    // Tenta obter localização atual
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          // Google Maps com origem específica
          const url = `https://www.google.com/maps/dir/${latitude},${longitude}/${place.lat},${place.lng}`;
          
          if (isMobile) {
            location.href = url;
          } else {
            window.open(url, '_blank');
          }
        },
        () => {
          // Fallback: Google usa localização automaticamente
          const url = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`;
          
          if (isMobile) {
            location.href = url;
          } else {
            window.open(url, '_blank');
          }
        },
        { timeout: 3000 }
      );
    } else {
      // Sem GPS: Google detecta automaticamente
      const url = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`;
      
      if (isMobile) {
        location.href = url;
      } else {
        window.open(url, '_blank');
      }
    }
  };

  return (
    <div className="flex gap-2">
      {/* Botão Contato (Ligar ou WhatsApp + Ligar) */}
      {hasPhone && (
        <div className="flex-1 relative">
          <button
            onClick={handleContactClick}
            className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-center text-sm transition shadow-md active:scale-95"
          >
            {isMobile ? '💬 Contato' : '📞 Ligar'}
          </button>
          
          {/* Menu de contato (só aparece para celulares) */}
          {showContactMenu && isMobile && (
            <div className="absolute bottom-full mb-2 left-0 right-0 bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 overflow-hidden z-50 border border-gray-200">
              <button
                onClick={handleWhatsAppClick}
                className="w-full py-4 px-4 text-left hover:bg-[#25D366] hover:bg-opacity-10 transition-all flex items-center gap-3 border-b border-gray-100 active:scale-95"
              >
                <span className="text-2xl">💬</span>
                <div>
                  <div className="font-bold text-[#25D366] text-base">WhatsApp</div>
                  <div className="text-xs text-gray-500">Encontrado via PETMOL</div>
                </div>
              </button>
              <button
                onClick={handleCallClick}
                className="w-full py-4 px-4 text-left hover:bg-emerald-600 hover:bg-opacity-10 transition-all flex items-center gap-3 active:scale-95"
              >
                <span className="text-2xl">📞</span>
                <div>
                  <div className="font-bold text-emerald-600 text-base">Ligar</div>
                  <div className="text-xs text-gray-500">Chamada direta</div>
                </div>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Botão Navegação com dropdown */}
      <div className="flex-1 relative">
        <button
          onClick={handleNavigationClick}
          className="w-full py-3 rounded-2xl bg-[#0056D2] hover:bg-[#0047ad] text-white font-semibold text-center text-sm transition shadow-md active:scale-95"
        >
          🧭 Navegar
        </button>
        
        {showNavMenu && (
          <div className="absolute bottom-full mb-2 left-0 right-0 bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 overflow-hidden z-50 border border-gray-200">
            <button
              onClick={handleWaze}
              className="w-full py-4 px-4 text-left hover:bg-[#00d4ff] hover:bg-opacity-10 transition-all flex items-center gap-3 border-b border-gray-100 active:scale-95"
            >
              <span className="text-3xl">🚗</span>
              <div>
                <div className="font-bold text-[#00d4ff] text-base">Waze</div>
                <div className="text-xs text-gray-500">Navegação em tempo real</div>
              </div>
            </button>
            <button
              onClick={handleGoogleMaps}
              className="w-full py-4 px-4 text-left hover:bg-[#4285F4] hover:bg-opacity-10 transition-all flex items-center gap-3 active:scale-95"
            >
              <span className="text-3xl">📍</span>
              <div>
                <div className="font-bold text-[#4285F4] text-base">Google Maps</div>
                <div className="text-xs text-gray-500">Ver no mapa</div>
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
