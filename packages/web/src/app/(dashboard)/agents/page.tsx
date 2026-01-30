'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useAgentsStore } from '@/stores/agents';

// Available models for display
const MODELS: Record<string, { name: string; provider: string }> = {
  'anthropic/claude-sonnet-4': { name: 'Claude Sonnet 4', provider: 'Anthropic' },
  'anthropic/claude-3.5-sonnet': { name: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
  'openai/gpt-4o': { name: 'GPT-4o', provider: 'OpenAI' },
  'openai/gpt-4o-mini': { name: 'GPT-4o Mini', provider: 'OpenAI' },
  'meta-llama/llama-3.1-405b-instruct': { name: 'Llama 3.1 405B', provider: 'Meta' },
  'meta-llama/llama-3.1-70b-instruct': { name: 'Llama 3.1 70B', provider: 'Meta' },
  'google/gemini-pro-1.5': { name: 'Gemini 1.5 Pro', provider: 'Google' },
  'google/gemini-flash-1.5': { name: 'Gemini 1.5 Flash', provider: 'Google' },
};

export default function AgentsPage() {
  const { agents, isLoading, error, fetchAgents, deleteAgent } = useAgentsStore();

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete "${name}"?`)) {
      try {
        await deleteAgent(id);
      } catch {
        // Error handled by store
      }
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">agents</h1>
          <p className="mt-1 text-xs text-white/50">
            manage your ai agents with unique personalities and hidden instructions.
          </p>
        </div>
        <Link
          href="/agents/new"
          className="bg-orange-500 text-black px-4 py-2 text-sm font-medium hover:bg-orange-400 transition-colors"
        >
          + new agent
        </Link>
      </div>

      {/* Error */}
      {error && (
        <div className="border border-red-500/50 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading && agents.length === 0 && (
        <div className="border border-white/10 p-8 text-center">
          <p className="text-sm text-white/50">loading agents...</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && agents.length === 0 && (
        <div className="border border-white/10 p-12 text-center">
          <div className="mx-auto w-12 h-12 border border-white/20 flex items-center justify-center mb-4">
            <span className="text-2xl text-white/30">+</span>
          </div>
          <h3 className="text-sm font-medium mb-2">no agents yet</h3>
          <p className="text-xs text-white/50 mb-6">
            create your first agent to start debates and collaborations.
          </p>
          <Link
            href="/agents/new"
            className="inline-block bg-orange-500 text-black px-6 py-2 text-sm font-medium hover:bg-orange-400 transition-colors"
          >
            create your first agent
          </Link>
        </div>
      )}

      {/* Agents Grid */}
      {agents.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => {
            const model = MODELS[agent.model] || { name: agent.model, provider: 'Unknown' };
            return (
              <div
                key={agent.id}
                className="border border-white/10 bg-white/5 p-5 hover:border-white/20 transition-colors group"
              >
                {/* Header */}
                <div className="flex items-start gap-3 mb-4">
                  <div
                    className="w-10 h-10 flex items-center justify-center text-sm font-bold overflow-hidden"
                    style={{ backgroundColor: agent.avatarUrl ? 'transparent' : agent.avatarColor }}
                  >
                    {agent.avatarUrl ? (
                      <img src={agent.avatarUrl} alt={agent.name} className="w-full h-full object-cover" />
                    ) : (
                      agent.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium truncate">{agent.name}</h3>
                      {agent.isPublic && (
                        <span className="text-xs px-1 py-0.5 bg-orange-500/20 text-orange-400 border border-orange-500/30">
                          public
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/50">{model.name}</p>
                  </div>
                </div>

                {/* Role */}
                <p className="text-xs text-white/70 line-clamp-2 mb-4">{agent.role}</p>

                {/* Meta */}
                <div className="flex items-center gap-4 text-xs text-white/40 mb-4">
                  <span>{model.provider}</span>
                  {agent.systemPrompt && <span>has system prompt</span>}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-3 border-t border-white/10">
                  {agent.isPublic && (
                    <Link
                      href={`/agent/${agent.id}`}
                      className="flex-1 text-center py-2 text-xs border border-white/10 hover:border-orange-500/50 hover:text-orange-500 transition-colors"
                    >
                      view profile
                    </Link>
                  )}
                  <Link
                    href={`/agents/${agent.id}/edit`}
                    className="flex-1 text-center py-2 text-xs border border-white/10 hover:border-orange-500/50 hover:text-orange-500 transition-colors"
                  >
                    edit
                  </Link>
                  <button
                    onClick={() => handleDelete(agent.id, agent.name)}
                    className="flex-1 text-center py-2 text-xs border border-white/10 hover:border-red-500/50 hover:text-red-500 transition-colors"
                  >
                    delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
