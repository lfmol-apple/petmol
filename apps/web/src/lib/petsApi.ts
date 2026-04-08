import { getToken } from '@/lib/auth-token';
import { API_BASE_URL } from './api';

export interface PetDTO {
  id: string;
  tutor_id: string;
  name: string;
  species: string;
  breed?: string | null;
  birth_date?: string | null;
  weight_value?: number | null;
  weight_unit?: string | null;
  photo?: string | null;
  neutered?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface PetCreateDTO {
  id?: string;
  name: string;
  species: string;
  breed?: string;
  birth_date?: string;
  weight_value?: number;
  weight_unit?: string;
  photo?: string | null;
  neutered?: boolean;
}

export interface PetUpdateDTO {
  name?: string;
  species?: string;
  breed?: string | null;
  birth_date?: string | null;
  weight_value?: number | null;
  weight_unit?: string | null;
  photo?: string | null;
  neutered?: boolean | null;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || 'Failed to process request');
  }
  return response.json() as Promise<T>;
}

function buildAuthHeaders(extraHeaders?: HeadersInit): HeadersInit {
  const token = getToken();
  const headers = new Headers(extraHeaders);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return headers;
}

export async function listPets(): Promise<PetDTO[]> {
  const response = await fetch(`${API_BASE_URL}/pets`, {
    credentials: 'include',
    headers: buildAuthHeaders(),
  });
  return handleResponse<PetDTO[]>(response);
}

export async function createPet(payload: PetCreateDTO): Promise<PetDTO> {
  const response = await fetch(`${API_BASE_URL}/pets`, {
    method: 'POST',
    headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  return handleResponse<PetDTO>(response);
}

export async function updatePet(petId: string, payload: PetUpdateDTO): Promise<PetDTO> {
  const response = await fetch(`${API_BASE_URL}/pets/${petId}`, {
    method: 'PATCH',
    headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  return handleResponse<PetDTO>(response);
}

export async function deletePet(petId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/pets/${petId}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: buildAuthHeaders(),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || 'Failed to delete pet');
  }
}