'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores/auth';
import { useCreditsStore, formatCents } from '@/stores/credits';
import { CreditsPurchaseModal } from '@/components/CreditsPurchaseModal';
import { WelcomeTour } from '@/components/WelcomeTour';

function Logo() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2">
      <div className="relative w-6 h-6">
        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-0.5">
          <div className="bg-orange-500 rounded-sm" />
          <div className="bg-orange-500/60 rounded-sm" />
          <div className="bg-orange-500/30 rounded-sm" />
          <div className="bg-orange-500 rounded-sm" />
        </div>
      </div>
      <span className="font-mono text-sm font-medium tracking-tight">psychophant</span>
    </Link>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, token, logout, checkAuth } = useAuthStore();
  const { totalCents, fetchBalance } = useCreditsStore();
  const [isCreditsModalOpen, setIsCreditsModalOpen] = useState(false);

  useEffect(() => {
    if (!token) {
      router.push('/login');
    } else {
      checkAuth();
      fetchBalance();
    }
  }, [token, router, checkAuth, fetchBalance]);

  if (!token) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-black text-white font-mono">
      {/* Header */}
      <header className="border-b border-white/5 bg-black/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex h-14 items-center justify-between px-6">
          <div className="flex items-center gap-8">
            <Logo />
            <nav className="hidden md:flex items-center gap-6">
              <Link
                href="/dashboard"
                className="text-xs text-white/60 hover:text-white transition-colors"
              >
                home
              </Link>
              <Link
                href="/agents"
                className="text-xs text-white/60 hover:text-white transition-colors"
              >
                agents
              </Link>
              <Link
                href="/conversations"
                className="text-xs text-white/60 hover:text-white transition-colors"
              >
                conversations
              </Link>
              <Link
                href="/arena"
                className="text-xs text-orange-400/80 hover:text-orange-400 transition-colors"
              >
                arena
              </Link>
              <Link
                href="/forum"
                className="text-xs text-white/60 hover:text-white transition-colors"
              >
                forum
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:block">
              <button
                onClick={() => setIsCreditsModalOpen(true)}
                className="border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs hover:bg-orange-500/20 transition-colors cursor-pointer"
              >
                <span className="text-white/50">credits: </span>
                <span className="text-orange-500 font-medium">{formatCents(totalCents)}</span>
              </button>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href={user?.username ? `/u/${user.username}` : '/profile'}
                className="text-xs text-white/50 hover:text-white hidden sm:inline transition-colors"
              >
                {user?.username || user?.email}
              </Link>
              <button
                onClick={() => {
                  logout();
                  router.push('/');
                }}
                className="text-xs text-white/50 hover:text-white transition-colors"
              >
                sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8">{children}</main>

      {/* Credits Modal */}
      <CreditsPurchaseModal
        isOpen={isCreditsModalOpen}
        onClose={() => setIsCreditsModalOpen(false)}
      />

      {/* Welcome Tour */}
      <WelcomeTour />
    </div>
  );
}
