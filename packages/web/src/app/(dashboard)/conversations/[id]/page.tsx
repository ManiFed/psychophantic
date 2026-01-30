'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useConversationsStore } from '@/stores/conversations';
import { useCreditsStore, formatCents } from '@/stores/credits';
import { useConversationStream } from '@/hooks/useConversationStream';
import { MessageList } from '@/components/MessageBubble';

export default function ConversationPage() {
  const params = useParams();
  const router = useRouter();
  const conversationId = params.id as string;

  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  const [interjectionText, setInterjectionText] = useState('');
  const [currentAgentName, setCurrentAgentName] = useState<string | null>(null);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);

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

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
      <div className="flex-shrink-0 border-b border-white/10 pb-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <Link
              href="/conversations"
              className="text-xs text-white/50 hover:text-white/70 transition-colors"
            >
              &larr; back to conversations
            </Link>
            <h1 className="text-xl font-bold mt-2">
              {currentConversation.title || 'Untitled Conversation'}
            </h1>
            <div className="flex items-center gap-4 mt-1 text-xs text-white/50">
              <span className="uppercase">{currentConversation.mode}</span>
              {currentConversation.mode === 'debate' && currentConversation.totalRounds && (
                <span>
                  Round {currentConversation.currentRound}/{currentConversation.totalRounds}
                </span>
              )}
              <span
                className={
                  isActive
                    ? 'text-green-400'
                    : isPaused
                    ? 'text-yellow-400'
                    : 'text-white/50'
                }
              >
                {currentConversation.status}
              </span>
              {isConnected && isActive && !isWaitingForInput && (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  streaming
                </span>
              )}
              {isWaitingForInput && isActive && (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-orange-500 rounded-full" />
                  waiting for input
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-white/50">spent</p>
              <p className="text-sm font-medium">
                ${(currentConversation.totalCostCents / 100).toFixed(2)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-white/50">balance</p>
              <p className="text-sm font-medium text-orange-500">{formatCents(totalCents)}</p>
            </div>
          </div>
        </div>

        {/* Participants */}
        <div className="flex items-center gap-2 mt-4">
          {participants.map((participant, index) => (
            <div key={participant.id} className="flex items-center">
              <div
                className="w-6 h-6 flex items-center justify-center text-xs font-bold"
                style={{ backgroundColor: participant.agent.avatarColor }}
                title={participant.agent.name}
              >
                {participant.agent.name.charAt(0).toUpperCase()}
              </div>
              <span className="text-xs ml-1">{participant.agent.name}</span>
              {index < participants.length - 1 && <span className="text-white/30 mx-2">→</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto pr-2">
        <MessageList
          messages={messages}
          participants={participants}
          streamingMessageId={streamingMessageId}
        />
        <div ref={messagesEndRef} />
      </div>

      {/* Status bar */}
      {currentAgentName && isActive && !isWaitingForInput && (
        <div className="flex-shrink-0 py-2 text-xs text-white/50 border-t border-white/10 mt-2">
          <span className="animate-pulse">{currentAgentName} is typing...</span>
        </div>
      )}
      {isWaitingForInput && isActive && (
        <div className="flex-shrink-0 py-2 text-xs text-orange-400 border-t border-orange-500/30 mt-2">
          round complete — send a message to continue the conversation
        </div>
      )}

      {/* Controls */}
      <div className="flex-shrink-0 border-t border-white/10 pt-4 mt-2">
        {isCompleted ? (
          <div className="text-center py-4">
            <p className="text-sm text-white/50">conversation completed</p>
            <p className="text-xs text-white/30 mt-1">
              Total cost: ${(currentConversation.totalCostCents / 100).toFixed(2)}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Interjection Form */}
            <form onSubmit={handleInterject} className="flex gap-2">
              <input
                type="text"
                value={interjectionText}
                onChange={(e) => setInterjectionText(e.target.value)}
                placeholder="Add your input to the conversation..."
                maxLength={5000}
                disabled={isCompleted}
                className="flex-1 bg-white/5 border border-white/10 px-4 py-2 text-sm placeholder:text-white/30 focus:outline-none focus:border-orange-500/50 transition-colors disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!interjectionText.trim() || isCompleted}
                className="bg-white/10 text-white px-4 py-2 text-sm hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                send
              </button>
            </form>

            {/* Control Buttons */}
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {isActive && (
                  <button
                    onClick={handlePause}
                    className="px-4 py-2 text-sm border border-white/10 hover:border-white/30 transition-colors"
                  >
                    pause
                  </button>
                )}
                {isPaused && (
                  <button
                    onClick={handleResume}
                    className="px-4 py-2 text-sm bg-orange-500 text-black hover:bg-orange-400 transition-colors"
                  >
                    resume
                  </button>
                )}
              </div>
              {currentConversation.mode === 'collaborate' && !isCompleted && currentConversation.status !== 'force_agreement' && (
                <button
                  className="px-4 py-2 text-sm border border-purple-500/50 text-purple-400 hover:bg-purple-500/10 transition-colors"
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
                <span className="px-4 py-2 text-sm text-purple-400">
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
