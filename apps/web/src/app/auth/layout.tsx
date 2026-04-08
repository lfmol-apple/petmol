import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'PETMOL - Access',
  description: 'Login and signup on PETMOL',
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {children}
      </div>
    </div>
  );
}
