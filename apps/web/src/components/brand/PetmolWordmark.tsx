import React from 'react';

interface PetmolWordmarkProps {
  className?: string;
}

export function PetmolWordmark({ className = '' }: PetmolWordmarkProps) {
  return (
    <span 
      className={`font-extrabold tracking-tight text-white/90 drop-shadow-sm ${className}`}
      style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
    >
      petmol
    </span>
  );
}
