import { redirect } from 'next/navigation';

// V-L: emergency-new é duplicação de /emergency
export default function EmergencyNewPage() {
  redirect('/emergency');
}
