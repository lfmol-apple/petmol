/**
 * Storage Migration Utility
 * Migrates from old localStorage keys to new unified structure
 * - petmol_reorders → petmol_rebuys
 * - petmol_favorite_products → removed (products now in rebuys)
 */

export function migrateLocalStorage() {
  if (typeof window === 'undefined') return;

  try {
    // Migrate reorders to rebuys
    const oldReorders = localStorage.getItem('petmol_reorders');
    const currentRebuys = localStorage.getItem('petmol_rebuys');
    
    if (oldReorders && !currentRebuys) {
      // Copy old reorders to new rebuys key
      localStorage.setItem('petmol_rebuys', oldReorders);
      console.log('✅ Migrated petmol_reorders → petmol_rebuys');
    }
    
    // Remove old favorite_products (products now unified in /buy)
    const oldFavoriteProducts = localStorage.getItem('petmol_favorite_products');
    if (oldFavoriteProducts) {
      // If user had favorite products, we could merge them into rebuys
      // For now, just remove since functionality is unified
      localStorage.removeItem('petmol_favorite_products');
      console.log('✅ Removed petmol_favorite_products (unified in /buy)');
    }
    
    // Clean up old reorders key after migration
    if (oldReorders && currentRebuys) {
      localStorage.removeItem('petmol_reorders');
      console.log('✅ Cleaned up old petmol_reorders key');
    }
    
    // Ensure favorite_places only contains places (validation)
    const favoritePlaces = localStorage.getItem('petmol_favorite_places');
    if (favoritePlaces) {
      try {
        const places: Array<{ place_id?: string; name?: string; address?: string }> = JSON.parse(favoritePlaces);
        // Filter out any non-place items (safety check)
        const validPlaces = places.filter((p) => p.place_id && p.name && p.address);
        if (validPlaces.length !== places.length) {
          localStorage.setItem('petmol_favorite_places', JSON.stringify(validPlaces));
          console.log('✅ Cleaned petmol_favorite_places (removed invalid items)');
        }
      } catch (e) {
        console.error('Failed to validate favorite_places:', e);
      }
    }
    
  } catch (error) {
    console.error('Storage migration error:', error);
  }
}

/**
 * Check if migration is needed
 */
export function needsMigration(): boolean {
  if (typeof window === 'undefined') return false;
  
  const hasOldReorders = !!localStorage.getItem('petmol_reorders');
  const hasOldFavoriteProducts = !!localStorage.getItem('petmol_favorite_products');
  
  return hasOldReorders || hasOldFavoriteProducts;
}
