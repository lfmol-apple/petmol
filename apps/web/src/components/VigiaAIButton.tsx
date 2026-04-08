import Link from 'next/link';

type VaccineSummary = {
  next_due_date?: string | null;
};

export function VigiaAIButton({ petId, vaccines = [] }: { petId: string; vaccines?: VaccineSummary[] }) {
  const calculateScore = () => {
    const totalVaccines = vaccines.length;
    if (totalVaccines === 0) return 50;
    
    const today = new Date();
    const upToDate = vaccines.filter(v => {
      if (!v.next_due_date) return true;
      return new Date(v.next_due_date) >= today;
    }).length;
    
    return Math.min(100, Math.floor((upToDate / totalVaccines) * 100));
  };

  const score = calculateScore();
  const getScoreColor = () => {
    if (score >= 90) return 'from-green-500 to-emerald-600';
    if (score >= 70) return 'from-[#0066ff] to-indigo-600';
    if (score >= 50) return 'from-yellow-500 to-orange-600';
    return 'from-red-500 to-pink-600';
  };

  return (
    <Link
      href={`/saude/${petId}`}
      className={`block bg-gradient-to-r ${getScoreColor()} hover:shadow-xl text-white rounded-xl shadow-lg transition-all duration-300 overflow-hidden group`}
    >
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-3xl">🩺</div>
          <div>
            <h3 className="font-bold text-base">Vigia AI</h3>
            <p className="text-xs opacity-90">Análise de saúde</p>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <div className="text-2xl font-bold">{score}</div>
          <span className="text-xs opacity-75">Score</span>
        </div>
      </div>
    </Link>
  );
}
