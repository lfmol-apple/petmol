'use client';

import { useI18n } from '@/lib/I18nContext';
import { PremiumScreenShell, PremiumCard } from '@/components/premium';

export default function TermsPage() {
  const { t } = useI18n();
  
  return (
    <PremiumScreenShell
      title={t('terms.title')}
      backHref="/"
    >
      <PremiumCard>
        <p className="text-slate-500 text-xs mb-4">
          <strong>{t('terms.last_updated.label')}</strong> {t('terms.last_updated.value')}
        </p>

        <h2 className="text-base font-semibold text-slate-800 mt-4 mb-2">{t('terms.section1.title')}</h2>
        <p className="text-slate-600 text-sm leading-relaxed">{t('terms.section1.text')}</p>

        <h2 className="text-base font-semibold text-slate-800 mt-6 mb-2">{t('terms.section2.title')}</h2>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 my-2">
          <p className="text-amber-800 font-medium text-sm">{t('terms.section2.warning')}</p>
          <p className="text-amber-700 text-sm mt-2">{t('terms.section2.text')}</p>
        </div>

        <h2 className="text-base font-semibold text-slate-800 mt-6 mb-2">{t('terms.section3.title')}</h2>
        <p className="text-slate-600 text-sm leading-relaxed">{t('terms.section3.text')}</p>

        <h2 className="text-base font-semibold text-slate-800 mt-6 mb-2">{t('terms.section4.title')}</h2>
        <p className="text-slate-600 text-sm leading-relaxed">{t('terms.section4.text')}</p>

        <h2 className="text-base font-semibold text-slate-800 mt-6 mb-2">{t('terms.section5.title')}</h2>
        <p className="text-slate-600 text-sm leading-relaxed">{t('terms.section5.text')}</p>
      </PremiumCard>
    </PremiumScreenShell>
  );
}

