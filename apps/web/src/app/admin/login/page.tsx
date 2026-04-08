'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PremiumScreenShell, PremiumCard } from '@/components/premium';

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/v1/admin/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Login failed');
      }

      if (data.success) {
        // Salvar token no localStorage
        localStorage.setItem('admin_token', data.data.session_token);
        localStorage.setItem('admin_user', JSON.stringify({
          admin_id: data.data.admin_id,
          username: data.data.username,
          email: data.data.email,
          role: data.data.role,
        }));

        // Redirecionar para dashboard
        router.push('/admin/dashboard');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PremiumScreenShell title="PETMOL Admin" subtitle="Painel de Administração Master" hideBack>
      <div className="flex items-center justify-center min-h-[70vh] px-4">
        <div className="max-w-md w-full">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">🐾</div>
          </div>

          {/* Login Card */}
          <PremiumCard>
            <form onSubmit={handleLogin} className="space-y-6">
            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <span className="text-red-600 text-xl">⚠️</span>
                  <div>
                    <div className="font-semibold text-red-900">Erro</div>
                    <div className="text-sm text-red-700">{error}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Usuário
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] focus:border-transparent"
                placeholder="admin"
                required
                disabled={loading}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Senha
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] focus:border-transparent"
                placeholder="••••••••"
                required
                disabled={loading}
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-[#0056D2] to-[#0047ad] text-white font-semibold rounded-lg hover:from-[#0047ad] hover:to-[#003889] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Entrando...
                </span>
              ) : (
                'Entrar'
              )}
            </button>
          </form>

          {/* Info */}
          <div className="mt-6 pt-6 border-t border-slate-200">
            <div className="text-center text-sm text-slate-500">
              <div className="mb-2">🔒 Acesso restrito a administradores</div>
              <div className="text-xs">
                Use o email de um usuário promovido a admin. Atalho: <code className="bg-slate-100 px-2 py-1 rounded">admin</code> → <code className="bg-slate-100 px-2 py-1 rounded">admin@petmol.com</code>
              </div>
            </div>
          </div>
          </PremiumCard>

          {/* Footer */}
          <div className="text-center mt-6 text-slate-400 text-sm">
            © 2026 PETMOL • Todos os direitos reservados
          </div>
        </div>
      </div>
    </PremiumScreenShell>
  );
}
