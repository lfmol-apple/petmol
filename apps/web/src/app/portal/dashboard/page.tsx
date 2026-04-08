import { redirect } from 'next/navigation';

// V-L: portal de estabelecimentos isolado para V1
export default function PortalDashboardPage() {
  redirect('/home');
}
