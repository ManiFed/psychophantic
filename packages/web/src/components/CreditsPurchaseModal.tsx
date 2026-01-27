'use client';

import { useState } from 'react';
import { useCreditsStore, formatCents } from '@/stores/credits';

interface CreditPackage {
  id: string;
  name: string;
  priceCents: number;
  creditsCents: number;
  bonus: number;
}

const CREDIT_PACKAGES: CreditPackage[] = [
  { id: 'pack_100', name: 'Starter', priceCents: 100, creditsCents: 100, bonus: 0 },
  { id: 'pack_500', name: 'Basic', priceCents: 500, creditsCents: 550, bonus: 10 },
  { id: 'pack_2000', name: 'Pro', priceCents: 2000, creditsCents: 2400, bonus: 20 },
  { id: 'pack_5000', name: 'Power', priceCents: 5000, creditsCents: 6500, bonus: 30 },
];

interface CreditsPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreditsPurchaseModal({ isOpen, onClose }: CreditsPurchaseModalProps) {
  const { freeCents, purchasedCents, totalCents, lastFreeReset } = useCreditsStore();
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handlePurchase = async () => {
    if (!selectedPackage) return;

    setIsProcessing(true);
    // TODO: Integrate with Stripe
    alert('Stripe integration coming soon! For now, you get free daily credits.');
    setIsProcessing(false);
    setSelectedPackage(null);
  };

  const formatResetTime = () => {
    if (!lastFreeReset) return 'Unknown';
    const resetDate = new Date(lastFreeReset);
    const nextReset = new Date(resetDate);
    nextReset.setUTCDate(nextReset.getUTCDate() + 1);
    nextReset.setUTCHours(0, 0, 0, 0);

    const now = new Date();
    const hoursUntilReset = Math.max(0, Math.floor((nextReset.getTime() - now.getTime()) / (1000 * 60 * 60)));
    const minutesUntilReset = Math.max(0, Math.floor(((nextReset.getTime() - now.getTime()) % (1000 * 60 * 60)) / (1000 * 60)));

    return `${hoursUntilReset}h ${minutesUntilReset}m`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-black border border-white/20 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="border-b border-white/10 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">credits</h2>
            <button
              onClick={onClose}
              className="text-white/50 hover:text-white transition-colors text-2xl leading-none"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Current Balance */}
        <div className="p-6 border-b border-white/10">
          <div className="text-center">
            <p className="text-xs text-white/50 uppercase tracking-wider mb-2">current balance</p>
            <p className="text-4xl font-bold text-orange-500">{formatCents(totalCents)}</p>
            <div className="flex justify-center gap-6 mt-4 text-sm">
              <div>
                <span className="text-white/50">free: </span>
                <span className="text-green-400">{formatCents(freeCents)}</span>
              </div>
              <div>
                <span className="text-white/50">purchased: </span>
                <span>{formatCents(purchasedCents)}</span>
              </div>
            </div>
            <p className="text-xs text-white/30 mt-3">
              free credits reset in {formatResetTime()}
            </p>
          </div>
        </div>

        {/* Packages */}
        <div className="p-6">
          <p className="text-xs text-white/50 uppercase tracking-wider mb-4">buy credits</p>
          <div className="grid grid-cols-2 gap-3">
            {CREDIT_PACKAGES.map((pkg) => (
              <button
                key={pkg.id}
                onClick={() => setSelectedPackage(pkg.id)}
                className={`p-4 border transition-all text-left ${
                  selectedPackage === pkg.id
                    ? 'border-orange-500 bg-orange-500/10'
                    : 'border-white/10 hover:border-white/30'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{pkg.name}</span>
                  {pkg.bonus > 0 && (
                    <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5">
                      +{pkg.bonus}%
                    </span>
                  )}
                </div>
                <p className="text-2xl font-bold">{formatCents(pkg.priceCents)}</p>
                <p className="text-xs text-white/50 mt-1">
                  get {formatCents(pkg.creditsCents)} credits
                </p>
              </button>
            ))}
          </div>

          {/* Purchase Button */}
          <button
            onClick={handlePurchase}
            disabled={!selectedPackage || isProcessing}
            className="w-full mt-6 bg-orange-500 text-black py-3 font-medium hover:bg-orange-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isProcessing ? 'processing...' : selectedPackage ? 'purchase credits' : 'select a package'}
          </button>

          <p className="text-xs text-white/30 text-center mt-4">
            secure payment powered by Stripe
          </p>
        </div>

        {/* Info */}
        <div className="p-6 border-t border-white/10 bg-white/5">
          <p className="text-xs text-white/50 leading-relaxed">
            credits are used for AI message generation. costs vary by model -
            cheaper models like GPT-4o-mini cost fractions of a cent per message,
            while premium models like Claude Opus cost more. you get 10 cents of
            free credits daily.
          </p>
        </div>
      </div>
    </div>
  );
}
