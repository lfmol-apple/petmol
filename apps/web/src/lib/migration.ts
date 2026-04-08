/**
 * Script de migração de dados do localStorage para o banco de dados
 * Executa uma única vez por usuário
 */

import { getAllHealthProfiles } from '../lib/petHealth';

const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

export interface MigrationResult {
  success: boolean;
  tutorCreated?: boolean;
  petsCreated?: number;
  errors?: string[];
}

export async function migratePetsToDatabase(
  tutorName: string,
  tutorEmail: string,
  tutorPassword: string,
  tutorPhone?: string
): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    petsCreated: 0,
    errors: []
  };

  try {
    // 1. Pega todos os pets do localStorage
    const localPets = getAllHealthProfiles();
    
    if (localPets.length === 0) {
      result.errors?.push('Nenhum pet encontrado no localStorage');
      return result;
    }

    // 2. Registra o tutor
    let token: string;
    
    try {
      const registerResponse = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tutorName,
          email: tutorEmail,
          password: tutorPassword,
          phone: tutorPhone
        })
      });

      if (!registerResponse.ok) {
        // Se falhar, tenta fazer login (tutor já existe)
        const loginResponse = await fetch(`${API_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: tutorEmail,
            password: tutorPassword
          })
        });

        if (!loginResponse.ok) {
          throw new Error('Falha ao registrar/fazer login');
        }

        const loginData = await loginResponse.json();
        token = loginData.access_token;
      } else {
        // Registro bem-sucedido, faz login
        const loginResponse = await fetch(`${API_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: tutorEmail,
            password: tutorPassword
          })
        });

        const loginData = await loginResponse.json();
        token = loginData.access_token;
        result.tutorCreated = true;
      }
    } catch (error: unknown) {
      result.errors?.push(`Erro ao criar/logar tutor: ${error instanceof Error ? error.message : 'desconhecido'}`);
      return result;
    }

    // 3. Migra cada pet para o banco
    for (const localPet of localPets) {
      try {
        const petData = {
          name: localPet.pet_name,
          species: localPet.species,
          breed: localPet.breed,
          birth_date: localPet.birth_date,
          weight: localPet.weight_history?.[0]?.weight,
          is_neutered: localPet.neutered || false,
          photo: localPet.photo,
          health_data: {
            vaccines: localPet.vaccines || [],
            exams: localPet.exams || [],
            prescriptions: localPet.prescriptions || [],
            appointments: localPet.appointments || [],
            surgeries: localPet.surgeries || [],
            allergies: localPet.allergies || [],
            daily_walks: localPet.daily_walks || [],
            chronic_conditions: localPet.chronic_conditions || [],
            dental_records: localPet.dental_records || [],
            parasite_history: localPet.parasite_history || [],
            documents: localPet.documents || []
          }
        };

        const createResponse = await fetch(`${API_URL}/pets`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(petData)
        });

        if (createResponse.ok) {
          result.petsCreated = (result.petsCreated || 0) + 1;
        } else {
          const error = await createResponse.json();
          result.errors?.push(`Erro ao criar pet ${localPet.pet_name}: ${error.detail}`);
        }
      } catch (error: unknown) {
        result.errors?.push(`Erro ao criar pet ${localPet.pet_name}: ${error instanceof Error ? error.message : 'desconhecido'}`);
      }
    }

    // 4. Salva token no localStorage
    if (token) {
      localStorage.setItem('petmol_token', token);
    }

    // 5. Marca migração como concluída
    localStorage.setItem('petmol_migration_completed', 'true');
    localStorage.setItem('petmol_migration_date', new Date().toISOString());

    result.success = result.petsCreated! > 0;
    return result;

  } catch (error: unknown) {
    result.errors?.push(`Erro geral na migração: ${error instanceof Error ? error.message : 'desconhecido'}`);
    return result;
  }
}

export function isMigrationCompleted(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('petmol_migration_completed') === 'true';
}

export function getMigrationDate(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('petmol_migration_date');
}
