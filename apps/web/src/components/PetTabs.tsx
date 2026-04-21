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

  // Detecta a direção da mudança de pet para o efeito de slide
  useEffect(() => {
    if (currentIndex !== prevIndex && currentIndex !== -1 && prevIndex !== -1) {
      setDirection(currentIndex > prevIndex ? 1 : -1);
      setPrevIndex(currentIndex);
    } else if (prevIndex === -1 && currentIndex !== -1) {
      setPrevIndex(currentIndex);
    }
  }, [currentIndex, prevIndex, pets]);

  const handleDragEnd = (event: any, info: PanInfo) => {
    const swipeThreshold = 50;
    if (info.offset.x > swipeThreshold && currentIndex > 0) {
      setDirection(-1);
      onPetChange(pets[currentIndex - 1].id);
    } else if (info.offset.x < -swipeThreshold && currentIndex < pets.length - 1) {
      setDirection(1);
      onPetChange(pets[currentIndex + 1].id);
    }
  };

  const springTransition = { type: 'spring' as const, stiffness: 400, damping: 40 };

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
        opacity: { duration: 0.2 },
      }
    },
    exit: (dir: number) => ({
      x: dir > 0 ? '-100%' : dir < 0 ? '100%' : 0,
      opacity: 0,
      transition: {
        x: springTransition,
        opacity: { duration: 0.2 },
      }
    }),
  };

  return (
    <div className="w-full relative overflow-hidden">
      <AnimatePresence initial={false} custom={direction} mode="wait">
        <motion.div
          key={selectedPetId}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          onDragEnd={handleDragEnd}
          className="w-full touch-pan-y"
          style={{ cursor: 'grab' }}
          whileTap={{ cursor: 'grabbing' }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
