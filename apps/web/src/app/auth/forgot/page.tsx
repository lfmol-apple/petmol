'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/I18nContext';
import { PremiumScreenShell, PremiumCard } from '@/components/premium';

export default function ForgotPage() {
  const { t } = useI18n();

  return (
    <PremiumScreenShell
      title={t('auth.forgot_title')}
      backHref="/login"
    >
      {/* Logo */}
      <div className="text-center pt-6 pb-4">
        <div className="text-4xl mb-2">🐾</div>
        <div className="text-2xl font-bold text-slate-900">PETMOL</div>
        <p className="text-slate-500 text-sm mt-1">{t('auth.forgot_title')}</p>
      </div>

      <PremiumCard variant="info" title="ℹ️  Recuperação de senha">
        <p className="text-sm text-slate-600">{t('auth.forgot_unavailable')}</p>
      </PremiumCard>

      <p className="text-center text-sm text-slate-500 mt-6">
        <Link href="/login" className="text-[#0056D2] hover:text-[#003889] font-medium hover:underline transition-colors">
          {t('auth.back_to_login')}
        </Link>
      </p>
    </PremiumScreenShell>
  );
}
