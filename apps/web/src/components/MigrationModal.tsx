'use client';

import { useState } from 'react';
import { migratePetsToDatabase, type MigrationResult } from '@/lib/migration';
import { X, Upload, CheckCircle, AlertCircle } from 'lucide-react';

interface MigrationModalProps {
  onClose: () => void;
  onComplete: () => void;
}

export function MigrationModal({ onClose, onComplete }: MigrationModalProps) {
  const [step, setStep] = useState<'form' | 'migrating' | 'success' | 'error'>('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<MigrationResult | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('As senhas não coincidem');
      return;
    }

    if (password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres');
      return;
    }

    setStep('migrating');

    try {
      const migrationResult = await migratePetsToDatabase(name, email, password, phone);
      
      setResult(migrationResult);
      
      if (migrationResult.success) {
        setStep('success');
        setTimeout(() => {
          onComplete();
        }, 2000);
      } else {
        setStep('error');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
      setStep('error');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 max-w-md w-full p-6 relative overflow-hidden">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <X className="w-5 h-5" />
        </button>

        {step === 'form' && (
          <>
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-3">
                <Upload className="w-8 h-8 text-blue-500" />
                <h2 className="text-2xl font-bold">Salvar no Banco</h2>
              </div>
              <p className="text-gray-600">
                Crie sua conta para salvar seus pets com segurança em nosso banco de dados.
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome completo
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] focus:border-transparent"
                  placeholder="Seu nome"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] focus:border-transparent"
                  placeholder="seu@email.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Telefone (opcional)
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] focus:border-transparent"
                  placeholder="(11) 99999-9999"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Senha
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] focus:border-transparent"
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confirmar senha
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056D2] focus:border-transparent"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-blue-500 hover:bg-[#0056D2] text-white font-medium py-3 rounded-lg transition-colors"
              >
                Migrar Dados
              </button>
            </form>
          </>
        )}

        {step === 'migrating' && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <h3 className="text-xl font-semibold mb-2">Migrando dados...</h3>
            <p className="text-gray-600">Salvando seus pets no banco de dados</p>
          </div>
        )}

        {step === 'success' && (
          <div className="text-center py-8">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Migração concluída!</h3>
            <p className="text-gray-600 mb-2">
              {result?.petsCreated} pet(s) migrado(s) com sucesso
            </p>
            <p className="text-sm text-gray-500">Redirecionando...</p>
          </div>
        )}

        {step === 'error' && (
          <div className="text-center py-8">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Erro na migração</h3>
            <p className="text-gray-600 mb-4">
              {result?.errors?.[0] || 'Ocorreu um erro ao migrar os dados'}
            </p>
            <button
              onClick={() => setStep('form')}
              className="px-6 py-2 bg-blue-500 hover:bg-[#0056D2] text-white rounded-lg"
            >
              Tentar novamente
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
