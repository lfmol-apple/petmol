import { redirect } from 'next/navigation';

// V-L: lista de estabelecimentos removida da superfície do tutor
export default function AdminEstablishmentsPage() {
  redirect('/home');
}
