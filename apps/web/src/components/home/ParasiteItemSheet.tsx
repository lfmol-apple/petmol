'use client';

import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import type { ParasiteControl } from '@/lib/types/home';
import { trackPartnerClicked, trackV1Metric } from '@/lib/v1Metrics';
import { ModalPortal } from '@/components/ModalPortal';
import { ReminderPicker } from '@/components/ReminderPicker';
import { dateToLocalISO, localTodayISO } from '@/lib/localDate';

// ── Config por tipo ──────────────────────────────────────────────────────────
const CONFIG = {
  dewormer: {
    title: 'Vermífugo',
    icon: '🪱',
    ctaLabel: 'Aplicar agora',
    defaultFrequency: 90,
    applicationForm: 'oral' as const,
    productHint: 'Ex: Drontal, Milbemax, Verm-X',
    colorBtn: 'bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-emerald-800 border border-emerald-200',
    colorAccent: 'text-emerald-700',
    colorLight: 'bg-emerald-50',
    colorBorder: 'border-emerald-200',
    colorRing: 'focus:ring-emerald-300',
  },
  flea_tick: {
    title: 'Antipulgas / Carrapatos',
    icon: '🛡️',
    ctaLabel: 'Aplicar agora',
    defaultFrequency: 30,
    applicationForm: 'topical' as const,
    productHint: 'Ex: Bravecto, Nexgard, Simparica',
    colorBtn: 'bg-orange-50 hover:bg-orange-100 active:bg-orange-200 text-orange-800 border border-orange-200',
    colorAccent: 'text-orange-700',
    colorLight: 'bg-orange-50',
    colorBorder: 'border-orange-200',
    colorRing: 'focus:ring-orange-300',
  },
  collar: {
    title: 'Coleira Antiparasitária',
    icon: '📿',
    ctaLabel: 'Troquei hoje',
    defaultFrequency: 120,
    applicationForm: 'collar' as const,
    productHint: 'Ex: Seresto, Scalibor, Foresto',
    colorBtn: 'bg-violet-50 hover:bg-violet-100 active:bg-violet-200 text-violet-800 border border-violet-200',
    colorAccent: 'text-violet-700',
    colorLight: 'bg-violet-50',
    colorBorder: 'border-violet-200',
    colorRing: 'focus:ring-violet-300',
  },
} as const;

// ── Helpers ──────────────────────────────────────────────────────────────────
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return dateToLocalISO(dt);
}

