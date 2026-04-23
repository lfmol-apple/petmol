'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence, PanInfo, type Variants } from 'framer-motion';

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
      setDirection(-1);
      onPetChange(pets[currentIndex - 1].id);
    } else if (info.offset.x < 0 && currentIndex < pets.length - 1) {
      setDirection(1);
      onPetChange(pets[currentIndex + 1].id);
    }
  };

  const springTransition = { type: 'spring' as const, stiffness: 450, damping: 45 };

  const variants: Variants = {
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
      }
    },
    exit: (dir: number) => ({
      x: dir > 0 ? '-100%' : dir < 0 ? '100%' : 0,
      opacity: 0,
      transition: {
        x: springTransition,
        opacity: { duration: 0.25 },
      }
    }),
  };

  return (
    <div className="w-full relative overflow-x-hidden">
      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.div
          key={selectedPetId}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          onPanEnd={handlePanEnd}
          className="w-full touch-pan-y"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
