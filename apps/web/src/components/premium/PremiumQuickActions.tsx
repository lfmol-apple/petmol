'use client';

/**
 * PremiumQuickActions — até 3 ações rápidas no topo de tela.
 * NÃO usar na home/page.tsx.
 */
import { tokens } from './premiumTokens';

interface QuickAction {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Cor de destaque (padrão: azul) */
  color?: 'blue' | 'green' | 'purple' | 'rose' | 'amber';
}

const colorMap: Record<string, string> = {
  blue: 'bg-blue-50 border-blue-200 text-[#0047ad] hover:bg-blue-100',
  green: 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100',
  purple: 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100',
  rose: 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100',
  amber: 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100',
};

interface PremiumQuickActionsProps {
  actions: QuickAction[];
  className?: string;
}

export function PremiumQuickActions({ actions, className = '' }: PremiumQuickActionsProps) {
  const limited = actions.slice(0, 3);

  return (
    <div
      className={`grid gap-3 ${
        limited.length === 1
          ? 'grid-cols-1'
          : limited.length === 2
          ? 'grid-cols-2'
          : 'grid-cols-3'
      } ${className}`}
    >
      {limited.map((action, i) => {
        const colorClasses = colorMap[action.color ?? 'blue'];
        return (
          <button
            key={i}
            onClick={action.onClick}
            disabled={action.disabled}
            className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border font-medium text-sm transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${colorClasses}`}
          >
            <span className="text-2xl">{action.icon}</span>
            <span className="text-xs leading-tight text-center">{action.label}</span>
          </button>
        );
      })}
    </div>
  );
}
