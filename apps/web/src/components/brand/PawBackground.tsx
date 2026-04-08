'use client';

import { useMemo } from 'react';
import { PawIcon } from './PawIcon';

/**
 * PawBackground - Decorative layer of subtle paw prints
 * Uses the EXACT same PawIcon shape as the header
 * Rendered as a fixed background layer, pointer-events:none
 */

interface PawPosition {
  x: number;
  y: number;
  size: number;
  rotation: number;
  opacity: number;
}

// Deterministic pseudo-random based on seed
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
}

// Generate paw positions once (deterministic for SSR hydration)
function generatePawPositions(count: number = 40): PawPosition[] {
  const positions: PawPosition[] = [];
  const cols = 8;
  const rows = Math.ceil(count / cols);
  
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const seed = i * 7919; // Prime for variation
    
    // Base grid position with jitter
    const baseX = (col / cols) * 100;
    const baseY = (row / rows) * 100;
    const jitterX = (seededRandom(seed) - 0.5) * 10;
    const jitterY = (seededRandom(seed + 1) - 0.5) * 10;
    
    positions.push({
      x: Math.min(95, Math.max(2, baseX + jitterX)),
      y: Math.min(95, Math.max(2, baseY + jitterY)),
      size: 16 + seededRandom(seed + 2) * 16, // 16-32px
      rotation: -30 + seededRandom(seed + 3) * 60, // -30 to +30 degrees
      opacity: 0.03 + seededRandom(seed + 4) * 0.03, // 0.03-0.06
    });
  }
  
  return positions;
}

export function PawBackground() {
  // Memoize positions so they don't regenerate on re-render
  const positions = useMemo(() => generatePawPositions(40), []);
  
  return (
    <div 
      className="fixed inset-0 overflow-hidden pointer-events-none z-0"
      aria-hidden="true"
    >
      {positions.map((pos, i) => (
        <div
          key={i}
          className="absolute text-violet-500 dark:text-violet-400"
          style={{
            left: `${pos.x}%`,
            top: `${pos.y}%`,
            transform: `rotate(${pos.rotation}deg)`,
            opacity: pos.opacity,
          }}
        >
          <PawIcon size={pos.size} inherit />
        </div>
      ))}
    </div>
  );
}
