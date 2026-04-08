'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { getToken } from '@/lib/auth-token';
import { API_BASE_URL } from '@/lib/api';

// ─── Design tokens ─────────────────────────────────────────────────────────
const G = 'divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200';
const ROW = 'bg-white px-4 py-3';
const CTA = 'w-full py-3.5 bg-[#0056D2] text-white text-sm font-semibold rounded-xl active:scale-[0.98] transition-transform disabled:opacity-40 disabled:cursor-not-allowed';

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
    <div className="min-h-dvh bg-gray-50 flex flex-col items-center px-4">
      {/* Top */}
      <div className="w-full max-w-sm pt-14 pb-6 text-center">
        <p className="text-[10px] font-bold tracking-[0.2em] text-gray-400 uppercase mb-2">PETMOL</p>
        <h1 className="text-2xl font-bold text-gray-950 tracking-tight">Criar conta</h1>
        <p className="text-sm text-gray-500 mt-1">
          Já tem conta?{' '}
          <Link href="/login" className="text-blue-600 font-semibold">Entrar</Link>
        </p>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-5 pb-12">
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        {/* Credentials group */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2 px-1">Acesso</p>
          <div className={G}>
            <div className={ROW}>
              <label className="block text-xs text-gray-400 mb-0.5">Nome completo</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                autoComplete="name" placeholder="Seu nome"
                className="w-full text-sm text-gray-900 placeholder:text-gray-300 outline-none bg-transparent" />
            </div>
            <div className={ROW}>
              <label className="block text-xs text-gray-400 mb-0.5">E-mail</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value.trim())}
                autoCapitalize="none" autoCorrect="off" autoComplete="email" inputMode="email"
                placeholder="seu@email.com"
                className="w-full text-sm text-gray-900 placeholder:text-gray-300 outline-none bg-transparent" />
            </div>
            <div className={ROW}>
              <label className="block text-xs text-gray-400 mb-0.5">Senha</label>
              <div className="flex items-center">
                <input type={showPassword ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="new-password" minLength={6} placeholder="Mínimo 6 caracteres"
                  className="flex-1 text-sm text-gray-900 placeholder:text-gray-300 outline-none bg-transparent" />
                <button type="button" onClick={() => setShowPassword(v => !v)}
                  className="text-xs text-gray-400 font-medium ml-2 flex-shrink-0">
                  {showPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </div>
            <div className={`${ROW} ${confirmPassword && confirmPassword !== password ? 'border-l-2 border-rose-400' : ''}`}>
              <label className="block text-xs text-gray-400 mb-0.5">Confirmar senha</label>
              <div className="flex items-center">
                <input type={showConfirm ? 'text' : 'password'} value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  autoComplete="new-password" placeholder="Repita a senha"
                  className="flex-1 text-sm text-gray-900 placeholder:text-gray-300 outline-none bg-transparent" />
                <button type="button" onClick={() => setShowConfirm(v => !v)}
                  className="text-xs text-gray-400 font-medium ml-2 flex-shrink-0">
                  {showConfirm ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Terms */}
        <label className="flex items-start gap-3 cursor-pointer">
          <div
            onClick={() => setTermsAccepted(v => !v)}
            className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors cursor-pointer ${termsAccepted ? 'bg-blue-500 border-blue-500' : 'border-gray-300 bg-white'}`}
          >
            {termsAccepted && <span className="text-white text-xs font-bold leading-none">✓</span>}
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            Li e aceito os{' '}
            <Link href="/legal/terms" target="_blank" className="text-blue-600 font-medium">Termos de uso</Link>
            {' '}e a{' '}
            <Link href="/legal/privacy" target="_blank" className="text-blue-600 font-medium">Política de privacidade</Link>
          </p>
        </label>

        <button type="button" onClick={handleSubmit} disabled={loading || !canSubmit} className={CTA}>
          {loading ? 'Criando conta…' : 'Criar conta'}
        </button>
      </div>
    </div>
  );
}
