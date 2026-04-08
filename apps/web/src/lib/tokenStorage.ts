/**
 * Token storage and management utilities
 * Handles persistent auth tokens with offline support
 */

const TOKEN_KEY = 'petmol_token';
const TOKEN_EXPIRY_KEY = 'petmol_token_expiry';
const USER_DATA_KEY = 'petmol_user_data';

export interface StoredUserData {
  id: number;
  email: string;
  name: string;
  phone?: string;
  created_at: string;
}

/**
 * Salva token com timestamp de expiração
 */
export function saveToken(token: string, expiresInMinutes: number = 10080): void {
  if (typeof window === 'undefined') return;
  
  const expiryTime = Date.now() + (expiresInMinutes * 60 * 1000);
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString());
}

/**
 * Obtém token se ainda for válido
 * Retorna null se expirado
 */
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  
  const token = localStorage.getItem(TOKEN_KEY);
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
  
  if (!token) return null;
  
  // Se não tem expiry registrado, assume que é válido (backward compatibility)
  if (!expiry) return token;
  
  // Verifica se expirou
  const expiryTime = parseInt(expiry, 10);
  if (Date.now() > expiryTime) {
    // Token expirado, limpar
    clearToken();
    return null;
  }
  
  return token;
}

/**
 * Remove token e dados relacionados
 */
export function clearToken(): void {
  if (typeof window === 'undefined') return;
  
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
}

/**
 * Salva dados do usuário para uso offline
 */
export function saveUserData(userData: StoredUserData): void {
  if (typeof window === 'undefined') return;
  
  localStorage.setItem(USER_DATA_KEY, JSON.stringify(userData));
}

/**
 * Obtém dados do usuário cacheados (para uso offline)
 */
export function getCachedUserData(): StoredUserData | null {
  if (typeof window === 'undefined') return null;
  
  const data = localStorage.getItem(USER_DATA_KEY);
  if (!data) return null;
  
  try {
    return JSON.parse(data) as StoredUserData;
  } catch {
    return null;
  }
}

/**
 * Remove dados do usuário cacheados
 */
export function clearUserData(): void {
  if (typeof window === 'undefined') return;
  
  localStorage.removeItem(USER_DATA_KEY);
}

/**
 * Verifica se há conexão com a internet
 */
export function isOnline(): boolean {
  if (typeof window === 'undefined') return true;
  return navigator.onLine;
}

/**
 * Retorna informações sobre o estado de conectividade
 */
export function getConnectivityStatus(): {
  isOnline: boolean;
  hasValidToken: boolean;
  hasCachedData: boolean;
} {
  return {
    isOnline: isOnline(),
    hasValidToken: getToken() !== null,
    hasCachedData: getCachedUserData() !== null,
  };
}
