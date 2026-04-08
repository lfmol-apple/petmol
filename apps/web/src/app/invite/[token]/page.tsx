'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';

interface InviteInfo {
  valid: boolean;
  owner_name?: string | null;
  owner_email?: string | null;
  group_name?: string | null;
  invite_name?: string | null;
  already_used?: boolean;
  expired?: boolean;
}

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Lê localStorage só no client (evita hydration mismatch)
  useEffect(() => {
    setIsLoggedIn(!!getToken());
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE_URL}/family/invite/${token}`)
      .then(r => r.json())
      .then(data => setInfo(data))
      .catch(() => setInfo({ valid: false }))
      .finally(() => setLoading(false));
  }, [token]);

  const handleJoin = async () => {
    if (!isLoggedIn) {
      // Redirect to login with return URL
      router.push(`/login?redirect=/invite/${token}`);
      return;
    }
    setJoining(true);
    setError(null);
    try {
      const authToken = getToken();
      const res = await fetch(`${API_BASE_URL}/family/join/${token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao entrar na família');
      setSuccess(true);
      setTimeout(() => router.push('/home'), 2500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setJoining(false);
    }
  };

  // ─── States ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0047ad] to-[#1a73e8] flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-[3px] border-white border-t-transparent rounded-full animate-spin" />
          <p className="text-white text-sm">Verificando convite…</p>
        </div>
      </div>
    );
  }

  if (!info?.valid) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center">
          <p className="text-5xl mb-4">{info?.expired ? '⌛' : info?.already_used ? '✅' : '❌'}</p>
          <h1 className="text-xl font-bold text-gray-800 mb-2">
            {info?.expired
              ? 'Convite expirado'
              : info?.already_used
              ? 'Convite já utilizado'
              : 'Convite inválido'}
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            {info?.expired
              ? 'Este link expirou. Peça um novo convite ao tutor.'
              : info?.already_used
              ? 'Este convite já foi utilizado. Faça login com sua conta.'
              : 'Este link não é válido ou foi revogado.'}
          </p>
          <button
            onClick={() => router.push('/login')}
            className="w-full py-3 bg-[#0047ad] text-white font-semibold rounded-xl text-sm"
          >
            Ir para o Login
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center">
          <p className="text-6xl mb-4">🎉</p>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Bem-vindo(a)!</h1>
          <p className="text-sm text-gray-600 mb-2">
            Você agora faz parte de <strong>{info.group_name}</strong>
          </p>
          <p className="text-xs text-gray-500">Redirecionando para o início…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0047ad] to-[#1a73e8] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden">
        {/* Header */}
        <div className="p-6 text-center bg-gradient-to-br from-[#0047ad] to-[#1a73e8]">
          <p className="text-5xl mb-3">🐾</p>
          <h1 className="text-white text-xl font-bold">PETMOL</h1>
          <p className="text-blue-100 text-sm mt-1">Convite de Família</p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="text-center">
            <p className="text-gray-500 text-sm">
              <strong className="text-gray-800 text-base">{info.owner_name ?? info.owner_email}</strong>{' '}
              te convidou para cuidar juntos dos pets
            </p>
            {info.group_name && (
              <p className="text-[#0047ad] font-semibold text-sm mt-1">👨‍👩‍👧 {info.group_name}</p>
            )}
            {info.invite_name && (
              <p className="text-gray-500 text-xs mt-1">Olá, <strong>{info.invite_name}</strong>! Este convite é para você.</p>
            )}
          </div>

          {/* What they get */}
          <div className="bg-blue-50 rounded-2xl p-4 space-y-2">
            <p className="text-xs font-semibold text-blue-800">Com este convite você poderá:</p>
            <ul className="text-xs text-blue-700 space-y-1.5">
              <li>🐶 Ver todos os pets cadastrados</li>
              <li>💉 Registrar vacinas, banhos, remédios</li>
              <li>🔔 Receber notificações de cuidados</li>
              <li>💊 Saber quando o pet já foi medicado</li>
            </ul>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              {error}
            </div>
          )}

          {isLoggedIn ? (
            <button
              onClick={handleJoin}
              disabled={joining}
              className="w-full py-4 bg-gradient-to-r from-[#0047ad] to-[#1a73e8] text-white font-bold text-sm rounded-2xl disabled:opacity-60 shadow-lg"
            >
              {joining ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Entrando…
                </span>
              ) : (
                '✅ Aceitar e entrar na família'
              )}
            </button>
          ) : (
            <div className="space-y-3">
              <button
                onClick={() => router.push(`/register?invite=${token}`)}
                className="w-full py-4 bg-gradient-to-r from-[#0047ad] to-[#1a73e8] text-white font-bold text-sm rounded-2xl shadow-lg"
              >
                📝 Criar conta e aceitar convite
              </button>
              <button
                onClick={() => router.push(`/login?redirect=/invite/${token}`)}
                className="w-full py-3 border-2 border-[#0047ad] text-[#0047ad] font-semibold text-sm rounded-2xl"
              >
                Já tenho conta — Fazer login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
