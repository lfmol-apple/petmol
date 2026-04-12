'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { getToken } from '@/lib/auth-token';
import { API_BASE_URL } from '@/lib/api';

import { BrandBackground, PetmolTextLogo } from '@/components/ui/BrandBackground';

const G = 'divide-y divide-slate-100 overflow-hidden rounded-[24px] border border-slate-100 bg-white/50 backdrop-blur-sm';
const ROW = 'px-4 py-4';
const CTA = 'w-full py-4 bg-gradient-to-r from-[#0066ff] to-[#0056D2] text-white text-base font-bold rounded-2xl active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-blue-500/10';

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [inviteToken, setInviteToken] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setInviteToken(params.get('invite'));
  }, []);

  const canSubmit =
    name.trim().length >= 2 &&
    email.trim().length > 0 &&
    password.length >= 6 &&
    password === confirmPassword &&
    termsAccepted;

  const handleSubmit = async () => {
    setError('');
    if (!name.trim()) { setError('Preencha seu nome.'); return; }
    if (!email.trim()) { setError('Preencha seu e-mail.'); return; }
    if (password.length < 6) { setError('Senha mínima: 6 caracteres.'); return; }
    if (password !== confirmPassword) { setError('As senhas não coincidem.'); return; }
    if (!termsAccepted) { setError('Aceite os termos para continuar.'); return; }

    setLoading(true);
    try {
      await register(
        name.trim(), email.trim(), password,
        undefined, termsAccepted,
        undefined,
        { monthly_checkin_day: 5, monthly_checkin_hour: 9, monthly_checkin_minute: 0 },
      );
      if (inviteToken) {
        try {
          const authToken = getToken();
          if (authToken) {
            await fetch(`${API_BASE_URL}/family/join/${inviteToken}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            });
          }
        } catch {}
        router.push('/home');
        return;
      }
      router.push('/register-pet');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar conta.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <BrandBackground showLogo={false}>
      <div className="flex flex-col items-center justify-center min-h-[calc(100dvh-40px)] w-full px-4 py-8 animate-fadeIn">
        <div className="w-full max-w-sm flex flex-col items-center mb-10 animate-scaleIn">
          <PetmolTextLogo className="text-6xl drop-shadow-3xl" />
        </div>

        <div className="bg-white/95 backdrop-blur-xl rounded-[40px] shadow-premium border border-white/60 w-full max-w-md p-8 md:p-10 animate-scaleIn">
          <div className="mb-8">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Criar uma conta</h2>
            <p className="text-sm text-slate-500 font-medium">
              Já tem conta?{' '}
              <Link href="/login" className="text-blue-600 font-black uppercase tracking-widest text-xs hover:underline">Entrar</Link>
            </p>
          </div>

          <div className="flex flex-col gap-6">
            {error && (
              <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-700 text-xs font-bold flex items-center gap-3 animate-shake">
                <span className="text-lg">⚠️</span>
                {error}
              </div>
            )}

            {/* Credentials group */}
            <div className="space-y-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2 pl-1">Dados de Acesso</p>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Nome completo</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)}
                    autoComplete="name" placeholder="Seu nome"
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:bg-white transition-all outline-none text-slate-900 font-medium" />
                </div>
                
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">E-mail</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value.trim())}
                    autoCapitalize="none" autoCorrect="off" autoComplete="email" inputMode="email"
                    placeholder="seu@email.com"
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:bg-white transition-all outline-none text-slate-900 font-medium" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Senha</label>
                    <div className="relative">
                      <input type={showPassword ? 'text' : 'password'} value={password}
                        onChange={e => setPassword(e.target.value)}
                        autoComplete="new-password" minLength={6} placeholder="••••••"
                        className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:bg-white transition-all outline-none text-slate-900 font-medium" />
                      <button type="button" onClick={() => setShowPassword(v => !v)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-bold uppercase tracking-tight hover:text-blue-600 transition-colors">
                        {showPassword ? 'Ocultar' : 'Ver'}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Confirmar</label>
                    <div className="relative">
                      <input type={showConfirm ? 'text' : 'password'} value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        autoComplete="new-password" placeholder="••••••"
                        className={`w-full px-5 py-4 bg-slate-50 border transition-all rounded-2xl outline-none text-slate-900 font-medium ${confirmPassword && confirmPassword !== password ? 'border-rose-300 ring-4 ring-rose-500/10' : 'border-slate-100 focus:ring-4 focus:ring-blue-500/10 focus:bg-white'}`} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Terms */}
            <label className="flex items-start gap-4 cursor-pointer group p-1">
              <div
                onClick={() => setTermsAccepted(v => !v)}
                className={`mt-0.5 flex-shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all cursor-pointer ${termsAccepted ? 'bg-blue-500 border-blue-500 shadow-md shadow-blue-500/20' : 'border-slate-200 bg-white group-hover:border-blue-300'}`}
              >
                {termsAccepted && <span className="text-white text-xs font-black">✓</span>}
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                Li e aceito os{' '}
                <Link href="/legal/terms" target="_blank" className="text-blue-600 font-bold hover:underline">Termos de uso</Link>
                {' '}e a{' '}
                <Link href="/legal/privacy" target="_blank" className="text-blue-600 font-bold hover:underline">Política de privacidade</Link>
              </p>
            </label>

            <button type="button" onClick={handleSubmit} disabled={loading || !canSubmit} className={CTA + ' bg-gradient-to-r from-[#0066ff] to-[#0056D2] font-black uppercase tracking-widest'}>
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Criando conta...
                </span>
              ) : 'Criar minha conta'}
            </button>
          </div>
        </div>
        
        <p className="mt-8 text-white/40 text-[10px] font-black uppercase tracking-[0.3em] font-mono">PETMOL CORE SYNC</p>
      </div>
    </BrandBackground>
  );
}
