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
    const swipeThreshold = 50;
    if (info.offset.x > swipeThreshold && currentIndex > 0) {
      setDirection(-1);
      onPetChange(pets[currentIndex - 1].id);
    } else if (info.offset.x < -swipeThreshold && currentIndex < pets.length - 1) {
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
      {/* O Grid garante que ambos os componentes (antigo e novo) ocupem o mesmo espaço sem salto de altura */}
      <div className="grid grid-cols-1 grid-rows-1 items-start">
        <AnimatePresence initial={false} custom={direction}>
          <motion.div
            key={selectedPetId}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            onPanEnd={handlePanEnd}
            className="w-full touch-pan-y"
            style={{ 
              gridColumn: 1, 
              gridRow: 1,
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'translate3d(0,0,0)',
              WebkitTransform: 'translate3d(0,0,0)',
              willChange: 'transform, opacity'
            }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

