'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth';
import { agentProfilesApi, AgentProfile, PublicConversation } from '@/lib/api';

export default function AgentProfilePage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.agentId as string;
  const { token } = useAuthStore();

  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [conversations, setConversations] = useState<PublicConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const data = await agentProfilesApi.getProfile(agentId);
        setAgent(data.agent);
        setConversations(data.conversations);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Agent not found');
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [agentId]);

  const handleAddToLibrary = async () => {
    if (!token) {
      router.push('/login');
      return;
    }
    setActionLoading('add');
    try {
      await agentProfilesApi.addToLibrary(token, agentId);
      setActionSuccess('Agent added to your library!');
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add agent');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemix = async () => {
    if (!token) {
      router.push('/login');
      return;
    }
    setActionLoading('remix');
    try {
      const result = await agentProfilesApi.remix(token, agentId);
      router.push(`/agents/${result.agent.id}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remix agent');
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-white/50">loading agent...</p>
      </div>
    );
  }

  if (error && !agent) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-2">agent not found</h1>
        <p className="text-sm text-white/50">{error}</p>
      </div>
    );
  }

  if (!agent) return null;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Agent Header */}
      <div className="border border-white/10 bg-white/5 p-6">
        <div className="flex items-start gap-4">
          <div
            className="w-20 h-20 flex items-center justify-center text-3xl font-bold flex-shrink-0 overflow-hidden"
            style={{ backgroundColor: agent.avatarUrl ? 'transparent' : agent.avatarColor }}
          >
            {agent.avatarUrl ? (
              <img src={agent.avatarUrl} alt={agent.name} className="w-full h-full object-cover" />
            ) : (
              agent.name.charAt(0).toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold truncate">{agent.name}</h1>
              {agent.isPublic && (
                <span className="text-xs px-1.5 py-0.5 bg-orange-500/20 text-orange-400 border border-orange-500/30 flex-shrink-0">
                  public
                </span>
              )}
              {agent.isTemplate && (
                <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 flex-shrink-0">
                  template
                </span>
              )}
            </div>
            <p className="text-xs text-white/50 mb-2">{agent.model}</p>
            <p className="text-sm text-white/70">{agent.role}</p>
            {agent.creatorUsername && (
              <p className="text-xs text-white/40 mt-2">
                created by{' '}
                <Link
                  href={`/u/${agent.creatorUsername}`}
                  className="text-orange-500 hover:text-orange-400 transition-colors"
                >
                  {agent.creatorUsername}
                </Link>
              </p>
            )}
            <div className="flex items-center gap-4 text-xs text-white/40 mt-2">
              <span>{agent.templateUses} uses</span>
              <span>created {new Date(agent.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6 pt-4 border-t border-white/10">
          <button
            onClick={handleAddToLibrary}
            disabled={actionLoading === 'add'}
            className="flex-1 bg-orange-500 text-black py-2.5 text-sm font-medium hover:bg-orange-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {actionLoading === 'add' ? 'adding...' : '+ add to my library'}
          </button>
          <button
            onClick={handleRemix}
            disabled={actionLoading === 'remix'}
            className="flex-1 border border-orange-500/50 text-orange-500 py-2.5 text-sm font-medium hover:bg-orange-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {actionLoading === 'remix' ? 'remixing...' : 'remix this agent'}
          </button>
        </div>

        {actionSuccess && (
          <div className="mt-3 border border-green-500/50 bg-green-500/10 p-3 text-xs text-green-400">
            {actionSuccess}
          </div>
        )}
        {error && agent && (
          <div className="mt-3 border border-red-500/50 bg-red-500/10 p-3 text-xs text-red-400">
            {error}
          </div>
        )}
      </div>

      {/* System Prompt (if public) */}
      {agent.systemPrompt && (
        <div className="border border-white/10 bg-white/5 p-5">
          <h2 className="text-sm font-medium mb-3 text-white/70">system prompt</h2>
          <pre className="text-xs text-white/60 whitespace-pre-wrap font-mono bg-black/50 p-4 border border-white/5">
            {agent.systemPrompt}
          </pre>
        </div>
      )}

      {/* Public Conversations */}
      <div>
        <h2 className="text-lg font-bold mb-4">
          public conversations
          <span className="text-sm text-white/50 font-normal ml-2">
            ({conversations.length})
          </span>
        </h2>

        {conversations.length === 0 ? (
          <div className="border border-white/10 p-8 text-center">
            <p className="text-sm text-white/50">
              this agent hasn&apos;t been in any public conversations yet.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {conversations.map((conv) => (
              <Link
                key={conv.id}
                href={`/conversations/${conv.id}`}
                className="border border-white/10 bg-white/5 p-4 hover:border-orange-500/30 transition-colors block"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-sm truncate">
                    {conv.title || 'Untitled Conversation'}
                  </h3>
                  <span className="text-xs text-white/40 flex-shrink-0 ml-2">
                    {conv.mode}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2">
                    {conv.participants.slice(0, 4).map((p) => (
                      <div
                        key={p.id}
                        className="w-6 h-6 flex items-center justify-center text-xs font-bold border border-black overflow-hidden"
                        style={{ backgroundColor: p.agent.avatarUrl ? 'transparent' : p.agent.avatarColor }}
                        title={p.agent.name}
                      >
                        {p.agent.avatarUrl ? (
                          <img src={p.agent.avatarUrl} alt={p.agent.name} className="w-full h-full object-cover" />
                        ) : (
                          p.agent.name.charAt(0).toUpperCase()
                        )}
                      </div>
                    ))}
                  </div>
                  <span className="text-xs text-white/40">
                    {conv._count.messages} messages
                  </span>
                  <span className="text-xs text-white/40">
                    {new Date(conv.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
