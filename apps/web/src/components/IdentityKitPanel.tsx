'use client';

import { useState } from 'react';
import { useI18n } from '@/lib/I18nContext';
import { useIdentityKit, type GenerateOptions } from '@/hooks/useIdentityKit';
import type { IdentityKitTheme } from '@/lib/identityKit/types';

interface IdentityKitPanelProps {
  petId: string;
  petName: string;
  species: 'dog' | 'cat' | 'other';
  breed?: string;
  photoUrl: string;
}

/**
 * Painel do Identity Kit - Gera artefatos virais do pet
 * 
 * Permite:
 * - Gerar Pet Passport
 * - Gerar Emergency QR Card
 * - Escolher tema (classic, cute, neon)
 * - Compartilhar com 1 toque
 */
export function IdentityKitPanel({ petId, petName, species, breed, photoUrl }: IdentityKitPanelProps) {
  const { t, geo } = useI18n();
  const { generating, generatedImage, generatePassport, generateQRCard, shareImage, clearGenerated } = useIdentityKit();
  
  const [selectedTheme, setSelectedTheme] = useState<IdentityKitTheme>('classic');
  const [currentType, setCurrentType] = useState<'passport' | 'qr_card' | null>(null);

  const options: GenerateOptions = {
    petId,
    petName,
    species,
    breed,
    photoUrl,
    theme: selectedTheme,
  };

  const handleGeneratePassport = async () => {
    setCurrentType('passport');
    clearGenerated();
    await generatePassport(options);
  };

  const handleGenerateQR = async () => {
    setCurrentType('qr_card');
    clearGenerated();
    await generateQRCard(options);
  };

  const handleShare = () => {
    if (generatedImage && currentType) {
      shareImage(generatedImage, currentType);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-bold text-slate-900">{t('identity_kit.title')}</div>
          <div className="text-sm text-slate-600">
            {t('identity_kit.watermark')}
          </div>
        </div>
      </div>

      {/* Theme selector */}
      <div>
        <div className="text-sm font-semibold text-slate-700 mb-2">{t('identity_kit.theme_label')}</div>
        <div className="flex gap-2">
          {(['classic', 'cute', 'neon'] as IdentityKitTheme[]).map((theme) => (
            <button
              key={theme}
              onClick={() => setSelectedTheme(theme)}
              className={`flex-1 py-2 px-3 rounded-xl border text-sm font-semibold transition ${
                selectedTheme === theme
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-300 hover:border-slate-500'
              }`}
            >
              {t(`identity_kit.theme_${theme}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-1 gap-3">
        <button
          onClick={handleGeneratePassport}
          disabled={generating}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-[#0056D2] to-purple-600 text-white font-semibold hover:from-[#0047ad] hover:to-purple-700 transition disabled:opacity-50"
        >
          {generating && currentType === 'passport' ? t('identity_kit.generating') : t('identity_kit.generate_passport')}
        </button>
        
        <button
          onClick={handleGenerateQR}
          disabled={generating}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-red-600 to-orange-600 text-white font-semibold hover:from-red-700 hover:to-orange-700 transition disabled:opacity-50"
        >
          {generating && currentType === 'qr_card' ? t('identity_kit.generating') : t('identity_kit.generate_qr')}
        </button>
      </div>

      {/* Preview */}
      {generatedImage && (
        <div className="space-y-3 animate-fadeIn">
          <div className="relative rounded-xl overflow-hidden border border-slate-200">
            <img 
              src={generatedImage} 
              alt={t('identity_kit.preview_alt')}
              className="w-full h-auto"
              style={{ maxHeight: '400px', objectFit: 'contain' }}
            />
          </div>
          
          <button
            onClick={handleShare}
            className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition"
          >
            {t('identity_kit.share')}
          </button>
        </div>
      )}

      {/* Info */}
      <div className="text-xs text-slate-500 border-t border-slate-200 pt-3">
        💡 {t('identity_kit.disclaimer')}
      </div>
    </div>
  );
}
