/**
 * Clinic Visit Detection System
 * Detects when user is at a veterinary clinic using GPS + time + patterns
 */

// 2026-04: canal externo (browser notifications) desligado pela governança master.
// Módulo mantido para futura integração com a CENTRAL INTERNA.

export interface ClinicLocation {
  place_id: string;
  name: string;
  lat: number;
  lng: number;
  address: string;
  phone?: string;
  veterinarian?: string;
  category: 'vet_clinic' | 'petshop' | 'grooming';
}

export interface ClinicVisit {
  id: string;
  clinic: ClinicLocation;
  arrival_time: number; // timestamp
  departure_time?: number; // timestamp
  duration_minutes?: number;
  visit_type: 'consultation' | 'grooming' | 'shopping' | 'unknown';
  is_confirmed: boolean; // User confirmed visit
  pets_involved: string[]; // Pet IDs
  created_at: number;
}

const STORAGE_KEY = 'petmol_clinic_visits';
const GEOFENCE_RADIUS = 300; // meters - good balance for GPS accuracy
const MIN_STAY_DURATION = 120000; // 2 minutes - minimum time to detect visit
const CONSULTATION_MIN_DURATION = 5; // 5 minutes - prompt for consultation type

/**
 * Calculate distance between two coordinates (Haversine)
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Check if user is within geofence of a clinic
 */
export function isWithinClinicGeofence(
  userLat: number,
  userLng: number,
  clinic: ClinicLocation
): boolean {
  const distance = calculateDistance(userLat, userLng, clinic.lat, clinic.lng);
  return distance <= GEOFENCE_RADIUS;
}

/**
 * Detect if user has been at clinic location for minimum time
 */
export async function detectClinicVisit(
  userLat: number,
  userLng: number,
  knownClinics: ClinicLocation[]
): Promise<ClinicLocation | null> {
  // Check if within geofence of any known clinic
  for (const clinic of knownClinics) {
    if (isWithinClinicGeofence(userLat, userLng, clinic)) {
      return clinic;
    }
  }
  return null;
}

/**
 * Start monitoring for clinic visits
 */
export function startClinicVisitMonitoring(
  petId: string,
  knownClinics: ClinicLocation[],
  onVisitDetected: (clinic: ClinicLocation, duration: number) => void
): number {
  if (!navigator.geolocation) {
    console.error('Geolocation not available');
    return -1;
  }

  let currentClinic: ClinicLocation | null = null;
  let arrivalTime: number | null = null;
  let positionCheckCount = 0;

  const watchId = navigator.geolocation.watchPosition(
    async (position) => {
      const { latitude, longitude } = position.coords;
      
      const detectedClinic = await detectClinicVisit(latitude, longitude, knownClinics);

      if (detectedClinic) {
        if (!currentClinic || currentClinic.place_id !== detectedClinic.place_id) {
          // New clinic detected
          currentClinic = detectedClinic;
          arrivalTime = Date.now();
          positionCheckCount = 1;
          console.log('Clinic visit detected:', detectedClinic.name);
        } else {
          // Still at same clinic
          positionCheckCount++;
          
          // After 2 position checks (~60 seconds with 30s intervals)
          if (positionCheckCount >= 2 && arrivalTime) {
            const duration = Math.floor((Date.now() - arrivalTime) / 60000); // minutes
            
            if (duration >= CONSULTATION_MIN_DURATION) {
              // Likely a consultation visit
              onVisitDetected(detectedClinic, duration);
              
              // Save visit
              saveClinicVisit({
                id: Date.now().toString(),
                clinic: detectedClinic,
                arrival_time: arrivalTime,
                duration_minutes: duration,
                visit_type: 'consultation',
                is_confirmed: false,
                pets_involved: [petId],
                created_at: Date.now(),
              });
              
              // Reset to avoid multiple triggers
              positionCheckCount = 0;
            }
          }
        }
      } else {
        // Left clinic geofence
        if (currentClinic && arrivalTime) {
          const duration = Math.floor((Date.now() - arrivalTime) / 60000);
          
          if (duration >= CONSULTATION_MIN_DURATION) {
            // Mark departure
            updateClinicVisitDeparture(currentClinic.place_id, Date.now(), duration);
          }
        }
        
        currentClinic = null;
        arrivalTime = null;
        positionCheckCount = 0;
      }
    },
    (error) => {
      console.error('Clinic monitoring error:', error);
    },
    {
      enableHighAccuracy: false,
      maximumAge: 30000, // 30 seconds
      timeout: 60000,
    }
  );

  localStorage.setItem('petmol_clinic_watch_id', watchId.toString());
  return watchId;
}

/**
 * Stop clinic visit monitoring
 */
export function stopClinicVisitMonitoring(): void {
  const watchId = localStorage.getItem('petmol_clinic_watch_id');
  if (watchId) {
    navigator.geolocation.clearWatch(parseInt(watchId));
    localStorage.removeItem('petmol_clinic_watch_id');
  }
}

/**
 * Save clinic visit
 */
export function saveClinicVisit(visit: ClinicVisit): void {
  const visits = getClinicVisits();
  visits.push(visit);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(visits));
}

/**
 * Get all clinic visits
 */
export function getClinicVisits(): ClinicVisit[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

/**
 * Update visit departure time
 */
function updateClinicVisitDeparture(placeId: string, departureTime: number, duration: number): void {
  const visits = getClinicVisits();
  const visit = visits.find(
    (v) => v.clinic.place_id === placeId && !v.departure_time
  );
  
  if (visit) {
    visit.departure_time = departureTime;
    visit.duration_minutes = duration;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(visits));
  }
}

/**
 * Confirm visit (user interaction)
 */
export function confirmClinicVisit(visitId: string): void {
  const visits = getClinicVisits();
  const visit = visits.find((v) => v.id === visitId);
  if (visit) {
    visit.is_confirmed = true;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(visits));
  }
}

/**
 * Get unconfirmed visits (for notifications)
 */
export function getUnconfirmedVisits(): ClinicVisit[] {
  return getClinicVisits().filter((v) => !v.is_confirmed);
}

/**
 * Get recent clinic visits (last 30 days)
 */
export function getRecentClinicVisits(days: number = 30): ClinicVisit[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return getClinicVisits().filter((v) => v.created_at >= cutoff);
}

/**
 * Show notification for clinic visit
 * 2026-04: fluxo externo desativado. Mantido como hook para integrar
 * com a CENTRAL INTERNA no futuro.
 */
export function showClinicVisitNotification(_clinic: ClinicLocation, _duration: number): void {
  // Intencionalmente vazio — nenhum canal externo ativo por padrão.
}
