'use client';

/**
 * ThemePicker — seletor de tema PETMOL.
 * Aparece como um badge pequeno no canto inferior-esquerdo da tela.
 * Persiste tema em localStorage e dispara evento custom "petmol:theme".
 * 
 * Renderiza em:
 * - Desenvolvimento (NODE_ENV=development) sempre
 * - Produção se NEXT_PUBLIC_THEME_PICKER_ENABLED=true
 */

import { useState, useEffect } from 'react';
import type { CardThemeName } from './CardTheme';

const THEMES: CardThemeName[] = ['ocean', 'sunset', 'mint', 'midnight'];
const STORAGE_KEY = 'petmol_card_theme';

const LABELS: Record<CardThemeName, string> = {
  ocean: '🌊',
  sunset: '🌅',
  mint: '🌿',
  midnight: '🌙',
};

export function ThemePicker() {
  // Renderiza em dev OU se flag de produção ativa
  const isDev = process.env.NODE_ENV !== 'production';
  const enabledInProd = process.env.NEXT_PUBLIC_THEME_PICKER_ENABLED === 'true';
  
  if (!isDev && !enabledInProd) return null;

  return <ThemePickerInner />;
}

function ThemePickerInner() {
  const [active, setActive] = useState<CardThemeName>(() => {
    if (typeof window === 'undefined') return 'ocean';
    // 1) localStorage (fonte principal)
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as CardThemeName | null;
      if (stored && THEMES.includes(stored)) return stored;
    } catch { /* noop */ }
    // 2) ?theme= na URL (override opcional)
    try {
      const t = new URLSearchParams(window.location.search).get('theme') as CardThemeName | null;
      if (t && THEMES.includes(t)) return t;
    } catch { /* noop */ }
    return 'ocean';
  });
  const [open, setOpen] = useState(false);

  function pick(theme: CardThemeName) {
    setActive(theme);
    setOpen(false);
    
    // MODO GLOBAL: salvar em localStorage (todas as páginas)
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch { /* noop */ }
    
    // Disparar evento custom para BrandedCards escutarem
    window.dispatchEvent(new Event('petmol:theme'));
    
    // MODO URL (?theme=): usuário pode adicionar manualmente na URL
    // Ex: /home?theme=mint → override sem salvar localStorage
    // Não atualizamos URL automaticamente aqui (evita conflito)
  }

  return (
    <div
      className="fixed bottom-4 left-4 z-[9999] flex flex-col gap-1"
      style={{ fontFamily: 'system-ui, sans-serif' }}
    >
      {open &&
        THEMES.map((t) => (
          <button
            key={t}
            onClick={() => pick(t)}
            title={t}
            className={`w-8 h-8 rounded-full border-2 text-base shadow transition-transform hover:scale-110 ${
              active === t ? 'border-white scale-110' : 'border-transparent opacity-70'
            }`}
            style={{ background: themeGradient(t) }}
          >
            {LABELS[t]}
          </button>
        ))}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Alterar tema dos cards (dev)"
        className="w-8 h-8 rounded-full bg-black/60 text-white text-xs shadow-lg border border-white/20 hover:bg-black/80 transition-all"
      >
        🎨
      </button>
    </div>
  );
}

function themeGradient(t: CardThemeName): string {
  switch (t) {
    case 'ocean': return 'linear-gradient(135deg,#4f46e5,#2563eb,#0f172a)';
    case 'sunset': return 'linear-gradient(135deg,#f97316,#ef4444,#be123c)';
    case 'mint': return 'linear-gradient(135deg,#10b981,#14b8a6,#0e7490)';
    case 'midnight': return 'linear-gradient(135deg,#18181b,#0f172a,#1e1b4b)';
  }
}
