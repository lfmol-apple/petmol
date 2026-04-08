'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Redirect automático de /auth/login para /login
 * A página principal de login agora é /login (design moderno)
 */
export default function AuthLoginRedirect() {
  const router = useRouter();
  
  useEffect(() => {
    // Preservar query params se houver (ex: ?next=/home)
    const params = new URLSearchParams(window.location.search);
    const targetUrl = params.toString() ? `/login?${params.toString()}` : '/login';
    router.replace(targetUrl);
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-400 via-blue-500 to-[#0056D2]">
      <div className="text-white text-center">
        <div className="text-6xl mb-4">🐾</div>
        <p className="text-xl">Redirecionando...</p>
      </div>
    </div>
  );
}
