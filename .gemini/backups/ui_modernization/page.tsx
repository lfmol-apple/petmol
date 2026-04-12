'use client';
import { getToken, clearToken } from '@/lib/auth-token';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { API_BASE_URL } from '@/lib/api';
import { showBlockingNotice } from '@/features/interactions/userPromptChannel';

// ── Design tokens ─────────────────────────────────────────────
const G   = 'divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200';
const ROW = 'bg-white px-4 py-3';
const CTA = 'w-full py-3.5 bg-[#0056D2] text-white text-sm font-semibold rounded-xl active:scale-[0.98] transition-transform disabled:opacity-40 disabled:cursor-not-allowed';

function Switch({ on, onChange, disabled }: { on: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={disabled ? undefined : onChange} role="switch" aria-checked={on}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${on ? 'bg-blue-500' : 'bg-gray-200'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  );
}

// ── Types ─────────────────────────────────────────────────────
interface TutorData {
  id: string;
  name: string;
  phone: string;
  email: string;
  whatsapp: boolean;
  monthly_checkin_day?: number;
  monthly_checkin_hour?: number;
  monthly_checkin_minute?: number;
  postal_code?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  country?: string;
}

// ── Component ─────────────────────────────────────────────────
export default function ProfilePage() {
  const router = useRouter();
  const apiBase = API_BASE_URL;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tutorData, setTutorData] = useState<TutorData | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);
  // Accordion states
  const [addrOpen, setAddrOpen] = useState(false);
  const [notifsOpen, setNotifsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    loadTutorData();
  }, []);

  // Open notifications section if linked via #checkin
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#checkin') {
      setNotifsOpen(true);
      setTimeout(() => {
        document.getElementById('checkin-config')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, []);

  // CEP auto-fetch when 8 digits are entered in edit mode
  useEffect(() => {
    if (tutorData?.postal_code && editMode) {
      const normalized = tutorData.postal_code.replace(/\D/g, '');
      if (normalized.length === 8) handleCepLookup();
    }
  }, [tutorData?.postal_code]);

  const loadTutorData = async () => {
    try {
      const token = getToken();
      if (!token) { router.push('/login'); return; }
      const res = await fetch(`${apiBase}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.phone) {
          let d = data.phone.replace(/\D/g, '');
          if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
          if (d.length === 10) data.phone = `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6,10)}`;
          else if (d.length === 11) data.phone = `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7,11)}`;
        }
        setTutorData(data);
      } else if (res.status === 404) {
        setError('Perfil não encontrado. Complete seu cadastro.');
      } else {
        setError('Erro ao carregar dados.');
      }
    } catch {
      setError('Erro de conexão.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!tutorData) return;
    setSaving(true);
    setError(null);
    try {
      const token = getToken();
      const saveData = { ...tutorData };
      if (saveData.phone) {
        let d = saveData.phone.replace(/\D/g, '');
        if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
        saveData.phone = d;
      }
      const res = await fetch(`${apiBase}/auth/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        credentials: 'include',
        body: JSON.stringify(saveData),
      });
      if (res.ok) {
        const updated = await res.json();
        if (updated.phone) {
          let d = updated.phone.replace(/\D/g, '');
          if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
          if (d.length === 10) updated.phone = `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6,10)}`;
          else if (d.length === 11) updated.phone = `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7,11)}`;
        }
        setTutorData(updated);
        setEditMode(false);
      } else {
        setError('Erro ao salvar dados.');
      }
    } catch {
      setError('Erro de conexão.');
    } finally {
      setSaving(false);
    }
  };

  const handleCepLookup = async () => {
    if (!tutorData?.postal_code) return;
    const normalized = tutorData.postal_code.replace(/\D/g, '');
    if (normalized.length !== 8) { if (normalized.length > 0) setCepError('CEP inválido. Digite 8 dígitos.'); return; }
    setCepError(null);
    setCepLoading(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${normalized}/json/`);
      const data = await response.json();
      if (data?.erro) { setCepError('CEP não encontrado.'); return; }
      setTutorData(prev => prev ? {
        ...prev,
        street: data.logradouro || prev.street,
        neighborhood: data.bairro || prev.neighborhood,
        city: data.localidade || prev.city,
        state: data.uf || prev.state,
        country: 'Brasil',
      } : null);
      setCepError('Endereço preenchido');
      setTimeout(() => setCepError(null), 3000);
    } catch {
      setCepError('Erro ao buscar CEP.');
    } finally {
      setCepLoading(false);
    }
  };

  const normalizeBRPhone = (raw: string): string => {
    let d = raw.replace(/\D/g, '');
    if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
    return d;
  };

  const formatPhone = (value: string) => {
    const numbers = normalizeBRPhone(value);
    if (numbers.length === 0) return '';
    if (numbers.length <= 2) return `(${numbers}`;
    if (numbers.length <= 6) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
    if (numbers.length <= 10) return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 6)}-${numbers.slice(6, 10)}`;
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`;
  };

  const handlePhoneChange = (value: string) => {
    const formatted = formatPhone(value);
    setTutorData(prev => prev ? { ...prev, phone: formatted } : null);
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword.trim()) { showBlockingNotice('Digite sua senha para confirmar.'); return; }
    try {
      const token = getToken();
      const base = apiBase.replace(/\/$/, '');
      const res = await fetch(`${base}/auth/me`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: 'include',
        body: JSON.stringify({ password: deletePassword }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); showBlockingNotice(err.detail || 'Erro ao excluir conta.'); return; }
      clearToken();
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = '/login?msg=conta-excluida';
    } catch {
      showBlockingNotice('Erro ao excluir conta. Tente novamente.');
    }
  };

  const tutorInitial = (tutorData?.name || 'T').trim().charAt(0).toUpperCase();
  const inpCls = `w-full bg-transparent text-sm outline-none text-gray-900 placeholder:text-gray-400 disabled:opacity-50`;

  // ── Loading ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-dvh bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#0056D2]/30 border-t-[#0056D2] rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !tutorData) {
    return (
      <div className="min-h-dvh bg-gray-50 flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-4 text-center">
          <p className="text-sm text-rose-700">{error}</p>
          <Link href="/home" className={CTA + ' inline-block'}>Voltar ao início</Link>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="min-h-dvh bg-gray-50 flex flex-col items-center px-4 py-6">
      <div className="w-full max-w-sm space-y-4 pb-10">

        {/* Header */}
        <div className="flex items-center gap-3 pt-2 pb-1">
          <Link href="/home"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white border border-gray-200 text-gray-600 text-sm flex-shrink-0">
            ←
          </Link>
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0056D2] text-white text-sm font-bold flex-shrink-0">
              {tutorInitial}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">{tutorData?.name || 'Tutor'}</p>
              {tutorData?.email && <p className="text-xs text-gray-500 truncate">{tutorData.email}</p>}
            </div>
          </div>
          {editMode && (
            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-700 flex-shrink-0">
              Editando
            </span>
          )}
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        {/* Dados pessoais */}
        <div className={G}>
          <div className={ROW}>
            <label className="block text-xs text-gray-500 mb-1">Nome completo</label>
            <input
              type="text"
              value={tutorData?.name || ''}
              onChange={(e) => setTutorData((prev) => prev ? { ...prev, name: e.target.value } : null)}
              disabled={!editMode}
              autoComplete="name"
              placeholder="Nome completo"
              className={inpCls}
            />
          </div>
          <div className={ROW}>
            <label className="block text-xs text-gray-500 mb-1">E-mail</label>
            <input
              type="email"
              value={tutorData?.email || ''}
              onChange={(e) => setTutorData((prev) => prev ? { ...prev, email: e.target.value } : null)}
              disabled={!editMode}
              autoCapitalize="none"
              inputMode="email"
              placeholder="seu@email.com"
              className={inpCls}
            />
          </div>
          <div className={ROW}>
            <label className="block text-xs text-gray-500 mb-1">Telefone</label>
            <input
              type="tel"
              value={tutorData?.phone || ''}
              onChange={(e) => handlePhoneChange(e.target.value)}
              disabled={!editMode}
              inputMode="tel"
              placeholder="(31) 99999-9999"
              className={inpCls}
            />
            {tutorData?.phone && (() => {
              const numbers = normalizeBRPhone(tutorData.phone);
              if (numbers.length >= 10) {
                const isMobile = numbers.length === 11 && numbers[2] === '9';
                if (isMobile) return <p className="text-xs text-green-600 mt-0.5">Celular</p>;
                if (numbers.length === 10) return <p className="text-xs text-blue-600 mt-0.5">Fixo</p>;
                return <p className="text-xs text-amber-600 mt-0.5">Verifique o número</p>;
              }
              return null;
            })()}
            {/* Quick actions */}
            {!editMode && tutorData?.phone && (() => {
              const numbers = normalizeBRPhone(tutorData.phone);
              if (numbers.length < 10) return null;
              return (
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(numbers)}
                    className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600"
                  >
                    Copiar
                  </button>
                  {numbers.length === 11 && (
                    <a href={`https://wa.me/55${numbers}`} target="_blank" rel="noopener noreferrer"
                      className="rounded-lg bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                      WhatsApp
                    </a>
                  )}
                  <a href={`tel:+55${numbers}`}
                    className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                    Ligar
                  </a>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Endereço */}
        <div className={G}>
          <button
            type="button"
            onClick={() => setAddrOpen((v) => !v)}
            className={`${ROW} flex w-full items-center justify-between`}
          >
            <span className="text-sm font-medium text-gray-800">Endereço</span>
            <span className={`text-gray-400 text-xs transition-transform ${addrOpen ? 'rotate-180' : ''}`}>▾</span>
          </button>

          {addrOpen && (
            <>
              <div className={ROW}>
                <label className="block text-xs text-gray-500 mb-1">CEP</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={tutorData?.postal_code || ''}
                    onChange={(e) => {
                      const nums = e.target.value.replace(/\D/g, '');
                      const fmt = nums.length > 5 ? `${nums.slice(0, 5)}-${nums.slice(5, 8)}` : nums;
                      setTutorData((prev) => prev ? { ...prev, postal_code: fmt } : null);
                      setCepError(null);
                    }}
                    onBlur={handleCepLookup}
                    disabled={!editMode}
                    maxLength={9}
                    placeholder="00000-000"
                    className={inpCls + ' flex-1'}
                  />
                  {cepLoading && <span className="text-xs text-gray-400 animate-pulse">buscando…</span>}
                </div>
                {cepError && (
                  <p className={`text-xs mt-0.5 ${cepError === 'Endereço preenchido' ? 'text-green-600' : 'text-rose-600'}`}>{cepError}</p>
                )}
              </div>
              <div className={ROW}>
                <label className="block text-xs text-gray-500 mb-1">Rua / Avenida</label>
                <input type="text" value={tutorData?.street || ''} onChange={(e) => setTutorData((p) => p ? { ...p, street: e.target.value } : null)} disabled={!editMode} placeholder="Logradouro" className={inpCls} />
              </div>
              <div className={`${ROW} grid grid-cols-2 gap-3`}>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Número</label>
                  <input type="text" value={tutorData?.number || ''} onChange={(e) => setTutorData((p) => p ? { ...p, number: e.target.value } : null)} disabled={!editMode} placeholder="Nº" className={inpCls} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Complemento</label>
                  <input type="text" value={tutorData?.complement || ''} onChange={(e) => setTutorData((p) => p ? { ...p, complement: e.target.value } : null)} disabled={!editMode} placeholder="Apto, casa…" className={inpCls} />
                </div>
              </div>
              <div className={ROW}>
                <label className="block text-xs text-gray-500 mb-1">Bairro</label>
                <input type="text" value={tutorData?.neighborhood || ''} onChange={(e) => setTutorData((p) => p ? { ...p, neighborhood: e.target.value } : null)} disabled={!editMode} placeholder="Bairro" className={inpCls} />
              </div>
              <div className={`${ROW} grid grid-cols-3 gap-3`}>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Cidade</label>
                  <input type="text" value={tutorData?.city || ''} onChange={(e) => setTutorData((p) => p ? { ...p, city: e.target.value } : null)} disabled={!editMode} placeholder="Cidade" className={inpCls} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">UF</label>
                  <input type="text" value={tutorData?.state || ''} onChange={(e) => setTutorData((p) => p ? { ...p, state: e.target.value.toUpperCase() } : null)} disabled={!editMode} maxLength={2} placeholder="UF" className={inpCls} />
                </div>
              </div>
              {!editMode && tutorData?.street && (
                <div className={ROW}>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${tutorData.street}, ${tutorData.number || ''}, ${tutorData.neighborhood || ''}, ${tutorData.city || ''}, ${tutorData.state || ''}`)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-sm text-blue-600 font-medium"
                  >
                    Ver no Google Maps
                  </a>
                </div>
              )}
            </>
          )}
        </div>

        {/* Preferências */}
        <div className={G}>
          <button
            type="button"
            onClick={() => setNotifsOpen((v) => !v)}
            className={`${ROW} flex w-full items-center justify-between`}
          >
            <span className="text-sm font-medium text-gray-800">Preferências</span>
            <span className={`text-gray-400 text-xs transition-transform ${notifsOpen ? 'rotate-180' : ''}`}>▾</span>
          </button>

          {notifsOpen && (
            <>
              {/* WhatsApp toggle */}
              <div className={`${ROW} flex items-center justify-between`}>
                <div>
                  <p className="text-sm text-gray-800">WhatsApp</p>
                  <p className="text-xs text-gray-500 mt-0.5">Lembretes dos pets via mensagem</p>
                </div>
                <Switch
                  on={tutorData?.whatsapp || false}
                  onChange={() => setTutorData((prev) => prev ? { ...prev, whatsapp: !prev.whatsapp } : null)}
                  disabled={!editMode}
                />
              </div>

              {/* Monthly reminder */}
              <div className={ROW} id="checkin-config">
                <p className="text-sm text-gray-800 mb-2">Lembrete mensal de saúde</p>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Dia</label>
                    <select
                      value={tutorData?.monthly_checkin_day ?? 5}
                      onChange={(e) => setTutorData((prev) => prev ? { ...prev, monthly_checkin_day: Number(e.target.value) } : null)}
                      disabled={!editMode}
                      className="w-full bg-gray-100 rounded-lg px-2 py-2 text-sm outline-none disabled:opacity-50"
                    >
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>Dia {d}</option>
                      ))}
                      <option value={0}>Último</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Hora</label>
                    <select
                      value={tutorData?.monthly_checkin_hour ?? 9}
                      onChange={(e) => setTutorData((prev) => prev ? { ...prev, monthly_checkin_hour: Number(e.target.value) } : null)}
                      disabled={!editMode}
                      className="w-full bg-gray-100 rounded-lg px-2 py-2 text-sm outline-none disabled:opacity-50"
                    >
                      {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                        <option key={h} value={h}>{String(h).padStart(2, '0')}h</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Min</label>
                    <select
                      value={tutorData?.monthly_checkin_minute ?? 0}
                      onChange={(e) => setTutorData((prev) => prev ? { ...prev, monthly_checkin_minute: Number(e.target.value) } : null)}
                      disabled={!editMode}
                      className="w-full bg-gray-100 rounded-lg px-2 py-2 text-sm outline-none disabled:opacity-50"
                    >
                      {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                        <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className={ROW}>
                <button
                  type="button"
                  onClick={() => router.push('/admin/notifications')}
                  className="w-full"
                >
                  <div className="w-full rounded-2xl border border-gray-200 bg-gray-50/80 p-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Gerenciamento de interações</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        As notificações são controladas pelo sistema central do PETMOL.
                      </p>
                    </div>
                    <span className="text-xs font-medium text-[#0056D2]">Abrir painel master</span>
                  </div>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Mais opções */}
        <div className={G}>
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            className={`${ROW} flex w-full items-center justify-between`}
          >
            <span className="text-sm font-medium text-gray-800">Mais opções</span>
            <span className={`text-gray-400 text-xs transition-transform ${moreOpen ? 'rotate-180' : ''}`}>▾</span>
          </button>

          {moreOpen && (
            <>
              {/* Danger zone — Núcleo familiar movido para V1 */}
              <div className={ROW}>
                <p className="text-xs font-semibold text-rose-700 uppercase tracking-wide mb-2">Zona de perigo</p>
                <p className="text-xs text-gray-500 mb-3">Excluir a conta remove seus dados permanentemente.</p>
                {!showDeleteConfirm ? (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full rounded-xl border border-rose-300 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 transition-colors"
                  >
                    Excluir minha conta
                  </button>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-rose-800 font-medium">Digite sua senha para confirmar:</p>
                    <input
                      type="password"
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                      placeholder="Sua senha"
                      className="w-full px-4 py-3 border border-rose-200 rounded-xl text-sm outline-none bg-white focus:ring-2 focus:ring-rose-400"
                    />
                    <div className="flex gap-2">
                      <button type="button" onClick={handleDeleteAccount}
                        className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white">
                        Confirmar exclusão
                      </button>
                      <button type="button" onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); }}
                        className="flex-1 rounded-xl bg-gray-100 py-2.5 text-sm font-medium text-gray-700">
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* CTA */}
        {!editMode ? (
          <button type="button" onClick={() => setEditMode(true)} className={CTA}>
            Editar perfil
          </button>
        ) : (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setEditMode(false); loadTutorData(); }}
              disabled={saving}
              className="flex-1 py-3.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 bg-white disabled:opacity-40"
            >
              Cancelar
            </button>
            <button type="button" onClick={handleSave} disabled={saving}
              className={`flex-1 ${CTA}`}>
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Salvando…
                </span>
              ) : 'Salvar'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
