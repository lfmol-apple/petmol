/**
 * features/shared/types/index.ts
 * Tipos utilitários compartilhados entre todas as features do PETMOL.
 */

/** ISO 8601 date string – "YYYY-MM-DD" ou "YYYY-MM-DDTHH:mm:ssZ" */
export type DateString = string;

/** UUID de pet */
export type PetId = string;

/** UUID de usuário/tutor */
export type UserId = string;

/** Resultado genérico de operação assíncrona */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

/** Retorno paginado */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Entidade com timestamps padrão */
export interface Timestamped {
  created_at: DateString;
  updated_at: DateString;
}

/** Entidade identificável por string ID */
export interface Identifiable {
  id: string;
}
