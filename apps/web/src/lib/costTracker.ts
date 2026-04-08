/**
 * Centralized Cost / Expense Tracker
 * ───────────────────────────────────
 * Unified types and helpers for aggregating pet care costs
 * across all modules: vaccines, medication, antiparasitário,
 * grooming (banho e tosa), food (ração), documents, appointments.
 *
 * V1 — localStorage-backed. Future: sync via API.
 */

// ── Types ─────────────────────────────────────────────────────────

export type CostCategory =
  | 'vaccine'
  | 'medication'
  | 'antiparasitic'
  | 'grooming'
  | 'food'
  | 'appointment'
  | 'surgery'
  | 'document'
  | 'other';

export interface CostEntry {
  id: string;
  petId: string;
  petName?: string;
  category: CostCategory;
  description: string;
  amount: number;           // BRL (R$)
  date: string;             // ISO yyyy-mm-dd
  sourceId?: string;        // original record id (vaccine id, grooming id, etc.)
  notes?: string;
  createdAt: string;        // ISO datetime
}

export interface CostSummary {
  total: number;
  byCategory: Record<CostCategory, number>;
  byMonth: Record<string, number>;    // "2026-01" → total
  byPet: Record<string, number>;      // petId → total
  count: number;
}

// ── Storage helpers ───────────────────────────────────────────────

const STORAGE_KEY = 'petmol_cost_entries';

function loadEntries(): CostEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveEntries(entries: CostEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

// ── Public API ────────────────────────────────────────────────────

/** Add a cost entry (deduplicates by sourceId if present) */
export function addCostEntry(entry: Omit<CostEntry, 'id' | 'createdAt'>): CostEntry {
  const entries = loadEntries();

  // Deduplicate: if sourceId matches an existing entry, update it
  if (entry.sourceId) {
    const idx = entries.findIndex(e => e.sourceId === entry.sourceId && e.petId === entry.petId);
    if (idx >= 0) {
      const updated: CostEntry = { ...entries[idx], ...entry, id: entries[idx].id, createdAt: entries[idx].createdAt };
      entries[idx] = updated;
      saveEntries(entries);
      return updated;
    }
  }

  const newEntry: CostEntry = {
    ...entry,
    id: `cost_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  entries.push(newEntry);
  saveEntries(entries);
  return newEntry;
}

/** Remove a cost entry by id */
export function removeCostEntry(id: string): void {
  const entries = loadEntries().filter(e => e.id !== id);
  saveEntries(entries);
}

/** Get all entries, optionally filtered */
export function getCostEntries(filter?: {
  petId?: string;
  category?: CostCategory;
  fromDate?: string;
  toDate?: string;
}): CostEntry[] {
  let entries = loadEntries();

  if (filter?.petId) entries = entries.filter(e => e.petId === filter.petId);
  if (filter?.category) entries = entries.filter(e => e.category === filter.category);
  if (filter?.fromDate) entries = entries.filter(e => e.date >= filter.fromDate!);
  if (filter?.toDate) entries = entries.filter(e => e.date <= filter.toDate!);

  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

/** Summarize costs */
export function getCostSummary(filter?: {
  petId?: string;
  fromDate?: string;
  toDate?: string;
}): CostSummary {
  const entries = getCostEntries(filter);

  const byCategory = {} as Record<CostCategory, number>;
  const byMonth = {} as Record<string, number>;
  const byPet = {} as Record<string, number>;
  let total = 0;

  for (const e of entries) {
    total += e.amount;
    byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
    const month = e.date.slice(0, 7);
    byMonth[month] = (byMonth[month] || 0) + e.amount;
    byPet[e.petId] = (byPet[e.petId] || 0) + e.amount;
  }

  return { total, byCategory, byMonth, byPet, count: entries.length };
}

/** Category display labels (pt-BR) */
export const CATEGORY_LABELS: Record<CostCategory, string> = {
  vaccine: '💉 Vacinas',
  medication: '💊 Medicação',
  antiparasitic: '🛡️ Antiparasitário',
  grooming: '🛁 Banho e Tosa',
  food: '🥣 Alimentação',
  appointment: '🏥 Consultas',
  surgery: '🔪 Cirurgias',
  document: '📄 Documentos',
  other: '📝 Outros',
};

/** Format BRL currency */
export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
