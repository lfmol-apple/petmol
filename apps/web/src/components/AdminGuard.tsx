'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAdmin } from '@/hooks/useAdmin';
import { useAuth } from '@/contexts/AuthContext';

interface AdminGuardProps {
  children: React.ReactNode;
  requiredRole?: string; // Se especificado, verifica role específica
}

export function AdminGuard({ children, requiredRole }: AdminGuardProps) {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { isAdmin, adminData, isLoading: adminLoading } = useAdmin();

  useEffect(() => {
    // Aguardar carregamento
    if (authLoading || adminLoading) {
      return;
    }

    // Não autenticado → redirecionar para login
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }

    // Não é admin → redirecionar para home
    if (!isAdmin) {
      router.replace('/home');
      return;
    }

    // Se requiredRole especificado, verificar
    if (requiredRole && adminData && adminData.role !== requiredRole) {
      router.replace('/home');
      return;
    }
  }, [isAuthenticated, isAdmin, adminData, authLoading, adminLoading, requiredRole, router]);

  // Loading state
  if (authLoading || adminLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Verificando permissões...</p>
        </div>
      </div>
    );
  }

  // Não autorizado
  if (!isAuthenticated || !isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">Acesso negado</p>
          <button
            onClick={() => router.push('/home')}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-[#0056D2]"
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  // Autorizado
  return <>{children}</>;
}
