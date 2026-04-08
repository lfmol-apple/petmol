'use client';

// V-L: /saude/[petId] redirecionado para /home — página legada encerrada
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SaudePetPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/home'); }, [router]);
  return null;
}
