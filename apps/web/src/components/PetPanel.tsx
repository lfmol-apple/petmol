'use client';

// TODO(limpeza-leve): componente sem uso evidente no fluxo principal atual.
// Manter por enquanto; reavaliar na limpeza pesada com validacao funcional.

import { useState, useEffect } from 'react';
import { useI18n } from '@/lib/I18nContext';
import Link from 'next/link';

interface ReorderItem {
  id: string;
  query: string;
  category?: string;
  species?: string;
  timestamp: number;
}

export function PetPanel() {
  const { t, geo } = useI18n();
  const [recentItems, setRecentItems] = useState<ReorderItem[]>([]);
  const [petName, setPetName] = useState<string>('');

  useEffect(() => {
    // Load recent reorders
    try {
      const stored = localStorage.getItem('petmol_reorders');
      if (stored) {
        const items: ReorderItem[] = JSON.parse(stored);
        setRecentItems(items.slice(0, 3));
      }
      
      const savedName = localStorage.getItem('petmol_pet_name');
      if (savedName) setPetName(savedName);
    } catch (err) {
      console.error('Failed to load pet data:', err);
    }
  }, []);

  const getReorderUrl = (item: ReorderItem) => {
    const params = new URLSearchParams({
      query: item.query,
      country: geo.country,
      locale: geo.locale,
    });
    if (item.species) params.set('species', item.species);
    if (item.category) params.set('category', item.category);
    return `/api/handoff/shopping?${params}`;
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {/* Pet Identity (optional) */}
      {petName && (
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            {t('pet_panel.greeting', { petName })}
          </h2>
        </div>
      )}

      {/* Quick Reorder (if available) */}
      {recentItems.length > 0 && (
        <div className="bg-white rounded-[24px] shadow-sm ring-1 ring-slate-100/50 p-6 border border-slate-100 overflow-hidden">
          <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <span>🔄</span>
            {t('pet_panel.reorder.title')}
          </h3>
          <div className="space-y-3">
            {recentItems.map((item) => (
              <a
                key={item.id}
                href={getReorderUrl(item)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3 bg-slate-50 hover:bg-primary-50 rounded-xl transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 truncate">{item.query}</p>
                  {(item.species || item.category) && (
                    <p className="text-xs text-slate-500">
                      {item.category && item.category}
                      {item.species && item.category && ' • '}
                      {item.species && item.species}
                    </p>
                  )}
                </div>
                <svg className="w-5 h-5 text-slate-400 group-hover:text-primary-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </a>
            ))}
          </div>
          <Link
            href="/reorder"
            className="block mt-4 text-center text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            {t('pet_panel.reorder.view_all')}
          </Link>
        </div>
      )}

      {/* Primary Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Emergency */}
        <Link
          href="/emergency"
          className="flex flex-col items-center justify-center p-6 bg-gradient-to-br from-red-500 to-red-600 text-white rounded-2xl shadow-lg hover:shadow-xl hover:scale-105 transition-all"
        >
          <span className="text-4xl mb-2">🚨</span>
          <span className="font-bold text-lg">
            {t('pet_panel.emergency.title')}
          </span>
          <span className="text-xs text-red-100 mt-1">
            {t('pet_panel.emergency.subtitle')}
          </span>
        </Link>

        {/* Services */}
        <Link
          href="/services"
          className="flex flex-col items-center justify-center p-6 bg-gradient-to-br from-[#0066ff] to-[#0056D2] text-white rounded-2xl shadow-lg hover:shadow-xl hover:scale-105 transition-all"
        >
          <span className="text-4xl mb-2">🏪</span>
          <span className="font-bold text-lg">
            {t('pet_panel.services.title')}
          </span>
          <span className="text-xs text-blue-100 mt-1">
            {t('pet_panel.services.subtitle')}
          </span>
        </Link>
      </div>

      {/* Secondary Action: Buy Something New */}
      <Link
        href="/buy"
        className="block w-full p-4 bg-white border-2 border-slate-200 hover:border-primary-400 rounded-2xl text-center transition-all group"
      >
        <div className="flex items-center justify-center gap-2 text-slate-700 group-hover:text-primary-600 font-medium">
          <span>🛍️</span>
          <span>{t('pet_panel.buy.title')}</span>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          {t('pet_panel.buy.subtitle')}
        </p>
      </Link>

      {/* Quick Links */}
      <div className="flex items-center justify-center gap-6 text-sm">
        <Link href="/favorites" className="text-slate-600 hover:text-primary-600 transition-colors">
          ⭐ {t('pet_panel.quick_links.favorites')}
        </Link>
        <Link href="/tips" className="text-slate-600 hover:text-primary-600 transition-colors">
          💡 {t('pet_panel.quick_links.tips')}
        </Link>
      </div>
    </div>
  );
}
