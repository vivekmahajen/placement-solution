import Link from 'next/link';
import { Heart } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-teal-50 flex flex-col">
      {/* Header */}
      <header className="px-6 py-4">
        <Link href="/" className="inline-flex items-center gap-2 text-blue-700 font-bold text-xl">
          <Heart className="w-6 h-6 text-teal-600" />
          CareConnect
        </Link>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-8">
            {children}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-4 text-center text-sm text-slate-500">
        &copy; {new Date().getFullYear()} CareConnect. All rights reserved.
      </footer>
    </div>
  );
}
