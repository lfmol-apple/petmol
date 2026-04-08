'use client';

import { useState } from 'react';
import { API_BASE_URL } from '@/lib/api';
import type { GroomingRecord, GroomingType } from '@/lib/types/home';
import { ModalPortal } from '@/components/ModalPortal';
import { ReminderPicker } from '@/components/ReminderPicker';
import { dateToLocalISO, localTodayISO } from '@/lib/localDate';

// ── Helpers ──────────────────────────────────────────────────────────────────
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return dateToLocalISO(dt);
}

function diffDays(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const clean = dateStr.split('T')[0];
  const [y, m, d] = clean.split('-').map(Number);
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

const TYPE_LABELS: Record<GroomingType, string> = {
  bath: '🚿 Banho',
  grooming: '✂️ Tosa',
  bath_grooming: '🛁 Banho + Tosa',
};

const FREQ_DEFAULTS: Record<GroomingType, number> = {
  bath: 21,
  grooming: 45,
  bath_grooming: 30,
};

function computeStatus(nextDate?: string | null) {
  const diff = diffDays(nextDate);
  if (diff === null) return { label: 'Sem agendamento', bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' };
  if (diff < 0)      return { label: `Atrasado ${Math.abs(diff)} dia${Math.abs(diff) !== 1 ? 's' : ''}`, bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' };
  if (diff === 0)    return { label: 'Hoje!', bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' };
  if (diff <= 7)     return { label: `Em ${diff} dias`, bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' };
  return { label: `Em ${diff} dias`, bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' };
}

// ── Types ────────────────────────────────────────────────────────────────────
interface GroomingItemSheetProps {
  petId: string;
  petName?: string;
  groomingRecords: GroomingRecord[];
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

type ViewMode = 'view' | 'add' | 'edit';

// ── Component ────────────────────────────────────────────────────────────────
export function GroomingItemSheet({
  petId,
  petName,
  groomingRecords,
  onClose,
  onRefresh,
}: GroomingItemSheetProps) {
  const [mode, setMode] = useState<ViewMode>('view');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const sorted = [...groomingRecords].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  const last = sorted[0] ?? null;
  const nextDate = last?.next_recommended_date?.split('T')[0] ?? null;
  const status = computeStatus(nextDate);

  // ── Add form ──────────────────────────────────────────────────────────────
  const [addForm, setAddForm] = useState({
    date: localTodayISO(),
    type: 'bath_grooming' as GroomingType,
    location: '',
    cost: '',
    notes: '',
    frequency_days: String(FREQ_DEFAULTS['bath_grooming']),
    reminder_days: '3',
    reminder_time: '09:00',
  });

  // ── Edit form ─────────────────────────────────────────────────────────────
  const [editRecord, setEditRecord] = useState<GroomingRecord | null>(null);
  const [editForm, setEditForm] = useState({
    date: '',
    type: 'bath_grooming' as GroomingType,
    location: '',
    cost: '',
    notes: '',
    frequency_days: String(FREQ_DEFAULTS['bath_grooming']),
    reminder_days: '3',
    reminder_time: '09:00',
  });

  // ── Toast ─────────────────────────────────────────────────────────────────
  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }

  // ── Add handler ───────────────────────────────────────────────────────────
  async function handleAdd() {
    if (!addForm.date) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('petmol_token');
      if (!token) { alert('Sessão expirada. Faça login novamente.'); return; }

      const freq = parseInt(addForm.frequency_days, 10) || FREQ_DEFAULTS[addForm.type];
      const nextRec = addDays(addForm.date, freq);

      const res = await fetch(`${API_BASE_URL}/pets/${petId}/grooming`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type: addForm.type,
          date: addForm.date,
          location: addForm.location || null,
          cost: addForm.cost ? parseFloat(addForm.cost) : null,
          notes: addForm.notes || null,
          next_recommended_date: nextRec,
          frequency_days: freq,
          reminder_enabled: true,
          alert_days_before: parseInt(addForm.reminder_days) || 3,
          reminder_time: addForm.reminder_time || '09:00',
        }),
      });

      if (res.ok) {
        showToast('✅ Serviço registrado!');
        setMode('view');
        // Reset form date to today for next use
        setAddForm(f => ({ ...f, date: localTodayISO(), cost: '', notes: '', location: '' }));
        await onRefresh();
      } else {
        alert('Erro ao salvar. Tente novamente.');
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Edit handlers ─────────────────────────────────────────────────────────
  function startEdit(rec: GroomingRecord) {
    setEditRecord(rec);
    setEditForm({
      date: rec.date,
      type: rec.type,
      location: rec.location || '',
      cost: rec.cost != null ? String(rec.cost) : '',
      notes: rec.notes || '',
      frequency_days: String(rec.frequency_days ?? FREQ_DEFAULTS[rec.type]),
      reminder_days: String((rec as unknown as Record<string, unknown>).alert_days_before ?? 3),
      reminder_time: String((rec as unknown as Record<string, unknown>).reminder_time ?? '09:00'),
    });
    setMode('edit');
  }

  async function handleSaveEdit() {
    if (!editRecord || !editForm.date) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('petmol_token');
      if (!token) return;

      const editFreq = parseInt(editForm.frequency_days, 10) || FREQ_DEFAULTS[editForm.type];
      const res = await fetch(`${API_BASE_URL}/pets/${petId}/grooming/${editRecord.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          date: editForm.date,
          type: editForm.type,
          location: editForm.location || null,
          cost: editForm.cost ? parseFloat(editForm.cost) : null,
          notes: editForm.notes || null,
          next_recommended_date: addDays(editForm.date, editFreq),
          frequency_days: editFreq,
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
    const token = localStorage.getItem('petmol_token');
    if (!token) return;
    const res = await fetch(`${API_BASE_URL}/pets/${petId}/grooming/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      showToast('🗑️ Registro removido');
      await onRefresh();
    }
  }

  // ── CSS helpers ───────────────────────────────────────────────────────────
  const inputCls = 'w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300';
  const labelCls = 'block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div
        className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl flex flex-col"
        style={{ maxHeight: '92dvh' }}
        onClick={e => e.stopPropagation()}
      >

        {/* Header */}
        <div className="px-5 pt-4 pb-4 bg-sky-50 border-b border-sky-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-2xl flex-shrink-0">
              🛁
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-[17px] font-bold text-gray-900 leading-tight">Banho e Tosa</h2>
              {petName && <p className="text-sm text-gray-500 mt-0.5">{petName}</p>}
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/80 flex items-center justify-center text-gray-500 hover:bg-white shadow-sm flex-shrink-0"
              aria-label="Fechar"
            >
              ✕
            </button>
          </div>

          {/* Status badge */}
          <div className={`mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold ${status.bg} ${status.text}`}>
            <span className={`w-2 h-2 rounded-full ${status.dot}`} />
            {nextDate ? status.label : 'Sem agendamento'}
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 overscroll-contain">

          {/* ── VIEW MODE ─────────────────────────────────────────────────── */}
          {mode === 'view' && (
            <div className="p-5 space-y-4 pb-8">
              {/* Last service card */}
              {last ? (
                <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4 space-y-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-sky-700">Último serviço</p>
                  <p className="text-[17px] font-bold text-gray-900">{TYPE_LABELS[last.type]}</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <p className="text-[11px] text-gray-400 font-medium">Data</p>
                      <p className="font-semibold text-gray-800">{fmtDate(last.date)}</p>
                    </div>
                    {nextDate && (
                      <div>
                        <p className="text-[11px] text-gray-400 font-medium">Próximo</p>
                        <p className={`font-semibold ${status.text}`}>{fmtDate(nextDate)}</p>
                      </div>
                    )}
                    {last.location && (
                      <div>
                        <p className="text-[11px] text-gray-400 font-medium">Local</p>
                        <p className="font-semibold text-gray-800 truncate">{last.location}</p>
                      </div>
                    )}
                    {last.cost != null && (
                      <div>
                        <p className="text-[11px] text-gray-400 font-medium">Valor</p>
                        <p className="font-semibold text-gray-800">R$ {last.cost.toFixed(2).replace('.', ',')}</p>
                      </div>
                    )}
                  </div>
                  {last.notes && (
                    <p className="text-xs text-gray-500 italic border-t border-sky-100 pt-2">{last.notes}</p>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-8 text-center">
                  <p className="text-4xl mb-3">🛁</p>
                  <p className="text-sm font-semibold text-gray-600">Nenhum serviço registrado</p>
                  <p className="text-xs text-gray-400 mt-1">Registre o primeiro serviço abaixo</p>
                </div>
              )}

              {/* Main CTA */}
              <button
                onClick={() => setMode('add')}
                className="w-full py-4 rounded-2xl bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white text-[15px] font-bold shadow-md transition-colors"
              >
                🛁 Fiz hoje
              </button>

              {/* Secondary */}
              <button
                onClick={() => setMode('add')}
                className="w-full py-3 rounded-xl bg-sky-50 text-sky-700 text-sm font-semibold active:bg-sky-100"
              >
                ➕ Registrar outro serviço
              </button>

              {/* History */}
              {sorted.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                    Histórico ({sorted.length})
                  </p>
                  {sorted.map((rec, i) => (
                    <div
                      key={rec.id}
                      className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 px-4 py-3 shadow-sm"
                    >
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0 ${i === 0 ? 'bg-sky-50' : 'bg-gray-50'}`}>
                        {i === 0 ? '🛁' : '·'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800">{TYPE_LABELS[rec.type]}</p>
                        <p className="text-xs text-gray-400">
                          {fmtDate(rec.date)}
                          {rec.cost != null ? ` · R$ ${rec.cost.toFixed(2).replace('.', ',')}` : ''}
                          {rec.location ? ` · ${rec.location}` : ''}
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
                </div>
              )}
            </div>
          )}

          {/* ── ADD FORM ──────────────────────────────────────────────────── */}
          {mode === 'add' && (
            <div className="p-5 pb-8 space-y-4">
              <button
                onClick={() => setMode('view')}
                className="flex items-center gap-2 text-gray-500 hover:text-gray-800 text-sm font-medium mb-1"
              >
                ‹ Voltar
              </button>
              <h3 className="text-[16px] font-bold text-gray-900">Registrar serviço</h3>

              <div>
                <label className={labelCls}>Data *</label>
                <input
                  type="date"
                  className={inputCls}
                  value={addForm.date}
                  onChange={e => setAddForm(f => ({
                    ...f,
                    date: e.target.value,
                  }))}  
                />
              </div>

              <div>
                <label className={labelCls}>Tipo *</label>
                <select
                  className={inputCls}
                  value={addForm.type}
                  onChange={e => setAddForm(f => ({
                    ...f,
                    type: e.target.value as GroomingType,
                    frequency_days: String(FREQ_DEFAULTS[e.target.value as GroomingType]),
                  }))}
                >
                  <option value="bath">🚿 Somente Banho</option>
                  <option value="grooming">✂️ Somente Tosa</option>
                  <option value="bath_grooming">🛁 Banho + Tosa</option>
                </select>
              </div>

              <div>
                <label className={labelCls}>Local (opcional)</label>
                <input
                  type="text"
                  className={inputCls}
                  placeholder="Ex: Petshop Feliz, em casa"
                  value={addForm.location}
                  onChange={e => setAddForm(f => ({ ...f, location: e.target.value }))}
                />
              </div>

              <div>
                <label className={labelCls}>Valor R$ (opcional)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputCls}
                  placeholder="Ex: 80,00"
                  value={addForm.cost}
                  onChange={e => setAddForm(f => ({ ...f, cost: e.target.value }))}
                />
              </div>

              <div>
                <label className={labelCls}>Repetir a cada (dias)</label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  className={inputCls}
                  value={addForm.frequency_days}
                  onChange={e => setAddForm(f => ({ ...f, frequency_days: e.target.value }))}
                />
                <p className="text-xs text-gray-400 mt-1">Recomendado: {FREQ_DEFAULTS[addForm.type]} dias</p>
              </div>

              <ReminderPicker
                days={addForm.reminder_days}
                time={addForm.reminder_time}
                onDaysChange={v => setAddForm(f => ({ ...f, reminder_days: v }))}
                onTimeChange={v => setAddForm(f => ({ ...f, reminder_time: v }))}
              />

              <button
                onClick={handleAdd}
                disabled={saving || !addForm.date}
                className="w-full py-4 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white text-[15px] font-bold shadow-md disabled:opacity-50"
              >
                {saving ? 'Salvando...' : '✅ Confirmar serviço'}
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
                <label className={labelCls}>Data *</label>
                <input
                  type="date"
                  className={inputCls}
                  value={editForm.date}
                  onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))}
                />
              </div>

              <div>
                <label className={labelCls}>Tipo</label>
                <select
                  className={inputCls}
                  value={editForm.type}
                  onChange={e => setEditForm(f => ({ ...f, type: e.target.value as GroomingType }))}
                >
                  <option value="bath">🚿 Somente Banho</option>
                  <option value="grooming">✂️ Somente Tosa</option>
                  <option value="bath_grooming">🛁 Banho + Tosa</option>
                </select>
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
                <label className={labelCls}>Local</label>
                <input
                  type="text"
                  className={inputCls}
                  value={editForm.location}
                  onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))}
                />
              </div>

              <div>
                <label className={labelCls}>Valor R$</label>
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
                className="w-full py-4 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white text-[15px] font-bold shadow-md disabled:opacity-50"
              >
                {saving ? 'Salvando...' : '✅ Salvar alterações'}
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
