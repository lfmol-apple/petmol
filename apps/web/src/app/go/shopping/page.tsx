'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/I18nContext';
import { PremiumScreenShell } from '@/components/premium';

function ShoppingBridgeContent() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  
  const leadId = searchParams.get('lead_id');
  const query = searchParams.get('q');
  const country = searchParams.get('country') || 'BR';
  const locale = searchParams.get('locale') || 'pt-BR';

  // Build Google Shopping URL
  const googleShoppingUrl = query
    ? `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(query)}&gl=${country}&hl=${locale.split('-')[0]}`
    : null;

  useEffect(() => {
    if (!query || !leadId) return;

    // Save pending purchase to localStorage
    const pending = {
      q: query,
      lead_id: leadId,
      ts: Date.now(),
    };
    localStorage.setItem('petmol_pending_purchase', JSON.stringify(pending));

    // Try to open Google Shopping in new tab automatically
    if (googleShoppingUrl) {
      const newWindow = window.open(googleShoppingUrl, '_blank', 'noopener,noreferrer');
      if (!newWindow) {
        // Popup blocked - user will need to click the button
        console.log('Popup blocked, showing manual button');
      }
    }
  }, [query, leadId, googleShoppingUrl]);

  const handleSaveReorder = () => {
    if (!query) return;
    
    // Save to reorder list
    const reorders = JSON.parse(localStorage.getItem('petmol_reorders') || '[]');
    reorders.unshift({
      query,
      saved_at: Date.now(),
      lead_id: leadId,
    });
    localStorage.setItem('petmol_reorders', JSON.stringify(reorders.slice(0, 50)));
    
    setSaved(true);
    setTimeout(() => router.push('/'), 2000);
  };

  if (!query || !googleShoppingUrl) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-4">{t('go.shopping.invalid.title')}</h1>
          <p className="text-slate-600 mb-6">
            {t('go.shopping.invalid.subtitle')}
          </p>
          <Link
            href="/"
            className="inline-block px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            {t('go.shopping.invalid.back')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="text-center mb-8">
        <div className="text-6xl mb-4">🛍️</div>
        <h1 className="text-3xl font-bold text-slate-900 mb-3">
          {t('go.shopping.title')}
        </h1>
        <p className="text-slate-600">
          {t('go.shopping.searching')}: <span className="font-semibold">{query}</span>
        </p>
        <p className="text-xs text-slate-400 mt-2">
          {t('go.shopping.lead')}: {leadId}
        </p>
      </div>

      <div className="space-y-4">
        {/* Botão grande: Abrir Google Shopping */}
        <a
          href={googleShoppingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full px-8 py-4 bg-[#0056D2] text-white text-lg font-semibold rounded-xl hover:bg-[#0047ad] transition-colors text-center"
        >
          {t('go.shopping.open_now')}
        </a>

        {/* Botão grande: Voltar ao PETMOL */}
        <Link
          href="/"
          className="block w-full px-8 py-4 bg-slate-100 text-slate-900 text-lg font-semibold rounded-xl hover:bg-slate-200 transition-colors text-center"
        >
          {t('go.shopping.back')}
        </Link>

        {/* Ação rápida: Salvar como recompra */}
        <div className="pt-4 border-t">
          <button
            onClick={handleSaveReorder}
            disabled={saved}
            className={`w-full px-6 py-3 rounded-lg font-medium transition-colors ${
              saved
                ? 'bg-green-100 text-green-800'
                : 'bg-amber-50 text-amber-900 hover:bg-amber-100'
            }`}
          >
            {saved ? t('go.shopping.reorder_saved') : t('go.shopping.reorder_save')}
          </button>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="mt-8 p-4 bg-slate-50 rounded-lg text-sm text-slate-600 text-center">
        {t('go.shopping.disclaimer')}
      </div>
    </div>
  );
}

export default function ShoppingBridgePage() {
  const { t } = useI18n();
  return (
    <PremiumScreenShell title={t('go.shopping.title')} hideBack>
    <Suspense fallback={
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <div className="text-6xl mb-4">🛍️</div>
        <h1 className="text-3xl font-bold text-slate-900 mb-3">
          {t('common.loading')}
        </h1>
      </div>
    }>
      <ShoppingBridgeContent />
    </Suspense>
    </PremiumScreenShell>
  );
}
