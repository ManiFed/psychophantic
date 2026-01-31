'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAgentsStore } from '@/stores/agents';
import { useConversationsStore } from '@/stores/conversations';
import { CreateConversationData } from '@/lib/api';

export default function NewConversationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode = (searchParams.get('mode') as 'debate' | 'collaborate') || 'debate';

  const { agents, fetchAgents, isLoading: agentsLoading } = useAgentsStore();
  const { createConversation, startConversation, isLoading } = useConversationsStore();

  const [mode, setMode] = useState<'debate' | 'collaborate'>(initialMode);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [totalRounds, setTotalRounds] = useState(5);
  const [title, setTitle] = useState('');
  const [initialPrompt, setInitialPrompt] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const toggleAgent = (agentId: string) => {
    setSelectedAgentIds((prev) => {
      if (prev.includes(agentId)) {
        return prev.filter((id) => id !== agentId);
      }
      if (prev.length >= 5) {
        return prev; // Max 5 agents
      }
      return [...prev, agentId];
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (selectedAgentIds.length < 2) {
      setError('Please select at least 2 agents');
      return;
    }

    if (!initialPrompt.trim()) {
      setError('Please provide an initial prompt or topic');
      return;
    }

    if (mode === 'debate' && (totalRounds < 1 || totalRounds > 20)) {
      setError('Rounds must be between 1 and 20');
      return;
    }

    try {
      const data: CreateConversationData = {
        mode,
        agentIds: selectedAgentIds,
        initialPrompt: initialPrompt.trim(),
        title: title.trim() || undefined,
        totalRounds: mode === 'debate' ? totalRounds : undefined,
        isPublic,
      };

      const conversation = await createConversation(data);
      await startConversation(conversation.id);
      router.push(`/conversations/${conversation.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create conversation');
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <Link
          href="/conversations"
          className="text-xs text-white/50 hover:text-white/70 transition-colors"
        >
          &larr; back to conversations
        </Link>
        <h1 className="text-2xl font-bold mt-4">new conversation</h1>
        <p className="mt-1 text-xs text-white/50">
          select agents and configure your debate or collaboration.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Error */}
        {error && (
          <div className="border border-red-500/50 bg-red-500/10 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Mode Selection */}
        <div className="space-y-3">
          <label className="text-xs text-white/70">conversation mode</label>
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setMode('debate')}
              className={`p-4 border transition-colors text-left ${
                mode === 'debate'
                  ? 'border-orange-500 bg-orange-500/10'
                  : 'border-white/10 hover:border-white/30'
              }`}
            >
              <h3 className="font-medium mb-1">debate</h3>
              <p className="text-xs text-white/50">
                agents take turns arguing their perspectives over multiple rounds.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setMode('collaborate')}
              className={`p-4 border transition-colors text-left ${
                mode === 'collaborate'
                  ? 'border-orange-500 bg-orange-500/10'
                  : 'border-white/10 hover:border-white/30'
              }`}
            >
              <h3 className="font-medium mb-1">collaborate</h3>
              <p className="text-xs text-white/50">
                agents work together to build on ideas. enables force agreement.
              </p>
            </button>
          </div>
        </div>

        {/* Agent Selection */}
        <div className="space-y-3">
          <label className="text-xs text-white/70">
            select agents ({selectedAgentIds.length}/5 selected, minimum 2)
          </label>
          {agentsLoading ? (
            <div className="border border-white/10 p-8 text-center text-sm text-white/50">
              loading agents...
            </div>
          ) : agents.length === 0 ? (
            <div className="border border-white/10 p-8 text-center">
              <p className="text-sm text-white/50 mb-4">no agents found.</p>
              <Link
                href="/agents/new"
                className="text-sm text-orange-500 hover:text-orange-400"
              >
                create your first agent →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {agents.map((agent) => {
                const isSelected = selectedAgentIds.includes(agent.id);
                const orderIndex = selectedAgentIds.indexOf(agent.id);

                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => toggleAgent(agent.id)}
                    className={`p-3 border transition-colors text-left relative ${
                      isSelected
                        ? 'border-orange-500 bg-orange-500/10'
                        : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-orange-500 text-black text-xs font-bold flex items-center justify-center">
                        {orderIndex + 1}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-8 h-8 flex items-center justify-center text-sm font-bold"
                        style={{ backgroundColor: agent.avatarColor }}
                      >
                        {agent.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm font-medium truncate">{agent.name}</span>
                    </div>
                    <p className="text-xs text-white/50 line-clamp-2">{agent.role}</p>
                    <p className="text-xs text-white/30 mt-1">
                      {agent.model.split('/').pop()}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Rounds (Debate mode only) */}
        {mode === 'debate' && (
          <div className="space-y-2">
            <label htmlFor="rounds" className="text-xs text-white/70">
              number of rounds
            </label>
            <input
              id="rounds"
              type="number"
              min={1}
              max={20}
              value={totalRounds}
              onChange={(e) => setTotalRounds(parseInt(e.target.value) || 5)}
              className="w-32 bg-white/5 border border-white/10 px-4 py-3 text-sm focus:outline-none focus:border-orange-500/50 transition-colors"
            />
            <p className="text-xs text-white/30">
              each agent speaks once per round (1-20 rounds)
            </p>
          </div>
        )}

        {/* Title */}
        <div className="space-y-2">
          <label htmlFor="title" className="text-xs text-white/70">
            title (optional)
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Climate Policy Debate"
            maxLength={255}
            className="w-full bg-white/5 border border-white/10 px-4 py-3 text-sm placeholder:text-white/30 focus:outline-none focus:border-orange-500/50 transition-colors"
          />
        </div>

        {/* Initial Prompt */}
        <div className="space-y-2">
          <label htmlFor="prompt" className="text-xs text-white/70">
            initial prompt / topic *
          </label>
          <textarea
            id="prompt"
            value={initialPrompt}
            onChange={(e) => setInitialPrompt(e.target.value)}
            placeholder="What should the agents discuss? Be specific about the topic or question you want them to explore."
            rows={4}
            maxLength={5000}
            className="w-full bg-white/5 border border-white/10 px-4 py-3 text-sm placeholder:text-white/30 focus:outline-none focus:border-orange-500/50 transition-colors resize-none"
          />
          <p className="text-xs text-white/30">{initialPrompt.length}/5000 characters</p>
        </div>

        {/* Public Toggle */}
        <div className="space-y-2">
          <label className="text-xs text-white/70">visibility</label>
          <button
            type="button"
            onClick={() => setIsPublic(!isPublic)}
            className={`flex items-center gap-3 p-3 border transition-colors w-full text-left ${
              isPublic
                ? 'border-orange-500/50 bg-orange-500/10'
                : 'border-white/10 hover:border-white/20'
            }`}
          >
            <div className={`w-8 h-4 rounded-full relative transition-colors ${isPublic ? 'bg-orange-500' : 'bg-white/20'}`}>
              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${isPublic ? 'left-[18px]' : 'left-0.5'}`} />
            </div>
            <div>
              <p className="text-sm font-medium">{isPublic ? 'public' : 'private'}</p>
              <p className="text-xs text-white/40">
                {isPublic
                  ? 'visible on the home feed in read-only mode'
                  : 'only you can see this conversation'}
              </p>
            </div>
          </button>
        </div>

        {/* Turn Order Preview */}
        {selectedAgentIds.length >= 2 && (
          <div className="space-y-3">
            <label className="text-xs text-white/70">turn order</label>
            <div className="flex items-center gap-2 flex-wrap">
              {selectedAgentIds.map((agentId, index) => {
                const agent = agents.find((a) => a.id === agentId);
                if (!agent) return null;

                return (
                  <div key={agentId} className="flex items-center">
                    <div
                      className="w-6 h-6 flex items-center justify-center text-xs font-bold"
                      style={{ backgroundColor: agent.avatarColor }}
                    >
                      {agent.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-xs ml-1">{agent.name}</span>
                    {index < selectedAgentIds.length - 1 && (
                      <span className="text-white/30 mx-2">→</span>
                    )}
                  </div>
                );
              })}
              {mode === 'debate' && (
                <span className="text-xs text-white/30 ml-2">
                  × {totalRounds} rounds
                </span>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-4 pt-4">
          <button
            type="submit"
            disabled={isLoading || selectedAgentIds.length < 2}
            className="flex-1 bg-orange-500 text-black py-3 text-sm font-medium hover:bg-orange-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'starting...' : 'start conversation'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-8 py-3 text-sm border border-white/10 hover:border-white/30 transition-colors"
          >
            cancel
          </button>
        </div>
      </form>
    </div>
  );
}
