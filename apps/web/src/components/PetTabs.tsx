'use client';

import { motion, PanInfo, useAnimation } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

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
  renderItem: (pet: Pet) => React.ReactNode;
  children?: React.ReactNode;
}

export function PetTabs({ pets, selectedPetId, onPetChange, renderItem }: PetTabsProps) {
  const controls = useAnimation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const index = pets.findIndex((p) => String(p.id) === String(selectedPetId));
    if (index !== -1) {
      setCurrentIndex(index);
      controls.start({ x: `${-index * 100}%`, transition: { type: 'spring', stiffness: 300, damping: 30 } });
    }
  }, [selectedPetId, pets, controls]);
  
  useEffect(() => {
    const updateWidth = () => {
      setContainerWidth(containerRef.current?.clientWidth ?? 0);
    };
  
    updateWidth();
    window.addEventListener('resize', updateWidth);
  
    return () => {
      window.removeEventListener('resize', updateWidth);
    };
  }, []);

  const handleDragEnd = (_: any, info: PanInfo) => {
    const threshold = 100; // pixels
    const velocityThreshold = 500; // px/s

    if (info.offset.x < -threshold || info.velocity.x < -velocityThreshold) {
      // Swipe Left -> Next Pet
      if (currentIndex < pets.length - 1) {
        onPetChange(pets[currentIndex + 1].id);
      } else {
        // Bounce back
        controls.start({ x: `${-currentIndex * 100}%` });
      }
    } else if (info.offset.x > threshold || info.velocity.x > velocityThreshold) {
      // Swipe Right -> Prev Pet
      if (currentIndex > 0) {
        onPetChange(pets[currentIndex - 1].id);
      } else {
        // Bounce back
        controls.start({ x: `${-currentIndex * 100}%` });
      }
    } else {
      // Stay on current
      controls.start({ x: `${-currentIndex * 100}%` });
    }
  };

  return (
    <div className="w-full overflow-hidden" ref={containerRef}>
      <motion.div
        drag="x"
        dragConstraints={{ left: -(pets.length - 1) * containerWidth, right: 0 }}
        dragElastic={0.2}
        onDragEnd={handleDragEnd}
        animate={controls}
        initial={{ x: `${-currentIndex * 100}%` }}
        className="flex"
        style={{ width: `${pets.length * 100}%`, touchAction: 'pan-y' }}
      >
        {pets.map((pet) => (
          <div key={pet.id} className="w-full flex-shrink-0 px-4">
            {renderItem(pet)}
          </div>
        ))}
      </motion.div>
    </div>
  );
}
