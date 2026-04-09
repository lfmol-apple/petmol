'use client';

import { useEffect, useRef } from 'react';
import { FoodControlTab } from '@/components/FoodControlTab';
import type { PetHealthProfile } from '@/lib/petHealth';
import { ModalPortal } from '@/components/ModalPortal';
import { useState } from 'react';
import { trackPartnerClicked } from '@/lib/v1Metrics';

export interface FoodItemSheetProps {
  pet: PetHealthProfile;
  onClose: () => void;
  onSaved?: () => void;
}

export function FoodItemSheet({ pet, onClose, onSaved }: FoodItemSheetProps) {
  const [mode, setMode] = useState<'view' | 'buy'>('view');
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <ModalPortal>
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div
        className="relative w-full max-w-lg bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 flex flex-col max-h-[92dvh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pb-3 pt-1 border-b border-gray-100 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-amber-700">
              <path d="M3 13h18"/><path d="M5 13a7 7 0 0014 0"/><path d="M8 7V5M12 7V4M16 7V5"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-bold text-gray-900 leading-tight">Alimentação</h2>
            <p className="text-[12px] text-gray-500 leading-tight truncate">{pet.pet_name}</p>
          </div>
          <button
            onClick={mode === 'buy' ? () => setMode('view') : onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 active:scale-95 transition-all flex-shrink-0"
            aria-label="Fechar"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4">
              {mode === 'buy' ? <path d="M15 18l-6-6 6-6"/> : <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>}
            </svg>
          </button>
        </div>

        {/* Content — FoodControlTab scrolls inside */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {mode === 'view' ? (
            <>
              <FoodControlTab
                petId={pet.pet_id}
                petName={pet.pet_name}
                species={(pet.species as 'dog' | 'cat') || 'dog'}
                onSaved={() => {
                  onSaved?.();
                  onClose();
                }}
              />
              
              {/* Buy button at the end */}
              <div className="px-4 pb-8 -mt-4">
                <button
                  onClick={() => setMode('buy')}
                  className="w-full flex items-center justify-between p-4 bg-blue-300 border border-blue-400/30 rounded-2xl hover:bg-blue-400/40 transition-all active:scale-[0.98] shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-xl shadow-sm">
                      🛒
                    </div>
                    <div className="text-left">
                      <p className="text-[14px] font-bold text-blue-900">Preciso comprar</p>
                      <p className="text-[12px] text-blue-700/70">Ver onde encontrar ração</p>
                    </div>
                  </div>
                  <span className="text-blue-400 text-lg font-bold">›</span>
                </button>
              </div>
            </>
          ) : (
            /* ── BUY MODE ─────────────────────────────────────────────────── */
            <div className="p-5 pb-8 space-y-4">
              <h3 className="text-[16px] font-bold text-gray-900">Onde comprar</h3>
              <p className="text-sm text-gray-500">Escolha onde encontrar ração e acessórios:</p>

              <div className="space-y-3">
                {[
                  { name: 'Cobasi', url: 'https://www.cobasi.com.br/cachorro/racoes', emoji: '🐾' },
                  { name: 'Petz', url: 'https://www.petz.com.br/cachorro/racoes', emoji: '🐕' },
                  { name: 'Petlove', url: 'https://www.petlove.com.br/cachorro/racoes', emoji: '❤️' },
                  { name: 'Amazon Pet', url: 'https://www.amazon.com.br/s?k=racao+pet', emoji: '📦' },
                ].map(store => (
                  <button
                    key={store.name}
                    onClick={() => {
                      trackPartnerClicked({
                        source: 'food_sheet',
                        partner: store.name.toLowerCase(),
                        pet_id: pet.pet_id,
                        control_type: 'food',
                      });
                      window.open(store.url, '_blank', 'noopener,noreferrer');
                    }}
                    className="w-full flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md active:scale-[0.98] transition-all text-left"
                  >
                    <span className="text-2xl">{store.emoji}</span>
                    <div className="flex-1">
                      <p className="font-bold text-gray-900 text-sm">{store.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">Comprar ração</p>
                    </div>
                    <span className="text-gray-400 text-lg">›</span>
                  </button>
                ))}
              </div>

              <button
                onClick={() => setMode('view')}
                className="w-full py-3 rounded-xl text-sm font-semibold bg-gray-50 text-gray-600 border border-gray-200"
              >
                Voltar para controle
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
