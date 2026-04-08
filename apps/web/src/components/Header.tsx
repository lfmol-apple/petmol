'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/I18nContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLogout } from '@/hooks/useLogout';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Header() {
  const { t } = useI18n();
  const { tutor } = useAuth();
  const { initiateLogout } = useLogout();
  const [showLogo, setShowLogo] = useState(false);
  const pathname = usePathname();

  const userLabel = tutor?.name || tutor?.email?.split('@')[0] || null;
  const homeHref = userLabel ? '/home' : '/';

  // Animação de entrada da logo
  useEffect(() => {
    const timer = setTimeout(() => setShowLogo(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const handleLogout = () => { initiateLogout(); };

  // Mostrar header simplificado na landing page (quando não autenticado)
  const isLandingPage = pathname === '/' && !userLabel;

  return (
    <>
      <header className="bg-white border-b-2 border-[#0056D2]/20 sticky top-0 z-50 shadow-[0_2px_12px_rgba(0,86,210,0.10)] transition-shadow duration-300 py-3">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          {/* Marca alinhada à esquerda */}
          <Link
            href={homeHref}
            className={`flex items-center gap-2 transition-all duration-500 ${
              showLogo ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
            }`}
          >
            <span className="text-2xl font-black text-[#0056D2] tracking-tight leading-none flex items-center gap-1.5">
              <span>🐾</span>Petmol
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className={`flex-1 hidden md:flex items-center justify-end gap-4 transition-all duration-500 ${
            showLogo ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'
          }`} style={{ transitionDelay: '200ms' }}>
            
            {/* User Auth */}
            {userLabel ? (
              <div className="flex items-center gap-2">
                <Link
                  href="/profile"
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-xl border border-[#0056D2]/30 text-[#0056D2] text-sm font-semibold hover:bg-blue-50 shadow-sm transition-colors"
                >
                  <span>👤</span>
                  <span>{userLabel}</span>
                </Link>
                <button
                  onClick={handleLogout}
                  className="inline-flex items-center h-9 px-4 rounded-xl border border-[#0056D2]/30 text-[#0056D2] text-sm font-semibold hover:bg-blue-50 shadow-sm transition-colors"
                >
                  {t('common.logout')}
                </button>
              </div>
            ) : (
              !isLandingPage && (
                <Link
                  href="/login"
                  className="inline-flex items-center h-9 px-4 rounded-xl bg-[#0056D2] text-white text-sm font-bold hover:bg-[#0047ad] shadow-sm transition-all"
                >
                  {t('common.login')}
                </Link>
              )
            )}
            
            {/* Language Selector removed — BR launch only */}
          </div>

          {/* Mobile Navigation */}
          <div className={`flex-1 flex md:hidden items-center justify-end gap-2 transition-all duration-500 ${
            showLogo ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'
          }`} style={{ transitionDelay: '200ms' }}>
            
            {/* Mobile User Auth */}
            {userLabel ? (
              <div className="flex items-center gap-1.5">
                <Link
                  href="/profile"
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-[#0056D2]/30 text-[#0056D2] text-sm font-semibold hover:bg-blue-50 shadow-sm transition-colors max-w-[140px] truncate"
                  aria-label="Perfil"
                >
                  <span className="truncate">{userLabel}</span>
                </Link>
                <button
                  onClick={handleLogout}
                  className="inline-flex items-center h-9 px-2.5 rounded-xl border border-[#0056D2]/30 text-[#0056D2] text-xs font-semibold hover:bg-blue-50 shadow-sm transition-colors"
                >
                  Sair
                </button>
              </div>
            ) : (
              !isLandingPage && (
                <Link
                  href="/login"
                  className="inline-flex items-center h-9 px-3 rounded-xl bg-[#0056D2] text-white text-sm font-bold hover:bg-[#0047ad] shadow-sm"
                >
                  Login
                </Link>
              )
            )}
            {/* Mobile Language Selector removed — BR launch only */}
          </div>
        </div>
      </header>
    </>
  );
}

export default Header;
