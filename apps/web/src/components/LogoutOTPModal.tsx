'use client';

import React, { useState, useRef, useEffect } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

interface LogoutOTPModalProps {
  /** Masked email shown to user, e.g. l***@gmail.com */
  maskedPhone: string;
  /** Dev-only: code exposed when SMTP not configured */
  testCode?: string;
  /** Subtitle below the title, default 'Confirmação de logout' */
  subtitle?: string;
  /** Label on the confirm button, default '✅ Confirmar Logout' */
  confirmLabel?: string;
  onConfirm: (code: string) => Promise<void>;
  onCancel: () => void;
  onResend: () => void;
}

export function LogoutOTPModal({ maskedPhone, testCode, subtitle, confirmLabel, onConfirm, onCancel, onResend }: LogoutOTPModalProps) {
  const [digits, setDigits] = useState<string[]>(
    testCode ? testCode.split('').slice(0, 6) : Array(6).fill('')
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(60);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Countdown timer for resend
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const code = digits.join('');

  const handleDigitChange = (index: number, value: string) => {
    const val = value.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = val;
    setDigits(next);
    setError('');
    // Auto-advance
    if (val && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    const next = Array(6).fill('');
    pasted.split('').forEach((c, i) => { next[i] = c; });
    setDigits(next);
    inputRefs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length < 6) { setError('Digite os 6 dígitos.'); return; }
    setLoading(true);
    setError('');
    try {
      await onConfirm(code);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Código inválido. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = () => {
    if (resendCooldown > 0) return;
    setDigits(Array(6).fill(''));
    setError('');
    setResendCooldown(60);
    onResend();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-[200]">
      <div className="bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0056D2] to-indigo-600 p-5 text-white text-center">
          <div className="text-4xl mb-2">🔐</div>
          <h2 className="text-xl font-bold">Verificação em 2 Etapas</h2>
          <p className="text-sm text-blue-100 mt-1">{subtitle ?? 'Confirmação de logout'}</p>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          <p className="text-sm text-gray-600 text-center">
            Enviamos um código para o e-mail{' '}
            <span className="font-bold text-gray-900">{maskedPhone}</span>
          </p>

          {testCode && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 text-center">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Modo Dev — E-mail não enviado</p>
              <p className="text-sm text-amber-800">Código de teste: <span className="font-mono font-bold tracking-widest text-base">{testCode}</span></p>
            </div>
          )}

          {/* 6-digit input */}
          <div className="flex gap-2 justify-center" onPaste={handlePaste}>
            {digits.map((digit, i) => (
              <input
                key={i}
                ref={el => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                pattern="\d*"
                maxLength={1}
                value={digit}
                onChange={e => handleDigitChange(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                autoFocus={i === 0}
                className={`w-11 h-13 text-center text-xl font-bold border-2 rounded-xl
                  focus:outline-none focus:ring-2 transition-colors
                  ${error
                    ? 'border-red-400 focus:ring-red-300 bg-red-50'
                    : digit
                      ? 'border-[#0056D2] bg-blue-50 focus:ring-blue-300'
                      : 'border-gray-300 focus:ring-blue-300'
                  }`}
              />
            ))}
          </div>

          {error && (
            <p className="text-sm text-red-600 text-center font-medium">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || code.length < 6}
            className="w-full py-3 bg-[#0056D2] hover:bg-[#0047ad] disabled:bg-gray-300 text-white font-bold rounded-xl transition-colors"
          >
            {loading ? '⏳ Verificando...' : (confirmLabel ?? '✅ Confirmar Logout')}
          </button>

          {/* Resend + Cancel */}
          <div className="flex justify-between text-sm">
            <button
              type="button"
              onClick={onCancel}
              className="text-gray-500 hover:text-gray-700 font-medium"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleResend}
              disabled={resendCooldown > 0}
              className={`font-medium ${resendCooldown > 0 ? 'text-gray-400' : 'text-[#0056D2] hover:underline'}`}
            >
              {resendCooldown > 0 ? `Reenviar (${resendCooldown}s)` : 'Reenviar código'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
