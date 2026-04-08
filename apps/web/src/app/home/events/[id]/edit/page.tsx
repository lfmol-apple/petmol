import { redirect } from 'next/navigation';

// V-L: edição de evento via página standalone isolada para V1
export default function EditEventPage() {
  redirect('/home');
}
