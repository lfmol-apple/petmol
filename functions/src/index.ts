/**
 * PETMOL Cloud Functions
 * Google Places API (New) integration with caching and cost optimization
 */

import * as admin from 'firebase-admin';

admin.initializeApp();

// Export Places API functions
export { buscarPetServices, getPlaceContact, logClick } from './places';
