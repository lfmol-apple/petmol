/**
 * Hook para buscar contato on-demand (telefone/website)
 * Economia: só busca quando usuário clicar
 */

import { useState, useCallback } from 'react';

interface ContactData {
  nationalPhoneNumber?: string;
  websiteUri?: string;
}

export function usePlaceContact() {
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [contacts, setContacts] = useState<Record<string, ContactData>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchContact = useCallback(async (placeId: string): Promise<ContactData | null> => {
    // Return cached
    if (contacts[placeId]) {
      return contacts[placeId];
    }

    // Already loading
    if (loading[placeId]) {
      return null;
    }

    setLoading(prev => ({ ...prev, [placeId]: true }));
    setErrors(prev => ({ ...prev, [placeId]: '' }));

    try {
      const response = await fetch(`/api/place-contact?id=${encodeURIComponent(placeId)}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      const contactData: ContactData = {
        nationalPhoneNumber: data.nationalPhoneNumber,
        websiteUri: data.websiteUri
      };

      setContacts(prev => ({ ...prev, [placeId]: contactData }));
      return contactData;

    } catch (error) {
      console.error(`[usePlaceContact] Error fetching ${placeId}:`, error);
      setErrors(prev => ({ ...prev, [placeId]: 'Failed to load contact' }));
      return null;
    } finally {
      setLoading(prev => ({ ...prev, [placeId]: false }));
    }
  }, [contacts, loading]);

  return {
    fetchContact,
    loading,
    contacts,
    errors
  };
}

/**
 * Detecta se número é celular BR (para WhatsApp)
 */
export function isBrazilianMobile(phone: string | undefined): boolean {
  if (!phone) return false;
  
  // Remove tudo exceto dígitos
  const cleaned = phone.replace(/\D/g, '');
  
  // Formato esperado: +55 (DDD) 9xxxx-xxxx
  // 13 dígitos: 55 + 2 (DDD) + 9 + 8 dígitos
  // 11 dígitos: DDD + 9 + 8 dígitos
  
  if (cleaned.length === 13 && cleaned.startsWith('55')) {
    // Com +55
    const ddd = cleaned.substring(2, 4);
    const firstDigit = cleaned.charAt(4);
    return firstDigit === '9';
  }
  
  if (cleaned.length === 11) {
    // Sem +55
    const firstDigit = cleaned.charAt(2);
    return firstDigit === '9';
  }
  
  return false;
}

/**
 * Formata número para WhatsApp (wa.me)
 */
export function formatWhatsAppNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  
  // Se já tem 55 na frente
  if (cleaned.startsWith('55') && cleaned.length === 13) {
    return cleaned;
  }
  
  // Adicionar 55
  return `55${cleaned}`;
}
