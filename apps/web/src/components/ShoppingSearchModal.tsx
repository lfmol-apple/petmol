'use client';

import { useState, useEffect, useRef } from 'react';
import { getLang, openGoogleShopping } from '@/lib/externalShopping';

interface ShoppingSearchModalProps {
  open: boolean;
  onClose: () => void;
  onTrack?: (payload: Record<string, unknown>) => void;
}

export function ShoppingSearchModal({ open, onClose, onTrack }: ShoppingSearchModalProps) {
  const [searchText, setSearchText] = useState('');
  const [lang, setLang] = useState<'pt' | 'es' | 'en' | 'other'>('en');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLang(getLang());
  }, []);

  // Focus input when modal opens
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // Handle ESC key
  useEffect(() => {
    if (!open) return;

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, [open, onClose]);

  const texts = {
    pt: {
      title: 'Compras',
      subtitle: 'Digite o que você precisa e vamos abrir no Google Shopping.',
      placeholder: 'Ex.: ração 15kg, tapete higiênico, areia para gato…',
      searchButton: 'Buscar no Google Shopping',
      cancelButton: 'Cancelar',
      chips: ['Ração', 'Tapete higiênico', 'Areia para gato', 'Shampoo pet', 'Antipulgas', 'Coleira', 'Brinquedo']
    },
    es: {
      title: 'Compras',
      subtitle: 'Escribe lo que necesitas y abriremos Google Shopping.',
      placeholder: 'Ej.: comida 15kg, empapadores, arena para gato…',
      searchButton: 'Buscar en Google Shopping',
      cancelButton: 'Cancelar',
      chips: ['Comida para perro', 'Empapadores', 'Arena para gato', 'Champú', 'Antipulgas', 'Collar', 'Juguete']
    },
    en: {
      title: 'Shopping',
      subtitle: 'Type what you need and we\'ll open Google Shopping.',
      placeholder: 'e.g. dog food, pee pads, cat litter…',
      searchButton: 'Search on Google Shopping',
      cancelButton: 'Cancel',
      chips: ['Dog food', 'Pee pads', 'Cat litter', 'Pet shampoo', 'Flea treatment', 'Collar', 'Toy']
    },
    other: {
      title: 'Shopping',
      subtitle: 'Type what you need and we\'ll open Google Shopping.',
      placeholder: 'e.g. dog food, pee pads, cat litter…',
      searchButton: 'Search on Google Shopping',
      cancelButton: 'Cancel',
      chips: ['Dog food', 'Pee pads', 'Cat litter', 'Pet shampoo', 'Flea treatment', 'Collar', 'Toy']
    }
  };

  const t = texts[lang];

  const handleChipClick = (chipText: string) => {
    if (!searchText.trim()) {
      // If input is empty, fill with chip text
      setSearchText(chipText);
    } else {
      // If has text, append with " + chip" and normalize
      const combined = `${searchText.trim()} + ${chipText}`;
      setSearchText(combined);
    }
  };

  const handleSearch = () => {
    openGoogleShopping(searchText, { 
      onTrack, 
      openInNewTab: true 
    });
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <div 
        className="bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 w-full max-w-md p-6 overflow-hidden"
        role="dialog" 
        aria-labelledby="shopping-modal-title"
        aria-describedby="shopping-modal-subtitle"
      >
        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-2xl mb-2">🛒</div>
          <h2 id="shopping-modal-title" className="text-xl font-bold text-slate-900 mb-1">
            {t.title}
          </h2>
          <p id="shopping-modal-subtitle" className="text-sm text-slate-600">
            {t.subtitle}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Search Input */}
          <div className="mb-4">
            <input
              ref={inputRef}
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder={t.placeholder}
              className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-[#0056D2] outline-none text-slate-900 placeholder-slate-400"
            />
          </div>

          {/* Quick Chips */}
          <div className="mb-6">
            <div className="text-xs font-medium text-slate-600 mb-2">Sugestões rápidas:</div>
            <div className="flex flex-wrap gap-2">
              {t.chips.map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleChipClick(chip)}
                  className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-full text-xs font-medium hover:bg-slate-200 transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-slate-300 text-slate-700 rounded-xl font-medium hover:bg-slate-50 transition-colors"
            >
              {t.cancelButton}
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-3 bg-[#0056D2] text-white rounded-xl font-medium hover:bg-[#0047ad] transition-colors"
            >
              {t.searchButton}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}