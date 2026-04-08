'use client';

/**
 * GlobalAutoDetector — DESATIVADO (nova estratégia 2026-02)
 * Detecção por geolocalização/OSM removida. Substituído por MonthlyCheckinBanner.
 */
export function GlobalAutoDetector() {
  return null;
}

/* --- código original preservado abaixo para rollback ---
import { useEffect, useMemo, useState } from 'react';
import { ClinicVisitDetector } from './ClinicVisitDetector';
import { getAllHealthProfiles } from '@/lib/health/syncStorage';
import { useI18n } from '@/lib/I18nContext';

function _GlobalAutoDetector_DISABLED() {
  const { t } = useI18n();
  const [activePets, setActivePets] = useState<Array<{id: string, name: string}>>([]);

  useEffect(() => {
    // Load all pets from IndexedDB (health profiles)
    const loadPets = async () => {
      if (typeof window === 'undefined') return;

      try {
        const profiles = await getAllHealthProfiles();
        const pets = profiles
          .filter((p) => p.pet_id && p.name)
          .map((p) => ({ id: p.pet_id, name: p.name }));
        setActivePets(pets);
      } catch (e) {
        console.warn('[GlobalAutoDetector] Failed to load pets', e);
      }
    };

    loadPets();

    // Listen for new pets being added
    const interval = setInterval(loadPets, 5000); // Check every 5s
    return () => clearInterval(interval);
  }, []);

  const petsToMonitor = useMemo(() => {
    if (activePets.length > 0) return activePets;
    return [{ id: 'anonymous', name: t('common.pet') }];
  }, [activePets, t]);

  // Enable detectors for all pets
  return (
    <>
      {petsToMonitor.map((pet) => (
        <ClinicVisitDetector
          key={pet.id}
          petId={pet.id}
          petName={pet.name}
          enabled={true}
        />
      ))}
    </>
  );
}
--- */
