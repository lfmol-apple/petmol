'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { getToken } from '@/lib/auth-token';
import { API_BASE_URL } from '@/lib/api';
import { BrandBackground, PetmolTextLogo } from '@/components/ui/BrandBackground';

type FieldKey = 'name' | 'email' | 'password' | 'terms';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateField(field: FieldKey, values: { name: string; email: string; password: string; termsAccepted: boolean }): string {
  if (field === 'name' && values.name.trim().length < 2) return 'Informe seu nome.';
  if (field === 'email' && !EMAIL_RE.test(values.email.trim())) return 'Informe um e-mail válido.';
  if (field === 'password' && values.password.length < 6) return 'Senha mínima de 6 caracteres.';
  if (field === 'terms' && !values.termsAccepted) return 'Aceite os termos para continuar.';
  return '';
}

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [inviteToken, setInviteToken] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showMoreInfo, setShowMoreInfo] = useState(false);
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<FieldKey, string>>({ name: '', email: '', password: '', terms: '' });
  const [currentField, setCurrentField] = useState<FieldKey>('name');

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const termsRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setInviteToken(params.get('invite'));
    nameRef.current?.focus();
  }, []);

  const minValid = name.trim().length >= 2 && EMAIL_RE.test(email.trim()) && password.length >= 6;

  const focusField = (field: FieldKey) => {
    const map: Record<FieldKey, { current: HTMLInputElement | null }> = {
      name: nameRef,
      email: emailRef,
      password: passwordRef,
      terms: termsRef,
    };
    map[field].current?.focus();
    map[field].current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setCurrentField(field);
  };

  const setFieldValidation = (field: FieldKey, value: string) => {
    setErrors((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    const values = { name, email, password, termsAccepted };
    const ordered: FieldKey[] = ['name', 'email', 'password', 'terms'];
    const nextErrors: Record<FieldKey, string> = { name: '', email: '', password: '', terms: '' };
    let firstInvalid: FieldKey | null = null;

    for (const field of ordered) {
      const message = validateField(field, values);
      nextErrors[field] = message;
      if (!firstInvalid && message) firstInvalid = field;
    }

    setErrors(nextErrors);
    if (firstInvalid) {
      focusField(firstInvalid);
      return;
    }

    setLoading(true);
    try {
      await register(
        name.trim(),
        email.trim(),
        password,
        phone.trim() || undefined,
        termsAccepted,
        city.trim() ? { city: city.trim() } : undefined,
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
        } catch {
          // non-blocking
        }
        router.push('/home');
        return;
      }

      router.push('/register-pet');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao criar conta.';
      setFieldValidation('email', message);
      focusField('email');
    } finally {
      setLoading(false);
    }
  };

  const fieldClass = (field: FieldKey) =>
    `w-full px-4 py-3 rounded-2xl border text-[15px] outline-none transition-all bg-white ${
      errors[field]
        ? 'border-rose-400 ring-4 ring-rose-500/10'
        : currentField === field
          ? 'border-blue-400 ring-4 ring-blue-500/10'
          : 'border-slate-200'
    }`;

  return (
    <BrandBackground showLogo={false}>
      <div className="min-h-[calc(100dvh-40px)] w-full px-4 py-8 flex items-center justify-center">
        <div className="w-full max-w-md bg-white/95 backdrop-blur-xl rounded-[32px] border border-white/60 shadow-premium p-6">
          <div className="flex justify-center mb-5">
            <PetmolTextLogo className="text-5xl drop-shadow-3xl" color="#2563EB" />
          </div>

          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-500">Leva menos de 1 minuto</p>
          <h1 className="mt-1 text-2xl font-black text-slate-900">Criar conta</h1>
          <p className="text-sm text-slate-500 mt-1">
            Preencha o mínimo para começar. Já tem conta?{' '}
            <Link href="/login" className="text-blue-600 font-bold hover:underline">Entrar</Link>
          </p>

          <div className="mt-6 space-y-3">
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Nome *</label>
              <input
                ref={nameRef}
                type="text"
                value={name}
                onFocus={() => setCurrentField('name')}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errors.name) setFieldValidation('name', validateField('name', { name: e.target.value, email, password, termsAccepted }));
                }}
                placeholder="Seu nome"
                className={fieldClass('name')}
              />
              {errors.name && <p className="mt-1 text-xs text-rose-600 font-semibold">{errors.name}</p>}
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">E-mail *</label>
              <input
                ref={emailRef}
                type="email"
                value={email}
                onFocus={() => setCurrentField('email')}
                onChange={(e) => {
                  setEmail(e.target.value.trim());
                  if (errors.email) setFieldValidation('email', validateField('email', { name, email: e.target.value, password, termsAccepted }));
                }}
                placeholder="voce@email.com"
                className={fieldClass('email')}
              />
              {errors.email && <p className="mt-1 text-xs text-rose-600 font-semibold">{errors.email}</p>}
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Senha *</label>
              <div className="relative">
                <input
                  ref={passwordRef}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onFocus={() => setCurrentField('password')}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setFieldValidation('password', validateField('password', { name, email, password: e.target.value, termsAccepted }));
                  }}
                  placeholder="Mínimo 6 caracteres"
                  className={fieldClass('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500"
                >
                  {showPassword ? 'Ocultar' : 'Ver'}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-xs text-rose-600 font-semibold">{errors.password}</p>}
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowMoreInfo((v) => !v)}
                className="text-sm font-semibold text-slate-600 hover:text-blue-600"
              >
                {showMoreInfo ? 'Ocultar informações extras' : 'Adicionar mais informações'}
              </button>
              {showMoreInfo && (
                <div className="mt-3 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Telefone (opcional)</label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(11) 99999-9999"
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white text-[15px] outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Cidade (opcional)</label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Sua cidade"
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white text-[15px] outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            <label className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer ${errors.terms ? 'border-rose-300 bg-rose-50' : 'border-slate-200'}`}>
              <input
                ref={termsRef}
                type="checkbox"
                checked={termsAccepted}
                onFocus={() => setCurrentField('terms')}
                onChange={(e) => {
                  setTermsAccepted(e.target.checked);
                  if (errors.terms) setFieldValidation('terms', '');
                }}
                className="mt-0.5"
              />
              <span className="text-xs text-slate-600">
                Li e aceito os{' '}
                <Link href="/legal/terms" target="_blank" className="text-blue-600 font-bold hover:underline">Termos</Link>
                {' '}e a{' '}
                <Link href="/legal/privacy" target="_blank" className="text-blue-600 font-bold hover:underline">Política de Privacidade</Link>.
              </span>
            </label>
            {errors.terms && <p className="text-xs text-rose-600 font-semibold -mt-2">{errors.terms}</p>}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || !minValid}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#0066ff] to-[#0056D2] text-white text-[15px] font-black uppercase tracking-widest disabled:opacity-40"
            >
              {loading ? 'Criando conta...' : 'Continuar'}
            </button>
          </div>
        </div>
      </div>
    </BrandBackground>
  );
}
