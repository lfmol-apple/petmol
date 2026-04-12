'use client';

import { useState, useRef } from 'react';
import { useI18n } from '@/lib/I18nContext';

interface Pet {
  id: number | string;
  name: string;
  photo?: string;
  species: string;
}

interface PetTabsProps {
  pets: Pet[];
  selectedPetId: number | string;
  onPetChange: (petId: number | string) => void;
  children: React.ReactNode;
}

// Helper para converter caminho de foto em URL
const getPhotoUrl = (photoPath: string | undefined | null): string | null => {
  if (!photoPath) return null;
  if (photoPath.startsWith('data:') || photoPath.startsWith('http')) return photoPath;
  const configured = String(process.env.NEXT_PUBLIC_PHOTOS_BASE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? '')
    .replace(/\/api\/?$/, '')
    .replace(/\/$/, '');
  const photosBase = configured || (typeof window !== 'undefined' ? window.location.origin : '');
  const normalized = photoPath.replace(/^\/+/, '');
  const path = normalized.startsWith('uploads/') ? `/${normalized}` : `/uploads/${normalized}`;
  return `${photosBase}${path}`;
};

export function PetTabs({ pets, selectedPetId, onPetChange, children }: PetTabsProps) {
  const { t } = useI18n();
  const swipeLockedRef = useRef(false);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const horizontalIntentRef = useRef<boolean | null>(null);
  const [dragX, setDragX] = useState(0);

  const currentIndex = pets.findIndex(p => p.id === selectedPetId);
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex >= 0 && currentIndex < pets.length - 1;

  const triggerSwipe = (nextDirection: -1 | 1) => {
    if (swipeLockedRef.current) return;

    if (nextDirection === -1 && canGoPrev) {
      swipeLockedRef.current = true;
      onPetChange(pets[currentIndex - 1].id);
      setTimeout(() => { swipeLockedRef.current = false; }, 180);
    }

    if (nextDirection === 1 && canGoNext) {
      swipeLockedRef.current = true;
      onPetChange(pets[currentIndex + 1].id);
      setTimeout(() => { swipeLockedRef.current = false; }, 180);
    }
  };

  const onTouchStartCapture = (e: React.TouchEvent<HTMLDivElement>) => {
    touchStartXRef.current = e.touches[0]?.clientX ?? null;
    touchStartYRef.current = e.touches[0]?.clientY ?? null;
    horizontalIntentRef.current = null;
  };

  const onTouchMoveCapture = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;

    const dx = (e.touches[0]?.clientX ?? touchStartXRef.current) - touchStartXRef.current;
    const dy = (e.touches[0]?.clientY ?? touchStartYRef.current) - touchStartYRef.current;

    if (horizontalIntentRef.current === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
      horizontalIntentRef.current = Math.abs(dx) > Math.abs(dy);
    }

    if (horizontalIntentRef.current) {
      e.stopPropagation();
      setDragX(dx);
    }
  };

  const onTouchEndCapture = (e: React.TouchEvent<HTMLDivElement>) => {
    if (
      horizontalIntentRef.current &&
      touchStartXRef.current !== null &&
      (e.changedTouches?.[0]?.clientX ?? null) !== null
    ) {
      const endX = e.changedTouches[0].clientX;
      const deltaX = endX - touchStartXRef.current;
      if (Math.abs(deltaX) > 56) {
        if (deltaX > 0) triggerSwipe(-1);
        else triggerSwipe(1);
      }
    }

    if (horizontalIntentRef.current) {
      e.stopPropagation();
    }
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    horizontalIntentRef.current = null;
    setDragX(0);
  };

  return (
    <div className="w-full">
      <div
        className="relative overflow-hidden"
        style={{ transform: 'translateZ(0)', WebkitTransform: 'translateZ(0)', touchAction: 'pan-y' }}
        onTouchStartCapture={onTouchStartCapture}
        onTouchMoveCapture={onTouchMoveCapture}
        onTouchEndCapture={onTouchEndCapture}
        onTouchCancelCapture={onTouchEndCapture}
      >
        <div
          key={selectedPetId}
          className="w-full"
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: `translateX(${dragX}px)`,
            transition: dragX === 0 ? 'transform 0.2s ease-out' : 'none',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
