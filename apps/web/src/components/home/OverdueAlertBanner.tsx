'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, X, ChevronRight, ShoppingCart } from 'lucide-react';
import { PetCareReminder, resolveCareCTA } from '@/lib/petCareDomain';

interface OverdueAlertBannerProps {
  overdueReminders: PetCareReminder[];
  onOpenVaccines: () => void;
  onOpenVermifugo: () => void;
  onOpenAntipulgas: () => void;
  onOpenColeira: () => void;
  onOpenGrooming: () => void;
  onOpenMedication: () => void;
  onOpenFood: () => void;
  onOpenEvents: () => void;
}

export function OverdueAlertBanner({
  overdueReminders,
  onOpenVaccines,
  onOpenVermifugo,
  onOpenAntipulgas,
  onOpenColeira,
  onOpenGrooming,
  onOpenMedication,
  onOpenFood,
  onOpenEvents,
}: OverdueAlertBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  // If dismissed or no overdue items, don't show
  if (isDismissed || overdueReminders.length === 0) return null;

  const current = overdueReminders[currentIndex];
  
  const handlers = {
    onOpenVaccines,
    onOpenVermifugo,
    onOpenAntipulgas,
    onOpenColeira,
    onOpenGrooming,
    onOpenMedication,
    onOpenEvents,
    onOpenFood,
  };

  const handleResolve = () => {
    const action = resolveCareCTA(current.action_target, handlers);
    action();
  };

  const nextReminder = () => {
    setCurrentIndex((prev) => (prev + 1) % overdueReminders.length);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className="overflow-hidden"
      >
        <div className="mx-4 mt-4 mb-2">
          <div className="relative overflow-hidden rounded-[24px] bg-red-50 border border-red-100 shadow-sm p-4">
            {/* Background Decorative Element */}
            <div className="absolute top-[-20%] right-[-10%] w-32 h-32 bg-red-100/50 rounded-full blur-3xl pointer-events-none" />
            
            <div className="flex items-start gap-3 relative z-10">
              {/* Icon Container */}
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-[13px] font-black text-red-900 uppercase tracking-tight">
                    Ação Necessária
                  </h3>
                  <button 
                    onClick={() => setIsDismissed(true)}
                    className="p-1 hover:bg-red-100 rounded-full transition-colors"
                  >
                    <X className="w-4 h-4 text-red-400" />
                  </button>
                </div>
                
                <p className="text-[14px] text-red-800 mt-1 leading-snug">
                  <span className="font-bold">{current.label}</span> de {current.pet_id} está em atraso há {Math.abs(current.diff)} dias.
                </p>

                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={handleResolve}
                    className="flex-1 bg-red-600 text-white text-[13px] font-bold py-2 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    Comprar Agora
                  </button>
                  
                  {overdueReminders.length > 1 && (
                    <button
                      onClick={nextReminder}
                      className="px-3 bg-red-100 text-red-700 text-[12px] font-bold py-2 rounded-xl active:scale-95 transition-all"
                    >
                      Próximo ({currentIndex + 1}/{overdueReminders.length})
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
