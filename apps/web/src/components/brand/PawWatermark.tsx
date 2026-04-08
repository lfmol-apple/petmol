'use client';

import React from 'react';

/**
 * PawWatermark (brand/)
 * Grupo de 3–4 patinhas SVG posicionadas como marca d'água decorativa.
 * O container pai DEVE ter `relative overflow-hidden`.
 * 
 * Variant:
 * - 'triple' (default): 3 patinhas em diagonal (grande, média, pequena)
 * - 'single': 1 patinha grande centralizada
 * 
 * Adapta scale automaticamente em mobile (< 640px).
 */

export type PawPosition = 'br' | 'tr' | 'bl' | 'tl' | 'center';

interface PawWatermarkProps {
  /** Posição do grupo. Default: 'br' */
  position?: PawPosition;
  /** Opacidade 0–1. Default: 0.08 */
  opacity?: number;
  /** Escala base das patinhas. Default: 1 (auto-reduzida em mobile) */
  scale?: number;
  /** Variante: 'triple' (3 patinhas) ou 'single' (1 patinha). Default: 'triple' */
  variant?: 'triple' | 'single';
  /** Classe de cor Tailwind (ex: "text-white"). Default: "text-white" */
  colorClass?: string;
  /** mix-blend-mode CSS. Default: 'soft-light' */
  blendMode?: string;
  className?: string;
}

/**
 * Patinha SVG individual (mesma forma do PawIcon original).
 * Todas as dimensões são relativas ao viewBox 100×100.
 */
function PawSvg({
  size,
  rotate,
  style,
}: {
  size: number;
  rotate: number;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
      style={{ transform: `rotate(${rotate}deg)`, flexShrink: 0, ...style }}
    >
      <ellipse cx="22" cy="27" rx="11" ry="13" />
      <ellipse cx="42" cy="15" rx="12" ry="14" />
      <ellipse cx="63" cy="15" rx="12" ry="14" />
      <ellipse cx="83" cy="27" rx="11" ry="13" />
      <path d="M50,43 C34,43 20,53 18,67 C16,79 24,92 38,93 C43,94 47,89 50,89 C53,89 57,94 62,93 C76,92 84,79 82,67 C80,53 66,43 50,43 Z" />
    </svg>
  );
}

/** Layout absoluto baseado no position prop */
function positionStyles(pos: PawPosition): React.CSSProperties {
  switch (pos) {
    case 'tr': return { top: 0, right: 0, transform: 'translate(20%, -20%)' };
    case 'bl': return { bottom: 0, left: 0, transform: 'translate(-20%, 20%)' };
    case 'tl': return { top: 0, left: 0, transform: 'translate(-20%, -20%)' };
    case 'center': return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    case 'br':
    default:
      return { bottom: 0, right: 0, transform: 'translate(15%, 15%)' };
  }
}

export function PawWatermark({
  position = 'br',
  opacity = 0.08,
  scale = 1,
  variant = 'triple',
  colorClass = 'text-white',
  blendMode = 'soft-light',
  className = '',
}: PawWatermarkProps) {
  // Detectar mobile e aplicar scale reduzida automaticamente
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth < 640); // Tailwind 'sm' breakpoint
    }
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Scale final: reduzida em mobile (0.75x)
  const finalScale = isMobile ? scale * 0.75 : scale;

  const b = 56 * finalScale; // big
  const m = 42 * finalScale; // medium
  const s = 32 * finalScale; // small

  return (
    <div
      aria-hidden="true"
      className={`absolute pointer-events-none select-none ${colorClass} ${className}`}
      style={{
        ...positionStyles(position),
        opacity,
        mixBlendMode: blendMode as React.CSSProperties['mixBlendMode'],
        zIndex: 0,
      }}
    >
      {variant === 'single' ? (
        /* Variant SINGLE: 1 patinha grande */
        <PawSvg size={b} rotate={-15} />
      ) : (
        /* Variant TRIPLE: 3 patinhas em diagonal (padrão) */
        <div style={{ position: 'relative', width: b + m * 0.6, height: b + s * 0.6 }}>
          {/* Grande — canto */}
          <PawSvg size={b} rotate={-15} style={{ position: 'absolute', bottom: 0, right: 0 }} />
          {/* Média — acima e à esquerda */}
          <PawSvg size={m} rotate={-20} style={{ position: 'absolute', bottom: b * 0.45, right: b * 0.5 }} />
          {/* Pequena — no topo */}
          <PawSvg size={s} rotate={-25} style={{ position: 'absolute', bottom: b * 0.82, right: b * 0.78 }} />
        </div>
      )}
    </div>
  );
}
