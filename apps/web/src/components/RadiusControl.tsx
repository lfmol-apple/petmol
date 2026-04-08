'use client';

import { useMemo, useState, useRef, useEffect } from 'react';

type Unit = 'km' | 'mi';

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
function kmToMi(km: number) { return km * 0.621371; }
function miToKm(mi: number) { return mi / 0.621371; }

export function RadiusControl(props: {
  valueMeters: number;
  onChangeMeters: (meters: number) => void;
  defaultUnit?: Unit;
  presetsKm?: number[];
}) {
  const [unit, setUnit] = useState<Unit>(props.defaultUnit ?? 'km');
  const [isDragging, setIsDragging] = useState(false);
  const sliderRef = useRef<HTMLDivElement>(null);

  const valueKm = useMemo(() => props.valueMeters / 1000, [props.valueMeters]);
  const displayValue = unit === 'km' ? valueKm : kmToMi(valueKm);

  const setKm = (km: number) => props.onChangeMeters(Math.round(clamp(km, 1, 50) * 1000));

  const presets = props.presetsKm || [3, 5, 10, 15, 20];

  // Handle touch/mouse drag on custom slider
  const handleSliderInteraction = (clientX: number) => {
    if (!sliderRef.current) return;
    
    const rect = sliderRef.current.getBoundingClientRect();
    const x = clamp(clientX - rect.left, 0, rect.width);
    const percentage = x / rect.width;
    const km = 1 + percentage * 49; // 1-50km range
    setKm(km);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    handleSliderInteraction(e.clientX);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    handleSliderInteraction(e.touches[0].clientX);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        handleSliderInteraction(e.clientX);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (isDragging) {
        e.preventDefault();
        handleSliderInteraction(e.touches[0].clientX);
      }
    };

    const handleEnd = () => setIsDragging(false);

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleEnd);
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleEnd);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging]);

  return (
    <div className="w-full">
      {/* Header with value and unit toggle */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-xl font-bold text-slate-900">
          {displayValue.toFixed(displayValue < 10 ? 1 : 0)} {unit === 'km' ? 'km' : 'mi'}
        </div>
        <button
          onClick={() => setUnit(unit === 'km' ? 'mi' : 'km')}
          className="px-4 py-2 rounded-xl text-sm font-semibold border bg-white text-slate-700 border-slate-300 active:scale-95 transition-transform"
          title="Alternar unidade"
        >
          {unit === 'km' ? '🌍 KM' : '🇺🇸 MI'}
        </button>
      </div>

      {/* Preset buttons - mobile-friendly with large touch targets */}
      <div className="grid grid-cols-5 gap-2 mb-4">
        {presets.map((km) => (
          <button
            key={km}
            onClick={() => setKm(km)}
            className={`py-3 px-2 rounded-xl font-semibold text-sm transition-all active:scale-95 ${
              Math.abs(valueKm - km) < 0.5
                ? 'bg-slate-900 text-white shadow-lg scale-105'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {km}km
          </button>
        ))}
      </div>

      {/* Custom slider with large touch area */}
      <div className="relative pb-2">
        <div
          ref={sliderRef}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          className="relative h-12 cursor-pointer touch-none select-none"
        >
          {/* Background track - larger for easier touch */}
          <div className="absolute top-1/2 -translate-y-1/2 w-full h-3 rounded-full bg-slate-200">
            {/* Filled portion */}
            <div
              className="h-full rounded-full bg-slate-900 transition-all"
              style={{ width: `${((valueKm - 1) / 49) * 100}%` }}
            />
          </div>
          
          {/* Thumb - large and easy to grab */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -ml-5 w-10 h-10 rounded-full bg-white border-4 border-slate-900 shadow-lg transition-transform"
            style={{
              left: `${((valueKm - 1) / 49) * 100}%`,
              transform: isDragging ? 'translateY(-50%) scale(1.15)' : 'translateY(-50%)',
            }}
          />
        </div>

        {/* Range labels */}
        <div className="flex justify-between text-xs text-slate-500 mt-1 px-1">
          <span>1{unit === 'km' ? 'km' : 'mi'}</span>
          <span>50{unit === 'km' ? 'km' : 'mi'}</span>
        </div>
      </div>

      {/* Fine adjustment buttons */}
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => setKm(valueKm - 1)}
          disabled={valueKm <= 1}
          className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-700 font-semibold disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-transform"
        >
          − 1km
        </button>
        <button
          onClick={() => setKm(valueKm + 1)}
          disabled={valueKm >= 50}
          className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-700 font-semibold disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-transform"
        >
          + 1km
        </button>
      </div>
    </div>
  );
}
