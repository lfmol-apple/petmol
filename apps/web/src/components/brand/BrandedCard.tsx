'use client';

/**
 * BrandedCard — card com tema PETMOL, gradiente de fundo e patinha watermark.
 *
 * Uso:
 *   <BrandedCard theme="ocean" title="Próximas Vacinas">
 *     {children}
 *   </BrandedCard>
 *
 * Sistema de tema com 3 modos:
 * 1. Global (localStorage "petmol_card_theme") - padrão
 * 2. Override por URL (?theme=) - se allowQueryTheme=true
 * 3. Lock (lockTheme=true) - ignora localStorage/URL, usa só prop theme
 * 
 * Reage em tempo real ao ThemePicker via evento custom "petmol:theme".
 */

import React, { useState, useEffect } from 'react';
import { CARD_THEMES, getTheme } from './CardTheme';
import type { CardThemeName } from './CardTheme';
import { PawWatermark } from './PawWatermark';
import type { PawPosition } from './PawWatermark';

interface BrandedCardProps {
  /** Tema de cor. Default: 'ocean' */
  theme?: CardThemeName;
  /** Título opcional exibido no topo do card */
  title?: React.ReactNode;
  /** Posição da patinha watermark. Default: 'br' */
  pawPosition?: PawPosition;
  /** Estilo da patinha: 'default'|'subtle'|'rich'. Default: 'default' */
  pawStyle?: 'default' | 'subtle' | 'rich';
  /** Se true, ignora localStorage/URL e usa sempre prop theme. Default: false */
  lockTheme?: boolean;
  /** Se true, permite ?theme= override. Default: true em dev, false em prod */
  allowQueryTheme?: boolean;
  /** Classes extras para o wrapper externo */
  className?: string;
  /** Classes extras para o container de conteúdo interno */
  innerClassName?: string;
  children: React.ReactNode;
}

export function BrandedCard({
  theme = 'ocean',
  title,
  pawPosition = 'br',
  pawStyle = 'default',
  lockTheme = false,
  allowQueryTheme,
  className = '',
  innerClassName = '',
  children,
}: BrandedCardProps) {
  // Resolver tema com as 3 opções
  const resolvedTheme = useThemeResolver(theme, lockTheme, allowQueryTheme);
  const cfg = getTheme(resolvedTheme);

  // Ajustar opacidade da patinha conforme pawStyle
  const pawOpacity = pawStyle === 'subtle' ? 0.06 : 
                     pawStyle === 'rich' ? cfg.wmOpacity * 1.2 : 
                     cfg.wmOpacity;

  return (
    <div
      className={`relative overflow-hidden rounded-3xl shadow-lg ${cfg.textClass} ${className}`}
      style={{
        backgroundImage: cfg.bgCss,
      }}
    >
      {/* Patinha watermark principal */}
      <PawWatermark
        position={pawPosition}
        opacity={pawOpacity}
        colorClass={cfg.wmColorClass}
        blendMode={cfg.wmBlend}
      />

      {/* Patinha extra (rich) no canto oposto */}
      {pawStyle === 'rich' && (
        <PawWatermark
          position={pawPosition === 'br' ? 'tl' : 'br'}
          opacity={0.04}
          scale={0.7}
          colorClass={cfg.wmColorClass}
          blendMode={cfg.wmBlend}
        />
      )}

      {/* Conteúdo */}
      <div className={`relative z-10 p-4 md:p-6 ${innerClassName}`}>
        {title && (
          <p className="text-xs font-semibold uppercase tracking-widest opacity-70 mb-2">
            {title}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}

/**
 * Hook: resolve tema com 3 modos:
 * 1. Lock mode (lockTheme=true): sempre usa defaultTheme, ignora tudo
 * 2. Global mode: localStorage "petmol_card_theme" (se válido)
 * 3. URL override: ?theme= (se allowQueryTheme=true)
 * 4. Fallback: defaultTheme
 * 
 * Escuta eventos:
 * - "petmol:theme" (ThemePicker mudou)
 * - "storage" (outra aba mudou localStorage)
 */
function useThemeResolver(
  defaultTheme: CardThemeName,
  lockTheme: boolean,
  allowQueryTheme?: boolean
): CardThemeName {
  const STORAGE_KEY = 'petmol_card_theme';
  
  // Default: permitir ?theme em dev, não em prod
  const queryAllowed = allowQueryTheme ?? (process.env.NODE_ENV !== 'production');

  const [theme, setTheme] = useState<CardThemeName>(() => {
    if (typeof window === 'undefined') return defaultTheme;
    
    // Modo LOCK: usar sempre defaultTheme
    if (lockTheme) return defaultTheme;
    
    // 1) ?theme= na URL (PRIORIDADE MÁXIMA - override)
    if (queryAllowed) {
      try {
        const t = new URLSearchParams(window.location.search).get('theme') as CardThemeName | null;
        if (t && t in CARD_THEMES) return t;
      } catch { /* noop */ }
    }
    
    // 2) localStorage (fonte global)
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as CardThemeName | null;
      if (stored && stored in CARD_THEMES) return stored;
    } catch { /* noop */ }
    
    // 3) fallback
    return defaultTheme;
  });

  useEffect(() => {
    // Se lockTheme=true, não escutar eventos (tema fixo)
    if (lockTheme) return;

    function sync() {
      if (typeof window === 'undefined') return;
      
      // 1) ?theme= na URL (PRIORIDADE MÁXIMA)
      if (queryAllowed) {
        try {
          const t = new URLSearchParams(window.location.search).get('theme') as CardThemeName | null;
          if (t && t in CARD_THEMES) {
            setTheme(t);
            return;
          }
        } catch { /* noop */ }
      }
      
      // 2) localStorage
      try {
        const stored = localStorage.getItem(STORAGE_KEY) as CardThemeName | null;
        if (stored && stored in CARD_THEMES) {
          setTheme(stored);
          return;
        }
      } catch { /* noop */ }
      
      // 3) fallback
      setTheme(defaultTheme);
    }

    // Escutar mudanças
    window.addEventListener('petmol:theme', sync);
    window.addEventListener('storage', sync);
    
    return () => {
      window.removeEventListener('petmol:theme', sync);
      window.removeEventListener('storage', sync);
    };
  }, [defaultTheme, lockTheme, queryAllowed]);

  return theme;
}
