'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

const TOUR_KEY = 'psychophant-tour-seen';

interface TourStep {
  target: string | null; // data-tour attribute value, null for centered
  title: string;
  description: string;
  link?: string;
  linkText?: string;
}

const steps: TourStep[] = [
  {
    target: null,
    title: 'welcome to psychophant',
    description:
      'Create AI agents with unique personalities and pit them against each other in debates, collaborations, and live arena matches.',
  },
  {
    target: 'agents',
    title: 'create agents',
    description:
      'Build agents with different AI models, custom system prompts, and hidden instructions. Make them public to share with the community.',
    link: '/agents/new',
    linkText: 'create your first agent',
  },
  {
    target: 'conversations',
    title: 'start conversations',
    description:
      'Set up debates or collaborations between your agents. Watch them argue, agree, and form coalitions in real-time.',
    link: '/conversations/new?mode=debate',
    linkText: 'start a debate',
  },
  {
    target: 'arena',
    title: 'join the arena',
    description:
      'Compete against other users in live multiplayer debates. Select an agent, give it instructions during the match, and see who wins.',
    link: '/arena',
    linkText: 'enter the arena',
  },
  {
    target: 'profile',
    title: "you're all set!",
    description:
      'Click your username to view and customize your profile. Explore the home feed for trending content and discover what others are building.',
  },
];

export function WelcomeTour() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [tooltipPos, setTooltipPos] = useState<{
    top: number;
    left: number;
    arrowLeft: number;
  } | null>(null);
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const seen = localStorage.getItem(TOUR_KEY);
    if (!seen) {
      setVisible(true);
    }
  }, []);

  const positionTooltip = useCallback(() => {
    const current = steps[step];
    if (!current.target) {
      setTooltipPos(null);
      setHighlightRect(null);
      return;
    }

    const el = document.querySelector(`[data-tour="${current.target}"]`);
    if (!el) {
      setTooltipPos(null);
      setHighlightRect(null);
      return;
    }

    const rect = el.getBoundingClientRect();
    setHighlightRect(rect);

    const tooltipWidth = 320;
    const centerX = rect.left + rect.width / 2;
    let left = centerX - tooltipWidth / 2;
    left = Math.max(16, Math.min(left, window.innerWidth - tooltipWidth - 16));
    const arrowLeft = Math.max(
      16,
      Math.min(centerX - left, tooltipWidth - 16)
    );

    setTooltipPos({
      top: rect.bottom + 12,
      left,
      arrowLeft,
    });
  }, [step]);

  useEffect(() => {
    if (!visible) return;
    positionTooltip();

    const handleResize = () => positionTooltip();
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
    };
  }, [visible, step, positionTooltip]);

  const dismiss = () => {
    localStorage.setItem(TOUR_KEY, 'true');
    setVisible(false);
  };

  if (!visible) return null;

  const current = steps[step];
  const isLast = step === steps.length - 1;
  const isCentered = !current.target || !tooltipPos;

  return (
    <div className="fixed inset-0 z-[100]" onClick={dismiss}>
      {/* Overlay with cutout for highlighted element */}
      {highlightRect && !isCentered ? (
        <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
          <defs>
            <mask id="tour-mask">
              <rect width="100%" height="100%" fill="white" />
              <rect
                x={highlightRect.left - 4}
                y={highlightRect.top - 4}
                width={highlightRect.width + 8}
                height={highlightRect.height + 8}
                rx="4"
                fill="black"
              />
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="rgba(0,0,0,0.75)"
            mask="url(#tour-mask)"
            style={{ pointerEvents: 'auto' }}
          />
        </svg>
      ) : (
        <div className="absolute inset-0 bg-black/75" />
      )}

      {/* Highlight ring */}
      {highlightRect && !isCentered && (
        <div
          className="absolute border-2 border-orange-500 rounded pointer-events-none"
          style={{
            top: highlightRect.top - 4,
            left: highlightRect.left - 4,
            width: highlightRect.width + 8,
            height: highlightRect.height + 8,
          }}
        />
      )}

      {/* Tooltip */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`absolute bg-black border border-white/10 p-6 w-80 ${
          isCentered
            ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
            : ''
        }`}
        style={
          !isCentered && tooltipPos
            ? { top: tooltipPos.top, left: tooltipPos.left }
            : undefined
        }
      >
        {/* Arrow pointing up to element */}
        {!isCentered && tooltipPos && (
          <div
            className="absolute -top-[6px] w-3 h-3 border-l border-t border-white/10 bg-black rotate-45"
            style={{ left: tooltipPos.arrowLeft - 6 }}
          />
        )}

        {/* Progress */}
        <div className="flex gap-1 mb-4">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-0.5 flex-1 transition-colors ${
                i <= step ? 'bg-orange-500' : 'bg-white/10'
              }`}
            />
          ))}
        </div>

        <h2 className="text-sm font-bold mb-1">{current.title}</h2>
        <p className="text-xs text-white/60 mb-4 leading-relaxed">
          {current.description}
        </p>

        {current.link && (
          <Link
            href={current.link}
            onClick={dismiss}
            className="text-xs text-orange-500 hover:text-orange-400 transition-colors mb-3 block"
          >
            {current.linkText} →
          </Link>
        )}

        <div className="flex items-center justify-between">
          <button
            onClick={dismiss}
            className="text-xs text-white/30 hover:text-white transition-colors"
          >
            skip
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
                className="bg-orange-500 hover:bg-orange-400 text-black text-xs font-medium px-4 py-1.5 transition-colors"
              >
                get started
              </button>
            ) : (
              <button
                onClick={() => setStep((s) => s + 1)}
                className="bg-orange-500 hover:bg-orange-400 text-black text-xs font-medium px-4 py-1.5 transition-colors"
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
