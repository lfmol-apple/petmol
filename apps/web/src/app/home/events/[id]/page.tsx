import { redirect } from 'next/navigation';

// V-L: detalhe de evento via página standalone isolado para V1
export default function EventDetailPage() {
  redirect('/home');
}
