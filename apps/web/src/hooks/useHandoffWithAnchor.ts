/**
 * Hook para integração Handoff → PlaceAnchors
 * 
 * Registra lugares visitados (handoffs) como anchors para Event Engine
 */

import { useCallback } from 'react';
import { addAnchor, updateAnchorAction } from '@/lib/places/anchorsStore';
import { PlaceCategory } from '@/lib/events/types';
// import { useHandoffTracking } from './useHandoffTracking'; // DISABLED - file não existe

interface PlaceInfo {
  place_id: string;
  place_name: string;
  category: string;
  lat: number;
  lng: number;
  types?: string[];
}

export function useHandoffWithAnchor() {
  // const { trackHandoff } = useHandoffTracking(); // DISABLED

  /**
   * Track handoff + registrar como anchor para detecção futura
   */
  const trackWithAnchor = useCallback(async (
    type: 'directions' | 'call' | 'whatsapp' | 'website',
    placeInfo: PlaceInfo
  ): Promise<void> => {
    // Analytics normal
    // await trackHandoff(type, placeInfo.place_id, placeInfo.place_name, placeInfo.category); // DISABLED

    // Register as PlaceAnchor
    try {
      const placeCategory = mapCategoryToPlaceCategory(placeInfo.category);
      
      await addAnchor({
        place_id: placeInfo.place_id,
        name: placeInfo.place_name,
        types: placeInfo.types || [],
        category: placeCategory,
        lat: placeInfo.lat,
        lng: placeInfo.lng,
        radius: 100, // 100m detection radius
        ignored: false,
      });

      // Update last action timestamp
      await updateAnchorAction(placeInfo.place_id);

      console.log('[Handoff→Anchor] Registered:', placeInfo.place_name);
    } catch (error) {
      console.error('[Handoff→Anchor] Failed:', error);
    }
  }, []); // Removed trackHandoff dependency

  return { trackWithAnchor };
}

/**
 * Map service category to PlaceCategory enum
 */
function mapCategoryToPlaceCategory(category: string): PlaceCategory {
  const map: Record<string, PlaceCategory> = {
    'VET_CLINIC': 'veterinary_care',
    'VET_EMERGENCY': 'veterinary_care',
    'PETSHOP': 'pet_store',
    'GROOMING': 'pet_grooming',
    'HOTEL': 'pet_boarding',
    'TRAINER': 'other',
  };

  return map[category] || 'other';
}
