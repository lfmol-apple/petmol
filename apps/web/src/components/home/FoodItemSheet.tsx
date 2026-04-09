'use client';

import { useEffect, useRef } from 'react';
import { FoodControlTab } from '@/components/FoodControlTab';
import type { PetHealthProfile } from '@/lib/petHealth';
import { ModalPortal } from '@/components/ModalPortal';

export interface FoodItemSheetProps {
  pet: PetHealthProfile;
  onClose: () => void;
  onSaved?: () => void;
}

export function FoodItemSheet({ pet, onClose, onSaved }: FoodItemSheetProps) {
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
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 active:scale-95 transition-all flex-shrink-0"
            aria-label="Fechar"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Content — FoodControlTab scrolls inside */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <FoodControlTab
            petId={pet.pet_id}
            petName={pet.pet_name}
            species={(pet.species as 'dog' | 'cat') || 'dog'}
            onSaved={() => {
              onSaved?.();
              onClose();
            }}
          />
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
