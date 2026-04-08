import { getToken } from '@/lib/auth-token';
// Funções de API para gerenciamento de vacinas - extraídas de home/page.tsx
import { API_BASE_URL } from '@/lib/api';
import { VaccineRecord } from '@/lib/petHealth';

// Utilitário para gerar IDs únicos de vacina
export const generateVaccineId = () => `vac_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

/**
 * Adiciona uma nova vacina ao pet
 */
export const addVaccine = async (petId: string, vaccine: Partial<VaccineRecord>): Promise<VaccineRecord | null> => {
  try {
    const savedToken = getToken();
    if (!savedToken) return null;

    // Buscar pet atual do backend
    const response = await fetch(`${API_BASE_URL}/pets/${petId}`, {
      headers: { 'Authorization': `Bearer ${savedToken}` },
    });
    
    if (!response.ok) return null;
    
    const pet = await response.json();
    const healthData = pet.health_data || {};
    const vaccines = healthData.vaccines || [];
    
    // Adicionar nova vacina
    const newVaccine: VaccineRecord = {
      id: generateVaccineId(),
      ...vaccine,
    } as VaccineRecord;
    
    vaccines.push(newVaccine);
    
    // Salvar no backend
    const updateResponse = await fetch(`${API_BASE_URL}/pets/${petId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${savedToken}`,
      },
      body: JSON.stringify({
        health_data: { ...healthData, vaccines },
      }),
    });
    
    return updateResponse.ok ? newVaccine : null;
  } catch (error) {
    console.error('Erro ao adicionar vacina:', error);
    return null;
  }
};

/**
 * Atualiza uma vacina existente
 */
export const updateVaccine = async (petId: string, vaccineId: string, updates: Partial<VaccineRecord>): Promise<boolean> => {
  try {
    const savedToken = getToken();
    if (!savedToken) return false;

    const response = await fetch(`${API_BASE_URL}/pets/${petId}`, {
      headers: { 'Authorization': `Bearer ${savedToken}` },
    });
    
    if (!response.ok) return false;
    
    const pet = await response.json();
    const healthData = pet.health_data || {};
    const vaccines = healthData.vaccines || [];
    
    // Atualizar vacina
    const index = vaccines.findIndex((v: VaccineRecord) => v.id === vaccineId);
    if (index === -1) return false;
    
    vaccines[index] = { ...vaccines[index], ...updates };
    
    // Salvar no backend
    const updateResponse = await fetch(`${API_BASE_URL}/pets/${petId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${savedToken}`,
      },
      body: JSON.stringify({
        health_data: { ...healthData, vaccines },
      }),
    });
    
    return updateResponse.ok;
  } catch (error) {
    console.error('Erro ao atualizar vacina:', error);
    return false;
  }
};

/**
 * Deleta uma vacina específica
 */
export const deleteVaccine = async (petId: string, vaccineId: string): Promise<boolean> => {
  try {
    const savedToken = getToken();
    if (!savedToken) return false;

    const response = await fetch(`${API_BASE_URL}/pets/${petId}`, {
      headers: { 'Authorization': `Bearer ${savedToken}` },
    });
    
    if (!response.ok) return false;
    
    const pet = await response.json();
    const healthData = pet.health_data || {};
    const vaccines = healthData.vaccines || [];
    
    // Remover vacina
    const filtered = vaccines.filter((v: VaccineRecord) => v.id !== vaccineId);
    
    // Salvar no backend
    const updateResponse = await fetch(`${API_BASE_URL}/pets/${petId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${savedToken}`,
      },
      body: JSON.stringify({
        health_data: { ...healthData, vaccines: filtered },
      }),
    });
    
    return updateResponse.ok;
  } catch (error) {
    console.error('Error deleting vaccine:', error);
    return false;
  }
};

/**
 * Remove TODAS as vacinas de um pet de forma atômica
 * Operação única no backend para evitar race conditions
 */
export const clearAllVaccines = async (petId: string): Promise<boolean> => {
  try {
    const savedToken = getToken();
    if (!savedToken) return false;

    const response = await fetch(`${API_BASE_URL}/pets/${petId}`, {
      headers: { 'Authorization': `Bearer ${savedToken}` },
    });
    
    if (!response.ok) return false;
    
    const pet = await response.json();
    const healthData = pet.health_data || {};
    
    // OPERAÇÃO ATÔMICA: limpar array de vacinas em uma única transação
    const updateResponse = await fetch(`${API_BASE_URL}/pets/${petId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${savedToken}`,
      },
      body: JSON.stringify({
        health_data: { ...healthData, vaccines: [] },
      }),
    });
    
    return updateResponse.ok;
  } catch (error) {
    console.error('Error clearing all vaccines:', error);
    return false;
  }
};