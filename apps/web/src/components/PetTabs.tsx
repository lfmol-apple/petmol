'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, PanInfo, useReducedMotion, type Variants } from 'framer-motion';

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

export function PetTabs({ pets, selectedPetId, onPetChange, children }: PetTabsProps) {
  const [direction, setDirection] = useState(0);
  const currentIndex = pets.findIndex((p) => p.id === selectedPetId);
  const [prevIndex, setPrevIndex] = useState(currentIndex);
  const prefersReducedMotion = useReducedMotion();
  // Initialise synchronously to avoid a mode-flip on first paint (SSR → client).
  // Defaults to true (mobile) so the transition style is correct before hydration.
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const media = window.matchMedia('(max-width: 768px), (pointer: coarse)');
    const update = () => setIsMobileViewport(media.matches);
    // No need to call update() here — useState initialiser already read the value.

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }

    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  // Detecta a direção da mudança de pet
  useEffect(() => {
    if (currentIndex !== prevIndex && currentIndex !== -1 && prevIndex !== -1) {
      setDirection(currentIndex > prevIndex ? 1 : -1);
      setPrevIndex(currentIndex);
    } else if (prevIndex === -1 && currentIndex !== -1) {
      setPrevIndex(currentIndex);
    }
  }, [currentIndex, prevIndex, pets]);

  // Usamos PanEnd em vez de DragEnd para evitar alteração física contínua no DOM durante o toque
  const handlePanEnd = (event: any, info: PanInfo) => {
    const target = event?.target as HTMLElement | null;
    if (target?.closest('button, a, input, textarea, select, [role="button"], [data-no-swipe="true"]')) {
      return;
    }

    const absX = Math.abs(info.offset.x);
    const absY = Math.abs(info.offset.y);
    const absVelocityX = Math.abs(info.velocity.x);

    // Evita trocar pet durante scroll vertical no mobile.
    const isHorizontalIntent = absX > absY * 1.15;
    const hasDistanceOrVelocity = absX > 70 || absVelocityX > 650;
    if (!isHorizontalIntent || !hasDistanceOrVelocity) return;

    if (info.offset.x > 0 && currentIndex > 0) {
      onPetChange(pets[currentIndex - 1].id);
    } else if (info.offset.x < 0 && currentIndex < pets.length - 1) {
      onPetChange(pets[currentIndex + 1].id);
    }
  };

  const mobileSafeTransition = prefersReducedMotion || isMobileViewport;
  const springTransition = { type: 'spring' as const, stiffness: 450, damping: 45 };

  const variants = useMemo<Variants>(() => {
    if (mobileSafeTransition) {
      return {
        enter: { x: 0, opacity: 0 },
        center: {
          x: 0,
          opacity: 1,
          transition: { opacity: { duration: 0.18 } },
        },
        exit: {
          x: 0,
          opacity: 0,
          transition: { opacity: { duration: 0.12 } },
        },
      };
    }

    return {
      enter: (dir: number) => ({
        x: dir > 0 ? '100%' : dir < 0 ? '-100%' : 0,
        opacity: 0,
      }),
      center: {
        x: 0,
        opacity: 1,
        transition: {
          x: springTransition,
          opacity: { duration: 0.25 },
        },
      },
      exit: (dir: number) => ({
        x: dir > 0 ? '-100%' : dir < 0 ? '100%' : 0,
        opacity: 0,
        transition: {
          x: springTransition,
          opacity: { duration: 0.25 },
        },
      }),
    };
  }, [mobileSafeTransition]);

  return (
    <div className="w-full relative overflow-x-hidden">
      {/* O Grid garante que ambos os componentes (antigo e novo) ocupem o mesmo espaço sem salto de altura */}
      <div className="grid grid-cols-1 grid-rows-1 items-start">
        <AnimatePresence initial={false} custom={direction} mode={mobileSafeTransition ? 'wait' : 'sync'}>
          <motion.div
            key={selectedPetId}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            onPanEnd={handlePanEnd}
            className="w-full touch-pan-y"
            style={{ gridColumn: 1, gridRow: 1 }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
