/**
 * TanStack Query Configuration
 * Configuração centralizada com persistência em localStorage
 */

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache por 10 minutos
      staleTime: 10 * 60 * 1000,
      // Dados em cache por 30 minutos
      gcTime: 30 * 60 * 1000,
      // Refetch quando janela recebe foco
      refetchOnWindowFocus: true,
      // Retry 3 vezes em caso de erro
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: 1,
    },
  },
});
