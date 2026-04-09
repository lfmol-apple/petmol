'use client';

import { useState, useEffect } from 'react';
import { UNIVERSAL_LINE, getCurrentLang, t, setPreferredLang } from '@/lib/copy/i18n';
import mapsTranslations from '@/lib/copy/maps_explanation.json';

interface WhyMapsModalProps {
  open: boolean;
  onClose: () => void;
}

export function WhyMapsModal({ open, onClose }: WhyMapsModalProps) {
  const [currentLang, setCurrentLang] = useState('en');
  const [showLangSelector, setShowLangSelector] = useState(false);

  useEffect(() => {
    setCurrentLang(getCurrentLang());
  }, []);

  useEffect(() => {
    if (open) {
      // Foco no modal quando abre
      const modal = document.getElementById('why-maps-modal');
      if (modal) modal.focus();

      // ESC fecha modal
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      document.addEventListener('keydown', handleEsc);
      return () => document.removeEventListener('keydown', handleEsc);
    }
  }, [open, onClose]);

  const handleLangChange = (newLang: string) => {
    setPreferredLang(newLang);
    setCurrentLang(newLang);
    setShowLangSelector(false);
  };

  if (!open) return null;

  const modalTitle = t('modalTitle', currentLang, mapsTranslations);
  const modalBody = t('modalBody', currentLang, mapsTranslations);
  const cta = t('cta', currentLang, mapsTranslations);
  const changeLang = t('changeLang', currentLang, mapsTranslations);

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        id="why-maps-modal"
        className="p-6 max-w-md w-full bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Universal Line - sempre no topo */}
        <div className="text-center mb-4 p-3 bg-blue-50 rounded-xl">
          <div className="text-sm font-mono text-[#0047ad]">
            {UNIVERSAL_LINE}
          </div>
        </div>

        {/* Título */}
        <h2 id="modal-title" className="text-xl font-bold text-slate-900 mb-3">
          {modalTitle}
        </h2>

        {/* Corpo da explicação */}
        <div className="text-sm text-slate-700 mb-6 leading-relaxed">
          {modalBody}
        </div>

        {/* Botões de ação */}
        <div className="flex flex-col gap-3">
          {/* CTA principal */}
          <button
            onClick={onClose}
            className="w-full py-3 bg-[#0056D2] text-white rounded-xl font-semibold hover:bg-[#0047ad] transition-colors focus:ring-2 focus:ring-[#0056D2] focus:ring-offset-2"
            autoFocus
          >
            {cta}
          </button>

          {/* Seletor de idioma */}
          <div className="text-center">
            {!showLangSelector ? (
              <button
                onClick={() => setShowLangSelector(true)}
                className="text-xs text-slate-500 hover:text-slate-700 underline"
              >
                {changeLang}
              </button>
            ) : (
              <div className="flex justify-center gap-2 text-xs">
                <button
                  onClick={() => handleLangChange('en')}
                  className={`px-2 py-1 rounded ${currentLang === 'en' ? 'bg-blue-100 text-[#0047ad] font-semibold' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  EN
                </button>
                <button
                  onClick={() => handleLangChange('pt')}
                  className={`px-2 py-1 rounded ${currentLang === 'pt' ? 'bg-blue-100 text-[#0047ad] font-semibold' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  PT
                </button>
                <button
                  onClick={() => handleLangChange('es')}
                  className={`px-2 py-1 rounded ${currentLang === 'es' ? 'bg-blue-100 text-[#0047ad] font-semibold' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  ES
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}