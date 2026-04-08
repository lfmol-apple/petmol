import { getToken } from '@/lib/auth-token';
import { API_BASE_URL } from '@/lib/api';

const API_URL = API_BASE_URL;

export interface Pet {
  id: number;
  tutor_id: number;
  name: string;
  species: string;
  breed?: string;
  birth_date?: string;
  weight?: number;
  is_neutered: boolean;
  photo?: string;
  health_data?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PetCreate {
  name: string;
  species: string;
  breed?: string;
  birth_date?: string;
  weight?: number;
  is_neutered: boolean;
  photo?: string;
  health_data?: Record<string, unknown>;
}

export interface PetUpdate {
  name?: string;
  species?: string;
  breed?: string;
  birth_date?: string;
  weight?: number;
  is_neutered?: boolean;
  photo?: string;
  health_data?: Record<string, unknown>;
}

class PetMolAPI {
  private getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return getToken();
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const token = this.getToken();
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Erro desconhecido' }));
      throw new Error(error.detail || `Erro: ${response.status}`);
    }

    // Para DELETE sem conteúdo
    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  // ============================================================
  // PET ENDPOINTS
  // ============================================================

  async listPets(): Promise<Pet[]> {
    return this.request('/pets');
  }

  async createPet(data: PetCreate): Promise<Pet> {
    return this.request('/pets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getPet(petId: number): Promise<Pet> {
    return this.request(`/pets/${petId}`);
  }

  async updatePet(petId: number, data: PetUpdate): Promise<Pet> {
    return this.request(`/pets/${petId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deletePet(petId: number): Promise<void> {
    return this.request(`/pets/${petId}`, {
      method: 'DELETE',
    });
  }
}

export const petMolAPI = new PetMolAPI();
