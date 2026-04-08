'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { useI18n } from '@/lib/I18nContext';
import { PremiumScreenShell, PremiumCard } from '@/components/premium';

function ErrorContent() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const reason = searchParams?.get('reason') || 'unknown';
  const query = searchParams?.get('query') || '';
  const channel = searchParams?.get('channel') || '';
  const source = searchParams?.get('source') || '';
  const suggestionsParam = searchParams?.get('suggestions') || '';
  
  // Parse suggestions
  const suggestions = suggestionsParam ? suggestionsParam.split(',').filter(Boolean) : [];
  
  // Error messages by reason
  const getErrorMessage = () => {
    switch (reason) {
      case 'non_pet':
        return t('go.error.message.non_pet');
      
      case 'invalid_query':
        return t('go.error.message.invalid_query');
      
      case 'missing_phone':
        if (channel === 'whatsapp') {
          return t('go.error.message.missing_phone_whatsapp');
        }
        if (channel === 'call') {
          return t('go.error.message.missing_phone_call');
        }
        return t('go.error.message.missing_phone');
      
      case 'missing_location':
        return t('go.error.message.missing_location');
      
      case 'provider_error':
        return t('go.error.message.provider_error');
      
      case 'rate_limited':
        return t('go.error.message.rate_limited');
      
      default:
        return t('go.error.message.default');
    }
  };
  
  const getTitle = () => {
    if (reason === 'non_pet') {
      return t('go.error.title.non_pet');
    }
    if (reason === 'missing_location') {
      return t('go.error.title.missing_location');
    }
    if (reason === 'rate_limited') {
      return t('go.error.title.rate_limited');
    }
    if (reason === 'provider_error') {
      return t('go.error.title.provider_error');
    }
    return t('go.error.title.default');
  };
  
  const handleSuggestionClick = (suggestion: string) => {
    // Go back to home with suggestion prefilled
    router.push(`/?q=${encodeURIComponent(suggestion)}`);
  };
  
  return (
    <PremiumScreenShell title={getTitle()} backHref="/home">
      <div className="px-4 py-6">
        <PremiumCard>
          <div className="text-center mb-6">
            <p className="text-slate-600 mb-4">
              {getErrorMessage()}
            </p>
          
          {query && reason !== 'missing_phone' && (
            <p className="text-sm text-slate-500 font-mono bg-slate-100 px-3 py-2 rounded inline-block">
              {query}
            </p>
          )}
        </div>

        {/* Pet Suggestions */}
        {suggestions.length > 0 && reason === 'non_pet' && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <h2 className="text-sm font-semibold text-slate-900 mb-3 text-center">
              {t('go.error.suggestions.title')}
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {suggestions.map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm text-slate-700 hover:bg-blue-100 hover:border-blue-400 transition-colors text-left font-medium"
                >
                  🐾 {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <button
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-gradient-to-r from-[#0056D2] to-violet-600 text-white rounded-xl font-medium hover:scale-105 transition-all"
          >
            {t('go.error.actions.back')}
          </button>
          
          {channel && (
            <button
              onClick={() => router.back()}
              className="px-6 py-3 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200 transition-colors"
            >
              {t('go.error.actions.retry')}
            </button>
          )}
        </div>

        {/* Info footer */}
        <div className="mt-6 pt-6 border-t border-slate-200 text-center text-xs text-slate-500">
          {reason === 'missing_location' ? (
            <div className="space-y-2">
              <p className="font-semibold text-slate-700">
                {t('go.error.footer.location.title')}
              </p>
              <ul className="text-left space-y-1 max-w-sm mx-auto">
                <li>• <strong>Chrome:</strong> {t('go.error.footer.location.chrome')}</li>
                <li>• <strong>Safari:</strong> {t('go.error.footer.location.safari')}</li>
                <li>• <strong>Firefox:</strong> {t('go.error.footer.location.firefox')}</li>
              </ul>
            </div>
          ) : (
            t('go.error.footer.pet_only')
          )}
        </div>
        </PremiumCard>
      </div>
    </PremiumScreenShell>
  );
}

export default function ErrorPage() {
  const { t } = useI18n();
  return (
    <Suspense fallback={
      <PremiumScreenShell title="Erro" backHref="/home">
        <p className="text-center text-slate-500 py-16">{t('common.loading')}</p>
      </PremiumScreenShell>
    }>
      <ErrorContent />
    </Suspense>
  );
}
