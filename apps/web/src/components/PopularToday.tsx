'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { getPopular, PopularItem, ApiError } from '@/lib/api';
import { formatPriceRange, formatPricePerKg, formatUpdatedAgo } from '@/lib/format';
import { useI18n } from '@/lib/I18nContext';

type Status = 'loading' | 'success' | 'empty' | 'error';

export function PopularToday() {
  const { t } = useI18n();
  const [items, setItems] = useState<PopularItem[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadPopular = useCallback(async () => {
    setStatus('loading');
    setErrorMessage(null);

    try {
      const data = await getPopular({ country: 'BR', limit: 6 });
      
      if (data.items.length === 0) {
        setStatus('empty');
      } else {
        setItems(data.items);
        setStatus('success');
      }
    } catch (err) {
      console.error('Error loading popular:', err);
      setStatus('error');
      
      if (err instanceof ApiError) {
        if (err.isTimeout) {
          setErrorMessage(t('popular_today.errors.timeout'));
        } else if (err.isNetwork) {
          setErrorMessage(t('popular_today.errors.network'));
        } else {
          setErrorMessage(t('popular_today.errors.generic'));
        }
      } else {
        setErrorMessage(t('popular_today.errors.generic'));
      }
    }
  }, [t]);

  useEffect(() => {
    loadPopular();
  }, [loadPopular]);

  // Loading state
  if (status === 'loading') {
    return (
      <section className="py-12">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900">{t('popular_today.title')}</h2>
          <p className="text-slate-600 text-sm mt-1">{t('popular_today.subtitle')}</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-slate-100 rounded-xl h-48 animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  // Empty state
  if (status === 'empty') {
    return (
      <section className="py-12">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900">{t('popular_today.title')}</h2>
          <p className="text-slate-600 text-sm mt-1">{t('popular_today.subtitle')}</p>
        </div>
        <div className="bg-slate-50 rounded-2xl p-8 text-center">
          <div className="text-4xl mb-3">🔍</div>
          <p className="text-slate-600">{t('popular_today.empty')}</p>
        </div>
      </section>
    );
  }

  // Error state
  if (status === 'error') {
    return (
      <section className="py-12">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900">{t('popular_today.title')}</h2>
          <p className="text-slate-600 text-sm mt-1">{t('popular_today.subtitle')}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="text-red-700 mb-4">{errorMessage || t('popular_today.errors.fallback')}</p>
          <button
            onClick={loadPopular}
            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors"
          >
            {t('popular_today.retry')}
          </button>
        </div>
      </section>
    );
  }

  // Success state
  return (
    <section className="py-12">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">{t('popular_today.title')}</h2>
        <p className="text-slate-600 text-sm mt-1">{t('popular_today.subtitle')}</p>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {items.map((item) => {
          const priceText = formatPriceRange(item.min_price, item.max_price, item.currency);
          const pricePerKgText = formatPricePerKg(item.price_per_kg, item.currency);
          const updatedText = formatUpdatedAgo(item.fetched_at);
          
          return (
            <Link
              key={item.product_id}
              href={`/p/product/${item.product_id}`}
              className="group bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-lg hover:border-primary-300 transition-all"
            >
              {/* Image */}
              <div className="aspect-square bg-slate-100 relative">
                {item.image_url ? (
                  <Image
                    src={item.image_url}
                    alt={item.title}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform"
                    unoptimized
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-300">
                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                )}
              </div>
              
              {/* Info */}
              <div className="p-3">
                <p className="font-medium text-slate-900 text-sm truncate mb-1">
                  {item.title}
                </p>
                {item.brand && (
                  <p className="text-xs text-slate-500 truncate mb-1">
                    {item.brand}
                    {item.size_text && ` · ${item.size_text}`}
                  </p>
                )}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {priceText && (
                    <span className="text-sm font-semibold text-green-600">{priceText}</span>
                  )}
                  {pricePerKgText ? (
                    <span className="text-xs text-slate-400">({pricePerKgText})</span>
                  ) : (
                    <span className="text-xs text-slate-300">(—/kg)</span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1">{updatedText}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
