'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCreditsStore, formatCents } from '@/stores/credits';
import { creditsApi, CreditTransaction } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { CreditsPurchaseModal } from '@/components/CreditsPurchaseModal';

export default function CreditsPage() {
  const { totalCents, freeCents, purchasedCents, fetchBalance, isLoading: balanceLoading } =
    useCreditsStore();
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);

  useEffect(() => {
    fetchBalance();
    loadTransactions();
  }, [fetchBalance]);

  const loadTransactions = async () => {
    const token = useAuthStore.getState().token;
    if (!token) return;

    try {
      const res = await creditsApi.transactions(token);
      setTransactions(res.transactions);
    } catch (err) {
      console.error('Failed to load transactions:', err);
    } finally {
      setTxLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">credits</h1>
          <p className="mt-1 text-xs text-white/50">
            manage your credit balance and view transaction history.
          </p>
        </div>
        <button
          onClick={() => setShowPurchaseModal(true)}
          className="bg-orange-500 text-black px-4 py-2 text-sm font-medium hover:bg-orange-400 transition-colors"
        >
          buy credits
        </button>
      </div>

      {/* Balance Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="border border-orange-500/30 bg-orange-500/5 p-6">
          <p className="text-xs text-white/50">total balance</p>
          <p className="mt-2 text-3xl font-bold text-orange-500">
            {balanceLoading ? '—' : formatCents(totalCents)}
          </p>
        </div>
        <div className="border border-white/10 bg-white/5 p-6">
          <p className="text-xs text-white/50">free credits</p>
          <p className="mt-2 text-2xl font-bold">
            {balanceLoading ? '—' : formatCents(freeCents)}
          </p>
          <p className="mt-1 text-xs text-white/30">resets daily</p>
        </div>
        <div className="border border-white/10 bg-white/5 p-6">
          <p className="text-xs text-white/50">purchased credits</p>
          <p className="mt-2 text-2xl font-bold">
            {balanceLoading ? '—' : formatCents(purchasedCents)}
          </p>
          <p className="mt-1 text-xs text-white/30">never expires</p>
        </div>
      </div>

      {/* Transaction History */}
      <div>
        <h2 className="text-sm font-medium mb-4">transaction history</h2>
        <div className="border border-white/10">
          {txLoading ? (
            <div className="p-8 text-center">
              <p className="text-xs text-white/50">loading transactions...</p>
            </div>
          ) : transactions.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-xs text-white/50">no transactions yet.</p>
              <p className="mt-2 text-xs text-white/30">
                start a conversation to see your usage history.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {/* Header row */}
              <div className="grid grid-cols-4 gap-4 p-3 text-xs text-white/50 bg-white/5">
                <span>date</span>
                <span>type</span>
                <span>description</span>
                <span className="text-right">amount</span>
              </div>
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="grid grid-cols-4 gap-4 p-3 text-sm hover:bg-white/5 transition-colors"
                >
                  <span className="text-xs text-white/50">
                    {formatDate(tx.createdAt)}
                  </span>
                  <span className="text-xs">
                    <span
                      className={`px-2 py-0.5 border ${
                        tx.transactionType === 'usage'
                          ? 'border-white/20 text-white/70'
                          : tx.transactionType === 'purchase'
                          ? 'border-green-500/30 text-green-400'
                          : 'border-blue-500/30 text-blue-400'
                      }`}
                    >
                      {tx.transactionType}
                    </span>
                  </span>
                  <span className="text-xs text-white/70 truncate">
                    {tx.description || '—'}
                  </span>
                  <span
                    className={`text-xs text-right font-medium ${
                      tx.amountCents < 0 ? 'text-red-400' : 'text-green-400'
                    }`}
                  >
                    {tx.amountCents < 0 ? '-' : '+'}
                    {formatCents(Math.abs(tx.amountCents))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Purchase Modal */}
      <CreditsPurchaseModal
        isOpen={showPurchaseModal}
        onClose={() => {
          setShowPurchaseModal(false);
          fetchBalance();
          loadTransactions();
        }}
      />
    </div>
  );
}