function diffDays(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

function fmtDate(s?: string | null): string {
  if (!s) return '—';
  const clean = s.split('T')[0];
  const [y, m, d] = clean.split('-').map(Number);
  const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function fmtCurrency(v?: number | null): string | null {
  return v != null ? `R$ ${v.toFixed(2).replace('.', ',')}` : null;
}

function getNextDate(ctrl: ParasiteControl): string | null {
  return ctrl.collar_expiry_date || ctrl.next_due_date || null;
}

function computeStatus(nextDate?: string | null) {
  const diff = diffDays(nextDate);
  if (diff === null) return { label: 'Sem dados', bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' };
  if (diff < 0)      return { label: `Vencido há ${Math.abs(diff)} dia${Math.abs(diff) !== 1 ? 's' : ''}`, bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' };
  if (diff === 0)    return { label: 'Vence hoje!', bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' };
  if (diff <= 7)     return { label: `Vence em ${diff} dias`, bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' };
  if (diff <= 14)    return { label: `Em ${diff} dias`, bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' };
  return { label: `Em ${diff} dias`, bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' };
}

// ── Types ────────────────────────────────────────────────────────────────────
interface ParasiteItemSheetProps {
  type: 'dewormer' | 'flea_tick' | 'collar';
  petId: string;
  petName?: string;
  /** Controls already filtered by this.type, passed from parent */
  parasiteControls: ParasiteControl[];
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

type ViewMode = 'view' | 'apply' | 'edit' | 'buy';

// ── Component ────────────────────────────────────────────────────────────────
export function ParasiteItemSheet({
  type,
  petId,
  petName,
  parasiteControls,
  onClose,
  onRefresh,
}: ParasiteItemSheetProps) {
  const cfg = CONFIG[type];
  const [mode, setMode] = useState<ViewMode>('view');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [historyShowAll, setHistoryShowAll] = useState(false);

  // Sorted most-recent-first
  const sorted = [...parasiteControls].sort(
    (a, b) => new Date(b.date_applied).getTime() - new Date(a.date_applied).getTime(),
  );
  const current = sorted[0] ?? null;
  const nextDate = current ? getNextDate(current) : null;
  const status = computeStatus(nextDate);

  // ── Apply form ────────────────────────────────────────────────────────────
  const [applyForm, setApplyForm] = useState({
    date: localTodayISO(),
    product_name: '',
    cost: '',
    notes: '',
    frequency_days: String(cfg.defaultFrequency),
    reminder_days: '3',
    reminder_time: '09:00',
  });

  useEffect(() => {
    if (mode === 'apply') {
      setApplyForm({
        date: localTodayISO(),
        product_name: current?.product_name ?? '',
        cost: '',
        notes: '',
        frequency_days: String(cfg.defaultFrequency),
        reminder_days: '3',
        reminder_time: '09:00',
      });
    }
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Edit form ─────────────────────────────────────────────────────────────
  const [editRecord, setEditRecord] = useState<ParasiteControl | null>(null);
  const [editForm, setEditForm] = useState({
    date_applied: '',
    product_name: '',
    cost: '',
    notes: '',
    next_due_date: '',
    collar_expiry_date: '',
    frequency_days: String(cfg.defaultFrequency),
    reminder_days: '3',
    reminder_time: '09:00',
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }

  async function handleApply() {
    if (!applyForm.date || !applyForm.product_name.trim()) {
      alert('Preencha data e produto.');
      return;
    }
    setSaving(true);
    try {
      const token = getToken();
      if (!token) { alert('Sessão expirada. Faça login novamente.'); return; }

      const freq = parseInt(applyForm.frequency_days, 10) || cfg.defaultFrequency;
      const computedNext = addDays(applyForm.date, freq);
      const nextDueFallback = computedNext;
      const payload = {
        type,
        product_name: applyForm.product_name.trim(),
        date_applied: applyForm.date,
        frequency_days: freq,
        next_due_date: type !== 'collar' ? computedNext : null,
        collar_expiry_date: type === 'collar' ? computedNext : null,
        cost: applyForm.cost ? parseFloat(applyForm.cost) : null,
        notes: applyForm.notes || null,
        application_form: cfg.applicationForm,
        reminder_enabled: true,
        alert_days_before: parseInt(applyForm.reminder_days) || 3,
        reminder_time: applyForm.reminder_time || '09:00',
      };

      const res = await fetch(`${API_BASE_URL}/pets/${petId}/parasites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        if (type === 'dewormer') {
          trackV1Metric('worm_control_created', {
            pet_id: petId,
            product_name: applyForm.product_name.trim(),
          });
          trackV1Metric('worm_control_applied', {
            pet_id: petId,
            product_name: applyForm.product_name.trim(),
            next_due_date: payload.next_due_date,
          });
        }
        if (type === 'flea_tick') {
          trackV1Metric('flea_control_created', {
            pet_id: petId,
            product_name: applyForm.product_name.trim(),
          });
          trackV1Metric('flea_control_applied', {
            pet_id: petId,
            product_name: applyForm.product_name.trim(),
            next_due_date: payload.next_due_date,
          });
        }
        if (type === 'collar') {
          trackV1Metric(current ? 'collar_replaced' : 'collar_created', {
            pet_id: petId,
            product_name: applyForm.product_name.trim(),
            next_due_date: payload.collar_expiry_date,
          });
        }

        showToast('✅ Registrado com sucesso!');
        setMode('view');
        await onRefresh();
      } else {
        alert('Erro ao salvar. Tente novamente.');
      }
    } finally {
      setSaving(false);
    }
  }

  function startEdit(rec: ParasiteControl) {
    setEditRecord(rec);
    setEditForm({
      date_applied: rec.date_applied,
      product_name: rec.product_name,
      cost: rec.cost != null ? String(rec.cost) : '',
      notes: rec.notes || '',
      next_due_date: rec.next_due_date || '',
      collar_expiry_date: rec.collar_expiry_date || '',
      frequency_days: String(rec.frequency_days ?? cfg.defaultFrequency),
      reminder_days: String((rec as unknown as Record<string, unknown>).alert_days_before ?? 3),
      reminder_time: String((rec as unknown as Record<string, unknown>).reminder_time ?? '09:00'),
    });
    setMode('edit');
  }

  async function handleSaveEdit() {
    if (!editRecord || !editForm.date_applied || !editForm.product_name.trim()) {
      alert('Preencha data e produto.');
      return;
    }
    setSaving(true);
    try {
      const token = getToken();
      if (!token) return;
      const res = await fetch(`${API_BASE_URL}/pets/${petId}/parasites/${editRecord.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          date_applied: editForm.date_applied,
          product_name: editForm.product_name.trim(),
          cost: editForm.cost ? parseFloat(editForm.cost) : null,
          notes: editForm.notes || null,
          frequency_days: parseInt(editForm.frequency_days, 10) || cfg.defaultFrequency,
          next_due_date: type !== 'collar' ? addDays(editForm.date_applied, parseInt(editForm.frequency_days, 10) || cfg.defaultFrequency) : null,
          collar_expiry_date: type === 'collar' ? addDays(editForm.date_applied, parseInt(editForm.frequency_days, 10) || cfg.defaultFrequency) : null,
          reminder_enabled: true,
          alert_days_before: parseInt(editForm.reminder_days) || 3,
          reminder_time: editForm.reminder_time || '09:00',
        }),
      });
      if (res.ok) {
        showToast('✅ Registro atualizado!');
        setMode('view');
        setEditRecord(null);
        await onRefresh();
      } else {
        alert('Erro ao atualizar. Tente novamente.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setConfirmDeleteId(null);
    const token = getToken();
    if (!token) return;
    const res = await fetch(`${API_BASE_URL}/pets/${petId}/parasites/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      showToast('🗑️ Registro removido');
      await onRefresh();
    }
  }

  // ── CSS helpers ───────────────────────────────────────────────────────────
  const inputCls = `w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 ${cfg.colorRing}`;
  const labelCls = 'block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl flex flex-col"
        style={{ maxHeight: '92dvh' }}
        onClick={e => e.stopPropagation()}
      >

        {/* Header */}
        <div className={`px-5 pt-4 pb-3 ${cfg.colorLight} border-b border-gray-100 flex-shrink-0`}>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white shadow-sm flex items-center justify-center text-xl flex-shrink-0">
              {cfg.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <h2 className="text-[16px] font-bold text-gray-900 leading-tight whitespace-nowrap">{cfg.title}</h2>
                {petName && <span className="text-sm text-gray-400 truncate">· {petName}</span>}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${status.dot}`} />
                <span className={`text-[13px] font-semibold ${status.text} truncate`}>{status.label}</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/80 flex items-center justify-center text-gray-500 hover:bg-white shadow-sm flex-shrink-0"
              aria-label="Fechar"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 overscroll-contain">

          {/* ── VIEW MODE ─────────────────────────────────────────────────── */}
          {mode === 'view' && (
            <div className="p-5 space-y-3 pb-8">

              {/* Active product card — product, status and next application at a glance */}
              {current && (() => {
                const urgentBorder =
                  status.dot === 'bg-red-500' ? 'border-red-300 bg-red-50' :
                  status.dot === 'bg-orange-500' ? 'border-orange-300 bg-orange-50' :
                  status.dot === 'bg-yellow-500' ? 'border-yellow-200 bg-yellow-50' :
                  `${cfg.colorBorder} ${cfg.colorLight}`;
                const statusPill =
                  status.dot === 'bg-red-500' ? 'bg-red-100 text-red-700' :
                  status.dot === 'bg-orange-500' ? 'bg-orange-100 text-orange-700' :
                  status.dot === 'bg-yellow-500' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-emerald-100 text-emerald-700';
                return (
                  <div className={`flex items-start gap-2.5 px-3 py-2 rounded-xl border ${urgentBorder}`}>
                    <div className="w-8 h-8 rounded-lg bg-white/80 flex items-center justify-center text-base flex-shrink-0">
                      {cfg.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Produto atual</p>
                      <p className={`text-[13px] font-bold ${cfg.colorAccent} truncate`}>{current.product_name}</p>
                      <p className="text-[11px] text-gray-500 leading-tight">
                        Aplicado {fmtDate(current.date_applied)}
                      </p>
                      <p className="text-[11px] leading-tight text-gray-500">
                        {nextDate ? <>Próxima {type === 'collar' ? 'troca' : 'aplicação'} <span className={`font-semibold ${status.text}`}>· {fmtDate(nextDate)}</span></> : 'Sem próxima data definida'}
                      </p>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${statusPill}`}>{status.label}</span>
                  </div>
                );
              })()}

              {/* Main CTA — always dominant */}
              <button
                onClick={() => setMode('buy')}
                className="w-full py-4 rounded-2xl text-[15px] font-bold text-white shadow-[0_14px_30px_rgba(29,78,216,0.34)] transition-all bg-gradient-to-br from-blue-800 via-blue-600 to-sky-500 border border-blue-400/70 border-l-4 border-l-sky-100 hover:shadow-[0_18px_34px_rgba(29,78,216,0.42)] hover:brightness-105"
              >
                <span className="mr-2 inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white ring-1 ring-blue-200/80 shadow-sm align-middle">
                  <span className="text-[18px] leading-none">🛒</span>
                </span>
                Preciso comprar
              </button>

              {/* Secondary actions — compact and wrap-friendly */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setMode('apply')}
                  className={`min-w-[132px] flex-1 py-3 rounded-2xl text-sm font-semibold shadow-sm active:opacity-70 ${cfg.colorBtn}`}
                >
                  <span className="mr-1.5">{cfg.icon}</span>
                  {cfg.ctaLabel}
                </button>
                <button
                  onClick={() => current ? startEdit(current) : setMode('apply')}
                  className={`min-w-[132px] flex-1 py-3 rounded-2xl text-sm font-semibold active:opacity-70 ${cfg.colorLight} ${cfg.colorAccent} border ${cfg.colorBorder}`}
                >
                  ✏️ Editar
                </button>
              </div>

              {/* Empty state — only shown when no records */}
              {!current && (
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-8 text-center">
                  <p className="text-4xl mb-3">{cfg.icon}</p>
                  <p className="text-sm font-semibold text-gray-600">Nenhum registro encontrado</p>
                  <p className="text-xs text-gray-400 mt-1">Registre a primeira aplicação acima</p>
                </div>
              )}

              {/* History — collapsed accordion */}
              {sorted.length > 0 && (
                <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 text-left bg-gray-50"
                    onClick={() => { setHistoryExpanded(h => !h); setHistoryShowAll(false); }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Histórico</span>
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-gray-200 text-gray-600">{sorted.length}</span>
                    </div>
                    <span className="text-gray-400 text-sm">{historyExpanded ? '▲' : '▼'}</span>
                  </button>

                  {historyExpanded && (
                    <div className="divide-y divide-gray-100 border-t border-gray-100">
                      {(historyShowAll ? sorted : sorted.slice(0, 2)).map((rec, i) => (
                        <div
                          key={rec.id}
                          className="flex items-center gap-3 px-4 py-2.5"
                        >
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-base flex-shrink-0 ${i === 0 ? cfg.colorLight : 'bg-gray-100'}`}>
                            {i === 0 ? cfg.icon : '·'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">{rec.product_name}</p>
                            <p className="text-xs text-gray-400">
                              {fmtDate(rec.date_applied)}
                              {rec.cost != null ? ` · ${fmtCurrency(rec.cost)}` : ''}
                              {getNextDate(rec) ? ` · até ${fmtDate(getNextDate(rec))}` : ''}
                            </p>
                          </div>
                          <div className="flex gap-1.5 flex-shrink-0">
                            <button
                              onClick={() => startEdit(rec)}
                              className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-sm hover:bg-gray-200"
                              aria-label="Editar"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(rec.id)}
                              className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-sm hover:bg-red-100"
                              aria-label="Remover"
                            >
                              🗑
                            </button>
                          </div>
                        </div>
                      ))}
                      {!historyShowAll && sorted.length > 2 && (
                        <button
                          onClick={() => setHistoryShowAll(true)}
                          className="w-full py-2.5 text-xs font-semibold text-gray-500 hover:text-gray-700 bg-gray-50"
                        >
                          Ver todos ({sorted.length - 2} restantes)
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── APPLY FORM ────────────────────────────────────────────────── */}
          {mode === 'apply' && (
            <div className="p-5 pb-8 space-y-4">
              <button
                onClick={() => setMode('view')}
                className="flex items-center gap-2 text-gray-500 hover:text-gray-800 text-sm font-medium mb-1"
              >
                ‹ Voltar
              </button>
              <h3 className="text-[16px] font-bold text-gray-900">{cfg.ctaLabel}</h3>

              <div>
                <label className={labelCls}>Data *</label>
                <input
                  type="date"
                  className={inputCls}
                  value={applyForm.date}
                  onChange={e => setApplyForm(f => ({
                    ...f,
                    date: e.target.value,
                  }))}
                />
              </div>

              <div>
                <label className={labelCls}>Produto *</label>
                <input
                  type="text"
                  className={inputCls}
                  placeholder={cfg.productHint}
                  value={applyForm.product_name}
                  onChange={e => setApplyForm(f => ({ ...f, product_name: e.target.value }))}
                />
              </div>

              <div>
                <label className={labelCls}>Repetir a cada (dias)</label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  className={inputCls}
                  value={applyForm.frequency_days}
                  onChange={e => setApplyForm(f => ({ ...f, frequency_days: e.target.value }))}
                />
                <p className="text-xs text-gray-400 mt-1">Recomendado: {cfg.defaultFrequency} dias</p>
              </div>

              <div>
                <label className={labelCls}>Valor pago (opcional)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputCls}
                  placeholder="Ex: 89,90"
                  value={applyForm.cost}
                  onChange={e => setApplyForm(f => ({ ...f, cost: e.target.value }))}
                />
              </div>

              <ReminderPicker
                days={applyForm.reminder_days}
                time={applyForm.reminder_time}
                onDaysChange={v => setApplyForm(f => ({ ...f, reminder_days: v }))}
                onTimeChange={v => setApplyForm(f => ({ ...f, reminder_time: v }))}
              />

              <button
                onClick={handleApply}
                disabled={saving || !applyForm.date || !applyForm.product_name.trim()}
                className={`w-full py-4 rounded-2xl text-[15px] font-bold shadow-sm disabled:opacity-50 ${cfg.colorBtn}`}
              >
                {saving ? 'Salvando...' : '✅ Confirmar registro'}
              </button>
            </div>
          )}

          {/* ── EDIT FORM ─────────────────────────────────────────────────── */}
          {mode === 'edit' && editRecord && (
            <div className="p-5 pb-8 space-y-4">
              <button
                onClick={() => { setMode('view'); setEditRecord(null); }}
                className="flex items-center gap-2 text-gray-500 hover:text-gray-800 text-sm font-medium mb-1"
              >
                ‹ Voltar
              </button>
              <h3 className="text-[16px] font-bold text-gray-900">Editar registro</h3>

              <div>
                <label className={labelCls}>Data de aplicação</label>
                <input
                  type="date"
                  className={inputCls}
                  value={editForm.date_applied}
                  onChange={e => setEditForm(f => ({ ...f, date_applied: e.target.value }))}
                />
              </div>

              <div>
                <label className={labelCls}>Produto</label>
                <input
                  type="text"
                  className={inputCls}
                  value={editForm.product_name}
                  onChange={e => setEditForm(f => ({ ...f, product_name: e.target.value }))}
                />
              </div>

              <div>
                <label className={labelCls}>Repetir a cada (dias)</label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  className={inputCls}
                  value={editForm.frequency_days}
                  onChange={e => setEditForm(f => ({ ...f, frequency_days: e.target.value }))}
                />
              </div>

              <div>
                <label className={labelCls}>Valor pago</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputCls}
                  value={editForm.cost}
                  onChange={e => setEditForm(f => ({ ...f, cost: e.target.value }))}
                />
              </div>

              <ReminderPicker
                days={editForm.reminder_days}
                time={editForm.reminder_time}
                onDaysChange={v => setEditForm(f => ({ ...f, reminder_days: v }))}
                onTimeChange={v => setEditForm(f => ({ ...f, reminder_time: v }))}
              />

              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className={`w-full py-4 rounded-2xl text-[15px] font-bold shadow-sm disabled:opacity-50 ${cfg.colorBtn}`}
              >
                {saving ? 'Salvando...' : '✅ Salvar alterações'}
              </button>
            </div>
          )}

          {/* ── BUY MODE ──────────────────────────────────────────────────── */}
          {mode === 'buy' && (
            <div className="p-5 pb-8 space-y-4">
              <button
                onClick={() => setMode('view')}
                className="flex items-center gap-2 text-gray-500 hover:text-gray-800 text-sm font-medium mb-1"
              >
                ‹ Voltar
              </button>
              <h3 className="text-[16px] font-bold text-gray-900">Onde comprar</h3>
              <p className="text-sm text-gray-500">Escolha onde encontrar {cfg.title.toLowerCase()}:</p>

              <div className="space-y-3">
                {[
                  { name: 'Cobasi', url: 'https://www.cobasi.com.br', emoji: '🐾' },
                  { name: 'Petz', url: 'https://www.petz.com.br', emoji: '🐕' },
                  { name: 'Petlove', url: 'https://www.petlove.com.br', emoji: '❤️' },
                  { name: 'Amazon Pet', url: 'https://www.amazon.com.br/s?k=pet+saude', emoji: '📦' },
                ].map(store => (
                  <button
                    key={store.name}
                    onClick={() => {
                      trackPartnerClicked({
                        source: 'parasite_sheet',
                        partner: store.name.toLowerCase(),
                        pet_id: petId,
                        control_type: type,
                        product_name: current?.product_name ?? null,
                      });
                      window.open(store.url, '_blank', 'noopener,noreferrer');
                    }}
                    className="w-full flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md active:scale-[0.98] transition-all text-left"
                  >
                    <span className="text-2xl">{store.emoji}</span>
                    <div className="flex-1">
                      <p className="font-bold text-gray-900 text-sm">{store.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">Comprar {cfg.title.toLowerCase()}</p>
                    </div>
                    <span className="text-gray-400 text-lg">›</span>
                  </button>
                ))}
              </div>

              <button
                onClick={() => setMode('apply')}
                className={`w-full py-3 rounded-xl text-sm font-semibold shadow-sm ${cfg.colorBtn}`}
              >
                ✅ Já comprei — registrar aplicação
              </button>
            </div>
          )}

        </div>
        {/* End scrollable body */}

        {/* ── Delete confirm ────────────────────────────────────────────────── */}
        {confirmDeleteId && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center p-5 z-10 rounded-3xl">
            <div className="bg-white rounded-2xl p-5 w-full max-w-xs shadow-2xl">
              <p className="text-base font-bold text-gray-900 mb-2">Remover registro?</p>
              <p className="text-sm text-gray-500 mb-5">Essa ação não pode ser desfeita.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleDelete(confirmDeleteId)}
                  className="flex-1 py-3 rounded-xl bg-red-600 text-white font-semibold text-sm"
                >
                  Remover
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Toast ─────────────────────────────────────────────────────────── */}
        {toast && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-xl z-20 whitespace-nowrap pointer-events-none">
            {toast}
          </div>
        )}
      </div>
    </div>
    </ModalPortal>
  );
}
