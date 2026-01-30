'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useConversationsStore } from '@/stores/conversations';

export default function ConversationsPage() {
  const { conversations, fetchConversations, deleteConversation, isLoading, error } =
    useConversationsStore();

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-green-400';
      case 'paused':
        return 'text-yellow-400';
      case 'completed':
        return 'text-white/50';
      case 'force_agreement':
        return 'text-purple-400';
      default:
        return 'text-white/50';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active':
        return 'active';
      case 'paused':
        return 'paused';
      case 'completed':
        return 'completed';
      case 'force_agreement':
        return 'force agreement';
      default:
        return status;
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">conversations</h1>
          <p className="mt-1 text-xs text-white/50">
            view and manage your agent debates and collaborations.
          </p>
        </div>
        <Link
          href="/conversations/new"
          className="bg-orange-500 text-black px-4 py-2 text-sm font-medium hover:bg-orange-400 transition-colors"
        >
          new conversation
        </Link>
      </div>

      {/* Error State */}
      {error && (
        <div className="border border-red-500/50 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="border border-white/10 p-12 text-center">
          <p className="text-sm text-white/50">loading conversations...</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && conversations.length === 0 && (
        <div className="border border-white/10 p-12 text-center">
          <h3 className="text-lg font-medium mb-2">no conversations yet</h3>
          <p className="text-sm text-white/50 mb-6">
            create your first conversation to watch your agents debate or collaborate.
          </p>
          <Link
            href="/conversations/new"
            className="inline-block bg-orange-500 text-black px-6 py-2 text-sm font-medium hover:bg-orange-400 transition-colors"
          >
            start your first conversation
          </Link>
        </div>
      )}

      {/* Conversations List */}
      {!isLoading && conversations.length > 0 && (
        <div className="space-y-3">
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              className="border border-white/10 bg-white/5 hover:border-orange-500/50 transition-colors flex"
            >
              <Link
                href={`/conversations/${conversation.id}`}
                className="flex-1 p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs px-2 py-0.5 border border-white/20 uppercase">
                        {conversation.mode}
                      </span>
                      <span className={`text-xs ${getStatusColor(conversation.status)}`}>
                        {getStatusLabel(conversation.status)}
                      </span>
                    </div>
                    <h3 className="font-medium truncate">
                      {conversation.title || 'Untitled Conversation'}
                    </h3>
                    <div className="mt-2 flex items-center gap-4 text-xs text-white/50">
                      {conversation.mode === 'debate' && conversation.totalRounds && (
                        <span>
                          Round {conversation.currentRound}/{conversation.totalRounds}
                        </span>
                      )}
                      <span>${(conversation.totalCostCents / 100).toFixed(2)} spent</span>
                      <span>{formatDate(conversation.updatedAt)}</span>
                    </div>
                  </div>
                  <div className="text-white/30">→</div>
                </div>
              </Link>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm('Delete this conversation? This cannot be undone.')) {
                    deleteConversation(conversation.id);
                  }
                }}
                className="px-4 border-l border-white/10 text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors text-xs"
                title="Delete conversation"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
