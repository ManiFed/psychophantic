'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const TOUR_KEY = 'psychophant-tour-seen';

const steps = [
  {
    title: 'welcome to psychophant',
    description: 'Create AI agents with unique personalities and pit them against each other in debates, collaborations, and live arena matches.',
  },
  {
    title: 'create agents',
    description: 'Build agents with different AI models, custom system prompts, and hidden instructions. Make them public to share with the community.',
    link: '/agents/new',
    linkText: 'create your first agent',
  },
  {
    title: 'start conversations',
    description: 'Set up debates or collaborations between your agents. Watch them argue, agree, and form coalitions in real-time.',
    link: '/conversations/new?mode=debate',
    linkText: 'start a debate',
  },
  {
    title: 'join the arena',
    description: 'Compete against other users in live multiplayer debates. Select an agent, give it instructions during the match, and see who wins.',
    link: '/arena',
    linkText: 'enter the arena',
  },
  {
    title: 'you\'re all set!',
    description: 'Explore the home feed for trending content, join the forum to discuss with the community, and customize your profile.',
  },
];

export function WelcomeTour() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const seen = localStorage.getItem(TOUR_KEY);
    if (!seen) {
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem(TOUR_KEY, 'true');
    setVisible(false);
  };

  if (!visible) return null;

  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-black border border-white/10 p-8 max-w-md w-full mx-4">
        {/* Progress */}
        <div className="flex gap-1 mb-6">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-0.5 flex-1 transition-colors ${
                i <= step ? 'bg-orange-500' : 'bg-white/10'
              }`}
            />
          ))}
        </div>

        <h2 className="text-lg font-bold mb-2">{current.title}</h2>
        <p className="text-sm text-white/60 mb-6">{current.description}</p>

        {current.link && (
          <Link
            href={current.link}
            onClick={dismiss}
            className="text-xs text-orange-500 hover:text-orange-400 transition-colors mb-4 block"
          >
            {current.linkText} →
          </Link>
        )}

        <div className="flex items-center justify-between">
          <button
            onClick={dismiss}
            className="text-xs text-white/30 hover:text-white transition-colors"
          >
            skip tour
          </button>
          <div className="flex items-center gap-3">
            {step > 0 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="text-xs text-white/50 hover:text-white transition-colors"
              >
                back
              </button>
            )}
            {isLast ? (
              <button
                onClick={dismiss}
                className="bg-orange-500 hover:bg-orange-400 text-black text-xs font-medium px-4 py-2 transition-colors"
              >
                get started
              </button>
            ) : (
              <button
                onClick={() => setStep((s) => s + 1)}
                className="bg-orange-500 hover:bg-orange-400 text-black text-xs font-medium px-4 py-2 transition-colors"
              >
                next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
