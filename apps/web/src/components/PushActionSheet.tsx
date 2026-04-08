'use client';

import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { getToken as getAuthToken } from '@/lib/auth-token';
import { trackReminderActionCompleted, trackV1Metric } from '@/lib/v1Metrics';
import { dateToLocalISO, localTodayISO, parseLocalDateOnly } from '@/lib/localDate';

/**
 * PushActionSheet — tela curta de decisão exibida quando o tutor toca num push.
 *
 * Princípio: o push leva ao lugar certo com ações rápidas.
 * O tutor escolhe entre poucas opções, o histórico é salvo, o próximo ciclo recalculado.
 */

// ── Types ──

export type ActionSheetType =
  | 'vaccines'
  | 'medication'
  | 'parasites'
  | 'food'
  | 'grooming';

interface PushActionSheetProps {
  type: ActionSheetType;
  petName: string;
  petId: string;
  /** Nome do item (vacina, medicamento, produto etc.) */
  itemName?: string;
  /** ID do evento/registro (para confirm/apply-dose) */
  eventId?: string;
  /** Callback ao fechar o sheet */
  onClose: () => void;
  /** Callback para abrir o módulo completo (ex: health modal, EditPetModal) */
  onOpenFull: () => void;
  /** Callback para abrir o handoff comercial contextual do item */
  onOpenCommerce?: () => void;
}

// ── Helpers ──

const sheetBg: Record<ActionSheetType, string> = {
  vaccines:   'from-sky-50 to-white',
  medication: 'from-purple-50 to-white',
  parasites:  'from-orange-50 to-white',
  food:       'from-amber-50 to-white',
  grooming:   'from-cyan-50 to-white',
};

const sheetIcon: Record<ActionSheetType, string> = {
  vaccines:   '💉',
  medication: '💊',
  parasites:  '🛡️',
  food:       '🥣',
  grooming:   '🛁',
};

const sheetTitle: Record<ActionSheetType, string> = {
  vaccines:   'Vacina',
  medication: 'Medicação',
  parasites:  'Antiparasitário',
  food:       'Alimentação',
  grooming:   'Banho e Tosa',
};

// ── Component ──

