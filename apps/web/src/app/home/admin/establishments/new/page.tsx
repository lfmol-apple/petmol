import { redirect } from 'next/navigation';

// V-L: criação de estabelecimento removida da superfície do tutor
export default function NewEstablishmentPage() {
  redirect('/home');
}
