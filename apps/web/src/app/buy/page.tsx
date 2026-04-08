import { redirect } from 'next/navigation';

// V-L: busca de produtos isolada para V1 — recompra tratada via FoodItemSheet na Home
export default function BuyPage() {
  redirect('/home');
}
