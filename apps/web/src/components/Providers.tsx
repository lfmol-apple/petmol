'use client';

/**
 * QueryClient Provider
 * Wrapper do TanStack Query para todo o app
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from '@/lib/queryClient';
import { ReactNode, useEffect, useState } from 'react';
import { setupNetworkListeners } from '@/lib/syncManager';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  const [isOnline, setIsOnline] = useState(true);
  
  useEffect(() => {
    // Setup network listeners
    setIsOnline(navigator.onLine);
    
    const cleanup = setupNetworkListeners(
      () => {
        setIsOnline(true);
        console.log('🌐 Online - sincronização ativada');
        // Invalida queries para tentar refetch
        queryClient.invalidateQueries();
      },
      () => {
        setIsOnline(false);
        console.log('📡 Offline - modo local');
      }
    );
    
    return cleanup;
  }, []);
  
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* DevTools apenas em desenvolvimento */}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools 
          initialIsOpen={false}
        />
      )}
      
      {/* Indicador de status de rede */}
      {!isOnline && (
        <div className="fixed bottom-4 left-4 bg-amber-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 z-50">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
          </svg>
          <span className="text-sm font-medium">Modo Offline</span>
        </div>
      )}
    </QueryClientProvider>
  );
}
