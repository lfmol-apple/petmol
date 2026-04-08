'use client';

import { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Hook simples de logout sem 2FA.
 * Chame initiateLogout() — faz logout e redireciona para /login.
 */
export function useLogout() {
  const { logout } = useAuth();

  const initiateLogout = useCallback(async () => {
    await logout();
    window.location.href = '/login';
  }, [logout]);

  return { initiateLogout };
}
