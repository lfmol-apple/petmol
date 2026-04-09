import Link from 'next/link';

const MAPS_OPTIONS = [
  {
    icon: '🏥',
    title: 'Clínicas Veterinárias',
    subtitle: 'Atendimento 24h · Consultas e urgências',
    query: 'clínica veterinária 24 horas perto de mim',
    bg: 'from-red-50 to-rose-50',
    border: 'border-red-200',
    iconBg: 'bg-red-100',
    chevron: 'text-red-400',
  },
  {
    icon: '🏨',
    title: 'Hospitais Veterinários',
    subtitle: 'Internação e cirurgia 24h',
    query: 'hospital veterinário 24 horas perto de mim',
    bg: 'from-orange-50 to-red-50',
    border: 'border-orange-200',
    iconBg: 'bg-orange-100',
    chevron: 'text-orange-400',
  },
  {
    icon: '🚨',
    title: 'Emergência Veterinária',
    subtitle: 'Pronto-socorro para animais 24h',
    query: 'veterinária 24 horas emergência perto de mim',
    bg: 'from-rose-50 to-red-50',
    border: 'border-rose-200',
    iconBg: 'bg-rose-100',
    chevron: 'text-rose-400',
  },
];

export default function EmergencyPage() {
  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <div className="mb-5">
        <Link
          href="/home"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 shadow-sm hover:text-slate-900 mb-3"
        >
          <span>‹</span>
          <span>Voltar</span>
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center flex-shrink-0">
            <span className="text-2xl">🚨</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 leading-tight">Emergência Veterinária</h1>
            <p className="text-sm text-slate-500">Encontre atendimento próximo a você</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {MAPS_OPTIONS.map((opt) => (
          <a
            key={opt.query}
            href={`https://www.google.com/maps/search/${encodeURIComponent(opt.query)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-4 p-4 bg-gradient-to-r ${opt.bg} border ${opt.border} rounded-2xl active:scale-[0.98] transition-all`}
          >
            <div className={`w-12 h-12 rounded-xl ${opt.iconBg} flex items-center justify-center flex-shrink-0`}>
              <span className="text-2xl">{opt.icon}</span>
            </div>
            <div className="flex-1">
              <div className="font-bold text-gray-900 text-sm">{opt.title}</div>
              <div className="text-xs text-gray-500 mt-0.5">{opt.subtitle}</div>
            </div>
            <span className={`${opt.chevron} text-lg`}>›</span>
          </a>
        ))}
      </div>

      <p className="text-center text-[10px] text-gray-400 mt-5">
        Abre o Google Maps com estabelecimentos próximos a você
      </p>
    </div>
  );
}
