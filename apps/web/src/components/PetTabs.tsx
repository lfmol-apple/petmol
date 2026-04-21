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

  // Detecta a direção da mudança de pet para o slide
  useEffect(() => {
    const newIndex = pets.findIndex((p) => p.id === selectedPetId);
    // Não atualiza se o índice não mudar
  }, [selectedPetId, pets]);

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

  const springTransition = { type: 'spring' as const, stiffness: 300, damping: 30 };

  const variants: Variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? '100%' : '-100%',
      opacity: 0,
      scale: 0.95,
    }),
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
      transition: {
        x: springTransition,
        opacity: { duration: 0.2 },
        scale: { duration: 0.3 }
      }
    },
    exit: (direction: number) => ({
      x: direction > 0 ? '-100%' : '100%',
      opacity: 0,
      scale: 0.95,
      transition: {
        x: springTransition,
        opacity: { duration: 0.2 },
        scale: { duration: 0.3 }
      }
    }),
  };

  return (
    <div className="w-full relative overflow-hidden">
      <AnimatePresence initial={false} custom={direction} mode="popLayout">
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
