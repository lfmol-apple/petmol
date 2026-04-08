import { redirect } from 'next/navigation';

// V-L: página de versão interna removida da superfície pública
export default function VersionPage() {
  redirect('/home');
}
