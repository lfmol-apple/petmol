import { redirect } from 'next/navigation';

// V-L: painel admin removido da superfície do tutor
export default function AdminPage() {
  redirect('/home');
}
