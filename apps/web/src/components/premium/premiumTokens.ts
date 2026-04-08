/**
 * Premium Design Tokens — classes Tailwind centralizadas.
 * Use estes tokens nas telas secundárias para consistência visual.
 * NÃO usar na home/page.tsx.
 */

// Superfícies
export const tokens = {
  // Fundos
  pageBg: 'min-h-screen bg-slate-50',
  cardBg: 'bg-white',

  // Bordas / sombras
  cardBorder: 'border border-slate-200',
  cardShadow: 'shadow-sm',
  cardRadius: 'rounded-2xl',

  // Espaçamento
  cardPadding: 'p-5 sm:p-6',
  sectionGap: 'space-y-4',
  pageMaxWidth: 'max-w-2xl mx-auto px-4 py-8',

  // Tipografia
  pageTitle: 'text-2xl font-bold text-slate-900',
  pageSubtitle: 'text-sm text-slate-500 mt-1',
  cardTitle: 'text-base font-semibold text-slate-800',
  cardBody: 'text-sm text-slate-600 leading-relaxed',
  label: 'block text-sm font-medium text-slate-700 mb-1',

  // Botões
  btnPrimary:
    'w-full bg-[#0056D2] hover:bg-[#0047ad] active:bg-[#003889] text-white font-semibold py-3 px-6 rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed',
  btnSecondary:
    'w-full bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-medium py-3 px-6 rounded-xl transition-all',
  btnGhost:
    'text-[#0056D2] hover:text-[#003889] font-medium text-sm underline-offset-2 hover:underline transition-colors',
  btnBack:
    'flex items-center gap-2 text-slate-500 hover:text-slate-800 text-sm font-medium transition-colors py-1',

  // Input
  input:
    'w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#0056D2] focus:border-[#0056D2] transition-all text-slate-900 placeholder:text-slate-400',

  // Alertas
  alertError: 'p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start gap-2',
  alertSuccess: 'p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm flex items-start gap-2',
  alertInfo: 'p-3 bg-blue-50 border border-blue-200 rounded-xl text-[#0047ad] text-sm flex items-start gap-2',
  alertWarning: 'p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm flex items-start gap-2',

  // Header interno das telas
  topBar: 'flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-10',
  topBarTitle: 'text-base font-semibold text-slate-900',

  // Footer sticky
  stickyFooter: 'sticky bottom-0 bg-white border-t border-slate-200 p-4 flex flex-col sm:flex-row gap-3',

  // Dividers
  divider: 'border-t border-slate-100 my-4',

  // Badge
  badgeGreen: 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium',
  badgeAmber: 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium',
  badgeBlue: 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-[#0047ad] text-xs font-medium',
  badgeSlate: 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium',
} as const;
