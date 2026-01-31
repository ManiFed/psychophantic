'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useConversationsStore } from '@/stores/conversations';
import { useCreditsStore, formatCents } from '@/stores/credits';
import { useConversationStream } from '@/hooks/useConversationStream';
import { conversationsApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { MessageList } from '@/components/MessageBubble';

export default function ConversationPage() {
  const params = useParams();
  const router = useRouter();
  const conversationId = params.id as string;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  const {
    currentConversation,
    messages,
    participants,
    fetchConversation,
    pauseConversation,
    resumeConversation,
    addInterjection,
    startForceAgreement,
    isLoading,
    error,
  } = useConversationsStore();

  const { totalCents, fetchBalance } = useCreditsStore();

  const { token } = useAuthStore();
  const [interjectionText, setInterjectionText] = useState('');
  const [currentAgentName, setCurrentAgentName] = useState<string | null>(null);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  // Memoize callbacks to prevent unnecessary re-renders
  const handleMessageStart = useCallback((agentId: string, messageId: string) => {
    setStreamingMessageId(messageId);
    // Get participants from store directly to avoid stale closure
    const { participants: currentParticipants } = useConversationsStore.getState();
    const participant = currentParticipants.find((p) => p.agentId === agentId);
    if (participant) {
      setCurrentAgentName(participant.agent.name);
    }
  }, []);

  const handleMessageComplete = useCallback(() => {
    setStreamingMessageId(null);
    setCurrentAgentName(null);
  }, []);

  const handleTurnChange = useCallback((_agentId: string, agentName: string) => {
    setCurrentAgentName(agentName);
  }, []);

  const handleConversationComplete = useCallback(() => {
    useCreditsStore.getState().fetchBalance();
  }, []);

  const handleError = useCallback((code: string, message: string) => {
    console.error(`Error ${code}: ${message}`);
  }, []);

  // Set up streaming - use URL conversationId, not currentConversation.id
  const { isConnected, isWaitingForInput } = useConversationStream({
    conversationId: conversationId,
    onMessageStart: handleMessageStart,
    onMessageComplete: handleMessageComplete,
    onTurnChange: handleTurnChange,
    onConversationComplete: handleConversationComplete,
    onError: handleError,
  });

  // Fetch conversation on mount
  useEffect(() => {
    fetchConversation(conversationId);
    fetchBalance();
  }, [conversationId, fetchConversation, fetchBalance]);

  // Track if user is scrolled near the bottom
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const threshold = 100;
    isNearBottomRef.current =
      container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  }, []);

  // Auto-scroll only if user is near the bottom
  useEffect(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handlePause = async () => {
    try {
      await pauseConversation(conversationId);
    } catch (err) {
      console.error('Failed to pause:', err);
    }
  };

  const handleResume = async () => {
    try {
      await resumeConversation(conversationId);
    } catch (err) {
      console.error('Failed to resume:', err);
    }
  };

  const handleInterject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!interjectionText.trim()) return;

    try {
      await addInterjection(conversationId, interjectionText.trim());
      setInterjectionText('');
    } catch (err) {
      console.error('Failed to interject:', err);
    }
  };

  if (isLoading && !currentConversation) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-white/50">loading conversation...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto space-y-8">
        <Link
          href="/conversations"
          className="text-xs text-white/50 hover:text-white/70 transition-colors"
        >
          &larr; back to conversations
        </Link>
        <div className="border border-red-500/50 bg-red-500/10 p-8 text-center">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!currentConversation) {
    return (
      <div className="max-w-2xl mx-auto space-y-8">
        <Link
          href="/conversations"
          className="text-xs text-white/50 hover:text-white/70 transition-colors"
        >
          &larr; back to conversations
        </Link>
        <div className="border border-white/10 p-8 text-center">
          <p className="text-sm text-white/50">conversation not found</p>
        </div>
      </div>
    );
  }

  const isActive = currentConversation.status === 'active';
  const isPaused = currentConversation.status === 'paused';
  const isCompleted = currentConversation.status === 'completed';

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex-shrink-0 pb-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <Link
            href="/conversations"
            className="text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            &larr; back
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                if (shareUrl) {
                  navigator.clipboard.writeText(shareUrl);
                  setShareCopied(true);
                  setTimeout(() => setShareCopied(false), 2000);
                  return;
                }
                if (!token) return;
                try {
                  const result = await conversationsApi.createShareLink(token, conversationId);
                  setShareUrl(result.shareUrl);
                  navigator.clipboard.writeText(result.shareUrl);
                  setShareCopied(true);
                  setTimeout(() => setShareCopied(false), 2000);
                } catch {
                  // ignore
                }
              }}
              className="px-2.5 py-1 text-[10px] border border-white/10 text-white/50 hover:text-white hover:border-white/30 transition-colors"
            >
              {shareCopied ? 'copied!' : shareUrl ? 'copy link' : 'share'}
            </button>
            <div className="flex items-center gap-1.5 px-2.5 py-1 border border-white/10 bg-white/5">
              <span className="text-[10px] text-white/40">spent</span>
              <span className="text-xs font-medium">
                ${(currentConversation.totalCostCents / 100).toFixed(2)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 border border-orange-500/20 bg-orange-500/5">
              <span className="text-[10px] text-white/40">balance</span>
              <span className="text-xs font-medium text-orange-500">{formatCents(totalCents)}</span>
            </div>
          </div>
        </div>

        <h1 className="text-lg font-bold">
          {currentConversation.title || 'Untitled Conversation'}
        </h1>

        <div className="flex items-center gap-3 mt-2">
          <span className="text-[10px] px-2 py-0.5 border border-white/20 uppercase tracking-wider text-white/60">
            {currentConversation.mode}
          </span>
          {currentConversation.mode === 'debate' && currentConversation.totalRounds && (
            <span className="text-xs text-white/40">
              Round {currentConversation.currentRound}/{currentConversation.totalRounds}
            </span>
          )}
          <span
            className={`text-xs flex items-center gap-1.5 ${
              isActive
                ? 'text-green-400'
                : isWaitingForInput
                ? 'text-orange-400'
                : isPaused
                ? 'text-yellow-400'
                : isCompleted
                ? 'text-white/40'
                : 'text-white/50'
            }`}
          >
            {isConnected && isActive && !isWaitingForInput && (
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            )}
            {isWaitingForInput && (
              <span className="w-1.5 h-1.5 bg-orange-500 rounded-full" />
            )}
            {isWaitingForInput ? 'your turn' : currentConversation.status}
          </span>
        </div>

        {/* Participants bar */}
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/[0.06]">
          {participants.map((participant, index) => (
            <div key={participant.id} className="flex items-center gap-1.5">
              <div
                className="w-6 h-6 flex items-center justify-center text-[10px] font-bold rounded-full flex-shrink-0"
                style={{ backgroundColor: participant.agent.avatarColor }}
                title={participant.agent.name}
              >
                <span className="text-black/80">{participant.agent.name.charAt(0).toUpperCase()}</span>
              </div>
              <span className="text-xs text-white/60">{participant.agent.name}</span>
              {index < participants.length - 1 && (
                <span className="text-white/20 mx-1 text-xs">→</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto pr-2 -mx-2 px-2">
        <MessageList
          messages={messages}
          participants={participants}
          streamingMessageId={streamingMessageId}
        />
        <div ref={messagesEndRef} />
      </div>

      {/* Status bar */}
      {currentAgentName && isActive && !isWaitingForInput && (
        <div className="flex-shrink-0 py-2.5 text-xs text-white/50 border-t border-white/[0.06] mt-2">
          <span className="animate-pulse flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
            {currentAgentName} is typing...
          </span>
        </div>
      )}
      {isWaitingForInput && (
        <div className="flex-shrink-0 py-2.5 text-xs border-t border-orange-500/20 mt-2 bg-orange-500/5 -mx-6 px-6">
          <span className="text-orange-400 flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-orange-500 rounded-full" />
            round complete — send a message or click resume to continue
          </span>
        </div>
      )}

      {/* Controls */}
      <div className="flex-shrink-0 pt-4 mt-2 border-t border-white/[0.06]">
        {isCompleted ? (
          <div className="text-center py-6 border border-white/[0.06] bg-white/[0.02]">
            <p className="text-sm text-white/50">conversation completed</p>
            <p className="text-xs text-white/30 mt-1">
              Total cost: ${(currentConversation.totalCostCents / 100).toFixed(2)}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Interjection Form */}
            <form onSubmit={handleInterject} className="flex gap-2">
              <input
                type="text"
                value={interjectionText}
                onChange={(e) => setInterjectionText(e.target.value)}
                placeholder={isWaitingForInput ? "Type your response to continue..." : "Add your input to the conversation..."}
                maxLength={5000}
                disabled={isCompleted}
                className={`flex-1 bg-white/5 border px-4 py-2.5 text-sm placeholder:text-white/30 focus:outline-none transition-colors disabled:opacity-50 ${
                  isWaitingForInput
                    ? 'border-orange-500/30 focus:border-orange-500/50'
                    : 'border-white/10 focus:border-orange-500/50'
                }`}
              />
              <button
                type="submit"
                disabled={!interjectionText.trim() || isCompleted}
                className="bg-orange-500 text-black px-5 py-2.5 text-sm font-medium hover:bg-orange-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                send
              </button>
            </form>

            {/* Control Buttons */}
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {isActive && !isWaitingForInput && (
                  <button
                    onClick={handlePause}
                    className="px-3 py-1.5 text-xs border border-white/10 text-white/50 hover:border-white/30 hover:text-white/70 transition-colors"
                  >
                    pause
                  </button>
                )}
                {isPaused && (
                  <button
                    onClick={handleResume}
                    className="px-4 py-1.5 text-xs font-medium bg-orange-500 text-black hover:bg-orange-400 transition-colors"
                  >
                    ▶ resume
                  </button>
                )}
              </div>
              {currentConversation.mode === 'collaborate' && !isCompleted && currentConversation.status !== 'force_agreement' && (
                <button
                  className="px-3 py-1.5 text-xs border border-purple-500/30 text-purple-400 hover:bg-purple-500/10 transition-colors"
                  onClick={async () => {
                    try {
                      await startForceAgreement(conversationId);
                    } catch (err) {
                      console.error('Failed to start force agreement:', err);
                    }
                  }}
                >
                  force agreement
                </button>
              )}
              {currentConversation.status === 'force_agreement' && (
                <span className="px-3 py-1.5 text-xs text-purple-400">
                  force agreement in progress...
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
