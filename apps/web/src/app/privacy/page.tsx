'use client';

import { useI18n } from '@/lib/I18nContext';
import { PremiumScreenShell, PremiumCard } from '@/components/premium';

export default function PrivacyPage() {
  const { t } = useI18n();
  
  return (
    <PremiumScreenShell
      title={t('privacy.title')}
      backHref="/"
    >
      <PremiumCard>
        <p className="text-slate-500 text-xs mb-4">
          <strong>{t('privacy.last_updated.label')}</strong> {t('privacy.last_updated.value')}
        </p>

        <h2 className="text-base font-semibold text-slate-800 mt-4 mb-2">{t('privacy.section1.title')}</h2>
        <ul className="list-disc pl-5 space-y-2 text-slate-600 text-sm">
          <li><strong>{t('privacy.section1.location.label')}</strong> {t('privacy.section1.location.text')}</li>
          <li><strong>{t('privacy.section1.preferences.label')}</strong> {t('privacy.section1.preferences.text')}</li>
          <li><strong>{t('privacy.section1.searches.label')}</strong> {t('privacy.section1.searches.text')}</li>
        </ul>

        <h2 className="text-base font-semibold text-slate-800 mt-6 mb-2">{t('privacy.section2.title')}</h2>
        <ul className="list-disc pl-5 space-y-2 text-slate-600 text-sm">
          <li>{t('privacy.section2.item1')}</li>
          <li>{t('privacy.section2.item2')}</li>
          <li>{t('privacy.section2.item3')}</li>
        </ul>

        <h2 className="text-base font-semibold text-slate-800 mt-6 mb-2">{t('privacy.section3.title')}</h2>
        <p className="text-slate-600 text-sm leading-relaxed">{t('privacy.section3.text')}</p>

        <h2 className="text-base font-semibold text-slate-800 mt-6 mb-2">{t('privacy.section4.title')}</h2>
        <p className="text-slate-600 text-sm leading-relaxed">{t('privacy.section4.text')}</p>

        <h2 className="text-base font-semibold text-slate-800 mt-6 mb-2">{t('privacy.section5.title')}</h2>
        <p className="text-slate-600 text-sm leading-relaxed">{t('privacy.section5.text')}</p>
      </PremiumCard>
    </PremiumScreenShell>
  );
}

