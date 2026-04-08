'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

export default function LoginPage() {
  const router = useRouter();
  const [redirectTo, setRedirectTo] = useState('/home');
  const { login, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('redirect') || '/home';
    // Evita loop: nunca redirecionar de volta para '/' ou '/login'
    const safe = (raw === '/' || raw.startsWith('/login')) ? '/home' : raw;
    setRedirectTo(safe);
  }, []);

  // Já autenticado → vai direto pra home
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace(redirectTo);
    }
  }, [isAuthenticated, isLoading, router, redirectTo]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [accountDeleted, setAccountDeleted] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('msg') === 'conta-excluida') {
      setAccountDeleted(true);
      window.history.replaceState({}, '', '/login');
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      router.replace(redirectTo);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-400 via-blue-500 to-[#0056D2] p-4 relative overflow-hidden">
      {/* Card principal com split design */}
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl flex overflow-hidden relative z-10">
        {/* Lado esquerdo - Imagem da Marca */}
        <div className="hidden md:flex md:w-1/2 bg-gradient-to-br from-[#0066ff] to-[#0047ad] flex-col justify-center items-center text-white relative overflow-hidden">
          <div className="absolute inset-0">
            <img 
              src="/brand/hero-image.jpeg" 
              alt="PETMOL" 
              className="w-full h-full object-cover"
            />
          </div>
          {/* Overlay sutil para dar profundidade */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#0056D2]/30 to-[#003889]/30"></div>
        </div>

        {/* Lado direito - Formulário */}
        <div className="w-full md:w-1/2 p-8 md:p-12">
          <div className="text-center mb-8 md:hidden">
            <h1 className="text-3xl font-bold text-[#0056D2] mb-2 flex items-center justify-center gap-2">
              <span className="text-4xl">🐾</span>
              PETMOL
            </h1>
          </div>
          
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Seus pets estão esperando.</h2>
            <p className="text-gray-600">Vacinas, lembretes e pendências em um só lugar.</p>
          </div>

          {accountDeleted && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm flex items-center gap-2">
              <span>✅</span>
              Conta excluída com sucesso.
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
              <span>⚠️</span>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#0056D2] focus:border-[#0056D2] transition-all"
                placeholder="seu@email.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">
                Senha
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#0056D2] focus:border-[#0056D2] transition-all"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-[#0066ff] to-[#0056D2] hover:from-[#0056D2] hover:to-[#0047ad] text-white font-semibold py-3 rounded-xl transition-all shadow-lg hover:shadow-xl disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Entrando...
                </span>
              ) : (
                'Entrar'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-gray-600 text-sm">
              Não tem uma conta?{' '}
              <Link href="/register" className="text-[#0056D2] hover:text-[#0047ad] font-semibold hover:underline">
                Criar conta
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
