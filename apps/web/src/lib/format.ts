/**
 * Premium formatting utilities for PETMOL Web
 * Consistent formatting across the application
 */

/**
 * Format currency value
 * @param value - Numeric value
 * @param currency - Currency code (default: BRL)
 * @returns Formatted string like "R$ 149,90"
 */
export function formatCurrency(value: number | null | undefined, currency: string = 'BRL'): string | null {
  if (value === null || value === undefined) return null;
  return new Intl.NumberFormat('pt-BR', { 
    style: 'currency', 
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format "updated X ago" from ISO date
 * @param fetchedAtIso - ISO date string
 * @returns String like "atualizado há 3 min" or "há 1 h"
 */
export function formatUpdatedAgo(fetchedAtIso: string | null | undefined): string {
  if (!fetchedAtIso) return 'atualizado agora';
  
  try {
    const fetchedAt = new Date(fetchedAtIso);
    const now = new Date();
    const diffMs = now.getTime() - fetchedAt.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffMinutes < 1) {
      return 'atualizado agora';
    } else if (diffMinutes < 60) {
      return `atualizado há ${diffMinutes} min`;
    } else if (diffHours < 24) {
      return `há ${diffHours} h`;
    } else {
      const diffDays = Math.floor(diffHours / 24);
      return `há ${diffDays} dia${diffDays > 1 ? 's' : ''}`;
    }
  } catch {
    return 'atualizado';
  }
}

/**
 * Format price per kg for display
 * @param pricePerKg - Price per kilogram
 * @param currency - Currency code (default: BRL)
 * @returns String like "R$ 23,90/kg" or null
 */
export function formatPricePerKg(pricePerKg: number | null | undefined, currency: string = 'BRL'): string | null {
  if (pricePerKg === null || pricePerKg === undefined) return null;
  
  const formatted = new Intl.NumberFormat('pt-BR', { 
    style: 'currency', 
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(pricePerKg);
  
  return `${formatted}/kg`;
}

/**
 * Format weight in kg for display
 * @param kg - Weight in kilograms
 * @returns String like "15 kg" or "500 g" for < 1kg
 */
export function formatKg(kg: number | null | undefined): string | null {
  if (kg === null || kg === undefined) return null;
  
  if (kg < 1) {
    const grams = Math.round(kg * 1000);
    return `${grams} g`;
  }
  
  // Format as kg with one decimal if needed
  if (kg === Math.floor(kg)) {
    return `${Math.floor(kg)} kg`;
  }
  
  return `${kg.toFixed(1)} kg`;
}

/**
 * Format price range (min-max) for display
 * @param min - Minimum price
 * @param max - Maximum price
 * @param currency - Currency code (default: BRL)
 * @returns String like "R$ 149,90" or "R$ 100,00 — R$ 200,00"
 */
export function formatPriceRange(min: number | null, max: number | null, currency: string = 'BRL'): string | null {
  if (min === null && max === null) return null;
  
  const formatter = new Intl.NumberFormat('pt-BR', { 
    style: 'currency', 
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  
  if (min === max || max === null) {
    return formatter.format(min!);
  }
  
  if (min === null) {
    return formatter.format(max);
  }
  
  return `${formatter.format(min)} — ${formatter.format(max)}`;
}
