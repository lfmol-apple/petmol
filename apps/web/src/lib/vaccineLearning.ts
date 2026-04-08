import type { VaccineType } from '@/lib/petHealth';

export type VaccineOcrRecordLike = {
  tipo_vacina: string;
  nome_comercial: string | null;
  data_aplicacao: string | null;
  data_revacina: string | null;
  veterinario_responsavel: string | null;
};

type AliasEntry = {
  tipo_vacina?: string;
  nome_comercial?: string;
  veterinario_responsavel?: string;
  vaccine_type?: VaccineType;
  updatedAt: number;
  uses: number;
};

type LearningStore = {
  version: 1;
  aliases: Record<string, AliasEntry>;
};

const STORAGE_KEY = 'petmol_vaccine_learning_v1';
const MAX_ALIASES = 500;

const normalizeKey = (value: string): string => {
  return (value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
};

const safeJsonParse = <T>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const loadLearningStore = (): LearningStore => {
  if (typeof window === 'undefined') return { version: 1, aliases: {} };
  const parsed = safeJsonParse<LearningStore>(localStorage.getItem(STORAGE_KEY));
  if (!parsed || parsed.version !== 1 || !parsed.aliases || typeof parsed.aliases !== 'object') {
    return { version: 1, aliases: {} };
  }
  return parsed;
};

const pruneStore = (store: LearningStore): LearningStore => {
  const entries = Object.entries(store.aliases);
  if (entries.length <= MAX_ALIASES) return store;

  entries.sort((a, b) => {
    // keep most recently updated / most used
    const aa = a[1];
    const bb = b[1];
    const scoreA = (aa.updatedAt || 0) + (aa.uses || 0) * 1000;
    const scoreB = (bb.updatedAt || 0) + (bb.uses || 0) * 1000;
    return scoreB - scoreA;
  });

  const kept = entries.slice(0, MAX_ALIASES);
  return {
    version: 1,
    aliases: Object.fromEntries(kept),
  };
};

export const saveLearningStore = (store: LearningStore) => {
  if (typeof window === 'undefined') return;
  const pruned = pruneStore(store);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
};

export const clearLearningStore = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
};

const getCandidateKeys = (r: VaccineOcrRecordLike): string[] => {
  const cands = [r.nome_comercial, r.tipo_vacina, r.veterinario_responsavel]
    .filter((x): x is string => Boolean(x && String(x).trim()))
    .map((x) => normalizeKey(String(x)));
  // remove empty and duplicates
  return Array.from(new Set(cands.filter(Boolean)));
};

export const applyLearningToOcrRecords = <T extends VaccineOcrRecordLike>(
  records: T[],
  opts?: { bumpUseCount?: boolean }
): T[] => {
  const store = loadLearningStore();
  if (!records || records.length === 0) return records;

  const bump = Boolean(opts?.bumpUseCount);

  const updated = records.map((r) => {
    const keys = getCandidateKeys(r);
    let best: AliasEntry | null = null;
    let bestKey: string | null = null;

    for (const k of keys) {
      const entry = store.aliases[k];
      if (!entry) continue;
      if (!best) {
        best = entry;
        bestKey = k;
        continue;
      }
      // prefer more recently updated
      if ((entry.updatedAt || 0) > (best.updatedAt || 0)) {
        best = entry;
        bestKey = k;
      }
    }

    if (!best) return r;

    if (bump && bestKey) {
      store.aliases[bestKey] = { ...best, uses: (best.uses || 0) + 1 };
    }

    return {
      ...r,
      tipo_vacina: best.tipo_vacina ?? r.tipo_vacina,
      nome_comercial: best.nome_comercial ?? r.nome_comercial,
      veterinario_responsavel: best.veterinario_responsavel ?? r.veterinario_responsavel,
    };
  });

  if (bump) saveLearningStore(store);
  return updated;
};

export const learnFromCorrections = (
  original: VaccineOcrRecordLike[],
  corrected: VaccineOcrRecordLike[],
  options?: { vaccineTypeByIndex?: Array<VaccineType | null | undefined> }
) => {
  const store = loadLearningStore();
  const now = Date.now();

  const max = Math.min(original.length, corrected.length);
  for (let i = 0; i < max; i++) {
    const o = original[i];
    const c = corrected[i];

    const rawName = normalizeKey(String(o.nome_comercial || o.tipo_vacina || ''));
    if (!rawName) continue;

    const changedTipo = (c.tipo_vacina || '').trim() && c.tipo_vacina !== o.tipo_vacina;
    const changedNome = (c.nome_comercial || '').trim() && c.nome_comercial !== o.nome_comercial;
    const changedVet = (c.veterinario_responsavel || '').trim() && c.veterinario_responsavel !== o.veterinario_responsavel;

    const providedType = options?.vaccineTypeByIndex?.[i];

    if (!changedTipo && !changedNome && !changedVet && !providedType) continue;

    const prev = store.aliases[rawName];
    store.aliases[rawName] = {
      tipo_vacina: changedTipo ? c.tipo_vacina : prev?.tipo_vacina,
      nome_comercial: changedNome ? c.nome_comercial || undefined : prev?.nome_comercial,
      veterinario_responsavel: changedVet ? c.veterinario_responsavel || undefined : prev?.veterinario_responsavel,
      vaccine_type: providedType || prev?.vaccine_type,
      updatedAt: now,
      uses: prev?.uses || 0,
    };
  }

  saveLearningStore(store);
};
