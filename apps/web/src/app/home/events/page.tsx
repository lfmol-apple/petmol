import { redirect } from 'next/navigation';

// V-L: eventos gerenciados via modais no /home; página standalone isolada para V1
export default function EventsPage() {
  redirect('/home');
}