export function PushActionSheet({
  type,
  petName,
  petId,
  itemName,
  eventId,
  onClose,
  onOpenFull,
  onOpenCommerce,
}: PushActionSheetProps) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [costValue, setCostValue] = useState('');
  const [showCostInput, setShowCostInput] = useState(false);

  const icon = sheetIcon[type];
  const title = sheetTitle[type];
  const bg = sheetBg[type];

  useEffect(() => {
    trackV1Metric('push_opened', {
      sheet_type: type,
      pet_id: petId,
      item_name: itemName ?? null,
    });
  }, [type, petId, itemName]);

  // -- Generic API call for confirm/apply-dose --
  const confirmAction = async (action: string) => {
    const token = getAuthToken();
    if (!token) return;
    setLoading(true);
    try {
      if (eventId && action === 'confirm') {
        const today = localTodayISO();
        // Medication uses apply-dose (records dose on treatment course without closing event)
        // Other event types use complete (marks event done + creates recurrence)
        const endpoint = type === 'medication'
          ? `${API_BASE_URL}/events/${eventId}/apply-dose`
          : `${API_BASE_URL}/events/${eventId}/complete`;
        const body = type === 'medication'
          ? JSON.stringify({ date: today })
          : JSON.stringify({});
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body,
        });
        if (res.ok) {
          if (type === 'medication') {
            trackV1Metric('medication_taken', {
              source: 'push_action_sheet',
              pet_id: petId,
              item_name: itemName ?? null,
            });
          }
          trackReminderActionCompleted({
            source: 'push_action_sheet',
            item_type: type,
            pet_id: petId,
            item_name: itemName ?? null,
          });
          setDone('✅ Registrado com sucesso!');
          setTimeout(onClose, 1500);
          return;
        }
      }
      // Fallback: just show full modal
      onOpenFull();
    } catch {
      onOpenFull();
    } finally {
      setLoading(false);
    }
  };

  const handleSnooze = (days: number) => {
    setDone(`⏰ Adiado por ${days} dia${days > 1 ? 's' : ''}`);
    setTimeout(onClose, 1200);
  };

  // If action completed, show success toast
  if (done) {
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={onClose}>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 text-center">
          <p className="text-lg font-bold text-gray-900">{done}</p>
          <p className="text-sm text-gray-500 mt-1">{petName}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className={`relative w-full max-w-sm bg-gradient-to-b ${bg} rounded-2xl shadow-2xl overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{icon}</span>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-gray-900 truncate">
                {title} — {petName}
              </h3>
              {itemName && (
                <p className="text-sm text-gray-600 truncate">{itemName}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 flex-shrink-0"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 space-y-2">

          {/* ═══ VACINAS ═══ */}
          {type === 'vaccines' && (
            <>
              <ActionButton
                emoji="✅"
                label="Já apliquei"
                desc="Registrar data e comprovante"
                color="green"
                loading={loading}
                onClick={() => {
                  setShowCostInput(true);
                  if (showCostInput) confirmAction('confirm');
                  else return;
                }}
              />
              {showCostInput && (
                <CostInput value={costValue} onChange={setCostValue} onConfirm={() => confirmAction('confirm')} loading={loading} />
              )}
              {!showCostInput && (
                <>
                  <ActionButton emoji="⏰" label="Vou resolver depois" desc="Adiar por 3 dias" color="amber" onClick={() => handleSnooze(3)} />
                  <ActionButton emoji="📅" label="Adiar lembrete" desc="Escolher nova data" color="gray" onClick={onOpenFull} />
                </>
              )}
            </>
          )}

          {/* ═══ MEDICAÇÃO ═══ */}
          {type === 'medication' && (
            <>
              <ActionButton
                emoji="✅"
                label="Administrado"
                desc="Registrar dose agora"
                color="green"
                loading={loading}
                onClick={() => confirmAction('confirm')}
              />
              <ActionButton emoji="⏰" label="Adiar 30min" desc="" color="amber" onClick={() => handleSnooze(0)} />
              <ActionButton emoji="⏭️" label="Pular essa dose" desc="" color="gray" onClick={() => { setDone('Dose pulada'); setTimeout(onClose, 1200); }} />
            </>
          )}

          {/* ═══ ANTIPARASITÁRIO ═══ */}
          {type === 'parasites' && (
            <>
              <ActionButton
                emoji="✅"
                label="Tenho e vou aplicar"
                desc="Confirmar aplicação agora"
                color="green"
                loading={loading}
                onClick={() => {
                  if (!showCostInput) { setShowCostInput(true); return; }
                  confirmAction('confirm');
                }}
              />
              {showCostInput && (
                <CostInput value={costValue} onChange={setCostValue} onConfirm={() => confirmAction('confirm')} loading={loading} />
              )}
              {!showCostInput && (
                <>
                  <ActionButton
                    emoji="🛒"
                    label="Preciso comprar"
                    desc="Ver parceiros e produtos"
                    color="blue"
                    onClick={() => {
                      if (onOpenCommerce) onOpenCommerce();
                      else onOpenFull();
                    }}
                  />
                  <ActionButton emoji="⏰" label="Adiar" desc="Lembrar em 3 dias" color="amber" onClick={() => handleSnooze(3)} />
                </>
              )}
            </>
          )}

          {/* ═══ ALIMENTAÇÃO ═══ */}
          {type === 'food' && (
            <>
              <ActionButton
                emoji="🛒"
                label="Comprar agora"
                desc="Ver parceiros com produto"
                color="blue"
                onClick={() => {
                  if (onOpenCommerce) onOpenCommerce();
                  else onOpenFull();
                }}
              />
              <ActionButton
                emoji="✅"
                label="Já comprei"
                desc="Registrar compra e novo ciclo"
                color="green"
                loading={loading}
                onClick={() => {
                  if (!showCostInput) { setShowCostInput(true); return; }
                  // Save to localStorage and reset cycle
                  const key = `petmol_food_control_${petId}`;
                  try {
                    const raw = localStorage.getItem(key);
                    const data = raw ? JSON.parse(raw) : {};
                    data.last_purchase_date = localTodayISO();
                    if (costValue) data.last_cost = parseFloat(costValue);
                    localStorage.setItem(key, JSON.stringify(data));
                  } catch {}
                  trackV1Metric('food_restock_confirmed', {
                    source: 'push_action_sheet',
                    pet_id: petId,
                    item_name: itemName ?? null,
                    cost: costValue ? parseFloat(costValue) : null,
                  });
                  trackReminderActionCompleted({
                    source: 'push_action_sheet',
                    item_type: 'food',
                    pet_id: petId,
                    item_name: itemName ?? null,
                  });
                  setDone('✅ Compra registrada! Novo ciclo iniciado.');
                  setTimeout(onClose, 1500);
                }}
              />
              {showCostInput && (
                <CostInput value={costValue} onChange={setCostValue} onConfirm={() => {
                  const key = `petmol_food_control_${petId}`;
                  try {
                    const raw = localStorage.getItem(key);
                    const data = raw ? JSON.parse(raw) : {};
                    data.last_purchase_date = localTodayISO();
                    if (costValue) data.last_cost = parseFloat(costValue);
                    localStorage.setItem(key, JSON.stringify(data));
                  } catch {}
                  trackV1Metric('food_restock_confirmed', {
                    source: 'push_action_sheet',
                    pet_id: petId,
                    item_name: itemName ?? null,
                    cost: costValue ? parseFloat(costValue) : null,
                  });
                  trackReminderActionCompleted({
                    source: 'push_action_sheet',
                    item_type: 'food',
                    pet_id: petId,
                    item_name: itemName ?? null,
                  });
                  setDone('✅ Compra registrada! Novo ciclo iniciado.');
                  setTimeout(onClose, 1500);
                }} loading={loading} />
              )}
              {!showCostInput && (
                <>
                  <ActionButton emoji="📦" label="Ainda tenho" desc="Adiar previsão" color="amber" onClick={() => {
                    const key = `petmol_food_control_${petId}`;
                    try {
                      const raw = localStorage.getItem(key);
                      const data = raw ? JSON.parse(raw) : {};
                      const est = data.estimated_end_date || data.next_purchase_date;
                      if (est) {
                        const d = parseLocalDateOnly(String(est));
                        if (!Number.isNaN(d.getTime())) {
                          d.setDate(d.getDate() + 5);
                          const next = dateToLocalISO(d);
                          data.estimated_end_date = next;
                          data.next_purchase_date = next;
                        }
                        localStorage.setItem(key, JSON.stringify(data));
                      }
                    } catch {}
                    setDone('📦 Previsão adiada em 5 dias');
                    setTimeout(onClose, 1200);
                  }} />
                  <ActionButton emoji="🔄" label="Troquei o produto" desc="Cadastrar novo produto" color="gray" onClick={onOpenFull} />
                </>
              )}
            </>
          )}

          {/* ═══ BANHO E TOSA ═══ */}
          {type === 'grooming' && (
            <>
              <ActionButton
                emoji="✅"
                label="Fiz hoje"
                desc="Registrar e recalcular próxima"
                color="green"
                loading={loading}
                onClick={() => {
                  if (!showCostInput) { setShowCostInput(true); return; }
                  confirmAction('confirm');
                }}
              />
              {showCostInput && (
                <CostInput value={costValue} onChange={setCostValue} onConfirm={() => confirmAction('confirm')} loading={loading} />
              )}
              {!showCostInput && (
                <>
                  <ActionButton emoji="⏰" label="Adiar" desc="Lembrar em 3 dias" color="amber" onClick={() => handleSnooze(3)} />
                  <ActionButton emoji="🚫" label="Não fiz ainda" desc="Manter lembrete ativo" color="gray" onClick={onClose} />
                </>
              )}
            </>
          )}

          {/* Ver detalhes link */}
          <button
            onClick={onOpenFull}
            className="w-full text-center text-xs text-gray-400 py-2 hover:text-gray-600 transition-colors"
          >
            Ver detalhes completos →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──

function ActionButton({
  emoji,
  label,
  desc,
  color,
  loading,
  onClick,
}: {
  emoji: string;
  label: string;
  desc?: string;
  color: 'green' | 'blue' | 'amber' | 'gray';
  loading?: boolean;
  onClick: () => void;
}) {
  const colorMap = {
    green: 'bg-green-50 border-green-200 text-green-800 hover:bg-green-100 active:bg-green-200',
    blue:  'bg-gradient-to-br from-blue-800 via-blue-600 to-sky-500 border-blue-400/70 text-white shadow-[0_14px_30px_rgba(29,78,216,0.34)] hover:shadow-[0_18px_34px_rgba(29,78,216,0.42)] hover:brightness-105',
    amber: 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100 active:bg-amber-200',
    gray:  'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100 active:bg-gray-200',
  };

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`w-full flex items-start gap-3 px-4 py-3 rounded-xl border transition-all active:scale-[0.98] ${colorMap[color]} ${loading ? 'opacity-60' : ''}`}
    >
      <span className={`text-xl flex-shrink-0 mt-0.5 ${color === 'blue' ? 'inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white ring-1 ring-blue-200/80 shadow-sm' : ''}`}>{loading ? '⏳' : emoji}</span>
      <div className="flex-1 text-left pt-1">
        <p className="text-sm font-semibold leading-5">{label}</p>
        {desc && <p className="text-xs opacity-70 mt-1 leading-4">{desc}</p>}
      </div>
      <span className={`text-lg mt-1 ${color === 'blue' ? 'text-white/80' : 'text-gray-300'}`}>›</span>
    </button>
  );
}

function CostInput({
  value,
  onChange,
  onConfirm,
  loading,
}: {
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  loading?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 p-3 bg-white border border-gray-200 rounded-xl">
      <span className="text-sm text-gray-500 flex-shrink-0">R$</span>
      <input
        type="number"
        min="0"
        step="5"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Valor (opcional)"
        className="flex-1 text-sm border-0 outline-none bg-transparent"
        autoFocus
      />
      <button
        onClick={onConfirm}
        disabled={loading}
        className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-bold hover:bg-green-600 active:scale-95 transition-all disabled:opacity-50 flex-shrink-0"
      >
        {loading ? '...' : 'Confirmar'}
      </button>
    </div>
  );
}
