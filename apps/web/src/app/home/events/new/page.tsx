import { redirect } from 'next/navigation';

// V-L: criação de evento via página standalone isolada para V1
export default function NewEventPage() {
  redirect('/home');
}
