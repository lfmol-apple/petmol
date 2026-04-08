'use client';

import type { CareInteractionPolicy, InteractionClickDestination } from '@/features/interactions/types';

// ---------------------------------------------------------------------------
// Helpers: human-readable labels
// ---------------------------------------------------------------------------
export const DESTINATION_LABELS: Partial<Record<InteractionClickDestination | string, string>> = {
  'open-central': 'Central de interações',
  'open-history': 'Ver histórico',
  'open-register': 'Registrar',
  'open-edit': 'Editar',
  'open-shopping': 'Compra',
  'health/vaccines': 'Carteira vacinal',
  'health/medication': 'Tratamento em curso',
  'health/parasites/dewormer': 'Vermífugo',
  'health/parasites/flea_tick': 'Antipulgas',
  'health/parasites/collar': 'Coleira',
  'health/food': 'Alimentação',
  'health/grooming': 'Banho e tosa',
  'health/eventos': 'Eventos',
  none: 'Sem destino',
};

export const PERSISTENCE_LABELS: Record<string, string> = {
  session: 'Enquanto aberto',
  'until-resolved': 'Até resolver',
  'one-shot': 'Uma vez',
  critical: 'Sempre',
};

export function destLabel(dest: string): string {
  return DESTINATION_LABELS[dest] ?? dest;
}

export function persistenceLabel(p: string): string {
  return PERSISTENCE_LABELS[p] ?? p;
}

export function conversionLabel(focus: CareInteractionPolicy['commercialFocus']): string {
  if (!focus || focus === 'none') return 'Sem conversão';
  if (focus === 'soft') return 'Registro';
  if (focus === 'medium') return 'Sugestão de compra';
  return 'Compra ativa';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface Props {
  icon: string;
  label: string;
  policy: CareInteractionPolicy;
  onConfigure: () => void;
}

export function NotificationControlCard({ icon, label, policy, onConfigure }: Props) {
  const hasConversion = policy.commercialFocus && policy.commercialFocus !== 'none';

  return (
    <div
      className={`rounded-2xl bg-white border p-4 flex flex-col gap-3 transition-opacity ${
        policy.enabled ? 'border-slate-200' : 'border-slate-100 opacity-60'
      }`}
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-2.5">
        <span className="text-xl leading-none shrink-0">{icon}</span>
        <span className="font-semibold text-slate-900 text-sm flex-1 min-w-0 truncate">{label}</span>
        <span
          className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${
            policy.enabled
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-slate-100 text-slate-400'
          }`}
        >
          {policy.enabled ? 'Ativo' : 'Inativo'}
        </span>
      </div>

      {/* ── Canais ativos ── */}
      <div className="flex flex-wrap gap-1.5">
        {policy.showOnHome && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Home</span>
        )}
        {policy.showInCenter && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Central</span>
        )}
        {policy.pushEnabled && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">Push</span>
        )}
        {policy.browserEnabled && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">Browser</span>
        )}
        {!policy.showOnHome && !policy.showInCenter && !policy.pushEnabled && (
          <span className="text-[10px] text-slate-300">Sem canais ativos</span>
        )}
      </div>

      {/* ── Info rows ── */}
      <div className="space-y-1.5 text-xs text-slate-500">
        <Row icon="⏰" value={`Avisa ${policy.advance_days ?? 7} dias antes`} />
        <Row icon="⏳" value={persistenceLabel(policy.persistence)} />
        <Row icon="👆" value={destLabel(policy.primary.destination)} />
        <Row
          icon="💰"
          value={conversionLabel(policy.commercialFocus)}
          accent={hasConversion}
        />
      </div>

      {/* ── CTA ── */}
      <button
        type="button"
        onClick={onConfigure}
        className="w-full mt-1 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold active:opacity-70 transition-opacity"
      >
        Configurar
      </button>
    </div>
  );
}

function Row({ icon, value, accent }: { icon: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="shrink-0 w-4 text-center">{icon}</span>
      <span className={accent ? 'text-indigo-600 font-medium' : ''}>{value}</span>
    </div>
  );
}
