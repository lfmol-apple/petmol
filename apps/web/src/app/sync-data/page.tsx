import { redirect } from 'next/navigation';

// V-L: ferramenta de sync de dados removida da superfície pública
export default function SyncDataPage() {
  redirect('/home');
}
