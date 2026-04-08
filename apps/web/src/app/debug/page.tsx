import { redirect } from 'next/navigation';

// V-L: debug removido de produção
export default function DebugPage() {
  redirect('/home');
}
